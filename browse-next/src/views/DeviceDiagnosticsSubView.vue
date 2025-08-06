<script lang="ts" setup>
import { computed, inject, onBeforeMount, ref, watch } from "vue";
import {
  type BatteryInfoEvent,
  getBatteryInfo,
  getDeviceConfig,
  getDeviceLastPoweredOff,
  getDeviceLastPoweredOn,
  getDeviceLatestVersionInfo,
  getDeviceLocationAtTime,
  getDeviceNodeGroup,
  getDeviceVersionInfo,
} from "@api/Device";
import { useRoute } from "vue-router";
import type { Ref } from "vue";
import type { DeviceId } from "@typedefs/api/common";
import CardTable from "@/components/CardTable.vue";
import type { CardTableRows } from "@/components/CardTableTypes";
import type { DeviceConfigDetail } from "@typedefs/api/event";
import {
  LocationsForCurrentProject,
  projectDevicesLoaded,
  projectLocationsLoaded,
} from "@models/LoggedInUser";
import type { LoadedResource } from "@api/types";
import MapWithPoints from "@/components/MapWithPoints.vue";
import type { NamedPoint } from "@models/mapUtils";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import sunCalc from "suncalc";
import { DateTime } from "luxon";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import CptvSingleFrame from "@/components/CptvSingleFrame.vue";
import { FixedScaleAxis, Interpolation, LineChart } from "chartist";
import { DeviceType } from "@typedefs/api/consts.ts";
import type {
  ApiDeviceResponse,
  ApiDeviceHistorySettings,
} from "@typedefs/api/device";
import DeviceBatteryLevel from "@/components/DeviceBatteryLevel.vue";
import { resourceIsLoading } from "@/helpers/utils.ts";

const batteryTimeSeries = ref<HTMLDivElement>();

const device = inject("device") as Ref<ApiDeviceResponse | null>;
const route = useRoute();
const deviceId = Number(route.params.deviceId) as DeviceId;

const versionInfo = ref<LoadedResource<Record<string, string>>>(null);
const latestVersionInfo =
  ref<LoadedResource<Record<string, Record<string, Record<string, string>>>>>(
    null,
  );

const deviceConfig = ref<LoadedResource<DeviceConfigDetail>>(null);
const currentLocationForDevice = ref<LoadedResource<ApiLocationResponse>>(null);
const lastPowerOffTime = ref<LoadedResource<Date>>(null);
const lastPowerOnTime = ref<LoadedResource<Date>>(null);
const settings = ref<LoadedResource<ApiDeviceHistorySettings>>(null);
const saltNodeGroup = ref<LoadedResource<string>>(null);
const configInfoLoading = resourceIsLoading(deviceConfig);
const versionInfoLoading = resourceIsLoading(versionInfo);
const latestVersionInfoLoading = resourceIsLoading(versionInfo);
const locationInfoLoading = resourceIsLoading(currentLocationForDevice);
const nodeGroupInfoLoading = resourceIsLoading(saltNodeGroup);
const lastUpdateWasUnsuccessful = ref<boolean>(true);

// Tooltip state
const tooltipVisible = ref(false);
const tooltipContent = ref("");
const tooltipPosition = ref({ x: 0, y: 0 });

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
    now.setHours(17);
    const [hours, mins] = timeStr.split(":").map(Number);
    now.setHours(hours);
    now.setMinutes(mins);
    const nowNow = new Date();
    nowNow.setHours(17);
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
        thisDevice.location.lng,
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
        thisDevice.location.lng,
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
          thisDevice.location.lng,
        );
        return absoluteTime(end, sunrise);
      }
    }
  }
  return null;
});

