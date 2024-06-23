<template>
  <b-link
    class="d-inline-flex align-items-center"
    v-if="to"
    :to="to"
    style="color: #666"
    variant="secondary"
    ><font-awesome-icon :icon="deviceTypeIcon" class="me-2" />
    <span class="me-2 me-md-0">{{ name }}</span
    ><font-awesome-icon
      icon="arrow-turn-down"
      :rotation="270"
      size="xs"
      class="ps-1 d-sm-inline-block d-md-none"
  /></b-link>
  <span class="d-inline-flex align-items-center" v-else
    ><font-awesome-icon :icon="deviceTypeIcon" class="me-2" /> {{ name }}</span
  ><span><slot></slot></span>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import type { DeviceType } from "@typedefs/api/consts.ts";
import { DeviceType as ConcreteDeviceType } from "@typedefs/api/consts.ts";
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
  to: RouteLocationRaw | null;
}>();

const deviceTypeIcon = computed<string>(() => {
  switch (props.type) {
    case ConcreteDeviceType.Audio:
      return "music";
    case ConcreteDeviceType.Thermal:
      return "video";
    case ConcreteDeviceType.Unknown:
      return "question";
    case ConcreteDeviceType.TrailCam:
      return "camera";
  }
  return "";
});
</script>

<style scoped></style>
