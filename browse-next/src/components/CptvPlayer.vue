<script setup lang="ts">
import TracksScrubber from "@/components/TracksScrubber.vue";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import { computed, defineEmits, ref } from "vue";
import type { TrackId } from "@typedefs/api/common";
import type { CptvFrame, CptvFrameHeader, CptvHeader } from "cptv-decoder";
import {
  ColourMaps,
  renderFrameIntoFrameBuffer,
} from "cptv-decoder/frameRenderUtils";
import { useDevicePixelRatio } from "@vueuse/core";
import type { ApiTrackTagResponse } from "@typedefs/api/trackTag";
import type { ApiTrackPosition, ApiTrackResponse } from "@typedefs/api/track";
import { TagColours } from "@/consts";
const { pixelRatio } = useDevicePixelRatio();
//import { CptvDecoder } from "cptv-decoder";
// eslint-disable-next-line vue/no-setup-props-destructure
const {
  recording,
  standAlone = false,
  cptvUrl,
  currentTrack,
  userFiles = false,
  extLoading = false,
  canUseAdvancedControls = false,
  canSelectTracks = true,
  showOverlaysForCurrentTrackOnly = false,
} = defineProps<{
  recording: ApiRecordingResponse | null;
  standAlone?: boolean;
  cptvUrl?: string;
  currentTrack?: TrackId;
  userFiles?: boolean;
  extLoading?: boolean;
  canUseAdvancedControls?: boolean;
  canSelectTracks?: boolean;
  showOverlaysForCurrentTrackOnly?: boolean;
}>();
const PlaybackSpeeds = Object.freeze([0.5, 1, 2, 4, 6]);

const playbackTime = ref(0.6);
const smoothed = ref(false);
let frames: CptvFrame[] = [];
let frameBuffer: Uint8ClampedArray;
//const decoder = new CptvDecoder();

const playbackTimeChanged = (offset: number) => {
  console.log("set playback time", offset);
  playbackTime.value = offset;
};

const emit = defineEmits([
  "request-prev-recording",
  "request-next-recording",
  "track-selected",
]);
const canvas = ref<HTMLCanvasElement | null>(null);
const frameNumField = ref<HTMLDivElement | null>(null);
const ffcSecsAgo = ref<HTMLDivElement | null>(null);
const overlayCanvas = ref<HTMLCanvasElement | null>(null);
const playing = ref<boolean>(false);
const openUserDefinedCptvFile = ref<boolean>(true);
const userSuppliedFile = ref<File | null>(null);
const header = ref<CptvHeader | null>(null);
const valueUnderCursor = ref<string | null>(null);
const playerMessage = ref<string | null>(null);
const showValueInfo = ref<boolean>(false);
const buffering = ref<boolean>(false);
const atEndOfPlayback = ref<boolean>(false);
const showAtEndOfSearch = ref<boolean>(false);
const frameNum = ref<number>(0);
const showAdvancedControls = ref<boolean>(false);
const animationTick = ref<number>(0);
const isShowingBackgroundFrame = ref<boolean>(false);
const animationFrame = ref<number>(0);
const showDebugTools = ref<boolean>(false);
const messageTimeout = ref<number | null>(null);
const messageAnimationFrame = ref<number>(0);
const paletteIndex = ref<number>(0);
const colourMap = ref<[string, Uint32Array]>(ColourMaps[0]);
const displayHeaderInfo = ref<boolean>(false);
const speedMultiplierIndex = ref<number>(0);
const loadProgress = ref<number>(0);
const loadedFrames = ref<number>(0);
const totalFrames = ref<number | null>(null);
const seekingInProgress = ref<boolean>(false);
const streamLoadError = ref<string | null>(null);
const minValue = ref<number>(Number.MAX_VALUE);
const maxValue = ref<number>(Number.MIN_VALUE);
const frameHeader = ref<CptvFrameHeader | null>(null);
const scale = ref<number>(1);
const raqFps = ref<number>(60);
const stopAtFrame = ref<number | null>(null);
const wasPaused = ref<boolean>(false);

const canGoBackwards = computed<boolean>(() => {
  // TODO
  return false;
});

const canGoForwards = computed<boolean>(() => {
  // TODO
  return false;
});

const requestPrevRecording = () => {
  if (canGoBackwards.value) {
    frameNum.value = 0;
    buffering.value = true;
    atEndOfPlayback.value = false;
    emit("request-prev-recording");
  } else {
    showAtEndOfSearch.value = true;
  }
};

const requestNextRecording = () => {
  if (canGoForwards.value) {
    frameNum.value = 0;
    buffering.value = true;
    atEndOfPlayback.value = false;
    emit("request-next-recording");
  } else {
    showAtEndOfSearch.value = true;
  }
};

const hasVideo = computed<boolean>(() => {
  return false;
});
const hasBackgroundFrame = computed<boolean>(() => {
  return (header.value?.hasBackgroundFrame as boolean) || false;
});

const isBuffering = computed<boolean>(() => {
  return extLoading || buffering.value;
});

const getFrameAtIndex = (i: number): CptvFrame => {
  const frameIndex = hasBackgroundFrame.value
    ? Math.min(frames.length - 1, i + 1)
    : Math.min(frames.length - 1, i);
  //console.log("Asking for frame index", i);
  //console.log("Getting actual frame index", frameIndex);
  const frame = frames[frameIndex];
  // We keep a running tally of min/max values across the clip for
  // normalisation purposes.
  const frameMinValue = frame.meta.imageData.min;
  const frameMaxValue = frame.meta.imageData.max;
  // Values within 5 seconds of an FFC event do not contribute to this.
  const withinFfcTimeout =
    frame.meta.lastFfcTimeMs &&
    frame.meta.timeOnMs - frame.meta.lastFfcTimeMs < 5000;
  if (
    frameMinValue !== 0 &&
    (frame.meta.isBackgroundFrame || !withinFfcTimeout)
  ) {
    // If the minimum value is zero, it's probably a glitched frame.
    minValue.value = Math.min(minValue.value, frameMinValue);
    maxValue.value = Math.max(maxValue.value, frameMaxValue);
    const AVERAGE_HEADROOM_OVER_BACKGROUND = 300;
    maxValue.value = Math.max(
      Math.max(maxValue.value, frameMaxValue),
      Math.min(1 << 16, minValue.value + AVERAGE_HEADROOM_OVER_BACKGROUND)
    );
  }
  return frame;
};

