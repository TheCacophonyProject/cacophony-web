import viridis from "./viridis";
import plasma from "./plasma";
import magma from "./magma";
import inferno from "./inferno";

import defaultColourmap from "./DefaultColourmap";
import type { CptvHeader } from "./decoder";
type RgbZeroOneArray = [number, number, number][];
// Colour maps
const mapRgba = ([r, g, b]: [number, number, number]): number =>
  (255 << 24) | ((b * 255.0) << 16) | ((g * 255.0) << 8) | (r * 255.0);

const Viridis = Uint32Array.from((viridis as RgbZeroOneArray).map(mapRgba));
const Plasma = Uint32Array.from((plasma as RgbZeroOneArray).map(mapRgba));
const Inferno = Uint32Array.from((inferno as RgbZeroOneArray).map(mapRgba));
const Magma = Uint32Array.from((magma as RgbZeroOneArray).map(mapRgba));
const Default = Uint32Array.from(
  defaultColourmap.map(([r, g, b]) => (255 << 24) | (b << 16) | (g << 8) | r)
);
const GreyscaleSquared = new Uint32Array(256);
const Greyscale = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  const inc = i / 255;
  GreyscaleSquared[i] = mapRgba([inc * inc, inc * inc, inc * inc]);
  Greyscale[i] = mapRgba([inc, inc, inc]);
}

/**
 * Default Colour maps to use for rendering frames on both front-end and back-end.
 */
export const ColourMaps: readonly [string, Uint32Array][] = Object.freeze([
  ["Default", Default],
  ["Viridis", Viridis],
  ["Plasma", Plasma],
  ["Inferno", Inferno],
  ["Magma", Magma],
  ["Greyscale", Greyscale],
  ["Grayscale<sup>2</sup>", GreyscaleSquared],
]);

/**
 * Helper function for rendering a raw frame into an Rgba destination buffer
 * @param targetFrameBuffer (Uint8ClampedArray) - destination frame buffer.  Must be width * height * 4 length
 * @param frame (Uint16Array) - Source raw frame of width * height uint16 pixels
 * @param colourMap (Uint32Array) Array of Rgba colours in uin32 form for mapping into 0..255 space
 * @param min (number) min value to use for normalisation
 * @param max (number) max value to use for normalisation
 */
export const renderFrameIntoFrameBuffer = (
  targetFrameBuffer: Uint8ClampedArray,
  frame: Uint16Array,
  colourMap: Uint32Array,
  min: number,
  max: number
): void => {
  const frameBufferView = new Uint32Array(targetFrameBuffer.buffer);
  const range = max - min;
  for (let i = 0; i < targetFrameBuffer.length; i++) {
    const index = ((frame[i] - min) / range) * 255.0;
    const indexUpper = Math.ceil(index);
    frameBufferView[i] = colourMap[indexUpper];
  }
};

/**
 * Get the frame index at a given time offset, taking into account the presence of a background frame.
 * @param time {Number}
 * @param duration {Number}
 * @param fps {Number}
 * @param totalFramesIncludingBackground {Number}
 * @param hasBackgroundFrame {Boolean}
 */
export const getFrameIndexAtTime = (
  time: number,
  duration: number,
  fps: number,
  totalFramesIncludingBackground: number | false,
  hasBackgroundFrame: boolean
): number => {
  time = Math.max(0, Math.min(duration, time));
  if (totalFramesIncludingBackground === false) {
    totalFramesIncludingBackground = Math.floor(duration * fps);
  }
  return (
    Math.floor(
      Math.min(
        totalFramesIncludingBackground,
        (time / duration) * totalFramesIncludingBackground
      )
    ) + (hasBackgroundFrame ? -1 : 0)
  );
};

export const formatHeaderInfo = (header: CptvHeader | null): string | null => {
  if (header) {
    const {
      width,
      height,
      fps,
      deviceName,
      deviceId,
      previewSecs,
      brand,
      model,
      serialNumber,
      firmwareVersion,
      motionConfig,
      timestamp,
      hasBackgroundFrame,
      minValue,
      maxValue,
    } = header;
    const headerInfo: Record<
      string,
      string | boolean | number | Record<string, number | string>
    > = {
      dimensions: `${width} x ${height}`,
      fps,
      time: new Date(timestamp / 1000).toLocaleString(),
      "has background": hasBackgroundFrame,
      "preview seconds": previewSecs || 0,
    };
    if (deviceName) {
      headerInfo["device name"] = deviceName;
    }
    if (deviceId) {
      headerInfo["device ID"] = deviceId;
    }
    if (brand && model) {
      headerInfo["sensor"] = `${brand} ${model}`;
    }
    if (serialNumber) {
      headerInfo["serial"] = `#${serialNumber}`;
    }
    if (firmwareVersion) {
      headerInfo["firmware"] = firmwareVersion;
    }
    if (minValue !== undefined) {
      headerInfo["min value"] = minValue;
    }
    if (maxValue !== undefined) {
      headerInfo["max value"] = maxValue;
    }
    if (motionConfig) {
      headerInfo["motion config"] = motionConfig
        .split("\n")
        .reduce((acc: Record<string, number | string>, item: string) => {
          const parts = item.split(": ");
          if (Number(parts[1]).toString() == parts[1]) {
            acc[parts[0]] = Number(parts[1]);
          } else {
            acc[parts[0]] = parts[1];
          }
          return acc;
        }, {});
    }
    return JSON.stringify(headerInfo, null, "  ");
  } else {
    return null;
  }
};
