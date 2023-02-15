<script setup lang="ts">
import { useRoute } from "vue-router";
import type { ApiDeviceResponse } from "@typedefs/api/device";
import { computed, onBeforeMount, ref } from "vue";
import {
  DevicesForCurrentGroup,
  groupDevicesLoaded,
  userGroupsLoaded,
} from "@models/LoggedInUser";
import { getDeviceById } from "@api/Device";
import type { DeviceId } from "@typedefs/api/common";
const route = useRoute();
const emit = defineEmits(["close"]);

const deviceLoading = ref<boolean>(false);
const device = ref<ApiDeviceResponse | null>(null);
const loadDevice = async (deviceId: DeviceId) => {
  deviceLoading.value = true;
  await Promise.all([userGroupsLoaded(), groupDevicesLoaded()]);

  if (DevicesForCurrentGroup.value) {
    const targetDevice = DevicesForCurrentGroup.value.find(
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
</script>
<template>
  <div class="device-view d-flex flex-column">
    <header
      class="device-view-header d-flex justify-content-between ps-sm-3 pe-sm-1 ps-2 pe-1 py-sm-1"
    >
      <div>
        <span class="device-header-type text-uppercase fw-bold">Device</span>
        <div class="device-header-details mb-1 mb-sm-0" v-if="!deviceLoading">
          {{ device.deviceName }}
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
      <ul class="nav nav-tabs justify-content-md-center justify-content-evenly">
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
      <div class="py-3">
        <router-view />
      </div>
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
</style>
