<script setup lang="ts">
import SectionHeader from "@/components/SectionHeader.vue";
import { computed, inject, onBeforeMount, onMounted, ref, watch } from "vue";
import type { Ref, ComputedRef } from "vue";
import type { ApiDeviceResponse } from "@typedefs/api/device";
import { getDevicesForProject } from "@api/Project";
import type { SelectedProject } from "@models/LoggedInUser";
import type {
  CardTableItem,
  CardTableRow,
  CardTableRows,
} from "@/components/CardTableTypes";
import { DateTime } from "luxon";
import MapWithPoints from "@/components/MapWithPoints.vue";
import type { NamedPoint } from "@models/mapUtils";
import type { DeviceId, LatLng } from "@typedefs/api/common";
import CardTable from "@/components/CardTable.vue";
import { DeviceType } from "@typedefs/api/consts.ts";
import DeviceName from "@/components/DeviceName.vue";
import CreateProxyDeviceModal from "@/components/CreateProxyDeviceModal.vue";
import TwoStepActionButton from "@/components/TwoStepActionButton.vue";
import {
  deleteDevice,
  getDeviceConfig,
  getDeviceLocationAtTime,
} from "@api/Device";
import { useRoute, useRouter } from "vue-router";
import { urlNormaliseName } from "@/utils";
import {
  currentSelectedProject,
  selectedProjectDevices,
  userIsProjectAdmin,
} from "@models/provides";
import { projectDevicesLoaded } from "@models/LoggedInUser";
import {
  deviceScheduledPowerOffTime,
  deviceScheduledPowerOnTime,
} from "@/components/DeviceUtils";
import type { ApiStationResponse } from "@typedefs/api/station";
import type { LoadedResource } from "@api/types.ts";
import { latestRecordingTimeForDeviceAtLocation } from "@/helpers/Location.ts";

const projectDevices = inject(selectedProjectDevices) as Ref<
  ApiDeviceResponse[] | null
>;
const selectedProject = inject(currentSelectedProject) as Ref<SelectedProject>;
const isProjectAdmin = inject(userIsProjectAdmin) as ComputedRef<boolean>;
const route = useRoute();
const router = useRouter();
const devices = computed<ApiDeviceResponse[]>(() => {
  if (projectDevices.value) {
    return projectDevices.value;
  }
  return [];
});
const loadingDevices = ref<boolean>(false);
const currentlyPoweredOnDevices = ref<ApiDeviceResponse[]>([]);

const noWrap = (str: string) => str.replace(/ /g, "&nbsp;");

const showInactiveDevices = computed<boolean>(() => {
  return !!route.params.all && route.params.all === "all";
});
const showInactiveDevicesInternal = ref<boolean>(showInactiveDevices.value);
const showInactiveDevicesInternalCheck = ref<boolean>(
  showInactiveDevices.value
);

const toggleActiveAndInactive = async () => {
  if (!showInactiveDevicesInternal.value) {
    await router.push({
      ...route,
      params: {
        ...route.params,
        all: "all",
      },
    });
  } else {
    const params = { ...route.params };
    delete params.all;
    await router.push({
      ...route,
      params,
    });
  }
};

watch(route, async (next) => {
  if (
    next.name === "devices" &&
    showInactiveDevicesInternal.value !== showInactiveDevices.value
  ) {
    showInactiveDevicesInternal.value = showInactiveDevices.value;
    showInactiveDevicesInternalCheck.value = showInactiveDevices.value;
    await loadDevices();
  }
});

const loadDevices = async () => {
  console.warn("RELOAD DEVICES");
  loadingDevices.value = true;
  const devicesResponse = await getDevicesForProject(
    (selectedProject.value as SelectedProject).id,
    showInactiveDevicesInternal.value
  );
  if (devicesResponse) {
    projectDevices.value = devicesResponse;
  }
  loadingDevices.value = false;
  showCreateProxyDevicePrompt.value = false;
  const _ = findProbablyOnlineDevices();
};

