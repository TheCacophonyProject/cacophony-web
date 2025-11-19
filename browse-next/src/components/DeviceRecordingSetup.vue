<script setup lang="ts">
import { computed, inject, onBeforeMount, ref, type Ref, watch } from "vue";
import { selectedProjectDevices } from "@models/provides.ts";
import type {
  ApiDeviceHistorySettings,
  ApiDeviceResponse,
  AudioModes,
} from "@typedefs/api/device";
import { useRoute } from "vue-router";
import type { DeviceId } from "@typedefs/api/common";
import type { LoadedResource } from "@api/types.ts";
import {
  getDeviceModel,
  getSettingsForDevice,
  updateDeviceSettings,
} from "@api/Device.ts";
import Datepicker from "@vuepic/vue-datepicker";
import { projectDevicesLoaded } from "@models/LoggedInUser.ts";
import { resourceIsLoading } from "@/helpers/utils.ts";
import type { DeviceTypeUnion } from "@typedefs/api/consts";
import SectionCard from "@/components/SectionCard.vue";
import {BAlert, BBadge, BFormGroup, BFormInput, BFormRadio, BFormRadioGroup, BSpinner} from "bootstrap-vue-next";
import {MaterialSymbol} from "@dbetka/vue-material-symbols";
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

const nodeGroupInfoLoading = resourceIsLoading(deviceModel);
const isTc2Device = computed<boolean>(() => {
  return deviceModel.value === "hybrid-thermal-audio";
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
  const [hours, minutes] = timeStr.split(":").map(Number);
  return { hours, minutes, seconds: 0 };
};

const timeObjToTimeStr = (time: Time): string => {
  return `${String(time.hours).padStart(2, "0")}:${String(
    time.minutes,
  ).padStart(2, "0")}`;
};

const fetchSettings = async () => {
  const response = await getSettingsForDevice(deviceId.value);
  if (response && response.success && response.result.settings) {
    return response.result.settings;
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
    const windows = (settings.value as ApiDeviceHistorySettings).windows;
    const start = (windows && windows.startRecording) || "-30m";
    const end = (windows && windows.stopRecording) || "+30m";
    if (!start.endsWith("m") || !end.endsWith("m")) {
      return start === end;
    }
  }
  return false;
});

