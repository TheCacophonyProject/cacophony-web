<script setup lang="ts">
import { computed, inject, onBeforeMount, ref, type Ref, watch } from "vue";
import { selectedProjectDevices } from "@models/provides.ts";
import type {
  ApiDeviceHistorySettings,
  ApiDeviceResponse,
} from "@typedefs/api/device";
import { useRoute } from "vue-router";
import type { DeviceId } from "@typedefs/api/common";
import type { LoadedResource } from "@api/types.ts";
import {
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
const saltNodeGroup = ref<LoadedResource<string>>(null);
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
const nodeGroupInfoLoading = resourceIsLoading(saltNodeGroup);
const isTc2Device = computed<boolean>(() => {
  return (saltNodeGroup.value || "").includes("tc2");
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
  await loadResource(saltNodeGroup, () => getDeviceNodeGroup(deviceId.value));
  await loadResource(settings, fetchSettings);
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
        <span
          ><span v-if="!settings.synced">Once synced, w</span
          ><span v-else>W</span>ill {{ recordingWindow }} in
          <span v-if="useLowPowerMode">low</span> <span v-else>high</span> power
          mode.</span
        >
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
            <b-form-radio-group stacked v-model="recordingWindowSetting">
              <b-form-radio value="default"
                >Ready to record from dusk until dawn (default)</b-form-radio
              >
              <b-form-radio value="always">Ready to record 24/7</b-form-radio>
              <b-form-radio value="custom"
                >Custom recording window</b-form-radio
              >
            </b-form-radio-group>

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
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.settings-config {
  max-width: 640px;
}
</style>
<style src="@vuepic/vue-datepicker/dist/main.css"></style>
