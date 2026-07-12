<script setup lang="ts">
import { computed, inject, onBeforeMount, ref, type Ref, watch } from "vue";
import { selectedProjectDevices } from "@models/provides.ts";
import type {
  ApiDeviceHistorySettings,
  ApiDeviceResponse,
} from "@typedefs/api/device";
import { useRoute } from "vue-router";
import type { DeviceId } from "@typedefs/api/common";
import type { LoadedResource } from "@apiClient/types.ts";
import { ClientApi } from "@/api";
import { VueDatePicker } from "@vuepic/vue-datepicker";
import { projectDevicesLoaded } from "@models/LoggedInUser.ts";
import { resourceIsLoading } from "@/helpers/utils.ts";
import { AudioRecordingMode, type DeviceTypeUnion } from "@typedefs/api/consts";
import SectionCard from "@/components/SectionCard.vue";
import {
  BAlert,
  BBadge,
  BFormCheckbox,
  BFormGroup,
  BFormInput,
  BFormRadio,
  BFormRadioGroup,
  BFormSelect,
  BInput,
  BSpinner,
} from "bootstrap-vue-next";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";
import sunCalc from "suncalc";
import { DateTime } from "luxon";
import { timezoneForLatLng } from "@models/visitsUtils.ts";

type Time = { hours: number; minutes: number; seconds: number };
const devices = inject(selectedProjectDevices) as Ref<
  ApiDeviceResponse[] | null
>;
const route = useRoute();
const deviceModel = ref<LoadedResource<DeviceTypeUnion>>(null);
// Device Settings
const settings = ref<LoadedResource<ApiDeviceHistorySettings>>(null);
const syncedSettings = ref<LoadedResource<ApiDeviceHistorySettings>>(null);

const lastSyncedSettings = computed<LoadedResource<ApiDeviceHistorySettings>>(
  () => {
    if (settings.value && settings.value.synced) {
      return settings.value;
    } else if (syncedSettings.value) {
      return syncedSettings.value;
    }
    return false;
  },
);

const deviceId = computed<DeviceId>(
  () => Number(route.params.deviceId) as DeviceId,
);
const device = computed<ApiDeviceResponse | null>(() => {
  return (
    (devices.value &&
      devices.value.find(
        (device: ApiDeviceResponse) => device.id === deviceId.value,
      )) ||
    null
  );
});

const settingsLoading = resourceIsLoading(settings);
const lastSyncedSettingsLoading = resourceIsLoading(lastSyncedSettings);

const isTc2Device = computed<boolean>(() => {
  return saltNodeGroupOrDefault.value.includes("tc2");
});
const defaultWindows = {
  powerOn: "-30m",
  powerOff: "+30m",
  startRecording: "-30m",
  stopRecording: "+30m",
};
const timeStrToTimeObj = (timeStr: string): Time => {
  if (!timeStr.includes(":")) {
    return { hours: 12, minutes: 0, seconds: 0 };
  }
  const [hours, minutes] = timeStr.split(":").map(Number) as [number, number];
  return { hours, minutes, seconds: 0 };
};

const timeObjToTimeStr = (time: Time): string => {
  return `${String(time.hours).padStart(2, "0")}:${String(
    time.minutes,
  ).padStart(2, "0")}`;
};

const fetchSettings = async () => {
  const response = await ClientApi.Devices.getSettingsForDevice(deviceId.value);
  if (response && response.success && response.result.settings) {
    const settings = response.result.settings;
    if (settings && !settings.synced) {
      // Load last synced settings
      const response = await ClientApi.Devices.getSettingsForDevice(
        deviceId.value,
        true,
      );
      if (response && response.success && response.result.settings) {
        syncedSettings.value = response.result.settings;
      }
    }
    return settings;
  }
  return {
    windows: defaultWindows,
    thermalRecording: {
      toggleUseLowPowerMode: false,
    },
  };
};

const records247 = computed<boolean>(() => {
  // Device records 24/7 if power-on time is non-relative and is set to the same as power off time.
  if (settings.value) {
    const start = thermalStartTime.value;
    const end = thermalStopTime.value;
    if (!start.endsWith("m") || !end.endsWith("m")) {
      return start === end;
    }
  }
  return false;
});

const recordingWindow = computed<string | null>(() => {
  if (records247.value) {
    return "Record 24/7";
  } else if (settings.value) {
    const start = thermalStartTime.value;
    const end = thermalStopTime.value;
    let startTime;
    let endTime;
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
    return `Record from ${startTime} until ${endTime}`;
  }
  return null;
});

const loadResource = async (
  target: Ref<LoadedResource<unknown>>,
  loader: () => Promise<unknown | false>,
): Promise<void> => {
  return new Promise((resolve) => {
    const isLoading = target.value === null;
    if (isLoading) {
      loader().then((result) => {
        target.value = result;
        resolve();
      });
    } else {
      resolve();
    }
  });
};
const initialised = ref<boolean>(false);
const saltNodeGroup = ref<LoadedResource<string>>(null);
const saltNodeGroupOrDefault = computed<string>(() => {
  if (saltNodeGroup.value) {
    return saltNodeGroup.value;
  }
  return "tc2-prod";
});
onBeforeMount(async () => {
  initialised.value = false;
  await Promise.all([
    projectDevicesLoaded(),
    loadResource(settings, fetchSettings),
    loadResource(saltNodeGroup, () =>
      ClientApi.Devices.getDeviceNodeGroup(deviceId.value),
    ),
  ]);
  initialised.value = true;
});

