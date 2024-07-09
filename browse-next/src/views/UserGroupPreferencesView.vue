<script setup lang="ts">
import {
  computed,
  type ComputedRef,
  inject,
  onBeforeMount,
  onMounted,
  type Ref,
  ref,
  watch,
} from "vue";
import SectionHeader from "@/components/SectionHeader.vue";
import type { ApiAlertResponse } from "@typedefs/api/alerts";
import {
  createAlertForScope,
  getAlertsForCurrentUser,
  removeAlert,
} from "@api/Alert";
import LeaveProjectModal from "@/components/LeaveProjectModal.vue";
import TwoStepActionButton from "@/components/TwoStepActionButton.vue";
import DeviceName from "@/components/DeviceName.vue";
import CardTable from "@/components/CardTable.vue";
import { DateTime } from "luxon";
import {
  currentSelectedProject as currentActiveProject,
  selectedProjectDevices,
  allHistoricLocations,
} from "@models/provides";

import type {
  AlertId,
  StationId as LocationId,
  GroupId as ProjectId,
  DeviceId,
} from "@typedefs/api/common";
import {
  persistUserProjectSettings,
  type SelectedProject,
} from "@models/LoggedInUser.ts";
import HierarchicalTagSelect from "@/components/HierarchicalTagSelect.vue";
import Multiselect from "@vueform/multiselect";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import type { ApiDeviceResponse } from "@typedefs/api/device";
import type { LoadedResource } from "@api/types.ts";
import { type ApiGroupUserSettings as ApiProjectUserSettings } from "@typedefs/api/group";

const currentProject = inject(currentActiveProject) as ComputedRef<
  SelectedProject | false
>;
const activeDevices = inject(selectedProjectDevices) as Ref<
  LoadedResource<ApiDeviceResponse[]>
>;
const allLocations = inject(allHistoricLocations) as Ref<
  LoadedResource<ApiLocationResponse[]>
>;

const activeLocations = computed<ApiLocationResponse[]>(() => {
  if (allLocations.value) {
    return allLocations.value.filter((location) => !location.retiredAt);
  }
  return [];
});

const selectedLeaveProject = ref(false);
const alerts = ref<ApiAlertResponse[]>([]);
const isNotOnlyProjectOwnerOrAdmin = ref<true>(true);
const selectedAddEmailAlert = ref(false);
const alertOnTags = ref<string[]>([]);
const maxAlertFrequencyMins = ref<number>(30);
const alertScope = ref<"project" | "location" | "device">("project");
const selectedLocation = ref<LocationId | null>(null);
const selectedDevice = ref<DeviceId | null>(null);
const creatingAlert = ref<boolean>(false);
const loadingAlerts = ref<boolean>(false);

const userProjectSettings = computed<ApiProjectUserSettings>(() => {
  return (
    (currentProject.value as SelectedProject).userSettings || {
      displayMode: "visits",
      tags: [],
      notificationPreferences: {},
    }
  );
});
const weeklyDigestEmails = ref<boolean>(false);
const dailyDigestEmails = ref<boolean>(false);
const stoppedDeviceEmails = ref<boolean>(false);
const savingDailyDigestSettings = ref<boolean>(false);
const savingWeeklyDigestSettings = ref<boolean>(false);
const savingStoppedDeviceSettings = ref<boolean>(false);
const initialised = ref<boolean>(false);
onBeforeMount(() => {
  weeklyDigestEmails.value =
    userProjectSettings.value.notificationPreferences?.weeklyDigest || false;
  dailyDigestEmails.value =
    userProjectSettings.value.notificationPreferences?.dailyDigest || false;
  // TODO: Set this to true in the DB for all group admins who currently have emailConfirmed
  stoppedDeviceEmails.value =
    userProjectSettings.value.notificationPreferences?.reportStoppedDevices ||
    false;
});
onMounted(() => {
  initialised.value = true;
});

watch(dailyDigestEmails, async (next) => {
  if (initialised.value) {
    const settings = JSON.parse(JSON.stringify(userProjectSettings.value));
    settings.notificationPreferences = settings.notificationPreferences || {};
    settings.notificationPreferences.dailyDigest = next;
    savingDailyDigestSettings.value = true;
    await persistUserProjectSettings(settings);
    savingDailyDigestSettings.value = false;
  }
});

