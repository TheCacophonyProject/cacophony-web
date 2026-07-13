<script lang="ts" setup>
import type { Ref } from "vue";
import { computed, inject, onBeforeMount, ref, watch } from "vue";
import { ClientApi } from "@/api";
import type { BatteryInfoEvent, LoadedResource } from "@apiClient/types";
import { useRoute } from "vue-router";
import type { DeviceId } from "@typedefs/api/common";
import CardTable from "@/components/CardTable.vue";
import type { CardTableRows } from "@/components/CardTableTypes";
import type { DeviceConfigDetail } from "@typedefs/api/event";
import {
  projectDevicesLoaded,
  projectLocationsLoaded,
} from "@models/LoggedInUser";
import MapWithPoints from "@/components/MapWithPoints.vue";
import type { NamedPoint } from "@models/mapUtils";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import sunCalc from "suncalc";
import { DateTime } from "luxon";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import CptvSingleFrame from "@/components/CptvSingleFrame.vue";
import { FixedScaleAxis, Interpolation, LineChart } from "chartist";
import { AudioRecordingMode, DeviceType } from "@typedefs/api/consts.ts";
import type {
  ApiDeviceHistorySettings,
  ApiDeviceResponse,
} from "@typedefs/api/device";
import DeviceBatteryLevel from "@/components/DeviceBatteryLevel.vue";
import { resourceIsLoading } from "@/helpers/utils.ts";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";
import { BButton, BPopover, BSpinner } from "bootstrap-vue-next";
import LocationName from "@/components/LocationName.vue";

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
const settings = ref<LoadedResource<ApiDeviceHistorySettings>>(null);
const saltNodeGroup = ref<LoadedResource<string>>(null);
const configInfoLoading = resourceIsLoading(deviceConfig);
const versionInfoLoading = resourceIsLoading(versionInfo);
const latestVersionInfoLoading = resourceIsLoading(versionInfo);
const locationInfoLoading = resourceIsLoading(currentLocationForDevice);
const nodeGroupInfoLoading = resourceIsLoading(saltNodeGroup);
const lastUpdateWasUnsuccessful = ref<boolean>(true);
const saltNodeGroupOrDefault = computed<string>(() => {
  if (saltNodeGroup.value) {
    return saltNodeGroup.value;
  }
  return "tc2-prod";
});
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
    const [hours, mins] = timeStr.split(":").map(Number) as [number, number];
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
      // TODO: just return dusk to dawn, can add extra info with a popover
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
    return `Record from ${startTime} until ${endTime}`;
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