const renderCurrentFrame = async (
  force = false,
  frameNumToRender?: number
): Promise<boolean> => {
  if (header.value) {
    loadProgress.value = 1; //await cptvDecoder.getLoadProgress();
    if (frameNumToRender === undefined) {
      frameNumToRender = frameNum.value;
    }
    if (frameNumToRender > loadedFrames.value + 2 && !totalFrames.value) {
      buffering.value = true;
    }

    while (loadedFrames.value <= frameNumToRender && !totalFrames.value) {
      seekingInProgress.value = true;
      const frame = null; //await cptvDecoder.getNextFrame();
      console.assert(frame !== null);
      if (frame === null) {
        // Poll again so that we can read out totalFrames
        // await cptvDecoder.getNextFrame();
      }
      if (header.value.totalFrames) {
        knownDurationInternal.value =
          header.value.totalFrames / header.value.fps;
      }
      totalFrames.value = 0; //await cptvDecoder.getTotalFrames();
      totalFrames.value =
        totalFrames.value &&
        totalFrames.value + (header.value.hasBackgroundFrame ? 1 : 0);
      if (frame === null) {
        // if (await cptvDecoder.hasStreamError()) {
        //   streamLoadError.value = null;//await cptvDecoder.getStreamError();
        //   await cptvDecoder.free();
        //   totalFrames.value = frames.length;
        // }
        break;
      }
      if (!totalFrames.value) {
        // If we got the total frames, then we're at the end of the stream, and the last
        // frame has already been pulled out.
        frames.push(frame);
      }
      loadedFrames.value = frames.length;
    }
    seekingInProgress.value = false;
    buffering.value = false;
    const gotFrame = frameNumToRender < loadedFrames.value;
    const frameData = getFrameAtIndex(frameNumToRender);
    frameHeader.value = frameData.meta;
    renderFrame(frameData, frameNumToRender, force);
    return gotFrame;
  }
  return false;
};

const minMaxForFrame = ({ meta }: CptvFrame): [number, number] => {
  if (meta.isBackgroundFrame) {
    return [minValue.value, maxValue.value];
  }
  const lastFfcTimeMs = meta.lastFfcTimeMs || 1000000;
  const timeSinceLastFFC = (meta.timeOnMs - lastFfcTimeMs) / 1000;
  if (timeSinceLastFFC < 5) {
    // Use frame local min/max
    return [meta.imageData.min, meta.imageData.max];
  }
  return [minValue.value, maxValue.value];
};

const renderFrame = (
  frameData: CptvFrame,
  frameNumToRender: number,
  force = false
) => {
  if (canvas.value && header.value) {
    const context = canvas.value.getContext("2d");
    if (!context) {
      return;
    }
    let min;
    let max;
    // FIXME - remove as any when def updated
    if ((header.value as any).minValue && (header.value as any).maxValue) {
      min = (header.value as any).minValue;
      max = (header.value as any).maxValue;
    } else {
      [min, max] = minMaxForFrame(frameData);
    }

    const range = max - min;
    const colourMapToUse = colourMap.value[1];
    const fd = frameData.data;
    const frameBufferView = new Uint32Array(frameBuffer.buffer);
    const len = frameBufferView.length;
    for (let i = 0; i < len; i++) {
      const index = ((fd[i] - min) / range) * 255.0;
      const n = Math.abs(index);
      const f = n << 0;
      const ff = f == n ? f : f + 1;
      frameBufferView[i] = colourMapToUse[ff];
    }

    cancelAnimationFrame(animationFrame.value);
    animationFrame.value = requestAnimationFrame(() => {
      if (header.value) {
        drawFrame(
          context,
          new ImageData(frameBuffer, header.value.width, header.value.height),
          frameNumToRender || frameNum.value,
          force
        );
      }
    });
  }
};

const secondsSinceLastFFC = computed<number | null>(() => {
  if (frameHeader.value && frameHeader.value.lastFfcTimeMs) {
    return (
      (frameHeader.value.timeOnMs - frameHeader.value.lastFfcTimeMs) / 1000
    );
  }
  return null;
});

const setFrameInfo = (frameNum: number) => {
  if (showDebugTools.value) {
    if (frameNumField.value) {
      frameNumField.value.innerText = `Frame #${frameNum}`;
    }
    if (ffcSecsAgo.value && secondsSinceLastFFC.value) {
      ffcSecsAgo.value.innerText = `FFC ${secondsSinceLastFFC.value.toFixed(
        1
      )}s ago`;
    }
  }
};
const frameTimeSeconds = computed<number>(() => {
  if (header.value) {
    return 1 / (header.value.fps as number);
  }
  return 1 / 9;
});

const timeAdjustmentForBackgroundFrame = computed<number>(() => {
  if (hasBackgroundFrame.value) {
    return frameTimeSeconds.value;
  }
  return 0;
});

const knownDurationInternal = ref<number | null>(null);
const knownDuration = computed<number | null>(() => {
  if (knownDurationInternal.value) {
    return knownDurationInternal.value;
  }
  if (recording) {
    return recording.duration;
  }
  return null;
});

const actualDuration = computed<number>(() => {
  if (header.value) {
    const fps = header.value.fps;
    if (header.value.totalFrames) {
      const totalPlayableFrames =
        header.value.totalFrames - (header.value.hasBackgroundFrame ? 1 : 0);
      return totalPlayableFrames / fps;
    } else {
      if (totalFrames.value !== null) {
        return (
          (totalFrames.value - 1 - (header.value.hasBackgroundFrame ? 1 : 0)) /
          fps
        );
      }
      if (knownDuration.value === null && loadedFrames.value) {
        return (loadedFrames.value - 1) / fps;
      }
    }
  }
  return Math.max(
    ...(recording || { tracks: [] }).tracks.map(
      ({ end }) => end - timeAdjustmentForBackgroundFrame.value
    ),
    (knownDuration.value || 0) - timeAdjustmentForBackgroundFrame.value
  );
});

