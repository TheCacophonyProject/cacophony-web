<script lang="ts" setup>
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import { type Spectastiq } from "spectastiq";
//import { type Spectastiq } from "./spectastiq";
import {
  computed,
  type ComputedRef,
  inject,
  onBeforeMount,
  onMounted,
  type Ref,
  ref,
  watch,
  type WatchStopHandle,
} from "vue";
import {createUserDefinedTrack, replaceTrackTag, updateResizedTrack} from "@api/Recording.ts";
import type { ApiTrackResponse } from "@typedefs/api/track";
import { TagColours } from "@/consts.ts";
import type { RecordingId, TrackId, UserId } from "@typedefs/api/common";
import { DateTime } from "luxon";
import { timezoneForLatLng } from "@models/visitsUtils.ts";
import type {
  ApiAutomaticTrackTagResponse,
  ApiTrackTagResponse,
  TrackTagData,
} from "@typedefs/api/trackTag";
import {
  currentSelectedProject as currentActiveProject,
  currentUser as currentUserInfo,
} from "@models/provides.ts";
import {
  CurrentUserCreds,
  type LoggedInUser,
  type LoggedInUserAuth,
  type SelectedProject,
  userIsLoggedIn,
} from "@models/LoggedInUser.ts";
import type { ApiGroupUserSettings as ApiProjectUserSettings } from "@typedefs/api/group";
import type { Rectangle } from "@/components/cptv-player/cptv-player-types";
import {displayLabelForClassificationLabel, getClassificationForLabel} from "@api/Classifications.ts";
import HierarchicalTagSelect from "@/components/HierarchicalTagSelect.vue";
import type { LoadedResource } from "@api/types.ts";
import { API_ROOT } from "@api/root.ts";
import { maybeRefreshStaleCredentials } from "@api/fetch.ts";
import { decodeJWT } from "@/utils.ts";
import { useMediaQuery, useWindowSize } from "@vueuse/core";
import { useRoute } from "vue-router";

const props = defineProps<{
  userSelectedTrack?: ApiTrackResponse;
  recording: LoadedResource<ApiRecordingResponse>;
  recordingId: RecordingId;
  currentTrack?: ApiTrackResponse;
}>();
const audioUrl = ref<string | null>();
const audioRequestHeaders = ref<string | null>();
const spectastiqEl = ref<Spectastiq>();
const spectrogramContainer = ref<HTMLDivElement>();
const maxFrequency = 48000 / 2;

const emit = defineEmits<{
  (
    e: "track-selected",
    payload: { trackId: TrackId; automatically: boolean },
  ): void;
  (e: "track-deselected"): void;
  (
    e: "track-tag-changed",
    payload: {
      track: ApiTrackResponse;
      tag: string;
      newId?: TrackId;
      userId?: UserId;
      action: "add" | "remove";
    },
  ): void;
  (e: "track-removed", payload: { trackId: TrackId }): void;
  (e: "delete-recording"): void;
}>();

const loadRecording = async () => {
  if (userIsLoggedIn.value) {
    await maybeRefreshStaleCredentials();
    if (CurrentUserCreds.value) {
      const apiToken = decodeJWT(
        (CurrentUserCreds.value as LoggedInUserAuth).apiToken,
      );
      const now = new Date();
      if ((apiToken?.expiresAt as Date).getTime() < now.getTime() + 5000) {
        debugger;
      }

      audioRequestHeaders.value = JSON.stringify({
        Authorization: (CurrentUserCreds.value as LoggedInUserAuth).apiToken,
      });
    }
  }
  audioUrl.value = `${API_ROOT}/api/v1/recordings/raw/${props.recordingId}`;
};
onBeforeMount(() => {
  currentPalette.value =
    localStorage.getItem("spectastiq-palette") || "Viridis";
  loadRecording();

  if (props.recording) {
    if (watchTracks.value) {
      watchTracks.value();
      watchTracks.value = null;
    }
    watchTracks.value = watch(
      () => props.recording && props.recording.tracks,
      (nextTracks) => {
        if (nextTracks) {
          computeIntermediateTracks(nextTracks);
        }
      },
      { deep: true },
    );
    computeIntermediateTracks(props.recording.tracks);
  }
});