const recordingWindow = computed<string | null>(() => {
  if (records247.value) {
    return "record 24/7";
  } else if (settings.value) {
    const windows = (settings.value as ApiDeviceHistorySettings).windows;
    const start = (windows && windows.startRecording) || "-30m";
    const end = (windows && windows.stopRecording) || "+30m";
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
onBeforeMount(async () => {
  await projectDevicesLoaded();
  await loadResource(settings, fetchSettings);
  await loadResource(deviceModel, async () => {
    const res = await getDeviceModel(deviceId.value);
    if (res.success) {
      return res.result.type;
    }
  });
  initialised.value = true;
  if (settings.value && !settings.value.synced) {
    // Load last synced settings
    const response = await getSettingsForDevice(deviceId.value, true);
    if (response && response.success && response.result.settings) {
      syncedSettings.value = response.result.settings;
    }
  }
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

// Computed property for Audio Mode
const audioMode = computed<AudioModes>({
  get: () => {
    return (
      (settings.value as ApiDeviceHistorySettings)?.audioRecording?.audioMode ??
      "Disabled"
    );
  },
  set: (val: AudioModes) => {
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

function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

function timeToPercentage(timeStr: string): number {
  const totalMinutes = timeToMinutes(timeStr);
  return (totalMinutes / (24 * 60)) * 100;
}

function calculateTimePercentagePoints(
  startTime: string,
  endTime: string,
): Array<{ left: string; width: string }> {
  if (startTime === "12:00" && endTime === "12:00") {
    return [{ left: "0%", width: "100%" }];
  }
  const startPercentage = timeToPercentage(startTime);
  const endPercentage = timeToPercentage(endTime);

  if (startPercentage <= endPercentage) {
    return [
      {
        left: `${startPercentage}%`,
        width: `${endPercentage - startPercentage}%`,
      },
    ];
  } else {
    return [
      { left: `${startPercentage}%`, width: `${100 - startPercentage}%` },
      { left: `0%`, width: `${endPercentage}%` },
    ];
  }
}

// Computed property for Thermal Bar Styles
const thermalBarStyles = computed(() => {
  if (audioMode.value === "AudioOnly") {
    return [];
  }

  const setting = settings.value ? settings.value : undefined;
  const windows = setting?.windows;
  const startRecording = windows?.startRecording || "-30m";
  const stopRecording = windows?.stopRecording || "+30m";

  // Handle relative times (cannot accurately represent without actual sunset/sunrise times)
  if (
    startRecording.startsWith("+") ||
    startRecording.startsWith("-") ||
    stopRecording.startsWith("+") ||
    stopRecording.startsWith("-")
  ) {
    // Default to full night time (e.g., 18:00 to 06:00)
    return [
      { left: "0%", width: "33%" },
      {
        left: "66%", // Approximate 18:00
        width: "34%", // From 18:00 to 06:00
      },
    ];
  }

  const thermalRanges = calculateTimePercentagePoints(
    startRecording,
    stopRecording,
  );

  return thermalRanges.map((range) => ({
    left: range.left,
    width: range.width,
  }));
});

// Computed property for Audio Bar Styles
const audioBarStyles = computed(() => {
  if (audioMode.value === "Disabled") {
    return [];
  }

  if (
    audioMode.value === "AudioOnly" ||
    audioMode.value === "AudioAndThermal"
  ) {
    return [
      {
        left: "0%",
        width: "100%",
      },
    ];
  }

  if (audioMode.value === "AudioOrThermal") {
    const windows = (settings.value ? settings.value : {})?.windows;
    const startRecording = windows?.startRecording || "-30m";
    const stopRecording = windows?.stopRecording || "+30m";

    // Handle relative times (cannot accurately represent without actual sunset/sunrise times)
    if (
      startRecording.startsWith("+") ||
      startRecording.startsWith("-") ||
      stopRecording.startsWith("+") ||
      stopRecording.startsWith("-")
    ) {
      // Default to daytime (outside of night time)
      return [
        {
          left: "33%",
          width: "33%", // From 00:00 to 18:00
        },
      ];
    }

    const thermalRanges = calculateTimePercentagePoints(
      startRecording,
      stopRecording,
    );

    // Audio ranges are inverse of thermal ranges
    const audioRanges: Array<{ left: string; width: string }> = [];

    if (thermalRanges.length === 1) {
      const thermalStart = parseFloat(thermalRanges[0].left);
      const thermalWidth = parseFloat(thermalRanges[0].width);

      // Before thermal recording window
      if (thermalStart > 0) {
        audioRanges.push({
          left: "0%",
          width: `${thermalStart}%`,
        });
      }

      // After thermal recording window
      const afterThermalStart = thermalStart + thermalWidth;
      if (afterThermalStart < 100) {
        audioRanges.push({
          left: `${afterThermalStart}%`,
          width: `${100 - afterThermalStart}%`,
        });
      }
    } else if (thermalRanges.length === 2) {
      // Thermal ranges cross midnight
      const firstThermalRangeEnd =
        parseFloat(thermalRanges[0].left) + parseFloat(thermalRanges[0].width);

      const secondThermalRangeStart = parseFloat(thermalRanges[1].left);

      // Audio range between thermal ranges
      if (firstThermalRangeEnd < secondThermalRangeStart) {
        audioRanges.push({
          left: `${firstThermalRangeEnd}%`,
          width: `${secondThermalRangeStart - firstThermalRangeEnd}%`,
        });
      }
    }

    return audioRanges;
  }

  return [];
});

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
    await updateDeviceSettings(deviceId.value, settings.value);
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
      (settings.value as ApiDeviceHistorySettings)?.battery?.manualCellCount ?? 0
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
    opt => opt.value === batteryChemistry.value,
  );
  if (!chemistryProfile) {
return "";
}
  
  // Extract voltage range from text
  const match = chemistryProfile.text.match(/\((.+)V-(.+)V per cell\)/);
  if (!match) {
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
    await updateDeviceSettings(deviceId.value, settings.value);
    savingBatterySettings.value = false;
  }
});

const savingPowerModeSettings = ref<boolean>(false);
const savingRecordingWindowSettings = ref<boolean>(false);
watch(useLowPowerMode, async () => {
  if (settings.value && initialised.value) {
    savingPowerModeSettings.value = true;
    await updateDeviceSettings(deviceId.value, settings.value);
    savingPowerModeSettings.value = false;
  }
});
watch(recordingWindowSetting, async () => {
  if (settings.value && initialised.value) {
    savingRecordingWindowSettings.value = true;
    await updateDeviceSettings(deviceId.value, settings.value);
    savingRecordingWindowSettings.value = false;
  }
});
watch(customRecordingWindowStart, async () => {
  if (settings.value && initialised.value) {
    savingRecordingWindowSettings.value = true;
    await updateDeviceSettings(deviceId.value, settings.value);
    savingRecordingWindowSettings.value = false;
  }
});
watch(customRecordingWindowStop, async () => {
  if (settings.value && initialised.value) {
    savingRecordingWindowSettings.value = true;
    await updateDeviceSettings(deviceId.value, settings.value);
    savingRecordingWindowSettings.value = false;
  }
});
</script>

<template>
  <div
    class="d-flex justify-content-center align-items-center justify-content-lg-start align-items-lg-start"
  >
    <!-- FIXME: Choose device types using TC2 channel -->
    <div
      class="mt-4 mt-lg-0 justify-content-center align-items-center"
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
      >
        <div class="d-flex">
          <material-symbol name="warning" class="me-2" size="1.25rem"/>
          This device has never connected to the Cacophony Platform in its current location,
          so remote setup may not be available.
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
      <span v-if="settingsLoading">
        <b-spinner small class="me-2" />
      </span>
      <div v-else-if="settings" class="mt-3">
        <section-card class="mb-3 mb-lg-4">
          <template #header-title>
            Settings summary
          </template>
          <b-alert
            :model-value="true"
            variant="light"
            :no-animation="true"
            class="mb-4"
          >
            <div class="d-flex">
              <material-symbol name="info" class="me-2" size="1.25rem"/>
              <span>If your device has a connection to the internet, you can
              <strong>setup recording modes remotely</strong>, and when your device
              next comes online it will <strong>synchronise</strong> these settings.</span>

            </div>
          </b-alert>
          <div>
            <dl class="settings-summary mb-0">
              <div class="row">
                <dt class="col-sm-4 d-sm-inline-flex mb-0 mb-sm-1 pb-0 py-sm-2 fw-medium">Synced with remote device</dt>
                <dd class="col-sm-8 d-sm-inline-flex mb-3 mb-sm-1 pt-1 py-sm-2">
                  <span v-if="settings.synced" class="d-flex d-inline-flex align-items-center px-1 rounded bg-success-subtle text-success-emphasis">
                    <material-symbol name="check" size="1.125rem" class="me-1"></material-symbol>
                    Yes
                  </span>
                  <span v-else class="d-flex d-inline-flex align-items-center px-1 rounded bg-warning-subtle text-warning-emphasis">
                    <material-symbol name="close" size="1.125rem" class="me-1"></material-symbol>
                    No
                  </span>
                </dd>
              </div>

              <div class="row">
                <dt class="col-sm-4 d-sm-inline-flex mb-0 mb-sm-1 pb-0 py-sm-2 fw-medium">Power profile</dt>
                <dd class="col-sm-8 d-sm-inline-flex mb-3 mb-sm-1 pt-1 py-sm-2">
                  <span v-if="useLowPowerMode">Low power mode</span>
                  <span v-else>High power mode</span>
                </dd>
              </div>

              <div class="row">
                <dt class="col-sm-4 d-sm-inline-flex mb-0 mb-sm-1 pb-0 py-sm-2 fw-medium">Recording Settings</dt>
                <dd class="col-sm-8 d-sm-inline-flex mb-3 mb-sm-1 pt-1 py-sm-2">
                  <span v-if="audioMode === 'Disabled'">Video only</span>
                  <span v-if="audioMode === 'AudioOnly'">Audio only</span>
                  <span v-else-if="audioMode === 'AudioAndThermal'">Audio and thermal</span>
                  <span v-else-if="audioMode === 'AudioOrThermal'">Audio or thermal</span>
                </dd>
              </div>

              <div v-if="audioMode !== 'Disabled'" class="row">
                <dt class="col-sm-4 d-sm-inline-flex mb-0 mb-sm-0 pb-0 py-sm-2 fw-medium">Thermal video recording schedule</dt>
                <dd class="col-sm-8 d-sm-inline-flex flex mb-3 mb-sm-0 pt-1 py-sm-2">{{ recordingWindow }}</dd>
              </div>
            </dl>
          </div>
          <div v-if="audioMode !== 'Disabled' || recordingWindow" class="mt-4">
            <h5 class="h5">Recording window</h5>
            <p>Visualise how the recording settings and thermal video recording schedule are applied over a 24-hour period.</p>
            <div class="mb-0 ps-3 pe-4 py-3 border-0 bg-light bg-opacity-75 rounded">
              <div>
                <div class="d-flex align-items-center flex-fill">
                  <div :style="{ width: '72px' }"></div>
                  <div class="d-flex flex-fill justify-content-between lh-1 font-monospace">
                    <small class="text-center" :style="{ marginLeft: '-18px', width: '40px' }">00:00</small>
                    <small class="text-center" :style="{ width: '40px' }">12:00</small>
                    <small class="text-center" :style="{ marginRight: '-18px', width: '40px' }">24:00</small>
                  </div>
                </div>
                <div class="d-flex align-items-center flex-fill lh-1 mt-1 text-body-tertiary">
                  <div :style="{ width: '72px' }"></div>
                  <div class="d-flex flex-fill justify-content-between">
                    <small>❘</small>
                    <small>❘</small>
                    <small>❘</small>
                  </div>
                </div>
              </div>
              <div class="d-flex flex-column mt-1">
                <div class="d-flex align-items-center mb-2">
                <span class="mb-0" :style="{ width: '72px' }">
                  Thermal:
                </span>
                  <div
                    class="position-relative flex-fill bg-secondary-subtle p-0"
                    :style="{ height: '0.7rem' }"
                  >
                    <!-- Thermal Recording Windows -->
                    <div
                      v-for="(style, index) in thermalBarStyles"
                      :key="'thermal-' + index"
                      class="position-absolute h-100 bg-success p-0"
                      :style="style"
                    ></div>
                  </div>
                </div>
                <div class="d-flex align-items-center">
                <span class="mb-0" :style="{ width: '72px' }">
                  Audio:
                </span>
                  <div
                    class="position-relative flex-fill bg-secondary-subtle"
                    :style="{ height: '0.7rem' }"
                  >
                    <!-- Audio Recording Windows -->
                    <div
                      v-for="(style, index) in audioBarStyles"
                      :key="'audio-' + index"
                      class="position-absolute h-100 bg-primary"
                      :style="style"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </section-card>

        <section-card v-if="isTc2Device" class="mb-3 mb-lg-4">
          <template #header-title>
            Power profile
          </template>
          <template #header-action>
            <div v-if="savingPowerModeSettings">
              <b-spinner
                class="me-2"
                variant="secondary"
                small
              />
              <span class="text-secondary">Saving</span>
            </div>
          </template>
          <b-form-checkbox switch v-model="useLowPowerMode" class="mb-3 fw-medium"
          >Use low power mode</b-form-checkbox>

          <p>Devices in low power mode will only connect to the Cacophony Platform once per day to offload recordings.
            This is the recommended mode for projects doing passive monitoring, as the battery will last much longer in the field.
          </p>

          <p class="mb-0">Projects tracking an incursion that require
            <router-link :to="{ name: 'user-project-settings' }">
              real-time alerts</router-link> of species detected should disable low power mode.
          </p>
        </section-card>

        <section-card v-if="isTc2Device" class="mb-3 mb-lg-4">
          <template #header-title>
            Recording settings
          </template>
          <template #header-action>
            <div v-if="savingAudioSettings" class="d-flex align-items-center">
              <b-spinner
                class="me-2"
                variant="secondary"
                small
              />
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
            <b-form-radio value="Disabled" class="mb-1">
              <p class="fw-medium mb-1">Thermal video only</p>
              <p class="text-secondary">Disables audio recording and records only thermal video.</p>
            </b-form-radio>
            <b-form-radio value="AudioOnly" class="mb-1">
              <p class="fw-medium mb-1">Audio only</p>
              <p class="text-secondary">Records audio in a 24-hour window and disables thermal recording.</p>
            </b-form-radio>
            <b-form-radio value="AudioAndThermal" class="mb-1">
              <p class="fw-medium mb-1">Audio And Thermal</p>
              <p class="text-secondary">Records audio outside of the thermal recording window.</p>
            </b-form-radio>
            <b-form-radio value="AudioOrThermal" class="mb-1">
              <p class="fw-medium mb-1"> Audio Or Thermal</p>
              <p class="text-secondary"> Records a one-minute clip of audio 32 times a day,
                at random intervals during the day. The camera won't be able to record thermal video
                while the audio is being recorded.</p>
            </b-form-radio>
          </b-form-radio-group>
        </section-card>

        <section-card class="mb-3 mb-lg-4">
          <template #header-title>
            Thermal video recording schedule
          </template>
          <template #header-action>
            <div v-if="savingRecordingWindowSettings">
              <b-spinner
                class="me-2"
                variant="secondary"
                small
              />
              <span class="text-secondary">Saving</span>
            </div>
          </template>
          <div>
            <p class="mb-4">Select the default mode if your project is doing monitoring of nocturnal predators.
              If your project has different objectives, you can set the device to record 24/7 or specify a
              custom time window.</p>
            <div class="d-flex justify-content-between">
              <b-form-radio-group stacked v-model="recordingWindowSetting">
                <b-form-radio value="default" class="mb-1">
                  <p class="fw-medium mb-1">Ready to record from dusk until dawn <b-badge class="ms-1">Default</b-badge></p>
                  <p class="text-secondary">The device will be actively
                    monitoring and ready to make thermal recordings from 30 minutes
                    before sunset until 30 minutes after sunrise. The
                    battery life on the device will vary throughout the year as the
                    length of the days change with the seasons.</p>
                  <b-alert
                    :model-value="recordingWindowSetting === 'default'"
                    variant="warning"
                    :no-animation="true"
                  >
                    <div class="d-flex">
                      <material-symbol name="warning" class="me-2" size="1.25rem"/>
                      Devices must have a location assigned to them to be able to record.
                      Set the location of your device on the Cacophony Sidekick mobile app when you
                      deploy it in the field. Remember to update the location when a device is moved
                      so that the correct dusk/dawn window can be calculated.
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
                      <material-symbol name="info" class="me-2" size="1.25rem"/>
                      Recording during daytime works best in shade. Sun moving through
                      the field of view and heating and cooling items in the scene can
                      result in a higher volume of false-triggers.
                    </div>
                  </b-alert>
                </b-form-radio>
                <b-form-radio value="custom" class="mb-1">
                  <p class="fw-medium mb-1">Custom recording window</p>
                  <p class="text-secondary mb-1">Set the device to enter and exit the active 'ready-to-record' state at fixed times each day.</p>
                  <div
                    class="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center mt-3"
                    v-if="recordingWindowSetting === 'custom'"
                  >
                    <label for="start-time" class="text-nowrap me-2 fw-medium mb-1 mb-sm-0">Start time:</label>
                    <datepicker
                      class="me-2 mb-2 mb-sm-0"
                      v-model="customRecordingWindowStart"
                      time-picker
                      required
                      placeholder="Recording start"
                      id="start-time"
                    />
                    <label for="start-time" class="text-nowrap fw-medium me-2 ms-0 ms-sm-1 mb-1 mb-sm-0 mt-1 mt-sm-0">End time:</label>
                    <datepicker
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
                      <material-symbol name="info" class="me-2" size="1.25rem"/>
                      Recording during daytime works best in shade. Sun moving through
                      the field of view and heating and cooling items in the scene can
                      result in a higher volume of false-triggers.
                    </div>
                  </b-alert>
                </b-form-radio>
              </b-form-radio-group>
            </div>
          </div>
        </section-card>

        <section-card v-if="isTc2Device" class="mb-3 mb-lg-4">
          <template #header-title>
            Battery configuration
          </template>
          <template #header-action>
            <div v-if="savingBatterySettings">
              <b-spinner
                class="me-2"
                variant="secondary"
                small
              />
              <span class="text-secondary">Saving</span>
            </div>
          </template>
          <p>
            Battery chemistry and cell count are automatically detected based on voltage readings.
            These values are used to calculate the expected battery duration and don't affect the
            operation of the device.
          </p>
          <p class="mb-4">
            These values should only be specified manually if the detection is incorrect.
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
</style>
<style lang="css">
@import url("@vuepic/vue-datepicker/dist/main.css");

/* TODO: move somewhere else? Or leave here, given the component is not used in any other places? */
.dp__input {
  font-family: var(--font-family);
  font-size: var(--font-size--md);
}

.dp__action_select {
  background: var(--color-cp-green-600);
  &:hover {
    background: var(--color-cp-green-700);
  }
}
</style>
