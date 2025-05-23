import type { ApiClassificationResponse } from "@typedefs/api/trackTag";
import type { FetchResult } from "@api/types";
import CacophonyApi from "./api";
import type { Classification } from "@typedefs/api/trackTag";
import { computed, ref } from "vue";

const apiGetClassifications = (version?: string) =>
  CacophonyApi.get(
    `/api/v1/files/classifications${version ? `?version=${version}` : ""}`,
  ) as Promise<FetchResult<ApiClassificationResponse>>;

const loadedClassificationsThisSession = ref(false);
export const classifications = ref<Classification | null>(null);

const flattenNodes = (
  acc: Record<
    string,
    { label: string; display: string; path: string; node: Classification; displayAudio: string }
  >,
  node: Classification,
) => {
  for (const child of node.children || []) {
    const parent = acc[node.label];
    const path = `${(parent && parent.path) || node.path || node.label}.${
      child.label
    }`;
    acc[child.label] = {
      label: child.label,
      display: child.display || child.label,
      displayAudio: child.displayAudio || child.display || child.label,
      node: child,
      path,
    };
    if (child.aliases) {
      for (const alias of child.aliases) {
        acc[alias] = acc[child.label];
      }
    }
    flattenNodes(acc, child);
  }
  return acc;
};

// TODO: Move to provide/inject at App level
export const flatClassifications = computed<
  Record<
    string,
    { label: string; display: string; displayAudio: string; path: string; node: Classification }
  >
>(() => {
  if (classifications.value) {
    const nodes = flattenNodes({}, classifications.value);
    if (nodes.unknown) {
      nodes["unidentified"] = nodes["unknown"];
    }
    return nodes;
  }
  return {};
});

const getFreshClassifications = async (): Promise<Classification> => {
  const res = await apiGetClassifications();
  if (res.success) {
    const { label, version, children } = res.result;

    // Hack in a general "animal" class.
    const mammals = children.find((item) => item.label === "mammal");
    const birds = children.find((item) => item.label === "bird");
    const other = children.find((item) => item.label === "other");
    const otherChildLabels: string[] = [
      "frog",
      "insect",
      "lizard",
      "part",
      "pest",
    ];
    const otherChildren = other?.children?.filter((item) =>
      otherChildLabels.includes(item.label),
    ) as Classification[];
    const animalChildren = [mammals, birds].filter(
      (item) => !!item,
    ) as Classification[];
    children.push({
      label: "animal",
      children: [...animalChildren, ...otherChildren],
    });

    localStorage.setItem(
      "classifications",
      JSON.stringify({
        label,
        children,
        version,
      }),
    );
    loadedClassificationsThisSession.value = true;
    return {
      label,
      children,
    };
  }
  // FIXME - What's the actual error case here that's not caught in fetch?
  throw new Error("Could not get classifications");
};

export const getClassifications = async (
  cb?: (classifications: Classification) => void,
): Promise<Classification> => {
  if (classifications.value === null) {
    const cached = localStorage.getItem("classifications");
    if (cached && !loadedClassificationsThisSession.value) {
      const parsed = JSON.parse(cached);
      apiGetClassifications(parsed.version).then(async (res) => {
        if (res && res.success && res.result.version !== parsed.version) {
          const classifications = await getFreshClassifications();
          cb && cb(classifications);
        }
      });
      loadedClassificationsThisSession.value = true;
      classifications.value = {
        label: parsed.label,
        children: parsed.children,
      };
    } else {
      classifications.value = await getFreshClassifications();
    }
  }
  return classifications.value;
};

export const displayLabelForClassificationLabel = (
  label: string,
  aiTag = false,
  isAudioContext = false,
) => {
  if (!label) {
    debugger;
  }
  label = label.toLowerCase();
  if (label === "unclassified") {
    return "AI Queued";
  }
  if (label === "unidentified" && aiTag) {
    return "Unidentified";
  }
  const classifications = flatClassifications.value || {};
  return (classifications[label] && (isAudioContext ? classifications[label].displayAudio || classifications[label].display : classifications[label].display)) || label;
};

export const getPathForLabel = (label: string): string => {
  label = label.toLowerCase();
  const classifications = flatClassifications.value || {};
  return classifications[label] && classifications[label].path;
};

export const getClassificationForLabel = (label: string): Classification => {
  if (!label) {
    debugger;
  }
  label = label.toLowerCase();
  const classifications = flatClassifications.value || {};
  return classifications[label];
};
