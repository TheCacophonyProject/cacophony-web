<script setup lang="ts">
import ScrubberWrapper from "@/components/ScrubberWrapper.vue";
import { computed, onMounted, ref, watch } from "vue";
import { TagColours } from "@/consts";
import { useDevicePixelRatio, useWindowSize } from "@vueuse/core";
import type { IntermediateTrack } from "@/components/cptv-player/cptv-player-types";
import type { ApiTrackResponse } from "@typedefs/api/track";
const { pixelRatio } = useDevicePixelRatio();
const props = withDefaults(
  defineProps<{
    tracks: IntermediateTrack[];
    totalFrames: number;
    currentTrack?: ApiTrackResponse;
    sidePadding?: number;
    playbackTime: number;
  }>(),
  { tracks: () => [], sidePadding: 1, playbackTime: 0 },
);

interface TrackDimensions {
  top: number;
  left: number;
  right: number;
}

const emit = defineEmits<{
  (e: "change-playback-time", offset: number): void;
  (e: "start-scrub"): void;
  (e: "end-scrub"): void;
}>();

const playhead = ref<HTMLCanvasElement | null>(null);
const trackDimensions = ref<TrackDimensions[]>([]);
const numUniqueYSlots = ref(0);
const scrubberWidth = ref(0);

const getSlotYForTrack = (
  trackIndex: number,
  trackDimensions: TrackDimensions[],
  thisLeft: number,
  thisRight: number,
): number => {
  // See if there are any gaps to move this up to.
  let topOffset = 0;
  if (trackIndex !== 0) {
    // Put each track in a slot with the height offset.
    // Then for each new track, go backwards to try and find the earliest slot without a collision.
    // Put the track in that slot.
    const slots: Record<number, [number, number][]> = {};
    // Go backwards to find the earliest track that has a right <= our left
    while (Math.max(0, trackIndex) !== 0) {
      const lastTrackDims = trackDimensions[trackIndex - 1];
      topOffset = lastTrackDims.top;
      slots[topOffset] = slots[topOffset] || [];
      slots[topOffset].push([lastTrackDims.left, lastTrackDims.right]);
      trackIndex--;
    }
    const orderedSlots = Object.entries(slots)
      .sort(([a, _a], [b, _b]) => Number(a) - Number(b))
      .reverse();
    let bestSlot = Number(orderedSlots[0][0]) + 1;
    for (let i = 0; i < orderedSlots.length; i++) {
      const slot = orderedSlots[i];
      const noOverlaps = slot[1].every(
        ([prevLeft, prevRight]) => thisRight < prevLeft || thisLeft > prevRight,
      );
      if (noOverlaps) {
        bestSlot = Number(slot[0]);
      }
    }
    topOffset = bestSlot;
  }
  return topOffset;
};

const initTrackDimensions = (tracks: IntermediateTrack[]): void => {
  // Init track dimensions
  const dimensions = [];
  numUniqueYSlots.value = 0;
  const uniqueYSlots: Record<number, boolean> = {};
  if (props.totalFrames !== 0) {
    for (let i = 0; i < tracks.length; i++) {
      if (tracks[i].positions.length !== 0) {
        const thisLeft = tracks[i].positions[0][0] / props.totalFrames;
        const thisRight =
          tracks[i].positions[tracks[i].positions.length - 1][0] /
          props.totalFrames;
        const yOffset = getSlotYForTrack(i, dimensions, thisLeft, thisRight);
        dimensions.push({
          top: yOffset,
          right: thisRight,
          left: thisLeft,
        });
        uniqueYSlots[yOffset] = true;
      }
    }
    trackDimensions.value = dimensions;
  }
  const ySlots = Object.keys(uniqueYSlots).length;
  numUniqueYSlots.value = ySlots;
  document.documentElement.style.setProperty(
    "--num-unique-y-slots",
    ySlots.toString(),
  );
};

onMounted(() => {
  initTrackDimensions(props.tracks);
  updatePlayhead(props.playbackTime, scrubberWidth.value, pixelRatio.value);
});

watch(
  () => props.totalFrames,
  () => {
    initTrackDimensions(props.tracks);
    updatePlayhead(props.playbackTime, scrubberWidth.value, pixelRatio.value);
  },
);

watch(
  () => props.tracks,
  (nextTracks: IntermediateTrack[]) => {
    initTrackDimensions(nextTracks);
    updatePlayhead(
      props.playbackTime,
      scrubberWidthMinusPaddingPx.value,
      pixelRatio.value,
    );
  },
);