const findProbablyOnlineDevices = async () => {
  // For each healthy device (which is on standby if not known otherwise)
  // get the recording windows, and show a different icon if they're expected to be online now.
  const healthyDevices =
    projectDevices.value?.filter((device) => device.isHealthy) || [];
  const configPromises = [];
  for (const device of healthyDevices) {
    configPromises.push(getDeviceConfig(device.id));
  }
  Promise.all(configPromises).then((configs) => {
    const now = new Date();
    const poweredOnDevices = [];
    for (const config of configs) {
      if (config) {
        const device = projectDevices.value?.find(
          (device) => device.id === config.device.id
        );
        if (device) {
          const powerOnTime = deviceScheduledPowerOnTime(device, config);
          const powerOffTime = deviceScheduledPowerOffTime(device, config);
          if (powerOnTime && powerOffTime) {
            const isOn = powerOnTime < now && powerOffTime > now;
            if (isOn) {
              poweredOnDevices.push(device);
            }
          }
        }
      }
    }
    currentlyPoweredOnDevices.value = poweredOnDevices;
  });
};

onBeforeMount(async () => {
  if (showInactiveDevices.value) {
    // Inactive devices are not provided by default
    await loadDevices();
  } else {
    await projectDevicesLoaded();
    const _ = findProbablyOnlineDevices();
  }
  if (selectedDevice.value) {
    await getSelectedDeviceLocation();
  }
});

// Last seen, last recording time, current ref image if any, current station, total recordings?, active/inactive, rename?
// firmware, events

// Device page, upload recordings at a time and location.

// Maybe just popup modals?  Upload modal.  Info modal

type DeviceStatus = "online" | "standby" | "stopped" | "-";
const statusForDevice = (device: ApiDeviceResponse): DeviceStatus => {
  const isPoweredOn = currentlyPoweredOnDevices.value.some(
    (poweredDevice) => poweredDevice.id === device.id
  );

  // TODO: isHealthy relates to devices that have a heartbeart.
  // In the absence of a heartbeat, we should be able to look at whether we've ever heard from this device,
  // and if so, have we heard from it within the last 24 hours?

  return device.hasOwnProperty("isHealthy") && device.active
    ? device.isHealthy
      ? isPoweredOn
        ? "online"
        : "standby"
      : "stopped"
    : "-";
};
const colorForStatus = (status: DeviceStatus): string => {
  switch (status) {
    case "-":
      return "#666";
    case "standby":
      return "#e7bc0b";
    case "stopped":
      return "#be0000";
    case "online":
      return "#6dbd4b";
  }
};

interface DeviceTableItem {
  deviceName: string;
  __type: DeviceType;
  lastSeen: string;
  __active: boolean;
  status: string | boolean;

  __id: string;

  _deleteAction: CardTableItem<ApiDeviceResponse>;

  __lastConnectionTime: Date | null;
}

//type DeviceTableItem = CardTableRow<string | boolean | (Date | null) | ApiDeviceResponse>;

const tableItems = computed<
  CardTableRows<string | boolean | (Date | null) | ApiDeviceResponse>
>(() => {
  return devices.value
    .filter((device) => showInactiveDevicesInternal.value || device.active)
    .map((device: ApiDeviceResponse) => {
      return {
        deviceName: device.deviceName, // Use device name with icon like we do currently?
        lastSeen: noWrap(
          device.lastConnectionTime
            ? (DateTime.fromJSDate(
                new Date(device.lastConnectionTime)
              ).toRelative() as string)
            : "never (offline device)"
        ),
        status: statusForDevice(device),
        _deleteAction: {
          value: device,
          cellClasses: ["d-flex", "justify-content-end"],
        },
        __active: device.active,
        __type: device.type,
        __id: device.id.toString(),
        __lastConnectionTime:
          (device.lastConnectionTime && new Date(device.lastConnectionTime)) ||
          null,
      };
    });
});

const deviceLocations = computed<NamedPoint[]>(() => {
  return devices.value
    .filter((device) => device.location !== undefined)
    .filter(
      (device) => device.location?.lat !== 0 && device.location?.lng !== 0
    )
    .map((device) => {
      const { deviceName, location, groupName, id } = device;
      return {
        name: deviceName,
        project: groupName,
        location: location as LatLng,
        id,
        color: colorForStatus(statusForDevice(device)),
        type: "device",
      };
    });
});

//provide("deviceLocations", deviceLocations);

