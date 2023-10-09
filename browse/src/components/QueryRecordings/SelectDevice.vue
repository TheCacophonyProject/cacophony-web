<template>
  <b-form-group>
    <label>{{ label }}</label>
    <multiselect
      :value="selectedValues"
      :options="options"
      :multiple="true"
      :placeholder="placeholder"
      :loading="fetching"
      track-by="uid"
      label="name"
      @input="updateSelected"
      @open="maybeInitialiseValues"
      data-cy="device-select"
    >
      <template slot="tag" slot-scope="{ option, remove }">
        <span class="multiselect__tag">
          <font-awesome-icon
            v-if="option.type === 'group'"
            icon="users"
            size="xs"
          />
          <font-awesome-icon
            v-else-if="option.type === 'device'"
            :icon="
              option.kind === 'thermal'
                ? 'video'
                : option.kind === 'audio'
                ? 'music'
                : 'microchip'
            "
            size="xs"
          />
          <font-awesome-icon
            v-else-if="option.type === 'station'"
            icon="map-marker-alt"
            size="xs"
          />
          <span class="tag">{{ option.name }}</span>
          <span
            v-if="option.type === 'group' && option.deviceCount"
            class="tag"
          >
            ({{ option.deviceCount }} device<span v-if="option.deviceCount > 1"
              >s</span
            >)
          </span>

          <i
            aria-hidden="true"
            tabindex="1"
            class="multiselect__tag-icon"
            @click="(_) => remove(option)"
            @keypress.enter.space="remove(option)"
          ></i>
        </span>
      </template>
      <template slot="option" slot-scope="{ option: { type, name, kind } }">
        <span>
          <font-awesome-icon v-if="type === 'group'" icon="users" size="xs" />
          <font-awesome-icon
            v-else-if="type === 'device'"
            :icon="
              kind === 'thermal'
                ? 'video'
                : kind === 'audio'
                ? 'music'
                : 'microchip'
            "
            size="xs"
          />
          <font-awesome-icon
            v-else-if="type === 'station'"
            icon="map-marker-alt"
            size="xs"
          />
          <span class="option">{{ name }}</span>
        </span>
      </template>
    </multiselect>
  </b-form-group>
</template>

<script lang="ts">
import api from "@/api";
import { defineComponent, PropType } from "@vue/composition-api";

const disambiguateDeviceNames = (devices) => {
  // If devices have name collisions, add the groupName:
  const seenNames = {};
  for (const item of Object.values(devices)) {
    const device: { name: string } = item as { name: string };
    if (!(device.name in seenNames)) {
      seenNames[device.name] = [device];
    } else {
      seenNames[device.name].push(device);
      if (seenNames[device.name].length === 2) {
        for (const d of seenNames[device.name]) {
          d.name += ` (${d.groupName})`;
        }
      } else {
        seenNames[device.name][seenNames[device.name].length - 1].name += ` (${
          (device as any).groupName
        })`;
      }
    }
  }
  return devices;
};

const disambiguateStationNames = (stations) => {
  // If stations have name collisions, add the groupName:
  const seenNames = {};
  for (const item of Object.values(stations)) {
    const station: { name: string; groupName: string } = item as {
      name: string;
      groupName: string;
    };
    if (!(station.name in seenNames)) {
      seenNames[station.name] = [station];
    } else {
      seenNames[station.name].push(station);
      if (seenNames[station.name].length === 2) {
        for (const d of seenNames[station.name]) {
          d.name += ` (${station.groupName})`;
        }
      } else {
        seenNames[station.name][
          seenNames[station.name].length - 1
        ].name += ` (${station.groupName})`;
      }
    }
  }
  return stations;
};

