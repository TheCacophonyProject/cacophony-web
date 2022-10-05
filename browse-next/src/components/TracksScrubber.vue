<script setup lang="ts">
import ScrubberWrapper from "@/components/ScrubberWrapper.vue";
import { computed, onMounted, ref, watch } from "vue";
import { TagColours } from "@/consts";
import { useDevicePixelRatio } from "@vueuse/core";
import type { IntermediateTrack } from "@/components/cptv-player/cptv-player-types";
import type { ApiTrackResponse } from "@typedefs/api/track";
const { pixelRatio } = useDevicePixelRatio();
// eslint-disable-next-line vue/no-setup-props-destructure
const {
  tracks = [],
  totalFrames,
  currentTrack,
  sidePadding = 1,
  playbackTime = 0,
} = defineProps<{
  tracks: IntermediateTrack[];
  totalFrames: number;
  currentTrack?: ApiTrackResponse;
  sidePadding?: number;
  playbackTime: number;
}>();

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
const trackHeight = 12;
const minScrubberHeight = 44;
const scrubberWidth = ref(0);

const heightForTracks = computed((): number => {
  if (tracks.length === 0) {
    return minScrubberHeight;
  }
  const paddingY = 10;
  const heightForTracks =
    trackHeight * numUniqueYSlots.value + tracks.length - 1;
  return Math.max(44, heightForTracks + paddingY * 2);
});

const getOffsetYForTrack = (
  trackIndex: number,
  tracks: IntermediateTrack[],
  trackDimensions: TrackDimensions[],
  thisLeft: number,
  thisRight: number
): number => {
  // See if there are any gaps to move this up to.
  let topOffset = minScrubberHeight / 2 - trackHeight / 2;
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
      .sort(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        ([a, _a], [b, _b]) => Number(a) - Number(b)
      )
      .reverse();
    let bestSlot = Number(orderedSlots[0][0]) + trackHeight + 1;
    for (let i = 0; i < orderedSlots.length; i++) {
      const slot = orderedSlots[i];
      const noOverlaps = slot[1].every(
        ([prevLeft, prevRight]) => thisRight < prevLeft || thisLeft > prevRight
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
  for (let i = 0; i < tracks.length; i++) {
    const thisLeft = tracks[i].positions[0][0] / totalFrames;
    const thisRight =
      tracks[i].positions[tracks[i].positions.length - 1][0] / totalFrames;
    const yOffset = getOffsetYForTrack(
      i,
      tracks,
      dimensions,
      thisLeft,
      thisRight
    );
    dimensions.push({
      top: yOffset,
      right: thisRight,
      left: thisLeft,
    });
    uniqueYSlots[yOffset] = true;
  }
  trackDimensions.value = dimensions;
  numUniqueYSlots.value = Object.keys(uniqueYSlots).length;
};

onMounted(() => {
  initTrackDimensions(tracks);
  updatePlayhead(playbackTime, scrubberWidth.value, pixelRatio.value);
});

watch(
  () => tracks,
  (nextTracks: IntermediateTrack[]) => {
    initTrackDimensions(nextTracks);
    updatePlayhead(playbackTime, scrubberWidth.value, pixelRatio.value);
  }
);

watch(
  () => playbackTime,
  (newPlaybackTime) => {
    updatePlayhead(newPlaybackTime, scrubberWidth.value, pixelRatio.value);
  }
);

watch(pixelRatio, (newPixelRatio: number) => {
  updatePlayhead(playbackTime, scrubberWidth.value, newPixelRatio);
});

const onChangeWidth = (width: number) => {
  scrubberWidth.value = width;
  updatePlayhead(playbackTime, width, pixelRatio.value);
};

const fullWidthMinusPadding = computed<number>(() => {
  return ((scrubberWidth.value - sidePadding * 2) / scrubberWidth.value) * 100;
});

const updatePlayhead = (
  offset: number,
  scrubberWidth: number,
  pixelRatio: number
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
          playhead.value.height
        );
        const playheadX = Math.max(
          0,
          Math.min(
            playhead.value.width - playheadLineWidth,
            offset * playhead.value.width - playheadLineWidth
          )
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
  if (currentTrack) {
    return tracks.findIndex((track) => track.id === currentTrack.id) || 0;
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
    <div
      class="track-scrubber"
      :style="{
        height: `${heightForTracks}px`,
      }"
    >
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
          top: `${
            trackDimensions[index - 1].top -
            (numUniqueYSlots === 1 ? 0 : trackHeight / 2)
          }px`,
        }"
        class="scrub-track"
      />
    </div>
    <canvas
      ref="playhead"
      class="playhead"
      :width="width * pixelRatio"
      height="1"
      :style="{ height: `${heightForTracks}px` }"
    ></canvas>
    <div class="playhead"></div>
  </scrubber-wrapper>
</template>
<style scoped lang="less">
.track-scrubber {
  background: #2b333f;
  transition: height 0.3s;
  /* Above the motion paths canvas if it exists */
  box-shadow: 0 1px 5px #000 inset;
  cursor: col-resize;
  position: relative;
}
.scrub-track {
  transition: opacity 0.3s linear;
  height: 12px;
  border-radius: 5px;
  position: absolute;
}
.playhead {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  min-height: 44px;
  pointer-events: none;
}
</style>
