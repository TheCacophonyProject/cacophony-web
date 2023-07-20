<template>
  <font-awesome-icon :icon="deviceTypeIcon" class="me-2" /> {{ name }}
</template>

<script lang="ts" setup>
import { computed } from "vue";
import type { DeviceType } from "@typedefs/api/consts.ts";
import { DeviceType as ConcreteDeviceType } from "@typedefs/api/consts.ts";

// NOTE: For some reason importing this enum from global consts fails :-/
// enum DeviceType {
//   Audio = "audio",
//   Thermal = "thermal",
//
//   Trailcam = "trailcam",
//   Unknown = "unknown",
// }

const { name, type } = defineProps<{
  name: string;
  type: DeviceType;
}>();

const deviceTypeIcon = computed<string>(() => {
  switch (type) {
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