const useLowPowerMode = computed<boolean>({
  get: () => {
    return (
      (settings.value as ApiDeviceHistorySettings)?.thermalRecording
        ?.useLowPowerMode ?? false
    );
  },
  set: (val: boolean) => {
    if (settings.value) {
      (settings.value as ApiDeviceHistorySettings).thermalRecording = {
        useLowPowerMode: val,
        updated: new Date().toISOString(),
      };
      settings.value.synced = false;
    }
  },
});
const recordingWindowSetting = computed<"default" | "always" | "custom">({
  get: () => {
    const s = settings.value as ApiDeviceHistorySettings;
    if (s && s.windows && s.windows.startRecording && s.windows.stopRecording) {
      const start = s.windows.startRecording;
      const stop = s.windows.stopRecording;
      if (
        (start.startsWith("+") || start.startsWith("-")) &&
        (stop.startsWith("+") || stop.startsWith("-"))
      ) {
        return "default";
      } else if (start === stop) {
        return "always";
      } else {
        return "custom";
      }
    } else {
      return "default";
    }
  },
  set: (val: "default" | "always" | "custom") => {
    if (settings.value) {
      if (val === "default" && settings.value) {
        settings.value.windows = {
          ...defaultWindows,
          updated: new Date().toISOString(),
        };
      } else if (val === "always") {
        settings.value.windows = {
          ...(!isTc2Device.value
            ? {
                powerOn: "12:00",
                powerOff: "12:00",
              }
            : {}),
          startRecording: "12:00",
          stopRecording: "12:00",
          updated: new Date().toISOString(),
        };
      } else {
        settings.value.windows = {
          ...(!isTc2Device.value
            ? {
                powerOn: "09:00",
                powerOff: "17:00",
              }
            : {}),
          startRecording: "09:00",
          stopRecording: "17:00",
          updated: new Date().toISOString(),
        };
      }
      settings.value.synced = false;
    }
  },
});
const customRecordingWindowStart = computed<Time>({
  get: () => {
    if (settings.value) {
      return timeStrToTimeObj(
        (settings.value as ApiDeviceHistorySettings).windows?.startRecording ||
          "",
      );
    } else {
      return { hours: 12, minutes: 0, seconds: 0 };
    }
  },
  set: (val: Time) => {
    if (settings.value) {
      settings.value.windows = settings.value.windows || {
        ...defaultWindows,
        updated: new Date().toISOString(),
      };
      settings.value.windows.startRecording = timeObjToTimeStr(val);
      settings.value.windows.updated = new Date().toISOString();
      settings.value.synced = false;
    }
  },
});

const customRecordingWindowStop = computed<Time>({
  get: () => {
    if (settings.value) {
      return timeStrToTimeObj(
        (settings.value as ApiDeviceHistorySettings).windows?.stopRecording ||
          "",
      );
    } else {
      return { hours: 12, minutes: 0, seconds: 0 };
    }
  },
  set: (val: Time) => {
    if (settings.value) {
      settings.value.windows = settings.value.windows || {
        ...defaultWindows,
        updated: new Date().toISOString(),
      };
      settings.value.windows.stopRecording = timeObjToTimeStr(val);
      settings.value.windows.updated = new Date().toISOString();
      settings.value.synced = false;
    }
  },
});
const msInDay = 1000 * 60 * 60 * 24;

const deviceTimezone = computed<string | null>(() => {
  const location = device.value?.location;
  if (location) {
    // This needs to be adjusted for the device local timezone?
    return timezoneForLatLng(location);
  }
  return null;
});

const startOfYear = computed<Date>(() => {
  const location = device.value?.location;
  if (location) {
    const timeZone = deviceTimezone.value as string;
    const now = new Date();
    const nowInTz = DateTime.fromJSDate(now).setZone(timeZone);
    return nowInTz
      .set({
        month: 1,
        day: 0,
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0,
      })
      .toJSDate();
  }
  const now = new Date();
  now.setMonth(0, 1);
  now.setHours(0, 0, 0, 0);
  return new Date(now);
});

const getDayOfYearForDate = (date: Date): number => {
  const thisDay = new Date(date);
  thisDay.setHours(0, 0, 0, 0);
  return (thisDay.getTime() - startOfYear.value.getTime()) / msInDay;
};

const dayOfYear = ref<number>(getDayOfYearForDate(new Date()));

const curveDay = computed<Date>(() => {
  const location = device.value?.location;
  if (location) {
    const timeZone = deviceTimezone.value as string;
    const now = DateTime.fromJSDate(
      new Date(startOfYear.value.getTime() + dayOfYear.value * msInDay),
    ).setZone(timeZone);
    return now
      .set({
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0,
      })
      .toJSDate();
  }

  const now = new Date(startOfYear.value.getTime() + dayOfYear.value * msInDay);

  now.setHours(0, 0, 0, 0);
  return now;
});

interface OffsetTimesX {
  nightEnd: number;
  dusk: number;
  dawn: number;
  sunriseStart: number;
  sunriseEnd: number;
  midday: number;
  sunsetStart: number;
  sunsetEnd: number;
  nightStart: number;
  cameraEnd: number;
  cameraStart: number;
}

const timesXPos = computed<OffsetTimesX | null>(() => {
  if (timesZeroOne.value) {
    return multiplyTimes(timesZeroOne.value, 100);
  }

  return null;
});
const deg2rad = (d: number) => (d * Math.PI) / 180;
const rad2Deg = (r: number) => (r * 180) / Math.PI;
/** ---------------------------------------------------------------
 *  3. Irradiance & lux calculation
 *
 *  @param {Date}   date   UTC time of observation
 *  @param {number} lat    latitude in decimal degrees
 *  @param {number} lon    longitude in decimal degrees
 *  @returns {{alpha:number, lux:number}}  solar elevation and perceived light
 */