const currentTime = computed<number>(() => {
  if (header.value) {
    const totalTime = actualDuration.value;
    const totalFramesEstimate = totalTime * (header.value.fps as number);
    return (frameNum.value / totalFramesEstimate) * totalTime;
  }
  return 0;
});

const formatTime = (time: number): string => {
  let seconds = Math.floor(time);
  if (seconds < 60) {
    return `0:${`${seconds}`.padStart(2, "0")}`;
  }
  const minutes = Math.floor(seconds / 60);
  seconds = seconds - minutes * 60;
  return `${minutes}:${seconds.toString().padStart(2, "0").padEnd(2, "0")}`;
};

const elapsedTime = computed<string>(() => {
  return formatTime(currentTime.value);
});

type Rectangle = [number, number, number, number];
interface TrackBox {
  what: string | null;
  rect: Rectangle;
}

interface TrackExportOption {
  includeInExportTime: boolean;
  displayInExport: boolean;
  trackId: number;
}

const getAuthoritativeTagForTrack = (
  trackTags: ApiTrackTagResponse[]
): string | null => {
  const userTags = trackTags.filter((tag) => !tag.automatic);
  if (userTags.length) {
    return userTags[0].what;
  } else {
    const tag = trackTags.find(
      (tag) =>
        (tag.data && typeof tag.data === "string" && tag.data === "Master") ||
        (typeof tag.data === "object" &&
          tag.data.name &&
          tag.data.name === "Master")
    );
    if (tag) {
      return tag.what;
    }
  }
  return null;
};

// Check if positions is in old format or new and format accordingly
const getPositions = (
  positions: ApiTrackPosition[],
  timeOffset: number,
  frameTimeSeconds: number
): [number, Rectangle][] => {
  const frameAtTime = (time: number) => {
    return Math.round(time / frameTimeSeconds);
  };
  // Add a bit of breathing room around our boxes
  const padding = 5;
  return (positions as ApiTrackPosition[]).map((position: ApiTrackPosition) => [
    position.order ||
      (position.frameTime && frameAtTime(position.frameTime - timeOffset)) ||
      0,
    [
      Math.max(0, position.x - padding),
      Math.max(0, position.y - padding),
      position.x + position.width + padding,
      position.y + position.height + padding,
    ],
  ]);
};

const getProcessedTracks = (
  tracks: ApiTrackResponse[],
  timeOffset: number,
  frameTimeSeconds: number
): Record<number, Record<number, TrackBox>> => {
  return tracks
    .map(({ positions, tags, id }) => ({
      what: (tags && getAuthoritativeTagForTrack(tags)) || null,
      positions: getPositions(
        positions as ApiTrackPosition[],
        timeOffset,
        frameTimeSeconds
      ),
      id,
    }))
    .reduce((acc: Record<number, Record<number, TrackBox>>, item) => {
      for (const position of item.positions) {
        acc[position[0]] = acc[position[0]] || {};
        const frame = acc[position[0]];
        frame[item.id] = {
          rect: position[1],
          what: item.what,
        };
      }
      return acc;
    }, {});
};

const processedTracks = computed<Record<number, Record<number, TrackBox>>>(
  () => {
    return getProcessedTracks(
      recording?.tracks || [],
      timeAdjustmentForBackgroundFrame.value,
      frameTimeSeconds.value
    );
  }
);

const drawRectWithText = (
  context: CanvasRenderingContext2D,
  trackId: number,
  dims: Rectangle,
  what: string | null,
  isExporting: boolean
) => {
  if (!header.value) {
    return;
  }
  const selected = currentTrack === trackId || isExporting;
  const trackIndex =
    recording?.tracks.findIndex((track) => track.id === trackId) || 0;
  const lineWidth = selected ? 2 : 1;
  const outlineWidth = lineWidth + 4;
  const halfOutlineWidth = outlineWidth / 2;
  const deviceRatio = isExporting ? 1 : window.devicePixelRatio;
  const scale = context.canvas.width / header.value.width;
  const [left, top, right, bottom] = dims.map((x) => x * scale);
  const rectWidth = right - left;
  const rectHeight = bottom - top;

  const x =
    Math.max(halfOutlineWidth, Math.round(left) - halfOutlineWidth) /
    deviceRatio;
  const y =
    Math.max(halfOutlineWidth, Math.round(top) - halfOutlineWidth) /
    deviceRatio;
  const width =
    Math.round(Math.min(context.canvas.width - left, Math.round(rectWidth))) /
    deviceRatio;
  const height =
    Math.round(Math.min(context.canvas.height - top, Math.round(rectHeight))) /
    deviceRatio;
  context.lineJoin = "round";
  context.lineWidth = outlineWidth;
  context.strokeStyle = `rgba(0, 0, 0, ${selected ? 0.4 : 0.5})`;
  context.beginPath();
  context.strokeRect(x, y, width, height);
  context.strokeStyle = TagColours[trackIndex % TagColours.length].background;
  context.lineWidth = lineWidth;
  context.beginPath();
  context.strokeRect(x, y, width, height);
  if (selected || isExporting) {
    // If exporting, show all the best guess animal tags, if not unknown
    if (what !== null) {
      const text = what;
      const textHeight = 9 * deviceRatio;
      const textWidth = context.measureText(text).width * deviceRatio;
      const marginX = 2 * deviceRatio;
      const marginTop = 2 * deviceRatio;
      let textX = Math.min(context.canvas.width, right) - (textWidth + marginX);
      let textY = bottom + textHeight + marginTop;
      // Make sure the text doesn't get clipped off if the box is near the frame edges
      if (textY + textHeight > context.canvas.height) {
        textY = top - textHeight;
      }
      if (textX < 0) {
        textX = left + marginX;
      }
      context.font = "13px sans-serif";
      context.lineWidth = 4;
      context.strokeStyle = "rgba(0, 0, 0, 0.5)";
      context.strokeText(text, textX / deviceRatio, textY / deviceRatio);
      context.fillStyle = "white";
      context.fillText(text, textX / deviceRatio, textY / deviceRatio);
    }
  }
};

