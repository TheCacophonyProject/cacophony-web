<script lang="ts" setup>
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import { type Spectastiq } from "@/components/spectastiq-viewer/spectastiq.js";
import {
  computed,
  onBeforeMount,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { RecordingType } from "@typedefs/api/consts.ts";
import { getRawRecording } from "@api/Recording.ts";
import type {
  IntermediateTrack,
  Rectangle,
} from "@/components/cptv-player/cptv-player-types";
import type { ApiTrackResponse } from "@typedefs/api/track";
import { TagColours } from "@/consts.ts";
import type { TrackId } from "@typedefs/api/common";
import { ColourMaps } from "@/components/cptv-player/cptv-decoder/frameRenderUtils.ts";
import { DateTime } from "luxon";
import { timezoneForLatLng } from "@models/visitsUtils.ts";

const props = defineProps<{
  recording: ApiRecordingResponse;
  currentTrack?: ApiTrackResponse;
}>();
const audioBlobUrl = ref<string | null>();
const spectastiqEl = ref<Spectastiq>();
const spectrogramContainer = ref<HTMLDivElement>();
const maxFrequency = 48000 / 2;

const emit = defineEmits<{
  (
    e: "track-selected",
    payload: { trackId: TrackId; automatically: boolean }
  ): void;
  (e: "track-deselected"): void;
}>();

onBeforeMount(async () => {
  if (props.recording.type === RecordingType.Audio) {
    // Load the audio blob url.
    // TODO: This can be done before the recording info is loaded,
    //  except we don't know for sure it's an audio recording at that stage,
    const response = await getRawRecording(props.recording.id);
    if (response.success) {
      if (audioBlobUrl.value) {
        // Clean up the old one.
        URL.revokeObjectURL(audioBlobUrl.value);
      }
      audioBlobUrl.value = URL.createObjectURL(response.result);
    }
  }
});

const getTrackBounds = (
  contextWidth: number,
  contextHeight: number,
  startZeroOne: number,
  endZeroOne: number,
  trackBox: Rectangle
): Rectangle => {
  let [left, top, right, bottom] = trackBox;
  if (spectastiqEl.value) {
    top = spectastiqEl.value!.transformY(1 - top);
    bottom = spectastiqEl.value!.transformY(1 - bottom);
    left = Math.max(0, left);
    right = Math.min(1, right);
    const range = endZeroOne - startZeroOne;
    const l = (left - startZeroOne) / range;
    const r = (right - startZeroOne) / range;
    return [
      l * contextWidth,
      (1 - top) * contextHeight,
      r * contextWidth,
      (1 - bottom) * contextHeight,
    ];
  }
  return trackBox;
};

const minBoxDims = (minDim: number, box: Rectangle): Rectangle => {
  const [x0, y0, x1, y1] = box;
  const w = x1 - x0;
  const h = y1 - y0;
  const cX = x0 + w * 0.5;
  const cY = y0 + h * 0.5;
  const newWidth = Math.max(minDim, w);
  const newHeight = Math.max(minDim, h);

  return [
    cX - newWidth * 0.5,
    cY - newHeight * 0.5,
    cX + newWidth * 0.5,
    cY + newHeight * 0.5,
  ];
};

const distanceBetween = (
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number => {
  const dX = Math.abs(x1 - x2);
  const dY = Math.abs(y1 - y2);
  return Math.sqrt(dX * dX + dY * dY);
};

const pointIsInPaddedBox = (
  x: number,
  y: number,
  box: Rectangle
): false | number => {
  // NOTE: If the box is narrow in width or height, and we're within some margin, count it as a hit.
  // Return distance from box center or false
  if (pointIsInExactBox(x, y, minBoxDims(44, box))) {
    const [x0, y0, x1, y1] = box;
    const w = x1 - x0;
    const h = y1 - y0;
    const cX = x0 + w * 0.5;
    const cY = y0 + h * 0.5;
    const leftEdgeDistance = Math.abs(x - x0);
    const topEdgeDistance = Math.abs(y - y0);
    const bottomEdgeDistance = Math.abs(y - y1);
    const rightEdgeDistance = Math.abs(x - x1);
    return Math.min(
      leftEdgeDistance,
      topEdgeDistance,
      bottomEdgeDistance,
      rightEdgeDistance,
      distanceBetween(x, y, cX, cY)
    );
  } else {
    return false;
  }
};
const pointIsInExactBox = (x: number, y: number, box: Rectangle): boolean => {
  const [x0, y0, x1, y1] = box;
  return x >= x0 && x < x1 && y >= y0 && y < y1;
};

watch(
  () => props.currentTrack,
  (track) => {
    if (overlayCanvasContext.value) {
      renderOverlay(overlayCanvasContext.value);
      if (track) {
        // We should
        const trackStart = track.start / audioDuration.value;
        const trackEnd = track.end / audioDuration.value;
        if (spectastiqEl.value && track.hasOwnProperty("maxFreq")) {
          spectastiqEl.value.selectRegionOfInterest(
            trackStart,
            trackEnd,
            (track.minFreq || 0) / audioSampleRate.value,
            (track.maxFreq || 0) / audioSampleRate.value
          );
          spectastiqEl.value.setPlaybackFrequencyBandPass(
            track.minFreq || 0,
            track.maxFreq || audioSampleRate.value
          );
        }
      } else {
        if (spectastiqEl.value) {
          spectastiqEl.value.resetYZoom();
          spectastiqEl.value.removePlaybackFrequencyBandPass();
        }
      }
    }
  }
);

const tracks = computed(() => {
  return props.recording.tracks || [];
});

const overlayCanvasContext = ref<CanvasRenderingContext2D>();

const initInteractionHandlers = (context: CanvasRenderingContext2D) => {
  const spectastiq = spectastiqEl.value as Spectastiq;
  spectastiq.addEventListener("region-create", (e) => {
    inRegionCreationMode.value = false;
    // TODO: Create track and prompt for user classification.
  });
  spectastiq.addEventListener(
    "select",
    ({ detail: { offsetX: x, offsetY: y } }) => {
      // Check to see if we're intersecting any of our boxes.
      const begin = selectionRangeStartZeroOne.value;
      const end = selectionRangeEndZeroOne.value;
      const cropScaleY = audioSampleRate.value;
      const duration = audioDuration.value;
      let bestD = Number.MAX_SAFE_INTEGER;
      let hitTrack;
      for (const track of tracks.value) {
        const trackStart = track.start / duration;
        const trackEnd = track.end / duration;
        const hitBox = getTrackBounds(
          context.canvas.width / devicePixelRatio,
          context.canvas.height / devicePixelRatio,
          begin,
          end,
          [
            trackStart,
            1 - (track.maxFreq || 0) / cropScaleY,
            trackEnd,
            1 - (track.minFreq || 0) / cropScaleY,
          ]
        );
        const d = pointIsInPaddedBox(x, y, hitBox);
        if (
          d !== false &&
          d < bestD &&
          (!props.currentTrack || track.id !== props.currentTrack.id)
        ) {
          bestD = d;
          hitTrack = track;
        }
      }
      if (hitTrack) {
        emit("track-selected", { trackId: hitTrack.id, automatically: false });
      } else {
        emit("track-deselected");
      }
    }
  );
  spectastiq.addEventListener("move", (e) => {
    const x = e.detail.offsetX;
    const y = e.detail.offsetY;
    const container = e.detail.container;
    const begin = selectionRangeStartZeroOne.value;
    const end = selectionRangeEndZeroOne.value;
    const cropScaleY = audioSampleRate.value;
    let hit = false;
    for (const track of tracks.value) {
      const trackStart = track.start / audioDuration.value;
      const trackEnd = track.end / audioDuration.value;
      const hitBox = getTrackBounds(
        context.canvas.width / devicePixelRatio,
        context.canvas.height / devicePixelRatio,
        begin,
        end,
        [
          trackStart,
          1 - (track.maxFreq || 0) / cropScaleY,
          trackEnd,
          1 - (track.minFreq || 0) / cropScaleY,
        ]
      );
      if (pointIsInExactBox(x, y, hitBox)) {
        hit = true;
        break;
      }
    }
    if (hit) {
      if (!container.classList.contains("cursor-pointer")) {
        container.classList.add("cursor-pointer");
      }
    } else {
      if (container.classList.contains("cursor-pointer")) {
        container.classList.remove("cursor-pointer");
      }
    }
  });
};

const selectionRangeStartZeroOne = ref<number>(0);
const selectionRangeEndZeroOne = ref<number>(1);
const audioSampleRate = ref<number>(maxFrequency);
const audioDuration = ref<number>(0);

const padDims = (
  dims: Rectangle,
  paddingX: number,
  paddingY: number,
  maxWidth: number,
  maxHeight: number
): Rectangle => {
  return [
    Math.max(0, dims[0] - paddingX),
    Math.max(0, dims[1] - paddingY),
    Math.min(maxWidth, dims[2] + paddingX),
    Math.min(maxHeight, dims[3] + paddingY),
  ];
};

const drawRectWithText = (
  context: CanvasRenderingContext2D,
  trackId: number,
  dims: Rectangle,
  what: string | null,
  tracks: IntermediateTrack[] | ApiTrackResponse[] = [],
  currentTrack: ApiTrackResponse | undefined,
  pixelRatio: number
) => {
  context.save();
  const hasSelected = !!currentTrack;
  const selected = currentTrack?.id === trackId;
  const trackIndex = tracks.findIndex((track) => track.id === trackId) || 0;
  const lineWidth = (selected ? 2 : 1) * pixelRatio;
  const outlineWidth = (lineWidth + 4) * pixelRatio;
  const deviceRatio = pixelRatio;
  const [left, top, right, bottom] = selected
    ? padDims(
        dims,
        0, // 10 * deviceRatio
        15 * deviceRatio,
        context.canvas.width,
        context.canvas.height
      )
    : dims;
  const width = right - left;
  const height = bottom - top;
  const x = left;
  const y = top;
  context.lineJoin = "round";
  context.lineWidth = outlineWidth;
  const c = isDarkTheme.value ? 0 : 0; // Not sure changing this with the theme really works.
  context.strokeStyle = `rgba(${c}, ${c}, ${c}, ${
    selected ? 0.4 : hasSelected ? 0.0 : 0.5
  })`;
  context.beginPath();
  context.strokeRect(x, y, width, height);
  const color = TagColours[trackIndex % TagColours.length].background;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5), 16);
  context.strokeStyle = `rgba(${r}, ${g}, ${b}, ${
    selected ? 1.0 : hasSelected ? 0.5 : 1.0
  })`;
  context.lineWidth = lineWidth;
  context.beginPath();
  context.strokeRect(x, y, width, height);
  if (
    selected &&
    (left > 0 || right > 0) &&
    (left < context.canvas.width || right < context.canvas.width)
  ) {
    // If exporting, show all the best guess animal tags, if not unknown
    if (what !== null) {
      const text = what;
      const textHeight = 9 * deviceRatio;
      const marginX = 2 * deviceRatio;
      const marginTop = 2 * deviceRatio;
      let textX = right; // - (textWidth + marginX);
      let textY = bottom + textHeight + marginTop;
      // Make sure the text doesn't get clipped off if the box is near the frame edges
      if (textY + textHeight > context.canvas.height) {
        textY = top - textHeight;
      }
      context.font = `${13 * deviceRatio}px sans-serif`;
      context.lineWidth = 4;
      const textWidth = context.measureText(text).width;
      context.textAlign = "right";
      if (right - textWidth < 0) {
        if (right - textWidth < 0 && x > 0) {
          textX = x;
        } else {
          textX = marginX;
        }
        context.textAlign = "left";
      }
      if (right >= context.canvas.width) {
        textX = context.canvas.width - marginX;
      }
      context.strokeStyle = isDarkTheme.value
        ? "rgba(0, 0, 0, 0.5)"
        : "rgba(255, 255, 255, 0.5)";
      context.strokeText(text, textX, textY);
      context.fillStyle = isDarkTheme.value ? "white" : "black";
      context.fillText(text, textX, textY);
    }
  }
  context.restore();
};

