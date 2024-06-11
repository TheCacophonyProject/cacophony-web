<script setup lang="ts">
import { computed, inject, onBeforeMount, type Ref } from "vue";
import { selectedProjectDevices } from "@models/provides.ts";
import type { ApiDeviceResponse } from "@typedefs/api/device";
import { useRoute } from "vue-router";
import type { DeviceId } from "@typedefs/api/common";

const devices = inject(selectedProjectDevices) as Ref<
  ApiDeviceResponse[] | null
>;
const route = useRoute();
const deviceId = Number(route.params.deviceId) as DeviceId;
const device = computed<ApiDeviceResponse | null>(() => {
  return (
    (devices.value &&
      (devices.value as ApiDeviceResponse[]).find(
        (device: ApiDeviceResponse) => device.id === deviceId
      )) ||
    null
  );
});

onBeforeMount(() => {
  // Load distinct event types for device.
  // Provide filtering over those event types.
  // Provide lazy loading of the events
  // Mobile and desktop views of cards vs table?
  // Event timelines?
  // Events grouped by day?
});
</script>

<template>
  <div>{{ device }}</div>
</template>

<style scoped lang="less"></style>
