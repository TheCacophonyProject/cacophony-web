<template>
  <b-container fluid class="admin">
    <b-jumbotron class="group-jumbotron" fluid>
      <div>
        <b-link class="back-link" :to="{ name: 'groups' }">
          <font-awesome-icon icon="angle-left" size="xs" />
          <span>Back to groups</span>
        </b-link>
      </div>
      <h1>
        <GroupLink :group-name="groupName" />
      </h1>
      <p class="lead" v-if="group && isGroupAdmin">
        Manage the users associated with this group and view the devices
        associated with it.
      </p>
      <p v-else-if="group">
        View stations, recordings, and devices associated with this group.
      </p>
    </b-jumbotron>
    <tab-list v-model="currentTabIndex" v-if="group && devices.length">
      <tab-list-item lazy title="Manual uploads" v-if="isGroupAdmin">
        <ManualRecordingUploads :devices="devices" />
      </tab-list-item>
      <tab-list-item lazy v-if="isGroupAdmin">
        <template #title>
          <TabTemplate
            title="Users"
            :isLoading="usersLoading"
            :value="users.length"
          />
        </template>
        <UsersTab
          :users="users"
          :is-group-admin="isGroupAdmin"
          :loading="usersLoading"
          :group-name="groupName"
          @user-added="() => fetchUsers()"
          @user-removed="(userName) => removedUser(userName)"
        />
      </tab-list-item>
      <tab-list-item lazy>
        <template #title>
          <TabTemplate
            title="Visits"
            :isLoading="visitsCountLoading"
            :value="visitsCount"
          />
        </template>
        <MonitoringTab
          :loading="visitsCountLoading"
          :group-name="groupName"
          :visits-query="visitsQueryFinal"
        />
      </tab-list-item>
      <tab-list-item title="Devices" lazy>
        <template #title>
          <TabTemplate
            title="Devices"
            :isLoading="devicesLoading"
            :value="devices.length"
            :has-warnings="anyDevicesAreUnhealthy"
          />
        </template>
        <DevicesTab
          :devices="devices"
          :loading="devicesLoading"
          :group-name="groupName"
        />
      </tab-list-item>
      <tab-list-item lazy>
        <template #title>
          <TabTemplate
            title="Stations"
            :isLoading="stationsLoading"
            :value="nonRetiredStationsCount"
          />
        </template>
        <StationsTab
          :items="stations"
          :loading="stationsLoading"
          :group-name="groupName"
          :is-group-admin="isGroupAdmin"
          @change="() => fetchStations()"
        />
      </tab-list-item>
      <tab-list-item lazy>
        <template #title>
          <TabTemplate
            title="Recordings"
            :isLoading="recordingsCountLoading"
            :value="recordingsCount"
          />
        </template>
        <RecordingsTab
          :loading="recordingsCountLoading"
          :group-name="groupName"
          :recordings-query="recordingQueryFinal"
        />
      </tab-list-item>
      <!--      <b-tab lazy v-if="!limitedView">-->
      <!--        <template #title>-->
      <!--          <TabTemplate-->
      <!--            title="Deleted Recordings"-->
      <!--            :isLoading="deletedRecordingsCountLoading"-->
      <!--            :value="deletedRecordingsCount"-->
      <!--          />-->
      <!--        </template>-->
      <!--        <RecordingsTab-->
      <!--          :loading="deletedRecordingsCountLoading"-->
      <!--          :group-name="groupName"-->
      <!--          :recordings-query="deletedRecordingQueryFinal"-->
      <!--        />-->
      <!--      </b-tab>-->
    </tab-list>
  </b-container>
</template>

<script lang="ts">
import { mapState } from "vuex";
import api from "@/api";
import StationsTab from "@/components/Groups/StationsTab.vue";
import UsersTab from "@/components/Groups/UsersTab.vue";
import DevicesTab from "@/components/Groups/DevicesTab.vue";
import TabTemplate from "@/components/TabTemplate.vue";
import RecordingsTab from "@/components/RecordingsTab.vue";
import { ApiGroupResponse } from "@typedefs/api/group";
import { GroupId } from "@typedefs/api/common";
import { DeviceType } from "@typedefs/api/consts";
import MonitoringTab from "@/components/MonitoringTab.vue";
import GroupLink from "@/components/GroupLink.vue";
import TabListItem from "@/components/TabListItem.vue";
import TabList from "@/components/TabList.vue";
import ManualRecordingUploads from "@/components/ManualRecordingUploads.vue";

interface GroupViewData {
  group: ApiGroupResponse | null;
  groupId: GroupId | null;
}

