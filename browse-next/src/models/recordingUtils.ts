import type { ApiRecordingResponse } from "@typedefs/api/recording";

export interface TagItem {
  human?: boolean;
  automatic?: boolean;
  what: string;
  path: string;
  displayName: string;
  count: number;
}

export const canonicalTagsForRecording = (
  recording: ApiRecordingResponse
): TagItem[] => {
  // Get unique tags for recording, and compile the taggers.
  const uniqueTags: Record<string, TagItem> = {};
  for (const track of recording.tracks) {
    const uniqueTrackTags: Record<string, TagItem> = {};
    let isHumanTagged = false;
    for (const tag of track.tags) {
      uniqueTrackTags[tag.what] = uniqueTrackTags[tag.what] || {
        human: false,
        automatic: false,
        what: tag.what,
        path: tag.path,
        displayName: tag.what,
        count: 0,
      };

      const existingTag = uniqueTrackTags[tag.what];
      if (!existingTag.human && !tag.automatic) {
        isHumanTagged = true;
        existingTag.human = !tag.automatic;
      }
      if (!existingTag.automatic && tag.automatic) {
        existingTag.automatic = tag.automatic;
      }
    }
    for (const tag of Object.values(uniqueTrackTags)) {
      if ((isHumanTagged && tag.human) || (!isHumanTagged && tag.automatic)) {
        uniqueTags[tag.what] = uniqueTags[tag.what] || tag;
        uniqueTags[tag.what].count++;
      }
    }
    // Just take the human tags for the track, fall back to automatic.
  }
  return Object.values(uniqueTags);
};

export const humanTagsForRecording = (
  recording: ApiRecordingResponse
): TagItem[] => {
  // Get unique tags for recording, and compile the taggers.
  const uniqueTags: Record<string, TagItem> = {};
  for (const track of recording.tracks) {
    const uniqueTrackTags: Record<string, TagItem> = {};
    for (const tag of track.tags.filter((tag) => !tag.automatic)) {
      uniqueTrackTags[tag.what] = uniqueTrackTags[tag.what] || {
        human: true,
        automatic: false,
        what: tag.what,
        path: tag.path,
        displayName: tag.what,
        count: 0,
      };
    }
    for (const tag of Object.values(uniqueTrackTags)) {
      uniqueTags[tag.what] = uniqueTags[tag.what] || tag;
      uniqueTags[tag.what].count++;
    }
  }
  return Object.values(uniqueTags);
};

export const aiTagsForRecording = (
  recording: ApiRecordingResponse
): TagItem[] => {
  // Get unique tags for recording, and compile the taggers.
  const uniqueTags: Record<string, TagItem> = {};
  for (const track of recording.tracks) {
    const uniqueTrackTags: Record<string, TagItem> = {};
    for (const tag of track.tags.filter((tag) => tag.automatic)) {
      uniqueTrackTags[tag.what] = uniqueTrackTags[tag.what] || {
        human: false,
        automatic: true,
        what: tag.what,
        path: tag.path,
        displayName: tag.what,
        count: 0,
      };
    }
    for (const tag of Object.values(uniqueTrackTags)) {
      uniqueTags[tag.what] = uniqueTags[tag.what] || tag;
      uniqueTags[tag.what].count++;
    }
  }
  return Object.values(uniqueTags);
};