const renderOverlay = (
  context: CanvasRenderingContext2D | null,
  scale: number,
  timeSinceFFCSeconds: number | null,
  isExporting: boolean,
  frameNum: number,
  trackExportOptions?: TrackExportOption[]
) => {
  if (context) {
    if (!isExporting) {
      // Clear if we are drawing on the live overlay, but not if we're drawing for export
      context.clearRect(
        0,
        0,
        context.canvas.width * (1 / pixelRatio.value),
        context.canvas.height * (1 / pixelRatio.value)
      );
    }
    const tracks =
      processedTracks.value[frameNum] || ({} as Record<number, TrackBox>);
    const frameTracks = Object.entries(tracks);
    if (
      currentTrack &&
      !isExporting &&
      canSelectTracks &&
      frameTracks.length === 1
    ) {
      const trackId = Number(frameTracks[0][0]);
      // If the track is the only track at this time offset, make it the selected track.
      if (currentTrack !== trackId) {
        emit("track-selected", { trackId });
      }
    }

    if (currentTrack && (!showOverlaysForCurrentTrackOnly || isExporting)) {
      for (const [trackId, trackBox] of frameTracks) {
        if (currentTrack !== Number(trackId)) {
          if (
            !trackExportOptions ||
            trackExportOptions.find(
              (options) => options.trackId === Number(trackId)
            )?.displayInExport
          ) {
            const box = trackBox as TrackBox;
            drawRectWithText(
              context,
              Number(trackId),
              box.rect,
              box.what,
              isExporting
            );
          }
        }
      }
    }
    // Always draw selected track last, so it sits on top of any overlapping tracks.
    for (const [trackId, trackBox] of frameTracks) {
      if (currentTrack === Number(trackId)) {
        if (
          !trackExportOptions ||
          trackExportOptions.find(
            (options) => options.trackId === Number(trackId)
          )?.displayInExport
        ) {
          const box = trackBox as TrackBox;
          drawRectWithText(
            context,
            Number(trackId),
            box.rect,
            box.what,
            isExporting
          );
        }
      }
    }
    if (timeSinceFFCSeconds !== null && timeSinceFFCSeconds < 10) {
      context.font = "bold 15px Verdana";

      // NOTE: Make opacity of text stronger when the FFC event has just happened, then fade out
      let a = 1 / (10 - timeSinceFFCSeconds);
      a = a * a;
      const alpha = 1 - a;
      context.fillStyle = `rgba(163, 210, 226, ${alpha})`;

      const text = "Calibrating...";
      const textWidth = context.measureText(text).width;
      const deviceRatio = isExporting ? 1 : window.devicePixelRatio;
      const textX = context.canvas.width / deviceRatio / 2 - textWidth / 2;
      const textY = 20;
      context.fillText(text, textX, textY);
    }
  }
};

const exportMp4 = () => {
  // TODO;
};

const setLabelFontStyle = (overlayContext: CanvasRenderingContext2D) => {
  overlayContext.font = "13px sans-serif";
  overlayContext.lineWidth = 4;
  overlayContext.strokeStyle = "rgba(0, 0, 0, 0.5)";
  overlayContext.fillStyle = "white";
};

const drawBottomRightOverlayLabel = (
  label: string | false,
  overlayContext: CanvasRenderingContext2D
) => {
  if (label) {
    setLabelFontStyle(overlayContext);
    const bottomPadding = 10;
    const sidePadding = 10;
    const labelWidth =
      overlayContext.measureText(label).width * pixelRatio.value;
    overlayContext.strokeText(
      label,
      (overlayContext.canvas.width -
        (labelWidth + sidePadding * pixelRatio.value)) /
        pixelRatio.value,
      (overlayContext.canvas.height - bottomPadding * pixelRatio.value) /
        pixelRatio.value
    );
    overlayContext.fillText(
      label,
      (overlayContext.canvas.width -
        (labelWidth + sidePadding * pixelRatio.value)) /
        pixelRatio.value,
      (overlayContext.canvas.height - bottomPadding * pixelRatio.value) /
        pixelRatio.value
    );
  }
};

const drawBottomLeftOverlayLabel = (
  label: string | null,
  overlayContext: CanvasRenderingContext2D
) => {
  if (label) {
    setLabelFontStyle(overlayContext);
    const bottomPadding = 10;
    const sidePadding = 10;
    overlayContext.strokeText(
      label,
      sidePadding,
      (overlayContext.canvas.height - bottomPadding * pixelRatio.value) /
        pixelRatio.value
    );
    overlayContext.fillText(
      label,
      sidePadding,
      (overlayContext.canvas.height - bottomPadding * pixelRatio.value) /
        pixelRatio.value
    );
  }
};

const ambientTemperature = computed<string | null>(() => {
  if (frameHeader.value && frameHeader.value.frameTempC) {
    return `About ${Math.round(frameHeader.value.frameTempC)}ºC`;
  }
  return null;
});

