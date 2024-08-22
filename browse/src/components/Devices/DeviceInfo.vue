<template>
  <b-container class="versions" style="padding: 0">
    <b-container v-if="settings">
      <h2 class="mt-4">Device Settings</h2>
      <div class="device-settings mt-3">
        <div><b>Synced:</b> {{ settings.synced ? "Yes" : "No" }}</div>
        <b-table
          :items="settingsTable"
          :fields="fields"
          striped
          hover
          class="settings-table mt-3"
        >
          <template #cell(actions)="row">
            <div v-if="row.item.name === 'Use Low Power Mode'">
              <b-button
                @click="toggleUseLowPowerMode(row.item)"
                variant="secondary"
                >Toggle</b-button
              >
            </div>
            <div v-if="row.item.name === 'Recording Windows'" class="btn-group">
              <b-button
                @click="setDefaultRecordingWindows"
                :variant="
                  currentWindowsType === 'default' ? 'primary' : 'secondary'
                "
                >Default</b-button
              >
              <b-button
                @click="set24HourRecordingWindows"
                :variant="
                  currentWindowsType === '24hour' ? 'primary' : 'secondary'
                "
                >24 Hours</b-button
              >
              <b-button
                @click="enableCustomRecordingWindows"
                :variant="
                  currentWindowsType === 'custom' ? 'primary' : 'secondary'
                "
                >Custom</b-button
              >
            </div>
          </template>
        </b-table>
      </div>
    </b-container>
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
          >Recorded {{ dayOfSnapshot.toLowerCase() }} at {{ timeOfSnapshot }}</i
        >
      </div>
      <p>
        Current released software versions are listed
        <a href="https://github.com/TheCacophonyProject/saltops#branch-prod"
          >here</a
        >.
      </p>
    </div>

    <b-modal
      v-model="showCustomModal"
      title="Custom Recording Windows"
      @ok="handleOk"
      @cancel="handleCancel"
    >
      <b-form
        @submit.stop.prevent="saveCustomRecordingWindows"
        @reset="cancelCustomRecordingWindows"
      >
        <b-form-group label="Power On Time" label-for="power-on-time">
          <b-form-timepicker
            id="power-on-time"
            v-model="customSettings.powerOn"
            required
          ></b-form-timepicker>
        </b-form-group>

        <b-form-group label="Power Off Time" label-for="power-off-time">
          <b-form-timepicker
            id="power-off-time"
            v-model="customSettings.powerOff"
            required
          ></b-form-timepicker>
        </b-form-group>

        <b-form-group
          label="Start Recording Time"
          label-for="start-recording-time"
        >
          <b-form-timepicker
            id="start-recording-time"
            v-model="customSettings.startRecording"
            required
          ></b-form-timepicker>
        </b-form-group>

        <b-form-group
          label="Stop Recording Time"
          label-for="stop-recording-time"
        >
          <b-form-timepicker
            id="stop-recording-time"
            v-model="customSettings.stopRecording"
            required
          ></b-form-timepicker>
        </b-form-group>

        <b-button type="submit" variant="primary" class="d-none">Save</b-button>
        <b-button type="reset" variant="secondary" class="d-none"
          >Cancel</b-button
        >
      </b-form>
    </b-modal>
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
} from "@vue/composition-api";
import DeviceApi from "@/api/Device.api";
import { WindowsSettings } from "@typedefs/api/device";

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
    const settings = ref(null);
    const fields = [
      { key: "name", label: "Setting" },
      { key: "value", label: "Value" },
      { key: "actions", label: "Actions" },
    ];

    const showCustomModal = ref(false);
    const customSettings = ref({
      powerOn: null,
      powerOff: null,
      startRecording: null,
      stopRecording: null,
    });

    const fetchSettings = async () => {
      try {
        const response = await DeviceApi.getDeviceSettings(props.deviceId);
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

    const enableCustomRecordingWindows = () => {
      const windows = settings.value.windows;
      customSettings.value = {
        powerOn: windows.powerOn,
        powerOff: windows.powerOff,
        startRecording: windows.startRecording,
        stopRecording: windows.stopRecording,
      };
      showCustomModal.value = true;
    };

    const handleOk = (bvModalEvent) => {
      bvModalEvent.preventDefault();
      saveCustomRecordingWindows(bvModalEvent);
    };

    const handleCancel = (bvModalEvent) => {
      bvModalEvent.preventDefault();
      cancelCustomRecordingWindows(bvModalEvent);
    };

    const saveCustomRecordingWindows = async (event) => {
      event.preventDefault();
      const response = await DeviceApi.setCustomRecordingWindows(
        props.deviceId,
        customSettings.value
      );
      if (response.success) {
        settings.value = response.result.settings;
      }
      showCustomModal.value = false;
    };

    const cancelCustomRecordingWindows = (event) => {
      event.preventDefault();
      showCustomModal.value = false;
    };

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

    onMounted(async () => {
      await fetchSettings();
    });

    return {
      settings,
      currentWindowsType,
      fields,
      showCustomModal,
      customSettings,
      toggleUseLowPowerMode,
      setDefaultRecordingWindows,
      set24HourRecordingWindows,
      enableCustomRecordingWindows,
      saveCustomRecordingWindows,
      cancelCustomRecordingWindows,
      handleOk,
      handleCancel,
      settingsTable,
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

.versions p {
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
