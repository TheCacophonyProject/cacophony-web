<script setup lang="ts">
import { computed, ref } from "vue";
import { BTooltip } from "bootstrap-vue-next";

// TODO: this is broken. Check recording modal view, device name when it's longer
const spanItem = ref<HTMLSpanElement>();
const isTruncated = computed<boolean>(() => {
  if (spanItem.value) {
    return spanItem.value.offsetWidth < spanItem.value.scrollWidth;
  }
  return false;
});

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

<style scoped lang="less"></style>