watch(weeklyDigestEmails, async (next) => {
  if (initialised.value) {
    const settings = JSON.parse(JSON.stringify(userProjectSettings.value));
    settings.notificationPreferences = settings.notificationPreferences || {};
    settings.notificationPreferences.weeklyDigest = next;
    savingWeeklyDigestSettings.value = true;
    await persistUserProjectSettings(settings);
    savingWeeklyDigestSettings.value = false;
  }
});

watch(stoppedDeviceEmails, async (next) => {
  if (initialised.value) {
    const settings = JSON.parse(JSON.stringify(userProjectSettings.value));
    settings.notificationPreferences = settings.notificationPreferences || {};
    settings.notificationPreferences.reportStoppedDevices = next;
    savingStoppedDeviceSettings.value = true;
    await persistUserProjectSettings(settings);
    savingStoppedDeviceSettings.value = false;
  }
});

const formIsValid = computed<boolean>(() => {
  return alertOnTags.value.length !== 0 && scopeId.value !== null;
});
const scopeId = computed<LocationId | ProjectId | DeviceId | null>(() => {
  if (alertScope.value === "project" && currentProject.value) {
    return currentProject.value.id;
  } else if (
    alertScope.value === "location" &&
    selectedLocation.value !== null
  ) {
    return selectedLocation.value;
  } else if (alertScope.value === "device" && selectedDevice.value !== null) {
    return selectedDevice.value;
  }
  return null;
});

const alertBelongsToCurrentProject = (alert: ApiAlertResponse): boolean => {
  if (alert.scope === "project" && currentProject.value) {
    return alert.scopeId === currentProject.value.id;
  } else if (alert.scope === "location") {
    return !!activeLocations.value.find(
      (location) => location.id === alert.scopeId
    );
  } else if (alert.scope === "device") {
    return (
      (activeDevices.value &&
        !!activeDevices.value.find((device) => device.id === alert.scopeId)) ||
      false
    );
  }
  return false;
};

const loadAlerts = async () => {
  loadingAlerts.value = true;
  const response = await getAlertsForCurrentUser();
  if (response.success) {
    alerts.value = response.result.alerts.filter(alertBelongsToCurrentProject);
  }
  loadingAlerts.value = false;
};

onBeforeMount(async () => {
  await loadAlerts();
});

const deleteAlert = async (alertId: AlertId) => {
  await removeAlert(alertId);
  await loadAlerts();
};
const resetFormFields = () => {
  alertScope.value = "project";
  selectedDevice.value = null;
  selectedLocation.value = null;
  alertOnTags.value = [];
  maxAlertFrequencyMins.value = 30;
};

const saveAlert = async () => {
  creatingAlert.value = true;
  await createAlertForScope(
    alertScope.value,
    scopeId.value as number,
    alertOnTags.value,
    Math.max(1, maxAlertFrequencyMins.value) * 60
  );
  resetFormFields();
  await loadAlerts();
  creatingAlert.value = false;
};

interface AlertItem {
  alertOn: string[];
  alertScope: "This project" | ApiLocationResponse | ApiDeviceResponse | null;
  lastTriggered: string;
  minimumTimeBetweenTriggers: string;
  __scope: "project" | "device" | "location";
  _deleteAction: AlertId;
}

const getAlertScope = (
  alert: ApiAlertResponse
): "This project" | ApiDeviceResponse | ApiLocationResponse | null => {
  if (alert.scope === "project") {
    return "This project";
  } else if (
    alert.scope === "device" &&
    activeDevices.value &&
    activeDevices.value.length !== 0
  ) {
    const device = activeDevices.value.find(
      (device) => device.id === alert.scopeId
    );
    if (device) {
      return device;
    }
    return null;
  } else if (alert.scope === "location" && activeLocations.value.length !== 0) {
    const location = activeLocations.value.find(
      (location) => location.id === alert.scopeId
    );
    if (location) {
      return location;
    }
    return null;
  }
  return null;
};

