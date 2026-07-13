<script setup lang="ts">
import SectionHeader from "@/components/SectionHeader.vue";
import type { ComputedRef, Ref } from "vue";
import { computed, inject, onBeforeMount, ref, watch } from "vue";
import type { ApiDeviceResponse } from "@typedefs/api/device";
import { ClientApi } from "@/api";
import {
  DevicesForCurrentProject,
  projectDevicesLoaded,
  type SelectedProject,
} from "@models/LoggedInUser";
import type {
  CardTableItem,
  CardTableRows,
  GenericCardTableValue,
} from "@/components/CardTableTypes";
import { DateTime } from "luxon";
import MapWithPoints from "@/components/MapWithPoints.vue";
import type { NamedPoint } from "@models/mapUtils";
import type { DeviceId, LatLng } from "@typedefs/api/common";
import CardTable from "@/components/CardTable.vue";
import { DeviceType } from "@typedefs/api/consts.ts";
import DeviceName from "@/components/DeviceName.vue";
import TwoStepActionButton from "@/components/TwoStepActionButton.vue";
import {
  type RouteLocationAsPathGeneric,
  type RouteLocationRaw,
  useRoute,
  useRouter,
} from "vue-router";
import { urlNormaliseName } from "@/utils";
import {
  allHistoricLocations,
  currentSelectedProject,
  selectedProjectDevices,
  userIsProjectAdmin,
} from "@models/provides";
import {
  deviceScheduledPowerOffTime,
  deviceScheduledPowerOnTime,
} from "@/components/DeviceUtils";
import type { ApiStationResponse } from "@typedefs/api/station";
import type { LoadedResource } from "@apiClient/types.ts";
import {
  latLngApproxDistance,
  MAX_DISTANCE_FROM_STATION_FOR_RECORDING,
} from "@/helpers/Location.ts";
import DeviceBatteryLevel from "@/components/DeviceBatteryLevel.vue";
import LocationName from "@/components/LocationName.vue";
import { BBadge, BButton, BFormCheckbox, BSpinner } from "bootstrap-vue-next";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";
import { useMediaQuery } from "@vueuse/core";
import type { IconsProp } from "@dbetka/vue-material-symbols/dist/jscache/icons-names";
import { ActivitySearchRecordingMode } from "@/components/activitySearchUtils.ts";

const activeProjectDevices = inject(selectedProjectDevices) as Ref<
  LoadedResource<ApiDeviceResponse[]>
>;
const allProjectDevices = ref<LoadedResource<ApiDeviceResponse[]>>(null);
const selectedProject = inject(currentSelectedProject) as Ref<SelectedProject>;
const isProjectAdmin = inject(userIsProjectAdmin) as ComputedRef<boolean>;
const allLocations = inject(allHistoricLocations) as Ref<
  LoadedResource<ApiStationResponse[]>
>;
const route = useRoute();
const router = useRouter();

const devices = computed<ApiDeviceResponse[]>(() => {
  if (allProjectDevices.value !== null) {
    if (showInactiveDevices.value || route.name !== "devices") {
      return allProjectDevices.value as ApiDeviceResponse[];
    }
    return (allProjectDevices.value as ApiDeviceResponse[]).filter(
      (device) => device.active,
    );
  }
  if (activeProjectDevices.value && !showInactiveDevices.value) {
    return activeProjectDevices.value;
  }
  return [];
});
const loadingDevices = computed<boolean>(() => {
  if (showInactiveDevices.value) {
    return allProjectDevices.value === null;
  }
  return activeProjectDevices.value === null;
});
const currentlyPoweredOnDevices = ref<ApiDeviceResponse[]>([]);

const noWrap = (str: string) => str.replace(/ /g, "&nbsp;");

const showInactiveDevices = computed<boolean>(() => {
  return !!route.params.all && route.params.all === "all";
});
const showInactiveDevicesInternal = ref<boolean>(showInactiveDevices.value);
const showInactiveDevicesInternalCheck = ref<boolean>(
  showInactiveDevices.value,
);

