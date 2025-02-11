import type { RecordingLabel } from "@typedefs/api/group";

export const TagColours = [
  { background: "#32ff7e", foreground: "dark" },
  { background: "#4bcffa", foreground: "dark" },
  { background: "#ffdd59", foreground: "dark" },
  { background: "#0be881", foreground: "dark" },
  { background: "#00d8d6", foreground: "dark" },
  { background: "#a55eea", foreground: "light" },
  { background: "#ffcccc", foreground: "dark" },
];

export const DEFAULT_CAMERA_TAGS = [
  "possum",
  "rodent",
  "hedgehog",
  "cat",
  "bird",
  "mustelid",
  "false-positive",
  "unidentified",
];

export const DEFAULT_DASHBOARD_IGNORED_CAMERA_TAGS: string[] = [
  "none",
  "bird",
  "vehicle",
  "human",
  "insect",
];
export const DEFAULT_DASHBOARD_IGNORED_AUDIO_TAGS: string[] = ["noise"];

export const DEFAULT_AUDIO_TAGS = [
  "morepork",
  "kiwi",
  "kereru",
  "tui",
  "kea",
  "bellbird",
  "bird",
  "human",
  "unidentified",
];

export const COMMON_RECORDING_LABELS: RecordingLabel[] = [
  {
    text: "Cool",
    description: "Mark this as a cool or interesting recording",
  },
  {
    text: "Flagged for review",
    value: "requires review",
    description:
      "Flag this recording for review due to low confidence IDing track(s)",
  },
  {
    text: "Note",
    value: "note",
    description: "Add a note to this recording",
  },
];

export const DEFAULT_CAMERA_RECORDING_LABELS: RecordingLabel[] = [
  {
    text: "Animal in trap",
    value: "trapped in trap",
    description: "An animal is in a trap in this recording",
  },
  {
    text: "Animal interacted with trap",
    value: "interaction with trap",
    description: "An animal interacted with a trap in this recording",
  },
  {
    text: "Missed recording",
    description:
      "Missing an earlier recording that explains how the animal got to where it is now",
  },
  {
    text: "Missed track",
    description:
      "One or more animals do not have a corresponding track in this recording",
  },
  {
    text: "Multiple animals",
    description: "There is more than one animal in this recording",
  },
  // TODO Migrate users using these labels to custom labels
  // {
  //   text: "Outside",
  // },
  // {
  //   text: "Inside",
  // },
  // {
  //   text: "Incursion",
  // },
];

export const DEFAULT_AUDIO_RECORDING_LABELS: RecordingLabel[] = [
  {
    text: "Missed track",
    description:
      "One or more birds do not have a corresponding track in this recording",
  },
];
