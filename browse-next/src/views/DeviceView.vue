<script setup lang="ts">
import { useRoute } from "vue-router";
import type {
  ApiDeviceResponse,
  ApiMaskRegionsData,
} from "@typedefs/api/device";
import { provide, type Ref } from "vue";
import { computed, inject, onBeforeMount, ref } from "vue";
import { projectDevicesLoaded, userProjectsLoaded } from "@models/LoggedInUser";
import type { DeviceId } from "@typedefs/api/common";
import { selectedProjectDevices } from "@models/provides";
import { DeviceType } from "@typedefs/api/consts.ts";
import OverflowingTabList from "@/components/OverflowingTabList.vue";
import type { LoadedResource } from "@api/types.ts";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import {
  getLatestStatusRecordingForDevice,
  getMaskRegionsForDevice,
  getReferenceImageForDeviceAtCurrentLocation,
} from "@api/Device.ts";

const route = useRoute();
const emit = defineEmits(["close", "start-blocking-work", "end-blocking-work"]);

const projectDevices = inject(selectedProjectDevices) as Ref<
  ApiDeviceResponse[] | null
>;
const latestStatusRecording = ref<LoadedResource<ApiRecordingResponse>>(null);
const latestReferenceImageURL = ref<LoadedResource<string>>(null);
const latestMaskRegions = ref<LoadedResource<ApiMaskRegionsData>>(null);

provide("latestStatusRecording", latestStatusRecording);
provide("latestMaskRegions", latestMaskRegions);
provide("latestReferenceImageURL", latestReferenceImageURL);

const deviceLoading = ref<boolean>(false);
const device = ref<ApiDeviceResponse | null>(null);
const loadDevice = async (deviceId: DeviceId) => {
  deviceLoading.value = true;
  await Promise.all([userProjectsLoaded(), projectDevicesLoaded()]);
  if (projectDevices.value) {
    const targetDevice = (projectDevices.value as ApiDeviceResponse[]).find(
      ({ id }) => id === deviceId
    );
    if (targetDevice) {
      device.value = targetDevice;
    } else {
      // TODO: Device not found
    }
  }

  // TODO: Get the device station
  // TODO: Get the device events
  // TODO: Get the device software version info.
  // TODO: Get the device schedules
  deviceLoading.value = false;
};

const loadReferenceImage = (deviceId: DeviceId) => {
  latestReferenceImageURL.value = null;
  getReferenceImageForDeviceAtCurrentLocation(deviceId).then(
    ({ result, success }) => {
      if (success) {
        latestReferenceImageURL.value = URL.createObjectURL(result);
      } else {
        latestReferenceImageURL.value = false;
      }
    }
  );
};

onBeforeMount(async () => {
  await loadDevice(Number(route.params.deviceId) as DeviceId);
  if (
    device.value &&
    [DeviceType.Thermal, DeviceType.Hybrid].includes(device.value.type)
  ) {
    //  TODO: Latest status recording should match current location.
    //  TODO: Use meta/status to get low power 2s recordings
    getLatestStatusRecordingForDevice(
      device.value.id,
      device.value.groupId
    ).then((result) => (latestStatusRecording.value = result));
    loadReferenceImage(device.value.id);
    getMaskRegionsForDevice(device.value.id).then(({ success, result }) => {
      if (success) {
        latestMaskRegions.value = {
          maskRegions: result.maskRegions,
        };
      } else {
        latestMaskRegions.value = false;
      }
    });
  }
});

const activeTabPath = computed(() => {
  return route.matched.map((item) => item.name);
});
const navLinkClasses = ["nav-item", "nav-link", "border-0"];