watch(
  () => props.playbackTime,
  (newPlaybackTime) => {
    updatePlayhead(
      newPlaybackTime,
      scrubberWidthMinusPaddingPx.value,
      pixelRatio.value,
    );
  },
);

watch(pixelRatio, (newPixelRatio: number) => {
  updatePlayhead(
    props.playbackTime,
    scrubberWidthMinusPaddingPx.value,
    newPixelRatio,
  );
});

const onChangeWidth = (width: number) => {
  scrubberWidth.value = width;
  updatePlayhead(
    props.playbackTime,
    scrubberWidthMinusPaddingPx.value,
    pixelRatio.value,
  );
};

const fullWidthMinusPadding = computed<number>(() => {
  return (scrubberWidthMinusPaddingPx.value / scrubberWidth.value) * 100;
});

const scrubberWidthMinusPaddingPx = computed<number>(() => {
  return scrubberWidth.value - props.sidePadding * 2;
});

const updatePlayhead = (
  offset: number,
  scrubberWidth: number,
  pixelRatio: number,
) => {
  // TODO: Is this just over-complicated by being a canvas draw rather than a div drawn with CSS?
  //  Are we actually making it faster for low-end systems?  Actually, I think we did it so we
  //  can have smooth animation of the playhead, since a dom element maybe didn't do the fractional
  //  pixel thing properly.
  requestAnimationFrame(() => {
    if (playhead.value) {
      playhead.value.width = scrubberWidth * pixelRatio;
      const playheadContext = playhead.value.getContext("2d");
      const playheadLineWidth = pixelRatio;
      if (playheadContext) {
        playheadContext.fillStyle = "rgba(0, 0, 0, 0.35)";
        playheadContext.clearRect(
          0,
          0,
          playhead.value.width,
          playhead.value.height,
        );
        const playheadX = Math.max(
          props.sidePadding,
          Math.min(
            playhead.value.width - playheadLineWidth + props.sidePadding,
            offset * playhead.value.width -
              playheadLineWidth / 2 +
              props.sidePadding,
          ),
        );

        playheadContext.fillRect(0, 0, playheadX, playhead.value.height);
        playheadContext.lineWidth = pixelRatio;
        playheadContext.strokeStyle = "white";
        playheadContext.beginPath();
        playheadContext.moveTo(playheadX, 0);
        playheadContext.lineTo(playheadX, playhead.value.height);
        playheadContext.stroke();
      }
    }
  });
};

const setPlaybackTime = (offset: number) => {
  emit("change-playback-time", offset);
};

const currentTrackIndex = computed<number>(() => {
  if (props.currentTrack) {
    return (
      props.tracks.findIndex((track) => track.id === props.currentTrack?.id) ||
      0
    );
  }
  return 0;
});
</script>
<template>
  <scrubber-wrapper
    @width-change="onChangeWidth"
    @change="setPlaybackTime"
    @scrub-start="() => emit('start-scrub')"
    @scrub-end="() => emit('end-scrub')"
    v-slot="{ width }"
  >
    <div class="track-scrubber">
      <div
        v-for="index in Math.min(tracks.length, trackDimensions.length)"
        :key="index - 1"
        :title="`Track ${index}`"
        :style="{
          background: TagColours[(index - 1) % TagColours.length].background,
          opacity: index - 1 === currentTrackIndex ? 1.0 : 0.5,
          right: `calc(${sidePadding}px + ${
            (1 - trackDimensions[index - 1].right) * fullWidthMinusPadding
          }%)`,
          left: `calc(${sidePadding}px + ${
            trackDimensions[index - 1].left * fullWidthMinusPadding
          }%`,
          top: `calc(${
            ((trackDimensions[index - 1].top + 1) / (numUniqueYSlots + 1)) * 100
          }% - calc(var(--track-height) / 2))`,
        }"
        class="scrub-track"
      />
    </div>
    <canvas
      ref="playhead"
      class="playhead"
      :width="width * pixelRatio"
      height="1"
    ></canvas>
    <div class="playhead"></div>
  </scrubber-wrapper>
</template>
<style lang="css">
.track-scrubber {
  background: var(--cp-player-toolbar-bg);
  /* Above the motion paths canvas if it exists */
  box-shadow: 0 1px 5px #000 inset;
  cursor: col-resize;
  position: relative;
  height: calc(var(--height-for-tracks));
}
.playhead {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  pointer-events: none;
  height: calc(var(--height-for-tracks));
}

.scrub-track {
  transition: opacity 0.3s linear;
  border-radius: 5px;
  position: absolute;
  height: calc(var(--track-height));
}
</style>
