<script lang="ts" setup>
import {computed, inject, onMounted, ref} from "vue";
import {
  getDeviceConfig,
  getDeviceLastPoweredOff,
  getDeviceLastPoweredOn, getDeviceStationAtTime,
  getDeviceVersionInfo,
  getLatestEventsByDeviceId,
} from "@api/Device";
import { useRoute } from "vue-router";
import type { Ref } from "vue";
import type { DeviceId } from "@typedefs/api/common";
import CardTable from "@/components/CardTable.vue";
import type { CardTableRows } from "@/components/CardTableTypes";
import type { DeviceConfigDetail } from "@typedefs/api/event";
import {selectedGroupDevices} from "@models/provides";
import type {ApiDeviceResponse} from "@typedefs/api/device";

const devices = inject(selectedGroupDevices) as Ref<ApiDeviceResponse[] | null>;
const route = useRoute();
const deviceId = Number(route.params.deviceId) as DeviceId;
const device = computed<ApiDeviceResponse | null>(() => {
  return devices.value && devices.value.find((device: ApiDeviceResponse) => device.id === deviceId) || null;
});
const versionInfo = ref<Record<string, string> | false | null>(null);
const deviceConfig = ref<DeviceConfigDetail | false | null>(null);

const lastPowerOffTime = computed(() => {});

const lastPowerOnTime = computed(() => {});

const configInfoLoading = computed<boolean>(() => deviceConfig.value === null);
//
const recordingWindow = computed<string | null>(() => {
  if (deviceConfig.value) {
    const windows = deviceConfig.value.windows;
    const start = windows["start-recording"] || "-30";
    const end = windows["stop-recording"] || "+30";
    let startTime = "";
    let endTime = "";
    if (start.startsWith("+") || start.startsWith("-")) {
      // Relative start time to sunset
      const beforeAfter = start.startsWith("-") ? "before" : "after";
      startTime = `${start.slice(1)}ins ${beforeAfter} sunset`;
    } else {
      // Absolute start time
      startTime = start; // Do am/pm?
    }
    if (end.startsWith("+") || end.startsWith("-")) {
      // Relative end time to sunrise
      const beforeAfter = end.startsWith("-") ? "before" : "after";
      endTime = `${end.slice(1)}ins ${beforeAfter} sunrise`;
    } else {
      // Absolute end time
      endTime = end;
    }
    return `Records from ${startTime} until ${endTime}`;
  }
  return null;
});

const poweredOnWindow = computed<string | null>(() => {
  if (deviceConfig.value) {
    const windows = deviceConfig.value.windows;
    const start = windows["power-on"] || "-30";
    const end = windows["power-off"] || "+30";
    let startTime = "";
    let endTime = "";
    if (start.startsWith("+") || start.startsWith("-")) {
      // Relative start time to sunset
      const beforeAfter = start.startsWith("-") ? "before" : "after";
      startTime = `${start.slice(1)}ins ${beforeAfter} sunset`;
    } else {
      // Absolute start time
      startTime = start; // Do am/pm?
    }
    if (end.startsWith("+") || end.startsWith("-")) {
      // Relative end time to sunrise
      const beforeAfter = end.startsWith("-") ? "before" : "after";
      endTime = `${end.slice(1)}ins ${beforeAfter} sunrise`;
    } else {
      // Absolute end time
      endTime = end;
    }
    return `Powered on from ${startTime} until ${endTime}`;
  }
  return null;
});

const currentRecordingWindowLength = computed<number>(() => {
  // TODO: Return number of hours:minutes the device is currently recording for.
  return 10;
});

const deviceEvents = ref<any>(null);
onMounted(async () => {
  if (device.value) {
    // FIXME - Probably not a great way of doing this - if any of these error, it won't complete.
    // Maybe make our own Promise.all resolver.
    const events = [
      getDeviceConfig,
      getDeviceVersionInfo,
      getDeviceLastPoweredOn,
      getDeviceLastPoweredOff,
    ].map((fn) => fn(deviceId));
    if (device.value?.location) {
      events.push(getDeviceStationAtTime(deviceId));
    }
    const [config, version, poweredOn, poweredOff, possibleStation] = await Promise.all(events);
    deviceConfig.value = config;
    versionInfo.value = version;
    if (possibleStation.success) {
      console.log("Station was", possibleStation.result.station);
    }

    //Now we can work out if the device is currently on?
  }
});

const versionInfoTable = computed<CardTableRows<any>>(() =>
  Object.entries(versionInfo.value || []).map(([software, version]) => ({
    package: software,
    version,
  }))
);
</script>
<template>
  <div v-if="device">
    <div class="d-flex justify-content-between">
      <div class="flex-grow-1">
        <card-table
          v-if="versionInfo !== null"
          compact
          :items="versionInfoTable"
          :sort-dimensions="{ package: true }"
          default-sort="package"
        />
        <div v-else-if="versionInfo === null">Loading version info</div>
        <div v-else>Version info not available.</div>
      </div>
      <div class="flex-grow-1">
        <div v-if="recordingWindow">{{ recordingWindow }}</div>
        <div v-else-if="recordingWindow === null">Loading recording window</div>
        <div v-else>Recording window unavailable</div>

        <div v-if="poweredOnWindow">{{ poweredOnWindow }}</div>
        <div v-else-if="poweredOnWindow === null">
          Loading powered-on window
        </div>
        <div v-else>Power window unavailable</div>
      </div>
    </div>

    <ul>
      <li>Where was the device last seen? What station is it under?</li>
      <li>Have there been any interesting error events?</li>
      <li>What does the last recorded view look like (for thermal)?</li>
      <li>Heatmap insights - though this should probably be its own tab</li>
    </ul>
  </div>
  <div v-else>
    Device not found in group.
  </div>
</template>

<style scoped lang="less"></style>
