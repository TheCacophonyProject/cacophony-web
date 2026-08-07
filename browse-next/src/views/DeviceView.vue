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
import type { LoadedResource } from "@apiClient/types.ts";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import { ClientApi } from "@/api";

const route = useRoute();
const emit = defineEmits(["close", "start-blocking-work", "end-blocking-work"]);

const projectDevices = inject(selectedProjectDevices) as Ref<
  ApiDeviceResponse[] | null
>;
const latestStatusRecording = ref<LoadedResource<ApiRecordingResponse>>(null);
const latestReferenceImageURL = ref<LoadedResource<string>>(null);
const latestMaskRegions = ref<LoadedResource<ApiMaskRegionsData>>(null);
const deviceLoading = ref<boolean>(false);
const device = ref<ApiDeviceResponse | null>(null);
provide("latestStatusRecording", latestStatusRecording);
provide("latestMaskRegions", latestMaskRegions);
provide("latestReferenceImageURL", latestReferenceImageURL);

provide("device", device);
const loadDevice = async (deviceId: DeviceId) => {
  deviceLoading.value = true;
  await Promise.all([userProjectsLoaded(), projectDevicesLoaded()]);
  if (projectDevices.value) {
    const targetDevice = (projectDevices.value as ApiDeviceResponse[]).find(
      ({ id }) => id === deviceId,
    );
    if (targetDevice) {
      device.value = targetDevice;
    } else {
      // Device could be inactive, so try loading it by id
      const deviceResponse = await ClientApi.Devices.getDeviceById(
        deviceId,
        true,
      );
      if (deviceResponse) {
        device.value = deviceResponse;
      }
    }
  }
  deviceLoading.value = false;
};

const loadReferenceImage = (deviceId: DeviceId) => {
  latestReferenceImageURL.value = null;
  ClientApi.Devices.getReferenceImageForDeviceAtCurrentLocation(deviceId).then(
    ({ result, success }) => {
      if (success) {
        latestReferenceImageURL.value = URL.createObjectURL(result);
      } else {
        latestReferenceImageURL.value = false;
      }
    },
  );
};

onBeforeMount(async () => {
  await loadDevice(Number(route.params.deviceId) as DeviceId);
  if (
    device.value &&
    device.value.active &&
    [DeviceType.Thermal, DeviceType.Hybrid].includes(device.value.type)
  ) {
    //  TODO: Latest status recording should match current location.
    //  TODO: Use meta/status to get low power 2s recordings
    ClientApi.Devices.getLatestStatusRecordingForDevice(
      device.value.id,
      device.value.groupId,
    ).then((result) => (latestStatusRecording.value = result));
    loadReferenceImage(device.value.id);
    ClientApi.Devices.getMaskRegionsForDevice(device.value.id, true).then(
      ({ success, result }) => {
        if (success) {
          latestMaskRegions.value = {
            maskRegions: result.maskRegions,
          };
        } else {
          latestMaskRegions.value = false;
        }
      },
    );
  }
});

const activeTabPath = computed(() => {
  return route.matched.map((item) => item.name);
});
const navLinkClasses = ["nav-item", "nav-link"];
</script>
<template>
  <div class="device-view d-flex flex-column flex-fill">
    <overflowing-tab-list v-if="!deviceLoading">
      <router-link
        v-if="
          device?.active &&
          [DeviceType.Thermal, DeviceType.Hybrid, DeviceType.Audio].includes(
            (device as ApiDeviceResponse).type,
          )
        "
        :class="[
          ...navLinkClasses,
          { active: activeTabPath.includes('device-events') },
        ]"
        title="Events"
        :to="{
          name: 'device-events',
        }"
      >
        <span class="text">Events</span>
      </router-link>
      <router-link
        v-if="
          device?.active &&
          [DeviceType.Thermal, DeviceType.Hybrid, DeviceType.Audio].includes(
            (device as ApiDeviceResponse).type,
          )
        "
        :class="[
          ...navLinkClasses,
          { active: activeTabPath.includes('device-status') },
        ]"
        title="Status"
        :to="{
          name: 'device-status',
        }"
      >
        <span class="text">Status</span>
      </router-link>
      <router-link
        v-if="
          device?.active &&
          [DeviceType.Hybrid, DeviceType.Thermal].includes(
            (device as ApiDeviceResponse).type,
          ) &&
          (device as ApiDeviceResponse).location
        "
        :class="[
          ...navLinkClasses,
          { active: activeTabPath.includes('device-configuration') },
        ]"
        title="Configuration"
        data-cy="device configuration"
        :to="{
          name: 'device-configuration',
        }"
      >
        <span class="text">
          Config<span class="d-none d-sm-inline">uration</span>
        </span>
      </router-link>
      <router-link
        v-if="
          device?.active &&
          [DeviceType.Hybrid, DeviceType.Thermal].includes(
            (device as ApiDeviceResponse).type,
          ) &&
          (device as ApiDeviceResponse).location
        "
        :class="[
          ...navLinkClasses,
          { active: activeTabPath.includes('device-insights') },
        ]"
        title="Insights"
        :to="{
          name: 'device-insights',
        }"
        ><span class="text">Insights</span></router-link
      >
    </overflowing-tab-list>
    <router-view
      class="d-flex flex-fill"
      @start-blocking-work="() => emit('start-blocking-work')"
      @end-blocking-work="() => emit('end-blocking-work')"
      @updated-regions="(e: ApiMaskRegionsData) => (latestMaskRegions = e)"
      @updated-reference-image="
        () => {
          if (device) loadReferenceImage(device.id);
        }
      "
    />
  </div>
</template>

<style scoped lang="less">
@import "../assets/less/typography.less";
@import "../assets/less/elevation.less";

.device-view-header {
  border-bottom: 2px solid #e1e1e1;
  .device-header-details {
    line-height: 1;
  }
  @media screen and (min-width: 576px) {
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
