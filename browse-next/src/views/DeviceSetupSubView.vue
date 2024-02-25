<script lang="ts" setup>
import type { Ref } from "vue";
import { computed, inject, onMounted, ref } from "vue";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import {
  getLatestStatusRecordingForDevice,
  getReferenceImageForDeviceAtCurrentLocation,
} from "@api/Device";
import { selectedProjectDevices } from "@models/provides";
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
      devices.value.find(
        (device: ApiDeviceResponse) => device.id === deviceId
      )) ||
    null
  );
});
const latestReferenceImageURL = ref<string | null>(null);
const latestStatusRecording = ref<ApiRecordingResponse | null>(null);

onMounted(async () => {
  if (device.value && device.value.type === "thermal") {
    const [latestReferenceImage, _] = await Promise.allSettled([
      getReferenceImageForDeviceAtCurrentLocation(device.value.id),
      loadLatestStatusFrame(),
    ]);
    if (
      latestReferenceImage.status === "fulfilled" &&
      latestReferenceImage.value.success
    ) {
      latestReferenceImageURL.value = URL.createObjectURL(
        latestReferenceImage.value.result
      );
    }
  }
});

const loadLatestStatusFrame = async () => {
  if (device.value && (device.value as ApiDeviceResponse).type === "thermal") {
    const latestStatus = await getLatestStatusRecordingForDevice(
      device.value.id,
      device.value.groupId
    );
    if (latestStatus) {
      latestStatusRecording.value = latestStatus;
    }
  }
};

const hasReferencePhoto = computed<boolean>(() => {
  return !!latestReferenceImageURL.value;
});

const hasMaskRegionsDefined = computed<boolean>(() => {
  // TODO
  return false;
});

const activeTabPath = computed(() => {
  return route.matched.map((item) => item.name);
});
</script>
<template>
  <div>
    <h6 class="d-none d-md-block">Setup checklist</h6>
    <div
      class="d-flex py-2 justify-content-around flex-md-column justify-content-md-start"
    >
      <b-button
        variant="outline-secondary"
        :to="{ name: 'reference-photo' }"
        :active="activeTabPath.includes('reference-photo')"
      >
        <font-awesome-icon
          :icon="
            hasReferencePhoto ? ['far', 'circle-check'] : ['far', 'circle']
          "
        />
        Set a reference photo</b-button
      >
      <b-button
        variant="outline-secondary"
        :to="{ name: 'define-masking' }"
        :active="activeTabPath.includes('define-masking')"
      >
        <font-awesome-icon
          :icon="
            hasMaskRegionsDefined ? ['far', 'circle-check'] : ['far', 'circle']
          "
        />
        Define mask regions (optional)</b-button
      >
    </div>
    <router-view></router-view>
  </div>
</template>
<style scoped lang="less"></style>
