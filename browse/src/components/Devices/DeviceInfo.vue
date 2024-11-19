<template>
  <b-container class="versions" style="padding: 0">
    <b-row class="mt-4">
      <b-col v-if="settings">
        <h2>Device Settings</h2>
        <div class="device-settings mt-3">
          <div>
            <b>Synced with remote device:</b>
            {{ settings.synced ? "Yes" : "No" }}
          </div>
          <hr />
          <div>
            <h5>Set Power Profile</h5>
            <p>
              <b>Low power mode</b> means that your device will only connect to
              the Cacophony Platform once per day to offload any recordings that
              it has made.
            </p>
            <div class="">
              <b-form-checkbox switch v-model="useLowPowerMode"
                >Use low power mode</b-form-checkbox
              >
            </div>
            <p>
              For most users doing passive monitoring, this should be the
              preferred mode, as it will make the battery last many times longer
              in the field. You might want to consider disabling this mode if
              you are tracking an incursion and require real-time alerts of
              species detected.
            </p>
          </div>
          <hr />
          <div>
            <h5>Set recording time windows</h5>
            <p>
              <strong><em>By default</em></strong> your camera will be actively
              monitoring and ready to make thermal recordings from 30 minutes
              before sunset until 30 minutes after sunrise.<br />In this mode
              the battery life on your device will vary throughout the year as
              the length of the days change with the seasons.
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
            <div>
              <b-form-radio-group stacked v-model="recordingWindowSetting">
                <b-form-radio value="default"
                  >Ready to record from dusk until dawn (default)</b-form-radio
                >
                <b-form-radio value="always">Ready to record 24/7</b-form-radio>
                <b-form-radio value="custom"
                  >Custom recording window</b-form-radio
                >
              </b-form-radio-group>
            </div>

            <b-container
              class="mt-1"
              v-if="recordingWindowSetting === 'custom'"
            >
              <b-form>
                <b-row v-if="!isTc2Device">
                  <b-col>
                    <b-form-group
                      label="Power On Time"
                      label-for="power-on-time"
                    >
                      <b-form-timepicker
                        id="power-on-time"
                        v-model="customPowerWindowStart"
                        required
                      ></b-form-timepicker>
                    </b-form-group>
                  </b-col>
                  <b-col>
                    <b-form-group
                      label="Power Off Time"
                      label-for="power-off-time"
                    >
                      <b-form-timepicker
                        id="power-off-time"
                        v-model="customPowerWindowStop"
                        required
                      ></b-form-timepicker>
                    </b-form-group>
                  </b-col>
                </b-row>

                <b-row>
                  <b-col>
                    <b-form-group
                      label="Start Recording Time"
                      label-for="start-recording-time"
                    >
                      <b-form-timepicker
                        id="start-recording-time"
                        v-model="customRecordingWindowStart"
                        required
                      ></b-form-timepicker>
                    </b-form-group>
                  </b-col>

                  <b-col>
                    <b-form-group
                      label="Stop Recording Time"
                      label-for="stop-recording-time"
                    >
                      <b-form-timepicker
                        id="stop-recording-time"
                        v-model="customRecordingWindowStop"
                        required
                      ></b-form-timepicker>
                    </b-form-group>
                  </b-col>
                </b-row>
              </b-form>
            </b-container>
            <p>
              If your project has different objectives, you can set the camera
              to enter and exit the active 'ready-to-record' state at fixed
              times each day, or you can disable the active window entirely to
              record 24/7.
              <em
                >Recording during daytime works best in shade. Sun moving
                through the field of view and heating and cooling items in the
                scene can result in a higher volume of false-triggers.</em
              >
            </p>
          </div>
          <hr />
          <div v-if="isTc2Device">
            <div>
              <h5>Set Audio Recording Settings</h5>
              <p>
                Audio recordings are made 32 times a day for one minute at
                random intervals.
              </p>
              <div>
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
                <div class="pb-16">{{ audioModeExplanation }}</div>
              </div>
            </div>
          </div>
        </div>
      </b-col>
      <b-col>
        <h2>Current software versions</h2>
        <div v-if="!software.result">{{ software.message }}</div>
        <div
          v-else-if="
            software.result.EventDetail && software.result.EventDetail.details
          "
        >
          <div
            v-for="(version, component) in software.result.EventDetail.details"
            :key="component"
          >
            <b>{{ component }}</b
            >: {{ version }}
          </div>
          <div v-if="software.result.dateTime">
            <i
              >Recorded {{ dayOfSnapshot.toLowerCase() }} at
              {{ timeOfSnapshot }}</i
            >
          </div>
          <p>
            Current released software versions are listed
            <a href="https://github.com/TheCacophonyProject/saltops#branch-prod"
              >here</a
            >.
          </p>
        </div>
      </b-col>
    </b-row>
  </b-container>
</template>

<script lang="ts">
import { mapState } from "vuex";
import { toStringTodayYesterdayOrDate } from "@/helpers/datetime";
import {
  defineComponent,
  ref,
  onMounted,
  computed,
  watch,
} from "@vue/composition-api";
import DeviceApi from "@/api/Device.api";
import {
  ApiDeviceHistorySettings,
  AudioModes,
  WindowsSettings,
} from "@typedefs/api/device";