function irradiance(date: Date, lat: number, lon: number) {
  let { altitude: sunAltitudeRad } = sunCalc.getPosition(date, lat, lon);
  // suncalc gives the angle above the horizon in radians
  let angleAboveHorizonDeg = rad2Deg(sunAltitudeRad);
  const o = angleAboveHorizonDeg;
  angleAboveHorizonDeg += 7;
  angleAboveHorizonDeg = Math.min(90, angleAboveHorizonDeg);
  sunAltitudeRad = deg2rad(angleAboveHorizonDeg);
  const E0 = 1361; // W/m² (solar constant)
  let Edir;
  let Ediff;
  let Etot = 0;

  if (angleAboveHorizonDeg >= 0) {
    // air mass
    const m =
      1 /
      (Math.sin(sunAltitudeRad) +
        0.50572 * Math.pow(96.07995 - angleAboveHorizonDeg, -1.6364));
    const tau = 0.13; // clear‑air optical depth

    /* ---------- Direct beam ----------
    sinα is the projection onto a horizontal surface */
    const Tdir = Math.exp(-tau * m);
    Edir = E0 * Tdir * Math.sin(sunAltitudeRad);

    /* ---------- Diffuse sky ----------
     A very simple symmetric model – it peaks at the horizon
     and falls to ~50% at zenith.  The exact numbers are not critical
     for the shape; you can replace this with a full Perez model if you wish. */
    const Tdiff = Math.exp((-tau * m) / 2);
    // Use cos²(alpha) – this is symmetric about noon
    Ediff = E0 * Tdiff * (1 + 0.5 * Math.pow(Math.cos(sunAltitudeRad), 2));
    Etot = Edir + Ediff;
  }
  const luxNormalised = Math.max(0, Math.min(1, (Etot * 120) / 300_000));
  /* ------------------------------------------------------------------
   *  Convert to lux – approximate luminous efficacy of sunlight:
   *      ~120 lm/W for the full solar spectrum (typical daylight)
   */
  return { alpha: o, lux: Math.pow(luxNormalised, 2.2) };
}

const minutes = computed(() => {
  const location = device.value?.location;
  if (location) {
    const timeZone = deviceTimezone.value as string;
    const now = new Date(curveDay.value);
    const nowInTz = DateTime.fromJSDate(now).setZone(timeZone);
    const dayStart = nowInTz
      .set({
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0,
      })
      .toJSDate();
    const offsets = [];
    for (let i = 0; i < 60 * 24; i += 1) {
      const time = new Date(dayStart.getTime() + i * 1000 * 60);
      const ir = irradiance(time, location.lat, location.lng);
      offsets.push({
        irradiance: ir.lux,
        altitude: Math.max(-1, Math.min(1, ir.alpha / 90)), // Normalise over 90 degrees
      });
    }

    return offsets;
  }
  return [];
});

const timesZeroOne = computed<OffsetTimesX | null>(() => {
  const location = device.value?.location;
  if (location) {
    const timeZone = deviceTimezone.value as string;
    const now = new Date(curveDay.value);
    let nowInTz = DateTime.fromJSDate(now).setZone(timeZone);
    nowInTz = nowInTz.set({
      hour: 12,
    });
    const times = sunCalc.getTimes(
      nowInTz.toJSDate(),
      location.lat,
      location.lng,
      0,
    );
    nowInTz = nowInTz.set({
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    });
    const startOfDay = nowInTz.toJSDate().getTime();
    const nightEnd =
      (times.nightEnd && times.nightEnd.getTime()) || startOfDay + 1000;
    const nightStart =
      (times.night && times.night.getTime()) || startOfDay + msInDay - 1000;
    const startP = (nightEnd - startOfDay) / msInDay;
    const endP = (nightStart - startOfDay) / msInDay;
    const noonP = (times.solarNoon.getTime() - startOfDay) / msInDay;
    const duskP = (times.dusk.getTime() - startOfDay) / msInDay;
    const dawnP = (times.dawn.getTime() - startOfDay) / msInDay;
    const sunriseStartP = (times.sunrise.getTime() - startOfDay) / msInDay;
    const sunsetEndP = (times.sunset.getTime() - startOfDay) / msInDay;
    const sunriseEndP = (times.sunriseEnd.getTime() - startOfDay) / msInDay;
    const sunsetStartP = (times.sunsetStart.getTime() - startOfDay) / msInDay;
    const thirtyMinsBeforeSunset =
      (times.sunsetStart.getTime() + relativeStartTimeMs.value - startOfDay) /
      msInDay;
    const thirtyMinsAfterSunrise =
      (times.sunrise.getTime() + relativeStopTimeMs.value - startOfDay) /
      msInDay;

    return {
      midday: noonP,
      nightEnd: startP,
      nightStart: endP,
      dawn: dawnP,
      dusk: duskP,
      sunriseStart: sunriseStartP,
      sunriseEnd: sunriseEndP,
      sunsetStart: sunsetStartP,
      sunsetEnd: sunsetEndP,
      cameraStart: thirtyMinsBeforeSunset,
      cameraEnd: thirtyMinsAfterSunrise,
    };
  }
  return null;
});

const multiplyTimes = (
  times: OffsetTimesX,
  multiplier: number,
): OffsetTimesX => ({
  midday: times.midday * multiplier,
  nightEnd: times.nightEnd * multiplier,
  nightStart: times.nightStart * multiplier,
  dawn: times.dawn * multiplier,
  dusk: times.dusk * multiplier,
  sunriseStart: times.sunriseStart * multiplier,
  sunriseEnd: times.sunriseEnd * multiplier,
  sunsetStart: times.sunsetStart * multiplier,
  sunsetEnd: times.sunsetEnd * multiplier,
  cameraStart: times.cameraStart * multiplier,
  cameraEnd: times.cameraEnd * multiplier,
});

const timesPercent = computed<OffsetTimesX | null>(() => {
  if (timesZeroOne.value) {
    return multiplyTimes(timesZeroOne.value, 100);
  }
  return null;
});

// Computed property for Audio Mode
const audioMode = computed<AudioRecordingMode>({
  get: () => {
    return (
      (settings.value as ApiDeviceHistorySettings)?.audioRecording?.audioMode ??
      AudioRecordingMode.Disabled
    );
  },
  set: (val: AudioRecordingMode) => {
    if (settings.value) {
      (settings.value as ApiDeviceHistorySettings).audioRecording = {
        ...(settings.value as ApiDeviceHistorySettings).audioRecording,
        audioMode: val,
        updated: new Date().toISOString(),
      };
      settings.value.synced = false;
    }
  },
});

const audioEnabled = computed<boolean>(() => {
  return audioMode.value !== AudioRecordingMode.Disabled;
});

const thermalEnabled = computed<boolean>(() => {
  return audioMode.value !== AudioRecordingMode.AudioOnly;
});

function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(":").map(Number) as [number, number];
  return hours * 60 + minutes;
}

function timeToPercentage(timeStr: string): number {
  const totalMinutes = timeToMinutes(timeStr);
  return (totalMinutes / (24 * 60)) * 100;
}