const initBatteryInfoTimeSeries = () => {
  if (interpolatedBatteryInfo.value && batteryTimeSeries.value) {
    const chartLow = 0;
    const chartHigh = 100;

    // Use percentage as primary display
    const primaryData: { x: Date; y: number; meta: BatteryInfoDisplayEvent }[] =
      interpolatedBatteryInfo.value.map((item) => ({
        x: item.dateTime,
        y: item.battery as number,
        meta: {
          voltage: item.voltage,
          battery: item.battery,
          dateTime: item.dateTime,
        },
      }));
    const axisLabelFormat = (value: number) => `${value}%`;

    if (primaryData.length > 0) {
      const chart = new LineChart(
        batteryTimeSeries.value as HTMLDivElement,
        {
          series: [
            {
              name: "battery",
              data: primaryData,
            },
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
            labelInterpolationFnc: axisLabelFormat,
          },
          plugins: [],
        },
      );

      // Add event listeners for tooltips
      chart.on("created", () => {
        if (batteryTimeSeries.value) {
          const points = batteryTimeSeries.value.querySelectorAll(
            ".ct-point",
          ) as unknown as SVGElement[];
          if (points) {
            points.forEach((point) => {
              point.addEventListener("mouseenter", (e: MouseEvent) => {
                const target = e.target as SVGElement;
                const ctValue = target.getAttribute("ct:value");
                if (ctValue) {
                  const [x, y] = ctValue.split(",").map(Number);
                  const dataPoint = primaryData.find(
                    (d) => d.x.getTime() === x && d.y === y,
                  );

                  if (dataPoint && dataPoint.meta) {
                    const date = new Date(dataPoint.meta.dateTime);
                    let content = `<strong>${date.toLocaleDateString("en-NZ", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
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
                    const containerRect =
                      batteryTimeSeries.value!.getBoundingClientRect();
                    tooltipPosition.value = {
                      x: rect.left - containerRect.left + rect.width / 2,
                      y: rect.top - containerRect.top - 10,
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
      (item) =>
        item.batteryType === "unknown_battery_type" ||
        item.batteryType === "mains",
    )
  );
});
interface BatteryInfoDisplayEvent {
  dateTime: Date;
  voltage: number | null;
  battery: number | null;
}
const interpolatedBatteryInfo = computed<BatteryInfoDisplayEvent[]>(() => {
  const eightWeeksAgo = new Date();
  const now = new Date();
  const sortedEvents: BatteryInfoDisplayEvent[] = (batteryInfo.value || []).map(
    (event: BatteryInfoEvent) => ({
      ...event,
      dateTime: new Date(event.dateTime),
    }),
  );
  sortedEvents.sort(
    (a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime(),
  );
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);
  if (sortedEvents.length !== 0) {
    const firstEvent = sortedEvents[0] as BatteryInfoDisplayEvent;
    const lastEvent = sortedEvents[
      sortedEvents.length - 1
    ] as BatteryInfoDisplayEvent;
    const firstEventTime = firstEvent.dateTime;
    const lastEventTime = lastEvent.dateTime;
    const emptyDaysAtStart = Math.floor(
      (firstEventTime.getTime() - eightWeeksAgo.getTime()) /
        1000 /
        60 /
        60 /
        24,
    );
    const emptyDaysAtEnd = Math.floor(
      (now.getTime() - lastEventTime.getTime()) / 1000 / 60 / 60 / 24,
    );
    const interpolatedValues: BatteryInfoDisplayEvent[] = [];
    for (let i = 0; i < emptyDaysAtStart; i++) {
      const dateTime = new Date(eightWeeksAgo);
      dateTime.setDate(dateTime.getDate() + i);
      interpolatedValues.push({
        dateTime,
        voltage: null,
        battery: null,
      });
    }
    interpolatedValues.push(...sortedEvents);
    for (let i = 0; i < emptyDaysAtEnd; i++) {
      const dateTime = new Date(lastEventTime);
      dateTime.setDate(dateTime.getDate() + i);
      interpolatedValues.push({
        dateTime,
        voltage: null,
        battery: null,
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
    loadResource(deviceConfig, () =>
      ClientApi.Devices.getDeviceConfig(deviceId),
    );
    loadResource(versionInfo, () =>
      ClientApi.Devices.getDeviceVersionInfo(deviceId),
    );
    loadResource(currentLocationForDevice, () =>
      ClientApi.Devices.getDeviceLocationAtTime(deviceId, true),
    );
    loadResource(saltNodeGroup, () =>
      ClientApi.Devices.getDeviceNodeGroup(deviceId),
    );
    const eightWeeksAgo = new Date();
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);
    loadResource(batteryInfo, () =>
      ClientApi.Devices.getBatteryInfo(deviceId, eightWeeksAgo),
    );
    loadResource(latestVersionInfo, () =>
      ClientApi.Devices.getDeviceLatestVersionInfo(),
    );
  }
};

onBeforeMount(init);

const getLatestVersion = (packageName: string, channel: string): string => {
  const model = channel.includes("pi") ? "pi" : "tc2";
  if (channel.trim() === "" || channel.trim() === "unknown") {
    return "unknown";
  }
  const branch = model === "pi" ? channel.split("-")[0] : channel.split("-")[1];
  if (
    latestVersionInfo.value &&
    latestVersionInfo.value[branch] &&
    latestVersionInfo.value[branch][model]
  ) {
    return latestVersionInfo.value[branch][model][packageName] || "unknown";
  }
  return "unknown";
};

const versionInfoTable = computed<
  CardTableRows<string | { version: string; latestVersion: string }>
>(() => {
  const channel = saltNodeGroupOrDefault.value;
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

const locationCopied = ref<boolean>(false);
let locationCopiedTimeout: number;

const copyLocation = () => {
  if (device.value && device.value.location) {
    const { lat, lng } = device.value.location;
    navigator.clipboard.writeText(`${lat}, ${lng}`);
    locationCopied.value = true;

    clearTimeout(locationCopiedTimeout);

    locationCopiedTimeout = setTimeout(() => {
      locationCopied.value = false;
    }, 1500) as unknown as number;
  }
};

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
  const hasPercentage = interpolatedBatteryInfo.value.some(
    (item) => item.battery !== null,
  );
  const hasVoltage = interpolatedBatteryInfo.value.some(
    (item) => item.voltage !== null,
  );

  if (hasPercentage && hasVoltage) {
    // FIXME: Maybe don't display this on touch only devices.
    return "Battery Level (hover for voltage details)";
  } else if (hasPercentage) {
    return "Battery Percentage (%)";
  } else if (hasVoltage) {
    return "Battery Voltage (V)";
  }
  return "";
});

const showSoftwareInformation = ref<boolean>(false);

const canRecordAudio = computed<boolean>(() => {
  return isTc2Device.value;
});

const audioRecordingMode = computed<AudioRecordingMode>(() => {
  if (
    deviceConfig.value &&
    deviceConfig.value["audio-recording"] &&
    deviceConfig.value["audio-recording"]["audio-mode"]
  ) {
    return deviceConfig.value["audio-recording"]["audio-mode"];
  }
  if (isTc2Device.value) {
    return AudioRecordingMode.AudioAndThermal;
  }
  return AudioRecordingMode.Disabled;
});

const audioRecordingModeDisplay = computed<string>(() => {
  switch (audioRecordingMode.value) {
    case AudioRecordingMode.AudioOrThermal:
      return "Audio or thermal";
    case AudioRecordingMode.AudioOnly:
      return "Audio only";
    case AudioRecordingMode.Disabled:
      return "Thermal video only";
    case AudioRecordingMode.AudioAndThermal:
    default:
      return "Audio and thermal";
  }
});

const audioRecordingModeDescription = computed<string>(() => {
  // FIXME: J+S How should this be displayed with non DOC AI cam devices?
  switch (audioRecordingMode.value) {
    case AudioRecordingMode.AudioOrThermal:
      return "Device records thermal video and audio. Audio is only recorded outside of the thermal recording schedule.";
    case AudioRecordingMode.AudioOnly:
      return "Device records only audio, thermal video recording is disabled.";
    case AudioRecordingMode.Disabled:
      return "Device records only thermal video, audio recording is disabled.";
    case AudioRecordingMode.AudioAndThermal:
    default:
      return (
        "Record thermal video and a one-minute clip of audio 32 times a day, at random intervals during the day. " +
        "The device won't be able to record thermal video while the audio is being recorded."
      );
  }
});

const audioRecordingSchedule = computed<string>(() => {
  switch (audioRecordingMode.value) {
    case AudioRecordingMode.AudioOrThermal:
      return "Record outside of the thermal recording schedule";
    case AudioRecordingMode.AudioOnly:
      return "Set to record 24/7";
    case AudioRecordingMode.Disabled:
      return "Audio recording disabled";
    case AudioRecordingMode.AudioAndThermal:
    default:
      return "Set to record at random times throughout the day and night";
  }
});

const audioRecordingScheduleDescription = computed<string>(() => {
  switch (audioRecordingMode.value) {
    case AudioRecordingMode.AudioOrThermal:
      return `<p class="mb-0">Records a one-minute clip of audio outside of the thermal video recording schedule.</p>`;
    case AudioRecordingMode.AudioOnly:
      return `<p class="mb-0">Records a one-minute clip of audio 32 times a day, at random intervals during the day.</p>`;
    case AudioRecordingMode.Disabled:
      if (isTc2Device.value) {
        return `<p class="mb-0">Audio recording is disabled, device records only thermal video.</p>`;
      } else {
        return `<p class="mb-0">This device is not capable of making audio recordings</p>`;
      }
    case AudioRecordingMode.AudioAndThermal:
    default:
      return `<p class="mb-2">Records a one-minute clip of audio 32 times a day, at random intervals during the day.</p>
      <p class="mb-0">The device won't be able to record thermal video while the audio is being recorded.</p>`;
  }
});
</script>
<template>
  <div v-if="device && device.active" class="mt-3 d-flex flex-column">
    <div class="bento-grid gap-3">
      <!-- Device configuration -->
      <div class="bento-box configuration">
        <h4 class="h4 mb-3">Current device configuration</h4>

        <div
          v-if="[DeviceType.Thermal, DeviceType.Hybrid].includes(device.type)"
        >
          <dl class="settings-summary container mb-0">
            <!-- Device status -->
            <div class="row">
              <dt
                class="col-sm-4 d-sm-inline-flex mb-0 mb-sm-1 pb-0 ps-0 py-sm-2 fw-medium"
              >
                Device status
              </dt>
              <dd
                class="col-sm-8 d-sm-inline-flex mb-3 mb-sm-1 pt-1 px-0 py-sm-2"
              >
                <!-- TODO: infer this state better, doesn't report correctly for offline devices  -->
                <div v-if="deviceStopped">
                  <span
                    class="d-flex d-inline-flex align-items-center px-1 rounded bg-danger-subtle text-danger-emphasis"
                  >
                    <material-symbol
                      name="close"
                      size="1.125rem"
                      class="me-1"
                    ></material-symbol>
                    Stopped
                  </span>
                </div>
                <div v-else class="d-flex align-items-center">
                  <span
                    class="d-flex d-inline-flex align-items-center px-1 rounded bg-success-subtle text-success-emphasis"
                  >
                    <material-symbol
                      name="check"
                      size="1.125rem"
                      class="me-1"
                    ></material-symbol>
                    Ready
                  </span>
                  <!-- TODO: add description of what these states mean -->
                  <!--                  <b-button
                    variant="outline-secondary"
                    size="sm"
                    class="btn-icon d-flex"
                    aria-label="View device status details"
                    id="device-ready-description"
                  >
                    <material-symbol name="info" size="1.25rem" />
                  </b-button>
                  <b-popover
                    target="device-ready-description"
                  >
                    This device connected to the Cacophony Monitoring Platform within the last 24 hours
                  </b-popover>-->
                </div>
              </dd>
            </div>

            <!-- Power profile -->
            <div class="row">
              <dt
                class="col-sm-4 d-sm-inline-flex mb-0 mb-sm-1 pb-0 ps-0 py-sm-2 fw-medium"
              >
                Power profile
              </dt>
              <dd
                class="col-sm-8 d-sm-inline-flex mb-3 mb-sm-1 pt-1 px-0 py-sm-2"
              >
                <div v-if="configInfoLoading">
                  <b-spinner small class="me-2" /> Loading power profile
                </div>
                <span
                  v-else-if="powerProfile === DevicePowerProfile.HighPower"
                  class="d-flex align-items-center"
                >
                  <span>High Power mode</span>
                  <b-button
                    variant="light"
                    size="sm"
                    class="btn-icon d-inline-flex"
                    aria-label="View mode details"
                    id="high-power-mode-description"
                  >
                    <material-symbol name="info" size="1.25rem" />
                  </b-button>
                  <b-popover
                    target="high-power-mode-description"
                    class="popover-wide"
                  >
                    <p class="mb-2">
                      Devices in High Power mode upload new recordings to the
                      Cacophony Monitoring Platform immediately (if connected to
                      the internet).
                    </p>
                    <p class="mb-0">
                      Any alerts configured for specific species will be sent
                      out shortly after the detection.
                    </p>
                  </b-popover>
                </span>
                <div v-else-if="powerProfile === DevicePowerProfile.LowPower">
                  <span>Low Power mode</span>
                  <b-button
                    variant="light"
                    size="sm"
                    class="btn-icon d-inline-flex"
                    aria-label="View mode details"
                    id="low-power-mode-description"
                  >
                    <material-symbol name="info" size="1.25rem" />
                  </b-button>
                  <b-popover
                    class="popover-wide"
                    target="low-power-mode-description"
                  >
                    <p class="mb-2">
                      Devices in Low Power mode will only connect to the
                      Cacophony Monitoring Platform once per day to offload
                      recordings.
                    </p>
                    <p class="mb-0">
                      Projects tracking an incursion that require real-time
                      alerts of species detected should enable high power mode.
                    </p>
                  </b-popover>
                </div>
                <!-- TODO: v-else for unknown profile? Can this happen? -->
              </dd>
            </div>

            <div class="row">
              <dt
                class="col-sm-4 d-sm-inline-flex mb-0 mb-sm-1 pb-0 ps-0 py-sm-2 fw-medium"
              >
                Recording settings
              </dt>
              <dd
                class="col-sm-8 d-sm-inline-flex mb-3 mb-sm-1 pt-1 px-0 py-sm-2"
              >
                <span class="d-flex align-items-center">
                  {{ audioRecordingModeDisplay }}
                  <b-button
                    variant="light"
                    size="sm"
                    class="btn-icon d-inline-flex"
                    aria-label="View mode details"
                    id="audio-mode-description"
                  >
                    <material-symbol name="info" size="1.25rem" />
                  </b-button>
                  <b-popover
                    class="popover-wide"
                    target="audio-mode-description"
                  >
                    <p class="mb-0">{{ audioRecordingModeDescription }}</p>
                  </b-popover>
                </span>
              </dd>
            </div>

            <!-- Thermal recording schedule -->
            <div
              class="row"
              v-if="audioRecordingMode !== AudioRecordingMode.AudioOnly"
            >
              <dt
                class="col-sm-4 d-sm-inline-flex mb-0 mb-sm-1 pb-0 ps-0 py-sm-2 fw-medium"
              >
                Thermal recording schedule
              </dt>
              <dd
                class="col-sm-8 d-sm-inline-flex mb-3 mb-sm-1 pt-1 px-0 py-sm-2"
              >
                <div v-if="configInfoLoading">
                  <b-spinner small class="me-2" />
                  Loading recording window
                </div>
                <div v-else-if="recordingWindow && !records247">
                  <p class="lh-base mb-1 mb-sm-0">{{ recordingWindow }}</p>
                  <div
                    v-if="!shouldBeRecordingNow && recordingWindow"
                    class="text-secondary lh-base"
                  >
                    <span v-if="scheduledRecordStartTime">
                      <span v-if="deviceStopped"> Would record </span>
                      <span v-else> Scheduled to record </span>
                      {{
                        DateTime.fromJSDate(
                          scheduledRecordStartTime as Date,
                        ).toRelative()
                      }}</span
                    >
                    <span v-if="device.location">
                      for a duration of
                      {{
                        minsHoursFromMins(currentRecordingWindowLengthMins)
                      }}</span
                    >
                  </div>
                </div>
                <div v-else-if="records247">{{ recordingWindow }}</div>
                <div v-else class="text-secondary">
                  Recording window unavailable
                </div>
              </dd>
            </div>
            <div class="row">
              <dt
                class="col-sm-4 d-sm-inline-flex mb-0 mb-sm-0 pb-0 ps-0 py-sm-2 pb-sm-0 fw-medium"
              >
                Audio recording schedule
              </dt>
              <dd
                class="col-sm-8 d-sm-inline-flex mb-0 mb-sm-0 pt-1 px-0 py-sm-2 pb-sm-0 align-items-start"
              >
                <div class="d-flex align-items-center">
                  <span
                    :class="{
                      'text-secondary':
                        audioRecordingMode === AudioRecordingMode.Disabled,
                    }"
                    class="lh-base"
                  >
                    {{ audioRecordingSchedule }}
                  </span>
                  <b-button
                    variant="light"
                    size="sm"
                    class="btn-icon d-inline-flex"
                    aria-label="View audio recording schedule details"
                    id="audio-recording-mode-description"
                  >
                    <material-symbol name="info" size="1.25rem" />
                  </b-button>
                  <b-popover
                    class="popover-wide"
                    target="audio-recording-mode-description"
                  >
                    <span v-html="audioRecordingScheduleDescription"></span>
                  </b-popover>
                </div>
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <!-- Location -->
      <div class="bento-box location d-flex flex-column">
        <h4 class="h4 mb-3 d-flex">
          <span v-if="!deviceStopped">Current location</span>
          <span v-else>Last known location</span>
        </h4>
        <!-- Show the device "inside" its station if possible -->
        <div v-if="device.location" class="flex-grow-1 d-flex flex-column">
          <div v-if="locationInfoLoading">
            <b-spinner small class="me-2" />
            Loading location info
          </div>
          <div
            v-else-if="currentLocationForDevice"
            class="d-flex flex-column flex-fill"
          >
            <p class="mt-1">
              <location-name :name="currentLocationForDevice.name" />
            </p>

            <div class="d-flex flex-column flex-sm-row flex-fill row">
              <div class="col col-12 col-sm-6">
                <dl class="settings-summary container mb-0 mb-sm-3">
                  <div class="row">
                    <dt
                      class="col-sm-6 d-sm-inline-flex mb-0 mb-sm-1 pb-0 ps-0 py-sm-2 fw-medium"
                    >
                      Latitude
                    </dt>
                    <dd
                      class="col-sm-6 d-sm-inline-flex mb-3 mb-sm-1 pt-1 px-0 py-sm-2"
                    >
                      {{ device.location.lat.toFixed(6) }}
                    </dd>
                  </div>
                  <div class="row">
                    <dt
                      class="col-sm-6 d-sm-inline-flex mb-0 mb-sm-1 pb-0 ps-0 py-sm-2 fw-medium"
                    >
                      Longitude
                    </dt>
                    <dd
                      class="col-sm-6 d-sm-inline-flex mb-3 mb-sm-1 pt-1 px-0 py-sm-2"
                    >
                      {{ device.location.lng.toFixed(6) }}
                    </dd>
                  </div>
                </dl>
                <b-popover v-model="locationCopied" manual>
                  <span class="d-flex">
                    <material-symbol
                      name="check"
                      size="1.25rem"
                      class="me-2 text-success"
                    />
                    Copied
                  </span>
                  <template #target>
                    <b-button
                      variant="outline-secondary"
                      class="d-flex align-items-center mb-3"
                      @click="copyLocation"
                    >
                      <material-symbol
                        name="content_copy"
                        size="1.25rem"
                        class="me-2"
                      />Copy coordinates
                    </b-button>
                  </template>
                </b-popover>
              </div>
              <div class="col col-12 col-sm-6">
                <map-with-points
                  :points="deviceLocationPoints"
                  :highlighted-point="null"
                  :active-points="deviceLocationPoints"
                  :radius="30"
                  :is-interactive="false"
                  :zoom="false"
                  :can-change-base-map="false"
                  :loading="locationInfoLoading"
                  class="location-map"
                />
              </div>
            </div>
          </div>
          <div
            v-else
            class="d-flex flex-fill align-items-center justify-content-center"
          >
            <div class="text-secondary text-center">
              <material-symbol
                name="not_listed_location"
                size="2.4rem"
                grade="thin"
                class="mb-2"
              />
              <p>Device is not currently at a known location.</p>
            </div>
          </div>
        </div>
        <div
          v-else
          class="d-flex flex-fill align-items-center justify-content-center"
        >
          <div class="text-secondary text-center">
            <material-symbol
              name="not_listed_location"
              size="2.4rem"
              grade="thin"
              class="mb-2"
            />
            <p>Device does not currently have a known location.</p>
          </div>
        </div>
      </div>

      <!-- CPTV frame -->
      <div class="bento-box view d-flex flex-column flex-fill">
        <h4 class="h4">Camera view</h4>
        <div
          v-if="[DeviceType.Thermal, DeviceType.Hybrid].includes(device.type)"
          class="flex-grow-1 d-flex flex-column"
        >
          <div v-if="latestStatusRecording">
            <p class="text-secondary">
              Last seen
              {{
                DateTime.fromJSDate(
                  new Date(latestStatusRecording.recordingDateTime),
                ).toRelative()
              }}
            </p>
            <cptv-single-frame :recording="latestStatusRecording" />
          </div>
          <div
            v-else
            class="d-flex flex-fill align-items-center justify-content-center"
          >
            <div class="text-secondary text-center d-flex flex-column">
              <material-symbol
                name="videocam_off"
                size="2.4rem"
                grade="thin"
                class="mb-2"
              />
              Camera view not available.
            </div>
          </div>
        </div>
        <div
          v-else
          class="flex-grow-1 d-flex flex-fill align-items-center justify-content-center"
        >
          <div class="text-secondary text-center d-flex flex-column">
            <material-symbol
              name="videocam_off"
              size="2.4rem"
              grade="thin"
              class="mb-2"
            />
            Camera view not available.
          </div>
        </div>
      </div>

      <!-- Battery info -->
      <div class="bento-box battery d-flex flex-column">
        <div class="d-flex justify-content-between align-items-start">
          <h4 class="h4">Battery information</h4>
          <device-battery-level :device="device" />
        </div>
        <div
          v-if="batteryInfoIsLoading"
          class="flex-grow-1 d-flex align-items-center justify-content-center"
        >
          <b-spinner small class="me-2" /> Loading battery info
        </div>
        <div
          v-else-if="hasUnknownPowerSource"
          class="flex-grow-1 d-flex align-items-center justify-content-center"
        >
          <div class="text-secondary text-center d-flex flex-column">
            <material-symbol
              name="battery_unknown"
              size="2.4rem"
              grade="thin"
              class="mb-2"
            />
            This device has an unrecognised power source.
          </div>
        </div>
        <div
          v-else-if="batteryInfo && batteryInfo.length !== 0"
          class="flex-grow-1 d-flex flex-column"
        >
          <div class="battery-chart-info">
            <p class="text-secondary">{{ primaryBatteryDataType }}</p>
          </div>
          <div
            ref="batteryTimeSeries"
            class="battery-info-time-series position-relative flex-grow-1"
          >
            <!-- Custom tooltip -->
            <div
              v-if="tooltipVisible"
              class="battery-tooltip"
              :style="{
                left: tooltipPosition.x + 'px',
                top: tooltipPosition.y + 'px',
              }"
              v-html="tooltipContent"
            ></div>
          </div>
        </div>
        <div
          v-else
          class="flex-grow-1 d-flex align-items-center justify-content-center"
        >
          <div class="text-secondary text-center d-flex flex-column">
            <material-symbol
              name="battery_unknown"
              size="2.4rem"
              grade="thin"
              class="mb-2"
            />
            No battery information available.
          </div>
        </div>
      </div>
    </div>

    <div v-if="!showSoftwareInformation" class="text-center">
      <b-button
        variant="outline-secondary"
        @click="showSoftwareInformation = true"
        class="my-3"
      >
        View software information
      </b-button>
    </div>

    <div v-if="showSoftwareInformation" class="mb-3">
      <!-- Channel -->
      <div class="bento-box mt-3" ref="software-information">
        <h4 class="h4">Channel</h4>
        <span v-if="nodeGroupInfoLoading">
          <b-spinner small class="me-2" />
          Loading channel info
        </span>
        <span v-else>{{ saltNodeGroup || "unknown" }}</span>
      </div>

      <!-- Software info -->
      <div
        class="bento-box mt-3"
        v-if="[DeviceType.Thermal, DeviceType.Hybrid].includes(device.type)"
      >
        <h4 class="h4">Software information</h4>
        <div
          v-if="
            versionInfoLoading ||
            latestVersionInfoLoading ||
            nodeGroupInfoLoading
          "
        >
          <b-spinner small class="me-2" />
          Loading version info
        </div>
        <card-table
          v-else-if="versionInfo"
          compact
          :items="versionInfoTable"
          :sort-dimensions="{ package: true }"
          default-sort="package"
        >
          <template
            #version="{
              cell: versionInfo,
            }: {
              cell: { version: string; latestVersion: string };
            }"
          >
            <span
              v-if="
                versionInfo.version.replace(/~/g, '-') ===
                versionInfo.latestVersion
              "
              >{{ versionInfo.version }}</span
            >
            <span v-else-if="versionInfo.latestVersion !== 'not found'"
              ><span class="outdated-version">{{ versionInfo.version }}</span
              >&nbsp;
              <span class="latest-version"
                >({{ versionInfo.latestVersion }} is latest)</span
              ></span
            >
            <span v-else>{{ versionInfo.version }}</span>
          </template>
          <template
            #card="{
              card,
            }: {
              card: {
                package: string;
                version: { version: string; latestVersion: string };
              };
            }"
          >
            <div class="d-flex justify-content-between">
              <span class="text-capitalize"><strong>Package:</strong></span>
              <span class="text-nowrap">{{ card.package }}</span>
            </div>
            <div class="d-flex justify-content-between">
              <span class="text-capitalize"><strong>Version:</strong></span>
              <span
                v-if="
                  card.version.version.replace(/~/g, '-') ===
                  card.version.latestVersion
                "
                >{{ card.version.version }}</span
              >
              <span v-else-if="card.version.latestVersion !== 'not found'"
                ><span class="outdated-version">{{ card.version.version }}</span
                >&nbsp;
                <span class="latest-version"
                  >({{ card.version.latestVersion }} is latest)</span
                ></span
              >
              <span v-else>{{ card.version.version }}</span>
            </div>
          </template>
        </card-table>
        <div v-else>Version info not available.</div>
      </div>
    </div>
  </div>
  <div
    v-else-if="device && !device.active"
    class="align-items-center justify-content-center"
  >
    <div class="text-secondary text-center">
      <material-symbol
        name="developer_board_off"
        size="2.4rem"
        grade="thin"
        class="mb-2"
      />
      <p>
        This device is not currently active.<br />
        This means that it was either retired, or moved to another project.
      </p>
      <p>You can still view historical recording data for this device.</p>
    </div>
  </div>
  <div v-else class="align-items-center justify-content-center">
    <div class="text-secondary text-center">
      <material-symbol
        name="developer_board_off"
        size="2.4rem"
        grade="thin"
        class="mb-2"
      />
      <p>Device not found in project.</p>
    </div>
  </div>
</template>
<style scoped lang="less">
@import "../assets/less/breakpoints";
@import "../assets/less/elevation";

.bento-box {
  background: var(--bs-white);
  padding: var(--cp-spacing-lg);
  border-radius: var(--bs-border-radius);
  .standard-shadow();
}

.map {
  height: 144px;
}

@media (max-width: @breakpoint-sm-max) {
  .bento-grid {
    display: grid;
    grid-template-columns: repeat(1, minmax(0, 1fr));
  }
}

@media (min-width: @breakpoint-md) and (max-width: @breakpoint-md-max) {
  .bento-grid {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    grid-template-rows: auto;

    .configuration {
      grid-column: span 8 / span 8;
    }

    .location {
      grid-column: span 5 / span 5;
      grid-row-start: 2;
    }

    .view {
      grid-column: span 3 / span 3;
      grid-column-start: 6;
      grid-row-start: 2;
    }

    .battery {
      grid-column: span 8 / span 8;
      grid-row-start: 3;
    }
  }
}
.location-map {
  .standard-shadow-inset();
  border: 1px solid var(--border-color-light);
  border-radius: var(--bs-border-radius);
}
@media (min-width: @breakpoint-md) {
  .location-map {
    &.map {
      height: 100%;
    }
  }
}

@media (min-width: @breakpoint-lg) {
  .bento-grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    grid-template-rows: auto;

    .configuration {
      grid-column: span 7 / span 7;
    }

    .location {
      grid-column: span 5 / span 5;
      grid-column-start: 8;
    }

    .view {
      grid-column: span 4 / span 4;
      grid-row-start: 2;
    }

    .battery {
      grid-column: span 8 / span 8;
      grid-row-start: 2;
    }
  }
}

@media (min-width: @breakpoint-xxl) {
  .bento-grid {
    .view {
      grid-column: span 3 / span 3;
      grid-row-start: 2;
    }

    .battery {
      grid-column: span 9 / span 9;
      grid-row-start: 2;
    }
  }
}

.settings-summary {
  @media (min-width: @breakpoint-xs-max) {
    div:not(:last-of-type) {
      dt,
      dd {
        border-bottom: 1px solid var(--border-color-light);
      }
    }
  }
}

.single-frame-cptv-container {
  width: 100%;
  min-width: auto;
  aspect-ratio: auto 4/3;
}

.battery-info-time-series {
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
    content: "";
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 5px solid transparent;
    border-top-color: rgba(0, 0, 0, 0.85);
  }
}

.outdated-version {
  color: var(--bs-danger);
  font-weight: bold;
}

.latest-version {
  color: var(--bs-secondary);
}
</style>
<style lang="less">
.popover {
  &.popover-wide {
    width: 320px;
    min-width: 320px;
  }
}
</style>
<style lang="css">
@import url("chartist/dist/index.css");
</style>