const shouldBeRecordingNow = computed<boolean>(() => {
  if (records247.value) {
    return true;
  }
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
  },
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

const recordingWindow = computed<string | null>(() => {
  if (records247.value) {
    return "Set to record 24/7";
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
    const start = new Date(scheduledRecordStartTime.value);
    const end = new Date(scheduledRecordEndTime.value);
    if (start > end) {
      end.setDate(end.getDate() + 1);
    }
    const ms = end.getTime() - start.getTime();
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
  return [];
});

// Store voltage data mapped by timestamp for tooltip display
const voltageDataMap = ref<Map<number, number>>(new Map());

const initBatteryInfoTimeSeries = () => {
  if (interpolatedBatteryInfo.value && batteryTimeSeries.value) {
    // Clear previous voltage map
    voltageDataMap.value.clear();

    // Build voltage map for tooltip display
    interpolatedBatteryInfo.value.forEach(item => {
      if (item.voltage !== null) {
        voltageDataMap.value.set(new Date(item.dateTime).getTime(), item.voltage);
      }
    });

    // Determine what data to show
    const hasPercentage = interpolatedBatteryInfo.value.some(item => item.battery !== null);
    const hasVoltage = interpolatedBatteryInfo.value.some(item => item.voltage !== null);

    let primaryData = [];
    let chartLow = 0;
    let chartHigh = 100;
    let axisLabelFormat;

    if (hasPercentage) {
      // Use percentage as primary display
      primaryData = interpolatedBatteryInfo.value
        .filter((item) => item.battery !== null)
        .map((item) => ({
          x: new Date(item.dateTime),
          y: item.battery,
          meta: {
            voltage: item.voltage,
            battery: item.battery,
            dateTime: item.dateTime
          }
        }));
      axisLabelFormat = (value) => `${value}%`;
    } else if (hasVoltage) {
      // Only voltage available, show voltage with proper scaling
      primaryData = interpolatedBatteryInfo.value
        .filter((item) => item.voltage !== null)
        .map((item) => ({
          x: new Date(item.dateTime),
          y: item.voltage,
          meta: {
            voltage: item.voltage,
            battery: null,
            dateTime: item.dateTime
          }
        }));

      const voltageValues = primaryData.map(item => item.y);
      const minVoltage = Math.min(...voltageValues);
      const maxVoltage = Math.max(...voltageValues);
      const voltageRange = maxVoltage - minVoltage;
      chartLow = Math.max(0, minVoltage - voltageRange * 0.1);
      chartHigh = maxVoltage + voltageRange * 0.1;
      axisLabelFormat = (value) => `${value.toFixed(1)}V`;
    }

    if (primaryData.length > 0) {
      const chart = new LineChart(
        batteryTimeSeries.value as HTMLDivElement,
        {
          series: [
            {
              name: "battery",
              data: primaryData,
            }
          ],
        },
        {
          showArea: false,
          low: chartLow,
          high: chartHigh,
          lineSmooth: Interpolation.none(),
          axisX: {
            type: FixedScaleAxis,
            divisor: 10,
            labelInterpolationFnc: (value) =>
              new Date(value).toLocaleString("en-NZ", {
                month: "short",
                day: "numeric",
              }),
          },
          axisY: {
            labelInterpolationFnc: axisLabelFormat
          },
          plugins: []
        },
      );

      // Add event listeners for tooltips
      chart.on("created", () => {
        const points = batteryTimeSeries.value?.querySelectorAll(".ct-point");
        if (points) {
          points.forEach((point) => {
            point.addEventListener("mouseenter", (e: MouseEvent) => {
              const target = e.target as SVGElement;
              const ctValue = target.getAttribute("ct:value");
              if (ctValue) {
                const [x, y] = ctValue.split(",").map(Number);
                const dataPoint = primaryData.find(d =>
                  d.x.getTime() === x && d.y === y
                );

                if (dataPoint && dataPoint.meta) {
                  const date = new Date(dataPoint.meta.dateTime);
                  let content = `<strong>${date.toLocaleDateString("en-NZ", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                  })}</strong><br/>`;

                  if (dataPoint.meta.battery !== null) {
                    content += `Battery: ${dataPoint.meta.battery}%`;
                  }

                  if (dataPoint.meta.voltage !== null) {
                    if (dataPoint.meta.battery !== null) {
                      content += `<br/>`;
                    }
                    content += `Voltage: ${dataPoint.meta.voltage.toFixed(2)}V`;
                  }

                  tooltipContent.value = content;

                  // Position tooltip near the point
                  const rect = (e.target as Element).getBoundingClientRect();
                  const containerRect = batteryTimeSeries.value!.getBoundingClientRect();
                  tooltipPosition.value = {
                    x: rect.left - containerRect.left + rect.width / 2,
                    y: rect.top - containerRect.top - 10
                  };
                  tooltipVisible.value = true;
                }
              }
            });

            point.addEventListener("mouseleave", () => {
              tooltipVisible.value = false;
            });
          });
        }
      });
    }
  }
};

const batteryInfo = ref<LoadedResource<BatteryInfoEvent[]>>(null);
const batteryInfoIsLoading = computed(() => batteryInfo.value === null);
const hasUnknownPowerSource = computed<boolean>(() => {
  if (!isTc2Device.value) {
    return false;
  }
  return (
    !!batteryInfo.value &&
    batteryInfo.value.length !== 0 &&
    batteryInfo.value.every(
      (item) => item.batteryType === "unknown" || item.batteryType === "mains",
    )
  );
});

const interpolatedBatteryInfo = computed<BatteryInfoEvent[]>(() => {
  const eightWeeksAgo = new Date();
  const now = new Date();
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);
  if (batteryInfo.value && batteryInfo.value.length !== 0) {
    const firstEventTime = new Date(
      batteryInfo.value[batteryInfo.value.length - 1].dateTime,
    );
    const lastEventTime = new Date(batteryInfo.value[0].dateTime);
    const emptyDaysAtStart = Math.floor(
      (firstEventTime.getTime() - eightWeeksAgo.getTime()) / 1000 / 60 / 60 / 24,
    );
    const emptyDaysAtEnd = Math.floor(
      (now.getTime() - lastEventTime.getTime()) / 1000 / 60 / 60 / 24,
    );
    const interpolatedValues: BatteryInfoEvent[] = [];
    for (let i = 0; i < emptyDaysAtStart; i++) {
      const dateTime = new Date(eightWeeksAgo);
      dateTime.setDate(dateTime.getDate() + i);
      interpolatedValues.push({
        dateTime,
        voltage: null,
        battery: null,
        batteryType: "lime",
      });
    }
    const sorted = [...batteryInfo.value];
    sorted.sort(
      (a, b) => new Date(b.dateTime).getDate() - new Date(a.dateTime).getTime(),
    );

    interpolatedValues.push(...sorted);
    for (let i = 0; i < emptyDaysAtEnd; i++) {
      const dateTime = new Date(lastEventTime);
      dateTime.setDate(dateTime.getDate() + i);
      interpolatedValues.push({
        dateTime,
        voltage: null,
        battery: null,
        batteryType: "lime",
      });
    }
    return interpolatedValues;
  }
  return [];
});

const latestStatusRecording = inject("latestStatusRecording") as Ref<
  LoadedResource<ApiRecordingResponse>
>;
watch(batteryTimeSeries, () => {
  initBatteryInfoTimeSeries();
});

const loadResource = (
  target: Ref<LoadedResource<unknown>>,
  loader: () => Promise<unknown | false>,
) => {
  if (resourceIsLoading(target)) {
    loader().then((result) => (target.value = result));
  }
};

const deviceLoaded = async () => {
  if (device.value !== null) {
    return true;
  } else {
    return new Promise((resolve, reject) => {
      watch(device, (next) => {
        if (next) {
          resolve(true);
        } else {
          reject();
        }
      });
    });
  }
};

const init = async () => {
  await Promise.all([projectDevicesLoaded(), projectLocationsLoaded()]);
  await deviceLoaded();
  if (device.value) {
    loadResource(deviceConfig, () => getDeviceConfig(deviceId));
    loadResource(versionInfo, () => getDeviceVersionInfo(deviceId));

    loadResource(currentLocationForDevice, () =>
      getDeviceLocationAtTime(deviceId, true),
    );
    loadResource(lastPowerOffTime, () => getDeviceLastPoweredOff(deviceId));
    loadResource(lastPowerOnTime, () => getDeviceLastPoweredOn(deviceId));
    loadResource(saltNodeGroup, () => getDeviceNodeGroup(deviceId));
    const eightWeeksAgo = new Date();
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);
    loadResource(batteryInfo, () => getBatteryInfo(deviceId, eightWeeksAgo));
    loadResource(latestVersionInfo, () => getDeviceLatestVersionInfo());
  }
};

