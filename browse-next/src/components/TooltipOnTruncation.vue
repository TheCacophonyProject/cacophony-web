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
  <span class="text-truncate truncation-target" ref="spanItem"
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

<style scoped>
.truncation-target {
  /* `.text-truncate` (white-space: nowrap; overflow: hidden; text-overflow:
     ellipsis) needs a display mode that establishes its own box to actually
     clip, and needs to be shrinkable when it's a flex item, or it just
     overflows its container instead of ellipsizing. */
  display: inline-block;
  min-width: 0;
  max-width: 100%;
}
</style>