const drawFrame = async (
  context: CanvasRenderingContext2D,
  imgData: ImageData,
  frameNumToRender: number,
  force = false
): Promise<void> => {
  if (context && header.value) {
    if (force) {
      animationTick.value = 0;
    }

    // FIXME - This breaks on non-60hz screens, so calculate the actual value anytime we detect that the window has been
    //  moved to a new display?

    // One tick represents 1000 / fps * multiplier
    const everyXTicks = Math.max(
      1,
      Math.floor(raqFps.value / (header.value.fps * speedMultiplier.value))
    );
    // NOTE: respect fps here, render only when we should.
    const shouldRedraw =
      (animationTick.value + (playing.value ? 1 : 0)) % everyXTicks === 0;
    //console.log("Should redraw", shouldRedraw, this.animationTick, this.playing);
    if (context && (shouldRedraw || force)) {
      setFrameInfo(frameNumToRender);
      //console.log("*** Draw frame to canvas", frameNum);
      //debugger;
      context.putImageData(imgData, 0, 0);
      if (overlayCanvas.value) {
        const overlayContext = overlayCanvas.value.getContext("2d");
        if (overlayContext) {
          renderOverlay(
            overlayContext,
            scale.value,
            secondsSinceLastFFC.value,
            false,
            frameNumToRender
          );

          {
            const time = `${elapsedTime.value} / ${formatTime(
              Math.max(currentTime.value, actualDuration.value)
            )}`;
            drawBottomRightOverlayLabel(time, overlayContext);
            // Draw time and temperature in
            // overlayContext.
            drawBottomLeftOverlayLabel(
              ambientTemperature.value,
              overlayContext
            );
          }
        }
      }
      let didAdvance = false;
      if (playing.value) {
        didAdvance = await fetchRenderAdvanceFrame();
      }
      if (didAdvance) {
        animationTick.value = 0;
        frameNum.value++;
      } else {
        animationTick.value++;
      }
      // Check if we're at the end:
      let totalExcludingBackground;
      if (header.value && totalFrames.value) {
        if (header.value.hasBackgroundFrame) {
          totalExcludingBackground = totalFrames.value - 1;
        } else {
          totalExcludingBackground = totalFrames.value;
        }
      }
      if (
        header.value &&
        totalFrames.value &&
        frameNum.value == totalExcludingBackground
      ) {
        atEndOfPlayback.value = true;
        pause();
      }
    } else if (context) {
      animationTick.value++;
      cancelAnimationFrame(animationFrame.value);
      animationFrame.value = requestAnimationFrame(() =>
        drawFrame(context, imgData, frameNumToRender)
      ) as number;
    }

    if (playing.value && stopAtFrame.value) {
      if (frameNum.value === stopAtFrame.value) {
        stopAtFrame.value = null;
        pause();
      }
    }
  }
};

const fetchRenderAdvanceFrame = async (): Promise<boolean> => {
  // Fetch, render, advance
  const canAdvance = await renderCurrentFrame();
  if (canAdvance) {
    return true;
  } else if (playing.value) {
    pause();
  }
  return false;
};

const play = async () => {
  playing.value = true;
  isShowingBackgroundFrame.value = false;
  await fetchRenderAdvanceFrame();
};

const pause = () => {
  playing.value = false;
  cancelAnimationFrame(animationFrame.value);
};

const togglePlayback = async (): Promise<void> => {
  if (!playing.value) {
    if (atEndOfPlayback.value) {
      frameNum.value = 0;
      animationTick.value = 0;
      atEndOfPlayback.value = false;
    }
    await play();
  } else {
    pause();
  }
};

const toggleAdvancedControls = () => {
  showAdvancedControls.value = !showAdvancedControls.value;
};

const toggleDebugTools = () => {
  showDebugTools.value = !showDebugTools.value;
  localStorage.setItem("show-debug-tools", showDebugTools.value.toString());
};

const setPlayerMessage = (message: string) => {
  if (messageTimeout.value !== null || playerMessage.value !== null) {
    clearTimeout(messageTimeout.value as number);
    messageTimeout.value = null;
    playerMessage.value = null;
    cancelAnimationFrame(messageAnimationFrame.value as number);
    messageAnimationFrame.value = requestAnimationFrame(() => {
      setPlayerMessage(message);
    });
  } else {
    playerMessage.value = message;
    messageTimeout.value = setTimeout(() => {
      messageTimeout.value = null;
      playerMessage.value = null;
    }, 1000) as unknown as number;
  }
};

const toggleSmoothing = () => {
  smoothed.value = !smoothed.value;
  window.localStorage.setItem("video-smoothing", String(smoothed.value));
  setPlayerMessage(`Smoothing ${smoothed.value ? "Enabled" : "Disabled"}`);
};

const incrementPalette = async (): Promise<void> => {
  paletteIndex.value++;
  if (paletteIndex.value === ColourMaps.length) {
    paletteIndex.value = 0;
  }
  const paletteName = ColourMaps[paletteIndex.value][0];
  setPlayerMessage(paletteName);
  localStorage.setItem("video-palette", paletteName);
  colourMap.value = ColourMaps[paletteIndex.value];
  await renderCurrentFrame();
};

const incrementSpeed = () => {
  speedMultiplierIndex.value++;
  if (speedMultiplierIndex.value === PlaybackSpeeds.length) {
    speedMultiplierIndex.value = 0;
  }
  setPlayerMessage(`Speed ${speedMultiplier.value}x`);
  localStorage.setItem(
    "video-playback-speed",
    speedMultiplier.value.toString()
  );
};

const speedMultiplier = computed(() => {
  return PlaybackSpeeds[speedMultiplierIndex.value];
});

const stepBackward = async () => {
  isShowingBackgroundFrame.value = false;
  pause();
  animationTick.value = 0;
  const firstFrame = 0;
  const couldStep = await renderCurrentFrame(
    true,
    Math.max(frameNum.value - 1, firstFrame)
  );
  if (couldStep) {
    frameNum.value = Math.max(0, frameNum.value - 1);
    atEndOfPlayback.value = false;
  }
};

