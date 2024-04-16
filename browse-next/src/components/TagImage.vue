<template>
  <image-loader
    :src="src"
    :width="width"
    :height="height"
    @image-not-found="tryLoadingParent"
    :alt="`${displayLabelForClassificationLabel(tag)} tag`"
  />
</template>

<script setup lang="ts">
import ImageLoader from "@/components/ImageLoader.vue";
import { computed, onBeforeMount, ref } from "vue";
import {
  displayLabelForClassificationLabel,
  flatClassifications,
  getClassifications,
} from "@api/Classifications";

const props = defineProps<{
  width: number | string;
  height: number | string;
  tag: string;
}>();

// Get the classifications, map the tag to its fully qualified hierarchical path.
const suppliedTag = ref<string>("");
const currentTag = computed<string>(() => {
  const parts = suppliedTag.value.split(".");
  if (parts.length > 1) {
    return parts.pop() as string;
  }
  return parts[0];
});

const pathForTag = (tag: string): string => {
  return flatClassifications.value[tag]?.path || tag;
};

onBeforeMount(async () => {
  await getClassifications();
  suppliedTag.value = pathForTag(props.tag);
});

const src = computed<string>(() => {
  return `/tag-icons/${currentTag.value}.svg`;
});

const tryLoadingParent = () => {
  const parts = suppliedTag.value.split(".");
  if (parts.length > 1) {
    parts.pop();
    suppliedTag.value = parts.join(".");
  }
};
</script>
