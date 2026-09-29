<script setup lang="ts">
import {
  BAlert,
  BBadge,
  BFormCheckbox,
  BFormRadio,
  BFormRadioGroup,
  BLink,
  BModal,
  BSpinner,
} from "bootstrap-vue-next";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";
import SectionCard from "@/components/SectionCard.vue";
import {
  computed,
  inject,
  onBeforeMount,
  ref,
  watch,
  type Ref,
  type WatchHandle,
} from "vue";
import CardTable from "@/components/CardTable.vue";
import type { CardTableRows } from "@/components/CardTableTypes.ts";
import { capitalize } from "@/utils.ts";
import { ClientApi } from "@/api";
import type { DeviceId } from "@typedefs/api/common";
import { useRoute } from "vue-router";
import type {
  ApiDeviceHistorySettings,
  DeviceModelOutput,
  TrapMode,
  TrapSettings,
} from "@typedefs/api/device";
import { recordingWindowDescriptionForSettings } from "@/components/recordingWindowUtils.ts";
import { currentSelectedProject } from "@models/provides.ts";
import {
  CurrentProjectHasEnabledTraps,
  type SelectedProject,
} from "@models/LoggedInUser.ts";
const route = useRoute();
const selectedProject = inject(currentSelectedProject) as Ref<
  SelectedProject | false
>;

// Keep the "Traps" nav item's visibility in sync as soon as a trap is
// enabled/disabled here, rather than requiring a page reload for it to
// notice (it's otherwise only refreshed on project switch).
const refreshCurrentProjectHasEnabledTraps = async () => {
  if (!selectedProject.value) {
    return;
  }
  const devicesWithTraps =
    await ClientApi.Projects.getDevicesWithActiveTrapsForProject(
      selectedProject.value.id,
    );
  if (devicesWithTraps.success) {
    CurrentProjectHasEnabledTraps.value =
      devicesWithTraps.result.devices.length !== 0;
  }
};

const trapTags: DeviceModelOutput[] = [
  "bird",
  "cat",
  "dog",
  "hedgehog",
  "kiwi",
  "leporidae",
  "mustelid",
  "penguin",
  "possum",
  "rodent",
];
const captureTargetTagsTemp = ref<DeviceModelOutput[]>([]);
const protectTagsTemp = ref<DeviceModelOutput[]>([]);
const trapMode = ref<"armed" | "safe">("armed");
const showCaptureTargetsModal = ref<boolean>(false);
const showProtectedModal = ref<boolean>(false);
const trapIsEnabled = ref<boolean>(false);
const showSetDeviceToHighPowerModal = ref<boolean>(false);
const settings = ref<ApiDeviceHistorySettings | null>(null);
const settingsLoading = ref<boolean>(false);
const deviceId = Number(route.params.deviceId) as DeviceId;

const defaultTrapState = (): TrapSettings => ({
  enabled: false,
  target: [],
  hasKillMechanism: false,
  protect: [],
  defaultState: "armed",
  updated: new Date().toISOString(),
});

watch(showCaptureTargetsModal, (show: boolean) => {
  if (show) {
    captureTargetTagsTemp.value = [...captureTargetTags.value];
  } else {
    captureTargetTagsTemp.value = [];
  }
});

watch(showProtectedModal, (show: boolean) => {
  if (show) {
    protectTagsTemp.value = [...protectTags.value];
  } else {
    protectTagsTemp.value = [];
  }
});

watch(trapIsEnabled, (nextEnabled: boolean, prevEnabled: boolean) => {
  if (nextEnabled !== prevEnabled) {
    const updatedAt = new Date().toISOString();
    settings.value!.trap = settings.value!.trap || defaultTrapState();
    settings.value!.trap.enabled = nextEnabled;
    settings.value!.trap.updated = updatedAt;
    if (nextEnabled) {
      // Safe to flip on immediately, without waiting for the save to
      // complete - enabling this trap definitely means the project now has
      // at least one enabled trap.
      CurrentProjectHasEnabledTraps.value = true;
    }
  }
});
watch(trapMode, (nextMode: TrapMode, prevMode: TrapMode) => {
  if (nextMode !== prevMode) {
    settings.value!.trap = settings.value!.trap || defaultTrapState();
    settings.value!.trap.defaultState = nextMode;
    settings.value!.trap.updated = new Date().toISOString();
  }
});