const toggleBackground = async (): Promise<void> => {
  wasPaused.value = !playing.value;
  if (!isShowingBackgroundFrame.value) {
    const background = getFrameAtIndex(-1);
    if (background && header.value) {
      animationTick.value = 0;
      if (playing.value) {
        pause();
        wasPaused.value = true;
      }
      const context = canvas.value?.getContext("2d");
      if (!context) {
        return;
      }
      const [min, max] = minMaxForFrame(background);
      renderFrameIntoFrameBuffer(
        frameBuffer,
        background.data,
        colourMap.value[1],
        min,
        max
      );
      context.putImageData(
        new ImageData(frameBuffer, header.value.width, header.value.height),
        0,
        0
      );
      // Clear overlay
      const overlayContext = overlayCanvas.value?.getContext("2d");
      if (overlayContext) {
        overlayContext.clearRect(
          0,
          0,
          overlayContext.canvas.width * (1 / pixelRatio.value),
          overlayContext.canvas.height * (1 / pixelRatio.value)
        );

        drawBottomLeftOverlayLabel("Background frame", overlayContext);
      }
    }
  } else {
    if (!wasPaused.value) {
      wasPaused.value = false;
      await play();
    } else {
      await renderCurrentFrame(true);
    }
  }
  isShowingBackgroundFrame.value = !isShowingBackgroundFrame.value;
};