const toggleActiveAndInactive = async () => {
  if (!showInactiveDevicesInternal.value) {
    await router.push({
      ...route,
      params: {
        ...route.params,
        all: "all",
      },
    } as RouteLocationRaw);
  } else {
    const params = { ...route.params };
    delete params.all;
    await router.push({
      ...route,
      params,
    } as RouteLocationRaw);
  }
};

watch(route, async (next) => {
  if (
    next.name === "devices" &&
    showInactiveDevicesInternal.value !== showInactiveDevices.value
  ) {
    showInactiveDevicesInternal.value = showInactiveDevices.value;
    showInactiveDevicesInternalCheck.value = showInactiveDevices.value;
    if (
      allProjectDevices.value === null &&
      activeProjectDevices.value !== null
    ) {
      allProjectDevices.value = [...(activeProjectDevices.value || [])];
    }
    await reloadAllDevices();
  }
});

const reloadAllDevices = async () => {
  const devicesResponse = await ClientApi.Projects.getDevicesForProject(
    (selectedProject.value as SelectedProject).id,
    true,
  );
  if (devicesResponse) {
    allProjectDevices.value = devicesResponse;
    DevicesForCurrentProject.value = devicesResponse.filter(
      (device) => device.active,
    );
  }
  const _ = findProbablyOnlineDevices();
};

