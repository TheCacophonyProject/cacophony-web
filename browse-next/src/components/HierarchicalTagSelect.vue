<template>
  <LayeredDropdown
    :options="options"
    @input="$emit('input', $event)"
    :disabled="disabled"
    :placeholder="placeholder"
    :multiselect="multiselect"
  />
</template>
<script setup lang="ts">
import { getClassifications as apiGetClassifications } from "@api/Classifications";
import LayeredDropdown from "./LayeredDropdown.vue";
import { onMounted, ref } from "vue";
import type { Classification } from "@typedefs/api/trackTag";

const {
  disabled = false,
  exclude = [],
  placeholder = "Search Tags...",
  multiselect = false,
} = defineProps<{
  disabled?: boolean;
  exclude?: string[];
  placeholder?: string;
  multiselect?: boolean;
}>();

const options = ref<Classification>({ label: "", children: [] });

// FIXME - We shouldn't really need to request this every single time - perhaps only if the cwVersion has changed?
// What if we had a list of end-points that should be static within api versions, so we only fetch them once?
// Then we invalidate that cache if we get a different cwVersion for a non-static request.

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
    return {
      label,
      children,
    };
  }
  // FIXME - What's the actual error case here that's not caught in fetch?
  throw new Error("Could not get classifications");
};

const getClassifications = async (): Promise<Classification> => {
  const cached = localStorage.getItem("classifications");
  if (cached) {
    const parsed = JSON.parse(cached);
    apiGetClassifications(parsed.version).then(async (res) => {
      if (res.success && res.result.version !== parsed.version) {
        const classifications = await getFreshClassifications();
        setClassifications(classifications);
      }
    });
    return {
      label: parsed.label,
      children: parsed.children,
    };
  } else {
    return await getFreshClassifications();
  }
};

const setClassifications = (classifications: Classification) => {
  // classifications is a tree, we want to filter out excluded nodes
  const filter = (node: Classification) => {
    if (exclude.includes(node.label)) {
      return false;
    }
    if (node.children) {
      node.children = node.children.filter(filter);
    }
    return true;
  };
  if (classifications.children) {
    classifications.children = classifications.children.filter(filter);
  }
  options.value = classifications;
};
onMounted(async () => {
  const classifications = (await getClassifications()) as Classification;
  setClassifications(classifications);
});
</script>
