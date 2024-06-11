<script lang="ts" setup>
import { computed, inject, onMounted, ref } from "vue";
import {
  getDeviceConfig,
  getDeviceLastPoweredOff,
  getDeviceLastPoweredOn,
  getDeviceLocationAtTime,
  getDeviceVersionInfo,
  getLatestStatusRecordingForDevice,
} from "@api/Device";
import { useRoute } from "vue-router";
import type { Ref } from "vue";
import type { DeviceId } from "@typedefs/api/common";
import CardTable from "@/components/CardTable.vue";
import type { CardTableRows } from "@/components/CardTableTypes";
import type { DeviceConfigDetail } from "@typedefs/api/event";
import { selectedProjectDevices } from "@models/provides";
import type { ApiDeviceResponse } from "@typedefs/api/device";
import { projectDevicesLoaded } from "@models/LoggedInUser";
import type { LoadedResource } from "@api/types";
import MapWithPoints from "@/components/MapWithPoints.vue";
import type { NamedPoint } from "@models/mapUtils";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import sunCalc from "suncalc";
import { DateTime } from "luxon";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import CptvSingleFrame from "@/components/CptvSingleFrame.vue";

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

const versionInfo = ref<LoadedResource<Record<string, string>>>(null);
const deviceConfig = ref<LoadedResource<DeviceConfigDetail>>(null);
const currentLocationForDevice = ref<LoadedResource<ApiLocationResponse>>(null);
const lastPowerOffTime = ref<LoadedResource<Date>>(null);
const lastPowerOnTime = ref<LoadedResource<Date>>(null);
const isLoading = (val: Ref<LoadedResource<unknown>>) =>
  computed<boolean>(() => val.value === null);
const configInfoLoading = isLoading(deviceConfig);
const versionInfoLoading = isLoading(versionInfo);
const locationInfoLoading = isLoading(currentLocationForDevice);

const records247 = computed<boolean>(() => {
  // Device records 24/7 if power-on time is non-relative and is set to the same as power off time.
  if (deviceConfig.value) {
    const windows = (deviceConfig.value as DeviceConfigDetail).windows;
    const start = (windows && windows["start-recording"]) || "-30m";
    const end = (windows && windows["stop-recording"]) || "+30m";
    if (!start.endsWith("m") || !end.endsWith("m")) {
      return start === end;
    }
  }
  return false;
});

const poweredOn247 = computed<boolean>(() => {
  // Device records 24/7 if power-on time is non-relative and is set to the same as power off time.
  if (deviceConfig.value) {
    const windows = (deviceConfig.value as DeviceConfigDetail).windows;
    const start = (windows && windows["power-on"]) || "-30m";
    const end = (windows && windows["power-off"]) || "+30m";
    if (!start.endsWith("m") || !end.endsWith("m")) {
      return start === end;
    }
  }
  return false;
});

const absoluteTime = (timeStr: string, relativeTo: Date): Date => {
  let offsetMinutes = 0;
  const rel = new Date(relativeTo);
  if (timeStr.endsWith("m")) {
    offsetMinutes = Number(timeStr.replace("m", ""));
    rel.setMinutes(rel.getMinutes() + offsetMinutes);
  } else {
    const now = new Date();
    const [hours, mins] = timeStr.split(":").map(Number);
    now.setHours(hours);
    now.setMinutes(mins);
    return now;
  }
  return rel;
};

const scheduledRecordStartTime = computed<Date | null>(() => {
  if (deviceConfig.value && device.value) {
    const windows = (deviceConfig.value as DeviceConfigDetail).windows;
    const thisDevice = device.value as ApiDeviceResponse;
    const start = (windows && windows["start-recording"]) || "-30m";
    if (thisDevice.location) {
      const { sunset } = sunCalc.getTimes(
        new Date(),
        thisDevice.location.lat,
        thisDevice.location.lng
      );
      return absoluteTime(start, sunset);
    }
  }
  return null;
});

const scheduledRecordEndTime = computed<Date | null>(() => {
  if (deviceConfig.value && device.value) {
    const windows = (deviceConfig.value as DeviceConfigDetail).windows;
    const thisDevice = device.value as ApiDeviceResponse;
    const end = (windows && windows["stop-recording"]) || "+30m";
    if (thisDevice.location) {
      const { sunrise } = sunCalc.getTimes(
        new Date(),
        thisDevice.location.lat,
        thisDevice.location.lng
      );
      const off = absoluteTime(end, sunrise);
      if (
        scheduledRecordStartTime.value &&
        off > scheduledRecordStartTime.value
      ) {
        return off;
      } else {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const { sunrise } = sunCalc.getTimes(
          tomorrow,
          thisDevice.location.lat,
          thisDevice.location.lng
        );
        return absoluteTime(end, sunrise);
      }
    }
  }
  return null;
});

