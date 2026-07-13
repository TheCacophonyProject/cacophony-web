<template>
  <b-link class="d-inline-flex" v-if="to" :to="to" variant="secondary">
    <span
      class="me-2 align-self-center position-relative d-none"
      :class="{ 'd-none': props.hideIcon }"
    >
      <material-symbol :name="deviceTypeIcon" size="1.125rem" class="me-2" />
      <material-symbol
        v-if="type === 'hybrid-thermal-audio'"
        name="music_video"
        size="1.125rem"
        class="me-2"
      />
    </span>
    <span class="me-2 me-md-0">{{ name }}</span>
  </b-link>
  <span
    v-else
    :class="{ 'overflow-hidden': truncate }"
    class="d-inline-flex justify-content-center align-items-center"
  >
    <span
      class="d-flex align-self-center position-relative"
      :class="{
        'ms-1': !props.noMargin,
        'me-2': !props.noMargin,
        'me-1': props.noMargin,
        'd-none': props.hideIcon,
      }"
    >
      <material-symbol :name="deviceTypeIcon" size="1.125rem" />
    </span>
    <span :class="[{ 'text-truncate': truncate }, nameClass]">
      {{ name }}
    </span> </span
  ><span v-if="slots.default"><slot></slot></span>
</template>

<script lang="ts" setup>
import { computed, useSlots } from "vue";
import {
  type DeviceType,
  DeviceType as ConcreteDeviceType,
} from "@typedefs/api/consts.ts";
import type { RouteLocationRaw } from "vue-router";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";
import type { IconsProp } from "@dbetka/vue-material-symbols/dist/jscache/icons-names";
import { BLink } from "bootstrap-vue-next";

const props = defineProps<{
  name: string;
  type: DeviceType;
  to?: RouteLocationRaw | null;
  color?: string;
  noMargin?: boolean;
  truncate?: boolean;
  nameClass?: string;
  hideIcon?: boolean;
}>();
const slots = useSlots();

const deviceTypeIcon = computed<IconsProp | "">(() => {
  switch (props.type) {
    case ConcreteDeviceType.Audio:
      return "music_note";
    case ConcreteDeviceType.Thermal:
    case ConcreteDeviceType.Hybrid:
      return "videocam";
    case ConcreteDeviceType.Unknown:
      return "question_mark";
  }
  return "";
});
</script>
