<script setup lang="ts">
import TracksScrubber from "@/components/TracksScrubber.vue";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import { computed, onMounted, ref, watch } from "vue";
import type { Ref } from "vue";
import type {
  CptvFrame,
  CptvFrameHeader,
  CptvHeader,
} from "./cptv-decoder/decoder";
import {
  ColourMaps,
  formatHeaderInfo,
  renderFrameIntoFrameBuffer,
} from "./cptv-decoder/frameRenderUtils";
import { useDevicePixelRatio, useElementSize } from "@vueuse/core";
import type { ApiTrackTagResponse } from "@typedefs/api/trackTag";
import type { ApiTrackPosition, ApiTrackResponse } from "@typedefs/api/track";
import { CptvDecoder } from "./cptv-decoder/decoder";
import type { RecordingId, TrackId } from "@typedefs/api/common";
import { Mp4Encoder } from "@/components/cptv-player/mp4-export";
import type {
  FrameNum,
  IntermediateTrack,
  Rectangle,
  TrackBox,
  TrackExportOption,
} from "@/components/cptv-player/cptv-player-types";
import {
  accumulateMinMaxForFrame,
  minMaxForFrame,
  minMaxForTrack,
  resetRecordingNormalisation,
} from "@/components/cptv-player/frame-normalisation";
import {
  clearOverlay,
  drawBottomLeftOverlayLabel,
  drawBottomRightOverlayLabel,
  renderOverlay,
} from "@/components/cptv-player/overlay-canvas";
import { rectanglesIntersect } from "@/components/cptv-player/track-merging";
import { motionPathForTrack } from "@/components/cptv-player/motion-paths";
import type { MotionPath } from "@/components/cptv-player/motion-paths";
import { CurrentUserCreds } from "@models/LoggedInUser";
import { maybeRefreshStaleCredentials } from "@api/fetch";
import { delayMs } from "@/utils";
import { displayLabelForClassificationLabel } from "@api/Classifications";

const { pixelRatio } = useDevicePixelRatio();
const {
  recording,
  recordingId,
  cptvSize = null,
  currentTrack,
  userSelectedTrack,
  canSelectTracks = true,
  exportRequested,
  hasNext = false,
  hasPrev = false,
  displayHeaderInfo = false,
} = defineProps<{
  recording: ApiRecordingResponse | null;
  recordingId: RecordingId;
  cptvSize?: number | null;
  currentTrack?: ApiTrackResponse;
  userSelectedTrack?: ApiTrackResponse;
  canSelectTracks?: boolean;
  hasNext?: boolean;
  hasPrev?: boolean;
  displayHeaderInfo?: boolean;
  exportRequested?: boolean | "advanced";
}>();
const PlaybackSpeeds = Object.freeze([0.5, 1, 2, 4, 6]);

let frames: CptvFrame[] = [];
const backgroundFrame = ref<CptvFrame | null>(null);
let frameBuffer: Uint8ClampedArray;
let cptvDecoder: CptvDecoder;

// TODO: Bind left and right keyboard keys to prev/back
// TODO: Check http://localhost:5173/onawe-field-trip-2022/visit/unknown/1350085/tracks
// - Unknown vs unidentified?
// TODO: Tracks - use classifications.json to manage labeling.
// TODO: Make sure when we log in, we restore the last used group.
// TODO: If we're logging in for the first time, prefer the group with the most recent activity?
// TODO: Fix nextUrl redirection on sign-in

watch(pixelRatio, () => {
  animationTick.value = 0;
  setOverlayCanvasDimensions();

  // If the pixel ratio changed, we might also be on a monitor with a different refresh rate now.
  polledFps.value = false;
  while (frameTimes.length) {
    frameTimes.pop();
  }
  pollFrameTimes();
});

const exportProgressZeroOne = ref<number>(0);
const exportProgress = computed<number>(
  () => exportProgressZeroOne.value * 100
);
watch(
  () => exportRequested,
  async (nextVal) => {
    if (nextVal) {
      if (nextVal === true) {
        await exportMp4();
      } else if (nextVal === "advanced") {
        // Wait for user input
      }
    }
  }
);

const playbackTimeChanged = (offset: number) => {
  setTimeAndRedraw({ timeZeroOne: offset });
};

const playbackTimeZeroOne = computed<number>(() => {
  const fractionalFrame =
    (1 / (totalPlayableFrames.value - 1) / ticksBetweenDraws.value) *
    animationTick.value;
  return Math.max(
    0,
    Math.min(
      1,
      targetFrameNum.value / (totalPlayableFrames.value - 1) + fractionalFrame
    )
  );
});

const emit = defineEmits<{
  (e: "request-prev-recording"): void;
  (e: "request-next-recording"): void;
  (
    e: "track-selected",
    { trackId, automatically }: { trackId: TrackId; automatically: boolean }
  ): void;
  (e: "ready-to-play", header: CptvHeader): void;
  (e: "export-completed"): void;
  (e: "request-header-info-display"): void;
  (e: "dismiss-header-info"): void;
}>();

// HTML refs
const canvas = ref<HTMLCanvasElement | null>(null);
const { width: canvasWidth, height: canvasHeight } = useElementSize(canvas);

watch(canvasWidth, () => {
  animationTick.value = 0;
  setOverlayCanvasDimensions();
});

watch(
  () => userSelectedTrack,
  async (nextTrack, prevTrack) => {
    if (nextTrack) {
      if (
        !prevTrack ||
        (prevTrack &&
          (nextTrack as ApiTrackResponse).id !==
            (prevTrack as ApiTrackResponse).id)
      ) {
        await selectTrack(nextTrack, true, playing.value, true);
      }
    }
    updateOverlayCanvas(frameNum.value);
  }
);

watch(
  () => currentTrack,
  () => {
    if (!playing.value) {
      updateOverlayCanvas(frameNum.value);
    }
  }
);

const container = ref<HTMLDivElement | null>(null);
const frameNumField = ref<HTMLDivElement | null>(null);
const ffcSecsAgo = ref<HTMLDivElement | null>(null);
const overlayCanvas = ref<HTMLCanvasElement | null>(null);
const valueTooltip = ref<HTMLSpanElement | null>(null);

const playing = ref<boolean>(false);
const header = ref<CptvHeader | null>(null);
const valueUnderCursor = ref<string | null>(null);
const playerMessage = ref<string | null>(null);
const showValueInfo = ref<boolean>(false);
const buffering = ref<boolean>(false);

const showAtEndOfSearch = ref<boolean>(false);
const frameNum = ref<number>(0);
const targetFrameNum = ref<number>(0);
const showAdvancedControls = ref<boolean>(false);
const animationTick = ref<number>(0);
const isShowingBackgroundFrame = ref<boolean>(false);
const animationFrame = ref<number>(0);

// #1315407 A great example of motion paths

// #1324835 An interesting example for both motion paths and highlight mode.
//    Illustrates that tracking needs motion vectors.

const motionPaths = computed<MotionPath[]>(() => {
  return (
    recording?.tracks.map((track) => motionPathForTrack(track, scale.value)) ||
    []
  );
});

// TODO(jon): Ideally we'd set the frame number and drive everything else off that change, right?