function calculateTimePercentagePoints(
  startTime: string,
  endTime: string,
): { x0: number; x1: number }[] {
  if ((startTime === "12:00" && endTime === "12:00") || startTime === endTime) {
    return [
      {
        x0: 0,
        x1: 100,
      },
    ];
  }
  const startPercentage = timeToPercentage(startTime);
  const endPercentage = timeToPercentage(endTime);

  if (startPercentage <= endPercentage) {
    return [
      {
        x0: startPercentage,
        x1: endPercentage,
      },
    ];
  } else {
    return [
      { x0: startPercentage, x1: 100 - startPercentage },
      { x0: 0, x1: endPercentage },
    ];
  }
}

const thermalStartTime = computed<string>(() => {
  const setting = settings.value ? settings.value : undefined;
  if (!setting) {
    return "-30m";
  }
  const windows = setting.windows;
  return windows?.startRecording || "-30m";
});

const thermalStopTime = computed<string>(() => {
  const setting = settings.value ? settings.value : undefined;
  if (!setting) {
    return "+30m";
  }
  const windows = setting.windows;
  return windows?.stopRecording || "+30m";
});
const offsetForThermalTimeMs = (time: string): number => {
  let offset = 0;
  if (time.startsWith("+")) {
    offset = Number(time.slice(1).replace("m", ""));
  } else if (time.startsWith("-")) {
    offset = -Number(time.slice(1).replace("m", ""));
  }
  return offset * 60 * 1000;
};

const relativeStartTimeMs = computed<number>(() => {
  return offsetForThermalTimeMs(thermalStartTime.value);
});

const relativeStopTimeMs = computed<number>(() => {
  return offsetForThermalTimeMs(thermalStopTime.value);
});

const thermalStartTimePercent = computed<number>(() => {
  const startRecording = thermalStartTime.value;
  const hasRelativeStart =
    startRecording.startsWith("+") || startRecording.startsWith("-");
  if (hasRelativeStart) {
    return timesPercent.value?.cameraStart || 0;
  } else {
    return timeToPercentage(startRecording);
  }
});

const thermalStopTimePercent = computed<number>(() => {
  const stopRecording = thermalStopTime.value;
  const hasRelativeStop =
    stopRecording.startsWith("+") || stopRecording.startsWith("-");
  if (hasRelativeStop) {
    return timesPercent.value?.cameraEnd || 0;
  } else {
    return timeToPercentage(stopRecording);
  }
});

const thermalBarOffsets = computed<{ x0: number; x1: number }[]>(() => {
  if (!thermalEnabled.value) {
    return [];
  }
  const startRecording = thermalStartTimePercent.value;
  const stopRecording = thermalStopTimePercent.value;
  if (startRecording < stopRecording) {
    return [
      {
        x0: startRecording,
        x1: stopRecording,
      },
    ];
  } else {
    return [
      {
        x0: 0,
        x1: stopRecording,
      },
      {
        x0: startRecording,
        x1: 100,
      },
    ];
  }
});

// Computed property for Audio Bar Styles
const audioBarOffsets = computed<{ x0: number; x1: number }[]>(() => {
  switch (audioMode.value) {
    case AudioRecordingMode.Disabled: {
      return [];
    }
    case AudioRecordingMode.AudioAndThermal:
    case AudioRecordingMode.AudioOnly: {
      return [
        {
          x0: 0,
          x1: 100,
        },
      ];
    }
    case AudioRecordingMode.AudioOrThermal:
    default: {
      const startRecording = thermalStartTimePercent.value;
      const stopRecording = thermalStopTimePercent.value;
      if (startRecording < stopRecording) {
        return [
          {
            x0: 0,
            x1: startRecording,
          },
          {
            x0: stopRecording,
            x1: 100,
          },
        ];
      } else {
        return [
          {
            x0: stopRecording,
            x1: startRecording,
          },
        ];
      }
    }
  }
});

const audioTimes = (offset: {
  x0: number;
  x1: number;
}): { x0: number; x1: number }[] => {
  const percentageCovered = offset.x1 - offset.x0;
  const audioRecordingsPerDay = 32;
  const recordingsInPeriod = Math.round(
    (percentageCovered / 100) * audioRecordingsPerDay,
  );
  const times = [];
  for (let i = 0; i < recordingsInPeriod; i++) {
    const timeCenter =
      (100 / recordingsInPeriod) * i + (Math.random() - 0.5) * 2.5;
    const timeWidth = 0.9;
    times.push({
      x0: timeCenter - timeWidth / 2,
      x1: timeCenter + timeWidth / 2,
    });
  }
  return times;
};

// Computed property for Audio Seed
const audioSeed = computed<number>({
  get: () => {
    return (
      (settings.value as ApiDeviceHistorySettings)?.audioRecording?.audioSeed ??
      0
    );
  },
  set: (val: number) => {
    if (settings.value) {
      (settings.value as ApiDeviceHistorySettings).audioRecording = {
        ...((settings.value as ApiDeviceHistorySettings).audioRecording || {}),
        audioSeed: val,
        updated: new Date().toISOString(),
      };
      settings.value.synced = false;
    }
  },
});
const savingAudioSettings = ref<boolean>(false);

watch([audioMode, audioSeed], async () => {
  if (settings.value && initialised.value) {
    savingAudioSettings.value = true;
    await ClientApi.Devices.updateDeviceSettings(
      deviceId.value,
      settings.value,
    );
    savingAudioSettings.value = false;
  }
});

// Battery Configuration
const batteryChemistryOptions = [
  { value: "", text: "Auto-detect" },
  { value: "lead-acid", text: "Lead Acid (1.94V-2.15V per cell)" },
  { value: "lifepo4", text: "LiFePO4 (2.5V-3.4V per cell)" },
  { value: "li-ion", text: "Li-Ion (3.2V-4.2V per cell)" },
  { value: "lipo", text: "LiPo (3.27V-4.2V per cell)" },
];

const batteryChemistry = computed<string>({
  get: () => {
    return (
      (settings.value as ApiDeviceHistorySettings)?.battery?.chemistry ?? ""
    );
  },
  set: (val: string) => {
    if (settings.value) {
      (settings.value as ApiDeviceHistorySettings).battery = {
        ...((settings.value as ApiDeviceHistorySettings).battery || {}),
        chemistry: val || undefined,
        updated: new Date().toISOString(),
      };
      settings.value.synced = false;
    }
  },
});