const stepForward = async () => {
  isShowingBackgroundFrame.value = false;
  pause();
  animationTick.value = 0;
  const canAdvance = await renderCurrentFrame(true, frameNum.value + 1);
  if (canAdvance) {
    frameNum.value++;
  }
  if (header.value && totalFrames.value !== null) {
    if (header.value.hasBackgroundFrame) {
      atEndOfPlayback.value = frameNum.value === totalFrames.value - 2;
    } else {
      atEndOfPlayback.value = frameNum.value === totalFrames.value - 1;
    }
  } else {
    atEndOfPlayback.value = false;
  }
};
</script>
<template>
  <div :class="['cptv-player', { 'stand-alone': standAlone }]">
    <div key="container" class="video-container" ref="container">
      <canvas key="base" ref="canvas" :class="['video-canvas', { smoothed }]" />
      <canvas key="overlay" ref="overlayCanvas" class="overlay-canvas" />
      <span
        key="messaging"
        :class="['player-messaging', { show: playerMessage !== null }]"
        v-html="playerMessage"
      />
      <span
        key="px-value"
        v-show="showValueInfo"
        ref="valueTooltip"
        class="value-tooltip"
        >{{ valueUnderCursor }}
      </span>
      <div
        key="openUserFile"
        class="playback-controls show"
        v-if="openUserDefinedCptvFile && userFiles"
      >
        <!--        <b-form-file-->
        <!--          class="cptv-drop-area"-->
        <!--          accept=".cptv"-->
        <!--          v-model="userSuppliedFile"-->
        <!--          :state="userSuppliedFile !== null"-->
        <!--          placeholder="Choose a CPTV file or drop one here..."-->
        <!--          drop-placeholder="Drop file here..."-->
        <!--        />-->
      </div>
      <div
        key="buffering"
        :class="[
          'playback-controls',
          { show: isBuffering && (!openUserDefinedCptvFile || !userFiles) },
        ]"
      >
        <font-awesome-icon class="fa-spin buffering" icon="spinner" size="4x" />
      </div>
      <div
        key="playback-controls"
        :class="[
          'playback-controls',
          {
            show: atEndOfPlayback && !extLoading && !openUserDefinedCptvFile,
          },
        ]"
      >
        <button
          @click="requestPrevRecording"
          :class="{ disabled: !canGoBackwards }"
          v-if="!standAlone"
        >
          <font-awesome-icon icon="backward" class="replay" />
        </button>
        <button
          v-if="standAlone && !cptvUrl"
          @click="openUserDefinedCptvFile = true"
        >
          <font-awesome-icon icon="folder-open" class="replay" />
        </button>
        <button @click="togglePlayback">
          <font-awesome-icon icon="redo-alt" class="replay" rotation="270" />
        </button>
        <button
          @click="requestNextRecording"
          :class="{ disabled: !canGoForwards }"
          v-if="!standAlone"
        >
          <font-awesome-icon icon="forward" class="replay" />
        </button>
      </div>
    </div>
    <div key="playback-nav" class="playback-nav">
      <button
        @click="togglePlayback"
        ref="playPauseButton"
        :data-tooltip="playing ? 'Pause' : 'Play'"
        :disabled="!hasVideo"
      >
        <font-awesome-icon v-if="!playing" icon="play" />
        <font-awesome-icon v-else icon="pause" />
      </button>
      <div class="right-nav">
        <div
          :class="['advanced-controls', { open: showAdvancedControls }]"
          v-if="canUseAdvancedControls"
        >
          <button
            @click="toggleAdvancedControls"
            class="advanced-controls-btn"
            :data-tooltip="showAdvancedControls ? 'Show less' : 'Show more'"
            ref="advancedControlsButton"
          >
            <font-awesome-icon
              icon="angle-right"
              :rotation="showAdvancedControls ? null : 180"
            />
          </button>
          <button
            @click="toggleDebugTools"
            ref="debugTools"
            data-tooltip="Debug tools"
            :class="{ selected: showDebugTools }"
          >
            <font-awesome-icon icon="wrench" />
          </button>
          <button
            @click="toggleSmoothing"
            ref="toggleSmoothingButton"
            :data-tooltip="smoothed ? 'Disable smoothing' : 'Enable smoothing'"
            :disabled="!hasVideo"
          >
            <svg
              v-if="smoothed"
              aria-hidden="true"
              focusable="false"
              viewBox="0 0 18 18"
              width="16"
              height="20"
            >
              <g transform="matrix(1,0,0,1,0,-249)" fill="currentColor">
                <path
                  d="M5.25,248.969L5.25,251.781C5.25,252.247 4.872,252.625 4.406,252.625L0.844,252.625C0.378,252.625 0,252.247 0,251.781L0,248.969C0,248.503 0.378,248.125 0.844,248.125L4.406,248.125C4.872,248.125 5.25,248.503 5.25,248.969Z"
                  style="fill-opacity: 0.25"
                />
                <path
                  d="M11.625,257.406L11.625,254.594C11.625,254.128 11.247,253.75 10.781,253.75L7.219,253.75C6.753,253.75 6.375,254.128 6.375,254.594L6.375,257.406C6.375,257.872 6.753,258.25 7.219,258.25L10.781,258.25C11.247,258.25 11.625,257.872 11.625,257.406Z"
                />
                <path
                  d="M12.75,248.969L12.75,251.781C12.75,252.247 13.128,252.625 13.594,252.625L17.156,252.625C17.622,252.625 18,252.247 18,251.781L18,248.969C18,248.503 17.622,248.125 17.156,248.125L13.594,248.125C13.128,248.125 12.75,248.503 12.75,248.969Z"
                  style="fill-opacity: 0.8"
                />
                <path
                  d="M11.625,251.781L11.625,248.969C11.625,248.503 11.247,248.125 10.781,248.125L7.219,248.125C6.753,248.125 6.375,248.503 6.375,248.969L6.375,251.781C6.375,252.247 6.753,252.625 7.219,252.625L10.781,252.625C11.247,252.625 11.625,252.247 11.625,251.781Z"
                  style="fill-opacity: 0.5"
                />
                <path
                  d="M4.406,253.75L0.844,253.75C0.378,253.75 0,254.128 0,254.594L0,257.406C0,257.872 0.378,258.25 0.844,258.25L4.406,258.25C4.872,258.25 5.25,257.872 5.25,257.406L5.25,254.594C5.25,254.128 4.872,253.75 4.406,253.75Z"
                  style="fill-opacity: 0.5"
                />
                <path
                  d="M0,260.219L0,263.031C0,263.497 0.378,263.875 0.844,263.875L4.406,263.875C4.872,263.875 5.25,263.497 5.25,263.031L5.25,260.219C5.25,259.753 4.872,259.375 4.406,259.375L0.844,259.375C0.378,259.375 0,259.753 0,260.219Z"
                  style="fill-opacity: 0.8"
                />
                <path
                  d="M13.594,258.25L17.156,258.25C17.622,258.25 18,257.872 18,257.406L18,254.594C18,254.128 17.622,253.75 17.156,253.75L13.594,253.75C13.128,253.75 12.75,254.128 12.75,254.594L12.75,257.406C12.75,257.872 13.128,258.25 13.594,258.25Z"
                />
                <path
                  d="M13.594,263.875L17.156,263.875C17.622,263.875 18,263.497 18,263.031L18,260.219C18,259.753 17.622,259.375 17.156,259.375L13.594,259.375C13.128,259.375 12.75,259.753 12.75,260.219L12.75,263.031C12.75,263.497 13.128,263.875 13.594,263.875Z"
                />
                <path
                  d="M6.375,260.219L6.375,263.031C6.375,263.497 6.753,263.875 7.219,263.875L10.781,263.875C11.247,263.875 11.625,263.497 11.625,263.031L11.625,260.219C11.625,259.753 11.247,259.375 10.781,259.375L7.219,259.375C6.753,259.375 6.375,259.753 6.375,260.219Z"
                />
              </g>
            </svg>

            <svg v-else width="16" height="18" viewBox="0 0 18 18">
              <g transform="matrix(1,0,0,1,0,-2)" fill="currentColor">
                <path
                  d="M1.294,16.976L18.709,17.063L18.853,0.932C9.155,0.932 1.294,7.279 1.294,16.976Z"
                />
              </g>
            </svg>
          </button>
          <button
            @click="incrementPalette"
            ref="cyclePalette"
            data-tooltip="Cycle colour map"
            :disabled="!hasVideo"
          >
            <font-awesome-icon icon="palette" />
          </button>
          <button
            :disabled="!hasVideo"
            @click="displayHeaderInfo = true"
            data-tooltip="Show recording header info"
            :class="{ selected: displayHeaderInfo }"
            ref="showHeader"
          >
            <font-awesome-icon icon="info-circle" />
          </button>
        </div>
        <button
          :disabled="!hasVideo"
          @click="incrementSpeed"
          ref="cyclePlaybackSpeed"
          class="playback-speed"
          data-tooltip="Cycle playback speed"
        >
          <span>{{ speedMultiplier }}x</span>
        </button>
      </div>
    </div>
    <div key="debug-nav" :class="['debug-tools', { open: showDebugTools }]">
      <div class="debug-info">
        <div ref="frameNumField"></div>
        <div ref="ffcSecsAgo"></div>
      </div>
      <!--      <button-->
      <!--        @click="toggleHistogram"-->
      <!--        ref="toggleHistogramButton"-->
      <!--        :disabled="!hasVideo"-->
      <!--        :data-tooltip="showingHistogram ? 'Hide histogram' : 'Show histogram'"-->
      <!--      >-->
      <!--        <font-awesome-icon icon="chart-bar" />-->
      <!--      </button>-->
      <div>
        <button
          @click="stepBackward"
          data-tooltip="Go back one frame"
          ref="stepBackward"
          :disabled="!hasVideo"
        >
          <font-awesome-icon icon="step-backward" />
        </button>
        <button
          @click="stepForward"
          data-tooltip="Go forward one frame"
          ref="stepForward"
          :disabled="!hasVideo"
        >
          <font-awesome-icon icon="step-forward" />
        </button>
        <button
          @click="showValueInfo = !showValueInfo"
          :disabled="!hasVideo"
          :class="{ selected: showValueInfo }"
          :data-tooltip="
            showValueInfo
              ? 'Disable picker'
              : 'Show raw pixel values under cursor'
          "
          ref="toggleValuePicker"
        >
          <font-awesome-icon icon="eye-dropper" />
        </button>
        <button
          :disabled="!hasVideo || !hasBackgroundFrame"
          ref="showBackgroundFrame"
          :class="{ selected: isShowingBackgroundFrame }"
          data-tooltip="Press to show background frame"
          @click="toggleBackground"
        >
          <font-awesome-icon icon="image" />
        </button>
        <button
          v-if="standAlone || userSuppliedFile"
          ref="exportMp4"
          :disabled="!hasVideo"
          data-tooltip="Export Mp4"
          @click="() => exportMp4()"
        >
          <font-awesome-icon icon="file-video" />
        </button>
      </div>
    </div>
    <div class="tracks-container">
      <tracks-scrubber
        class="player-tracks"
        :tracks="recording?.tracks || []"
        :duration="recording?.duration || 0"
        @change-playback-time="playbackTimeChanged"
        :playback-time="playbackTime"
      />
    </div>
  </div>
