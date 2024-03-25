import type { ApiRecordingResponse } from "@typedefs/api/recording";

export interface TagItem {
  human?: boolean;
  automatic?: boolean;
  what: string;
  path: string;
  displayName: string;
}

export const tagsForRecording = (
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
      }
    }
    // Just take the human tags for the track, fall back to automatic.
  }
  return Object.values(uniqueTags);
};