export default defineComponent({
  name: "SelectDevice",
  props: {
    hideSelectedType: {
      type: Set as PropType<Set<"group" | "device" | "stations">>,
      default: new Set(),
    },
    selectedDevices: {
      type: Array as PropType<string[]>,
      required: true,
    },
    selectedGroups: {
      type: Array as PropType<string[]>,
      required: true,
    },
    selectedStations: {
      type: Array as PropType<string[]>,
      default: () => [] as string[],
    },
    lazy: {
      type: Boolean,
      default: true,
    },
  },
  data() {
    return {
      fetching: false,
      devices: {},
      groups: {},
      stations: {},
    };
  },
  computed: {
    label() {
      const shownTypes = ["device", "group", "station"]
        .filter((type) => !this.hideSelectedType.has(type))
        .map((type) => type.charAt(0).toUpperCase() + type.slice(1) + "s");

      return `${shownTypes.join(", ")}`;
    },
    placeholder: function () {
      if (this.fetching) {
        return "loading";
      } else if (
        this.selectedDevices.length === 0 ||
        this.selectedGroups.length === 0 ||
        this.selectedStations.length === 0
      ) {
        return "all";
      } else {
        return "add more devices";
      }
    },
    selectedValues() {
      const selectedDs = this.selectedDevices
        .map((deviceId) => this.devices[deviceId])
        .filter((item) => item !== undefined);
      const selectedGs = this.selectedGroups
        .map((groupId) => this.groups[groupId])
        .filter((item) => item !== undefined);
      const selectedSs = this.selectedStations
        .map((stationId) => this.stations[stationId])
        .filter((item) => item !== undefined);
      return [...selectedDs, ...selectedGs, ...selectedSs];
    },
    options() {
      return [
        ...Object.values(this.devices),
        ...Object.values(this.groups),
        ...Object.values(this.stations),
      ].sort((a, b) => (a as any).name.localeCompare((b as any).name));
    },
  },
  methods: {
    updateSelected(selectedObjects) {
      const updatedSelection = {
        devices: selectedObjects
          .filter(({ type }) => type === "device")
          .map(({ id }) => id),
        groups: selectedObjects
          .filter(({ type }) => type === "group")
          .map(({ id }) => id),
        stations: selectedObjects
          .filter(({ type }) => type === "station")
          .map(({ id }) => id),
      };
      // this causes the v-model in the parent component to get updated
      this.$emit("update-device-selection", updatedSelection);
    },
    async maybeInitialiseValues() {
      await this.loadValues();
    },
    async loadValues(onLoad = false) {
      this.fetching = true;
      if (onLoad) {
        // Just load information about the groups, devices and stations in the
        // url route, to populate the names selected in the search box.
        const loadDevicePromises = [];
        const loadGroupPromises = [];
        const loadStationPromises = [];
        if (!this.hideSelectedType.has("device")) {
          for (const deviceId of this.selectedDevices) {
            loadDevicePromises.push(api.device.getDeviceById(deviceId));
          }
        }
        if (!this.hideSelectedType.has("group")) {
          for (const groupId of this.selectedGroups) {
            loadGroupPromises.push(api.groups.getGroupById(groupId));
          }
        }
        if (!this.hideSelectedType.has("station")) {
          for (const stationId of this.selectedStations) {
            loadStationPromises.push(
              api.station.getStationById(stationId as number)
            );
          }
        }
        const [devicesResponses, groupsResponses, stationsResponses] =
          await Promise.all([
            Promise.all(loadDevicePromises),
            Promise.all(loadGroupPromises),
            Promise.all(loadStationPromises),
          ]);
        this.devices = Object.freeze(
          disambiguateDeviceNames(
            devicesResponses
              .filter((response) => response.success)
              .map(
                ({
                  result: {
                    device: { id, deviceName, type },
                  },
                }) => ({
                  id: Number(id),
                  type: "device",
                  name: deviceName,
                  kind: type,
                  uid: `device_${id}`,
                })
              )
              .reduce((acc, curr) => ((acc[curr.id] = curr), acc), {})
          )
        );
        this.groups = Object.freeze(
          groupsResponses
            .filter((response) => response.success)
            .map(
              ({
                result: {
                  group: { id, groupName },
                },
              }) => ({
                id: id,
                type: "group",
                name: groupName,
                uid: `group_${id}`,
              })
            )
            .reduce((acc, curr) => ((acc[curr.id] = curr), acc), {})
        );
        this.stations = Object.freeze(
          disambiguateStationNames(
            stationsResponses
              .filter((response) => response.success)
              .map(
                ({
                  result: {
                    station: { name, id, groupName },
                  },
                }) => ({
                  type: "station",
                  name,
                  id,
                  groupName,
                  uid: `station_${id}`,
                })
              )
              .reduce((acc, curr) => ((acc[curr.id] = curr), acc), {})
          )
        );
      } else {
        // Load the entire set of available options.
        const [devicesResponse, stationsResponse] = await Promise.all([
          api.device.getDevices(),
          api.station.getStations(),
        ]);
        if (devicesResponse.success) {
          if (!this.hideSelectedType.has("device")) {
            this.devices = Object.freeze(
              disambiguateDeviceNames(
                devicesResponse.result.devices
                  .map(({ id, deviceName, type, groupName }) => ({
                    id: Number(id),
                    type: "device",
                    name: deviceName,
                    kind: type,
                    groupName,
                    uid: `device_${id}`,
                  }))
                  .reduce((acc, curr) => ((acc[curr.id] = curr), acc), {})
              )
            );
          }
          if (!this.hideSelectedType.has("group")) {
            this.groups = Object.freeze(
              devicesResponse.result.devices.reduce(
                (acc, { groupId, groupName }) => {
                  acc[groupId] = acc[groupId] || {
                    id: groupId,
                    type: "group",
                    name: groupName,
                    uid: `group_${groupId}`,
                    deviceCount: 0,
                  };
                  acc[groupId].deviceCount++;
                  return acc;
                },
                {}
              )
            );
          }
        }

        if (stationsResponse.success) {
          if (!this.hideSelectedType.has("station")) {
            this.stations = Object.freeze(
              disambiguateStationNames(
                stationsResponse.result.stations.reduce(
                  (acc, { name, id, groupName }) => {
                    acc[id] = {
                      type: "station",
                      name,
                      id,
                      groupName,
                      uid: `station_${id}`,
                    };
                    return acc;
                  },
                  {}
                )
              )
            );
          }
        }
      }
      this.fetching = false;
    },
  },
  emits: ["update-device-selection"],
  async created() {
    if (
      this.selectedStations.length ||
      this.selectedDevices.length ||
      this.selectedGroups.length ||
      !this.lazy
    ) {
      await this.loadValues(this.lazy);
    }
  },
});
</script>
<style scoped>
.tag,
.option {
  vertical-align: middle;
}
</style>
