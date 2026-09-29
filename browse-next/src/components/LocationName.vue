<script setup lang="ts">
import { MaterialSymbol } from "@dbetka/vue-material-symbols";
import type { RouteLocationRaw } from "vue-router";
import TooltipOnTruncation from "@/components/TooltipOnTruncation.vue";
const props = withDefaults(
  defineProps<{
    name: string;
    to?: RouteLocationRaw;
    icon?: boolean;
    truncate?: boolean;
    iconSize?: number;
  }>(),
  {
    icon: true,
    truncate: false,
    iconSize: 1.125,
  },
);
</script>

<template>
  <span
    class="location-name-wrapper d-inline-flex"
    :class="{ 'overflow-hidden': truncate }"
  >
    <span
      class="location-name d-inline-flex align-items-center"
      :class="{ 'overflow-hidden': truncate }"
    >
      <material-symbol
        name="location_on"
        :size="`${iconSize}rem`"
        class="me-1"
        v-if="icon"
      />
      <tooltip-on-truncation v-if="truncate">{{ name }}</tooltip-on-truncation>
      <span v-else class="lh-sm">{{ name }}</span>
    </span>
  </span>
</template>

<style scoped lang="less">
.location-name-wrapper {
  // A flex item's default min-width is `auto` (its content's natural size),
  // which prevents it ever shrinking small enough for the nested truncated
  // text to actually ellipsize when this component is used inside a flex
  // row (e.g. a modal header) alongside other content.
  min-width: 0;
}
.location-name {
  word-break: break-word;
  min-width: 0;
}
</style>