const _deviceType = computed<string>(() => {
  if (device.value) {
    switch ((device.value as ApiDeviceResponse).type) {
      case DeviceType.Thermal:
        return "Thermal camera";
      case DeviceType.Hybrid:
        return "Thermal camera + Bird monitor";
      case DeviceType.Audio:
        return "Bird monitor";
      case DeviceType.TrailCam:
        return "Trail camera";
      case DeviceType.TrapIrCam:
        return "Trap IR camera";
    }
  }
  return "Device";
});
</script>
<template>
  <div class="device-view d-flex flex-column">
    <overflowing-tab-list v-if="!deviceLoading">
      <!--      <router-link-->
      <!--        v-if="currentUserIsSuperAdminAndNotViewingAsNonSuperAdmin && [DeviceType.Thermal, DeviceType.Hybrid, DeviceType.Audio].includes((device as ApiDeviceResponse).type)"-->
      <!--        :class="[-->
      <!--          ...navLinkClasses,-->
      <!--          { active: activeTabPath.includes('device-events') },-->
      <!--        ]"-->
      <!--        title="Events"-->
      <!--        :to="{-->
      <!--          name: 'device-events',-->
      <!--        }"-->
      <!--        >Events</router-link-->
      <!--      >-->
      <router-link
        v-if="[DeviceType.Thermal, DeviceType.Hybrid, DeviceType.Audio].includes((device as ApiDeviceResponse).type)"
        :class="[
          ...navLinkClasses,
          { active: activeTabPath.includes('device-diagnostics') },
        ]"
        title="Diagnostics"
        :to="{
          name: 'device-diagnostics',
        }"
        >Diagnostics</router-link
      >
      <router-link
        v-if="[DeviceType.Hybrid, DeviceType.Thermal].includes((device as ApiDeviceResponse).type) && (device as ApiDeviceResponse).location"
        :class="[
          ...navLinkClasses,
          { active: activeTabPath.includes('device-insights') },
        ]"
        title="Insights"
        :to="{
          name: 'device-insights',
        }"
        >Insights</router-link
      >
      <router-link
        v-if="[DeviceType.Hybrid, DeviceType.Thermal].includes((device as ApiDeviceResponse).type) && (device as ApiDeviceResponse).location"
        :class="[
          ...navLinkClasses,
          { active: activeTabPath.includes('device-setup') },
        ]"
        title="Setup"
        :to="{
          name: 'device-setup',
        }"
        >Setup</router-link
      >
      <router-link
        v-if="[DeviceType.Audio, DeviceType.Hybrid].includes((device as ApiDeviceResponse).type)"
        :class="[
          ...navLinkClasses,
          { active: activeTabPath.includes('device-schedules') },
        ]"
        title="Schedules"
        :to="{
          name: 'device-schedules',
        }"
        >Schedules</router-link
      >
      <!-- TODO: Specialise this for manual uploads of CPTV and audio files -->
      <router-link
        v-if="(device as ApiDeviceResponse).type === DeviceType.TrailCam"
        :class="[
          ...navLinkClasses,
          { active: activeTabPath.includes('device-uploads') },
        ]"
        title="Manual uploads"
        :to="{
          name: 'device-uploads',
        }"
        >Manual Uploads</router-link
      >
    </overflowing-tab-list>
    <router-view
      @start-blocking-work="() => emit('start-blocking-work')"
      @end-blocking-work="() => emit('end-blocking-work')"
      @updated-regions="(e) => (latestMaskRegions = e)"
      @updated-reference-image="loadReferenceImage"
    />
  </div>
</template>

<style scoped lang="less">
@import "../assets/font-sizes.less";
@import "../assets/mixins.less";

.device-view-header {
  border-bottom: 2px solid #e1e1e1;
  .device-header-type {
    .fs-8();
  }
  .device-header-details {
    line-height: 1;
  }
  @media screen and (min-width: 576px) {
    .device-header-type {
      .fs-8();
    }
    .device-header-details {
      line-height: unset;
    }
  }
}
.nav-item {
  text-align: center;
}
.nav-item.active {
  background: unset;
  border-bottom: 3px solid #6dbd4b !important;
}
</style>
