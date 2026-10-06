<script setup lang="ts">
import SectionHeader from "@/components/SectionHeader.vue";
import {
  BBadge,
  BButton,
  BFormInput,
  BModal,
  BPopover,
  BSpinner,
} from "bootstrap-vue-next";
import MapWithPoints from "@/components/MapWithPoints.vue";
import { computed, inject, onBeforeMount, type Ref, ref, watch } from "vue";
import { useIntervalFn, useWindowSize } from "@vueuse/core";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";
import CardTable from "@/components/CardTable.vue";
import DeviceName from "@/components/DeviceName.vue";
import LocationName from "@/components/LocationName.vue";
import { DeviceActionStatus, DeviceType } from "@typedefs/api/consts.ts";
import { ClientApi } from "@/api";
import {
  allHistoricLocations,
  currentSelectedProject,
} from "@models/provides.ts";
import {
  CurrentProjectHasFailedTrapActions,
  CurrentProjectHasPendingTrapActions,
  type SelectedProject,
  urlNormalisedCurrentProjectName,
} from "@models/LoggedInUser.ts";
import type {
  ActionStatus,
  ApiDeviceAction,
  ApiDeviceHistorySettings,
  ApiDeviceResponse,
  DeviceActionDecision,
} from "@typedefs/api/device";
import { locationNameForDevice } from "@/helpers/Location.ts";
import type { LoadedResource } from "@apiClient/types.ts";
import type { ApiStationResponse } from "@typedefs/api/station";
import { urlNormaliseName } from "@/utils.ts";
import type { DeviceId, LatLng, RecordingId } from "@typedefs/api/common";
import { DateTime } from "luxon";
import CptvPlayer from "@/components/cptv-player/CptvPlayer.vue";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import type { NamedPoint } from "@models/mapUtils";

const projectHasTraps = computed<boolean>(() => {
  return traps.value.length !== 0;
});
const selectedProject = inject(currentSelectedProject) as Ref<SelectedProject>;
const allLocations = inject(allHistoricLocations) as Ref<
  LoadedResource<ApiStationResponse[]>
>;
const { width: windowWidth } = useWindowSize();
const loading = ref<boolean>(false);
const mapBuffer = ref<HTMLDivElement | null>(null);

const mapWidthPx = computed<number>(() => {
  if (mapBuffer.value === null) {
    return 0;
  }
  const mapBufferWidth = mapBuffer.value!.offsetWidth;
  if (windowWidth.value >= 992) {
    return mapBufferWidth;
  }
  return 0;
});

const trapDevices = ref<
  {
    device: ApiDeviceResponse;
    settings: ApiDeviceHistorySettings;
    action?: ApiDeviceAction;
  }[]
>([]);

const descriptionForAction = (action: DeviceActionDecision): string => {
  switch (action) {
    case "dispatch":
      return "Open kill trap door";
    case "hold":
      return "Open holding cage door";
    case "more-info":
      // This would be to ask the device to send more recordings for additional context about the animal that's been
      // seen and trapped
      return "Request more info";
    case "release":
      return "Release";
    case "wait":
      return "Extend deadline for auto-release by 24hrs";
  }
};

const doAction = async (
  entry: TrapActionEntry,
  action: DeviceActionDecision,
) => {
  if (!entry.actionUuid) {
    return;
  }
  const response = await ClientApi.Devices.confirmDeviceActionRequest(
    entry.deviceId,
    entry.actionUuid,
    action,
  );
  if (response.success) {
    const trapDevice = trapDevices.value.find(
      ({ device }) => device.id === entry.deviceId,
    );
    if (trapDevice && trapDevice.action) {
      trapDevice.action.status = DeviceActionStatus.responded;
    }
  }
};

const takeAction = async (
  entry: TrapActionEntry,
  action: DeviceActionDecision,
) => {
  if (action === "dispatch") {
    // Killing the animal in the trap is a destructive action, so requires
    // an extra confirmation step before it's sent to the device.
    showKillConfirmationModal.value = true;
    return;
  }
  await doAction(entry, action);
  showTrapActionsModal.value = false;
};

