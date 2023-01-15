<script setup lang="ts">
import SectionHeader from "@/components/SectionHeader.vue";
import { computed, onBeforeMount, ref } from "vue";
import type { ApiDeviceResponse } from "@typedefs/api/device";
import { getDevicesForGroup } from "@api/Group";
import { currentSelectedGroup } from "@models/LoggedInUser";
import type { SelectedGroup } from "@models/LoggedInUser";
import type { CardTableRows } from "@/components/CardTableTypes";
import { DateTime } from "luxon";
import MapWithPoints from "@/components/MapWithPoints.vue";
import type { NamedPoint } from "@models/mapUtils";
import type { LatLng } from "@typedefs/api/common";
import CardTable from "@/components/CardTable.vue";

const devices = ref<ApiDeviceResponse[]>([]);
const loadingDevices = ref<boolean>(false);

const noWrap = (str: string) => str.replace(/ /g, "&nbsp;");

onBeforeMount(async () => {
  loadingDevices.value = true;
  const devicesResponse = await getDevicesForGroup(
    (currentSelectedGroup.value as SelectedGroup).id
  );
  if (devicesResponse.success) {
    devices.value = devicesResponse.result.devices;
  }
  loadingDevices.value = false;
});

const tableItems = computed<CardTableRows<string>>(() => {
  return devices.value.map((device: ApiDeviceResponse) => ({
    deviceName: device.deviceName, // Use device name with icon like we do currently?
    type: device.type,
    lastSeen: noWrap(
      device.lastConnectionTime
        ? (DateTime.fromJSDate(
            new Date(device.lastConnectionTime)
          ).toRelative() as string)
        : "never (offline device)"
    ),
  }));
});

const deviceLocations = computed<NamedPoint[]>(() => {
  return devices.value
    .filter((device) => device.location !== undefined)
    .map(({ deviceName, location }) => ({
      name: deviceName,
      group: deviceName,
      location: location as LatLng,
    }));
});
</script>
<template>
  <section-header>Devices</section-header>
  <h6>Things that need to appear here:</h6>
  <ul>
    <li>Device events in an easy to understand format</li>
    <li>Device current software version etc.</li>
    <li>Maybe which station device is currently in</li>
    <li>Information about device battery alerts</li>
    <li>Show devices that need user servicing/attention</li>
    <li>Per device, could show current animal heatmap overlay</li>
    <li>Per device, could show include/exclude polygon</li>
    <li>Per device, could show current reference photo image</li>
  </ul>
  <b-spinner v-if="loadingDevices" />
  <div v-else>
    <map-with-points
      class="device-map"
      :points="deviceLocations"
      :highlighted-point="ref(null)"
      :active-points="[]"
      :radius="30"
      :is-interactive="false"
      :zoom="false"
      :can-change-base-map="false"
    />
    <card-table
      :items="tableItems"
      v-if="devices.length"
      compact
      :break-point="0"
    >
      <template #card="{ card }">
        <div>{{ card }}</div>
      </template>
    </card-table>
    <p v-else>
      There are currently no devices registered with this group.
      <a href="#TODO">Find out how to add some</a>
    </p>
  </div>
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