const batteryCellCount = computed<number>({
  get: () => {
    return (
      (settings.value as ApiDeviceHistorySettings)?.battery?.manualCellCount ??
      0
    );
  },
  set: (val: number) => {
    if (settings.value) {
      (settings.value as ApiDeviceHistorySettings).battery = {
        ...((settings.value as ApiDeviceHistorySettings).battery || {}),
        manualCellCount: val || undefined,
        updated: new Date().toISOString(),
      };
      settings.value.synced = false;
    }
  },
});

const batteryVoltageRange = computed<string>(() => {
  if (!batteryChemistry.value || !batteryCellCount.value) {
    return "";
  }

  const chemistryProfile = batteryChemistryOptions.find(
    (opt) => opt.value === batteryChemistry.value,
  );
  if (!chemistryProfile) {
    return "";
  }

  // Extract voltage range from text
  const match = chemistryProfile.text.match(/\((.+)V-(.+)V per cell\)/);
  if (!match || match.length < 3) {
    return "";
  }
  const minVoltage = parseFloat(match[1]) * batteryCellCount.value;
  const maxVoltage = parseFloat(match[2]) * batteryCellCount.value;

  return `${minVoltage.toFixed(1)}V - ${maxVoltage.toFixed(1)}V`;
});

const savingBatterySettings = ref<boolean>(false);

watch([batteryChemistry, batteryCellCount], async () => {
  if (settings.value && initialised.value) {
    savingBatterySettings.value = true;
    await ClientApi.Devices.updateDeviceSettings(
      deviceId.value,
      settings.value,
    );
    savingBatterySettings.value = false;
  }
});

const savingPowerModeSettings = ref<boolean>(false);
const savingRecordingWindowSettings = ref<boolean>(false);
watch(useLowPowerMode, async () => {
  if (settings.value && initialised.value) {
    savingPowerModeSettings.value = true;
    await ClientApi.Devices.updateDeviceSettings(
      deviceId.value,
      settings.value,
    );
    savingPowerModeSettings.value = false;
  }
});
watch(recordingWindowSetting, async () => {
  if (settings.value && initialised.value) {
    savingRecordingWindowSettings.value = true;
    await ClientApi.Devices.updateDeviceSettings(
      deviceId.value,
      settings.value,
    );
    savingRecordingWindowSettings.value = false;
  }
});
watch(customRecordingWindowStart, async () => {
  if (settings.value && initialised.value) {
    savingRecordingWindowSettings.value = true;
    await ClientApi.Devices.updateDeviceSettings(
      deviceId.value,
      settings.value,
    );
    savingRecordingWindowSettings.value = false;
  }
});
watch(customRecordingWindowStop, async () => {
  if (settings.value && initialised.value) {
    savingRecordingWindowSettings.value = true;
    await ClientApi.Devices.updateDeviceSettings(
      deviceId.value,
      settings.value,
    );
    savingRecordingWindowSettings.value = false;
  }
});
</script>