const latestActiveActionForDevice = (
  actions: ApiDeviceAction[],
  deviceId: DeviceId,
): ApiDeviceAction | undefined => {
  // The actions endpoint returns the full action history for every device,
  // not just outstanding ones, so there can be more than one action per
  // device (e.g. from previous trap triggers). Pick the most recently
  // updated one, and treat a "completed" action as though there's no active
  // action at all, rather than showing stale "trap triggered" info forever.
  const deviceActions = actions
    .filter((a) => a.deviceId === deviceId)
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  const latest = deviceActions[0];
  if (latest && latest.status !== DeviceActionStatus.completed) {
    return latest;
  }
  return undefined;
};

const refreshTrapActions = async () => {
  const [actions, devicesResponse] = await Promise.all([
    ClientApi.Projects.getPendingDeviceActionRequests(selectedProject.value.id),
    ClientApi.Projects.getDevicesWithActiveTrapsForProject(
      selectedProject.value.id,
    ),
  ]);
  if (devicesResponse.success && actions) {
    trapDevices.value = devicesResponse.result.devices.map((device, index) => {
      return {
        device,
        settings: devicesResponse.result.settings[index],
        action: latestActiveActionForDevice(actions, device.id),
      };
    });
  }
};

onBeforeMount(async () => {
  loading.value = true;
  await refreshTrapActions();
  loading.value = false;
});

// Once an action reaches one of these, the device can't transition it any
// further (enforced server-side too) - "completed" actions are dropped
// entirely (see below), while "failed" ones are left in place indefinitely,
// since a failure should keep showing until a new action supersedes it. In
// both cases there's no point in continuing to poll for a status change.
const TERMINAL_ACTION_STATUSES: ActionStatus[] = [
  DeviceActionStatus.completed,
  DeviceActionStatus.failed,
];

const pollActiveTrapActionStatuses = async () => {
  // Rather than re-fetching the full device/action list for the whole
  // project on every tick, only ask about the specific actions we already
  // know are active - much cheaper when there are few (or zero) of them.
  // This means a brand new trap trigger on a device that currently has no
  // active action won't be picked up until the next full refresh (e.g. a
  // page reload) - only status changes on already-known actions are polled.
  const activeEntries = trapDevices.value.filter(
    (trapDevice) =>
      !!trapDevice.action &&
      !TERMINAL_ACTION_STATUSES.includes(trapDevice.action.status),
  );
  if (activeEntries.length === 0) {
    return;
  }
  await Promise.all(
    activeEntries.map(async ({ device, action }) => {
      const updated = await ClientApi.Devices.getDeviceActionRequest(
        device.id,
        (action as ApiDeviceAction).uuid,
      );
      if (!updated) {
        return;
      }
      const trapDevice = trapDevices.value.find(
        (d) => d.device.id === device.id,
      );
      if (
        !trapDevice ||
        !trapDevice.action ||
        trapDevice.action.uuid !== updated.uuid
      ) {
        // The action has moved on since we started this poll (e.g. the user
        // just took an action, or a new trigger replaced it) - don't clobber
        // it with a possibly-stale result.
        return;
      }
      if (updated.status === DeviceActionStatus.completed) {
        // A completed action is no longer "active" - treat the trap as
        // though it has no outstanding action, rather than continuing to
        // show stale "trap triggered" info forever.
        trapDevice.action = undefined;
      } else {
        trapDevice.action = { ...trapDevice.action, status: updated.status };
      }
    }),
  );
};

// While the traps page is open, keep polling for updates - e.g. a device
// acknowledging or completing an action - so the UI reflects the current
// state without needing a manual page refresh. The interval is much shorter
// in e2e test builds so tests don't need to wait out a production-length delay.
const TRAP_ACTION_POLL_INTERVAL_MS =
  import.meta.env.VITE_ENVIRONMENT === "E2E" ? 1500 : 30000;