const shouldBeRecordingNow = computed<boolean>(() => {
  const now = new Date();
  const on = scheduledRecordStartTime.value;
  const off = scheduledRecordEndTime.value;
  if (on && off) {
    return on < now && off > now;
  }
  return false;
});

const nextHeartbeat = computed<string>(() => {
  return "";
});

const lastConnected = computed<Date | null>(() => {
  const d = device.value?.lastConnectionTime;
  if (d) {
    return new Date(d);
  }
  return null;
});

const haveHeardDirectlyFromDeviceInItsCurrentLocation = computed<boolean>(
  () => {
    if (
      currentLocationForDevice.value &&
      device.value &&
      device.value.lastConnectionTime
    ) {
      return (
        currentLocationForDevice.value.createdAt <
        device.value.lastConnectionTime
      );
    }
    return false;
  }
);

const deviceStopped = computed<boolean>(() => {
  if (device.value) {
    if (!device.value.active) {
      return true;
    }
    return (
      haveHeardDirectlyFromDeviceInItsCurrentLocation.value &&
      !device.value.isHealthy
    );
  }
  return false;
});
//
const recordingWindow = computed<string | null>(() => {
  if (records247.value) {
    return "Set to be ready to record 24/7";
  } else if (deviceConfig.value) {
    const windows = (deviceConfig.value as DeviceConfigDetail).windows;
    const start = (windows && windows["start-recording"]) || "-30m";
    const end = (windows && windows["stop-recording"]) || "+30m";
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
    return `record from ${startTime} until ${endTime}`;
  }
  return null;
});

const currentRecordingWindowLengthMins = computed<number>(() => {
  if (records247.value) {
    return -1;
  }
  if (scheduledRecordStartTime.value && scheduledRecordEndTime.value) {
    const ms =
      scheduledRecordEndTime.value?.getTime() -
      scheduledRecordStartTime.value?.getTime();
    return Math.round(ms / 1000 / 60);
  }
  return 0;
});

const minsHoursFromMins = (inMins: number): string => {
  const hours = Math.floor(inMins / 60);
  const mins = inMins - 60 * hours;
  return `${hours} hours, ${mins} mins`;
};

const uptimes = computed<number[]>(() => {
  // Hours that a device has been on in between stopped events, should be computable from events.
  // Then we should be able to guess when a device will next stop.

  // If a device powers on at a non-scheduled time, we can also infer that the battery has been changed,
  // or recordings have been collected.

  return [];
});

const nullRequest = (): Promise<false> => {
  return new Promise((resolve) => {
    resolve(false);
  });
};

const latestStatusRecording = ref<ApiRecordingResponse | null>(null);
onMounted(async () => {
  if (!devices.value) {
    await projectDevicesLoaded();
  }
  if (device.value) {
    const thisDevice = device.value as ApiDeviceResponse;
    const thermalEvents = [
      getDeviceConfig,
      getDeviceVersionInfo,
      getDeviceLastPoweredOn,
      getDeviceLastPoweredOff,
    ].map((fn) => fn(deviceId));
    const infoRequests = [];
    if (thisDevice.type === "thermal") {
      infoRequests.push(...thermalEvents);
    } else {
      infoRequests.push(
        nullRequest(),
        nullRequest(),
        nullRequest(),
        nullRequest()
      );
    }
    if (device.value?.location) {
      infoRequests.push(getDeviceLocationAtTime(deviceId));
    } else {
      infoRequests.push(nullRequest());
    }

    // FIXME: Should we block for everything to load here, or pop content in
    //  as individual pieces load in.
    const [config, version, poweredOn, poweredOff, station] = (
      await Promise.allSettled(infoRequests)
    ).map((result) => (result.status === "fulfilled" ? result.value : false));
    deviceConfig.value = config as DeviceConfigDetail | false;
    versionInfo.value = version as Record<string, string> | false;
    currentLocationForDevice.value = station as ApiLocationResponse | false;

    lastPowerOffTime.value = poweredOff as Date | false;
    lastPowerOnTime.value = poweredOn as Date | false;
    //Now we can work out if the device is currently on?

    if (thisDevice.type === "thermal") {
      const latestStatus = await getLatestStatusRecordingForDevice(
        thisDevice.id,
        thisDevice.groupId,
        false
      );
      if (latestStatus) {
        latestStatusRecording.value = latestStatus;
      }
    }

    /*
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const stopTimes = await getStoppedEvents(deviceId, sixMonthsAgo);
    console.log("Stop times", stopTimes);

    // FIXME - We seem to be getting pretty nonsensical event times around stop-reported events and rpi-power-on events.
    if (stopTimes.success) {
      let wakeTime: Date;
      for (const stopEvent of stopTimes.result.rows) {
        const stopTime = new Date(stopEvent.dateTime);
        if (wakeTime) {
          console.log(
            "Up time ",
            (stopTime.getTime() - wakeTime.getTime()) / 1000 / 60 / 60,
            "hours"
          );
        }
        const nextTime = new Date(stopTime);
        nextTime.setMinutes(nextTime.getMinutes() + 1);
        const nextEvent = await getEarliestEventAfterTime(deviceId, nextTime);
        if (nextEvent.success) {
          wakeTime = new Date(nextEvent.result.rows[0].dateTime);
          console.log(
            "stopped at",
            stopTime,
            "woke at ",
            new Date(nextEvent.result.rows[0].dateTime),
            "for",
            nextEvent.result.rows[0].EventDetail.type
          );
        }
      }
    }
    */
  }
});

