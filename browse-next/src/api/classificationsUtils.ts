import { computed, ref } from "vue";
import type { Classification } from "@typedefs/api/trackTag";
import { ClientApi } from "@/api";

const loadedClassificationsThisSession = ref(false);
export const classifications = ref<Classification | null>(null);

interface ClassificationInfo {
  label: string;
  display: string;
  path: string;
  biostatus?: string;
  status?: string;
  node: Classification;
  displayAudio: string;
}
const flattenNodes = (
  acc: Record<string, ClassificationInfo>,
  node: Classification,
) => {
  for (const child of node.children || []) {
    const parent = acc[node.label];
    const path = `${(parent && parent.path) || node.path || node.label}.${
      child.label
    }`;
    const childInfo: ClassificationInfo = {
      label: child.label,
      display: child.display || child.label,
      displayAudio: child.displayAudio || child.display || child.label,
      node: child,
      path,
    };
    if (child.biostatus) {
      childInfo.biostatus = child.biostatus;
    }
    if (child.status) {
      childInfo.status = child.status;
    }
    acc[child.label] = childInfo;
    if (child.aliases) {
      for (const alias of child.aliases) {
        acc[alias] = childInfo;
      }
    }
    flattenNodes(acc, child);
  }
  return acc;
};

const flattenNodesByPath = (
  acc: Record<string, ClassificationInfo>,
  node: Classification,
) => {
  const stack = [{ node, path: "" }];
  while (stack.length > 0) {
    const { node, path } = stack.pop() as {
      node: Classification;
      path: string;
    };
    const pathLabel = node.label.replaceAll(" ", "_");
    const newPath = path ? `${path}.${pathLabel}` : pathLabel;
    const childInfo: ClassificationInfo = {
      label: node.label,
      display: node.display || node.label,
      displayAudio: node.displayAudio || node.display || node.label,
      node,
      path: newPath,
    };
    if (node.biostatus) {
      childInfo.biostatus = node.biostatus;
    }
    if (node.status) {
      childInfo.status = node.status;
    }
    acc[newPath] = childInfo;
    if (node.aliases) {
      for (const alias of node.aliases) {
        const pathLabel = alias.replaceAll(" ", "_");
        const newPath = path ? `${path}.${pathLabel}` : pathLabel;
        acc[newPath] = childInfo;
      }
    }
    if (node.children && node.children.length > 0) {
      // Push children in REVERSE order to maintain left-to-right DFS traversal
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push({ node: node.children[i], path: newPath });
      }
    }
  }
  return acc;
};

// TODO: Move to provide/inject at App level
export const flatClassifications = computed<Record<string, ClassificationInfo>>(
  () => {
    if (classifications.value) {
      const nodes = flattenNodes({}, classifications.value);
      if (nodes.unknown) {
        nodes["unidentified"] = nodes["unknown"];
      }
      return nodes;
    }
    return {};
  },
);

export const flatClassificationsByPath = computed<
  Record<string, ClassificationInfo>
>(() => {
  if (classifications.value) {
    const nodes = flattenNodesByPath({}, classifications.value);
    if (nodes["all.other.unknown"]) {
      nodes["all.other.unidentified"] = nodes["all.other.unknown"];
    }
    return nodes;
  }
  return {};
});

const getFreshClassifications = async (): Promise<Classification> => {
  const res = await ClientApi.Classifications.apiGetClassifications();
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
      ClientApi.Classifications.apiGetClassifications(parsed.version).then(
        async (res) => {
          if (res && res.success && res.result.version !== parsed.version) {
            const classifications = await getFreshClassifications();
            cb && cb(classifications);
          }
        },
      );
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
    return "";
  }
  label = label.toLowerCase();
  if (label === "unclassified") {
    return "AI Queued";
  }
  if (label === "unidentified" && aiTag) {
    return "Unidentified";
  }
  if (label === "falsepositive") {
    label = "false-positive";
  }
  const classifications = flatClassifications.value;
  if (!classifications[label]) {
    return label;
  }
  const info = classifications[label] as ClassificationInfo;
  return isAudioContext ? info.displayAudio || info.display : info.display;
};

export const getPathForLabel = (label: string): string | undefined => {
  label = label.toLowerCase();
  const classifications = flatClassifications.value;
  if (!classifications[label]) {
    return;
  }
  return (classifications[label] as Classification).path;
};

export const getClassificationForLabel = (
  label: string,
): Classification | undefined => {
  if (!label) {
    console.warn("No label supplied");
  }
  label = label.toLowerCase();
  const classifications = flatClassifications.value;
  if (!classifications[label]) {
    return;
  }
  return classifications[label];
};