const { pause: pauseTrapActionPolling, resume: resumeTrapActionPolling } =
  useIntervalFn(pollActiveTrapActionStatuses, TRAP_ACTION_POLL_INTERVAL_MS);

const trapIsMisconfigured = (settings: ApiDeviceHistorySettings): boolean => {
  if (settings.thermalRecording?.useLowPowerMode) {
    return true;
  }
  return false;
};

interface TrapActionEntry {
  deviceName: string;
  deviceId: DeviceId;
  location: string;
  misconfigured: boolean;
  actionPending: boolean;
  actionResponded: boolean;
  actionAcknowledged: boolean;
  actionFailed: boolean;
  actionUuid?: string;
  availableActions?: DeviceActionDecision[];
  recordingId?: RecordingId;
  captureTime?: DateTime;
  timeUntilAutomaticRelease?: DateTime;
}

const traps = computed(() => {
  return trapDevices.value.map(({ device, settings, action }) => {
    const result: TrapActionEntry = {
      deviceName: device.deviceName,
      deviceId: device.id,
      location: locationNameForDevice(device, allLocations.value || []),
      misconfigured: trapIsMisconfigured(settings),
      actionPending:
        !!action &&
        (action.status === "pending" || action.status === "requested"),
      actionResponded: !!action && action.status === "responded",
      actionAcknowledged: !!action && action.status === "acknowledged",
      actionFailed: !!action && action.status === "failed",
    };
    if (action) {
      // Stuff about the recent actions for this device.
      result.captureTime = DateTime.fromJSDate(
        new Date(action.history[0].dateTime),
      );
      const oneDayMs = 24 * 60 * 60 * 1000;
      result.timeUntilAutomaticRelease = DateTime.fromJSDate(
        new Date(new Date(action.history[0].dateTime).getTime() + oneDayMs),
      );
      result.actionUuid = action.uuid;
      if (action.recordingId) {
        result.recordingId = action.recordingId;
      }
      if (action.history.length > 0) {
        result.availableActions = action.history[0].availableActions;
      }
    }
    return result;
  });
});

// Keep the main nav's pending/failed trap action indicators in sync with
// what's actually shown here, so taking action on the last pending item (or
// a failure being resolved by a new trigger) is reflected immediately,
// rather than needing a page reload to be picked up (they're otherwise only
// refreshed on project switch).
watch(
  traps,
  (currentTraps) => {
    CurrentProjectHasPendingTrapActions.value = currentTraps.some(
      (trap) => trap.actionPending,
    );
    CurrentProjectHasFailedTrapActions.value = currentTraps.some(
      (trap) => trap.actionFailed,
    );
  },
  { immediate: true },
);

const trapDeviceLocations = computed<NamedPoint[]>(() => {
  return trapDevices.value
    .filter(({ device }) => device.location !== undefined)
    .map(({ device }) => {
      return {
        id: device.id,
        name: device.deviceName,
        project: device.groupName,
        location: device.location as LatLng,
        locationName: locationNameForDevice(device, allLocations.value || []),
        type: "device",
      };
    });
});

const selectedAction = ref<TrapActionEntry | null>(null);
const selectedActionRecording = ref<ApiRecordingResponse | null>(null);
const selectedActionRecordingReady = ref<boolean>(false);
const showTrapActionsModal = ref<boolean>(false);
const showKillConfirmationModal = ref<boolean>(false);

watch(selectedAction, async (newVal) => {
  if (newVal) {
    // Pause background polling while a trap action is open in the modal -
    // otherwise a poll landing mid-view could replace `trapDevices` (and
    // thus the objects `selectedAction` was set from) while the modal is
    // still referencing the old snapshot.
    pauseTrapActionPolling();
    showTrapActionsModal.value = true;
    selectedActionRecording.value = null;
    selectedActionRecordingReady.value = false;
    if (newVal.recordingId) {
      // The player needs the full recording object (not just its id) to be
      // able to seek to the start of a track once it's finished loading.
      const recording = await ClientApi.Recordings.getRecordingById(
        newVal.recordingId,
      );
      // Guard against the user having selected a different (or no) trap
      // action while this request was in flight.
      if (recording && selectedAction.value === newVal) {
        selectedActionRecording.value = recording;
      }
    }
  } else {
    showTrapActionsModal.value = false;
    selectedActionRecording.value = null;
    selectedActionRecordingReady.value = false;
    resumeTrapActionPolling();
  }
});