onBeforeMount(init);

const getLatestVersion = (packageName: string, channel: string): string => {
  const model = channel.includes("tc2") ? "tc2" : "pi";
  const branch = model === "pi" ? channel.split("-")[0] : channel.split("-")[1];
  if (latestVersionInfo.value) {
    return latestVersionInfo.value[branch][model][packageName] || "not found";
  }
  return "unknown";
};

const versionInfoTable = computed<
  CardTableRows<string | { version: string; latestVersion: string }>
>(() => {
  const channel = saltNodeGroup.value;
  return Object.entries(versionInfo.value || []).map(([software, version]) => {
    const latestVersion = getLatestVersion(software, channel as string);
    return {
      package: software,
      version: { version, latestVersion },
    };
  });
});

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

enum DevicePowerProfile {
  LowPower,
  HighPower,
  MediumPower,
  Unknown,
}

const powerProfile = computed<DevicePowerProfile>(() => {
  if (
    deviceConfig.value &&
    deviceConfig.value["thermal-recorder"] &&
    deviceConfig.value["thermal-recorder"]["use-low-power-mode"]
  ) {
    return DevicePowerProfile.LowPower;
  }
  return DevicePowerProfile.HighPower;
});

const isTc2Device = computed<boolean>(() => {
  return (saltNodeGroup.value || "").includes("tc2");
});

