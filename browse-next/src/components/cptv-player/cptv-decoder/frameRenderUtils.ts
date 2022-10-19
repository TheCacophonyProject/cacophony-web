import viridis from "scale-color-perceptual/rgb/viridis.json";
import plasma from "scale-color-perceptual/rgb/plasma.json";
import magma from "scale-color-perceptual/rgb/magma.json";
import inferno from "scale-color-perceptual/rgb/inferno.json";

import defaultColourmap from "./DefaultColourmap.js";
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
