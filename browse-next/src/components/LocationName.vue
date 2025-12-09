<script setup lang="ts">
import { MaterialSymbol } from "@dbetka/vue-material-symbols";
import type { RouteLocationRaw } from "vue-router";
import {BLink} from "bootstrap-vue-next";
defineProps<{
  name: string;
  to?: RouteLocationRaw;
}>();
</script>

<template>
  <b-link
    class="d-inline-flex align-items-center"
    v-if="to"
    :to="to"
    variant="secondary"
  >
    <material-symbol name="location_on" size="1.25rem" class="me-1" />
    {{ name }}
  </b-link>
  <span class="d-inline-flex align-items-center" v-else>
    <material-symbol name="location_on" size="1.25rem" class="me-1" />{{
      name
    }}</span
  >
</template>