export default defineComponent({
  name: "DeviceDetail",
  props: {
    software: {
      type: Object,
      required: true,
    },
    deviceId: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    const settings = ref<ApiDeviceHistorySettings>(null);
    const fields = [
      { key: "name", label: "Setting" },
      { key: "value", label: "Value" },
      { key: "actions", label: "Actions" },
    ];

    const showCustomModal = ref(false);

    const fetchSettings = async () => {
      try {
        const response = await DeviceApi.getSettingsForDevice(props.deviceId);
        debugger;
        if (response.success) {
          settings.value = response.result.settings;
        }
      } catch (e) {
        //console.error(e);
      }
    };

    const toggleUseLowPowerMode = async (setting) => {
      if (setting.name === "Use Low Power Mode") {
        const response = await DeviceApi.toggleUseLowPowerMode(props.deviceId);
        if (response.success) {
          settings.value = response.result.settings;
        }
      }
    };

    const setDefaultRecordingWindows = async () => {
      const response = await DeviceApi.setDefaultRecordingWindows(
        props.deviceId
      );
      if (response.success) {
        settings.value = response.result.settings;
      }
    };

    const set24HourRecordingWindows = async () => {
      const response = await DeviceApi.set24HourRecordingWindows(
        props.deviceId
      );
      if (response.success) {
        settings.value = response.result.settings;
      }
    };
    const currentWindowsType = computed(() => {
      if (!settings.value || !settings.value.windows) {
        return "unknown";
      }
      const { powerOn, powerOff, startRecording, stopRecording } =
        settings.value.windows;
      if (
        powerOn === "-30m" &&
        powerOff === "+30m" &&
        startRecording === "-30m" &&
        stopRecording === "+30m"
      ) {
        return "default";
      } else if (
        powerOn === "12:00" &&
        powerOff === "12:00" &&
        startRecording === "12:00" &&
        stopRecording === "12:00"
      ) {
        return "24hour";
      } else {
        return "custom";
      }
    });

    const formatTime = (timeString) => {
      if (timeString[0] === "+" || timeString[0] === "-") {
        return timeString;
      }
      const [hours, minutes] = timeString.split(":");
      return `${hours}:${minutes}`;
    };

    const formatRecordingWindows = (windows: WindowsSettings) => {
      if (!(windows.powerOn && windows.powerOff)) {
        return `Start Recording: ${formatTime(
          windows.startRecording
        )}, Stop Recording: ${formatTime(windows.stopRecording)}`;
      } else {
        return `Power On: ${formatTime(
          windows.powerOn!
        )}, Power Off: ${formatTime(
          windows.powerOff!
        )}, Start Recording: ${formatTime(
          windows.startRecording
        )}, Stop Recording: ${formatTime(windows.stopRecording)}`;
      }
    };

    const useLowPowerMode = computed<boolean>({
      get: () => {
        return (
          (settings.value as ApiDeviceHistorySettings)?.thermalRecording
            ?.useLowPowerMode ?? false
        );
      },
      set: async (val: boolean) => {
        (settings.value as ApiDeviceHistorySettings).thermalRecording = {
          useLowPowerMode: val,
          updated: new Date().toISOString(),
        };
        await DeviceApi.updateDeviceSettings(props.deviceId, settings.value);
      },
    });
    const settingsTable = computed(() => {
      const rows = [
        {
          name: "Use Low Power Mode",
          value: settings.value?.thermalRecording?.useLowPowerMode ?? false,
          synced:
            settings.value?.thermalRecording?.useLowPowerMode !== undefined &&
            settings.value?.synced
              ? "Yes"
              : "No",
        },
        {
          name: "Recording Windows",
          value: settings.value?.windows
            ? formatRecordingWindows(settings.value.windows)
            : "Not set",
          synced: settings.value?.synced ? "Yes" : "No",
        },
      ];

      return rows;
    });

    const deviceModel = ref<"pi" | "tc2">();
    const isTc2Device = computed<boolean>(() => {
      return deviceModel.value === "tc2";
    });
    const defaultWindows = {
      powerOn: "-30m",
      powerOff: "+30m",
      startRecording: "-30m",
      stopRecording: "+30m",
    };
    const savingAudioSettings = ref<boolean>(false);
    const audioMode = computed<AudioModes>({
      get: () => {
        return settings.value?.audioRecording?.audioMode ?? "Disabled";
      },
      set: async (val: AudioModes) => {
        if (settings.value) {
          settings.value.audioRecording = {
            ...settings.value.audioRecording,
            audioMode: val,
            updated: new Date().toISOString(),
          };
          savingAudioSettings.value = true;
          await DeviceApi.updateDeviceSettings(props.deviceId, settings.value);
          savingAudioSettings.value = false;
        }
      },
    });
    const audioModeExplanation = computed<string>(() => {
      debugger;
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
    // Audio Mode Options
    const audioModeOptions = [
      { value: "Disabled", text: "Disabled" },
      { value: "AudioOnly", text: "Audio Only" },
      { value: "AudioAndThermal", text: "Audio and Thermal" },
      { value: "AudioOrThermal", text: "Audio or Thermal" },
    ];
    const recordingWindowSetting = computed<"default" | "always" | "custom">({
      get: () => {
        const s = settings.value as ApiDeviceHistorySettings;
        if (
          s &&
          s.windows &&
          s.windows.startRecording &&
          s.windows.stopRecording
        ) {
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
      set: async (val: "default" | "always" | "custom") => {
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

          await DeviceApi.updateDeviceSettings(props.deviceId, settings.value);
        }
      },
    });

    const customPowerWindowStart = computed<string>({
      get: () => {
        if (settings.value) {
          return (
            (settings.value as ApiDeviceHistorySettings).windows
              ?.startRecording || ""
          );
        } else {
          return "12:00";
        }
      },
      set: async (val: string) => {
        if (settings.value) {
          settings.value.windows = settings.value.windows || {
            ...defaultWindows,
            updated: new Date().toISOString(),
          };
          settings.value.windows.powerOn = val;
          settings.value.windows.updated = new Date().toISOString();
          await DeviceApi.updateDeviceSettings(props.deviceId, settings.value);
        }
      },
    });

    const customPowerWindowStop = computed<string>({
      get: () => {
        if (settings.value) {
          return (
            (settings.value as ApiDeviceHistorySettings).windows
              ?.stopRecording || ""
          );
        } else {
          return "12:00";
        }
      },
      set: async (val: string) => {
        if (settings.value) {
          settings.value.windows = settings.value.windows || {
            ...defaultWindows,
            updated: new Date().toISOString(),
          };
          settings.value.windows.powerOff = val;
          settings.value.windows.updated = new Date().toISOString();
          await DeviceApi.updateDeviceSettings(props.deviceId, settings.value);
        }
      },
    });

    const customRecordingWindowStart = computed<string>({
      get: () => {
        if (settings.value) {
          return (
            (settings.value as ApiDeviceHistorySettings).windows
              ?.startRecording || ""
          );
        } else {
          return "12:00";
        }
      },
      set: async (val: string) => {
        if (settings.value) {
          settings.value.windows = settings.value.windows || {
            ...defaultWindows,
            updated: new Date().toISOString(),
          };
          settings.value.windows.startRecording = val;
          settings.value.windows.updated = new Date().toISOString();
          await DeviceApi.updateDeviceSettings(props.deviceId, settings.value);
        }
      },
    });

    const customRecordingWindowStop = computed<string>({
      get: () => {
        if (settings.value) {
          return (
            (settings.value as ApiDeviceHistorySettings).windows
              ?.stopRecording || ""
          );
        } else {
          return "12:00";
        }
      },
      set: async (val: string) => {
        if (settings.value) {
          settings.value.windows = settings.value.windows || {
            ...defaultWindows,
            updated: new Date().toISOString(),
          };
          settings.value.windows.stopRecording = val;
          settings.value.windows.updated = new Date().toISOString();
          await DeviceApi.updateDeviceSettings(props.deviceId, settings.value);
        }
      },
    });
    const initialized = ref<boolean>(false);

    watch(
      () => audioMode.value,
      async () => {
        if (settings.value) {
          savingAudioSettings.value = true;
          await DeviceApi.updateDeviceSettings(props.deviceId, settings.value);
          savingAudioSettings.value = false;
        }
      }
    );

    onMounted(async () => {
      await fetchSettings();
      initialized.value = true;
      const res = await DeviceApi.getDeviceModel(props.deviceId);
      if (res) {
        deviceModel.value = res;
      }
    });

    return {
      isTc2Device,
      savingAudioSettings,
      audioMode,
      audioModeExplanation,
      audioModeOptions,
      settings,
      currentWindowsType,
      fields,
      showCustomModal,
      useLowPowerMode,
      toggleUseLowPowerMode,
      setDefaultRecordingWindows,
      set24HourRecordingWindows,
      settingsTable,
      recordingWindowSetting,
      customRecordingWindowStart,
      customRecordingWindowStop,
      customPowerWindowStart,
      customPowerWindowStop,
    };
  },
  computed: mapState({
    dayOfSnapshot: function () {
      if (this.software.result.dateTime) {
        return toStringTodayYesterdayOrDate(
          new Date(this.software.result.dateTime)
        );
      }
    },
    timeOfSnapshot: function () {
      if (this.software.result.dateTime) {
        const thisDate = new Date(this.software.result.dateTime);
        return thisDate.toLocaleTimeString();
      }
    },
  }),
});
</script>

<style scoped>
.versions {
  padding-top: 1em;
}

.versions > p {
  padding-top: 1em;
}

.device-settings {
  margin-top: 1em;
}

.synced-status {
  margin-bottom: 1em;
}

.settings-table {
  margin-top: 1em;
}

.btn-group {
  display: flex;
  gap: 0.5em;
}
</style>
