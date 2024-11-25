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
  getDeviceNodeGroup,
  getSettingsForDevice,
  updateDeviceSettings,
} from "@api/Device.ts";
import Datepicker from "@vuepic/vue-datepicker";
import { projectDevicesLoaded } from "@models/LoggedInUser.ts";
import { resourceIsLoading } from "@/helpers/utils.ts";
type Time = { hours: number; minutes: number; seconds: number };
const devices = inject(selectedProjectDevices) as Ref<
  ApiDeviceResponse[] | null
>;
const route = useRoute();
const deviceModel = ref<LoadedResource<"tc2" | "pi">>(null);
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
  }
);

const deviceId = computed<DeviceId>(
  () => Number(route.params.deviceId) as DeviceId
);
const device = computed<ApiDeviceResponse | null>(() => {
  return (
    (devices.value &&
      devices.value.find(
        (device: ApiDeviceResponse) => device.id === deviceId.value
      )) ||
    null
  );
});

const settingsLoading = resourceIsLoading(settings);
const lastSyncedSettingsLoading = resourceIsLoading(lastSyncedSettings);
const nodeGroupInfoLoading = resourceIsLoading(deviceModel);
const isTc2Device = computed<boolean>(() => {
  return deviceModel.value === "tc2";
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
    time.minutes
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
  loader: () => Promise<unknown | false>
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
  await loadResource(deviceModel, () => getDeviceModel(deviceId.value));
  initialised.value = true;
  if (settings.value && !settings.value.synced) {
    // Load last synced settings
    const response = await getSettingsForDevice(
      deviceId.value,
      new Date(),
      true
    );
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
    (settings.value as ApiDeviceHistorySettings).thermalRecording = {
      useLowPowerMode: val,
      updated: new Date().toISOString(),
    };
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
    }
  },
});
const customRecordingWindowStart = computed<Time>({
  get: () => {
    if (settings.value) {
      return timeStrToTimeObj(
        (settings.value as ApiDeviceHistorySettings).windows?.startRecording ||
          ""
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
    }
  },
});

const customRecordingWindowStop = computed<Time>({
  get: () => {
    if (settings.value) {
      return timeStrToTimeObj(
        (settings.value as ApiDeviceHistorySettings).windows?.stopRecording ||
          ""
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
    }
  },
});

const audioModeOptions = [
  { value: "Disabled", text: "Disabled" },
  { value: "AudioOnly", text: "Audio Only" },
  { value: "AudioAndThermal", text: "Audio and Thermal" },
  { value: "AudioOrThermal", text: "Audio or Thermal" },
];

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
    }
  },
});
const audioModeExplanation = computed<string>(() => {
  switch (audioMode.value) {
    case "AudioOnly":
      return "Records audio in a 24-hour window and disables thermal recording.";
    case "AudioOrThermal":
      return "Records audio outside of the thermal recording window.";
    case "AudioAndThermal":
      return "Records audio in a 24-hour window; however, the camera cannot record during the 1 minute of audio recording.";
    default:
      return "";
  }
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
  endTime: string
): Array<{ left: string; width: string }> {
  if (startTime === "12:00" && endTime === "12:00")
    return [{ left: "0%", width: "100%" }];
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
    stopRecording
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
      stopRecording
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
    <div
      class="mt-4 mt-lg-0 settings-config w-100 justify-content-center align-items-center"
      v-if="
        device &&
        (device.type === 'thermal' || device.type === 'hybrid-thermal-audio')
      "
    >
      <div class="alert alert-info">
        If your device has a connection to the internet, you can
        <strong>setup recording modes remotely</strong>, and when your device
        next comes online it will <strong>synchronise</strong> these settings.
      </div>
      <div class="alert alert-warning" v-if="!device.lastConnectionTime">
        <strong>Note: </strong> It looks like your device has never connected to
        the Cacophony Platform in its current location, so remote setup may not
        be available.
      </div>
      <div class="h5">Current settings summary</div>
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
        <div>
          <strong>Synced with remote device:</strong>
          {{ settings.synced ? "Yes" : "No" }}
        </div>
        <span>
          <span v-if="!settings.synced">Once synced, w</span>
          <span v-else>W</span>ill {{ recordingWindow }} in
          <span v-if="useLowPowerMode">low</span>
          <span v-else>high</span> power mode
          <span v-if="audioMode !== 'Disabled'">
            and
            <span v-if="audioMode === 'AudioOnly'">audio only</span>
            <span v-else-if="audioMode === 'AudioAndThermal'"
              >audio and thermal</span
            >
            <span v-else-if="audioMode === 'AudioOrThermal'"
              >audio or thermal</span
            > </span
          >.
        </span>
        <hr />
        <div v-if="isTc2Device">
          <div class="h5">Set power profile</div>
          <p>
            <strong><em>Low power mode</em></strong> means that your device will
            only connect to the Cacophony Platform once per day to offload any
            recordings that it has made.
          </p>
          <div class="alert alert-light">
            <b-form-checkbox switch v-model="useLowPowerMode"
              >Use low power mode<b-spinner
                class="ms-1"
                v-if="savingPowerModeSettings"
                variant="secondary"
                small
            /></b-form-checkbox>
          </div>
          <p>
            For most users doing passive monitoring, this should be the
            preferred mode, as it will make the battery last many times longer
            in the field.<br />You might want to consider disabling this mode if
            you are tracking an incursion and require
            <router-link :to="{ name: 'user-project-settings' }"
              >real-time alerts</router-link
            >
            of species detected.
          </p>
          <hr />
        </div>
        <div v-if="isTc2Device">
          <div class="h5">Set Audio Recording Settings</div>
          <p>
            Audio recordings are made 32 times a day for one minute at random
            intervals.
          </p>
          <div class="alert-light alert">
            <b-form-group label="Audio Mode">
              <b-form-select
                v-model="audioMode"
                :options="audioModeOptions"
                :disabled="savingAudioSettings"
              ></b-form-select>
            </b-form-group>
            <div class="d-flex justify-content-end">
              <b-spinner
                class="ms-2"
                v-if="savingAudioSettings"
                variant="secondary"
                small
              />
            </div>
            <div class="pt-2">{{ audioModeExplanation }}</div>
          </div>
          <div v-if="audioMode !== 'Disabled' || recordingWindow" class="mt-4">
            <div class="d-flex align-items-center">
              <div :style="{ width: '71px' }"></div>
              <div class="d-flex w-100 justify-content-between text-muted">
                <div>00:00</div>
                <div>12:00</div>
                <div>24:00</div>
              </div>
            </div>
            <div class="d-flex flex-column mt-2">
              <div class="d-flex align-items-center mb-2">
                <h6 class="text-muted mb-0 py-1" :style="{ width: '71px' }">
                  Thermal:
                </h6>
                <div
                  class="position-relative flex-fill rounded bg-light p-0"
                  :style="{ height: '1em' }"
                  v-if="audioMode !== 'AudioOnly'"
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
                <h6 class="text-muted mb-0 py-1" :style="{ width: '71px' }">
                  Audio:
                </h6>
                <div
                  class="position-relative flex-fill rounded bg-light"
                  :style="{ height: '1em' }"
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
          <hr />
        </div>
        <div>
          <div class="h5">Set recording time windows</div>
          <p>
            <strong><em>By default</em></strong> your camera will be actively
            monitoring and ready to make thermal recordings from 30 minutes
            before sunset until 30 minutes after sunrise.<br />In this mode the
            battery life on your device will vary throughout the year as the
            length of the days change with the seasons.
            <strong
              >For most users doing monitoring of nocturnal predators, this is
              the recommended mode.</strong
            >
            <br /><em
              >NOTE: It's important that the location of your device is set
              correctly so that the correct dusk/dawn window can be
              calculated.</em
            >
          </p>
          <div class="alert-light alert">
            <div class="d-flex justify-content-between">
              <b-form-radio-group stacked v-model="recordingWindowSetting">
                <b-form-radio value="default"
                  >Ready to record from dusk until dawn (default)</b-form-radio
                >
                <b-form-radio value="always">Ready to record 24/7</b-form-radio>
                <b-form-radio value="custom"
                  >Custom recording window</b-form-radio
                >
              </b-form-radio-group>
              <b-spinner
                class="ms-1"
                v-if="savingRecordingWindowSettings"
                variant="secondary"
                small
              />
            </div>

            <div
              class="justify-content-between d-flex mt-2"
              v-if="recordingWindowSetting === 'custom'"
            >
              <datepicker
                class="me-2"
                v-model="customRecordingWindowStart"
                time-picker
                required
                placeholder="Recording start"
              />
              <datepicker
                v-model="customRecordingWindowStop"
                time-picker
                required
                placeholder="Recording end"
              />
            </div>
          </div>

          <p>
            If your project has different objectives, you can set the camera to
            enter and exit the active 'ready-to-record' state at fixed times
            each day, or you can disable the active window entirely to record
            24/7.
            <em
              >Recording during daytime works best in shade. Sun moving through
              the field of view and heating and cooling items in the scene can
              result in a higher volume of false-triggers.</em
            >
          </p>
        </div>
        <hr />
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.settings-config {
  max-width: 640px;
}
</style>
<style lang="css">
@import url("@vuepic/vue-datepicker/dist/main.css");
</style>