const alertItems = computed<AlertItem[]>(() => {
  return alerts.value.map((alert: ApiAlertResponse) => ({
    alertOn: alert.conditions.map(({ tag }) => tag),
    alertScope: getAlertScope(alert),
    lastTriggered:
      alert.lastAlert === "never"
        ? alert.lastAlert
        : DateTime.fromJSDate(new Date(alert.lastAlert)).toRelative(),
    minimumTimeBetweenTriggers: `${alert.frequencySeconds / 60} mins`,
    __scope: alert.scope,
    _deleteAction: alert.id,
  }));
});
</script>
<template>
  <section-header>My project preferences</section-header>
  <h6>Email alert settings</h6>
  <p>
    Email alerts are sent whenever the Cacophony AI recognises something that
    you're interested in for a newly processed recording.
  </p>
  <div v-if="loadingAlerts" class="d-flex justify-content-center pb-3">
    <b-spinner variant="secondary" />
  </div>
  <card-table v-else :items="alertItems" compact :break-point="0">
    <template #alertOn="{ cell }">
      <b-badge
        v-for="(tag, index) in cell"
        :key="index"
        class="me-1 fs-8 my-1"
        variant="secondary"
        >{{ tag }}</b-badge
      >
    </template>
    <template
      #alertScope="{
        cell,
        row,
      }: {
        row: AlertItem,
        cell: string | ApiDeviceResponse | ApiLocationResponse,
      }"
    >
      <div v-if="row.__scope === 'project'">{{ cell }}</div>
      <div
        v-else-if="row.__scope === 'location' && cell"
        class="station-name text-truncate d-inline-flex align-content-center align-items-center"
      >
        <font-awesome-icon
          icon="map-marker-alt"
          class="me-2"
          color="rgba(0, 0, 0, 0.7)"
        />
        <span class="text-truncate" ref="stationNameSpan">
          {{ (cell as ApiLocationResponse).name }}
        </span>
      </div>
      <div v-else-if="row.__scope === 'device' && cell">
        <device-name
          :name="(cell as ApiDeviceResponse).deviceName"
          :type="(cell as ApiDeviceResponse).type"
        />
      </div>
    </template>
    <template #_deleteAction="{ cell }">
      <div class="d-flex align-items-center justify-content-end">
        <two-step-action-button
          class="text-end"
          variant="outline-secondary"
          :action="() => deleteAlert(cell)"
          icon="trash-can"
          confirmation-label="Remove alert"
          :classes="[
            'd-flex',
            'align-items-center',
            'fs-7',
            'text-nowrap',
            'ms-2',
          ]"
          alignment="right"
        />
      </div>
    </template>
    <template #card="{ card }: { card: AlertItem }">
      <div class="d-flex flex-row">
        <div class="flex-grow-1">
          <div class="d-flex align-items-center">
            <span class="me-2">Trigger on: </span>
            <b-badge
              v-for="(tag, index) in card.alertOn"
              :key="index"
              class="me-1 fs-8"
              variant="secondary"
              >{{ tag }}</b-badge
            >
          </div>
          <div class="mt-2">
            <span>Alert scope: </span>
            <span v-if="card.__scope === 'project'">{{ card.alertScope }}</span>
            <span
              v-else-if="card.__scope === 'location' && card.alertScope"
              class="station-name text-truncate d-inline-flex align-content-center align-items-center"
            >
              <font-awesome-icon
                icon="map-marker-alt"
                class="me-2"
                color="rgba(0, 0, 0, 0.7)"
              />
              <span class="text-truncate" ref="stationNameSpan">
                {{ (card.alertScope as ApiLocationResponse).name }}
              </span>
            </span>
            <span v-else-if="card.__scope === 'device'">
              <device-name
                :name="(card.alertScope as ApiDeviceResponse).deviceName"
                :type="(card.alertScope as ApiDeviceResponse).type"
              />
            </span>
          </div>
          <div class="mt-2">
            Last triggered: <strong v-html="card.lastTriggered"></strong>
          </div>
          <div class="mt-2">
            <span>Minimum time between triggers: </span>
            {{ card.minimumTimeBetweenTriggers }}
          </div>
        </div>
        <div class="d-flex align-items-end justify-content-end">
          <two-step-action-button
            class="text-end"
            variant="outline-secondary"
            :action="() => deleteAlert(card._deleteAction)"
            icon="trash-can"
            confirmation-label="Remove alert"
            :classes="[
              'd-flex',
              'align-items-center',
              'fs-7',
              'text-nowrap',
              'ms-2',
            ]"
            alignment="right"
          />
        </div>
      </div>
    </template>
  </card-table>
  <div class="d-flex justify-content-end mt-3">
    <b-button @click="selectedAddEmailAlert = true">
      <font-awesome-icon icon="plus" /> Create an email alert
    </b-button>
  </div>
  <hr />

  <h6>Project activity digest email preferences</h6>
  <p>
    Get daily or weekly break-downs of activity in your project &ndash; direct
    to your inbox.
  </p>
  <b-form-checkbox switch v-model="dailyDigestEmails"
    >I want to receive a daily activity digest<b-spinner
      class="ms-1"
      v-if="savingDailyDigestSettings"
      variant="secondary"
      small
  /></b-form-checkbox>
  <b-form-checkbox switch v-model="weeklyDigestEmails"
    >I want to receive a weekly activity digest<b-spinner
      class="ms-1"
      v-if="savingWeeklyDigestSettings"
      variant="secondary"
      small
  /></b-form-checkbox>
  <hr />
  <h6>Stopped device notifications</h6>
  <p>
    Get notified about possible flat batteries when a device hasn't connected to
    the Cacophony Monitoring platform in the last 24 hours
  </p>
  <b-form-checkbox switch v-model="stoppedDeviceEmails"
    >I want to receive emails about devices that might have stopped<b-spinner
      class="ms-1"
      v-if="savingStoppedDeviceSettings"
      variant="secondary"
      small
  /></b-form-checkbox>

  <b-modal
    v-model="selectedAddEmailAlert"
    @ok="saveAlert"
    title="Add an email alert"
    ok-title="Save alert"
    :ok-disabled="!formIsValid"
    @cancel="resetFormFields"
  >
    <div>
      <label class="fs-7">Alert scope:</label>
      <b-form-radio-group v-model="alertScope">
        <b-form-radio value="project">This project</b-form-radio>
        <b-form-radio value="location">A specific location</b-form-radio>
        <b-form-radio value="device">A specific device</b-form-radio>
      </b-form-radio-group>
      <multiselect
        v-if="alertScope === 'location'"
        ref="selectedLocationSelect"
        v-model="selectedLocation"
        :options="activeLocations"
        value-prop="id"
        label="name"
        :can-clear="false"
        class="ms-bootstrap"
        searchable
      />
      <multiselect
        v-else-if="alertScope === 'device'"
        ref="selectedDeviceSelect"
        v-model="selectedDevice"
        value-prop="id"
        label="deviceName"
        :options="activeDevices"
        :can-clear="false"
        class="ms-bootstrap"
        searchable
      />
    </div>
    <div class="mt-1">
      <label class="fs-7">Alert on:</label>
      <hierarchical-tag-select v-model="alertOnTags" multiselect />
    </div>
    <div class="mt-1">
      <label class="fs-7"
        >Alert no more than once every
        <strong>{{ maxAlertFrequencyMins }}</strong> minutes</label
      >
      <b-form-input
        v-model="maxAlertFrequencyMins"
        type="number"
        min="1"
      ></b-form-input>
    </div>
  </b-modal>
  <div v-if="false && !isNotOnlyProjectOwnerOrAdmin">
    <!--  TODO - Let users leave a group of their own accord  -->
    <hr />
    <h6>Leave project</h6>
    <p>
      If you no longer want to be part of this project, click here to leave it.
    </p>
    <leave-project-modal v-model="selectedLeaveProject" />
    <button
      class="btn btn-outline-danger"
      type="button"
      @click="selectedLeaveProject = true"
      v-if="!isNotOnlyProjectOwnerOrAdmin"
    >
      Leave this project
    </button>
  </div>
</template>
<style src="@vueform/multiselect/themes/default.css"></style>