// TODO - Maybe make these preferences be per group per user?
const persistentBooleanPref = (
  key: string,
  propertyName: string,
  forceReRender = false,
  defaultValue = false
): Ref<boolean> => {
  const initValue =
    (localStorage.getItem(key) && localStorage.getItem(key) === "true") ||
    defaultValue;
  const variable = ref<boolean>(initValue);
  watch(variable, (nextVal: boolean) => {
    localStorage.setItem(key, nextVal.toString());
    setPlayerMessage(`${propertyName} ${nextVal ? "Enabled" : "Disabled"}`);
    if (forceReRender) {
      setCurrentFrameAndRender(true);
    }
  });
  return variable;
};

const showDebugTools = persistentBooleanPref("show-debug-tools", "Debug tools");
const silhouetteMode = persistentBooleanPref(
  "silhouette-mode",
  "Silhouette mode",
  true
);
const polygonEditMode = persistentBooleanPref(
  "polygon-edit-mode",
  "Polygon edit mode"
);
const motionPathMode = persistentBooleanPref(
  "motion-path-mode",
  "Motion paths",
  true
);
const trackHighlightMode = persistentBooleanPref(
  "track-highlight-mode",
  "Track focus",
  true
);
const videoSmoothing = persistentBooleanPref(
  "video-smoothing",
  "Smoothing",
  true,
  true
);

const speedMultiplierIndex = ref<number>(
  Math.max(
    PlaybackSpeeds.indexOf(
      Number(localStorage.getItem("video-playback-speed")) || 1
    ),
    0
  )
);

const paletteIndex = ref<number>(
  Math.max(
    ColourMaps.findIndex(
      ([name]) => name === localStorage.getItem("video-palette")
    ),
    0
  )
);
const colourMap = ref<[string, Uint32Array]>(ColourMaps[paletteIndex.value]);
const messageTimeout = ref<number | null>(null);
const messageAnimationFrame = ref<number>(0);

const loadedStream = ref<boolean | string>(false);
const totalFrames = ref<number | null>(null);
const seekingInProgress = ref<boolean>(false);
const streamLoadError = ref<string | null>(null);

const frameHeader = ref<CptvFrameHeader | null>(null);
const scale = ref<number>(1);
const raqFps = ref<number>(60);
const polledFps = ref<boolean>(false);
const stopAtFrame = ref<number | null>(null);
const wasPaused = ref<boolean>(false);
const trackExportOptions = ref<TrackExportOption[]>([]);

const setTimeAndRedraw = async ({
  timeZeroOne,
  frameNumToDraw,
}: {
  timeZeroOne?: number;
  frameNumToDraw?: number;
}) => {
  //console.log(timeZeroOne);
  // If the user is already seeking, don't queue up new seek events until that download progress completes.
  if (!seekingInProgress.value) {
    isShowingBackgroundFrame.value = false;
    if (header.value) {
      animationTick.value = 0;
      if (timeZeroOne !== undefined && totalPlayableFrames.value !== 0) {
        targetFrameNum.value = Math.floor(
          Math.min(
            totalPlayableFrames.value - 1,
            timeZeroOne * (totalPlayableFrames.value - 1)
          )
        );
      } else {
        targetFrameNum.value = frameNumToDraw || 0;
      }
      const gotFrame = await seekToSpecifiedFrameAndRender(
        true,
        targetFrameNum.value
      );
      if (gotFrame) {
        frameNum.value = targetFrameNum.value;
      }
    }
  }
};

const firstFrameNumForTrack = (trackId: number): number => {
  // If we're calling this, the track definitely exists and has frame positions.
  return Number(Object.entries(framesByTrack.value[trackId])[0][0]);
};

const onePastLastFrameNumForTrack = (trackId: number): number => {
  const frames = Object.entries(framesByTrack.value[trackId]);
  const lastTrackFramePlusOne = Number(frames[frames.length - 1][0]) + 1;
  if (totalPlayableFrames.value) {
    return Math.min(totalPlayableFrames.value, lastTrackFramePlusOne);
  }
  return lastTrackFramePlusOne;
};

const lastFrameNumForTrack = (trackId: number): number => {
  const frames = Object.entries(framesByTrack.value[trackId]);
  const lastTrackFrame = Number(frames[frames.length - 1][0]);
  if (totalPlayableFrames.value) {
    return Math.min(totalPlayableFrames.value, lastTrackFrame);
  }
  return lastTrackFrame;
};

const selectTrack = async (
  track: ApiTrackResponse,
  force = false,
  shouldPlay = false,
  userSelected = false
) => {
  if ((!playing.value || force) && recording?.tracks.length) {
    cancelAnimationFrame(animationFrame.value);
    animationTick.value = 0;
    if (userSelected) {
      await setTimeAndRedraw({
        frameNumToDraw: firstFrameNumForTrack(track.id),
      });
      stopAtFrame.value = lastFrameNumForTrack(track.id);
    }
    if (shouldPlay) {
      playing.value = true;
    }
  }
};

const requestHeaderInfoDisplay = () => {
  emit("request-header-info-display");
};

const requestPrevRecording = () => {
  if (hasPrev) {
    frameNum.value = 0;
    targetFrameNum.value = 0;
    buffering.value = true;
    emit("request-prev-recording");
  } else {
    showAtEndOfSearch.value = true;
  }
};

const requestNextRecording = () => {
  if (hasNext) {
    frameNum.value = 0;
    targetFrameNum.value = 0;
    buffering.value = true;
    emit("request-next-recording");
  } else {
    showAtEndOfSearch.value = true;
  }
};

const hasBackgroundFrame = computed<boolean>(() => {
  return (header.value?.hasBackgroundFrame as boolean) || false;
});

const addFrame = (frame: CptvFrame) => {
  if (frame.meta.isBackgroundFrame) {
    backgroundFrame.value = frame;
  } else {
    frames.push(frame);
  }
  accumulateMinMaxForFrame(frame);
};

const makeSureWeHaveTheFrame = async (frameNumToRender: number) => {
  if (frameNumToRender > frames.length + 2 && !totalFrames.value) {
    buffering.value = true;
  }
  while (frames.length <= frameNumToRender && !totalFrames.value) {
    seekingInProgress.value = true;
    const frame = await cptvDecoder.getNextFrame();
    if (frame === null) {
      if (await cptvDecoder.hasStreamError()) {
        streamLoadError.value = await cptvDecoder.getStreamError();
        await cptvDecoder.free();
        totalFrames.value = frames.length;
      }
      break;
    }
    totalFrames.value = await cptvDecoder.getTotalFrames();
    if (!totalFrames.value) {
      // If we got total frames, this frame is a duplicate.
      addFrame(frame);
    }
  }
  seekingInProgress.value = false;
  buffering.value = false;
};

const setCurrentFrameAndRender = (
  force: boolean,
  frameNumToRender?: number
) => {
  if (frameNumToRender === undefined) {
    frameNumToRender = targetFrameNum.value;
  }
  let frameData;
  if (isShowingBackgroundFrame.value) {
    frameData = backgroundFrame.value as CptvFrame;
  } else {
    frameData = frames[Math.min(frames.length - 1, frameNumToRender)];
  }
  if (frameData) {
    frameHeader.value = frameData.meta;
    renderFrame(frameData, frameNumToRender, force);
  }
};