const renderOverlay = (ctx: CanvasRenderingContext2D) => {
  if (spectastiqEl.value) {
    const begin = selectionRangeStartZeroOne.value;
    const end = selectionRangeEndZeroOne.value;
    const currentTrack = props.currentTrack;
    const cHeight = ctx.canvas.height;
    const cWidth = ctx.canvas.width;
    ctx.save();
    ctx.clearRect(0, 0, cWidth, cHeight);
    for (const track of tracks.value) {
      const minFreq = 1 - (track.minFreq || 0) / audioSampleRate.value;
      const maxFreq = 1 - (track.maxFreq || 0) / audioSampleRate.value;
      const trackStart = track.start / audioDuration.value;
      const trackEnd = track.end / audioDuration.value;
      const bounds = getTrackBounds(cWidth, cHeight, begin, end, [
        trackStart,
        maxFreq,
        trackEnd,
        minFreq,
      ]);
      drawRectWithText(
        ctx,
        track.id,
        bounds,
        track.tags[0].what,
        props.recording.tracks,
        currentTrack,
        window.devicePixelRatio
      );
    }
    ctx.restore();
  }
};

onMounted(() => {
  let initedContextListeners = false;
  if (spectastiqEl.value) {
    const spectastiq = spectastiqEl.value as Spectastiq;
    spectastiq.addEventListener(
      "render",
      ({
        detail: {
          range: { begin, end, min, max },
          context: ctx,
        },
      }) => {
        if (!initedContextListeners) {
          initInteractionHandlers(ctx);
          initedContextListeners = true;
        }
        selectionRangeStartZeroOne.value = begin;
        selectionRangeEndZeroOne.value = end;
        overlayCanvasContext.value = ctx;
        renderOverlay(ctx);
      }
    );
    spectastiq.addEventListener("ready", () => {
      console.log("initialised spectrogram");
    });
    spectastiq.addEventListener(
      "audio-loaded",
      ({ detail: { sampleRate, duration } }) => {
        console.log("loaded spectrogram data");
        audioSampleRate.value = sampleRate / 2;
        audioDuration.value = duration;
      }
    );
    spectastiq.addEventListener(
      "playhead-update",
      ({ detail: { timeInSeconds } }) => {
        currentTime.value = timeInSeconds;
      }
    );
  }
});
onBeforeUnmount(() => {
  if (audioBlobUrl.value) {
    URL.revokeObjectURL(audioBlobUrl.value);
  }
});