const killConfirmationInput = ref<string>("");

const confirmKill = async () => {
  if (selectedAction.value) {
    await doAction(selectedAction.value, "dispatch");
  }
  killConfirmationInput.value = "";
  showTrapActionsModal.value = false;
  showKillConfirmationModal.value = false;
};
</script>

<template>
  <div class="d-flex flex-column flex-fill">
    <section-header>
      <span
        ><span class="d-none d-sm-inline-block">High Interaction Rate</span>
        Traps</span
      ></section-header
    >
    <div v-if="loading" class="d-flex align-items-center flex-column flex-fill">
      <div class="d-flex align-items-center flex-fill">
        <b-spinner variant="secondary" />
      </div>
    </div>
    <div
      v-else
      class="d-flex flex-fill justify-content-between"
      ref="trapsContainer"
    >
      <div class="d-flex flex-column-reverse justify-content-between flex-fill">
        <div
          v-if="!projectHasTraps"
          class="d-flex flex-fill justify-content-center align-items-center"
        >
          <div
            class="no-results text-body-tertiary d-flex flex-column text-center col col-12 col-md-10 col-lg-7"
          >
            <h4 class="h5 mb-2">This project has no traps</h4>
            <p>
              If you have a trap, connect it to a device and configure it under
              devices settings.
            </p>
          </div>
        </div>
        <div
          v-else
          class="col col-12 col-lg-9 col-xl-8 col-xxl-7 d-flex flex-fill flex-column me-md-3 mt-4 mt-lg-0"
        >
          <h3 class="h4 mb-3">Enabled traps</h3>

          <card-table
            compact
            :max-card-width="2000"
            standalone
            :items="traps"
            class="mb-4"
          >
            <template #card="{ card: trap }: { card: TrapActionEntry }">
              <div
                class="d-flex flex-column flex-md-row"
                :data-cy="`trap ${trap.deviceName}`"
              >
                <div class="flex-grow-1">
                  <div
                    class="d-flex align-items-start justify-content-between mb-2"
                  >
                    <span class="mb-0">
                      <device-name
                        :name="trap.deviceName"
                        :type="DeviceType.Thermal"
                        :no-margin="true"
                        name-class="fw-semibold"
                      />
                    </span>

                    <div
                      class="d-flex align-items-end justify-content-end flex-wrap flex-row flex-sm-row gap-1 gap-sm-2 ms-3"
                    >
                      <b-popover tooltip>
                        <template #target>
                          <b-badge
                            v-if="trap.misconfigured"
                            variant="warning"
                            class="rename-hint d-inline-flex flex-row align-items-center"
                            data-cy="trap misconfigured"
                          >
                            <material-symbol
                              name="warning"
                              filled
                              size="1rem"
                              class="me-1"
                            />
                            Trap misconfigured
                          </b-badge>
                        </template>
                        Go to trap settings to fix the trap configuration.
                      </b-popover>

                      <b-badge
                        v-if="trap.captureTime && !trap.actionPending"
                        variant="danger"
                        class="rename-hint d-inline-flex flex-row align-items-center"
                      >
                        <material-symbol
                          name="target"
                          filled
                          size="1rem"
                          class="me-1"
                        />
                        Trap triggered
                      </b-badge>

                      <b-badge
                        v-if="trap.actionPending"
                        variant="secondary"
                        class="rename-hint d-inline-flex flex-row align-items-center"
                        data-cy="trap action pending"
                      >
                        <material-symbol
                          name="hourglass"
                          size="1rem"
                          class="me-1"
                        />
                        Action pending
                      </b-badge>

                      <b-badge
                        v-if="trap.actionResponded"
                        variant="secondary"
                        class="rename-hint d-inline-flex flex-row align-items-center"
                        data-cy="trap action responded"
                      >
                        <material-symbol name="sync" size="1rem" class="me-1" />
                        Waiting for device
                      </b-badge>

                      <b-badge
                        v-if="trap.actionAcknowledged"
                        variant="primary"
                        class="rename-hint d-inline-flex flex-row align-items-center"
                        data-cy="trap action acknowledged"
                      >
                        <material-symbol
                          name="check_circle"
                          filled
                          size="1rem"
                          class="me-1"
                        />
                        Device confirmed
                      </b-badge>

                      <b-badge
                        v-if="trap.actionFailed"
                        variant="danger"
                        class="rename-hint d-inline-flex flex-row align-items-center"
                        style="background: #960413 !important"
                        data-cy="trap action failed"
                      >
                        <material-symbol
                          name="error"
                          filled
                          size="1rem"
                          class="me-1"
                        />
                        Action failed
                      </b-badge>
                    </div>
                  </div>

                  <p class="mb-0">
                    <location-name :name="trap.location" />
                  </p>
                  <p
                    v-if="trap.captureTime"
                    class="d-inline-flex align-items-center mt-2 mb-0"
                  >
                    <material-symbol
                      name="time_auto"
                      size="1.125rem"
                      class="me-1"
                    />
                    <span class="lh-sm"
                      >Captured
                      {{ trap.captureTime?.toRelative({ style: "short" }) }},
                      <wbr />auto release
                      {{
                        trap.timeUntilAutomaticRelease?.toRelative({
                          style: "short",
                        })
                      }}</span
                    >
                  </p>
                </div>
                <div class="vr d-none d-md-block ms-4 me-4"></div>
                <hr class="d-md-none" />
                <div
                  class="action-buttons d-flex flex-column justify-content-center gap-2"
                >
                  <b-button
                    v-if="trap.captureTime"
                    :disabled="!trap.actionPending || !trap.recordingId"
                    variant="secondary"
                    data-cy="take action"
                    @click.stop.prevent="selectedAction = trap"
                  >
                    <span class="ms-2">Take action</span>
                  </b-button>
                  <b-button
                    :to="{
                      name: 'trap-settings',
                      params: {
                        projectName: urlNormalisedCurrentProjectName,
                        deviceId: trap.deviceId,
                        deviceName: urlNormaliseName(trap.deviceName),
                      },
                    }"
                    class="btn-icon align-items-center justify-content-center d-flex"
                    variant="light"
                    data-cy="trap settings link"
                  >
                    <material-symbol name="settings" size="1.25rem" />
                    <span class="ms-2">Trap&nbsp;settings</span>
                  </b-button>
                </div>
              </div>
            </template>
          </card-table>
        </div>
        <div
          class="map-buffer col col-12 col-lg-3 col-xl-4"
          ref="mapBuffer"
          v-if="projectHasTraps"
        ></div>
        <map-with-points
          ref="mapContainer"
          v-if="projectHasTraps"
          :points="trapDeviceLocations"
          :active-points="trapDeviceLocations"
          :show-only-active-points="false"
          :show-station-radius="false"
          :width="mapWidthPx"
          :radius="30"
        />
      </div>
    </div>
    <b-modal
      v-model="showTrapActionsModal"
      title="Device set to high power mode"
      centered
      no-footer
      body-class="p-0"
      @hidden="() => (selectedAction = null)"
    >
      <template #header="{ close }">
        <div
          class="d-flex flex-wrap column-gap-2 row-gap-1 me-1 modal-header-info"
          v-if="selectedAction"
        >
          <device-name
            :name="selectedAction.deviceName"
            :type="DeviceType.Thermal"
            :no-margin="true"
            name-class="fw-semibold"
          />
          <location-name :name="selectedAction.location" truncate />
        </div>
        <button
          class="btn-close flex-shrink-0"
          @click="close()"
          aria-label="Close"
        ></button>
      </template>
      <div
        class="player-container bg-black"
        data-cy="trap action recording"
        v-if="selectedAction && selectedAction.recordingId"
      >
        <cptv-player
          :recordingId="selectedAction.recordingId"
          :recording="selectedActionRecording"
          @ready-to-play="selectedActionRecordingReady = true"
        />
        <span
          v-if="selectedActionRecordingReady"
          data-cy="trap action recording ready"
          class="visually-hidden"
        ></span>
      </div>
      <div
        class="p-3 d-flex flex-column flex-sm-row gap-2"
        v-if="selectedAction"
      >
        <b-button
          variant="outline-secondary"
          class="flex-grow-1"
          v-for="(action, index) in selectedAction.availableActions || []"
          :key="index"
          :data-cy="`trap action ${action}`"
          @click="takeAction(selectedAction, action)"
        >
          <span class="text-capitalize">{{
            descriptionForAction(action)
          }}</span>
        </b-button>
      </div>
    </b-modal>
    <b-modal
      v-model="showKillConfirmationModal"
      centered
      header-bg-variant="danger"
      header-text-variant="light"
    >
      <template #header="{ close }">
        <div class="d-flex align-items-center gap-2 me-1">
          <material-symbol name="skull" size="1.5rem" />
          <h5 class="modal-title">Open kill trap door</h5>
        </div>
        <b-button
          class="btn-close btn-close-white"
          @click="close()"
          aria-label="Close"
        >
        </b-button>
      </template>

      <p>
        Opening the kill trap door will kill the animal currently in the trap.
      </p>
      <p>Type KILL below to confirm this action.</p>
      <b-form-input
        type="text"
        data-cy="kill confirmation input"
        v-model="killConfirmationInput"
        class="kill-input"
      />
      <template #footer>
        <b-button
          variant="outline-secondary"
          @click="showKillConfirmationModal = false"
        >
          Cancel
        </b-button>
        <button
          class="btn btn-danger"
          type="button"
          data-cy="confirm kill action"
          :disabled="killConfirmationInput !== 'KILL'"
          @click="confirmKill"
        >
          Confirm
        </button>
      </template>
    </b-modal>
  </div>