const seekToSpecifiedFrameAndRender = async (
  force = false,
  frameNumToRender?: number
): Promise<boolean> => {
  if (frameNumToRender === undefined) {
    frameNumToRender = targetFrameNum.value;
  }
  await makeSureWeHaveTheFrame(frameNumToRender);
  const gotFrame = frameNumToRender < frames.length;
  if (gotFrame) {
    setCurrentFrameAndRender(force, frameNumToRender);
  }
  return gotFrame;
};

const loadedFramesForTrack = (trackId: TrackId): CptvFrame[] => {
  const trackNums = Object.keys(framesByTrack.value[trackId]).map(Number);
  const framesForTrack = [];
  for (const num of trackNums) {
    if (num < frames.length) {
      framesForTrack.push(frames[num]);
    }
  }
  return framesForTrack;
};

const frameWidth = computed<number>(() => {
  if (header.value) {
    return header.value.width;
  }
  return 160;
});

const frameHeight = computed<number>(() => {
  if (header.value) {
    return header.value.height;
  }
  return 120;
});
// FIXME - Refactor to separate frame data drawing from overlay drawing.

const renderFrame = (
  frameData: CptvFrame,
  frameNumToRender: number,
  force = false
) => {
  if (canvas.value && header.value && canvasContext.value) {
    let min;
    let max;

    const numTracks = recording?.tracks.length || 0;
    if (trackHighlightMode.value) {
      if (
        currentTrack &&
        numTracks > 1 &&
        framesByTrack.value[currentTrack.id] &&
        tracksByFrame.value[frameNumToRender]
      ) {
        // const trackBox = framesByTrack.value[currentTrack.id][frameNumToRender];
        // [min, max] = minMaxForTrackBox(trackBox, frameData);
        // const allTrackBoxes = tracksIntermediate.value.map(
        //   ({ positions }) => positions
        // );

        const trackBoxes = Object.values(framesByTrack.value[currentTrack.id]);
        [min, max] = minMaxForTrack(
          trackBoxes,
          loadedFramesForTrack(currentTrack.id)
        );
      } else if (numTracks === 1) {
        // There's only one track, so highlight it all the time.
        const trackId = recording!.tracks[0].id;
        if (
          framesByTrack.value[trackId] &&
          tracksByFrame.value[frameNumToRender]
        ) {
          // const trackBox = framesByTrack.value[trackId][frameNumToRender];
          // [min, max] = minMaxForTrackBox(trackBox, frameData);
          const trackBoxes = Object.values(framesByTrack.value[trackId]);
          [min, max] = minMaxForTrack(
            trackBoxes,
            loadedFramesForTrack(trackId)
          );
        } else {
          // Get the min/max for the first frame of the track, or maybe one in the middle.
          /*
          const trackFrames = Object.entries(framesByTrack.value[trackId]);
          const trackFrameToUse =
            frameNumToRender < Number(trackFrames[0][0])
              ? 0
              : trackFrames.length - 1;
          const trackBox = trackFrames[trackFrameToUse][1];
          [min, max] = minMaxForTrackBox(trackBox, frameData);
          */
          // TODO: If none of the track frames are loaded yet, just use global min/max

          // TODO: Another idea - sample all the track regions on the background/first frame, and exclude any outliers
          //  that may be overly dark.  Maybe just do that for the MIN value, and allow maxes to rise?

          const trackBoxes = Object.values(framesByTrack.value[trackId]);
          [min, max] = minMaxForTrack(
            trackBoxes,
            loadedFramesForTrack(trackId)
          );
        }

        // console.log("minMaxForTrack", min, max, max - min);
        // const allTrackBoxes = tracksIntermediate.value.map(
        //     ({ positions }) => positions
        // );
        // [min] = minMaxForTracks(allTrackBoxes, frames[0]);
        // console.log("minMaxForTrackS", min, max, max - min);
      } else {
        if (
          header.value.minValue !== undefined &&
          header.value.maxValue !== undefined
        ) {
          min = header.value.minValue;
          max = header.value.maxValue;
        } else {
          [min, max] = minMaxForFrame(frameData);
        }
      }
    } else if (
      header.value.minValue !== undefined &&
      header.value.maxValue !== undefined
    ) {
      min = header.value.minValue;
      max = header.value.maxValue;
    } else {
      [min, max] = minMaxForFrame(frameData);
    }
    if (!silhouetteMode.value) {
      // Example: #1284537 for dynamic range clamping
      // #1284559 maybe not working?
      const range = max - min;
      const colourMapToUse = colourMap.value[1];
      const fd = frameData.data;
      const frameBufferView = new Uint32Array(frameBuffer.buffer);
      const len = frameBufferView.length;
      for (let i = 0; i < len; i++) {
        const index = ((fd[i] - min) / range) * 255.0;
        const n = Math.min(255, Math.max(0, index));
        const f = n << 0;
        const ff = f == n ? f : f + 1;
        frameBufferView[i] = colourMapToUse[ff];
      }
    } else {
      // Render silhouette mode
      if (backgroundFrame.value) {
        const [min, max] = minMaxForFrame(backgroundFrame.value);
        const range = max - min;
        const colourMapToUse = colourMap.value[1];
        const fd = frameData.data;
        const bg = backgroundFrame.value.data;
        const threshold = 45; // Should be scaled by range.
        const frameBufferView = new Uint32Array(frameBuffer.buffer);
        const len = frameBufferView.length;
        const red = (255 << 24) | (0 << 16) | (0 << 8) | 255;
        for (let i = 0; i < len; i++) {
          const px = Math.abs(Number(fd[i]) - Number(bg[i]));
          if (px < threshold) {
            const index = ((fd[i] - min) / range) * 255.0;
            const n = Math.min(255, Math.max(0, index));
            const f = n << 0;
            const ff = f == n ? f : f + 1;
            frameBufferView[i] = colourMapToUse[ff];
          } else {
            frameBufferView[i] = red;
          }
        }
      }
    }

    cancelAnimationFrame(animationFrame.value);
    animationFrame.value = requestAnimationFrame(() => {
      drawFrame(
        canvasContext.value,
        new ImageData(frameBuffer, frameWidth.value, frameHeight.value),
        frameNumToRender,
        force
      );
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

const setDebugFrameInfo = (frameNum: number) => {
  // TODO: This was set manually/non-reactively because this could be slow on mobile on Vue2 - is it still the case with Vue3?
  if (showDebugTools.value) {
    if (frameNumField.value) {
      frameNumField.value.innerText = `Frame #${frameNum + 1}`;
    }
    if (ffcSecsAgo.value && secondsSinceLastFFC.value) {
      ffcSecsAgo.value.innerText = `FFC ${secondsSinceLastFFC.value.toFixed(
        1
      )}s ago`;
    }
  }
};
const frameTimeSeconds = computed<number>(() => {
  return 1 / fps.value;
});

const timeAdjustmentForBackgroundFrame = computed<number>(() => {
  if (hasBackgroundFrame.value) {
    return frameTimeSeconds.value;
  }
  return 0;
});

const fps = computed<number>(() => {
  if (header.value) {
    return header.value.fps;
  }
  return 9;
});

const totalPlayableFrames = computed<number>(() => {
  if (header.value && header.value.totalFrames) {
    const backgroundAdjust = header.value.hasBackgroundFrame ? 1 : 0;
    return header.value.totalFrames - backgroundAdjust;
  } else {
    if (totalFrames.value !== null) {
      const backgroundAdjust = header.value?.hasBackgroundFrame ? 1 : 0;
      return totalFrames.value - backgroundAdjust;
    }
    if (header.value) {
      const backgroundAdjust = header.value.hasBackgroundFrame ? 1 : 0;
      return Math.round(
        Math.max(
          ((recording || {}).duration || 0) * fps.value - backgroundAdjust,
          ...(recording || { tracks: [] }).tracks.map(
            ({ end }) => end * fps.value - backgroundAdjust
          )
        )
      );
    }
  }
  return 0;
});

const actualDuration = computed<number>(
  () => totalPlayableFrames.value / fps.value
);

const currentTime = computed<number>(() => {
  return (frameNum.value + 1) / fps.value;
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

const headerInfo = computed(() => formatHeaderInfo(header.value));

const getAuthoritativeTagForTrack = (
  trackTags: ApiTrackTagResponse[]
): string | null => {
  const userTags = trackTags.filter((tag) => !tag.automatic);
  if (userTags.length) {
    // FIXME - There can be more than one conflicting user tag...

    // TODO: Add an option to also include the AI guess, plus the confidence at each frame.
    return userTags[0].what;
  } else {
    return (
      trackTags.find(
        (tag) =>
          (tag.data && typeof tag.data === "string" && tag.data === "Master") ||
          (typeof tag.data === "object" &&
            tag.data.name &&
            tag.data.name === "Master")
      )?.what || null
    );
  }
};

// Check if positions is in old format or new and format accordingly
const getPositions = (
  positions: ApiTrackPosition[],
  timeOffset: number,
  frameTimeSeconds: number
): [FrameNum, Rectangle][] => {
  const frameAtTime = (time: number) => {
    return Math.round(time / frameTimeSeconds);
  };
  // Add a bit of breathing room around our boxes
  const padding = 0; // 5
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

const tracksIntermediate = computed<IntermediateTrack[]>(() => {
  return (
    recording?.tracks.map(({ positions, tags, id }) => ({
      what: (tags && getAuthoritativeTagForTrack(tags)) || null,
      positions: getPositions(
        positions as ApiTrackPosition[],
        timeAdjustmentForBackgroundFrame.value,
        frameTimeSeconds.value
      ),
      id,
    })) || []
  );
});

const tracksByFrame = computed<Record<FrameNum, [TrackId, TrackBox][]>>(() => {
  return tracksIntermediate.value.reduce(
    (acc: Record<FrameNum, [TrackId, TrackBox][]>, item) => {
      for (const [frameNum, trackBox] of item.positions) {
        acc[frameNum] = acc[frameNum] || [];
        acc[frameNum].push([
          item.id,
          {
            rect: trackBox,
            what: item.what,
          },
        ]);
      }
      return acc;
    },
    {}
  );
});

// #1296036 Check out this false positive
const mergedTracks = computed(() => {
  // #1285017 Make sure this example doesn't get merged.
  // #1295326, Also make sure this doesn't get merged.

  // #1302826 Make sure this one does
  // And this one #1316684

  // Head/tail merging - how many frames of overlap do we allow?

  // #1326858 Complex tracks to merge/not merge

  const mergeCandidates: Record<string, boolean> = {};
  for (const [_frameNum, tracks] of Object.entries(tracksByFrame.value).filter(
    ([_, tracks]) => tracks.length > 1
  )) {
    for (const [trackA, trackABox] of tracks) {
      for (const [trackId, trackBox] of tracks) {
        if (trackId !== trackA) {
          // Check for intersections.
          if (rectanglesIntersect(trackBox.rect, trackABox.rect)) {
            if (trackId < trackA) {
              mergeCandidates[`${trackId}_${trackA}`] = true;
            } else {
              mergeCandidates[`${trackA}_${trackId}`] = true;
            }
          }
        }
      }
    }
  }
  // TODO - Do the merge in some smart way to the intermediate tracks, and then have the tracksByFrame and framesByTrack
  //  use those merged tracks.  So we want some intermediate merged product that we can switch to.
  return mergeCandidates;
});

const framesByTrack = computed<Record<TrackId, Record<FrameNum, TrackBox>>>(
  () => {
    return tracksIntermediate.value.reduce(
      (
        acc: Record<TrackId, Record<FrameNum, TrackBox>>,
        { id, what, positions }
      ) => {
        acc[id] = acc[id] || {};
        for (const [frameNum, trackBox] of positions) {
          acc[id][frameNum] = {
            rect: trackBox,
            what,
          };
        }
        return acc;
      },
      {}
    );
  }
);

const isExporting = ref<boolean>(false);
const doAdvancedExport = () => {
  exportMp4(trackExportOptions.value);
  isExporting.value = true;
};
const cancelExport = () => {
  isExporting.value = false;
  emit("export-completed");
};
const exportMp4 = async (useExportOptions: TrackExportOption[] = []) => {
  if (!header.value) {
    isExporting.value = false;
    return;
  }
  playing.value = false;
  exportProgressZeroOne.value = 0;

  if (overlayCanvas.value) {
    const targetWidth = 640;
    const targetHeight = 480;
    const encoder = new Mp4Encoder();
    await encoder.init(targetWidth, targetHeight, 9);

    if (!exportRequested) {
      // Could have been canceled.
      encoder.close();
      isExporting.value = false;
      return;
    }
    const renderCanvas = document.createElement("canvas");
    renderCanvas.width = targetWidth;
    renderCanvas.height = targetHeight;

    const renderContext = renderCanvas.getContext("2d", {
      willReadFrequently: true,
      desynchronized: true,
    });
    const videoCanvas = document.createElement("canvas");
    videoCanvas.width = header.value.width;
    videoCanvas.height = header.value.height;
    const videoContext = videoCanvas.getContext("2d");
    if (videoContext === null || renderContext === null) {
      encoder.close();
      isExporting.value = false;
      return;
    }
    // Make sure everything is loaded to ensure that we have final min/max numbers for normalisation
    //await ensureEntireFileIsLoaded();
    await makeSureWeHaveTheFrame(100000);

    if (await cptvDecoder.hasStreamError()) {
      emit("export-completed");
      streamLoadError.value = await cptvDecoder.getStreamError();
      await cptvDecoder.free();
      frames = [];
      encoder.close();
      isExporting.value = false;
      return;
    }

    if (!exportRequested) {
      // Could have been canceled.
      encoder.close();
      isExporting.value = false;
      return;
    }

    console.assert(totalFrames.value !== null);
    const numTotalFrames = totalFrames.value || 0;
    let startFrame = 0;
    let onePastLastFrame = numTotalFrames;
    if (
      trackExportOptions.value.filter((track) => track.includeInExportTime)
        .length !== 0
    ) {
      startFrame = numTotalFrames;
      onePastLastFrame = 0;
      for (const { includeInExportTime, trackId } of trackExportOptions.value) {
        if (includeInExportTime) {
          const track = (recording as ApiRecordingResponse).tracks.find(
            (track) => track.id === trackId
          );
          if (track) {
            firstFrameNumForTrack(trackId);
            onePastLastFrameNumForTrack(trackId);
            startFrame = Math.min(startFrame, firstFrameNumForTrack(trackId));
            onePastLastFrame = Math.max(
              onePastLastFrame,
              onePastLastFrameNumForTrack(trackId)
            );
          }
        }
      }
    }
    let frameNum = startFrame;
    while (frameNum < onePastLastFrame) {
      const frameData = frames[frameNum];
      const frameHeader = frameData.meta;
      const [min, max] = minMaxForFrame(frameData);
      renderFrameIntoFrameBuffer(
        frameBuffer,
        frameData.data,
        colourMap.value[1],
        min,
        max
      );
      videoContext.putImageData(
        new ImageData(frameBuffer, header.value.width, header.value.height),
        0,
        0
      );
      renderContext.imageSmoothingEnabled = videoSmoothing.value;
      if (videoSmoothing.value) {
        renderContext.imageSmoothingQuality = "high";
      }
      renderContext.drawImage(
        videoCanvas,
        0,
        0,
        videoCanvas.width,
        videoCanvas.height,
        0,
        0,
        renderCanvas.width,
        renderCanvas.height
      );

      // Draw the overlay
      let timeSinceLastFFCSeconds = Number.MAX_SAFE_INTEGER;
      if (frameHeader.lastFfcTimeMs) {
        timeSinceLastFFCSeconds =
          (frameHeader.timeOnMs - frameHeader.lastFfcTimeMs) / 1000;
      }

      renderOverlay(
        renderContext,
        renderCanvas.width / videoCanvas.width,
        timeSinceLastFFCSeconds,
        true,
        frameNum,
        recording?.tracks || [],
        canSelectTracks,
        currentTrack,
        motionPathMode.value ? motionPaths.value : [],
        pixelRatio.value,
        tracksByFrame.value,
        framesByTrack.value,
        useExportOptions
      );

      await encoder.encodeFrame(
        renderContext.getImageData(0, 0, targetWidth, targetHeight).data
      );
      if (!exportRequested) {
        encoder.close();
        // Check for cancellation
        isExporting.value = false;
        return;
      }
      exportProgressZeroOne.value =
        (frameNum - startFrame) / (onePastLastFrame - startFrame);
      frameNum++;
    }
    const uint8Array = await encoder.finish();
    encoder.close();
    if (!exportRequested) {
      // Check for cancellation
      isExporting.value = false;
      return;
    }
    const recordingIdSuffix = `recording_${recordingId}__`;
    trackExportOptions.value = exportOptions.value;
    download(
      URL.createObjectURL(new Blob([uint8Array], { type: "video/mp4" })),
      `${recordingIdSuffix}${new Date(
        header.value.timestamp / 1000
      ).toLocaleString()}`
    );
    isExporting.value = false;
    emit("export-completed");
  }
};

const download = (url: string, filename: string) => {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "download";
  anchor.click();
};

const ambientTemperature = computed<string | null>(() => {
  if (frameHeader.value && frameHeader.value.frameTempC) {
    return `About ${Math.round(frameHeader.value.frameTempC)}ºC`;
  }
  return null;
});

const updateOverlayCanvas = (frameNumToRender: number) => {
  // FIXME - Move this somewhere else, like when the frame advances
  if (overlayContext.value) {
    renderOverlay(
      overlayContext.value,
      scale.value,
      secondsSinceLastFFC.value,
      false,
      frameNumToRender,
      recording?.tracks || [],
      canSelectTracks,
      currentTrack,
      motionPathMode.value ? motionPaths.value : [],
      pixelRatio.value,
      tracksByFrame.value,
      framesByTrack.value,
      trackExportOptions.value
    );

    {
      const time = `${elapsedTime.value} / ${formatTime(
        Math.max(currentTime.value, actualDuration.value)
      )}`;
      drawBottomRightOverlayLabel(time, overlayContext.value, pixelRatio.value);
      // Draw time and temperature in
      // overlayContext.
      drawBottomLeftOverlayLabel(
        ambientTemperature.value,
        overlayContext.value,
        pixelRatio.value
      );
    }
  }
};

const ticksBetweenDraws = computed<number>(() => {
  // We only redraw the canvas at 9fps (the frame rate of the recording)
  // Since actual refresh rate of the requestAnimationFrame loop is
  // 30 or 60 or 120fps, we need to wait a certain number of ticks
  // until the right frame comes up for rendering.
  // One tick represents 1000 / fps * multiplier
  return Math.max(
    1,
    Math.floor(raqFps.value / (fps.value * speedMultiplier.value))
  );
});

const shouldRedrawThisTick = computed<boolean>(() => {
  return (
    (animationTick.value + (playing.value ? 1 : 0)) %
      ticksBetweenDraws.value ===
    0
  );
});

watch(playing, async (nextPlaying: boolean) => {
  if (nextPlaying) {
    isShowingBackgroundFrame.value = false;
    targetFrameNum.value = frameNum.value;
    const didAdvance = await seekToSpecifiedFrameAndRender(false);
    if (didAdvance) {
      frameNum.value = targetFrameNum.value;
    } else {
      playing.value = false;
    }
  } else {
    cancelAnimationFrame(animationFrame.value);
  }
});

watch(frameNum, () => {
  if (
    totalPlayableFrames.value &&
    frameNum.value === totalPlayableFrames.value - 1
  ) {
    playing.value = false;
  }

  // If there's only one possible track for this frame, set it to selected.
  const frameTracks =
    tracksByFrame.value[frameNum.value] || ([] as [TrackId, TrackBox][]);
  if (currentTrack && canSelectTracks && frameTracks.length === 1) {
    const trackId = frameTracks[0][0];
    // If the track is the only track at this time offset, make it the selected track.
    if (currentTrack.id !== trackId) {
      emit("track-selected", { trackId, automatically: true });
    }
  }
});

const atEndOfPlayback = computed<boolean>(() => {
  return frameNum.value === totalPlayableFrames.value - 1;
});

const togglePlayback = async (): Promise<void> => {
  stopAtFrame.value = null;
  if (!playing.value) {
    if (atEndOfPlayback.value) {
      frameNum.value = 0;
      targetFrameNum.value = 0;
      animationTick.value = 0;
    }
    playing.value = true;
  } else {
    playing.value = false;
  }
};

const setPlayerMessage = (message: string) => {
  if (messageTimeout.value !== null || playerMessage.value !== null) {
    clearTimeout(messageTimeout.value as number);
    messageTimeout.value = null;
    playerMessage.value = null;
    cancelAnimationFrame(messageAnimationFrame.value);
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

const incrementPalette = async (): Promise<void> => {
  paletteIndex.value++;
  const palette = ColourMaps[paletteIndex.value % ColourMaps.length];
  const paletteName = palette[0];
  setPlayerMessage(paletteName);
  localStorage.setItem("video-palette", paletteName);
  colourMap.value = palette;
  setCurrentFrameAndRender(true);
};

const incrementSpeed = () => {
  speedMultiplierIndex.value++;
  setPlayerMessage(`Speed ${speedMultiplier.value}x`);
  localStorage.setItem(
    "video-playback-speed",
    speedMultiplier.value.toString()
  );
};

const speedMultiplier = computed(() => {
  return PlaybackSpeeds[speedMultiplierIndex.value % PlaybackSpeeds.length];
});

const overlayContext = computed<CanvasRenderingContext2D | null>(() => {
  if (overlayCanvas.value) {
    const context = overlayCanvas.value.getContext("2d");
    if (context) {
      return context;
    }
  }
  return null;
});

const canvasContext = computed<CanvasRenderingContext2D | null>(() => {
  if (canvas.value) {
    const context = canvas.value.getContext("2d");
    if (context) {
      return context;
    }
  }
  return null;
});

const canStepBackward = computed<boolean>(() => frameNum.value > 0);
const canStepForward = computed<boolean>(
  () => frameNum.value < totalPlayableFrames.value - 1
);

const stepBackward = async () => {
  isShowingBackgroundFrame.value = false;
  playing.value = false;
  animationTick.value = 0;
  targetFrameNum.value = Math.max(frameNum.value - 1, 0);
  const couldStep = await seekToSpecifiedFrameAndRender(
    true,
    Math.max(frameNum.value - 1, 0)
  );
  if (couldStep) {
    // Actually advance
    frameNum.value = targetFrameNum.value;
  } else {
    targetFrameNum.value = frameNum.value;
  }
};

const stepForward = async () => {
  isShowingBackgroundFrame.value = false;
  playing.value = false;
  animationTick.value = 0;
  targetFrameNum.value = frameNum.value + 1;
  const couldStep = await seekToSpecifiedFrameAndRender(
    true,
    targetFrameNum.value
  );
  if (couldStep) {
    // Actually advance
    frameNum.value = targetFrameNum.value;
  } else {
    targetFrameNum.value = frameNum.value;
  }
};

const toggleBackground = async (): Promise<void> => {
  isShowingBackgroundFrame.value = !isShowingBackgroundFrame.value;
  if (!isShowingBackgroundFrame.value) {
    if (!wasPaused.value) {
      playing.value = true;
    } else {
      animationTick.value = 0;
      setCurrentFrameAndRender(true);
    }
  } else {
    const background = backgroundFrame.value;
    if (background && header.value) {
      animationTick.value = 0;
      wasPaused.value = !playing.value;
      if (playing.value) {
        playing.value = false;
      }
      if (!canvasContext.value) {
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
      canvasContext.value.putImageData(
        new ImageData(frameBuffer, header.value.width, header.value.height),
        0,
        0
      );
      if (clearOverlay(overlayContext.value)) {
        drawBottomLeftOverlayLabel(
          "Background frame",
          overlayContext.value,
          pixelRatio.value
        );
      }
    }
  }
};

const getTrackIdAtPosition = (x: number, y: number): TrackId | null => {
  // If the track is already selected, ignore it
  const trackId = (
    tracksByFrame.value[frameNum.value] || ([] as [TrackId, TrackBox][])
  )
    .filter(([trackId]) => trackId !== currentTrack?.id)
    .find(
      ([
        _,
        {
          rect: [left, top, right, bottom],
        },
      ]) => left <= x && right > x && top <= y && bottom > y
    );
  return (trackId && trackId[0]) || null;
};

const clickOverlayCanvas = async (event: MouseEvent): Promise<void> => {
  if (canvas.value && overlayCanvas.value) {
    const canvasOffset = canvas.value.getBoundingClientRect();
    const pX = Math.floor((event.x - canvasOffset.x) / scale.value);
    const pY = Math.floor((event.y - canvasOffset.y) / scale.value);
    const trackId = getTrackIdAtPosition(pX, pY);
    overlayCanvas.value.style.cursor = trackId !== null ? "pointer" : "default";
    if (trackId !== null) {
      emit("track-selected", {
        trackId,
        automatically: !playing.value,
      });
    }
  }
};

const currentVisibleFrame = computed<CptvFrame>(() => {
  if (isShowingBackgroundFrame.value && backgroundFrame.value) {
    return backgroundFrame.value;
  } else {
    console.assert(
      frameNum.value <= frames.length - 1,
      "Tried to read past loaded frames"
    );
    return frames[frameNum.value];
  }
});

const moveOverOverlayCanvas = (event: MouseEvent) => {
  if (canvas.value && overlayCanvas.value) {
    const canvasOffset = canvas.value.getBoundingClientRect();
    const { x, y } = event;
    const offsetX = x - canvasOffset.x;
    const offsetY = y - canvasOffset.y;
    const pX = Math.floor(offsetX / scale.value);
    const pY = Math.floor(offsetY / scale.value);
    const hitTrackIndex = getTrackIdAtPosition(pX, pY);
    // set cursor
    overlayCanvas.value.style.cursor =
      hitTrackIndex !== null ? "pointer" : "default";
    if (showValueInfo.value && header.value) {
      canvas.value.style.cursor = "default";
      // Map the x,y into canvas size
      const frameData = currentVisibleFrame.value;
      valueUnderCursor.value = `(${pX}, ${pY}) ${
        frameData.data[pY * header.value.width + pX]
      }`;
      if (valueTooltip.value) {
        if (offsetX > canvasOffset.right - canvasOffset.x - 100) {
          valueTooltip.value.style.left = `${offsetX - 100}px`;
        } else {
          valueTooltip.value.style.left = `${offsetX + 2}px`;
        }
        if (offsetY < canvasOffset.top - canvasOffset.y + 20) {
          valueTooltip.value.style.top = `${offsetY + 20}px`;
        } else {
          valueTooltip.value.style.top = `${offsetY - 20}px`;
        }
      }
    }
  }
};

const frameTimes: number[] = [];
const pollFrameTimes = () => {
  if (!polledFps.value) {
    frameTimes.push(performance.now());
    if (frameTimes.length < 20) {
      // Safari iOS seems to take a a little while get up to speed with canvas rendering.
      requestAnimationFrame(pollFrameTimes);
    } else {
      const diffs = [];
      for (let i = 1; i < frameTimes.length; i++) {
        diffs.push(frameTimes[i] - frameTimes[i - 1]);
      }
      let total = 0;
      for (const val of diffs) {
        total += val;
      }
      // Get the average frame time
      const multiplier = Math.round(1000 / (total / diffs.length) / 30);
      if (multiplier === 1) {
        // 30fps
        raqFps.value = 30;
      } else if (multiplier === 2 || multiplier === 3) {
        // 60fps
        raqFps.value = 60;
      } else if (multiplier >= 4) {
        // 120fps
        raqFps.value = 120;
      }
      polledFps.value = true;
      // alert(`${1000 / (total / diffs.length) / 30}, ${multiplier}, ${raqFps.value}fps`);
    }
  }
};

onMounted(async () => {
  cptvDecoder = new CptvDecoder();
  // This makes button active styles work in safari iOS.
  document.addEventListener(
    "touchstart",
    () => {
      return;
    },
    false
  );

  if (canvas.value) {
    canvas.value.width = 160;
    canvas.value.height = 120;
  }

  buffering.value = true;
  if (canSelectTracks) {
    overlayCanvas.value?.addEventListener("click", clickOverlayCanvas);
    overlayCanvas.value?.addEventListener("mousemove", moveOverOverlayCanvas);
  }

  await loadNextRecording(recordingId);
  pollFrameTimes();
});

const loadedNextRecordingData = async () => {
  if (currentTrack) {
    const firstFrameForTrack = Number(
      Object.keys(framesByTrack.value[currentTrack.id])[0]
    );
    targetFrameNum.value = firstFrameForTrack;
    await seekToSpecifiedFrameAndRender(true, firstFrameForTrack);
    frameNum.value = firstFrameForTrack;
  }
};

watch(
  () => recording,
  (nextRecording: ApiRecordingResponse | null) => {
    if (nextRecording) {
      trackExportOptions.value = exportOptions.value;
      loadedNextRecordingData();
    }
  }
);

const loadNextRecording = async (nextRecordingId: RecordingId) => {
  loadedStream.value = false;
  streamLoadError.value = null;
  frameNum.value = 0;
  targetFrameNum.value = 0;
  header.value = null;
  setDebugFrameInfo(0);
  animationTick.value = 0;
  totalFrames.value = null;
  playing.value = false;
  buffering.value = true;
  wasPaused.value = true;
  resetRecordingNormalisation();
  trackExportOptions.value = [];
  frames = [];
  cancelAnimationFrame(animationFrame.value);

  if ((recording?.tracks || []).length > 1) {
    console.warn(
      "Can merge",
      Object.values(framesByTrack.value).length,
      Object.keys(mergedTracks.value)
    );
  }
  // Our api token could be out of date
  await maybeRefreshStaleCredentials();
  loadedStream.value = await cptvDecoder.initWithRecordingIdAndKnownSize(
    nextRecordingId,
    cptvSize || 0,
    CurrentUserCreds.value?.apiToken
  );

  if (loadedStream.value === true) {
    header.value = Object.freeze(await cptvDecoder.getHeader());
    // TODO - Init all the header related info (min/max values etc)
    setDebugFrameInfo(0);
    scale.value = canvasWidth.value / header.value.width;
    // If the header dimensions have changed since the last one, re-init the frameBuffer
    console.assert(canvas.value);
    if (
      canvas.value &&
      (canvas.value.width !== header.value.width ||
        canvas.value.height !== header.value.height ||
        !frameBuffer)
    ) {
      frameBuffer = new Uint8ClampedArray(
        header.value.width * header.value.height * 4
      );
      canvas.value.width = header.value.width;
      canvas.value.height = header.value.height;
    }
    while (!recording) {
      // Wait for the recording data to be loaded if it's not,
      // so that we can seek to the beginning of any track.
      await delayMs(10);
    }
    if (recording && recording.id === recordingId) {
      await loadedNextRecordingData();
      emit("ready-to-play", header.value);
      playing.value = true;
    }
  } else if (typeof loadedStream.value === "string") {
    streamLoadError.value = loadedStream.value;
    if (await cptvDecoder.hasStreamError()) {
      await cptvDecoder.free();
      frames = [];
      resetRecordingNormalisation();
      buffering.value = false;
    }
  }
};

watch(
  () => recordingId,
  async (nextRecordingId: RecordingId | undefined, prevRecordingId) => {
    clearCanvases();
    if (nextRecordingId && prevRecordingId !== nextRecordingId) {
      await loadNextRecording(nextRecordingId);
    }
  }
);

const clearCanvases = () => {
  for (const canvasEl of [canvas.value, overlayCanvas.value]) {
    if (canvasEl) {
      const context = canvasEl.getContext("2d");
      context &&
        context.clearRect(0, 0, context.canvas.width, context.canvas.height);
    }
  }
};

const exportOptions = computed<TrackExportOption[]>(() => {
  return (
    recording?.tracks.map(({ id }) => ({
      includeInExportTime: true,
      displayInExport: true,
      trackId: id,
    })) || []
  );
});

const setOverlayCanvasDimensions = () => {
  scale.value = canvasWidth.value / 160;
  if (header.value) {
    scale.value = canvasWidth.value / header.value.width;
  }
  if (overlayCanvas.value) {
    overlayCanvas.value.width = canvasWidth.value * pixelRatio.value;
    overlayCanvas.value.height = canvasHeight.value * pixelRatio.value;
    if (overlayContext.value) {
      overlayContext.value.scale(pixelRatio.value, pixelRatio.value);
    }
  }
  if (header.value) {
    // FIXME - We really just want to update the overlay here
    setCurrentFrameAndRender(true);
  }
};

const startSeek = () => {
  stopAtFrame.value = null;
  wasPaused.value = !playing.value;
  playing.value = false;
};

const endSeek = () => {
  if (!wasPaused.value) {
    playing.value = true;
  }
};

const drawFrame = async (
  context: CanvasRenderingContext2D | null,
  imgData: ImageData,
  frameNumToRender: number,
  force = false
): Promise<void> => {
  if (context) {
    if (force) {
      animationTick.value = 0;
    }
    // NOTE: respect fps here, render only when we should.
    if (shouldRedrawThisTick.value || force) {
      // Actually draw the frame contents for this requestAnimationFrame tick.
      context.putImageData(imgData, 0, 0);
      updateOverlayCanvas(frameNumToRender);
      setDebugFrameInfo(frameNumToRender);
      frameNum.value = frameNumToRender;

      if (playing.value && stopAtFrame.value) {
        if (frameNum.value === stopAtFrame.value) {
          stopAtFrame.value = null;
          playing.value = false;
        }
      }

      {
        let didAdvance = false;
        if (playing.value) {
          // Queue up the next frame.
          targetFrameNum.value = frameNumToRender + 1;
          didAdvance = await seekToSpecifiedFrameAndRender(
            false,
            targetFrameNum.value
          );
        }
        if (didAdvance) {
          animationTick.value = 0;
        } else {
          if (playing.value) {
            playing.value = false;
            animationTick.value = 0;
          }
          frameNum.value = Math.min(frames.length - 1, frameNumToRender);
          targetFrameNum.value = frameNum.value;
          // Draw the final frame.
          setCurrentFrameAndRender(true, frameNumToRender);
        }
      }
    } else {
      cancelAnimationFrame(animationFrame.value);
      if (playing.value) {
        // We don't draw on this tick, so increment and request again.
        animationTick.value++;
        // NOTE: Don't request a next frame if we're paused.
        animationFrame.value = requestAnimationFrame(() =>
          drawFrame(context, imgData, frameNumToRender)
        ) as number;
      }
    }
  }
};
</script>
<template>
  <div class="cptv-player">
    <div key="container" class="video-container" ref="container">
      <canvas
        key="base"
        ref="canvas"
        :class="['video-canvas', { smoothed: videoSmoothing }]"
      />
      <canvas key="overlay" ref="overlayCanvas" class="overlay-canvas" />
      <span
        key="px-value"
        v-show="showValueInfo"
        ref="valueTooltip"
        class="value-tooltip"
        >{{ valueUnderCursor }}
      </span>
      <span
        key="messaging"
        :class="['player-messaging', { show: playerMessage !== null }]"
        v-html="playerMessage"
      />
      <div key="buffering" :class="['playback-controls', { show: buffering }]">
        <font-awesome-icon class="fa-spin buffering" icon="spinner" size="4x" />
      </div>
      <div
        key="playback-controls"
        :class="[
          'playback-controls',
          {
            show: atEndOfPlayback,
          },
        ]"
      >
        <button
          @click.stop.prevent="requestPrevRecording"
          :class="{ disabled: !hasPrev }"
        >
          <font-awesome-icon icon="backward" class="replay" />
        </button>
        <button @click.stop.prevent="togglePlayback">
          <font-awesome-icon icon="redo-alt" class="replay" rotation="270" />
        </button>
        <button
          @click.stop.prevent="requestNextRecording"
          :class="{ disabled: !hasNext }"
        >
          <font-awesome-icon icon="forward" class="replay" />
        </button>
      </div>
    </div>
    <div key="playback-nav" class="playback-nav">
      <button
        @click.stop.prevent="togglePlayback"
        ref="playPauseButton"
        :data-tooltip="playing ? 'Pause' : 'Play'"
      >
        <font-awesome-icon v-if="!playing" icon="play" />
        <font-awesome-icon v-else icon="pause" />
      </button>
      <div class="right-nav">
        <div :class="['advanced-controls', { open: showAdvancedControls }]">
          <button
            @click.stop.prevent="showAdvancedControls = !showAdvancedControls"
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
            @click.stop.prevent="showDebugTools = !showDebugTools"
            ref="debugTools"
            data-tooltip="Debug tools"
            :class="{ selected: showDebugTools }"
          >
            <font-awesome-icon icon="wrench" />
          </button>
          <button
            @click.stop.prevent="videoSmoothing = !videoSmoothing"
            ref="toggleSmoothingButton"
            :data-tooltip="
              videoSmoothing ? 'Disable smoothing' : 'Enable smoothing'
            "
          >
            <svg
              v-if="videoSmoothing"
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
            @click.stop.prevent="incrementPalette"
            ref="cyclePalette"
            data-tooltip="Cycle colour map"
          >
            <font-awesome-icon icon="palette" />
          </button>
          <button
            @click.stop.prevent="requestHeaderInfoDisplay"
            data-tooltip="Show recording header info"
            :class="{ selected: displayHeaderInfo }"
            ref="showHeader"
          >
            <font-awesome-icon icon="info-circle" />
          </button>
        </div>
        <button
          @click.stop.prevent="incrementSpeed"
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
      <div>
        <button
          @click.stop.prevent="stepBackward"
          data-tooltip="Go back one frame"
          :disabled="!canStepBackward"
        >
          <font-awesome-icon icon="step-backward" />
        </button>
        <button
          @click.stop.prevent="stepForward"
          data-tooltip="Go forward one frame"
          :disabled="!canStepForward"
        >
          <font-awesome-icon icon="step-forward" />
        </button>
        <button
          @click.stop.prevent="showValueInfo = !showValueInfo"
          :class="{ selected: showValueInfo }"
          :data-tooltip="
            showValueInfo
              ? 'Disable picker'
              : 'Show raw pixel values under cursor'
          "
        >
          <font-awesome-icon icon="eye-dropper" />
        </button>
        <button
          @click.stop.prevent="trackHighlightMode = !trackHighlightMode"
          :class="{ selected: trackHighlightMode }"
          :data-tooltip="
            trackHighlightMode
              ? 'Disable highlight'
              : 'Highlight selected track'
          "
        >
          <font-awesome-icon icon="highlighter" />
        </button>
        <button
          @click.stop.prevent="polygonEditMode = !polygonEditMode"
          :class="{ selected: polygonEditMode }"
          :data-tooltip="
            polygonEditMode ? 'Disable polygon edit' : 'Edit polygons'
          "
        >
          <font-awesome-icon icon="draw-polygon" />
          <!--         draw-polygon, bezier-curve, vector-square -->
        </button>
        <button
          @click.stop.prevent="silhouetteMode = !silhouetteMode"
          :class="{ selected: silhouetteMode }"
          :data-tooltip="
            silhouetteMode ? 'Disable silhouettes' : 'Show silhouettes'
          "
        >
          <font-awesome-icon icon="burst" />
        </button>
        <button
          @click.stop.prevent="motionPathMode = !motionPathMode"
          :class="{ selected: motionPathMode }"
          :data-tooltip="
            motionPathMode ? 'Hide motion paths' : 'Show motion paths'
          "
        >
          <font-awesome-icon icon="route" />
        </button>
        <button
          :disabled="!hasBackgroundFrame"
          ref="showBackgroundFrame"
          :class="{ selected: isShowingBackgroundFrame }"
          data-tooltip="Press to show background frame"
          @click.stop.prevent="toggleBackground"
        >
          <font-awesome-icon icon="image" />
        </button>
      </div>
    </div>
    <div class="tracks-container">
      <tracks-scrubber
        class="player-tracks"
        :tracks="tracksIntermediate"
        :current-track="currentTrack"
        :total-frames="totalPlayableFrames"
        @change-playback-time="playbackTimeChanged"
        @start-scrub="startSeek"
        @end-scrub="endSeek"
        :playback-time="playbackTimeZeroOne"
      />
    </div>
  </div>
  <teleport v-if="displayHeaderInfo" to="#recording-status-modal">
    <div class="p-3">
      <pre v-if="header">{{ headerInfo }}</pre>
      <div class="d-flex">
        <button
          type="button"
          class="btn btn-outline-secondary mt-2 flex-grow-1"
          @click="() => emit('dismiss-header-info')"
        >
          Close
        </button>
      </div>
    </div>
  </teleport>
  <teleport v-if="exportRequested" to="#recording-status-modal">
    <div v-if="exportRequested === 'advanced' && !isExporting" class="p-3">
      <b-form-group label="Include tracks in exported timespan">
        <b-form-checkbox
          v-for="(track, index) in trackExportOptions"
          :key="index"
          v-model="track.includeInExportTime"
          >Track {{ index + 1 }} ({{
            displayLabelForClassificationLabel(
              framesByTrack[track.trackId][firstFrameNumForTrack(track.trackId)]
                .what
            )
          }})</b-form-checkbox
        >
      </b-form-group>
      <b-form-group label="Display track boxes in export">
        <b-form-checkbox
          v-for="(track, index) in trackExportOptions"
          :key="index"
          v-model="track.displayInExport"
          >Track {{ index + 1 }} ({{
            displayLabelForClassificationLabel(
              framesByTrack[track.trackId][firstFrameNumForTrack(track.trackId)]
                .what
            )
          }})</b-form-checkbox
        >
      </b-form-group>
      <div class="d-flex flex-column">
        <button
          type="button"
          class="btn btn-outline-secondary mt-2 flex-grow-1"
          @click="doAdvancedExport"
        >
          Export
        </button>
        <button
          type="button"
          class="btn btn-outline-danger mt-2 flex-grow-1"
          @click="cancelExport"
        >
          Cancel
        </button>
      </div>
    </div>
    <div v-else class="p-3">
      <span>Exporting...</span>
      <b-progress :value="exportProgress" striped animated></b-progress>
      <div class="d-flex">
        <button
          type="button"
          class="btn btn-outline-danger mt-2 flex-grow-1"
          @click="cancelExport"
        >
          Cancel
        </button>
      </div>
    </div>
  </teleport>
</template>
<style scoped lang="less">
.video-container {
  @media screen and (max-width: 1040px) {
    max-width: 640px;
  }
  @media screen and (min-width: 1041px) {
    width: 640px;
  }
  aspect-ratio: 4 / 3;
}
.cptv-player {
  background: #202731;

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
    bottom: 0;
    right: 0;
    width: 100%;
    height: 100%;
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