const findProbablyOnlineDevices = async () => {
  // For each healthy device (which is on standby if not known otherwise)
  // get the recording windows, and show a different icon if they're expected to be online now.
  if (activeProjectDevices.value) {
    const healthyDevices =
      activeProjectDevices.value.filter((device) => device.isHealthy) || [];
    const configPromises = [];
    for (const device of healthyDevices) {
      configPromises.push(ClientApi.Devices.getDeviceConfig(device.id));
    }
    Promise.all(configPromises).then((configs) => {
      const now = new Date();
      const poweredOnDevices = [];
      for (const config of configs) {
        if (config) {
          const device = (
            activeProjectDevices.value as ApiDeviceResponse[]
          ).find((device) => device.id === config.device.id);
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
  }
};

onBeforeMount(async () => {
  if (route.name === "devices") {
    if (showInactiveDevices.value) {
      // Inactive devices are not provided by default
      await reloadAllDevices();
    } else {
      await projectDevicesLoaded();
      if (
        !!activeProjectDevices.value &&
        activeProjectDevices.value.length === 0
      ) {
        await router.replace({
          ...route,
          params: {
            ...(route.params || {}),
            all: "all",
          },
        } as RouteLocationAsPathGeneric);
      }
    }
    const _ = findProbablyOnlineDevices();
  } else if (selectedDevice.value) {
    if (!selectedDevice.value.active) {
      await reloadAllDevices();
    }
    await getSelectedDeviceLocation();
  } else {
    await reloadAllDevices();
    await getSelectedDeviceLocation();
  }
});

// Last seen, last recording time, current ref image if any, current station, total recordings?, active/inactive, rename?
// firmware, events

// Device page, upload recordings at a time and location.

// Maybe just popup modals?  Upload modal.  Info modal

type DeviceStatus = "online" | "standby" | "stopped or offline" | "-";
const statusForDevice = (device: ApiDeviceResponse): DeviceStatus => {
  const isPoweredOn = currentlyPoweredOnDevices.value.some(
    (poweredDevice) => poweredDevice.id === device.id,
  );
  return device.hasOwnProperty("isHealthy") && device.active
    ? device.isHealthy
      ? isPoweredOn
        ? "online"
        : "standby"
      : "stopped or offline"
    : "-";
};

const locationNameForDevice = (device: ApiDeviceResponse): string => {
  if (device.location) {
    const stationDistances = [];
    for (const station of allLocations.value || []) {
      // See if any stations match: Looking at the location distance between this recording and the stations.
      const distanceToStation = latLngApproxDistance(
        station.location,
        device.location,
      );
      stationDistances.push({ distanceToStation, station });
    }
    const validStationDistances = stationDistances.filter(
      ({ distanceToStation }) =>
        distanceToStation <= MAX_DISTANCE_FROM_STATION_FOR_RECORDING,
    );

    // There shouldn't really ever be more than one station within our threshold distance,
    // since we check that stations aren't too close together when we add them.  However, on the off
    // chance we *do* get two or more valid stations for a recording, take the closest one.
    validStationDistances.sort((a, b) => {
      return b.distanceToStation - a.distanceToStation;
    });
    const closest = validStationDistances.pop();
    if (closest) {
      return closest.station.name;
    }
  }
  return "";
};

const colorForStatus = (status: DeviceStatus): string => {
  switch (status) {
    case "-":
      return "#6c757d";
    case "standby":
      return "#5a872f";
    case "stopped or offline":
      return "#be0000";
    case "online":
      return "#579e02";
  }
};

interface DeviceTableItem {
  deviceName: string;
  __type: DeviceType;
  lastSeen: string;
  __active: boolean;
  status: DeviceStatus;
  location: string;
  batteryLevel: ApiDeviceResponse;

  __id: string;

  _deleteAction: CardTableItem<ApiDeviceResponse>;

  __lastConnectionTime: Date | null;
}

//type DeviceTableItem = CardTableRow<string | boolean | (Date | null) | ApiDeviceResponse>;
const lastRecordingTimeForDevice = (
  device: ApiDeviceResponse,
): Date | undefined => {
  if (device.lastAudioRecordingTime && device.lastThermalRecordingTime) {
    if (
      new Date(device.lastThermalRecordingTime) >
      new Date(device.lastAudioRecordingTime)
    ) {
      return new Date(device.lastThermalRecordingTime);
    }
    return new Date(device.lastAudioRecordingTime);
  } else if (device.lastThermalRecordingTime) {
    return new Date(device.lastThermalRecordingTime);
  } else if (device.lastAudioRecordingTime) {
    return new Date(device.lastAudioRecordingTime);
  }
  return;
};
const lastRecordingTimeForDeviceHumanReadable = (
  device: ApiDeviceResponse,
): string => {
  const lastRecordingTime = lastRecordingTimeForDevice(device);
  if (lastRecordingTime) {
    return DateTime.fromJSDate(
      new Date(lastRecordingTime),
    ).toRelative() as string;
  }
  return "never";
};
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
                new Date(device.lastConnectionTime),
              ).toRelative() as string)
            : `${lastRecordingTimeForDeviceHumanReadable(device)} (offline device)`,
        ),
        status: statusForDevice(device),
        location: locationNameForDevice(device),
        batteryLevel: device,
        _deleteAction: {
          value: device,
          cellClasses: ["d-flex", "justify-content-end"],
        },
        __active: device.active,
        __type: device.type,
        __id: device.id.toString(),
        __lastConnectionTime:
          (device.lastConnectionTime && new Date(device.lastConnectionTime)) ||
          lastRecordingTimeForDevice(device) ||
          null,
      };
    });
});

const cacophonyHq = { lat: -43.5339514, lng: 172.6467213 };
const locIsInCacophonyHq = (location: LatLng): boolean => {
  return latLngApproxDistance(cacophonyHq, location) < 2000;
};

const projectIsAroundCacophonyHq = computed<boolean>(() => {
  // All locations are around cacophony hq
  if (validDeviceLocations.value) {
    return validDeviceLocations.value.every(
      ({ location }) =>
        latLngApproxDistance(cacophonyHq, location as LatLng) < 50000,
    );
  }
  return false;
});

const validDeviceLocations = computed(() => {
  return devices.value
    .filter((device) => device.location !== undefined)
    .filter(
      (device) => device.location?.lat !== 0 && device.location?.lng !== 0,
    );
});