const togglePlayback = () => {
  if (spectastiqEl.value) {
    audioIsPlaying.value = spectastiqEl.value.togglePlayback();
  }
};
const audioIsPlaying = ref<boolean>(false);
const showAdvancedControls = ref<boolean>(false);
const volume = ref<number>(0.5);
const volumeMuted = ref<boolean>(false);
const changeVolume = (e: InputEvent) => {
  if (e.target) {
    if (spectastiqEl.value) {
      const newVolume = parseFloat((e.target as HTMLInputElement).value);
      volume.value = spectastiqEl.value.setGain(newVolume * 2) / 2;
    }
  }
};
const currentTime = ref<number>(0);
const currentPalette = ref<string>("Viridis");
const inRegionCreationMode = ref<boolean>(false);

const formatTime = (time: number): string => {
  let seconds = Math.floor(time);
  if (seconds < 60) {
    return `0:${`${seconds}`.padStart(2, "0")}`;
  }
  const minutes = Math.floor(seconds / 60);
  seconds = seconds - minutes * 60;
  return `${minutes}:${seconds.toString().padStart(2, "0").padEnd(2, "0")}`;
};

const incrementPalette = () => {
  if (spectastiqEl.value) {
    currentPalette.value = spectastiqEl.value.nextPalette();
  }
};

