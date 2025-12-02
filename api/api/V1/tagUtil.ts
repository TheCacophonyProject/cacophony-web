/*
This handles creation of Visits from recordings

A visit is a all tracks that occur within eventMaxTimeSeconds of each other
A Visit is made up of many VisitEvents.
VisitEvents are distinct viewings of a species, defined by a TrackTag
A visit is assumed to be the tag that occurs the most in the visitevents

All tracks of a recording always belong to the same visit
*/

// FIXME - This file seems to be in the wrong place - this folder is full of API endpoints...
import type { TrackTag } from "@models/TrackTag.js";
import { AI_MASTER } from "@models/TrackTag.js";
import { flatClassifications } from "@/classifications/classifications.js";
const conflictTag = "conflicting tags";

export const META_TAGS = ["part", "poor tracking"];
export const UNIDENTIFIED_TAGS = ["unidentified", "unknown"];
export const NON_ANIMAL_TAGS = [...META_TAGS, ...UNIDENTIFIED_TAGS];
export const getCommonAncestorForTags = (tags: string[]): string => {
  // Find common parents of classifications.
  const classes = tags
    .map((tag) => flatClassifications[tag])
    .filter((classification) => classification !== undefined);
  const commonAncestors = new Map();
  for (const classification of classes) {
    const path = classification.path.split(".");
    while (path.length > 2) {
      path.shift();
    }
    while (path.length) {
      // Don't include all
      const piece = path.pop();
      // Only add the piece if all classes agree on it.
      const someOthersAgree = classes.some(
        (c) => c !== classification && c.path.includes(piece),
      );
      if (someOthersAgree) {
        if (commonAncestors.has(piece)) {
          commonAncestors.set(piece, commonAncestors.get(piece) + 1);
        } else {
          commonAncestors.set(piece, 1);
        }
      }
    }
  }
  let bestCount = 0;
  let bestKey = "";
  for (const [key, count] of commonAncestors) {
    if (count > bestCount) {
      bestCount = count;
      bestKey = key;
    }
  }
  return bestKey;
};

// From all tags return a single tag by precedence:
// first, this users tag, or any other humans tag, else the original AI
export function getCanonicalTrackTag(
  trackTags: TrackTag[],
): TrackTag | undefined | null {
  if (trackTags.length == 0) {
    return null;
  }
  const manualTags = trackTags.filter(
    (tag) => !tag.automatic && !META_TAGS.includes(tag.what),
  );
  const animalTags = manualTags.filter(
    (tag) => !NON_ANIMAL_TAGS.includes(tag.what),
  );

  // NOTE - Conflicting tags aren't actually conflicts if users agree on the super-species of the tag to some extent:
  //  i.e. Rodent + mouse shouldn't be counted as conflicting, but mammal + rodent or mammal + mouse should be.
  const uniqueTags = new Set(animalTags.map((tag) => tag.what));
  if (uniqueTags.size > 1) {
    const commonAncestor = getCommonAncestorForTags(
      Array.from(uniqueTags.values()),
    );
    const conflict = {
      what: commonAncestor === "all" ? conflictTag : commonAncestor,
      confidence: manualTags[0].confidence,
      automatic: false,
      data: { userTagsConflict: true },
    };
    return conflict as TrackTag;
  }
  const masterTag = trackTags.filter((tag) => tag.model === AI_MASTER);
  return animalTags.shift() || manualTags.shift() || masterTag.shift();
}
