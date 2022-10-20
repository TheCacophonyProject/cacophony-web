<template>
  <layered-dropdown
    :options="options"
    @input="$emit('input', $event)"
    :disabled="disabled"
    :placeholder="placeholder"
    :multiselect="multiselect"
  />
</template>
<script setup lang="ts">
import { getClassifications } from "@api/Classifications";
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
  // Get our own copy of classifications since we're going to mutate it.
  const classifications = (await getClassifications(
    setClassifications
  )) as Classification;
  setClassifications(classifications);
});
</script>