const toggleRegionCreationMode = () => {
  if (spectastiqEl.value) {
    inRegionCreationMode.value = !inRegionCreationMode.value;
    if (inRegionCreationMode.value) {
      spectastiqEl.value.enterRegionCreationMode();
    } else {
      spectastiqEl.value.exitRegionCreationMode();
    }
  }
};

const isDarkTheme = computed<boolean>(() => {
  return currentPalette.value !== "Grayscale";
});
const toggleVolumeMuted = () => {
  if (spectastiqEl.value) {
    volumeMuted.value = !volumeMuted.value;
    if (volumeMuted.value) {
      spectastiqEl.value.setGain(0);
    } else {
      spectastiqEl.value.setGain(volume.value * 2);
    }
  }
};

const recordingDateTime = computed<DateTime | null>(() => {
  if (props.recording) {
    if (props.recording.location) {
      const zone = timezoneForLatLng(props.recording.location);
      return DateTime.fromISO(props.recording.recordingDateTime, {
        zone,
      });
    }
    return DateTime.fromISO(props.recording.recordingDateTime);
  }
  return null;
});

const currentAbsoluteTime = computed<string | null>(() => {
  if (recordingDateTime.value) {
    return (
      recordingDateTime.value
        ?.plus({ seconds: currentTime.value })
        ?.toLocaleString({
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hourCycle: "h12",
        })
        .replace(/ /g, "") || "&ndash;"
    );
  }
  return null;
});
</script>
<template>
  <div class="spectrogram" ref="spectrogramContainer">
    <spectastiq-viewer id="spectastiq" :src="audioBlobUrl" ref="spectastiqEl">
      <div
        slot="player-controls"
        class="player-controls d-flex align-content-center flex-row justify-content-between w-100"
      >
        <div class="d-flex align-items-center">
          <button
            @click.prevent="togglePlayback"
            ref="playPauseButton"
            :data-tooltip="audioIsPlaying ? 'Pause' : 'Play'"
          >
            <font-awesome-icon v-if="!audioIsPlaying" icon="play" />
            <font-awesome-icon v-else icon="pause" />
          </button>
          <div class="d-flex volume-selection">
            <button @click="toggleVolumeMuted">
              <font-awesome-icon v-if="volumeMuted" icon="volume-mute" />
              <font-awesome-icon v-else icon="volume-up" />
            </button>
            <input
              :disabled="volumeMuted"
              id="volume-slider"
              class="volume-slider"
              type="range"
              min="0"
              max="4"
              step="0.01"
              :value="volume"
              @input="changeVolume"
            />
          </div>
          <div class="ms-2 ps-3 player-time align-items-end">
            {{ formatTime(currentTime) }} / {{ formatTime(audioDuration) }}
          </div>
        </div>

        <div class="d-flex align-items-center">
          <div class="me-1 pe-3 abs-time align-items-end">
            {{ currentAbsoluteTime }}
          </div>
          <!--          <span>{{ currentPalette }}</span>-->
          <button
            @click.prevent="toggleRegionCreationMode"
            ref="regionCreationMode"
            data-tooltip="Create new region"
          >
            <font-awesome-icon
              :icon="[inRegionCreationMode ? 'fas' : 'far', 'square-plus']"
            />
          </button>
          <button
            @click.prevent="incrementPalette"
            ref="cyclePalette"
            data-tooltip="Cycle colour map"
          >
            <font-awesome-icon icon="palette" />
          </button>
        </div>
      </div>
    </spectastiq-viewer>
    <!--  TODO: Hook to toggle playback, to set play offset, to change palette, to enter track creation mode, to toggle Khz labels, to toggle tag overlays -->
  </div>
