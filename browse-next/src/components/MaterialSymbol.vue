<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    name: string;
    size?: string;
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
  return `font-size: ${props.size};font-variation-settings: "FILL" ${props.filled ? "1" : "0"}, "wght" 300, "GRAD" ${props.grade}, "opsz" 24;`;
});
</script>

<template>
  <span class="material-symbols-outlined" :style="styles">{{ name }}</span>
</template>

<style scoped lang="less"></style>
