<script setup lang="ts">
import { MaterialSymbol } from "@dbetka/vue-material-symbols";
import type { RouteLocationRaw } from "vue-router";
import { BLink } from "bootstrap-vue-next";
defineProps<{
  name: string;
  to?: RouteLocationRaw;
  truncate?: boolean;
}>();
</script>

<template>
  <b-link
    class="d-inline-flex align-items-center"
    :class="{ 'overflow-hidden': truncate }"
    v-if="to"
    :to="to"
    variant="secondary"
  >
    <span
      class="location-name d-inline-flex align-items-center"
      :class="{ 'overflow-hidden': truncate }"
    >
      <material-symbol name="location_on" size="1.125rem" class="me-1" />
      {{ name }}
    </span>
  </b-link>
  <span
    v-else
    class="location-name-wrapper d-inline-flex"
    :class="{ 'overflow-hidden': truncate }"
  >
    <span
      class="location-name d-inline-flex align-items-center"
      :class="{ 'overflow-hidden': truncate }"
    >
      <material-symbol name="location_on" size="1.125rem" class="me-1" />
      <span :class="{ 'text-truncate': truncate }">{{ name }}</span>
    </span>
  </span>
</template>

<style scoped lang="less">
.location-name {
  word-break: break-word;
}
</style>
