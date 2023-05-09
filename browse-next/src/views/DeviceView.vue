<script setup lang="ts">
import { useRoute } from "vue-router";
import type { ApiDeviceResponse } from "@typedefs/api/device";
import type { Ref } from "vue";
import { computed, inject, onBeforeMount, ref } from "vue";
import { projectDevicesLoaded, userProjectsLoaded } from "@models/LoggedInUser";
import type { DeviceId } from "@typedefs/api/common";
import { selectedProjectDevices } from "@models/provides";
import DeviceName from "@/components/DeviceName.vue";
import { DeviceType } from "@typedefs/api/consts.ts";

const route = useRoute();
const emit = defineEmits(["close", "start-blocking-work", "end-blocking-work"]);

const groupDevices = inject(selectedProjectDevices) as Ref<
  ApiDeviceResponse[] | null
>;

const deviceLoading = ref<boolean>(false);
const device = ref<ApiDeviceResponse | null>(null);
const loadDevice = async (deviceId: DeviceId) => {
  deviceLoading.value = true;
  await Promise.all([userProjectsLoaded(), projectDevicesLoaded()]);
  if (groupDevices.value) {
    const targetDevice = (groupDevices.value as ApiDeviceResponse[]).find(
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

onBeforeMount(async () => {
  await loadDevice(Number(route.params.deviceId) as DeviceId);
});
const activeTabName = computed(() => {
  return route.name;
});
const navLinkClasses = ["nav-item", "nav-link", "border-0"];

const deviceType = computed<string>(() => {
  if (device.value) {
    switch ((device.value as ApiDeviceResponse).type) {
      case DeviceType.Thermal:
        return "Thermal camera";
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
    <header
      class="device-view-header d-flex justify-content-between ps-sm-3 pe-sm-1 ps-2 pe-1 py-sm-1"
    >
      <div>
        <span class="device-header-type text-uppercase fw-bold">{{
          deviceType
        }}</span>
        <div class="device-header-details mb-1 mb-sm-0" v-if="!deviceLoading">
          <device-name
            :name="(device as ApiDeviceResponse).deviceName"
            :type="(device as ApiDeviceResponse).type"
          />
        </div>
      </div>
      <button
        type="button"
        class="btn btn-square btn-hi"
        @click.stop.prevent="() => emit('close')"
      >
        <font-awesome-icon icon="xmark" />
      </button>
    </header>
    <div>
      <ul
        class="nav nav-tabs justify-content-md-center justify-content-evenly"
        v-if="!deviceLoading"
      >
        <router-link
          :class="[
            ...navLinkClasses,
            { active: activeTabName === 'device-diagnostics' },
          ]"
          title="Diagnostics"
          :to="{
            name: 'device-diagnostics',
          }"
          >Diagnostics</router-link
        >
        <router-link
          v-if="(device as ApiDeviceResponse).type === DeviceType.Thermal"
          :class="[
            ...navLinkClasses,
            { active: activeTabName === 'device-insights' },
          ]"
          title="Insights"
          :to="{
            name: 'device-insights',
          }"
          >Insights</router-link
        >
        <router-link
          v-if="(device as ApiDeviceResponse).type === DeviceType.Thermal"
          :class="[
            ...navLinkClasses,
            { active: activeTabName === 'device-setup' },
          ]"
          title="Setup"
          :to="{
            name: 'device-setup',
          }"
          >Setup</router-link
        >

        <router-link
          v-if="(device as ApiDeviceResponse).type === DeviceType.Thermal"
          :class="[
            ...navLinkClasses,
            { active: activeTabName === 'device-schedules' },
          ]"
          title="Schedules"
          :to="{
            name: 'device-schedules',
          }"
          >Schedules</router-link
        >

        <router-link
          :class="[
            ...navLinkClasses,
            { active: activeTabName === 'device-uploads' },
          ]"
          title="Manual uploads"
          :to="{
            name: 'device-uploads',
          }"
          >Manual Uploads</router-link
        >
      </ul>
      <router-view
        @start-blocking-work="() => emit('start-blocking-work')"
        @end-blocking-work="() => emit('end-blocking-work')"
      />
    </div>
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
.device-view {
  @media screen and (max-width: 1040px) {
    background: white;
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
  }
}
.nav-item.active {
  background: unset;
  border-bottom: 3px solid #6dbd4b !important;
}
</style>