</template>
<style scoped lang="less">
.video-container {
  width: 640px;
  aspect-ratio: 4 / 3;
}
.cptv-player {
  .video-container {
    margin: 0 auto;
    position: relative;
    padding: 0;
    background: black;
    overflow: hidden;
  }
  .video-canvas {
    width: 100%;
    height: 100%;
    max-width: 100vh;
    image-rendering: pixelated;
    image-rendering: crisp-edges;
    &.smoothed {
      image-rendering: auto;
    }
  }
  .overlay-canvas {
    position: absolute;
    top: 0;
    left: 0;
  }
  .time,
  .temp,
  .value-tooltip {
    position: absolute;
    right: 7px;
    bottom: 7px;
    font-size: 12px;
    line-height: 12px;
    color: white;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
    padding: 3px;
    user-select: none;
    pointer-events: none;
  }
  .temp {
    //top: 7px;
    left: 7px;
    right: unset;
    //bottom: unset;
  }
  .value-tooltip {
    bottom: unset;
    right: unset;
  }

  @keyframes fadeInOut {
    0% {
      opacity: 0;
    }
    50% {
      opacity: 1;

      transform: scale(1.2);
    }
    100% {
      opacity: 0;
    }
  }

  @-moz-keyframes fadeInOut {
    0% {
      opacity: 0;
    }
    50% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }

  @-webkit-keyframes fadeInOut {
    0% {
      opacity: 0;
    }
    50% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
  .player-messaging {
    position: absolute;
    left: 0;
    right: 0;
    text-align: center;
    display: block;
    bottom: 50px;
    color: white;
    font-size: 20px;
    opacity: 0;
    transform-origin: center;
    &.show {
      animation: fadeInOut 1s;
      -webkit-animation: fadeInOut 1s;
      -moz-animation: fadeInOut 1s;
      -o-animation: fadeInOut 1s;
    }
  }

  .playback-controls {
    color: white;
    position: absolute;
    top: 0;
    right: 0;
    left: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: space-evenly;
    pointer-events: none;
    background: transparent;
    &:not(.mini) {
      background: radial-gradient(
        circle,
        rgba(0, 0, 0, 0.9) 0%,
        rgba(0, 0, 0, 0.5) 50%,
        rgba(0, 0, 0, 0.2) 80%,
        rgba(0, 0, 0, 0) 100%
      );
    }
    opacity: 0;
    transition: opacity 0.3s;
    &.show {
      opacity: 1;
      pointer-events: unset;
      &.mini {
        bottom: 0;
        height: 20%;
        top: unset;
        right: 0;
        left: 0;
      }
    }
    > button {
      touch-action: manipulation;
      min-width: 44px;
      min-height: 44px;
      &.hide {
        opacity: 0;
      }
      > svg {
        transition: opacity 0.3s;
        opacity: 0.5;
      }
      &:hover:not(:disabled),
      &:hover:not(.disabled),
      &:active:not(:disabled),
      &:active:not(.disabled) {
        > svg {
          opacity: 0.8;
        }
      }
      &:disabled,
      &.disabled {
        > svg {
          opacity: 0.1;
        }
      }
      background: transparent;
      &:focus,
      &:active {
        outline: none;
      }
      color: inherit;
      border: 0;
      appearance: none;
      -webkit-appearance: none;
      -moz-appearance: none;
    }
  }

  .replay,
  .buffering {
    min-width: 44px;
    min-height: 44px;
  }

  .playback-nav,
  .debug-tools {
    min-height: 44px;
    background: #2b333f;
    color: white;
    display: flex;
    position: relative;
    justify-content: space-between;
    //border-top: 1px solid rgb(77, 86, 97);
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

    .advanced-controls {
      width: 48px;
      height: 44px;
      overflow: hidden;
      user-select: none;
      transition: width 0.3s ease-in-out;
      display: flex;
      &.open {
        width: 240px;
        .advanced-controls-btn {
          position: relative;
          &::before {
            position: absolute;
            top: 11px;
            left: 12px;
            content: "";
            background: rgba(255, 255, 255, 0.1);
            border-radius: 11px;
            width: 22px;
            height: 22px;
          }
        }
      }
    }
  }
  .debug-tools {
    background: darken(#2b333f, 2%);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    min-height: 0;
    height: 0;
    overflow: hidden;
    transition: height 0.2s ease-in-out;
    &.open {
      height: 44px;
    }
    justify-content: space-between;
    .debug-info {
      user-select: none;
      padding: 0 5px;
      line-height: 22px;
      font-size: 11px;
    }
  }
  .right-nav {
    display: flex;
  }
  .tracks-container {
    position: relative;
    overflow: hidden;
  }
  .playhead {
    height: 100%;
    width: 100%;
    position: absolute;
    left: 0;
    top: 0;
    pointer-events: none;
  }
  .playback-speed {
    font-weight: bold;
    font-size: 90%;
    user-select: none;
  }
  .cptv-drop-area {
    width: 50%;
    height: 50%;
    min-width: 300px;
    min-height: 225px;
    border: 2px dashed silver;
    border-radius: 5px;
    > .custom-file-input,
    > .custom-file-label {
      bottom: 0;
    }
    > .custom-file-label {
      padding: 20px;
      background-color: rgba(0, 0, 0, 0.5);
      transition: background-color 300ms linear;
      color: white;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-color: transparent;
      &.dragging {
        background-color: #2b333f;
      }
      &::after {
        position: unset;
        border-radius: 3px;
      }
    }
  }
}
.tooltip {
  z-index: 100000;
}
.progress-bar {
  transition: width 0.1s linear;
}
.progress-text {
  text-align: center;
  user-select: none;
}
.cancel-export-button {
  margin-top: 20px;
  text-align: center;
}
</style>
