import type { CptvFrame } from "@/components/cptv-player/cptv-decoder/decoder";
import type {
  FrameNum,
  TrackBox,
  Rectangle,
} from "@/components/cptv-player/cptv-player-types";

let minValue = Number.MIN_VALUE;
let maxValue = Number.MAX_VALUE;

export const minMaxForFrame = ({ meta }: CptvFrame): [number, number] => {
  if (meta.isBackgroundFrame) {
    return [minValue, maxValue];
  }
  const lastFfcTimeMs = meta.lastFfcTimeMs || 1000000;
  const timeSinceLastFFC = (meta.timeOnMs - lastFfcTimeMs) / 1000;
  if (timeSinceLastFFC < 5) {
    // Use frame local min/max
    return [meta.imageData.min, meta.imageData.max];
  }
  return [minValue, maxValue];
};

export const minMaxForTrackBox = (
  trackBox: TrackBox,
  { meta, data }: CptvFrame
): [number, number] => {
  if (meta.isBackgroundFrame) {
    return [minValue, maxValue];
  }
  const { width } = meta.imageData;
  const [left, top, right, bottom] = trackBox.rect;
  let min = Number.MAX_VALUE;
  let max = Number.MIN_VALUE;
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const index = y * width + x;
      const value = data[index];
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  return [min, max];
};

export const accumulateMinMaxForFrame = (frame: CptvFrame) => {
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
    minValue = Math.min(minValue, frameMinValue);
    maxValue = Math.max(maxValue, frameMaxValue);

    // Push the max up so we've got enough dynamic range.
    const AVERAGE_HEADROOM_OVER_BACKGROUND = 300;
    maxValue = Math.max(
      Math.max(maxValue, frameMaxValue),
      Math.min(1 << 16, minValue + AVERAGE_HEADROOM_OVER_BACKGROUND)
    );
  }
};

export const resetRecordingNormalisation = () => {
  minValue = Number.MAX_VALUE;
  maxValue = Number.MIN_VALUE;
};

export const minMaxForTracks = (
  trackBoxes: [FrameNum, Rectangle][][],
  frameToCheck: CptvFrame
): [number, number] => {
  // Usage: maybe just pass in the background frame here, and all the tracks?
  let min = Number.MAX_VALUE;
  let max = Number.MIN_VALUE;
  const { meta, data } = frameToCheck;
  const { width } = meta.imageData;
  //debugger;
  for (const track of trackBoxes) {
    for (const [_, rect] of track) {
      const [left, top, right, bottom] = rect;
      for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) {
          const index = y * width + x;
          const value = data[index];
          min = Math.min(min, value);
          max = Math.max(max, value);
        }
      }
    }
  }
  return [min, max];
};

export const minMaxForTrack = (
  trackBoxes: TrackBox[],
  framesToCheck: CptvFrame[]
): [number, number] => {
  let min = Number.MAX_VALUE;
  let max = Number.MIN_VALUE;
  for (let i = 0; i < framesToCheck.length; i++) {
    const { meta, data } = framesToCheck[i];
    if (meta.isBackgroundFrame) {
      continue;
    }
    const { width } = meta.imageData;
    const trackBox = trackBoxes[i];
    const [left, top, right, bottom] = trackBox.rect;
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const index = y * width + x;
        const value = data[index];
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    }
  }

  return [min, max];
};