const devicesSeenInThePast24Hours = computed<NamedPoint[]>(() => {
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);
  return devices.value
    .filter(
      (device) =>
        device.lastConnectionTime &&
        new Date(device.lastConnectionTime) > oneDayAgo
    )
    .filter((device) => device.location !== undefined)
    .filter(
      (device) => device.location?.lat !== 0 && device.location?.lng !== 0
    )
    .map((device) => {
      const { deviceName, location, groupName, id } = device;
      return {
        name: deviceName,
        project: groupName,
        location: location as LatLng,
        id,
        color: colorForStatus(statusForDevice(device)),
        type: "device",
      };
    });
});

const highlightedDeviceInternal = ref<DeviceTableItem | null>(null);

const highlightedPointInternal = ref<NamedPoint | null>(null);
const highlightPoint = (p: NamedPoint | null) => {
  highlightedPointInternal.value = p;
};

const selectPoint = (p: NamedPoint) => {
  const device = devices.value.find((device) => device.id === p.id);
  if (device) {
    openSelectedDevice(device);
  }
};

const highlightedPoint = computed<NamedPoint | null>(() => {
  if (highlightedPointInternal.value) {
    return highlightedPointInternal.value;
  }
  const device = devices.value.find(
    ({ id }) =>
      highlightedDeviceInternal.value &&
      Number((highlightedDeviceInternal.value as DeviceTableItem).__id) === id
  );
  if (device && device.location) {
    const point = {
      name: device.deviceName,
      project: device.groupName,
      location: device.location,
      id: device.id,
    };
    return point;
  }
  return null;
});

const highlightedDevice = computed<CardTableRow<string> | null>(() => {
  if (route.name !== "devices" && route.params.deviceId) {
    const device = tableItems.value.find(
      ({ __id: id }) => Number(route.params.deviceId) === Number(id)
    );
    return (device && (device as CardTableRow<string>)) || null;
  } else if (highlightedPointInternal.value) {
    const device = tableItems.value.find(
      ({ __id: id }) =>
        highlightedPointInternal.value &&
        highlightedPointInternal.value.id === Number(id)
    );
    return (device && (device as CardTableRow<string>)) || null;
  } else {
    return highlightedDeviceInternal.value as CardTableRow<string> | null;
  }
});

const enteredTableItem = (item: DeviceTableItem | null) => {
  highlightedDeviceInternal.value = item;
};

const leftTableItem = (_item: DeviceTableItem | null) => {
  highlightedDeviceInternal.value = null;
};

const sortDimensions = {
  lastSeen: (a: DeviceTableItem, b: DeviceTableItem) => {
    if (a.__lastConnectionTime && b.__lastConnectionTime) {
      return (
        b.__lastConnectionTime.getTime() - a.__lastConnectionTime.getTime()
      );
    } else if (a.__lastConnectionTime) {
      return -1;
    } else if (b.__lastConnectionTime) {
      return 1;
    }
    return 0;
  },
  deviceName: true,
};

const showCreateProxyDevicePrompt = ref<boolean>(false);

const someDevicesHaveKnownLocations = computed<boolean>(() =>
  devices.value.some(
    (device) =>
      device.location && device.location.lat !== 0 && device.location.lng !== 0
  )
);

const deleteOrArchiveDevice = async (deviceId: DeviceId) => {
  await deleteDevice(selectedProject.value.id, deviceId);
  await loadDevices();
};

const deleteConfirmationLabelForDevice = (
  device: ApiDeviceResponse
): string => {
  if (!!device.lastConnectionTime && !!device.lastRecordingTime) {
    return `Set <strong><em>${device.deviceName}</em></strong> inactive`;
  } else {
    return `Delete <strong><em>${device.deviceName}</em></strong>`;
  }
};
const selectedDevice = computed<ApiDeviceResponse | null>(() => {
  if (route.params.deviceId) {
    return (
      devices.value.find(({ id }) => id === Number(route.params.deviceId)) ||
      null
    );
  }
  return null;
});
const deviceLocation = ref<LoadedResource<ApiStationResponse>>(null);
const getSelectedDeviceLocation = async () => {
  if (selectedDevice.value?.location) {
    deviceLocation.value = await getDeviceLocationAtTime(
      selectedDevice.value.id
    );
  }
};

watch(selectedDevice, async (next) => {
  if (next) {
    await getSelectedDeviceLocation();
  }
});

const selectTableDevice = async ({ __id: deviceId }: { __id: DeviceId }) => {
  const device = devices.value.find(({ id }) => id === Number(deviceId));
  if (device) {
    await openSelectedDevice(device);
  }
};

