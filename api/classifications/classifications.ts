import Classifications from "@/classifications/classification.json" assert { type: "json" };
import type { Classification } from "@typedefs/api/trackTag.js";

const flattenNodes = (
  acc: Record<string, { label: string; display: string; path: string }>,
  node: Classification,
  parentPath: string,
) => {
  for (const child of node.children || []) {
    acc[child.label] = {
      label: child.label,
      display: child.display || child.label,
      path: `${parentPath}.${child.label}`,
    };
    flattenNodes(acc, child, acc[child.label].path);
  }
  return acc;
};

export const flatClassifications = (() => {
  const nodes = flattenNodes({}, Classifications, "all");
  if (nodes.unknown) {
    nodes["unidentified"] = nodes["unknown"];
  }
  return nodes;
})();

export const displayLabelForClassificationLabel = (
  label: string,
  aiTag = false,
  isAudioContext = false,
) => {
  label = label.toLowerCase();
  if (label === "unclassified") {
    return "AI Queued";
  }
  if (label === "unidentified" && aiTag) {
    return "Unidentified";
  }
  const classifications = flatClassifications;
  if ((label === "human" || label === "person") && !isAudioContext) {
    return "human";
  }
  return (classifications[label] && classifications[label].display) || label;
};