export default {
  name: "GroupView",
  components: {
    TabListItem,
    GroupLink,
    RecordingsTab,
    UsersTab,
    StationsTab,
    DevicesTab,
    TabTemplate,
    MonitoringTab,
    TabList,
    ManualRecordingUploads,
  },
  data(): Record<string, any> & GroupViewData {
    return {
      stationsLoading: false,
      usersLoading: false, // Loading all users on page load
      devicesLoading: false, // Loading all users on page load
      recordingsCountLoading: false,
      deletedRecordingsCountLoading: false,
      deletedRecordingsCount: 0,
      visitsCountLoading: false,
      recordingsCount: 0,
      visitsCount: 0,
      groupId: null,
      group: null,
      recordingQueryFinal: {},
      deletedRecordingQueryFinal: {},
      visitsQueryFinal: {},
      users: [],
      devices: [],
      stations: [],
      visits: [],
    };
  },
  computed: {
    ...mapState({
      currentUser: (state) => (state as any).User.userData,
    }),
    groupName() {
      return this.$route.params.groupName;
    },
    isGroupAdmin() {
      return this.group && (this.group as ApiGroupResponse).admin;
    },
    tabNames() {
      if (this.isGroupAdmin) {
        return [
          "manual-uploads",
          "users",
          "visits",
          "devices",
          "stations",
          "recordings",
        ];
      }
      return ["visits", "devices", "stations", "recordings"];
    },
    nonRetiredStationsCount(): number {
      return (
        this.stations &&
        this.stations.filter((station) => !station.hasOwnProperty("retiredAt"))
          .length
      );
    },
    currentTabName() {
      return this.$route.params.tabName;
    },
    currentTabIndex: {
      get() {
        return Math.max(0, this.tabNames.indexOf(this.currentTabName));
      },
      set(tabIndex) {
        const nextTabName = this.tabNames[tabIndex];
        if (nextTabName !== this.currentTabName) {
          this.$router.push({
            name: "group",
            params: {
              groupName: this.groupName,
              tabName: nextTabName,
            },
          });
        }
      },
    },
    anyDevicesAreUnhealthy() {
      return this.devices.some(
        (device) =>
          device.type === DeviceType.Thermal && device.isHealthy === false
      );
    },
  },
  async created() {
    const groupRequest = await api.groups.getGroup(this.groupName);
    if (groupRequest.success) {
      const {
        result: { group },
      } = groupRequest;
      this.group = group;
      this.currentTabIndex = this.tabNames.indexOf(this.currentTabName);
      await Promise.all([
        this.fetchUsers(),
        this.fetchStations(),
        this.fetchVisitsCount(),
        this.fetchDevices(),
        this.fetchRecordingCount(),
        this.fetchDeletedRecordingCount(),
      ]);
    }
    const nextTabName = this.tabNames[this.currentTabIndex];
    if (nextTabName !== this.currentTabName) {
      await this.$router.replace({
        name: "group",
        params: {
          groupName: this.groupName,
          tabName: nextTabName,
        },
      });
    }
  },
  methods: {
    recordingQuery() {
      return {
        tagMode: "any",
        offset: 0,
        limit: 10,
        page: 1,
        days: "all",
        group: [this.groupId],
      };
    },
    visitsQuery() {
      return {
        tagMode: "any",
        days: "all",
        type: "video",
        device: [],
        group: [this.groupId],
        perPage: 100,
        page: 1,
      };
    },
    async fetchUsers() {
      this.usersLoading = true;
      const usersResponse = await api.groups.getUsersForGroup(this.groupName);
      if (usersResponse.success) {
        this.users = usersResponse.result.users;
      }
      this.usersLoading = false;
    },
    async fetchDeletedRecordingCount() {
      this.deletedRecordingsCountLoading = true;
      this.groupId = this.group.id;
      this.deletedRecordingQueryFinal = {
        ...this.recordingQuery(),
        deleted: true,
      };
      const countResponse = await api.recording.queryCount({
        ...this.deletedRecordingQueryFinal,
      });
      if (countResponse.success) {
        const {
          result: { count },
        } = countResponse;
        if (count !== 0) {
          this.deletedRecordingsCount = count;
        }
      }
      this.deletedRecordingsCountLoading = false;
    },
    async fetchRecordingCount() {
      this.recordingsCountLoading = true;

      this.groupId = this.group.id;
      this.recordingQueryFinal = this.recordingQuery();

      const countResponse = await api.recording.queryCount(
        this.recordingQuery()
      );
      if (countResponse.success) {
        const {
          result: { count },
        } = countResponse;
        if (count !== 0) {
          this.recordingsCount = count;
        }
      }
      this.recordingsCountLoading = false;
    },
    async fetchVisitsCount() {
      this.visitsCountLoading = true;

      this.groupId = this.group.id;
      this.visitsQueryFinal = this.visitsQuery();

      const visitsResponse = await api.monitoring.queryVisitPage({
        ...this.visitsQuery(),
        days: "all",
        perPage: 1,
        page: 1,
      });
      if (visitsResponse.success) {
        const { result } = visitsResponse;
        this.visitsCount = `${result.params.pagesEstimate}`;
      }

      this.visitsCountLoading = false;
    },
    async fetchDevices() {
      this.devicesLoading = true;
      {
        const now = new Date();
        now.setDate(now.getDate() - 1);

        const getDevicesResponse = await api.groups.getDevicesForGroup(
          this.groupName
        );
        if (getDevicesResponse.success) {
          this.devices = getDevicesResponse.result.devices;
        }
      }
      this.devicesLoading = false;
    },
    async fetchStations() {
      this.stationsLoading = true;
      {
        const stationsResponse = await api.groups.getStationsForGroup(
          this.groupName
        );
        if (stationsResponse.success) {
          this.stations = stationsResponse.result.stations;
        }
      }
      this.stationsLoading = false;
    },
    removedUser(userName: string) {
      this.users = this.users.filter((user) => user.userName !== userName);
    },
  },
};
</script>

<style lang="scss">
.admin .group-jumbotron {
  margin-bottom: unset;
}
.group-tabs {
  .card-header {
    // Same color as the jumbotron component abutting above the tabs.
    background-color: #f8f9fa;
    .card-header-tabs {
      margin-left: auto;
      margin-right: auto;
    }
  }
}
</style>
