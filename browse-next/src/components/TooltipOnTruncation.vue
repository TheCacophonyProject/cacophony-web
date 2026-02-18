<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { BTooltip } from "bootstrap-vue-next";
const offsetWidth = ref(0);
const scrollWidth = ref(0);
const spanItem = ref<HTMLSpanElement>();
const isTruncated = computed<boolean>(() => {
  return offsetWidth.value < scrollWidth.value;
});

watch(
  () => spanItem.value?.offsetWidth,
  (next) => {
    offsetWidth.value = next || 0;
  },
);
watch(
  () => spanItem.value?.scrollWidth,
  (next) => {
    scrollWidth.value = next || 0;
  },
);

const fullText = computed(() => {
  return spanItem.value?.innerText;
});
</script>
<template>
  <span class="text-truncate" ref="spanItem"
    ><slot></slot
    ><b-tooltip
      hover
      v-if="isTruncated"
      :target="spanItem"
      teleport-to="body"
      >{{ fullText }}</b-tooltip
    >
  </span>
</template>

<style scoped></style>