const saveCaptureTargetTags = (tags: DeviceModelOutput[]) => {
  settings.value!.trap = settings.value!.trap || defaultTrapState();
  settings.value!.trap.target = tags;
  settings.value!.trap.updated = new Date().toISOString();
};

const saveProtectTargetTags = (tags: DeviceModelOutput[]) => {
  settings.value!.trap = settings.value!.trap || defaultTrapState();
  settings.value!.trap.protect = tags;
  settings.value!.trap.updated = new Date().toISOString();
};

const settingsSynced = computed<boolean>(() => {
  return settings.value?.synced || false;
});

const deviceIsInHighPowerMode = computed<boolean>(() => {
  if (!settings.value?.thermalRecording) {
    // Defaults to true
    return true;
  }
  return !settings.value?.thermalRecording?.useLowPowerMode;
});

const recordingWindow = computed<string | null>(() => {
  return recordingWindowDescriptionForSettings(settings.value, "Trigger");
});

const captureTargetTags = computed<DeviceModelOutput[]>(() => {
  return settings.value?.trap?.target || [];
});
const protectTags = computed<DeviceModelOutput[]>(() => {
  return settings.value?.trap?.protect || [];
});

const settingsUpdated = async (
  newSettings: ApiDeviceHistorySettings | null,
) => {
  const response = await ClientApi.Devices.updateDeviceSettings(
    deviceId,
    newSettings || {},
  );
  if (response.success) {
    watchSettings.stop();
    settings.value = response.result.settings;
    watchSettings = watch(() => settings.value, settingsUpdated, {
      deep: true,
    });
    // Re-check with the server too - the immediate update above only ever
    // turns this on, but disabling this device's trap should only turn the
    // project-wide flag off if no other device still has one enabled.
    await refreshCurrentProjectHasEnabledTraps();
  }
};
let watchSettings: WatchHandle;

onBeforeMount(async () => {
  settingsLoading.value = true;
  const response = await ClientApi.Devices.getSettingsForDevice(deviceId);
  if (response.success) {
    settings.value = response.result.settings || {};
    trapIsEnabled.value = settings.value?.trap?.enabled || false;
    trapMode.value = settings.value?.trap?.defaultState || "armed";
    watchSettings = watch(() => settings.value, settingsUpdated, {
      deep: true,
    });
  }
  settingsLoading.value = false;
});

const captureTableItems = computed<CardTableRows<string>>(() => {
  return captureTargetTags.value.map((tag: string) => ({
    capture: {
      value: capitalize(tag),
      cellClasses: ["w-100"],
    },
  }));
});

const protectedTableItems = computed<CardTableRows<string>>(() => {
  return protectTags.value.map((tag: string) => ({
    protect: {
      value: capitalize(tag),
      cellClasses: ["w-100"],
    },
  }));
});

const showAlertIfDeviceAutomaticallySetToHighPowerMode = (
  trapEnabled: boolean,
) => {
  if (trapEnabled && !deviceIsInHighPowerMode.value) {
    const updatedAt = new Date().toISOString();
    settings.value!.thermalRecording = {
      ...(settings.value!.thermalRecording || {}),
      useLowPowerMode: false,
      updated: updatedAt,
    };
    showSetDeviceToHighPowerModal.value = true;
  }
};
</script>

