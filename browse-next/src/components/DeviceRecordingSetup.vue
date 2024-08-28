<script setup lang="ts">
import {
  computed,
  inject,
  onBeforeMount,
  onMounted,
  ref,
  type Ref,
  watch,
} from "vue";
import { selectedProjectDevices } from "@models/provides.ts";
import type {
  ApiDeviceHistorySettings,
  ApiDeviceResponse,
  ThermalRecordingSettings,
  WindowsSettings,
} from "@typedefs/api/device";
import { useRoute } from "vue-router";
import type { DeviceId } from "@typedefs/api/common";
import type { LoadedResource } from "@api/types.ts";
import {
  getSettingsForDevice,
  set24HourRecordingWindows,
  setCustomRecordingWindows,
  setDefaultRecordingWindows,
  setUseLowPowerMode,
} from "@api/Device.ts";
import Datepicker from "@vuepic/vue-datepicker";
import { projectDevicesLoaded } from "@models/LoggedInUser.ts";
const showCustomModal = ref(false);
type Time = { hours: number; minutes: number; seconds: number };
const customPowerTime = ref<[Time, Time]>();
const customRecordingWindow = ref<[Time, Time]>();
const devices = inject(selectedProjectDevices) as Ref<
  ApiDeviceResponse[] | null
>;
const route = useRoute();
const saltNodeGroup = ref<LoadedResource<string>>(null);
// Device Settings
const settings = ref<LoadedResource<ApiDeviceHistorySettings>>(null);
const deviceId = Number(route.params.deviceId) as DeviceId;
const device = computed<ApiDeviceResponse | null>(() => {
  return (
    (devices.value &&
      devices.value.find(
        (device: ApiDeviceResponse) => device.id === deviceId
      )) ||
    null
  );
});
const isLoading = (val: Ref<LoadedResource<unknown>>) =>
  computed<boolean>(() => val.value === null);
const settingsLoading = isLoading(settings);
const nodeGroupInfoLoading = isLoading(saltNodeGroup);
const fields = [
  { key: "name", label: "Setting" },
  { key: "label", label: "" },
  { key: "actions", label: "Actions" },
];

const isTc2Device = computed<boolean>(() => {
  return (saltNodeGroup.value || "").includes("tc2");
});