const openSelectedDevice = async (device: ApiDeviceResponse) => {
  await router.push({
    name: "device",
    params: {
      deviceName: urlNormaliseName(device.deviceName),
      deviceId: device.id,
      type: device.type,
    },
  });
};

const selectedDeviceLatestRecordingDateTime = computed<Date | null>(() => {
  if (selectedDevice.value && deviceLocation.value) {
    return latestRecordingTimeForDeviceAtLocation(
      selectedDevice.value,
      deviceLocation.value
    );
  }
  return null;
});

const selectedDeviceActiveFrom = computed<Date | null>(() => {
  if (selectedDevice.value && deviceLocation.value) {
    return new Date(deviceLocation.value.activeAt);
  }
  return null;
});

const deviceRecordingMode = computed<"cameras" | "audio">(() => {
  if (selectedDevice.value && selectedDevice.value.type === DeviceType.Audio) {
    return "audio";
  }
  return "cameras";
});

const isDevicesRoot = computed(() => {
  return route.name === "devices";
});
</script>
<template>
  <section-header class="justify-content-between border-1">
    <device-name
      v-if="selectedDevice"
      :name="(selectedDevice as ApiDeviceResponse).deviceName"
      :type="(selectedDevice as ApiDeviceResponse).type"
    >
      <b-button
        class="ms-4"
        variant="outline-secondary"
        v-if="deviceLocation"
        :to="{
          name: 'activity',
          query: {
            devices: [selectedDevice.id],
            locations: [deviceLocation.id],
            until: (selectedDeviceLatestRecordingDateTime as Date).toISOString(),
            from: (selectedDeviceActiveFrom as Date).toISOString(),
            'display-mode': 'recordings',
            'recording-mode': deviceRecordingMode
          },
        }"
        >View Recordings
        <font-awesome-icon icon="diamond-turn-right" />
      </b-button>
    </device-name>
    <span v-else>Devices</span>
  </section-header>
  <!--  <h6>Things that need to appear here:</h6>-->
  <!--  <ul>-->
  <!--    <li>Device events in an easy to understand format</li>-->
  <!--    <li>Device current software version etc.</li>-->
  <!--    <li>Maybe which station device is currently in</li>-->
  <!--    <li>Information about device battery alerts</li>-->
  <!--    <li>Show devices that need user servicing/attention</li>-->
  <!--    <li>Per device, could show current animal heatmap overlay</li>-->
  <!--    <li>Per device, could show include/exclude polygon</li>-->
  <!--    <li>Per device, could show current reference photo image</li>-->
  <!--  </ul>-->

  <div v-if="isDevicesRoot">
    <b-spinner v-if="!projectDevices" />
    <div v-else>
      <div v-if="devices.length">
        <!-- active-points was devicesSeenInThePast24Hours -->
        <map-with-points
          v-if="someDevicesHaveKnownLocations"
          class="device-map"
          :points="deviceLocations"
          :highlighted-point="highlightedPoint"
          :active-points="deviceLocations"
          :show-station-radius="false"
          :show-only-active-points="false"
          :markers-are-interactive="true"
          :radius="30"
          :is-interactive="true"
          :zoom="false"
          @hover-point="highlightPoint"
          @leave-point="highlightPoint"
          @select-point="selectPoint"
          :can-change-base-map="false"
        />
        <div class="d-flex align-items-center justify-content-between my-2">
          <button
            type="button"
            class="btn btn-outline-secondary"
            @click="showCreateProxyDevicePrompt = true"
          >
            Register a trailcam
          </button>
          <b-form-checkbox
            v-model="showInactiveDevicesInternalCheck"
            switch
            @change="toggleActiveAndInactive"
            >Show inactive devices</b-form-checkbox
          >
        </div>
        <card-table
          :items="tableItems"
          @entered-item="enteredTableItem"
          @left-item="leftTableItem"
          @select-item="selectTableDevice"
          :highlighted-item="highlightedDevice"
          :sort-dimensions="sortDimensions"
          :default-sort="'lastSeen'"
          compact
          :break-point="0"
        >
          <template #deviceName="{ cell, row }">
            <div class="d-flex align-items-center">
              <device-name :name="cell" :type="row['__type']" /><b-badge
                class="ms-2"
                v-if="!row['__active']"
                >inactive</b-badge
              >
            </div>
          </template>
          <template #status="{ cell, row }">
            <div class="d-flex align-items-center">
              <span
                class="d-flex power-status-icon align-items-center justify-content-center"
                :class="[cell]"
              >
                <font-awesome-icon icon="power-off" v-if="cell !== '-'" />
              </span>
              <span class="ms-2" v-if="cell !== '-'">{{ cell }}</span>
            </div>
          </template>
          <template #_deleteAction="{ cell }">
            <div
              v-if="isProjectAdmin && cell.value.active"
              class="d-flex align-items-center"
            >
              <div v-if="!cell.value.lastRecordingTime">No recordings</div>
              <two-step-action-button
                v-if="cell.value.active"
                class="text-end"
                variant="outline-secondary"
                :action="() => deleteOrArchiveDevice(cell.value.id)"
                :icon="
                  cell.value.lastConnectionTime && cell.value.lastRecordingTime
                    ? 'circle-minus'
                    : 'trash-can'
                "
                :confirmation-label="
                  deleteConfirmationLabelForDevice(cell.value)
                "
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
            <span v-else></span>
          </template>
          <template #card="{ card }: { card: DeviceTableItem }">
            <div class="d-flex flex-row">
              <div class="flex-grow-1">
                <device-name
                  :name="card.deviceName"
                  :type="card.__type"
                /><b-badge class="ms-2" v-if="!card.__active">inactive</b-badge>
                <div>Last seen <span v-html="card.lastSeen"></span></div>

                <div class="d-flex align-items-center">
                  <span
                    class="d-flex power-status-icon align-items-center justify-content-center"
                    :class="[card.status]"
                  >
                    <font-awesome-icon
                      icon="power-off"
                      v-if="card.status !== '-'"
                    />
                  </span>
                  <span class="ms-2" v-if="card.status !== '-'">{{
                    card.status
                  }}</span>
                </div>
              </div>
              <div class="d-flex align-items-end justify-content-end">
                <div v-if="!card._deleteAction.value.lastRecordingTime">
                  No recordings
                </div>
                <two-step-action-button
                  v-if="card.__active"
                  class="text-end"
                  variant="outline-secondary"
                  :action="
                    () => deleteOrArchiveDevice(card._deleteAction.value.id)
                  "
                  :icon="
                    card._deleteAction.value.lastConnectionTime &&
                    card._deleteAction.value.lastRecordingTime
                      ? 'circle-minus'
                      : 'trash-can'
                  "
                  :confirmation-label="
                    deleteConfirmationLabelForDevice(card._deleteAction.value)
                  "
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
      </div>
      <p v-else>
        There are currently no active thermal cameras or bird monitors
        registered with this project.<br /><br />
        Thermal cameras or bird monitors can be either directly connected to the
        Cacophony platform via internet connection, or may be offline or out of
        coverage, and managed via the sidekick companion app.
        <a href="#TODO"
          >Find out how to register a thermal camera or a bird monitor.</a
        >
        <br /><br />
        You can also register a trailcam. This represents a third-party trailcam
        device that you plan to manually upload data for via this web
        interface.<br />
        <button
          type="button"
          class="mt-3 btn btn-outline-secondary"
          @click="showCreateProxyDevicePrompt = true"
        >
          Register a trailcam
        </button>
      </p>
    </div>
    <create-proxy-device-modal
      v-model="showCreateProxyDevicePrompt"
      id="create-proxy-device-modal"
      @proxy-device-created="loadDevices"
    />
  </div>
  <router-view v-else></router-view>
</template>
<style lang="less" scoped>
.device-map {
  @media screen and (max-width: 1040px) {
    width: 100%;
    height: 400px;
  }

  height: 400px;
  min-width: 120px;
}
.power-status-icon {
  border-radius: 50%;
  width: 21px;
  height: 21px;
  color: white;
  &.stopped {
    background-color: darkred;
  }
  &.standby {
    background-color: #6dbd4b;
  }
  &.online {
    background-color: #6dbd4b;
    animation-name: pulse-color;
    animation-duration: 2s;
    animation-iteration-count: infinite;
  }
}
@keyframes pulse-color {
  0% {
    background-color: #6dbd4b;
  }
  50% {
    background-color: #4ada10;
  }
  100% {
    background-color: #6dbd4b;
  }
}
</style>
