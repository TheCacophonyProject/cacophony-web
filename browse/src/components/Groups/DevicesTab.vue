<template>
  <div class="container" v-if="!loading" style="padding: 0">
    <h2>
      Devices
      <help>
        Devices specify which group they belong to when they first register.
        They can't be edited here.
      </help>
    </h2>
    <div>
      <p v-if="groupHasDevices">
        Devices associated with
        <strong><GroupLink :group-name="groupName" /></strong>:
      </p>
      <p v-else class="description-and-button-wrapper">
        There are currently no devices associated with&nbsp;<strong
          ><GroupLink :group-name="groupName" /></strong
        >.
      </p>
    </div>
    <b-table
      v-if="groupHasDevices"
      :items="tableItems"
      :fields="[
        {
          key: 'deviceName',
          label: 'Device Name',
          sortable: true,
        },
        {
          key: 'deviceHealth',
          label: 'Device Health',
          sortable: true,
          formatter: sortBool,
          sortByFormatted: true,
        },
      ]"
      sort-by="deviceName"
      hover
      outlined
      responsive
      data-cy="devices-table"
    >
      <template v-slot:cell(deviceName)="row">
        <DeviceLink
          :group-name="groupName"
          :device-name="row.item.deviceName"
          :type="row.item.type"
          :context="row.item.type === 'thermal' ? 'visits' : 'recordings'"
        />
      </template>
      <template v-slot:cell(deviceHealth)="row">
        <span
          :class="[{ healthy: row.item.isHealthy }, 'device-health']"
          v-if="row.item.type === 'thermal'"
        >
          <font-awesome-icon
            v-if="row.item.isHealthy"
            icon="heart"
            class="icon"
          />
          <font-awesome-icon v-else icon="heart-broken" class="icon" />
        </span>
        <b-spinner v-if="!row.item.type" type="border" small />
        <font-awesome-icon
          v-else-if="row.item.type !== 'thermal'"
          icon="question"
          class="icon"
        />
      </template>
    </b-table>
  </div>
</template>

<script lang="ts">
import Help from "@/components/Help.vue";
import DeviceLink from "@/components/DeviceLink.vue";
import GroupLink from "@/components/GroupLink.vue";

export default {
  name: "DevicesTab",
  components: {
    DeviceLink,
    GroupLink,
    Help,
  },
  props: {
    isGroupAdmin: { type: Boolean, default: false },
    devices: { type: Array, required: true },
    loading: { type: Boolean, default: false },
    groupName: { type: String, required: true },
  },
  methods: {
    sortBool(_v, _k, i) {
      return `${i.type}_${i.isHealthy}`;
    },
  },
  computed: {
    groupHasDevices() {
      return this.devices.length !== 0;
    },
    tableItems() {
      return this.devices.map((device) => ({
        ...device,
        _rowVariant: device.hasOwnProperty("isHealthy")
          ? device.isHealthy
            ? "okay"
            : "warn"
          : "empty",
      }));
    },
  },
};
</script>

<style lang="scss">
@import "~bootstrap/scss/functions";
@import "~bootstrap/scss/variables";
@import "~bootstrap/scss/mixins";

.device-health {
  color: #555;
  &.healthy {
    color: darkgreen;
  }
}
.table-okay {
  border-left: 10px solid #cff1d7;
}
.table-warn {
  border-left: 10px solid #eecccf;
}
.table-empty {
  border-left: 10px solid #ddd;
}
.spinner {
  color: #ccc;
}
</style>
