<script setup lang="ts">
import type { ApiDeviceResponse } from "@typedefs/api/device";
import { onBeforeMount, ref, watch } from "vue";
import {
  type BatteryInfoEvent,
  getLastKnownDeviceBatteryLevel,
} from "@api/Device.ts";
import type { LoadedResource } from "@api/types.ts";
import { resourceFailedLoading, resourceIsLoading } from "@/helpers/utils.ts";

const props = withDefaults(
  defineProps<{
    device: ApiDeviceResponse;
    showLevel?: boolean;
    showIcon?: boolean;
  }>(),
  { showLevel: true, showIcon: true }
);
const batteryLevelInfo = ref<LoadedResource<BatteryInfoEvent>>(null);
const loading = resourceIsLoading(batteryLevelInfo);
const loadingFailed = resourceFailedLoading(batteryLevelInfo);
interface BatteryInfoMapContainer extends Window {
  deviceBatteryInfoMap: Record<string, BatteryInfoEvent | false>;
}
// Create a 'global' cache of battery infos, so we don't need to reload them if
// the devices list containing these is sorted.
(window as unknown as BatteryInfoMapContainer).deviceBatteryInfoMap =
  (window as unknown as BatteryInfoMapContainer).deviceBatteryInfoMap ||
  ({} as Record<string, BatteryInfoEvent | false>);
const loadInfo = async () => {
  if (
    (
      window as unknown as BatteryInfoMapContainer
    ).deviceBatteryInfoMap.hasOwnProperty(`__${props.device.id}`)
  ) {
    batteryLevelInfo.value = (
      window as unknown as BatteryInfoMapContainer
    ).deviceBatteryInfoMap[`__${props.device.id}`];
  } else {
    batteryLevelInfo.value = null;
    batteryLevelInfo.value = await getLastKnownDeviceBatteryLevel(
      props.device.id
    );
    // batteryLevelInfo.value = batteryLevelInfo.value || {
    //   batteryType: "lime",
    //   battery: Math.round(Math.random() * 100),
    // };
    if (batteryLevelInfo.value !== null) {
      (window as unknown as BatteryInfoMapContainer).deviceBatteryInfoMap[
        `__${props.device.id}`
      ] = batteryLevelInfo.value;
    }
  }
};
onBeforeMount(() => {
  if (props.device.active) {
    loadInfo();
  } else {
    batteryLevelInfo.value = false;
  }
});
watch(
  () => props.device.id,
  (next, prev) => {
    if (next !== prev) {
      if (props.device.active) {
        loadInfo();
      } else {
        batteryLevelInfo.value = false;
      }
    }
  }
);
</script>

<template>
  <div v-if="loading" class="d-flex align-items-center">
    <b-spinner small />
  </div>
  <div v-else-if="loadingFailed">&ndash;</div>
  <div
    v-else-if="
      batteryLevelInfo &&
      batteryLevelInfo.batteryType === 'unknown' &&
      batteryLevelInfo.battery === 100
    "
  >
    <font-awesome-icon icon="plug" /><span v-if="props.showLevel" class="ms-1"
      >{{ batteryLevelInfo.battery }}%</span
    >
  </div>
  <div
    v-else-if="batteryLevelInfo && batteryLevelInfo.battery"
    class="d-flex align-items-center"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 576 512"
      width="20"
      height="100%"
      v-if="props.showIcon"
      :class="{ 'battery-warning': batteryLevelInfo.battery < 20 }"
    >
      <path
        fill="currentColor"
        d="M464 160c8.8 0 16 7.2 16 16l0 160c0 8.8-7.2 16-16 16L80 352c-8.8 0-16-7.2-16-16l0-160c0-8.8 7.2-16 16-16l384 0zM80 96C35.8 96 0 131.8 0 176L0 336c0 44.2 35.8 80 80 80l384 0c44.2 0 80-35.8 80-80l0-16c17.7 0 32-14.3 32-32l0-64c0-17.7-14.3-32-32-32l0-16c0-44.2-35.8-80-80-80L80 96z"
      />
      <rect
        x="96"
        y="192"
        :width="(352 / 100) * batteryLevelInfo.battery"
        height="128"
        fill="currentColor"
      />
    </svg>
    <span v-if="props.showLevel" class="ms-1"
      >{{ batteryLevelInfo.battery }}%</span
    >
  </div>
  <div v-else>&ndash;</div>
</template>

<style scoped lang="less">
.battery-warning {
  color: red;
}
</style>
