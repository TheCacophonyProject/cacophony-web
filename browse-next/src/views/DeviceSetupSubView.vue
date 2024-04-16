<script lang="ts" setup>
import { provide, type Ref } from "vue";
import { computed, inject, onMounted, ref } from "vue";
import {
  getLatestStatusRecordingForDevice,
  getMaskRegionsForDevice,
  getReferenceImageForDeviceAtCurrentLocation,
} from "@api/Device";
import { selectedProjectDevices } from "@models/provides";
import type {
  ApiDeviceResponse,
  ApiMaskRegionsData,
} from "@typedefs/api/device";
import { useRoute } from "vue-router";
import type { DeviceId } from "@typedefs/api/common";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
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
const loading = ref<boolean>(true);

const latestStatusRecording = ref<ApiRecordingResponse | null>(null);
const latestReferenceImageURL = ref<string | null>(null);
const latestMaskRegions = ref<ApiMaskRegionsData | null>(null);

provide("latestMaskRegions", latestMaskRegions);
provide("latestReferenceImageURL", latestReferenceImageURL);
provide("latestStatusRecording", latestStatusRecording);

onMounted(async () => {
  if (device.value && device.value.type === "thermal") {
    const [latestReferenceImage, _, latestStatus] = await Promise.allSettled([
      getReferenceImageForDeviceAtCurrentLocation(device.value.id),
      getLatestMaskRegions(),
      getLatestStatusRecordingForDevice(device.value.id, device.value.groupId),
    ]);
    if (
      latestReferenceImage.status === "fulfilled" &&
      latestReferenceImage.value.success
    ) {
      latestReferenceImageURL.value = URL.createObjectURL(
        latestReferenceImage.value.result
      );
    }
    if (latestStatus.status === "fulfilled" && latestStatus.value) {
      latestStatusRecording.value = latestStatus.value;
    }
    loading.value = false;
  }
});

const getLatestMaskRegions = async () => {
  if (device.value) {
    const existingMaskRegions = await getMaskRegionsForDevice(device.value.id);
    if (existingMaskRegions.success) {
      latestMaskRegions.value = {
        maskRegions: existingMaskRegions.result.maskRegions,
      };
    }
  }
};

const updatedMaskRegions = (newMaskRegions: ApiMaskRegionsData) => {
  latestMaskRegions.value = newMaskRegions;
};

const hasReferencePhoto = computed<boolean>(() => {
  return !!latestReferenceImageURL.value;
});

const hasMaskRegionsDefined = computed<boolean>(() => {
  return (
    !!latestMaskRegions.value &&
    Object.values(latestMaskRegions.value.maskRegions).length !== 0
  );
});

const hasLatestRecordingInLocation = computed<boolean>(() => {
  return latestStatusRecording.value !== null;
});

const activeTabPath = computed(() => {
  return route.matched.map((item) => item.name);
});
</script>
<template>
  <div
    v-if="loading"
    class="d-flex justify-content-center align-items-center"
    style="min-height: 400px"
  >
    <b-spinner />
  </div>
  <div
    v-else-if="!hasLatestRecordingInLocation"
    class="d-flex justify-content-center align-items-center"
    style="min-height: 400px"
  >
    <p>
      Return here when your camera has made a recording in its current location.
    </p>
  </div>
  <div v-else>
    <h6 class="d-none d-md-block mt-md-3">Camera setup checklist</h6>
    <div class="d-flex flex-lg-row flex-column justify-content-lg-between">
      <div
        class="d-flex py-2 justify-content-around flex-column justify-content-md-start"
      >
        <b-button
          variant="light"
          class="checklist-btn"
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
          variant="light"
          class="mt-2 checklist-btn"
          :to="{ name: 'define-masking' }"
          :active="activeTabPath.includes('define-masking')"
        >
          <font-awesome-icon
            :icon="
              hasMaskRegionsDefined
                ? ['far', 'circle-check']
                : ['far', 'circle']
            "
          />
          Define mask regions (optional)</b-button
        >
      </div>
      <router-view
        @updated-regions="updatedMaskRegions"
        class="right-column"
      ></router-view>
    </div>
  </div>
</template>
<style lang="less">
.checklist-btn.btn {
  text-align: left;
}
@media screen and (min-width: 992px) {
  .checklist-btn {
    //max-width: 30svh;
  }
  .right-column {
    max-width: 640px;
  }
}
</style>