const versionInfoTable = computed<CardTableRows<string>>(() =>
  Object.entries(versionInfo.value || []).map(([software, version]) => ({
    package: software,
    version,
  }))
);

const deviceLocationPoints = computed<NamedPoint[]>(() => {
  if (currentLocationForDevice.value && device.value) {
    const thisDevice = device.value as ApiDeviceResponse;
    const thisLocation = currentLocationForDevice.value as ApiLocationResponse;
    return [
      {
        location: thisDevice?.location || { lat: 0, lng: 0 },
        name: thisDevice.deviceName,
        id: thisDevice.id,
        project: thisDevice.groupName,
      },
      {
        location: thisLocation.location,
        name: thisLocation.name,
        id: thisLocation.id,
        project: thisLocation.groupName,
      },
    ];
  } else {
    return [];
  }
});
</script>
<template>
  <div v-if="device" class="mt-3">
    <div class="d-flex justify-content-between flex-md-row flex-column">
      <div v-if="device.type === 'thermal'">
        <h6 v-if="latestStatusRecording">
          Camera view from
          {{
            DateTime.fromJSDate(
              new Date(latestStatusRecording.recordingDateTime)
            ).toRelative()
          }}:
        </h6>
        <cptv-single-frame
          :recording="latestStatusRecording"
          v-if="latestStatusRecording"
          :width="320"
          :height="240"
        />

        <h6 class="mt-3">Recording status:</h6>
        <div v-if="!shouldBeRecordingNow && recordingWindow">
          <span v-if="deviceStopped">
            Camera has stopped<span v-if="device.location">, otherwise </span>
            <span v-if="records247">would be recording now</span
            ><span v-else-if="scheduledRecordStartTime"
              >would be ready to record
              {{
                DateTime.fromJSDate(scheduledRecordStartTime).toRelative()
              }}</span
            >
          </span>
          <span v-else-if="scheduledRecordStartTime"
            >Ready to record
            {{
              DateTime.fromJSDate(scheduledRecordStartTime).toRelative()
            }}</span
          >
          <span v-if="device.location">
            for a duration of
            {{ minsHoursFromMins(currentRecordingWindowLengthMins) }}.</span
          >
        </div>

        <div v-if="configInfoLoading">
          <b-spinner small class="me-2" />
          Loading recording window
        </div>
        <div v-else-if="recordingWindow">Would {{ recordingWindow }}.</div>
        <div v-else>Recording window unavailable</div>
      </div>
      <div class="mt-md-0 mt-4">
        <h6>
          <span v-if="!deviceStopped">Current location:</span>
          <span v-else>Last known location:</span>
        </h6>
        <!-- Show the device "inside" its station if possible -->
        <div v-if="device.location">
          <div v-if="locationInfoLoading">
            <b-spinner small class="me-2" />
            Loading location info
          </div>
          <div v-else-if="currentLocationForDevice">
            <map-with-points
              :points="deviceLocationPoints"
              :highlighted-point="null"
              :active-points="deviceLocationPoints"
              :radius="30"
              :is-interactive="false"
              :zoom="false"
              :can-change-base-map="false"
              :loading="locationInfoLoading"
              style="min-height: 200px"
            />
          </div>
          <div v-else>Device is not currently at a known location</div>
        </div>
        <div v-else>Device does not currently have a known location</div>
      </div>
    </div>
    <div class="mt-4" v-if="device.type === 'thermal'">
      <h6>Software package versions:</h6>
      <div v-if="versionInfoLoading">
        <b-spinner small class="me-2" />
        Loading version info
      </div>
      <card-table
        v-else-if="versionInfo"
        compact
        :items="versionInfoTable"
        :sort-dimensions="{ package: true }"
        default-sort="package"
      />
      <div v-else>Version info not available.</div>
    </div>
  </div>
  <div v-else class="p-3">Device not found in group.</div>
</template>

<style scoped lang="less">
.map {
  width: 320px;
  height: 240px;
}
</style>