const deviceLocations = computed<NamedPoint[]>(() => {
  return validDeviceLocations.value
    .filter(({ location }) =>
      projectIsAroundCacophonyHq.value
        ? true
        : !locIsInCacophonyHq(location as LatLng),
    )
    .map((device) => {
      const { deviceName, location, groupName, id } = device;
      return {
        name: deviceName,
        project: groupName,
        location: location as LatLng,
        locationName: locationNameForDevice(device),
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
      Number((highlightedDeviceInternal.value as DeviceTableItem).__id) === id,
  );
  if (device && device.location) {
    return {
      name: device.deviceName,
      project: device.groupName,
      location: device.location,
      locationName: locationNameForDevice(device),
      id: device.id,
    };
  }
  return null;
});

const highlightedDevice = computed<DeviceTableItem | null>(() => {
  if (route.name !== "devices" && route.params.deviceId) {
    const device = (tableItems.value as unknown as DeviceTableItem[]).find(
      ({ __id: id }) => Number(route.params.deviceId) === Number(id),
    );
    return device || null;
  } else if (highlightedPointInternal.value) {
    const device = (tableItems.value as unknown as DeviceTableItem[]).find(
      ({ __id: id }) =>
        highlightedPointInternal.value &&
        highlightedPointInternal.value.id === Number(id),
    );
    return device || null;
  } else {
    return highlightedDeviceInternal.value;
  }
});

const enteredTableItem = (item: GenericCardTableValue<unknown>) => {
  highlightedDeviceInternal.value = item as DeviceTableItem;
};

const leftTableItem = (_item: GenericCardTableValue<unknown>) => {
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

const someDevicesHaveKnownLocations = computed<boolean>(() =>
  devices.value.some(
    (device) =>
      device.location && device.location.lat !== 0 && device.location.lng !== 0,
  ),
);

const deleteOrArchiveDevice = async (deviceId: DeviceId) => {
  await ClientApi.Devices.deleteDevice(selectedProject.value.id, deviceId);
  await reloadAllDevices();
};

const unarchiveDevice = async (deviceId: DeviceId) => {
  await ClientApi.Devices.setDeviceActive(selectedProject.value.id, deviceId);
  await reloadAllDevices();
};

const deleteConfirmationLabelForDevice = (
  device: ApiDeviceResponse,
): string => {
  if (
    !!device.lastConnectionTime &&
    !!device.lastAudioRecordingTime &&
    !!device.lastThermalRecordingTime
  ) {
    return `Set <strong>${device.deviceName}</strong> inactive`;
  } else {
    return `Delete <strong>${device.deviceName}</strong>`;
  }
};

const unarchiveConfirmationLabelForDevice = (
  device: ApiDeviceResponse,
): string => {
  return `Set <strong>${device.deviceName}</strong> active`;
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
    deviceLocation.value = await ClientApi.Devices.getDeviceLocationAtTime(
      selectedDevice.value.id,
      true,
    );
  }
};

watch(selectedDevice, async (next) => {
  if (next) {
    await getSelectedDeviceLocation();
  }
});

const selectTableDevice = async (val: GenericCardTableValue<unknown>) => {
  if (typeof val === "object" && val !== null && "__id" in val) {
    const deviceId = val.__id;
    const device = devices.value.find(({ id }) => id === Number(deviceId));
    if (device) {
      await openSelectedDevice(device);
    }
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
  if (selectedDevice.value && deviceRecordingMode.value) {
    if (
      deviceRecordingMode.value === ActivitySearchRecordingMode.Cameras &&
      selectedDevice.value.lastThermalRecordingTime
    ) {
      return new Date(selectedDevice.value.lastThermalRecordingTime);
    } else if (
      deviceRecordingMode.value === ActivitySearchRecordingMode.Audio &&
      selectedDevice.value.lastAudioRecordingTime
    ) {
      return new Date(selectedDevice.value.lastAudioRecordingTime);
    }
  }
  return null;
});

const selectedDeviceActiveFrom = computed<Date | null>(() => {
  if (selectedDevice.value && deviceRecordingMode.value) {
    if (
      deviceRecordingMode.value === ActivitySearchRecordingMode.Cameras &&
      selectedDevice.value.earliestThermalRecordingTime
    ) {
      return new Date(selectedDevice.value.earliestThermalRecordingTime);
    } else if (
      deviceRecordingMode.value === ActivitySearchRecordingMode.Audio &&
      selectedDevice.value.earliestAudioRecordingTime
    ) {
      return new Date(selectedDevice.value.earliestAudioRecordingTime);
    }
  }
  return null;
});

const deviceRecordingMode = computed<ActivitySearchRecordingMode>(() => {
  const savedRecordingMode = window.localStorage.getItem(
    "activity-recording-mode",
  ) as ActivitySearchRecordingMode;
  if (savedRecordingMode) {
    if (
      savedRecordingMode === ActivitySearchRecordingMode.Cameras &&
      selectedDevice.value &&
      selectedDevice.value.earliestThermalRecordingTime
    ) {
      return savedRecordingMode;
    } else if (
      savedRecordingMode === ActivitySearchRecordingMode.Audio &&
      selectedDevice.value &&
      selectedDevice.value.earliestAudioRecordingTime
    ) {
      return savedRecordingMode;
    }
  }
  if (!savedRecordingMode && selectedDevice.value) {
    if (selectedDevice.value.earliestThermalRecordingTime) {
      return ActivitySearchRecordingMode.Cameras;
    }
  }
  return ActivitySearchRecordingMode.Audio;
});

const cacophonyEpoch = new Date();
cacophonyEpoch.setFullYear(2010, 0, 0);
cacophonyEpoch.setHours(0, 0, 0);

const isDevicesRoot = computed(() => {
  return route.name === "devices";
});

const isMobileView = useMediaQuery("(max-width: 575px)");

const iconForPowerStatus = (powerStatus: DeviceStatus): IconsProp => {
  switch (powerStatus) {
    case "online":
      return "power_settings_new";
    case "standby":
      return "mode_standby";
    case "stopped or offline":
      return "hide_source";
    case "-":
    default:
      return "check_indeterminate_small";
  }
};
</script>
<template>
  <section-header class="justify-content-between align-items-center">
    <span v-if="selectedDevice && isMobileView">Device</span>
    <span v-if="!selectedDevice">Devices</span>
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
  <div
    v-if="selectedDevice"
    class="device-name d-flex justify-content-between align-items-center"
  >
    <h1
      class="h1 m-0 ms-1 mb-sm-2 mb-4 ms-sm-0 d-flex flex-row flex-fill justify-content-between"
    >
      <device-name
        :name="(selectedDevice as ApiDeviceResponse).deviceName"
        :type="(selectedDevice as ApiDeviceResponse).type"
        :no-margin="true"
        nameClass="ms-1"
      >
        <b-button
          class="ms-4 align-items-center"
          variant="outline-secondary"
          :to="{
            name: 'activity',
            query: {
              devices: [selectedDevice.id],
              until: (
                (selectedDeviceLatestRecordingDateTime || new Date()) as Date
              ).toISOString(),
              from: (
                (selectedDeviceActiveFrom || cacophonyEpoch) as Date
              ).toISOString(),
              locations: 'any',
              'display-mode': 'recordings',
              'recording-mode': deviceRecordingMode,
            },
          }"
          ><span>View Recordings</span>
        </b-button>
      </device-name>
    </h1>
  </div>
  <div
    v-if="isDevicesRoot"
    class="d-flex flex-fill justify-content-center align-items-center"
  >
    <b-spinner v-if="loadingDevices" variant="secondary" />
    <div v-if="devices.length" class="w-100 align-self-start">
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
        :can-change-base-map="true"
      />
      <div class="d-flex align-items-center justify-content-end my-2">
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
        standalone
        :max-card-width="768"
        class="mb-3"
      >
        <template #deviceName="{ cell, row }">
          <div class="d-flex align-items-center" :data-cy="`device ${cell}`">
            <device-name
              :name="cell"
              :type="row['__type']"
              :name-class="'text-nowrap'"
            /><b-badge class="ms-2" v-if="!row['__active']">Inactive</b-badge>
          </div>
        </template>
        <template #status="{ cell }">
          <div class="d-flex align-items-center">
            <span
              class="d-flex power-status-icon align-items-center justify-content-center"
              :class="[cell]"
            >
              <material-symbol
                :name="iconForPowerStatus(cell)"
                size="1.25rem"
                v-if="cell !== '-'"
              />
            </span>
            <span class="ms-2 text-nowrap" v-if="cell !== '-'">{{ cell }}</span>
          </div>
        </template>
        <template #batteryLevel="{ cell }">
          <device-battery-level :device="cell" />
        </template>
        <template #location="{ cell }">
          <location-name :name="cell" />
        </template>
        <template #_deleteAction="{ cell }">
          <div
            v-if="isProjectAdmin && cell.value.active"
            class="d-flex align-items-center"
          >
            <b-badge
              v-if="
                !cell.value.lastThermalRecordingTime &&
                !cell.value.lastAudioRecordingTime
              "
              variant="light"
              class="ms-2"
            >
              No recordings
            </b-badge>
            <two-step-action-button
              :action="() => deleteOrArchiveDevice(cell.value.id)"
              :icon="
                cell.value.lastThermalRecordingTime ||
                cell.value.lastAudioRecordingTime
                  ? 'do_not_disturb_on'
                  : 'delete'
              "
              :confirmation-label="deleteConfirmationLabelForDevice(cell.value)"
              :tooltip-label="
                cell.value.lastThermalRecordingTime ||
                cell.value.lastAudioRecordingTime
                  ? 'Set as inactive'
                  : 'Delete'
              "
              :boundary-padding="false"
            />
          </div>
          <div v-else-if="isProjectAdmin && !cell.value.active">
            <two-step-action-button
              :action="() => unarchiveDevice(cell.value.id)"
              icon="add_circle"
              :confirmation-label="
                unarchiveConfirmationLabelForDevice(cell.value)
              "
              :tooltip-label="`Set as active`"
            />
          </div>
          <span v-else></span>
        </template>
        <template #card="{ card }: { card: DeviceTableItem }">
          <div class="d-flex flex-row">
            <div class="overflow-hidden flex-grow-1">
              <div class="d-flex align-items-center">
                <device-name
                  :name="card.deviceName"
                  :type="card.__type"
                  :no-margin="true"
                  name-class="fw-semibold text-break"
                />
                <device-battery-level
                  :device="card.batteryLevel"
                  class="ms-3"
                />
              </div>
              <div></div>
              <location-name
                @click.stop.prevent="
                  () => {
                    highlightedDeviceInternal = card;
                  }
                "
                v-if="card.location !== ''"
                :name="card.location"
                class="mt-2"
              />
              <div class="mt-2 d-flex align-items-center">
                <material-symbol name="history" size="1.125rem" class="me-1" />
                <span class="me-1">Last seen:</span>
                <span v-html="card.lastSeen"></span>
              </div>
            </div>
            <div class="d-flex align-items-center" v-if="isProjectAdmin">
              <two-step-action-button
                v-if="card.__active"
                :action="
                  () => deleteOrArchiveDevice(card._deleteAction.value.id)
                "
                :icon="
                  card._deleteAction.value.lastThermalRecordingTime ||
                  card._deleteAction.value.lastAudioRecordingTime
                    ? 'do_not_disturb_on'
                    : 'delete'
                "
                :confirmation-label="
                  deleteConfirmationLabelForDevice(card._deleteAction.value)
                "
                :tooltip-label="
                  card._deleteAction.value.lastAudioRecordingTime ||
                  card._deleteAction.value.lastThermalRecordingTime
                    ? 'Set as inactive'
                    : 'Delete'
                "
              />
              <two-step-action-button
                v-else
                :action="() => unarchiveDevice(card._deleteAction.value.id)"
                icon="add_circle"
                :confirmation-label="
                  unarchiveConfirmationLabelForDevice(card._deleteAction.value)
                "
                :tooltip-label="`Set as active`"
              />
            </div>
          </div>
          <hr />
          <div class="d-flex align-items-center justify-content-between mt-2">
            <div class="d-flex align-items-center">
              <span
                class="d-flex power-status-icon align-items-center justify-content-center"
                :class="[card.status]"
              >
                <material-symbol
                  :name="iconForPowerStatus(card.status)"
                  size="1.25rem"
                  v-if="card.status !== '-'"
                />
              </span>
              <span class="ms-2" v-if="card.status !== '-'">{{
                card.status
              }}</span>
            </div>

            <div class="d-flex flex-row">
              <b-badge
                v-if="
                  !card._deleteAction.value.lastThermalRecordingTime &&
                  !card._deleteAction.value.lastAudioRecordingTime
                "
                variant="light"
                class="ms-2"
              >
                No recordings
              </b-badge>
              <b-badge class="ms-2" v-if="!card.__active">Inactive</b-badge>
            </div>
          </div>
        </template>
      </card-table>
    </div>
    <div
      v-else
      class="no-results text-body-tertiary d-flex flex-column text-center col col-12 col-md-8 col-lg-6 mx-auto"
    >
      <material-symbol
        name="developer_board_off"
        size="2.4rem"
        grade="thin"
        class="mb-2"
      />
      <h4 class="h5 mb-2">This project has no registered devices</h4>
      <p>
        Devices need to connect to the Monitoring Platform to register. Online
        devices will connect directly if they have an internet connection
        configured. Offline or out of coverage devices need to be managed via
        the Sidekick mobile app.
      </p>
      <b-button
        variant="outline-secondary"
        href="https://docs.google.com/document/d/1wL1A6eJyq7Y5LnVIoKcW3J_3XOWysTedJVKaLEbSK9Q/edit?tab=t.0#heading=h.jmao8urwekj7"
        target="_blank"
        rel="nofollow"
        class="mx-auto"
        >Connect device to Monitoring Platform</b-button
      >
    </div>
  </div>
  <router-view v-else></router-view>
</template>
<style lang="less" scoped>
@import "../assets/less/breakpoints";
@import "../assets/less/elevation";

.device-name {
  @media screen and (max-width: @breakpoint-xs-max) {
    position: sticky;
    top: var(--cp-mobile-header-height);
    background: color-mix(in srgb, var(--app-bg-color), transparent 15%);
    backdrop-filter: blur(8px);
    margin-top: calc(var(--cp-spacing-xl) * -1);
    padding-top: var(--cp-spacing-sm);
    padding-bottom: var(--cp-spacing-sm);
    z-index: 1001;
    margin-left: -4px;
    margin-right: -4px;
    padding-left: 4px;
    padding-right: 4px;
    h1 {
      margin-bottom: 0 !important;
      font-size: var(--cp-font-size-h4);
    }
  }
}

.device-map {
  width: 100%;
  height: 40vh;
  max-height: calc(var(--cp-grid-base) * 100); // 400px
  @media screen and (max-width: @breakpoint-md-max) {
    border-radius: var(--bs-border-radius);
  }
  @media screen and (min-width: @breakpoint-lg) {
    border-radius: var(--bs-border-radius-lg);
  }
  .standard-shadow-inset();
  border: 1px solid var(--border-color-light);
}
.power-status-icon {
  border-radius: 50%;
  min-width: 24px;
  width: 24px;
  height: 24px;
  color: var(--bs-white);
  &.stopped {
    background-color: #be0000;
  }
  &.standby {
    background-color: color-mix(
      in oklch,
      var(--cp-color-green-600),
      var(--bs-gray-700) 30%
    );
  }
  &.online {
    background-color: var(--cp-color-green-600);
    animation-name: pulse-color;
    animation-duration: 2s;
    animation-iteration-count: infinite;
  }
}
@keyframes pulse-color {
  0% {
    background-color: var(--cp-color-green-600);
  }
  50% {
    background-color: var(--cp-color-green-400);
  }
  100% {
    background-color: var(--cp-color-green-600);
  }
}
</style>