const primaryBatteryDataType = computed<string>(() => {
  const hasPercentage = interpolatedBatteryInfo.value.some(item => item.battery !== null);
  const hasVoltage = interpolatedBatteryInfo.value.some(item => item.voltage !== null);

  if (hasPercentage && hasVoltage) {
    return "Battery Level (hover for voltage details)";
  } else if (hasPercentage) {
    return "Battery Percentage (%)";
  } else if (hasVoltage) {
    return "Battery Voltage (V)";
  }
  return "";
});
</script>
<template>
  <div v-if="device && device.active" class="mt-3">
    <div class="d-flex justify-content-between flex-md-row flex-column">
      <div v-if="[DeviceType.Thermal, DeviceType.Hybrid].includes(device.type)">
        <h6 v-if="latestStatusRecording">
          Camera view from
          {{
            DateTime.fromJSDate(
              new Date(latestStatusRecording.recordingDateTime),
            ).toRelative()
          }}:
        </h6>
        <cptv-single-frame :recording="latestStatusRecording" v-if="latestStatusRecording" :width="320" :height="240" />
        <h6 class="mt-3">Recording status:</h6>
        <div v-if="!shouldBeRecordingNow && recordingWindow">
          <span v-if="deviceStopped">
            Camera has stopped<span v-if="device.location">, otherwise </span>
            <span v-if="records247">would be recording now</span><span v-else-if="scheduledRecordStartTime">would be
              ready to record
              {{
                DateTime.fromJSDate(scheduledRecordStartTime).toRelative()
              }}</span>
          </span>
          <span v-else-if="scheduledRecordStartTime">Ready to record
            {{
              DateTime.fromJSDate(scheduledRecordStartTime).toRelative()
            }}</span>
          <span v-if="device.location">
            for a duration of
            {{ minsHoursFromMins(currentRecordingWindowLengthMins) }}.</span>
        </div>

        <div v-if="configInfoLoading">
          <b-spinner small class="me-2" />
          Loading recording window
        </div>
        <div v-else-if="recordingWindow && !records247">
          Will {{ recordingWindow }}.
        </div>
        <div v-else-if="records247">{{ recordingWindow }}.</div>
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
            <map-with-points :points="deviceLocationPoints" :highlighted-point="null"
              :active-points="deviceLocationPoints" :radius="30" :is-interactive="false" :zoom="false"
              :can-change-base-map="false" :loading="locationInfoLoading"
              style="min-height: 200px; min-width: 200px; aspect-ratio: 1" />
          </div>
          <div v-else>Device is not currently at a known location</div>
        </div>
        <div v-else>Device does not currently have a known location</div>
      </div>
    </div>
    <div class="mt-4">
      <h6>Power profile:</h6>
      <span v-if="configInfoLoading">
        <b-spinner small class="me-2" />
      </span>
      <div v-else-if="powerProfile === DevicePowerProfile.HighPower">
        <p>This device is currently in 'High Power' mode.</p>
        <p>
          In this mode the device is always ready to upload new recordings to
          the Cacophony Monitoring Platform, which means that you can be alerted
          about detected species a short time after the detection happened. This
          also uses more power since the device remains in a more active state.
        </p>
      </div>
      <div v-else-if="powerProfile === DevicePowerProfile.LowPower">
        <p>This device is currently in 'Low Power' mode.</p>
        <p>
          In this mode the device makes recordings during the configured
          recording window, but doesn't connect to the Cacophony Monitoring
          Platform to offload the recordings until the end of the recording
          period.<br />
          This means that any animal alerts you configure may be delayed by many
          hours. If timely alerts are important to your use-case, enable 'High
          Power' mode.
        </p>
      </div>
    </div>
    <div class="mt-4">
      <div class="d-flex align-items-center h6 justify-content-between">
        <span>Battery info:</span>
        <device-battery-level :device="device" />
      </div>
      <div v-if="batteryInfoIsLoading">
        <b-spinner small class="me-2" /> Loading battery info
      </div>
      <div v-else-if="hasUnknownPowerSource">
        This device has an unrecognised power source.
      </div>
      <div v-else-if="batteryInfo && batteryInfo.length !== 0">
        <div class="battery-chart-info mb-2">
          <small class="text-muted">{{ primaryBatteryDataType }}</small>
        </div>
        <div ref="batteryTimeSeries" class="battery-info-time-series position-relative">
          <!-- Custom tooltip -->
          <div v-if="tooltipVisible" class="battery-tooltip" :style="{
            left: tooltipPosition.x + 'px',
            top: tooltipPosition.y + 'px'
          }" v-html="tooltipContent"></div>
        </div>
      </div>
      <div v-else>No battery info available.</div>
    </div>
    <div class="mt-4">
      <h6>Channel:</h6>
      <span v-if="nodeGroupInfoLoading">
        <b-spinner small class="me-2" />
        Loading channel info
      </span>
      <span v-else>{{ saltNodeGroup }}</span>
    </div>
    <div class="mt-4" v-if="[DeviceType.Thermal, DeviceType.Hybrid].includes(device.type)">
      <h6>Software package versions:</h6>
      <div v-if="
        versionInfoLoading || latestVersionInfoLoading || nodeGroupInfoLoading
      ">
        <b-spinner small class="me-2" />
        Loading version info
      </div>
      <card-table v-else-if="versionInfo" compact :items="versionInfoTable" :sort-dimensions="{ package: true }"
        default-sort="package">
        <template #version="{
          cell: versionInfo,
        }: {
          cell: { version: string; latestVersion: string };
        }">
          <span v-if="
            versionInfo.version.replace(/~/g, '-') ===
            versionInfo.latestVersion
          ">{{ versionInfo.version }}</span>
          <span v-else-if="versionInfo.latestVersion !== 'not found'"><span class="outdated-version">{{
            versionInfo.version }}</span>&nbsp;
            <em class="latest-version">({{ versionInfo.latestVersion }} is latest)</em></span>
          <span v-else>{{ versionInfo.version }}</span>
        </template>
        <template #card="{
          card,
        }: {
          card: {
            package: string;
            version: { version: string; latestVersion: string };
          };
        }">
          <div class="d-flex justify-content-between">
            <span class="text-capitalize"><strong>Package:</strong></span>
            <span class="text-nowrap">{{ card.package }}</span>
          </div>
          <div class="d-flex justify-content-between">
            <span class="text-capitalize"><strong>Version:</strong></span>
            <span v-if="
              card.version.version.replace(/~/g, '-') ===
              card.version.latestVersion
            ">{{ card.version.version }}</span>
            <span v-else-if="card.version.latestVersion !== 'not found'"><span class="outdated-version">{{
              card.version.version }}</span>&nbsp;
              <em class="latest-version">({{ card.version.latestVersion }} is latest)</em></span>
            <span v-else>{{ card.version.version }}</span>
          </div>
        </template>
      </card-table>
      <div v-else>Version info not available.</div>
    </div>
  </div>
  <div v-else-if="device && !device.active" class="p-3">
    <p>
      This device is not currently active.<br />
      This means that it was either retired, or moved to another project.
    </p>
    <p>You can still view historical recording data for this device.</p>
  </div>
  <div v-else class="p-3">Device not found in group.</div>
</template>
<style scoped lang="less">
.map {
  width: 320px;
  height: 240px;
}

.battery-info-time-series {
  min-height: 300px;
  position: relative;
}

.battery-info-time-series :deep(.ct-series-a) {
  .ct-line {
    stroke: #28a745;
    stroke-width: 2px;
  }

  .ct-point {
    stroke: #28a745;
    fill: #28a745;
    stroke-width: 8px;
    cursor: pointer;

    &:hover {
      stroke-width: 10px;
    }
  }
}

.battery-tooltip {
  position: absolute;
  background: rgba(0, 0, 0, 0.85);
  color: white;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
  pointer-events: none;
  z-index: 1000;
  transform: translate(-50%, -100%);
  white-space: nowrap;

  &::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 5px solid transparent;
    border-top-color: rgba(0, 0, 0, 0.85);
  }
}

.battery-chart-info {
  color: #6c757d;
}

.outdated-version {
  color: darkred;
  font-weight: bold;
}

.latest-version {
  color: #777;
}
</style>
<style lang="css">
@import url("chartist/dist/index.css");
</style>