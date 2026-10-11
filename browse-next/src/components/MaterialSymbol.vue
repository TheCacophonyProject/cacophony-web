<script setup lang="ts">
//const props = defineProps<{name:string, size?:string}>();

import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    name: string;
    size?: string;
    style?: string;
    filled?: boolean;
    grade?: "thin" | "medium" | "bold";
  }>(),
  {
    size: "1.5rem",
    filled: false,
    grade: "medium",
  },
);

const styles = computed<string>(() => {
  let allStyles = `font-size: ${props.size};`;

  const fontVariationSettings = `font-variation-settings: "FILL" ${props.filled ? "1" : "0"}, "wght" 300, "GRAD" ${props.grade}, "opsz" 24;`;

  allStyles += fontVariationSettings;

  if (props.style) {
    allStyles += props.style;
  }

  return allStyles;
});
</script>

<template>
  <span class="material-symbols-outlined" :style="styles">{{ name }}</span>
</template>

<style scoped lang="less"></style>
