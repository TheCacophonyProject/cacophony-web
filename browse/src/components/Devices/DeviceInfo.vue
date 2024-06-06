<template>
  <b-container class="versions" style="padding: 0">
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
    <h2 class="mt-4">Device Settings</h2>
    <div v-if="settings" class="device-settings mt-3">
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
            <b-button @click="toggleSetting(row.item)" variant="secondary"
              >Toggle</b-button
            >
          </div>
          <div v-if="row.item.name === 'Recording Windows'" class="btn-group">
            <b-button @click="setDefaultRecordingWindows" variant="secondary"
              >Default</b-button
            >
            <b-button @click="set24HourRecordingWindows" variant="secondary"
              >24 Hours</b-button
            >
            <b-button @click="enableCustomRecordingWindows" variant="secondary"
              >Custom</b-button
            >
          </div>
        </template>
      </b-table>
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
      const response = await DeviceApi.getDeviceSettings(props.deviceId);
      if (response.success) {
        settings.value = response.result.settings;
      }
    };

    const toggleSetting = async (setting) => {
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
      const [hours, minutes] = timeString.split(":");
      return `${hours}:${minutes}`;
    };

    const formatRecordingWindows = (windows) => {
      return `Power On: ${formatTime(windows.powerOn)}, Power Off: ${formatTime(
        windows.powerOff
      )}, Start Recording: ${formatTime(
        windows.startRecording
      )}, Stop Recording: ${formatTime(windows.stopRecording)}`;
    };

    const settingsTable = computed(() => {
      if (!settings.value) {
        return [];
      }

      const rows = [];
      if (settings.value.thermalRecording) {
        rows.push({
          name: "Use Low Power Mode",
          value: settings.value.thermalRecording.useLowPowerMode,
          synced: settings.value.synced ? "Yes" : "No",
        });
      }
      if (settings.value.windows) {
        rows.push({
          name: "Recording Windows",
          value: formatRecordingWindows(settings.value.windows),
          synced: settings.value.synced ? "Yes" : "No",
        });
      }
      return rows;
    });

    onMounted(() => {
      fetchSettings();
    });

    return {
      settings,
      fields,
      showCustomModal,
      customSettings,
      toggleSetting,
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