<template>
  <div class="d-flex flex-column flex-fill">
    <div
      v-if="settingsLoading"
      class="d-flex flex-fill align-items-center justify-content-center"
    >
      <b-spinner class="me-2" />
    </div>
    <div v-else>
      <section-card class="mb-3 mb-lg-4">
        <template #header-title> Settings summary </template>
        <b-alert
          :model-value="!deviceIsInHighPowerMode"
          variant="danger"
          :no-animation="true"
          class="mb-3"
        >
          <div class="d-flex">
            <material-symbol name="dangerous" class="me-2" size="1.25rem" />
            <span
              >The trap won't work until the device this trap is connected is in
              high power mode. You can change the power mode in
              <b-link
                variant="danger"
                class="text-danger-emphasis"
                :to="{
                  name: 'recording-options',
                  hash: '#power-profile',
                }"
                >recording options, power profile</b-link
              >.</span
            >
          </div>
        </b-alert>
        <b-alert
          :model-value="trapMode === 'safe' && captureTargetTags.length === 0"
          variant="warning"
          class="mb-3"
        >
          <div class="d-flex">
            <material-symbol name="warning" class="me-2" size="1.25rem" />
            No capture targets selected. The trap won't arm until&nbsp;<b-link
              href="#capture-targets"
              >capture targets</b-link
            >&nbsp;are defined.
          </div>
        </b-alert>
        <b-alert
          :model-value="trapIsEnabled"
          variant="light"
          :no-animation="true"
          class="mb-4"
        >
          <div class="d-flex">
            <material-symbol name="info" class="me-2" size="1.25rem" />
            <span
              >The trap schedule is the same as the thermal recording window for
              the device it is connected to. You can modify the schedule in
              <b-link
                variant="secondary"
                :to="{
                  name: 'recording-options',
                  hash: '#thermal-video-recording-schedule',
                }"
                >recording options, thermal video recording schedule</b-link
              >.</span
            >
          </div>
        </b-alert>
        <div>
          <dl class="settings-summary container mb-0">
            <div class="row">
              <dt
                class="col-sm-4 d-sm-inline-flex mb-0 mb-sm-1 pb-0 ps-0 py-sm-2 fw-medium"
              >
                Trap enabled
              </dt>
              <dd
                class="col-sm-8 d-sm-inline-flex mb-3 mb-sm-1 pt-1 px-0 py-sm-2"
              >
                <span
                  v-if="trapIsEnabled"
                  data-cy="trap enabled state"
                  class="d-flex d-inline-flex align-items-center align-self-center px-1 rounded bg-success-subtle text-success-emphasis"
                >
                  <material-symbol
                    name="check"
                    size="1.125rem"
                    class="me-1"
                  ></material-symbol>
                  Yes
                </span>
                <span
                  v-else
                  data-cy="trap enabled state"
                  class="d-flex d-inline-flex align-items-center align-self-center px-1 rounded bg-danger-subtle text-danger-emphasis"
                >
                  <material-symbol
                    name="close"
                    size="1.125rem"
                    class="me-1"
                  ></material-symbol>
                  No
                </span>
              </dd>
            </div>

            <div v-if="trapIsEnabled" class="row">
              <dt
                class="col-sm-4 d-sm-inline-flex mb-0 mb-sm-1 pb-0 ps-0 py-sm-2 fw-medium"
              >
                Device in high power mode
              </dt>
              <dd
                class="col-sm-8 d-sm-inline-flex mb-3 mb-sm-1 pt-1 px-0 py-sm-2"
              >
                <span
                  v-if="deviceIsInHighPowerMode"
                  class="d-flex d-inline-flex align-items-center align-self-center px-1 rounded bg-success-subtle text-success-emphasis"
                >
                  <material-symbol
                    name="check"
                    size="1.125rem"
                    class="me-1"
                  ></material-symbol>
                  Yes
                </span>
                <span
                  v-else
                  class="d-flex d-inline-flex align-items-center align-self-center px-1 rounded bg-danger-subtle text-danger-emphasis"
                >
                  <material-symbol
                    name="dangerous"
                    size="1.125rem"
                    class="me-1"
                  ></material-symbol>
                  No
                </span>
              </dd>
            </div>

            <div class="row">
              <dt
                class="col-sm-4 d-sm-inline-flex mb-0 mb-sm-1 pb-0 ps-0 py-sm-2 fw-medium"
              >
                Settings synced with device
              </dt>
              <dd
                class="col-sm-8 d-sm-inline-flex mb-3 mb-sm-1 pt-1 px-0 py-sm-2"
              >
                <span
                  v-if="settingsSynced"
                  class="d-flex d-inline-flex align-items-center align-self-center px-1 rounded bg-success-subtle text-success-emphasis"
                >
                  <material-symbol
                    name="check"
                    size="1.125rem"
                    class="me-1"
                  ></material-symbol>
                  Yes
                </span>
                <span
                  v-else
                  class="d-flex d-inline-flex align-items-center align-self-center px-1 rounded bg-warning-subtle text-warning-emphasis"
                >
                  <material-symbol
                    name="close"
                    size="1.125rem"
                    class="me-1"
                  ></material-symbol>
                  No
                </span>
              </dd>
            </div>

            <div v-if="trapIsEnabled" class="row">
              <dt
                class="col-sm-4 d-sm-inline-flex mb-0 mb-sm-1 pb-0 ps-0 py-sm-2 fw-medium"
              >
                Trap schedule
              </dt>
              <dd
                class="col-sm-8 d-sm-inline-flex mb-3 mb-sm-1 pt-1 px-0 py-sm-2"
              >
                {{ recordingWindow }}
              </dd>
            </div>

            <div v-if="trapIsEnabled" class="row">
              <dt
                class="col-sm-4 d-sm-inline-flex mb-0 mb-sm-1 pb-0 ps-0 py-sm-2 fw-medium"
              >
                Trap mode
              </dt>
              <dd
                class="col-sm-8 d-sm-inline-flex mb-3 mb-sm-1 pt-1 px-0 py-sm-2"
              >
                <span v-if="trapMode === 'armed'"
                  >Trigger without waiting for AI classification</span
                >
                <span v-else-if="trapMode === 'safe'"
                  >Wait for AI classification to arm trap
                </span>
              </dd>
            </div>

            <div v-if="trapIsEnabled && trapMode === 'safe'" class="row">
              <dt
                class="col-sm-4 d-sm-inline-flex mb-0 mb-sm-1 pb-0 ps-0 py-sm-2 fw-medium"
              >
                Capture targets
              </dt>
              <dd
                class="col-sm-8 d-sm-inline-flex mb-3 mb-sm-1 pt-1 px-0 py-sm-2"
                data-cy="selected capture targets"
              >
                <span
                  v-if="trapMode === 'safe' && captureTargetTags.length === 0"
                  class="d-flex d-inline-flex align-items-center align-self-center px-1 rounded bg-warning-subtle text-warning-emphasis"
                >
                  <material-symbol
                    name="warning"
                    size="1.125rem"
                    class="me-1"
                  ></material-symbol>
                  No capture targets defined
                </span>
                <span
                  v-else
                  v-for="(target, index) in captureTargetTags"
                  :key="index"
                >
                  <span class="text-capitalize">{{ target }}</span>
                  <span v-if="index !== captureTargetTags.length - 1"
                    >,&nbsp;</span
                  >
                </span>
              </dd>
            </div>
          </dl>
        </div>
      </section-card>
      <section-card class="mb-3 mb-lg-4">
        <template #header-title>Trap status</template>
        <template #header-action>
          <div v-if="false">
            <b-spinner class="me-2" variant="secondary" small />
            <span class="text-secondary">Saving</span>
          </div>
        </template>
        <p>
          Enable a trap to configure its settings. Enabling a trap will set the
          device connected to it to high power mode. <br />
          Traps can be disabled at any time.
        </p>
        <b-form-checkbox
          switch
          size="lg"
          v-model="trapIsEnabled"
          class="mb-3 fw-medium"
          data-cy="toggle trap enabled"
          @update:model-value="
            () =>
              showAlertIfDeviceAutomaticallySetToHighPowerMode(trapIsEnabled)
          "
          >Enabled</b-form-checkbox
        >
      </section-card>
      <section-card v-if="trapIsEnabled" class="mb-3 mb-lg-4">
        <template #header-title>Trap mode</template>
        <template #header-action>
          <div v-if="false" class="d-flex align-items-center">
            <b-spinner class="me-2" variant="secondary" small />
            <span class="text-secondary">Saving</span>
          </div>
        </template>

        <b-alert
          :model-value="trapIsEnabled"
          variant="light"
          :no-animation="true"
          class="mb-4"
        >
          <div class="d-flex">
            <material-symbol name="info" class="me-2" size="1.25rem" />
            <span>
              The trap will operate during the thermal video recording schedule
              set for the device.</span
            >
          </div>
        </b-alert>

        <b-form-radio-group stacked v-model="trapMode" :disabled="false">
          <b-form-radio value="armed" class="mb-1">
            <p class="fw-medium mb-1">
              Trigger without waiting for AI classification
            </p>
            <p class="text-secondary">
              The trap is always armed and will trigger as soon as any movement
              is detected inside.
            </p>
          </b-form-radio>
          <b-form-radio value="safe" class="mb-1" data-cy="trap mode safe">
            <p class="fw-medium mb-1">Wait for AI classification to arm trap</p>
            <p class="text-secondary">
              The trap will only arm when any of the predefined species is
              identified by the device.
            </p>
            <b-alert
              :model-value="
                trapMode === 'safe' && captureTargetTags.length === 0
              "
              variant="warning"
              class="mb-0"
            >
              <div class="d-flex">
                <material-symbol name="warning" class="me-2" size="1.25rem" />
                No capture targets selected. The trap won't arm until capture
                targets are defined below.
              </div>
            </b-alert>
          </b-form-radio>
        </b-form-radio-group>
      </section-card>
      <section-card
        v-if="trapIsEnabled && trapMode === 'safe'"
        class="mb-3 mb-lg-4"
        id="capture-targets"
      >
        <template #header-title>Capture targets</template>
        <template #header-action>
          <div class="d-inline-flex gap-2 ms-2">
            <button
              type="button"
              class="btn btn-secondary"
              data-cy="manage capture targets"
              @click.stop.prevent="showCaptureTargetsModal = true"
            >
              Manage
            </button>
          </div>
        </template>
        <div
          v-if="captureTargetTags.length === 0"
          class="flex-grow-1 d-flex align-items-center justify-content-center my-4"
        >
          <div class="text-body-tertiary text-center d-flex flex-column">
            <material-symbol
              name="crisis_alert"
              size="2.4rem"
              grade="thin"
              class="mb-2"
            />
            Select the targets that will trigger the trap.<br />
            The trap won't arm until targets are added.
          </div>
        </div>

        <div v-else>
          <p>
            The trap will arm when the AI identifies any of the targets below.
          </p>

          <card-table :items="captureTableItems" compact :max-card-width="0" />
        </div>
      </section-card>
      <section-card
        v-if="trapIsEnabled && trapMode === 'safe'"
        class="mb-3 mb-lg-4"
      >
        <template #header-title>Non-targets</template>
        <template #header-action>
          <div class="d-inline-flex gap-2 ms-2">
            <button
              type="button"
              class="btn btn-secondary"
              @click.stop.prevent="showProtectedModal = true"
            >
              Manage
            </button>
          </div>
        </template>
        <div
          v-if="protectTags.length === 0"
          class="flex-grow-1 d-flex align-items-center justify-content-center my-4"
        >
          <div class="text-body-tertiary text-center d-flex flex-column">
            <material-symbol
              name="volunteer_activism"
              size="2.4rem"
              grade="thin"
              class="mb-2"
            />
            Select species that will disable the trap when identified by the AI.
          </div>
        </div>

        <div v-else>
          <p>
            The trap will disabled when the AI identifies any of the species
            below.
          </p>

          <card-table
            :items="protectedTableItems"
            compact
            :max-card-width="0"
          />
        </div>
      </section-card>
    </div>

    <b-modal
      v-model="showSetDeviceToHighPowerModal"
      title="Device set to high power mode"
      ok-title="Got it"
      ok-variant="secondary"
      ok-only
      centered
    >
      <p class="mb-0">
        Devices in high power connect to the Cacophony Monitoring Platform
        regularly, but their batteries drain faster.
      </p>
    </b-modal>

    <b-modal
      id="capture-targets-modal"
      v-model="showCaptureTargetsModal"
      title="Capture targets"
      ok-title="Save"
      cancel-variant="outline-secondary"
      centered
      @ok="() => saveCaptureTargetTags([...captureTargetTagsTemp])"
    >
      <p class="mb-3">Select targets to trigger the trap.</p>

      <b-form-checkbox
        v-for="tag in trapTags"
        :key="tag"
        v-model="captureTargetTagsTemp"
        :value="tag"
        :disabled="protectTags.includes(tag)"
        name="capture-target-tags"
        class="mb-2"
        :data-cy="`capture target ${tag}`"
      >
        <span class="text-capitalize">{{ tag }}</span>
        <b-badge
          variant="secondary"
          v-if="protectTags.includes(tag)"
          class="ms-2"
          >already in protected list</b-badge
        >
      </b-form-checkbox>
    </b-modal>

    <b-modal
      v-model="showProtectedModal"
      title="Non-targets"
      ok-title="Save"
      cancel-variant="outline-secondary"
      centered
      @ok="() => saveProtectTargetTags([...protectTagsTemp])"
    >
      <p class="mb-3">
        Select species that will disable the trap if detected by the AI.
      </p>

      <b-form-checkbox
        v-for="tag in trapTags"
        :key="tag"
        v-model="protectTagsTemp"
        :value="tag"
        :disabled="captureTargetTags.includes(tag)"
        name="capture-target-tags"
        class="mb-2"
      >
        <span class="text-capitalize">{{ tag }}</span>
        <b-badge
          variant="secondary"
          v-if="captureTargetTags.includes(tag)"
          class="ms-2"
          >already in capture target list</b-badge
        >
      </b-form-checkbox>
    </b-modal>
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
