<script setup lang="ts">
import {MaterialSymbol} from "@dbetka/vue-material-symbols";
import type {RouteLocationRaw} from "vue-router";
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
      <span class="location-name d-inline-flex">
        <material-symbol
            name="location_on"
            size="1.25rem"
            class="me-1"
        />
        {{ name }}
      </span>
    </b-link>
    <span class="d-inline-flex align-items-center" v-else>
      <span class="location-name d-inline-flex">
         <material-symbol
           name="location_on"
           size="1.25rem"
           class="me-1"
         />{{ name }}</span>
      </span>

</template>

<style scoped lang="less">
  .location-name {
    word-break: break-word;
  }
</style>