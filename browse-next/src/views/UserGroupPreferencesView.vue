<script setup lang="ts">
import {
  computed,
  type ComputedRef,
  inject,
  onBeforeMount,
  type Ref,
  ref,
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
  activeLocations,
  allHistoricLocations,
} from "@models/provides";

import type {
  AlertId,
  StationId as LocationId,
  GroupId as ProjectId,
  DeviceId,
} from "@typedefs/api/common";
import type { SelectedProject } from "@models/LoggedInUser.ts";
import HierarchicalTagSelect from "@/components/HierarchicalTagSelect.vue";
import Multiselect from "@vueform/multiselect";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import type { ApiDeviceResponse } from "@typedefs/api/device";
import type { LoadedResource } from "@api/types.ts";

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
const selectedLocation = ref<ApiLocationResponse | null>(null);
const selectedDevice = ref<ApiDeviceResponse | null>(null);
const creatingAlert = ref<boolean>(false);
const loadingAlerts = ref<boolean>(false);

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
    return !!activeDevices.value.find((device) => device.id === alert.scopeId);
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
    scopeId.value,
    alertOnTags.value,
    Math.max(1, maxAlertFrequencyMins.value) * 60
  );
  resetFormFields();
  await loadAlerts();
  creatingAlert.value = false;
};

// TODO: Inject locations and devices at the top level, since we want these everywhere, and there shouldn't be super large numbers.
interface AlertItem {
  alertOn: string[];
  alertScope: "This project" | ApiLocationResponse | ApiDeviceResponse;
  lastTriggered: string;
  minimumTimeBetweenTriggers: string;
  __scope: "project" | "device" | "location";
  _deleteAction: AlertId;
}

const alertItems = computed<AlertItem[]>(() => {
  // TODO: Could resolve alert scope into Location, Project or device name.

  const getAlertScope = (alert: ApiAlertResponse) => {
    if (alert.scope === "project") {
      return "This project";
    } else if (alert.scope === "device" && activeDevices.value.length !== 0) {
      const device = activeDevices.value.find(
        (device) => device.id === alert.scopeId
      );
      if (device) {
        return device;
      }
      return null;
    } else if (
      alert.scope === "location" &&
      activeLocations.value.length !== 0
    ) {
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
        class="me-1 fs-8"
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
          {{ cell.name }}
        </span>
      </div>
      <div v-else-if="row.__scope === 'device' && cell">
        <device-name :name="cell.deviceName" :type="cell.type" />
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
                {{ card.alertScope.name }}
              </span>
            </span>
            <span v-else-if="card.__scope === 'device'">
              <device-name
                :name="card.alertScope.deviceName"
                :type="card.alertScope.type"
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
  <hr />
  <div class="d-flex justify-content-end">
    <b-button @click="selectedAddEmailAlert = true">
      <font-awesome-icon icon="plus" /> Create an email alert
    </b-button>
  </div>

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

  <!--  <h6 class="mt-4">TODO</h6>-->
  <!--  <ul>-->
  <!--    <li>My preferred tags for video, audio?</li>-->
  <!--  </ul>-->

  <leave-project-modal v-model="selectedLeaveProject" />
  <button
    class="btn btn-outline-danger"
    type="button"
    @click="selectedLeaveProject = true"
    v-if="!isNotOnlyProjectOwnerOrAdmin"
  >
    Leave this project
  </button>
</template>
<style src="@vueform/multiselect/themes/default.css"></style>
