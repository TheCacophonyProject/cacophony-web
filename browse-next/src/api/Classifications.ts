import type { ApiClassificationResponse } from "@typedefs/api/trackTag";
import type { FetchResult } from "@api/types";
import CacophonyApi from "./api";
import type { Classification } from "@typedefs/api/trackTag";
import { computed, ref } from "vue";

const apiGetClassifications = (version?: string) =>
  CacophonyApi.get(
    `/api/v1/files/classifications${version ? `?version=${version}` : ""}`
  ) as Promise<FetchResult<ApiClassificationResponse>>;

const loadedClassificationsThisSession = ref(false);
export const classifications = ref<Classification | null>(null);

const flattenNodes = (
  acc: Record<string, { label: string; display: string }>,
  node: Classification
) => {
  for (const child of node.children || []) {
    acc[child.label] = {
      label: child.label,
      display: child.display || child.label,
    };
    flattenNodes(acc, child);
  }
  return acc;
};

export const flatClassifications = computed<
  Record<string, { label: string; display: string }>
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
    localStorage.setItem(
      "classifications",
      JSON.stringify({
        label,
        children,
        version,
      })
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
  cb?: (classifications: Classification) => void
): Promise<Classification> => {
  if (classifications.value === null) {
    const cached = localStorage.getItem("classifications");
    if (cached && !loadedClassificationsThisSession.value) {
      const parsed = JSON.parse(cached);
      apiGetClassifications(parsed.version).then(async (res) => {
        if (res.success && res.result.version !== parsed.version) {
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

export const displayLabelForClassificationLabel = (label: string) => {
  const classifications = flatClassifications.value || {};
  return (classifications[label] && classifications[label].display) || label;
};
