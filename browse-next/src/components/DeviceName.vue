<template>
  <b-link
    class="d-inline-flex align-items-center"
    v-if="to"
    :to="to"
    style="color: #666"
    variant="secondary"
  >
    <span class="ms-1 me-2 align-self-center position-relative">
      <font-awesome-icon :icon="deviceTypeIcon" class="me-2" />
      <font-awesome-icon
        v-if="type === 'hybrid-thermal-audio'"
        icon="music"
        class="position-absolute inner-icon align-self-center"
        size="xs"
        color="white"
      />
    </span>
    <span class="me-2 me-md-0">{{ name }}</span
    ><font-awesome-icon
      icon="arrow-turn-down"
      :rotation="270"
      size="xs"
      class="ps-1 d-sm-inline-block d-md-none align-self-center"
    />
  </b-link>
  <span class="d-inline-flex align-items-center" v-else>
    <span
      class="align-self-center position-relative"
      :class="{
        'ms-1': !props.noMargin,
        'me-2': !props.noMargin,
        'me-1': props.noMargin,
      }"
      ><font-awesome-icon
        :icon="deviceTypeIcon"
        :color="props.color || 'inherit'"
      />
      <font-awesome-icon
        v-if="type === 'hybrid-thermal-audio'"
        icon="music"
        class="position-absolute inner-icon align-self-center"
        size="xs"
        color="white"
      />
    </span>
    {{ name }}</span
  ><span><slot></slot></span>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import {
  type DeviceType,
  DeviceType as ConcreteDeviceType,
} from "@typedefs/api/consts.ts";
import type { RouteLocationRaw } from "vue-router";

// NOTE: For some reason importing this enum from global consts fails :-/
// enum DeviceType {
//   Audio = "audio",
//   Thermal = "thermal",
//
//   Trailcam = "trailcam",
//   Unknown = "unknown",
// }

const props = defineProps<{
  name: string;
  type: DeviceType;
  to?: RouteLocationRaw | null;
  color?: string;
  noMargin?: boolean;
}>();

const deviceTypeIcon = computed<string>(() => {
  switch (props.type) {
    case ConcreteDeviceType.Audio:
      return "music";
    case ConcreteDeviceType.Thermal:
    case ConcreteDeviceType.Hybrid:
      return "video";
    case ConcreteDeviceType.Unknown:
      return "question";
    case ConcreteDeviceType.TrailCam:
      return "camera";
  }
  return "";
});
</script>

<style scoped lang="less">
.inner-icon {
  left: -0.5px;
  top: 25%;
  scale: 70%;
}
</style>
