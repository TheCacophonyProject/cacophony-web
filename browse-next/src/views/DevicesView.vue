<script setup lang="ts">
import SectionHeader from "@/components/SectionHeader.vue";
import { computed, onBeforeMount, ref, watch } from "vue";
import type { ApiDeviceResponse } from "@typedefs/api/device";
import { getDevicesForGroup } from "@api/Group";
import {
  currentSelectedGroup,
  DevicesForCurrentGroup,
  UserGroups,
  userGroupsLoaded,
} from "@models/LoggedInUser";
import type { SelectedGroup } from "@models/LoggedInUser";
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
import type { DeviceType } from "@typedefs/api/consts";
import DeviceName from "@/components/DeviceName.vue";
import CreateProxyDeviceModal from "@/components/CreateProxyDeviceModal.vue";
import TwoStepActionButton from "@/components/TwoStepActionButton.vue";
import { deleteDevice } from "@api/Device";
import InlineViewModal from "@/components/InlineViewModal.vue";
import { useRoute, useRouter } from "vue-router";
import { urlNormaliseName } from "@/utils";

const devices = computed<ApiDeviceResponse[]>(() => {
  if (DevicesForCurrentGroup.value) {
    return DevicesForCurrentGroup.value;
  }
  return [];
});
const loadingDevices = ref<boolean>(false);

const noWrap = (str: string) => str.replace(/ /g, "&nbsp;");

const loadDevices = async () => {
  loadingDevices.value = true;
  await userGroupsLoaded();
  const devicesResponse = await getDevicesForGroup(
    (currentSelectedGroup.value as SelectedGroup).id
  );

  // TODO: If we want to see inactive devices, we might need to reload devices here when that option gets checked.

  if (devicesResponse.success) {
    DevicesForCurrentGroup.value = devicesResponse.result.devices;
  }
  loadingDevices.value = false;
  showCreateProxyDevicePrompt.value = false;
};

//onBeforeMount(loadDevices);

// Last seen, last recording time, current ref image if any, current station, total recordings?, active/inactive, rename?
// firmware, events

// Device page, upload recordings at a time and location.

// Maybe just popup modals?  Upload modal.  Info modal

interface DeviceTableItem {
  deviceName: string;
  __type: DeviceType;
  lastSeen: string;

  __id: string;

  _deleteAction: CardTableItem<ApiDeviceResponse>;

  __lastConnectionTime: Date | null;
}

const tableItems = computed<
  CardTableRows<string | (Date | null) | ApiDeviceResponse>
>(() => {
  return devices.value.map((device: ApiDeviceResponse) => ({
    deviceName: device.deviceName, // Use device name with icon like we do currently?
    lastSeen: noWrap(
      device.lastConnectionTime
        ? (DateTime.fromJSDate(
            new Date(device.lastConnectionTime)
          ).toRelative() as string)
        : "never (offline device)"
    ),
    deviceHealth: device.hasOwnProperty("isHealthy")
      ? (device.isHealthy as boolean).toString()
      : "-",
    _deleteAction: {
      value: device,
      cellClasses: ["d-flex", "justify-content-end"],
    },
    __type: device.type,
    __id: device.id.toString(),
    __lastConnectionTime:
      (device.lastConnectionTime && new Date(device.lastConnectionTime)) ||
      null,
  }));
});

const deviceLocations = computed<NamedPoint[]>(() => {
  return devices.value
    .filter((device) => device.location !== undefined)
    .filter(
      (device) => device.location?.lat !== 0 && device.location?.lng !== 0
    )
    .map(({ deviceName, location, groupName, id }) => ({
      name: deviceName,
      group: groupName,
      location: location as LatLng,
      id,
    }));
});

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
    .map(({ deviceName, location, id, groupName }) => ({
      name: deviceName,
      group: groupName,
      location: location as LatLng,
      id,
    }));
});

const highlightedDeviceInternal = ref<DeviceTableItem | null>(null);

const highlightedPointInternal = ref<NamedPoint | null>(null);
const highlightPoint = (p: NamedPoint | null) => {
  highlightedPointInternal.value = p;
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
      group: device.groupName,
      location: device.location,
      id: device.id,
    };
    return point;
  }
  return null;
});
const route = useRoute();
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
  await deleteDevice(
    (currentSelectedGroup.value as SelectedGroup).id,
    deviceId
  );
  await loadDevices();
};
const loadedRouteName = ref<string>("");
const selectedDevice = ref<ApiDeviceResponse | null>(null);
const router = useRouter();