<template>
  <!-- FIXME: Choose device types using TC2 channel -->
  <div
    class="d-flex flex-column flex-fill"
    v-if="
      device &&
      (device.type === 'thermal' || device.type === 'hybrid-thermal-audio')
    "
  >
    <!-- FIXME: Should the warning always be here? -->
    <b-alert
      :model-value="!device.lastConnectionTime"
      variant="warning"
      :no-animation="true"
      class="mb-4"
    >
      <div class="d-flex">
        <material-symbol name="warning" class="me-2" size="1.25rem" />
        This device has never connected to the Cacophony Monitoring Platform in
        its current location, so remote setup may not be available.
      </div>
    </b-alert>
    <!--      <span v-if="lastSyncedSettingsLoading">-->
    <!--        <b-spinner small class="me-2" />-->
    <!--      </span>-->
    <!--      <div v-else-if="lastSyncedSettings">-->
    <!--        {{ lastSyncedSettings }}-->
    <!--      </div>-->
    <!--      <span v-else>Current settings unknown, </span>-->
    <!-- TODO: Display last synced settings where possible -->
    <div
      v-if="settingsLoading"
      class="d-flex flex-fill align-items-center justify-content-center"
    >
      <b-spinner class="me-2" />
    </div>
    <div v-else-if="settings">
      <section-card class="mb-3 mb-lg-4">
        <template #header-title> Settings summary </template>
        <b-alert
          :model-value="true"
          variant="light"
          :no-animation="true"
          class="mb-4"
        >
          <div class="d-flex">
            <material-symbol name="info" class="me-2" size="1.25rem" />
            <span
              >If your device has a connection to the internet, you can
              <strong>setup recording modes remotely</strong>, and when your
              device next comes online it will
              <strong>synchronise</strong> these settings.</span
            >
          </div>
        </b-alert>
        <div>
          <dl class="settings-summary container mb-0">
            <div class="row">
              <dt
                class="col-sm-4 d-sm-inline-flex mb-0 mb-sm-1 pb-0 ps-0 py-sm-2 fw-medium"
              >
                Synced with remote device
              </dt>
              <dd
                class="col-sm-8 d-sm-inline-flex mb-3 mb-sm-1 pt-1 px-0 py-sm-2"
              >
                <span
                  v-if="settings.synced"
                  class="d-flex d-inline-flex align-items-center align-self-center px-1 rounded bg-success-subtle text-success-emphasis"
                >
                  <material-symbol
                    name="check"
                    size="1.125rem"
                    class="me-1"
                  ></material-symbol>
                  Yes
                </span>
                <span
                  v-else
                  class="d-flex d-inline-flex align-items-center align-self-center px-1 rounded bg-warning-subtle text-warning-emphasis"
                >
                  <material-symbol
                    name="close"
                    size="1.125rem"
                    class="me-1"
                  ></material-symbol>
                  No
                </span>
              </dd>
            </div>

            <div class="row">
              <dt
                class="col-sm-4 d-sm-inline-flex mb-0 mb-sm-1 pb-0 ps-0 py-sm-2 fw-medium"
              >
                Power profile
              </dt>
              <dd
                class="col-sm-8 d-sm-inline-flex mb-3 mb-sm-1 pt-1 px-0 py-sm-2"
              >
                <span v-if="useLowPowerMode">Low power mode</span>
                <span v-else>High power mode</span>
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
                <span v-if="audioMode === AudioRecordingMode.Disabled"
                  >Thermal video only</span
                >
                <span v-if="audioMode === AudioRecordingMode.AudioOnly"
                  >Audio only</span
                >
                <span
                  v-else-if="audioMode === AudioRecordingMode.AudioAndThermal"
                  >Audio and thermal</span
                >
                <span
                  v-else-if="audioMode === AudioRecordingMode.AudioOrThermal"
                  >Audio or thermal</span
                >
              </dd>
            </div>

            <div v-if="audioMode !== AudioRecordingMode.AudioOnly" class="row">
              <dt
                class="col-sm-4 d-sm-inline-flex mb-0 mb-sm-1 pb-0 ps-0 py-sm-2 fw-medium"
              >
                Thermal video recording schedule
              </dt>
              <dd
                class="col-sm-8 d-sm-inline-flex mb-3 mb-sm-1 pt-1 px-0 py-sm-2"
              >
                {{ recordingWindow }}
              </dd>
            </div>
          </dl>
        </div>
        <div class="mt-4">
          <h5 class="h5">Recording window</h5>
          <p>
            Visualise how the recording settings and thermal video recording
            schedule are applied over a 24-hour period.
          </p>
          <div>
            <div class="d-flex">
              <div style="width: 28px"></div>
              <div
                class="rounded-2 overflow-hidden position-relative flex-grow-1"
              >
                <svg viewBox="0 0 100 20" v-if="timesXPos" class="svg-diagram">
                  <defs>
                    <symbol id="sunrise-icon">
                      <g transform="scale(0.125 0.125)">
                        <path
                          d="M2.197 31.062v-2.383h4.968l.074-.426c.141-.799.521-1.798 1.014-2.662l.492-.863-3.485-3.48 1.702-1.702 3.5 3.495.548-.351c.73-.467 1.512-.796 2.478-1.044l.794-.204.061-5.019h2.488l.061 5.02.795.203c.965.248 1.748.577 2.477 1.044l.548.35 3.498-3.492 1.705 1.694-3.516 3.522.234.34c.458.665 1 1.904 1.195 2.734l.198.84h4.952v2.384zm19.217-2.979c-.277-.946-.721-1.67-1.515-2.47-2.424-2.445-6.186-2.445-8.626-.001-.79.792-1.232 1.514-1.513 2.471l-.175.596H21.59z"
                        />
                        <path
                          d="M241.463 322.031v-32.25s-23.25-.256-23.25-.569 31.5-32.043 31.5-32.043 31.5 31.73 31.5 32.043-23.25.569-23.25.569v32.25z"
                          transform="translate(-22.195 -34.684)scale(.1513)"
                        />
                      </g>
                    </symbol>
                    <symbol id="sunset-icon">
                      <g transform="scale(0.125 0.125)">
                        <path
                          d="M2.197 31.062v-2.383h4.968l.074-.426c.141-.799.521-1.798 1.014-2.662l.492-.863-3.485-3.48 1.702-1.702 3.5 3.495.548-.351c.73-.467 1.512-.796 2.478-1.044l.794-.204.061-5.019h2.488l.061 5.02.795.203c.965.248 1.748.577 2.477 1.044l.548.35 3.498-3.492 1.705 1.694-3.516 3.522.234.34c.458.665 1 1.904 1.195 2.734l.198.84h4.952v2.384zm19.217-2.979c-.277-.946-.721-1.67-1.515-2.47-2.424-2.445-6.186-2.445-8.626-.001-.79.792-1.232 1.514-1.513 2.471l-.175.596H21.59z"
                        />
                        <path
                          d="M241.463 322.031v-32.25s-23.25-.256-23.25-.569 31.5-32.043 31.5-32.043 31.5 31.73 31.5 32.043-23.25.569-23.25.569v32.25z"
                          transform="translate(53.5 53.684)rotate(180)scale(.1513)"
                        />
                      </g>
                    </symbol>
                    <linearGradient
                      id="daylight"
                      x1="0%"
                      y1="0%"
                      x2="100%"
                      y2="0%"
                      gradientUnits="objectBoundingBox"
                      v-if="minutes"
                    >
                      <stop
                        :key="index"
                        v-for="(minute, index) in minutes"
                        :offset="`${(index / minutes.length) * 100}%`"
                        :stop-color="`rgb(${Math.max(30, minute.irradiance * 255)}, ${Math.max(30, minute.irradiance * 255)}, ${Math.max(30, minute.irradiance * 255)})`"
                      />
                    </linearGradient>
                  </defs>
                  <rect
                    x="0"
                    y="0"
                    width="100"
                    height="20"
                    fill="url(#daylight)"
                  />
                  <rect
                    v-for="(minute, index) in minutes"
                    :x="(100 / minutes.length) * index"
                    :y="20 - (5 + minute.altitude * 15)"
                    :key="index"
                    :width="100 / minutes.length"
                    height="0.3"
                    class="sun-curve"
                  />
                  <use
                    href="#sunrise-icon"
                    :x="timesXPos.sunriseEnd"
                    y="10"
                    transform="translate(-1.8, 0)"
                    fill="white"
                  ></use>
                  <use
                    href="#sunset-icon"
                    :x="timesXPos.sunsetStart"
                    y="10"
                    transform="translate(-2.2, 0)"
                    fill="white"
                  ></use>
                  <rect x="0" y="15" fill="#ddd" height="0.1" width="100" />
                  <rect x="0" y="20" width="100" height="10" fill="#ccc" />
                  <rect
                    v-for="hour in 23"
                    :key="hour"
                    fill="#333"
                    :x="(100 / 24) * hour"
                    y="20"
                    width="0.1"
                    height="0.75"
                  />
                  <text
                    fill="#333"
                    x="0.5"
                    y="22"
                    text-anchor="start"
                    font-size="1.5"
                  >
                    00:00
                  </text>
                  <text
                    fill="#333"
                    x="50"
                    y="22"
                    text-anchor="middle"
                    font-size="1.5"
                  >
                    12:00
                  </text>
                  <text
                    fill="#333"
                    x="99.5"
                    y="22"
                    text-anchor="end"
                    font-size="1.5"
                  >
                    24:00
                  </text>
                </svg>
                <div
                  class="position-absolute text-white"
                  style="top: 7px; left: 10px"
                >
                  {{
                    DateTime.fromJSDate(curveDay)
                      .setZone(deviceTimezone as string)
                      .toLocaleString({
                        month: "short",
                        day: "numeric",
                      })
                  }}
                </div>
              </div>
            </div>
            <div>
              <div class="d-flex align-items-center mt-2">
                <div style="min-width: 28px"></div>
                <div
                  class="flex-grow-1 hours-container d-flex justify-content-between align-items-end"
                >
                  <div
                    v-for="n in 25"
                    :key="n"
                    class="hour-notch bg-dark-subtle"
                  ></div>
                </div>
              </div>
              <div class="d-flex align-items-center mt-2">
                <div class="align-items-center d-flex" style="min-width: 28px">
                  <material-symbol name="videocam" size="1.25rem" />
                </div>
                <div
                  class="bars-container rounded-4 position-relative flex-grow-1"
                >
                  <div
                    v-for="(offset, index) in thermalBarOffsets"
                    class="position-absolute rounded-4 thermal-bar"
                    :key="index"
                    :style="`left: ${offset.x0}%;width: ${offset.x1 - offset.x0}%;`"
                  />
                </div>
              </div>
              <div class="d-flex mt-2 align-items-center">
                <div class="align-items-center d-flex" style="min-width: 28px">
                  <material-symbol name="music_note" size="1.25rem" />
                </div>
                <div
                  class="bars-container rounded-4 position-relative flex-grow-1"
                >
                  <div
                    v-for="(offset, index) in audioBarOffsets"
                    :key="index"
                    class="position-absolute rounded-4 overflow-hidden audio-bar align-items-center d-flex"
                    :style="`left: ${offset.x0}%;width: ${offset.x1 - offset.x0}%;`"
                  >
                    <div
                      v-for="(time, index) in audioTimes(offset)"
                      :key="index"
                      class="position-absolute audio-item rounded-circle"
                      :style="`left: ${time.x0}%;width: ${time.x1 - time.x0}%;height: 50%;`"
                    />
                  </div>
                </div>
              </div>
              <div class="d-flex mt-2 align-items-center">
                <div style="min-width: 28px"></div>
                <b-input type="range" min="1" max="365" v-model="dayOfYear" />
              </div>
            </div>
          </div>
        </div>
      </section-card>
      <section-card v-if="isTc2Device" class="mb-3 mb-lg-4">
        <template #header-title> Power profile </template>
        <template #header-action>
          <div v-if="savingPowerModeSettings">
            <b-spinner class="me-2" variant="secondary" small />
            <span class="text-secondary">Saving</span>
          </div>
        </template>
        <b-form-checkbox switch v-model="useLowPowerMode" class="mb-3 fw-medium"
          >Use low power mode</b-form-checkbox
        >

        <p>
          Devices in low power mode will only connect to the Cacophony Platform
          once per day to offload recordings. This is the recommended mode for
          projects doing passive monitoring, as the battery will last much
          longer in the field.
        </p>

        <p class="mb-0">
          Projects tracking an incursion that require
          <router-link :to="{ name: 'user-project-settings' }">
            real-time alerts</router-link
          >
          of species detected should disable low power mode.
        </p>
      </section-card>

      <section-card v-if="isTc2Device" class="mb-3 mb-lg-4">
        <template #header-title> Recording settings </template>
        <template #header-action>
          <div v-if="savingAudioSettings" class="d-flex align-items-center">
            <b-spinner class="me-2" variant="secondary" small />
            <span class="text-secondary">Saving</span>
          </div>
        </template>

        <h5 class="h5">Recording mode</h5>
        <p class="mb-4">
          Configure this device to record audio, thermal video or both.
        </p>

        <b-form-radio-group
          stacked
          v-model="audioMode"
          :disabled="savingAudioSettings"
        >
          <b-form-radio :value="AudioRecordingMode.Disabled" class="mb-1">
            <p class="fw-medium mb-1">Thermal video only</p>
            <p class="text-secondary">
              Disables audio recording and records only thermal video.
            </p>
          </b-form-radio>
          <b-form-radio :value="AudioRecordingMode.AudioOnly" class="mb-1">
            <p class="fw-medium mb-1">Audio only</p>
            <p class="text-secondary">
              Records audio in a 24-hour window and disables thermal recording.
            </p>
          </b-form-radio>
          <b-form-radio
            :value="AudioRecordingMode.AudioAndThermal"
            class="mb-1"
          >
            <p class="fw-medium mb-1">Audio And Thermal</p>
            <p class="text-secondary">
              Records a one-minute clip of audio 32 times a day, at random
              intervals during the day. The camera won't be able to record
              thermal video while the audio is being recorded.
            </p>
          </b-form-radio>
          <b-form-radio :value="AudioRecordingMode.AudioOrThermal" class="mb-1">
            <p class="fw-medium mb-1">Audio Or Thermal</p>
            <p class="text-secondary">
              Records one-minute audio clips outside of the thermal recording
              window.
            </p>
          </b-form-radio>
        </b-form-radio-group>
      </section-card>

      <section-card class="mb-3 mb-lg-4">
        <template #header-title> Thermal video recording schedule </template>
        <template #header-action>
          <div v-if="savingRecordingWindowSettings">
            <b-spinner class="me-2" variant="secondary" small />
            <span class="text-secondary">Saving</span>
          </div>
        </template>
        <div>
          <p class="mb-4">
            Select the default mode if your project is doing monitoring of
            nocturnal predators. If your project has different objectives, you
            can set the device to record 24/7 or specify a custom time window.
          </p>
          <div class="d-flex justify-content-between">
            <b-form-radio-group stacked v-model="recordingWindowSetting">
              <b-form-radio value="default" class="mb-1">
                <p class="fw-medium mb-1">
                  Ready to record from dusk until dawn
                  <b-badge class="ms-1" variant="dark">Default</b-badge>
                </p>
                <p class="text-secondary">
                  The device will be actively monitoring and ready to make
                  thermal recordings from 30 minutes before sunset until 30
                  minutes after sunrise. The battery life on the device will
                  vary throughout the year as the length of the days change with
                  the seasons.
                </p>
                <b-alert
                  :model-value="recordingWindowSetting === 'default'"
                  variant="warning"
                  :no-animation="true"
                >
                  <div class="d-flex">
                    <material-symbol
                      name="warning"
                      class="me-2"
                      size="1.25rem"
                    />
                    Devices must have a location assigned to them to be able to
                    record. Set the location of your device on the Cacophony
                    Sidekick mobile app when you deploy it in the field.
                    Remember to update the location when a device is moved so
                    that the correct dusk/dawn window can be calculated.
                  </div>
                </b-alert>
              </b-form-radio>
              <b-form-radio value="always" class="mb-1">
                <p class="fw-medium mb-1">Ready to record 24/7</p>
                <p class="text-secondary">Record non-stop.</p>
                <b-alert
                  :model-value="recordingWindowSetting === 'always'"
                  variant="light"
                  :no-animation="true"
                >
                  <div class="d-flex">
                    <material-symbol name="info" class="me-2" size="1.25rem" />
                    Recording during daytime works best in shade. Sun moving
                    through the field of view and heating and cooling items in
                    the scene can result in a higher volume of false-triggers.
                  </div>
                </b-alert>
              </b-form-radio>
              <b-form-radio value="custom" class="mb-1">
                <p class="fw-medium mb-1">Custom recording window</p>
                <p class="text-secondary mb-1">
                  Set the device to enter and exit the active 'ready-to-record'
                  state at fixed times each day.
                </p>
                <div
                  class="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center mt-3"
                  v-if="recordingWindowSetting === 'custom'"
                >
                  <label
                    for="start-time"
                    class="text-nowrap me-2 fw-medium mb-1 mb-sm-0"
                    >Start time:</label
                  >
                  <vue-date-picker
                    class="me-2 mb-2 mb-sm-0"
                    v-model="customRecordingWindowStart"
                    time-picker
                    required
                    placeholder="Recording start"
                    id="start-time"
                  />
                  <label
                    for="start-time"
                    class="text-nowrap fw-medium me-2 ms-0 ms-sm-1 mb-1 mb-sm-0 mt-1 mt-sm-0"
                    >End time:</label
                  >
                  <vue-date-picker
                    v-model="customRecordingWindowStop"
                    time-picker
                    required
                    placeholder="Recording end"
                    id="end-time"
                  />
                </div>
                <b-alert
                  :model-value="recordingWindowSetting === 'custom'"
                  variant="light"
                  :no-animation="true"
                  class="mt-3"
                >
                  <div class="d-flex">
                    <material-symbol name="info" class="me-2" size="1.25rem" />
                    Recording during daytime works best in shade. Sun moving
                    through the field of view and heating and cooling items in
                    the scene can result in a higher volume of false-triggers.
                  </div>
                </b-alert>
              </b-form-radio>
            </b-form-radio-group>
          </div>
        </div>
      </section-card>

      <section-card v-if="isTc2Device">
        <template #header-title> Battery configuration </template>
        <template #header-action>
          <div v-if="savingBatterySettings">
            <b-spinner class="me-2" variant="secondary" small />
            <span class="text-secondary">Saving</span>
          </div>
        </template>
        <p>
          Battery chemistry and cell count are automatically detected based on
          voltage readings. These values are used to calculate the expected
          battery duration and don't affect the operation of the device.
        </p>
        <p class="mb-4">
          These values should only be specified manually if the detection is
          incorrect.
        </p>

        <b-form-group label="Battery Chemistry" class="mb-1 fw-medium">
          <b-form-select
            v-model="batteryChemistry"
            :options="batteryChemistryOptions"
            :disabled="savingBatterySettings"
          ></b-form-select>
        </b-form-group>

        <b-form-group
          v-if="batteryChemistry"
          label="Cell Count"
          description="Leave empty for auto-detection (1-24 cells)"
          class="mt-3 fw-medium"
        >
          <b-form-input
            v-model.number="batteryCellCount"
            type="number"
            min="1"
            max="24"
            placeholder="Auto-detect"
            :disabled="savingBatterySettings || !batteryChemistry"
          />
          <small v-if="batteryVoltageRange" class="form-text text-primary">
            Expected voltage range: {{ batteryVoltageRange }}
          </small>
        </b-form-group>
      </section-card>
    </div>
    <!-- TODO: What does it mean to have no settings? -->
    <div v-else-if="!settings" class="my-5">
      <div class="text-center text-body-tertiary">
        <h5 class="h5">No recording settings uploaded</h5>
        <p>
          It is likely that this device never connected to the Cacophony
          Monitoring Platform. <br />
          Connecting is optional, and doesn't affect the ability of the device
          to record.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
@import "../assets/less/breakpoints";

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
.bars-container {
  background: var(--bs-gray-400);
}
.thermal-bar,
.audio-bar,
.bars-container {
  @media (max-width: @breakpoint-sm-max) {
    height: calc(var(--cp-grid-base) * 2); // 8px
  }
  @media (min-width: @breakpoint-md) {
    height: calc(var(--cp-grid-base) * 3); // 12px
  }
}
.hours-container {
  height: calc(var(--cp-grid-base) * 2); // 8px
}

.hour-notch {
  min-width: 1px;
  height: 50%;
  &:nth-child(13),
  &:first-child,
  &:last-child {
    height: 100%;
    margin-top: 0;
  }
}
.thermal-bar {
  background-color: var(--cp-color-green-600);
}
.audio-bar {
  background-color: var(--bs-success);
}
.audio-item {
  background-color: rgba(255, 255, 255, 0.5);
}
.sun-curve {
  fill: var(--cp-color-primary);
}
</style>
