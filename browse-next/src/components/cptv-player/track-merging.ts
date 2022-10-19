// IDEA: collapse tracks that are part of the same overall tracks here, and track all their ids as aliases.
//  If a user tags one of them, tag all the ids with the same tag.  Easier than consolidating the tracks on the
//  backend side when they're inserted.  If the AI disagrees for each part of the track, find some way of choosing
//  which one to display.
import type { Rectangle } from "@/components/cptv-player/cptv-player-types";

const _trackDirection = (_trackPositions: Rectangle[]) => {
  // Get a vector of the track overall direction, so we can compare it to other tracks.
  // Maybe just during the overlap phase.
  return;
};

const _trackSpeed = (_trackPositions: Rectangle[]) => {
  // Get a metric for the track speed, to be compared with tracks we might want to merge with.
  // Maybe just during the overlap phase.
  return;
};

export const rectanglesIntersect = (a: Rectangle, b: Rectangle): boolean => {
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
};

const _intersection = (a: Rectangle, b: Rectangle): Rectangle => {
  // return the intersection rect of two rects
  return [
    Math.max(a[0], b[0]),
    Math.max(a[1], b[1]),
    Math.min(a[2], b[2]),
    Math.min(a[3], b[3]),
  ];
};

const _union = (a: Rectangle, b: Rectangle): Rectangle => {
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3]),
  ];
};