</template>

<style lang="less" scoped>
@import "../assets/less/breakpoints";
@import "../assets/less/elevation";
.map {
  @media screen and (max-width: @breakpoint-md-max) {
    height: 30vh;
    max-height: calc(var(--cp-grid-base) * 100); // 400px
    border-radius: var(--bs-border-radius);
    .standard-shadow-inset();
    border: 1px solid var(--border-color-light);
  }
  @media screen and (min-width: @breakpoint-lg) {
    position: absolute !important;
    right: 0;
    top: 0;
    height: 100vh !important;
  }
}
.vr {
  background-color: var(--border-color-light);
  opacity: 1;
  margin-top: calc(var(--cp-spacing-xl) * -1);
  margin-bottom: calc(var(--cp-spacing-xl) * -1);
}
hr {
  margin-left: calc(var(--cp-spacing-md) * -1);
  margin-right: calc(var(--cp-spacing-md) * -1);
}

.modal-header-info {
  // A flex item's default min-width is auto (its content size), so without
  // this, the truncated location-name can't actually shrink below its full,
  // untruncated width - it just overflows and pushes the close button out
  // of the modal header instead of ellipsizing.
  min-width: 0;
}
@media screen and (min-width: 992px) {
  // CptvPlayer's own scoped styles fix its video-container to 640px wide at
  // this breakpoint, which is wider than this modal - `:deep()` is needed
  // here since .video-container isn't a root element of the child component,
  // so a plain scoped selector wouldn't reach it.
  .player-container :deep(.video-container) {
    width: 100% !important;
  }
}
.kill-input {
  &:focus {
    border-color: var(--bs-danger);
    box-shadow: 0 0 0 0.25rem
      color-mix(in oklch, var(--bs-danger), transparent 80%);
  }
}
</style>
