<template><font-awesome-icon :icon="deviceTypeIcon" /> {{ name }}</template>

<script lang="ts" setup>
import { computed } from "vue";

// NOTE: For some reason importing this enum from global consts fails :-/
enum DeviceType {
  Audio = "audio",
  Thermal = "thermal",

  Trailcam = "trailcam",
  Unknown = "unknown",
}

const { name, type } = defineProps<{
  name: string;
  type: DeviceType;
}>();

const deviceTypeIcon = computed<string>(() => {
  switch (type) {
    case DeviceType.Audio:
      return "music";
    case DeviceType.Thermal:
      return "video";
    case DeviceType.Unknown:
      return "question";
    case DeviceType.Trailcam:
      return "camera";
  }
  return "";
});
</script>

<style scoped></style>