const selectDevice = async ({ __id: deviceId }: { __id: DeviceId }) => {
  selectedDevice.value =
    devices.value.find(({ id }) => id === Number(deviceId)) || null;
  if (selectedDevice.value) {
    await router.push({
      name: "device",
      params: {
        deviceName: urlNormaliseName(selectedDevice.value.deviceName),
        deviceId: selectedDevice.value.id,
      },
    });
  }
};
</script>
<template>
  <section-header>Devices</section-header>
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
  <b-spinner v-if="loadingDevices" />
  <div v-else>
    <div v-if="devices.length">
      <map-with-points
        v-if="someDevicesHaveKnownLocations"
        class="device-map"
        :points="deviceLocations"
        :highlighted-point="highlightedPoint"
        :active-points="devicesSeenInThePast24Hours"
        :show-station-radius="false"
        :show-only-active-points="false"
        :radius="30"
        :is-interactive="true"
        :zoom="false"
        @hover-point="highlightPoint"
        @leave-point="highlightPoint"
        :can-change-base-map="false"
      />
      <card-table
        :items="tableItems"
        @entered-item="enteredTableItem"
        @left-item="leftTableItem"
        @select-item="selectDevice"
        :highlighted-item="highlightedDevice"
        :sort-dimensions="sortDimensions"
        :default-sort="'lastSeen'"
        compact
        :break-point="0"
      >
        <template #deviceName="{ cell, row }">
          <device-name :name="cell" :type="row['__type']" />
        </template>
        <template #deviceHealth="{ cell, row }">
          <span v-if="cell === '-'"></span>
          <span v-else-if="cell === 'true'">
            <font-awesome-icon icon="heart" color="darkgreen" />
          </span>
          <span v-else-if="cell === 'false'">
            <font-awesome-icon icon="heart-broken" color="#555" />
          </span>
        </template>
        <template #_deleteAction="{ cell }">
          <two-step-action-button
            class="text-end"
            :action="() => deleteOrArchiveDevice(cell.value.id)"
            icon="trash-can"
            :confirmation-label="`${
              cell.value.lastRecordingTime ? 'Archive' : 'Delete'
            } <strong><em>${cell.value.deviceName}</em></strong>`"
            classes="btn-outline-secondary d-flex align-items-center fs-7 text-nowrap ms-2"
            alignment="right"
          />
        </template>
        <template #card="{ card }">
          <h6>{{ card.deviceName }}</h6>
          <div>{{ card.type }}</div>
          <div>Last seen <span v-html="card.lastSeen"></span></div>
        </template>
      </card-table>
      <button
        type="button"
        class="btn btn-outline-secondary float-end"
        @click="showCreateProxyDevicePrompt = true"
      >
        Create a new proxy device
      </button>
    </div>
    <p v-else>
      There are currently no devices registered with this group.<br /><br />
      An example of a device that you might register in the system is a thermal
      camera or a bird monitor that is either directly connected to the
      internet, or is offline/out of coverage but will be managed via the
      sidekick companion app.
      <a href="#TODO">Find out how to add some.</a>
      <br /><br />
      You can also create a "proxy device". A proxy device represents a
      <em>non-connected</em> device which you plan to manually upload data
      for.<br />
      An example of a proxy device is a third-party trail-cam that you are
      collecting sd-cards from and uploading the collected recording files via a
      web-browser.<br />
      <button
        type="button"
        class="mt-3 btn btn-outline-secondary"
        @click="showCreateProxyDevicePrompt = true"
      >
        Create a proxy device
      </button>
    </p>
  </div>
  <create-proxy-device-modal
    v-model="showCreateProxyDevicePrompt"
    id="create-proxy-device-modal"
    @proxy-device-created="loadDevices"
  />
  <inline-view-modal
    @close="selectedDevice = null"
    :fade-in="loadedRouteName === 'device'"
    :parent-route-name="'devices'"
    @shown="() => (loadedRouteName = 'device')"
  />
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
</style>