const currentWindowsType = computed(() => {
  if (!settings.value || !settings.value.windows) {
    return "default";
  }
  const { startRecording, stopRecording } = settings.value.windows;
  if (startRecording === "-30m" && stopRecording === "+30m") {
    return "default";
  } else if (startRecording === "12:00" && stopRecording === "12:00") {
    return "24hour";
  } else {
    return "custom";
  }
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
const formatTime = (timeString: string) => {
  if (!timeString) {
    return "";
  }
  if (timeString[0] === "+" || timeString[0] === "-") {
    return timeString;
  }
  const [hours, minutes] = timeString.split(":");
  return `${hours}:${minutes}`;
};

const fetchSettings = async () => {
  const response = await getSettingsForDevice(deviceId);
  if (response.success && response.result.settings) {
    return response.result.settings;
  }
  return {
    windows: defaultWindows,
    thermalRecording: {
      toggleUseLowPowerMode: false,
    },
  };
};

const formatRecordingWindows = (windows: Omit<WindowsSettings, "updated">) => {
  if (isTc2Device.value) {
    return `Start Recording: ${formatTime(
      windows.startRecording
    )}, Stop Recording: ${formatTime(windows.stopRecording)}`;
  } else {
    return `Power On: ${formatTime(windows.powerOn!)}, Power Off: ${formatTime(
      windows.powerOff!
    )}, Start Recording: ${formatTime(
      windows.startRecording
    )}, Stop Recording: ${formatTime(windows.stopRecording)}`;
  }
};
const settingsTable = computed(() => {
  if (settings.value) {
    const rows = [
      {
        name: "Power Mode",
        value: settings.value.thermalRecording?.useLowPowerMode ?? false,
        label: settings.value.thermalRecording?.useLowPowerMode
          ? "Low"
          : "High",
      },
      {
        name: "Recording Windows",
        value: settings.value?.windows
          ? formatRecordingWindows(settings.value.windows)
          : formatRecordingWindows(defaultWindows),
        label: settings.value?.windows
          ? formatRecordingWindows(settings.value.windows)
          : formatRecordingWindows(defaultWindows),
      },
    ];

    return rows;
  }
  return [];
});

const handleUseLowPowerMode = async (on: boolean) => {
  const response = await setUseLowPowerMode(deviceId, on);
  if (response.success) {
    settings.value = response.result.settings;
  }
};

const handleSetDefaultRecordingWindows = async () => {
  const response = await setDefaultRecordingWindows(
    deviceId,
    isTc2Device.value
  );
  if (response.success) {
    settings.value = response.result.settings;
  }
};

const handleSet24HourRecordingWindows = async () => {
  const response = await set24HourRecordingWindows(deviceId, isTc2Device.value);
  if (response.success) {
    settings.value = response.result.settings;
  }
};
const GetWindowSettings = (): Omit<WindowsSettings, "updated"> | null => {
  if (settings.value && isTc2Device.value && customRecordingWindow.value) {
    const [startRecording, stopRecording] = customRecordingWindow.value;
    return {
      startRecording: timeObjToTimeStr(startRecording),
      stopRecording: timeObjToTimeStr(stopRecording),
      powerOn: settings.value.windows?.powerOn || "-30m",
      powerOff: settings.value.windows?.powerOff || "+30m",
    };
  } else if (
    !isTc2Device.value &&
    customPowerTime.value &&
    customRecordingWindow.value
  ) {
    const [powerOn, powerOff] = customPowerTime.value;
    const [startRecording, stopRecording] = customRecordingWindow.value;
    return {
      powerOn: timeObjToTimeStr(powerOn),
      powerOff: timeObjToTimeStr(powerOff),
      startRecording: timeObjToTimeStr(startRecording),
      stopRecording: timeObjToTimeStr(stopRecording),
    };
  }
  return null;
};

const enableCustomRecordingWindows = () => {
  if (!settings.value || !settings.value.windows) {
    return;
  }
  const windows = settings.value.windows;
  if (!isTc2Device.value && windows.powerOn && windows.powerOff) {
    customPowerTime.value = [
      timeStrToTimeObj(windows.powerOn),
      timeStrToTimeObj(windows.powerOff),
    ];
  }
  customRecordingWindow.value = [
    timeStrToTimeObj(windows.startRecording),
    timeStrToTimeObj(windows.stopRecording),
  ];
  showCustomModal.value = true;
};

const handleOk = (bvModalEvent: { preventDefault: () => void }) => {
  bvModalEvent.preventDefault();
  saveCustomRecordingWindows();
};

const saveCustomRecordingWindows = async () => {
  const windowsSettings = GetWindowSettings();
  if (!windowsSettings) {
    return;
  }
  const response = await setCustomRecordingWindows(deviceId, windowsSettings);
  if (response.success) {
    settings.value = response.result.settings;
  }
  showCustomModal.value = false;
};
const handleCancel = () => {
  showCustomModal.value = false;
};
const loadResource = (
  target: Ref<LoadedResource<unknown>>,
  loader: () => Promise<unknown | false>
) => {
  if (isLoading(target)) {
    loader().then((result) => (target.value = result));
  }
};

onBeforeMount(async () => {
  await projectDevicesLoaded();
  loadResource(settings, () => fetchSettings());
});

const useLowPowerMode = ref<boolean>(false);
const savingPowerModeSettings = ref<boolean>(false);

const initialised = ref<boolean>(false);
onMounted(() => {
  initialised.value = true;
});

const persistDeviceSettings = async (
  deviceSettings: ApiDeviceHistorySettings
) => {};

watch(useLowPowerMode, async (next) => {
  if (initialised.value && settings.value) {
    settings.value.thermalRecording = settings.value.thermalRecording || {
      useLowPowerMode: false,
      updated: new Date().toISOString(),
    };
    (
      settings.value.thermalRecording as ThermalRecordingSettings
    ).useLowPowerMode = next;
    (settings.value.thermalRecording as ThermalRecordingSettings).updated =
      new Date().toISOString();
    savingPowerModeSettings.value = true;
    await persistDeviceSettings(settings);
    savingPowerModeSettings.value = false;
  }
});
const summaryHelpInfo = ref(true);
const connectedWarningInfo = ref(true);
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
      <b-alert v-model="summaryHelpInfo">
        If your device has a connection to the internet, you can
        <strong>setup recording modes remotely</strong>, and when your device
        next comes online it will <strong>synchronise</strong> these settings.
      </b-alert>
      <b-alert
        v-model="connectedWarningInfo"
        v-if="!device.lastConnectionTime"
        variant="warning"
      >
        <strong>Note: </strong> It looks like your device has never connected to
        the Cacophony Platform in its current location, so remote setup may not
        be available.
      </b-alert>
      <span v-if="settingsLoading">
        <b-spinner small class="me-2" />
      </span>
      <div v-else-if="settings" class="mt-3">
        <!-- TODO: Show current settings, and when they were last synced -->
        <!-- If current settings aren't available, we can show settings from events api? -->
        <div><b>Synced:</b> {{ settings.synced ? "Yes" : "No" }}</div>
        <div v-if="true || isTc2Device">
          <div class="h6">Power profile</div>
          <p>
            <strong><em>Low power mode</em></strong> means that your device will
            only connect to the Cacophony Platform once per day to offload any
            recordings that it has made.<br />For most users doing passive
            monitoring, this should be the preferred mode, as it will make the
            battery last many times longer in the field.<br />You might want to
            consider disabling this mode if you are tracking an incursion and
            require <router-link :to="{ name: 'user-project-settings' }">real-time alerts</router-link> of species detected.
          </p>
          <b-form-checkbox switch v-model="useLowPowerMode"
            >Use low power mode<b-spinner
              class="ms-1"
              v-if="savingPowerModeSettings"
              variant="secondary"
              small
          /></b-form-checkbox>
        </div>
        <div>
          <div class="h6">Recording time windows</div>
          <p>
            By default your camera will be actively monitoring and ready to make
            thermal recordings from 30 minutes before sunset until 30 minutes
            after sunrise.<br />In this mode the battery life on your device
            will vary throughout the year as the length of the days change with
            the seasons. For most users doing monitoring of nocturnal predators,
            this is the suggested mode.<br />
            If your project has different objectives, you can set the camera to
            enter and exit the active 'ready-to-record' state at fixed times
            each day, or you can disable the active window entirely to record
            24/7. Note that recording during daytime works best under a canopy.
            Sun moving through the field of view and heating and cooling items
            in the scene can result in a higher volume of false-triggers.
          </p>
          <b-form-radio-group buttons>
            <b-form-radio>Default settings</b-form-radio>
            <b-form-radio>Record 24/7</b-form-radio>
            <b-form-radio>Custom recording window</b-form-radio>
          </b-form-radio-group>
        </div>
        <div class="h6">Settings summary</div>
        <!--      <b-table-->
        <!--        :items="settingsTable"-->
        <!--        :fields="fields"-->
        <!--        striped-->
        <!--        hover-->
        <!--        class="settings-table mt-3"-->
        <!--      >-->
        <!--        <template #cell(actions)="row">-->
        <!--          <div class="btn-group" v-if="row.item.name === 'Power Mode'">-->
        <!--            <b-button-->
        <!--              @click="() => handleUseLowPowerMode(true)"-->
        <!--              :variant="-->
        <!--                settings?.thermalRecording?.useLowPowerMode ?? false-->
        <!--                  ? 'primary'-->
        <!--                  : 'secondary'-->
        <!--              "-->
        <!--              :disabled="settings?.thermalRecording?.useLowPowerMode ?? false"-->
        <!--              >Low Power</b-button-->
        <!--            >-->
        <!--            <b-button-->
        <!--              @click="() => handleUseLowPowerMode(false)"-->
        <!--              :variant="-->
        <!--                !(settings?.thermalRecording?.useLowPowerMode ?? false)-->
        <!--                  ? 'primary'-->
        <!--                  : 'secondary'-->
        <!--              "-->
        <!--              :disabled="!settings?.thermalRecording?.useLowPowerMode ?? false"-->
        <!--              >High Power</b-button-->
        <!--            >-->
        <!--          </div>-->
        <!--          <div v-if="row.item.name === 'Recording Windows'" class="btn-group">-->
        <!--            <b-button-->
        <!--              @click="handleSetDefaultRecordingWindows"-->
        <!--              :variant="-->
        <!--                currentWindowsType === 'default' ? 'primary' : 'secondary'-->
        <!--              "-->
        <!--              >Default</b-button-->
        <!--            >-->
        <!--            <b-button-->
        <!--              @click="handleSet24HourRecordingWindows"-->
        <!--              :variant="-->
        <!--                currentWindowsType === '24hour' ? 'primary' : 'secondary'-->
        <!--              "-->
        <!--              >24 Hours</b-button-->
        <!--            >-->
        <!--            <b-button-->
        <!--              @click="enableCustomRecordingWindows"-->
        <!--              :variant="-->
        <!--                currentWindowsType === 'custom' ? 'primary' : 'secondary'-->
        <!--              "-->
        <!--              >Custom</b-button-->
        <!--            >-->
        <!--          </div>-->
        <!--        </template>-->
        <!--      </b-table>-->
      </div>
      <b-modal
        v-model="showCustomModal"
        title="Custom Recording Windows"
        @ok="handleOk"
        @cancel="handleCancel"
      >
        <b-form @submit.stop.prevent="saveCustomRecordingWindows">
          <b-form-group
            v-if="!isTc2Device"
            label="Power On Time"
            label-for="power-on-time"
          >
            <datepicker
              v-model="customPowerTime"
              time-picker
              range
              required
              placeholder="Power On/Off Time"
            />
          </b-form-group>

          <b-form-group label="Recording Window" label-for="recording-time">
            <datepicker
              v-model="customRecordingWindow"
              time-picker
              range
              required
              placeholder="Recording Window"
            />
          </b-form-group>
        </b-form>
      </b-modal>
    </div>
  </div>
</template>

<style scoped lang="less">
.settings-config {
  max-width: 640px;
}
</style>
<style src="@vuepic/vue-datepicker/dist/main.css"></style>
