export const TagColours = [
  { background: "#32ff7e", foreground: "dark" },
  { background: "#4bcffa", foreground: "dark" },
  { background: "#ffdd59", foreground: "dark" },
  { background: "#0be881", foreground: "dark" },
  { background: "#00d8d6", foreground: "dark" },
  { background: "#a55eea", foreground: "light" },
  { background: "#ffcccc", foreground: "dark" },
];

export const DEFAULT_TAGS = [
  "possum",
  "rodent",
  "hedgehog",
  "cat",
  "bird",
  "mustelid",
  "false-positive",
  "unidentified",
];

export const RecordingLabels = [
  { text: "Cool", description: "Mark this as a cool or interesting recording" },
  {
    text: "Flagged for review",
    value: "requires review",
    description:
      "Flag this recording for review due to low confidence IDing track(s)",
  },
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
];
