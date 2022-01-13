<template>
  <b-container fluid class="admin">
    <b-jumbotron class="jumbotron" fluid>
      <h1>
        <GroupLink
          :group-name="groupName"
          :context="userIsMemberOfGroup ? 'devices' : 'limited-devices'"
        />
        <font-awesome-icon
          icon="chevron-right"
          size="xs"
          style="color: #666; font-size: 16px"
        />
        <DeviceLink
          :group-name="groupName"
          :device-name="deviceName"
          :type="device && device.type"
        />
      </h1>
      <p class="lead">Manage this device.</p>
    </b-jumbotron>

    <div v-if="!loadedDevice" class="container no-tabs">
      Loading device...
      <spinner :fetching="!loadedDevice" />
    </div>
    <div v-else-if="device && device.id">
      <device-detail
        :device="device"
        :user="currentUser"
        :software="softwareDetails"
        class="dev-details"
      />
    </div>
    <div v-else class="container no-tabs">
      Sorry but group <i> &nbsp; {{ groupName }} &nbsp; </i> does not have a
      device called <i> &nbsp; {{ deviceName }}</i
      >.
    </div>
  </b-container>
</template>

<script lang="ts">
import { mapState } from "vuex";
import DeviceDetail from "../components/Devices/DeviceDetail.vue";
import Spinner from "../components/Spinner.vue";
import api from "../api";
import { isViewingAsOtherUser } from "@/components/NavBar.vue";
import { shouldViewAsSuperUser } from "@/utils";
import { ApiDeviceResponse } from "@typedefs/api/device";
import { ApiGroupResponse } from "@typedefs/api/group";
import GroupLink from "@/components/GroupLink.vue";
import DeviceLink from "@/components/DeviceLink.vue";

interface DeviceViewData {
  device: ApiDeviceResponse;
  group: ApiGroupResponse;
}

export default {
  name: "DeviceView",
  components: { DeviceLink, GroupLink, DeviceDetail, Spinner },
  computed: {
    ...mapState({
      currentUser: (state) => (state as any).User.userData,
    }),
    userIsSuperUserAndViewingAsSuperUser() {
      return (
        this.currentUser.globalPermission === "write" &&
        (isViewingAsOtherUser() || shouldViewAsSuperUser())
      );
    },
    userIsMemberOfGroup() {
      return this.group !== null;
    },
    deviceName() {
      return this.$route.params.deviceName;
    },
    groupName() {
      return this.$route.params.groupName;
    },
  },
  data(): Record<string, any> & DeviceViewData {
    return {
      loadedDevice: false,
      device: null,
      group: null,
      softwareDetails: { message: "Retrieving version information..." },
    };
  },
  watch: {
    $route() {
      const nextDevice = this.deviceName;
      if (nextDevice !== this.device.deviceName) {
        // Only if the device changed.
        this.queryDevice();
      }
    },
  },
  created() {
    this.queryDevice();
  },
  methods: {
    async queryDevice() {
      this.loadedDevice = false;
      const [groupResponse, deviceResponse] = await Promise.all([
        api.groups.getGroup(this.groupName),
        api.device.getDevice(this.groupName, this.deviceName, true),
      ]);
      if (groupResponse.success) {
        this.group = groupResponse.result.group;
      }
      if (deviceResponse.success) {
        this.device = deviceResponse.result.device;
        await this.getSoftwareDetails(this.device.id);
      }
      this.loadedDevice = true;
    },
    async getSoftwareDetails(deviceId: number) {
      try {
        const { result } = await api.device.getLatestSoftwareVersion(deviceId);
        if (result.rows.length > 0) {
          this.softwareDetails.message = "Success";
          this.softwareDetails.result = result.rows[0];
        } else {
          this.softwareDetails = {
            message: "No version information is available for this device.",
          };
        }
      } catch (e) {
        // ...
      }
    },
  },
};
</script>
<style lang="scss">
.admin .jumbotron {
  margin-bottom: unset;
}
div .dev-details {
  margin: 0;
  padding: 0;
  max-width: unset;
}

.no-tabs {
  padding: 2em 0;
}
</style>