const getTrackBounds = (
  contextWidth: number,
  contextHeight: number,
  startZeroOne: number,
  endZeroOne: number,
  trackBox: Rectangle,
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

let pointerPositionX = -1;
let pointerPositionY = -1;
let regionCreationStartX = -1;
let regionCreationStartY = -1;
let regionCreationEndX = -1;
let regionCreationEndY = -1;

const distanceBetween = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number => {
  const dX = Math.abs(x1 - x2);
  const dY = Math.abs(y1 - y2);
  return Math.sqrt(dX * dX + dY * dY);
};

const pointIsInPaddedBox = (
  x: number,
  y: number,
  box: Rectangle,
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
      distanceBetween(x, y, cX, cY),
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
  () => props.userSelectedTrack,
  (nextTrack) => {
    // Just select next track if this a "replay current selected track" action
    nextTrack && selectTrackRegionAndPlay(nextTrack);
  },
);

watch(
  () => props.currentTrack,
  async (nextTrack, prevTrack) => {
    if (spectastiqEl.value) {
      if (!nextTrack && prevTrack) {
        // Deselected track
        spectastiqEl.value.pause();
        spectastiqEl.value.removePlaybackFrequencyBandPass();
        spectastiqEl.value.setGain(1);
        await spectastiqEl.value.selectRegionOfInterest(0, 1, 0, 1);
      }
    }
  },
);

const selectTrackRegionAndPlay = async (
  track: ApiTrackResponse,
  shouldZoomToRegion = true,
) => {
  if (overlayCanvasContext.value) {
    renderOverlay(overlayCanvasContext.value);

    const trackStartZeroOne = Math.max(0, track.start / audioDuration.value);
    const trackEndZeroOne = Math.min(1, track.end / audioDuration.value);
    if (spectastiqEl.value && track.hasOwnProperty("maxFreq")) {
      const minFreqZeroOne =
        Math.max(0, track.minFreq || 0) / audioSampleRate.value;
      const maxFreqZeroOne =
        Math.min(
          track.maxFreq || audioSampleRate.value,
          audioSampleRate.value,
        ) / audioSampleRate.value;
      if (shouldZoomToRegion) {
        await spectastiqEl.value.selectRegionOfInterest(
          trackStartZeroOne,
          trackEndZeroOne,
          minFreqZeroOne,
          maxFreqZeroOne,
        );

        const newGain = spectastiqEl.value.getGainForRegionOfInterest(trackStartZeroOne, trackEndZeroOne, minFreqZeroOne, maxFreqZeroOne);
        spectastiqEl.value.setGain(newGain);
      }
      currentTime.value = trackStartZeroOne;
      spectastiqEl.value.setPlaybackFrequencyBandPass(
        minFreqZeroOne * audioSampleRate.value,
        maxFreqZeroOne * audioSampleRate.value,
      );
      await spectastiqEl.value.play(trackStartZeroOne, trackEndZeroOne);
    }
  }
};

watch(() => props.recordingId, loadRecording);

const overlayCanvasContext = ref<CanvasRenderingContext2D>();
let selectedTrackFeature: string | null = null;
let hoveredTrackFeature: string | null = null;
let grabOffsetX = 0;
let grabOffsetY = 0;
let resizeStartX = 0;
let resizeStartY = 0;
const hitTestRegionFeatures = () => {
  if (overlayCanvasContext.value) {
    if (
      !(
        inRegionResizeMode.value &&
        pointerPositionX >= 0 &&
        pointerPositionY >= 0 &&
        pointerPositionX <= overlayCanvasContext.value.canvas.width &&
        pointerPositionY <= overlayCanvasContext.value.canvas.height
      )
    ) {
      return null;
    }
    // Check distance from each corner of the currently selected track
    if (props.currentTrack) {
      const track = tracksIntermediate.value.find(
        (track) => track.id === props.currentTrack!.id,
      );
      if (!track) {
        return null;
      }
      const rangeBegin = selectionRangeStartZeroOne.value;
      const rangeEnd = selectionRangeEndZeroOne.value;
      const cWidth = overlayCanvasContext.value.canvas.width;
      const cHeight = overlayCanvasContext.value.canvas.height;

      const { start, end, minFreq, maxFreq } = track.mutated
        ? track.mutated
        : track;

      const minFreqZeroOne =
        1 - Math.max(0, minFreq || 0) / audioSampleRate.value;
      const maxFreqZeroOne =
        1 -
        Math.min(maxFreq || 0, audioSampleRate.value) / audioSampleRate.value;
      const trackStartZeroOne = Math.max(0, start / audioDuration.value);
      const trackEndZeroOne = Math.min(1, end / audioDuration.value);
      const bounds = getTrackBounds(cWidth, cHeight, rangeBegin, rangeEnd, [
        trackStartZeroOne,
        maxFreqZeroOne,
        trackEndZeroOne,
        minFreqZeroOne,
      ]);

      const handleSize = 44 * devicePixelRatio;
      const handleRadius = handleSize / 2;
      const [left, top, right, bottom] = bounds;
      let bestDistance = Number.MAX_SAFE_INTEGER;
      selectedTrackFeature = null;
      grabOffsetX = 0;
      grabOffsetY = 0;
      resizeStartX = 0;
      resizeStartY = 0;
      for (const corner of [
        [left, top, "top-left"],
        [right, top, "top-right"],
        [right, bottom, "bottom-right"],
        [left, bottom, "bottom-left"],
      ] as [number, number, string][]) {
        const [x, y, whichCorner] = corner;
        const dX = pointerPositionX - x / devicePixelRatio;
        const dY = pointerPositionY - y / devicePixelRatio;

        const distance = Math.sqrt(dX * dX + dY * dY);
        if (distance <= handleRadius) {
          if (distance < bestDistance) {
            selectedTrackFeature = whichCorner;
            grabOffsetX = dX;
            grabOffsetY = dY;
            resizeStartX = x;
            resizeStartY = y;
            bestDistance = distance;
          }
        }
      }
      if (selectedTrackFeature === null) {
        // Check if we're in the padded version of the box.
        const paddedBounds = padDims(bounds, handleSize / 2, handleSize / 2);
        const left = paddedBounds[0] / devicePixelRatio;
        const top = paddedBounds[1] / devicePixelRatio;
        const right = paddedBounds[2] / devicePixelRatio;
        const bottom = paddedBounds[3] / devicePixelRatio;
        if (
          pointIsInExactBox(pointerPositionX, pointerPositionY, [
            left,
            top,
            right,
            bottom,
          ])
        ) {
          grabOffsetX = pointerPositionX - bounds[0] / devicePixelRatio;
          grabOffsetY = pointerPositionY - bounds[1] / devicePixelRatio;
          selectedTrackFeature = "whole-track";
        }
      }
      if (selectedTrackFeature !== null) {
        return selectedTrackFeature;
      }
    }
  }
  return null;
};

const doResize = () => {
  if (currentTrack.value && overlayCanvasContext.value && spectastiqEl.value) {
    // Work out what the new track bounds are and re-render
    const track = currentTrack.value;
    // Update mutatedStart, mutatedEnd, mutatedMinFreq, mutatedMaxFreq
    if (!track.mutated) {
      track.mutated = {
        start: track.start,
        end: track.end,
        minFreq: track.minFreq,
        maxFreq: track.maxFreq,
      };
    }

    const begin = selectionRangeStartZeroOne.value;
    const end = selectionRangeEndZeroOne.value;
    const cHeight = overlayCanvasContext.value.canvas.height;
    const cWidth = overlayCanvasContext.value.canvas.width;
    const width = cWidth / devicePixelRatio;
    const height = cHeight / devicePixelRatio;
    const newX = pointerPositionX - grabOffsetX;
    const newY = pointerPositionY - grabOffsetY;
    const offsetX = Math.min(1, Math.max(0, newX / width));
    const offsetY = Math.min(1, Math.max(0, newY / height));
    const minFreqDeltaHz = 1000;
    const minTrackLengthSeconds = 1;
    const xZeroOne = begin + offsetX * (end - begin);
    if (
      selectedTrackFeature === "top-left" ||
      selectedTrackFeature === "bottom-left"
    ) {
      track.mutated.start = Math.min(
        xZeroOne * audioDuration.value,
        track.mutated.end - minTrackLengthSeconds,
      );
    } else if (
      selectedTrackFeature === "top-right" ||
      selectedTrackFeature === "bottom-right"
    ) {
      track.mutated.end = Math.max(
        track.mutated.start + minTrackLengthSeconds,
        xZeroOne * audioDuration.value,
      );
    }
    if (
      selectedTrackFeature === "top-left" ||
      selectedTrackFeature === "top-right"
    ) {
      track.mutated.maxFreq = Math.max(
        spectastiqEl.value.inverseTransformY(offsetY) * audioSampleRate.value,
        track.mutated.minFreq + minFreqDeltaHz,
      );
    } else if (
      selectedTrackFeature === "bottom-left" ||
      selectedTrackFeature === "bottom-right"
    ) {
      track.mutated.minFreq = Math.min(
        track.mutated.maxFreq - minFreqDeltaHz,
        spectastiqEl.value.inverseTransformY(offsetY) * audioSampleRate.value,
      );
    }
    if (selectedTrackFeature === "whole-track") {
      // Move the whole track around as long as its dimensions can stay the same.

      const newX = pointerPositionX - grabOffsetX;
      const newY = pointerPositionY - grabOffsetY;
      const offsetXLeft = newX / width;
      const offsetYTop = newY / height;

      const yZeroOne =
        spectastiqEl.value.inverseTransformY(offsetYTop) *
        audioSampleRate.value;
      const xZeroOne = begin + offsetXLeft * (end - begin);
      const trackWidth = track.end - track.start;
      track.mutated.start = Math.min(
        Math.max(0, xZeroOne * audioDuration.value),
        audioDuration.value - trackWidth,
      );

      track.mutated.end = Math.min(
        track.mutated.start + (track.end - track.start),
        audioDuration.value,
      );

      track.mutated.maxFreq = Math.min(
        Math.max(0, yZeroOne),
        audioSampleRate.value,
      );

      const deltaFreq = track.maxFreq - track.minFreq;
      track.mutated.minFreq = Math.min(
        Math.max(0, track.mutated.maxFreq - deltaFreq),
        audioSampleRate.value - deltaFreq,
      );
      track.mutated.maxFreq = track.mutated.minFreq + deltaFreq;
    }
    {
      const minFreqZeroOne =
        Math.max(0, track.mutated.minFreq || 0) / audioSampleRate.value;
      const maxFreqZeroOne =
        Math.min(
          track.mutated.maxFreq || audioSampleRate.value,
          audioSampleRate.value,
        ) / audioSampleRate.value;
      spectastiqEl.value.setPlaybackFrequencyBandPass(
        minFreqZeroOne * audioSampleRate.value,
        maxFreqZeroOne * audioSampleRate.value,
      );
    }
    if (overlayCanvasContext.value) {
      renderOverlay(overlayCanvasContext.value);
    }
  }
};

const initInteractionHandlers = (context: CanvasRenderingContext2D) => {
  const spectastiq = spectastiqEl.value as Spectastiq;
  spectastiq.addEventListener("custom-interaction-start", (e) => {
    pointerPositionX = e.detail.offsetX;
    pointerPositionY = e.detail.offsetY;
    if (inRegionResizeMode.value) {
      selectedTrackFeature = hitTestRegionFeatures();
      if (selectedTrackFeature !== null) {
        spectastiq.beginCustomInteraction();
      }
    } else if (inRegionCreationMode.value) {
      regionCreationStartX = pointerPositionX;
      regionCreationStartY = pointerPositionY;
      spectastiq.beginCustomInteraction();
    }
  });
  spectastiq.addEventListener("custom-interaction-move", (e) => {
    pointerPositionX = e.detail.offsetX;
    pointerPositionY = e.detail.offsetY;
    if (inRegionResizeMode.value) {
      doResize();
    } else if (inRegionCreationMode.value) {
      overlayCanvasContext.value && renderOverlay(overlayCanvasContext.value);
    }
  });
  spectastiq.addEventListener("custom-interaction-end", async (e) => {
    pointerPositionX = e.detail.offsetX;
    pointerPositionY = e.detail.offsetY;
    if (inRegionResizeMode.value) {
      // Copy mutated track back
      if (currentTrack.value) {
        const track = currentTrack.value;
        if (track.mutated) {
          track.start = track.mutated.start;
          track.end = track.mutated.end;
          track.minFreq = track.mutated.minFreq;
          track.maxFreq = track.mutated.maxFreq;
          delete track.mutated;
          if (spectastiqEl.value) {
            // Set gain for new track
            const trackStartZeroOne = track.start / audioDuration.value;
            const trackEndZeroOne = track.end / audioDuration.value;
            const minFreqZeroOne =
              Math.max(0, track.minFreq || 0) / audioSampleRate.value;
            const maxFreqZeroOne =
              Math.min(
                track.maxFreq || audioSampleRate.value,
                audioSampleRate.value,
              ) / audioSampleRate.value;
            const newGain = spectastiqEl.value.getGainForRegionOfInterest(trackStartZeroOne, trackEndZeroOne, minFreqZeroOne, maxFreqZeroOne);
            spectastiqEl.value.setGain(newGain);
          }
        }

      }
      spectastiq.endCustomInteraction();
    } else if (inRegionCreationMode.value && overlayCanvasContext.value) {
      regionCreationEndX = pointerPositionX;
      regionCreationEndY = pointerPositionY;
      spectastiq.endCustomInteraction();

      const left = Math.min(regionCreationEndX, regionCreationStartX);
      const right = Math.max(regionCreationEndX, regionCreationStartX);
      const top = Math.min(regionCreationEndY, regionCreationStartY);
      const bottom = Math.max(regionCreationEndY, regionCreationStartY);
      const width = overlayCanvasContext.value.canvas.width;
      const height = overlayCanvasContext.value.canvas.height;

      const beginRange = selectionRangeStartZeroOne.value;
      const endRange = selectionRangeEndZeroOne.value;
      const range = endRange - beginRange;
      const startZeroOne =
        beginRange + Math.max(0, left / (width / devicePixelRatio)) * range;
      const endZeroOne =
        beginRange + Math.min(1, right / (width / devicePixelRatio)) * range;

      const start = startZeroOne * audioDuration.value;
      const end = endZeroOne * audioDuration.value;
      const bottomZeroOne = Math.max(0, bottom / (height / devicePixelRatio));
      const topZeroOne = Math.min(1, top / (height / devicePixelRatio));
      const minFreqHz =
        spectastiq.inverseTransformY(bottomZeroOne) * audioSampleRate.value;
      const maxFreqHz =
        spectastiq.inverseTransformY(topZeroOne) * audioSampleRate.value;
      // If the box is too small, don't create a region
      if (end - start < 0.01 || maxFreqHz - minFreqHz < 1) {
        inRegionCreationMode.value = false;
        return;
      }

      setTimeout(() => {
        showClassificationSelector.value = true;
      }, 200);
      pendingTrack.value = {
        id: -1,
        start,
        end,
        minFreq: minFreqHz,
        maxFreq: maxFreqHz,
        automatic: false,
        tags: [{ what: "unnamed", confidence: 0.5, id: -1 } as any],
      } as any;

      emit("track-tag-changed", {
        track: pendingTrack.value,
        tag: "unnamed",
        action: "add",
      } as any);
      // FIXME: Delete pendingTrack once created.
      await selectTrackRegionAndPlay(pendingTrack.value as any, false);
      spectastiq.exitCustomInteractionMode();
      if (spectastiqEl.value) {
        spectastiqEl.value.style.cursor = "auto";
      }
    }
  });
  spectastiq.addEventListener(
    "select",
    ({ detail: { offsetX: x, offsetY: y } }) => {
      if (inRegionResizeMode.value) {
        return;
      }
      // Check to see if we're intersecting any of our boxes.
      const begin = selectionRangeStartZeroOne.value;
      const end = selectionRangeEndZeroOne.value;
      const cropScaleY = audioSampleRate.value;
      const duration = audioDuration.value;
      let bestD = Number.MAX_SAFE_INTEGER;
      let hitTrack;
      for (const track of tracksIntermediate.value) {
        const trackStart = track.start / duration;
        const trackEnd = track.end / duration;
        const minFreq = 1 - Math.max(0, track.minFreq || 0) / cropScaleY;
        const maxFreq =
          1 - Math.min(track.maxFreq || 0, cropScaleY) / cropScaleY;

        const hitBox = getTrackBounds(
          context.canvas.width / devicePixelRatio,
          context.canvas.height / devicePixelRatio,
          begin,
          end,
          [trackStart, maxFreq, trackEnd, minFreq],
        );

        const d = pointIsInPaddedBox(x, y, hitBox);
        if (d !== false && d < bestD && track !== currentTrack.value) {
          bestD = d;
          hitTrack = track;
        }
      }
      if (hitTrack) {
        emit("track-selected", { trackId: hitTrack.id, automatically: false });
      } else {
        emit("track-deselected");
      }
    },
  );

  spectastiq.addEventListener("move", (e) => {
    const x = e.detail.offsetX;
    const y = e.detail.offsetY;
    const container = e.detail.container;
    const begin = selectionRangeStartZeroOne.value;
    const end = selectionRangeEndZeroOne.value;
    const cropScaleY = audioSampleRate.value;
    let hit = false;
    for (const track of tracksIntermediate.value) {
      const trackStart = track.start / audioDuration.value;
      const trackEnd = track.end / audioDuration.value;
      if (track.minFreq === undefined || track.maxFreq === undefined) {
        alert("This track has no valid frequency range, so it can't be used.");
        console.warn("track", track);
      }
      const minFreq = 1 - Math.max(0, track.minFreq || 0) / cropScaleY;
      const maxFreq = 1 - Math.min(track.maxFreq || 0, cropScaleY) / cropScaleY;
      const hitBox = getTrackBounds(
        context.canvas.width / devicePixelRatio,
        context.canvas.height / devicePixelRatio,
        begin,
        end,
        [trackStart, maxFreq, trackEnd, minFreq],
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

    if (inRegionResizeMode.value) {
      pointerPositionX = e.detail.offsetX;
      pointerPositionY = e.detail.offsetY;
      const container = spectastiqEl.value;
      if (container) {
        const prevFeature = hoveredTrackFeature;
        hoveredTrackFeature = hitTestRegionFeatures();
        if (hoveredTrackFeature !== null) {
          if (hoveredTrackFeature === "whole-track") {
            container.style.cursor = "move";
          } else if (hoveredTrackFeature === "top-left") {
            container.style.cursor = "nw-resize";
          } else if (hoveredTrackFeature === "top-right") {
            container.style.cursor = "ne-resize";
          } else if (hoveredTrackFeature === "bottom-left") {
            container.style.cursor = "sw-resize";
          } else if (hoveredTrackFeature === "bottom-right") {
            container.style.cursor = "se-resize";
          }
        } else {
          container.style.cursor = "auto";
        }
        if (hoveredTrackFeature !== prevFeature) {
          if (overlayCanvasContext.value) {
            renderOverlay(overlayCanvasContext.value);
          }
        }
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
): Rectangle => {
  return [
    dims[0] - paddingX,
    dims[1] - paddingY,
    dims[2] + paddingX,
    dims[3] + paddingY,
  ];
};

const drawRectWithText = (
  context: CanvasRenderingContext2D,
  trackId: number,
  dims: Rectangle,
  what: string | null,
  tracks: IntermediateTrack[] | ApiTrackResponse[] = [],
  currentTrack: IntermediateTrack | null,
  pixelRatio: number,
) => {
  context.save();
  const hasSelected = currentTrack !== null;
  const selected = hasSelected && currentTrack.id === trackId && trackId !== -1;
  const drawResizeHandles = selected && inRegionResizeMode.value;
  const trackIndex = tracks.findIndex((track) => track.id === trackId) || 0;
  const lineWidth = (selected ? 2 : 1) * pixelRatio;
  const outlineWidth = lineWidth + 2 * pixelRatio;
  const deviceRatio = pixelRatio;
  const [left, top, right, bottom] = dims;
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
  const strokeStyle = `rgba(${r}, ${g}, ${b}, ${
    selected ? 1.0 : hasSelected ? 0.5 : 1.0
  })`;
  context.strokeStyle = strokeStyle;
  context.lineWidth = lineWidth;
  context.beginPath();
  context.strokeRect(x, y, width, height);
  if (
    selected &&
    (left > 0 || right > 0) &&
    (left < context.canvas.width || right < context.canvas.width)
  ) {
    if (what !== null) {
      const text = displayLabelForClassificationLabel(what, false, true);
      const textHeight = 9 * deviceRatio;
      const marginX = 3 * deviceRatio;
      const marginTop = 3 * deviceRatio;
      let textX = x;
      let textY = bottom + marginTop;
      // Make sure the text doesn't get clipped off if the box is near the frame edges
      if (bottom + textHeight + marginTop * 2 < context.canvas.height) {
        textY = bottom + marginTop;
      } else if (y - (textHeight + marginTop) > 0) {
        textY = top - (textHeight + marginTop * 2);
      } else if (textY + textHeight > context.canvas.height) {
        textY = top + marginTop * 4;
        textX += 4 * deviceRatio;
      }
      context.textBaseline = "top";
      context.font = `${13 * deviceRatio}px sans-serif`;
      context.lineWidth = 4;
      const textWidth = context.measureText(text).width;
      context.textAlign = "left";
      if (x < 0) {
        textX = marginX;
      }

      context.strokeStyle = isDarkTheme.value
        ? "rgba(0, 0, 0, 0.5)"
        : "rgba(255, 255, 255, 0.5)";
      context.strokeText(text, textX, textY);
      context.fillStyle = isDarkTheme.value ? "white" : "black";
      context.fillText(text, textX, textY);
    }

    if (drawResizeHandles) {
      for (const handle of [
        "top-left",
        "top-right",
        "bottom-left",
        "bottom-right",
      ]) {
        let x = 0;
        let y = 0;
        if (handle === "top-left" || handle === "bottom-left") {
          x = left;
        } else if (handle === "top-right" || handle === "bottom-right") {
          x = right;
        }
        if (handle === "top-left" || handle === "top-right") {
          y = top;
        } else if (handle === "bottom-left" || handle === "bottom-right") {
          y = bottom;
        }
        context.save();
        const hovered = hoveredTrackFeature === handle;
        {
          const handleSize = (hovered ? 15: 10) * deviceRatio;
          context.fillStyle = "black";
          context.beginPath();
          context.arc(x, y, handleSize / 2, 0, 2 * Math.PI);
          context.fill();
        }
        context.restore();
        context.save();
        {
          const handleSize = (hovered ? 14 : 9) * deviceRatio;
          context.fillStyle = handle === hoveredTrackFeature ? "white" : strokeStyle;
          context.beginPath();
          context.arc(x, y, handleSize / 2, 0, 2 * Math.PI);
          context.fill();
        }
        context.restore();
      }
    }
  }
  context.restore();
};

const renderOverlay = (ctx: CanvasRenderingContext2D) => {
  if (spectastiqEl.value) {
    const rangeBegin = selectionRangeStartZeroOne.value;
    const rangeEnd = selectionRangeEndZeroOne.value;
    const cHeight = ctx.canvas.height;
    const cWidth = ctx.canvas.width;
    ctx.save();
    ctx.clearRect(0, 0, cWidth, cHeight);
    if (props.recording) {
      // TODO: Can we re-implement create track in terms of a custom-interaction
      if (inRegionResizeMode.value && currentTrack.value) {
        // Draw background with cutouts
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.beginPath();
        ctx.rect(0, 0, cWidth, cHeight);
        const track = currentTrack.value;
        const { start, end, minFreq, maxFreq } = track.mutated
          ? track.mutated
          : track;

        const minFreqZeroOne =
          1 - Math.max(0, minFreq || 0) / audioSampleRate.value;
        const maxFreqZeroOne =
          1 -
          Math.min(maxFreq || 0, audioSampleRate.value) / audioSampleRate.value;
        const trackStartZeroOne = Math.max(0, start / audioDuration.value);
        const trackEndZeroOne = Math.min(1, end / audioDuration.value);
        const bounds = getTrackBounds(cWidth, cHeight, rangeBegin, rangeEnd, [
          trackStartZeroOne,
          maxFreqZeroOne,
          trackEndZeroOne,
          minFreqZeroOne,
        ]);
        const [left, top, right, bottom] = bounds;
        ctx.moveTo(left, top);
        ctx.lineTo(left, bottom);
        ctx.lineTo(right, bottom);
        ctx.lineTo(right, top);
        ctx.lineTo(left, top);

        ctx.fill();
      }
      for (const track of tracksIntermediate.value) {
        const { start, end, minFreq, maxFreq } = track.mutated
          ? track.mutated
          : track;
        const minFreqZeroOne =
          1 - Math.max(0, minFreq || 0) / audioSampleRate.value;
        const maxFreqZeroOne =
          1 -
          Math.min(maxFreq || 0, audioSampleRate.value) / audioSampleRate.value;
        const trackStartZeroOne = Math.max(0, start / audioDuration.value);
        const trackEndZeroOne = Math.min(1, end / audioDuration.value);
        const bounds = getTrackBounds(cWidth, cHeight, rangeBegin, rangeEnd, [
          trackStartZeroOne,
          maxFreqZeroOne,
          trackEndZeroOne,
          minFreqZeroOne,
        ]);
        drawRectWithText(
          ctx,
          track.id,
          bounds,
          track.what,
          tracksIntermediate.value,
          currentTrack.value,
          window.devicePixelRatio,
        );
      }
      if (inRegionCreationMode.value && !pendingTrack.value) {
        const left = Math.max(
          0,
          Math.min(pointerPositionX, regionCreationStartX),
        );
        const right = Math.max(pointerPositionX, regionCreationStartX);
        const top = Math.max(
          0,
          Math.min(pointerPositionY, regionCreationStartY),
        );
        const bottom = Math.max(pointerPositionY, regionCreationStartY);
        const x = left * devicePixelRatio;
        const y = top * devicePixelRatio;
        const width = Math.min((right - left) * devicePixelRatio, cWidth - x);
        const height = Math.min((bottom - top) * devicePixelRatio, cHeight - y);
        ctx.save();
        ctx.setLineDash([5 * devicePixelRatio, 5 * devicePixelRatio]);
        ctx.lineWidth = 1 * devicePixelRatio;
        ctx.strokeStyle = "white";
        ctx.strokeRect(x, y, width, height);
        ctx.restore();
      }
    }
    ctx.restore();
  }
};
const audioIsPlaying = ref<boolean>(false);
let shouldPlayTrackOnLoad = false;
onMounted(() => {
  let initedContextListeners = false;
  if (props.recording) {
    computeIntermediateTracks(props.recording.tracks);
  }
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
      },
    );
    spectastiq.addEventListener(
      "audio-loaded",
      ({ detail: { sampleRate, duration } }) => {
        audioSampleRate.value = sampleRate / 2;
        audioDuration.value = duration;
        audioIsPlaying.value = false;
        if (route.params.trackId) {
          shouldPlayTrackOnLoad = true;
          emit("track-selected", { trackId: Number(route.params.trackId), automatically: false });
        }
      },
    );
    spectastiq.addEventListener("playback-ended", () => {
      audioIsPlaying.value = false;
    });
    spectastiq.addEventListener("playback-started", () => {
      audioIsPlaying.value = true;
    });
    spectastiq.addEventListener(
      "playhead-update",
      ({ detail: { timeInSeconds } }) => {
        currentTime.value = timeInSeconds;
      },
    );
    spectastiq.addEventListener("double-click", async ({ detail: { audioOffsetZeroOne }}) => {
      if (currentTrack.value) {
        const currentTrackEndZeroOne = currentTrack.value.end / audioDuration.value;
        if (currentTrackEndZeroOne > audioOffsetZeroOne) {
          await spectastiq.play(audioOffsetZeroOne, currentTrackEndZeroOne);
        } else {
          await spectastiq.play(audioOffsetZeroOne);
        }
      } else {
        await spectastiq.play(audioOffsetZeroOne);
      }
    });
  }
});

const cancelTrackResizeOperation = () => {
  if (currentTrack.value && props.currentTrack) {
    currentTrack.value.start = props.currentTrack.start;
    currentTrack.value.end = props.currentTrack.end;
    currentTrack.value.minFreq = props.currentTrack.minFreq!;
    currentTrack.value.maxFreq = props.currentTrack.maxFreq!;
    delete currentTrack.value.mutated;


    if (spectastiqEl.value) {
      // Set gain and bandpass for original unchanged track.
      const trackStartZeroOne = currentTrack.value.start / audioDuration.value;
      const trackEndZeroOne = currentTrack.value.end / audioDuration.value;
      const minFreqZeroOne =
        Math.max(0, currentTrack.value.minFreq || 0) / audioSampleRate.value;
      const maxFreqZeroOne =
        Math.min(
          currentTrack.value.maxFreq || audioSampleRate.value,
          audioSampleRate.value,
        ) / audioSampleRate.value;
      const newGain = spectastiqEl.value.getGainForRegionOfInterest(trackStartZeroOne, trackEndZeroOne, minFreqZeroOne, maxFreqZeroOne);
      spectastiqEl.value.setGain(newGain);
      spectastiqEl.value.setPlaybackFrequencyBandPass(
        minFreqZeroOne * audioSampleRate.value,
        maxFreqZeroOne * audioSampleRate.value,
      );
    }
  }
  exitResizeMode();
};

const updateInProgress = ref<boolean>(false);

const confirmTrackResizeOperation = async () => {
  updateInProgress.value = true;
  if (currentTrack.value) {
    const {id, start, end, minFreq, maxFreq} = currentTrack.value;
    await updateResizedTrack(props.recordingId, id, start, end, minFreq, maxFreq);
  }
  exitResizeMode();
  updateInProgress.value = false;
};

const currentTrack = computed<null | IntermediateTrack>(() => {
  if (props.currentTrack) {
    const track = props.currentTrack;
    return tracksIntermediate.value.find((t) => t.id === track.id) || null;
  }
  return null;
});

const currentTime = ref<number>(0);
const togglePlayback = async () => {
  if (spectastiqEl.value) {
    if (!audioIsPlaying.value) {
      const currentIntermediateTrack = currentTrack.value;
      if (currentIntermediateTrack) {
        const trackStartZeroOne = currentIntermediateTrack.start / audioDuration.value;
        const trackEndZeroOne = currentIntermediateTrack.end / audioDuration.value;
        const minFreqZeroOne =
          Math.max(0, currentIntermediateTrack.minFreq || 0) / audioSampleRate.value;
        const maxFreqZeroOne =
          Math.min(
            currentIntermediateTrack.maxFreq || audioSampleRate.value,
            audioSampleRate.value,
          ) / audioSampleRate.value;

        spectastiqEl.value.setPlaybackFrequencyBandPass(
          minFreqZeroOne * audioSampleRate.value,
          maxFreqZeroOne * audioSampleRate.value,
        );
        const newGain = spectastiqEl.value.getGainForRegionOfInterest(trackStartZeroOne, trackEndZeroOne, minFreqZeroOne, maxFreqZeroOne);
        spectastiqEl.value.setGain(newGain);
        if (currentTime.value >= currentIntermediateTrack.end) {
          await spectastiqEl.value.play(
            trackStartZeroOne,
            trackEndZeroOne,
          );
        } else if (currentTime.value > currentIntermediateTrack.start) {
          // Play until the end of the current track
          await spectastiqEl.value.play(currentTime.value / audioDuration.value, trackEndZeroOne);
        } else if (shouldPlayTrackOnLoad) {
          // If there was a track initially selected from the url route.
          await spectastiqEl.value.play(
            trackStartZeroOne,
            trackEndZeroOne,
          );
          shouldPlayTrackOnLoad = false;
        } else {
          // Continue playing normally until the end of the recording
          await spectastiqEl.value.play();
        }
      } else {
        // Play from the current time
        await spectastiqEl.value.play();
      }
    } else {
      spectastiqEl.value.pause();
    }
  }
};

const currentPalette = ref<string>("Viridis");
const inRegionCreationMode = ref<boolean>(false);
const inRegionResizeMode = ref<boolean>(false);
const showClassificationSelector = ref<boolean>(false);
const selectionPopover = ref<HTMLDivElement>();

const pendingTrackClass = ref<string[]>([]);
const pendingTrack = ref<ApiTrackResponse | null>(null);
const currentUser = inject(currentUserInfo) as Ref<LoggedInUser | null>;

const cancelledCustomRegionCreation = async () => {
  inRegionCreationMode.value = false;
  selectionPopover.value?.classList.add("removed");
  if (pendingTrack.value) {
    emit("track-removed", {
      trackId: pendingTrack.value.id,
    });
  }

  setTimeout(async () => {
    showClassificationSelector.value = false;
    pendingTrackClass.value = [];
    pendingTrack.value = null;
    if (spectastiqEl.value) {
      spectastiqEl.value.pause();
      spectastiqEl.value.removePlaybackFrequencyBandPass();
    }
  }, 300);
};

watch(pendingTrackClass, async (classification: string[]) => {
  if (
    props.recording &&
    showClassificationSelector.value &&
    classification.length &&
    pendingTrack.value
  ) {
    selectionPopover.value?.classList.add("removed");
    setTimeout(() => {
      showClassificationSelector.value = false;
    }, 300);
    // Patch the pending track
    pendingTrack.value.tags[0].what = classification[0];
    pendingTrack.value.tags[0].automatic = false;
    const tagToReplace = {
      ...pendingTrack.value.tags[0],
    };
    pendingTrack.value.tags[0].createdAt = new Date().toISOString();
    pendingTrack.value.tags[0].userId = currentUser.value?.id;
    pendingTrack.value.tags[0].userName = currentUser.value?.userName;

    let willDeleteRecording = false;
    if (classification[0] === "human" && currentProject.value && currentProject.value.settings?.filterHuman) {
      willDeleteRecording = confirm("Your project has been configured to delete recordings containing human speech. Do you want to delete this recording?");
      if (willDeleteRecording) {
        emit("delete-recording");
      }
    }
    if (!willDeleteRecording) {
      emit("track-tag-changed", {
        track: pendingTrack.value as ApiTrackResponse,
        tag: classification[0] || "",
        action: "add",
        userId: currentUser.value?.id,
      });

      const payload = {
        start_s: pendingTrack.value.start,
        end_s: pendingTrack.value.end,
        minFreq: pendingTrack.value.minFreq,
        maxFreq: pendingTrack.value.maxFreq,
        automatic: false,
      };

      const response = await createUserDefinedTrack(props.recording, payload);
      if (response.success) {
        emit("track-selected", {
          trackId: response.result.trackId,
          automatically: false,
        });

        emit("track-tag-changed", {
          track: pendingTrack.value,
          tag: classification[0],
          action: "add",
          newId: response.result.trackId,
          userId: currentUser.value?.id,
        });

        await replaceTrackTag(
            tagToReplace,
            props.recording.id,
            response.result.trackId,
        );
        pendingTrackClass.value = [];
        pendingTrack.value = null;
        inRegionCreationMode.value = false;
      }
      // Then select newly created tag
    }
  }
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

const incrementPalette = () => {
  if (spectastiqEl.value) {
    currentPalette.value = spectastiqEl.value.nextPalette();
    localStorage.setItem("spectastiq-palette", currentPalette.value);
  }
};

const toggleRegionCreationMode = () => {
  if (spectastiqEl.value) {
    inRegionCreationMode.value = !inRegionCreationMode.value;
    if (inRegionCreationMode.value) {
      spectastiqEl.value.style.cursor = "crosshair";
      spectastiqEl.value.enterCustomInteractionMode();
    } else {
      spectastiqEl.value.style.cursor = "auto";
      spectastiqEl.value.exitCustomInteractionMode();
    }
  }
};

const isDarkTheme = computed<boolean>(() => {
  return currentPalette.value !== "Grayscale";
});

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

const loadDateTime = ref<Date>(new Date());
const getAuthoritativeTagForTrack = (
  trackTags: ApiTrackTagResponse[],
): [string, boolean, boolean] | null => {
  const userTags = trackTags.filter((tag) => !tag.automatic);
  if (userTags.length) {
    return [
      userTags[0].what,
      false,
      !!userTags[0].createdAt &&
        new Date(userTags[0].createdAt) > loadDateTime.value,
    ] as [string, boolean, boolean];
  } else {
    // NOTE: For audio, there can be multiple authoritative tags for a single track, until a user confirms one.
    const masterTag = trackTags.find((tag) => tag.model === "Master");
    if (masterTag) {
      return [masterTag.what, true, false];
    }
  }
  return null;
};

const currentProject = inject(currentActiveProject) as ComputedRef<
  SelectedProject | false
>;
const userProjectSettings = computed<ApiProjectUserSettings>(() => {
  return (
    (currentProject.value as SelectedProject).userSettings || {
      displayMode: "recordings",
      tags: [],
      notificationPreferences: {},
      showFalseTriggers: false,
    }
  );
});

watch(userProjectSettings, (next, prev) => {
  if (next.showFalseTriggers !== prev.showFalseTriggers && props.recording) {
    computeIntermediateTracks(props.recording.tracks);
  }
});

interface IntermediateTrack {
  what: string | null;
  user: boolean;
  start: number;
  end: number;
  maxFreq: number;
  minFreq: number;
  mutated?: {
    start: number;
    end: number;
    minFreq: number;
    maxFreq: number;
  };
  id: TrackId;
}

const masterTag = (tags: ApiTrackTagResponse[]) => {
  let tag;
  const userTags = tags.filter((tag) => !tag.automatic);
  if (userTags.length) {
    tag = userTags[0];
  } else {
    // If there are multiple AI master tags, as there seem to be for audio, find the most specific one.
    const masterTags = tags.filter(
      (tag) => tag.automatic && tag.model === "Master",
    );

    if (masterTags.length === 1) {
      tag = masterTags[0];
    } else {
      // Find the best/most specific tag.
      const isNoise = (tag: ApiTrackTagResponse) =>
        tag.what === "noise" || tag.what === "false-positive";
      const nonNoiseMasters = masterTags.filter((tag) => !isNoise(tag));
      if (nonNoiseMasters.length === 1) {
        tag = nonNoiseMasters[0];
      } else {
        let mostSpecific = null;
        for (const tag of nonNoiseMasters) {
          if (mostSpecific === null) {
            mostSpecific = tag;
          } else if (
            mostSpecific &&
            tag.path.length > mostSpecific.path.length &&
            tag.path.startsWith(mostSpecific.path)
          ) {
            mostSpecific = tag;
          } else if (
            mostSpecific &&
            !mostSpecific.path.startsWith("all.bird") &&
            tag.path.startsWith("all.bird")
          ) {
            mostSpecific = tag;
          }
        }
        tag = mostSpecific;
      }
    }
  }
  if (tag) {
    const mappedWhat = getClassificationForLabel(tag.what);
    return {
      ...tag,
      what: mappedWhat ? mappedWhat.label : tag.what,
    } as ApiAutomaticTrackTagResponse;
  }
  return null;
};

const tracksIntermediate = ref<IntermediateTrack[]>([]);
const computeIntermediateTracks = (tracks: ApiTrackResponse[]) => {
  const intermediateTracks: (IntermediateTrack & {
    justTaggedFalseTrigger?: boolean;
  })[] = [];
  if (props.recording) {
    for (const track of tracks) {
      const { start, end, minFreq, maxFreq, tags, id } = track;
      const authTag = masterTag(tags);
      if (authTag !== null) {
        const tag = getAuthoritativeTagForTrack([authTag]);
        let justCreatedTag = false;
        if (tag) {
          justCreatedTag = !tag[1] && tag[2];
        }
        if (tag !== null) {
          let justTaggedFalseTrigger = false;
          const what = tag[0];
          if ((what === "false-positive" || what === "noise") && tag[2]) {
            justTaggedFalseTrigger = true;
          }
          intermediateTracks.push({
            what,
            minFreq: minFreq || 0,
            maxFreq: maxFreq || 0,
            start,
            end,
            justTaggedFalseTrigger,
            id,
            user: justCreatedTag,
          });
        }
      }
    }
  }
  tracksIntermediate.value = intermediateTracks
    .filter(
      (track) =>
        userProjectSettings.value.showFalseTriggers ||
        (!userProjectSettings.value.showFalseTriggers &&
          ((track.what !== "noise" && track.what !== "false-positive") ||
            track.justTaggedFalseTrigger)),
    )
    .map((track) => {
      const t = { ...track };
      delete t["justTaggedFalseTrigger"];
      return t as IntermediateTrack;
    });
};
const route = useRoute();

const watchTracks = ref<WatchStopHandle | null>(null);

watch(
  () => props.recording,
  (nextRecording) => {
    if (nextRecording) {
      if (watchTracks.value) {
        watchTracks.value();
        watchTracks.value = null;
      }
      watchTracks.value = watch(
        () => nextRecording.tracks,
        (nextTracks) => {
          computeIntermediateTracks(nextTracks);
        },
        { deep: true },
      );
      computeIntermediateTracks(nextRecording.tracks);
    } else {
      if (watchTracks.value) {
        watchTracks.value();
        watchTracks.value = null;
      }
    }
  },
);

watch(tracksIntermediate, (next, prev) => {
  if (overlayCanvasContext.value) {
    renderOverlay(overlayCanvasContext.value);
  }
  const pendingTrack = prev.find((track) => track.id === -1);
  if (
    next &&
    prev &&
    !!pendingTrack &&
    !next.some((track) => track.id === -1)
  ) {
    // Added new track
    inRegionCreationMode.value = false;
    const changedTrack = next.find(
      (track) =>
        track.start === pendingTrack.start && track.end === pendingTrack.end,
    );
    if (changedTrack) {
      selectTrackRegionAndPlay(changedTrack as unknown as ApiTrackResponse);
    }
  }
});

const { height: viewportHeight } = useWindowSize();

const height = computed<number>(() => {
  return Math.max(250, Math.min(360, viewportHeight.value - 600));
});

const resizeCurrentlySelectedTrack = () => {
  if (spectastiqEl.value) {
    inRegionResizeMode.value = true;
    spectastiqEl.value.enterCustomInteractionMode();
    if (overlayCanvasContext.value) {
      renderOverlay(overlayCanvasContext.value);
    }
  }
};
const exitResizeMode = () => {
  inRegionResizeMode.value = false;
  spectastiqEl.value && spectastiqEl.value.exitCustomInteractionMode();
  if (overlayCanvasContext.value) {
    renderOverlay(overlayCanvasContext.value);
  }
};

const hasSelectedTrack = computed<boolean>(() => {
  return !!props.currentTrack;
});


const desktop = useMediaQuery("(min-width: 1040px)");
const isMobileView = computed<boolean>(() => {
  return !desktop.value;
});
</script>
<template>
  <div class="spectrogram" ref="spectrogramContainer">
    <spectastiq-viewer
      id="spectastiq"
      :request-headers="audioRequestHeaders"
      :src="audioUrl"
      ref="spectastiqEl"
      :color-scheme="currentPalette"
      :height="height"
      frequency-scale
      delegate-double-click
    >
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
          <div class="vertical-divider"></div>
          <div class="ps-3 align-items-end">
            {{ formatTime(currentTime) }} / {{ formatTime(audioDuration) }}
          </div>
        </div>
        <div class="d-flex align-items-center">
          <div v-if="!inRegionResizeMode" class="d-flex align-items-center">
            <div class="pe-3 align-items-end">
              <button
                @click.prevent="toggleRegionCreationMode"
                ref="regionCreationMode"
                :disabled="pendingTrack !== null"
                data-tooltip="Create new region"
              >
                <font-awesome-icon
                  :icon="[inRegionCreationMode ? 'fas' : 'far', 'square-plus']"
                />
                <span class="ms-2">add<span v-if="!isMobileView"> track</span></span>
              </button>
            </div>
            <div class="pe-3 align-items-end">
              <button
                class="ms-2"
                @click.prevent="resizeCurrentlySelectedTrack"
                ref="trackResizeMode"
                :disabled="!hasSelectedTrack || inRegionCreationMode"
                data-tooltip="Resize track"
              >
                <font-awesome-icon icon="expand" />
                <span class="ms-2">resize</span>
              </button>
            </div>
          </div>
          <div v-else class="d-flex align-items-center">
            <div class="pe-3 align-items-end">
              <button
                class="ms-2"
                @click.prevent="confirmTrackResizeOperation"
                ref="trackResizeModeSave"
                :disabled="!hasSelectedTrack || updateInProgress"
                data-tooltip="Save track changes"
              >
                <font-awesome-icon icon="check" />
                <span class="ms-2">save</span>
              </button>
            </div>
            <div class="pe-3 align-items-end">
              <button
                class="ms-2"
                @click.prevent="cancelTrackResizeOperation"
                ref="trackResizeModeCancel"
                :disabled="!hasSelectedTrack || updateInProgress"
                data-tooltip="Cancel track resizing"
              >
                <font-awesome-icon icon="xmark" />
                <span class="ms-2">cancel</span>
              </button>
            </div>
          </div>
          <div class="vertical-divider"></div>
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
    <div
      class="class-selection-popover"
      v-if="showClassificationSelector"
      ref="selectionPopover"
    >
      <hierarchical-tag-select
        @deselected="cancelledCustomRegionCreation"
        v-model="pendingTrackClass"
      ></hierarchical-tag-select>
    </div>
  </div>
</template>
<style lang="less">
.class-selection-popover {
  position: absolute;
  width: 300px;
  background: #333;
  padding: 12px;
  border-radius: 5px;
  top: 20px;
  left: calc(50% - 150px);
  z-index: 1000;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
  animation: add-animate-in 0.2s ease-in-out;
  &.removed {
    animation: remove-animate-out 0.2s ease-in-out forwards;
  }
}

@keyframes add-animate-in {
  from {
    transform: scale(0);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes remove-animate-out {
  from {
    transform: translateY(0px);
    opacity: 1;
  }
  to {
    transform: translateY(-200px);
    opacity: 0;
  }
}

.spectrogram {
  // 360px for spectrogram only
  //min-height: 404px;
  position: relative;
  background: #2b333f;
  overflow: hidden;
}
.vertical-divider {
  border-left: 2px solid rgba(255, 255, 255, 0.5);
  height: 24px;
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