</template>
<style lang="less">
.spectrogram {
  // 360px for spectrogram only
  min-height: 404px;
  background: #2b333f;
  overflow: hidden;
}
.player-time {
  border-left: 2px solid rgba(255, 255, 255, 0.5);
}
.abs-time {
  border-right: 2px solid rgba(255, 255, 255, 0.5);
}
.player-controls {
  min-height: 44px;
  background: #2b333f;
  color: white;
  display: flex;
  position: relative;
  button {
    touch-action: manipulation;
    user-select: none;
    min-width: 48px;
    padding: 0;
    min-height: 44px;
    background: transparent;
    &:focus,
    &:active {
      outline: none;
    }
    &:active:not(:disabled),
    &.selected:not(:disabled) {
      color: yellowgreen;
    }
    &:disabled {
      color: rgba(255, 255, 255, 0.1);
    }
    color: inherit;
    border: 0;
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
  }
}

@keyframes fade_in_show {
  0% {
    opacity: 0;
    transform: translate(17%, -35%) rotate(270deg) scaleX(0);
  }

  100% {
    opacity: 1;
    transform: translate(17%, -35%) rotate(270deg) scaleX(1);
  }
}
.volume-slider {
  display: none;
  position: absolute;
  transform-origin: left;
  transform: translate(17%, -35%) rotate(270deg);
  z-index: 300;
  :hover {
    display: block;
  }
}
.volume-selection:hover {
  .volume-slider {
    display: block;
    animation: fade_in_show 0.2s;
    transition-delay: 2s;
  }
}
</style>
