<template>
  <b-container class="tabs-container">
    <tab-list v-model="currentTabIndex">
      <tab-list-item title="About" lazy>
        <DeviceSoftware :software="software" />
      </tab-list-item>
      <tab-list-item title="All Events" lazy>
        <DeviceEvents :device="device" />
      </tab-list-item>
      <tab-list-item title="Recordings" lazy>
        <template #title>
          <TabTemplate
            title="Recordings"
            :isLoading="recordingsCountLoading"
            :value="recordingsCount"
          />
        </template>
        <RecordingsTab
          :group-name="groupName"
          :device-name="deviceName"
          :recordings-query="recordingQuery()"
        />
      </tab-list-item>
      <tab-list-item
        title="Visits"
        lazy
        v-if="!deviceType || deviceType === 'thermal'"
      >
        <template #title>
          <TabTemplate
            title="Visits"
            :isLoading="visitsCountLoading"
            :value="visitsCount"
          />
        </template>
        <MonitoringTab
          :group-name="groupName"
          :device-name="deviceName"
          :visits-query="staticVisitsQuery"
        />
      </tab-list-item>
    </tab-list>
  </b-container>
</template>

<script lang="ts">
import DeviceSoftware from "./DeviceSoftware.vue";
import DeviceEvents from "./DeviceEvents.vue";
import TabTemplate from "@/components/TabTemplate.vue";
import RecordingsTab from "@/components/RecordingsTab.vue";
import MonitoringTab from "@/components/MonitoringTab.vue";
import api from "@/api";
import TabList from "@/components/TabList.vue";
import TabListItem from "@/components/TabListItem.vue";

export default {
  name: "DeviceDetail",
  components: {
    TabList,
    TabListItem,
    RecordingsTab,
    DeviceSoftware,
    DeviceEvents,
    TabTemplate,
    MonitoringTab,
  },
  props: {
    device: {
      type: Object,
      required: true,
    },
    user: {
      type: Object,
      required: true,
    },
    software: {
      type: Object,
      required: true,
    },
  },
  data() {
    return {
      recordingsCount: 0,
      recordingsCountLoading: false,
      usersCountLoading: false,
      visitsCount: 0,
      visitsCountLoading: false,
      deviceType: null,
    };
  },
  async created() {
    // TODO - Could show users inherited from group.

    this.deviceType = this.device.type;
    const nextTabName = this.tabNames[this.currentTabIndex];
    if (nextTabName !== this.currentTabName) {
      await this.$router.replace({
        name: "device",
        params: {
          groupName: this.groupName,
          deviceName: this.deviceName,
          tabName: nextTabName,
        },
      });
    }
    this.currentTabIndex = this.tabNames.indexOf(this.currentTabName);
    await Promise.all([this.fetchRecordingCount(), this.fetchVisitsCount()]);
  },
  computed: {
    staticVisitsQuery() {
      return this.visitsQuery();
    },
    groupName() {
      return this.$route.params.groupName;
    },
    deviceName() {
      return this.$route.params.deviceName;
    },
    currentTabName() {
      return this.$route.params.tabName;
    },
    tabNames() {
      return ["about", "events", "recordings", "visits", "schedule"];
    },
    currentTabIndex: {
      get() {
        return Math.max(0, this.tabNames.indexOf(this.currentTabName));
      },
      set(tabIndex) {
        const nextTabName = this.tabNames[tabIndex];
        if (nextTabName !== this.currentTabName) {
          this.$router.push({
            name: "device",
            params: {
              groupName: this.groupName,
              deviceName: this.deviceName,
              tabName: nextTabName,
            },
          });
        }
      },
    },
  },
  methods: {
    recordingQuery() {
      return {
        tagMode: "any",
        offset: 0,
        limit: 10,
        days: "all",
        device: [this.device.id],
      };
    },
    visitsQuery() {
      return {
        page: 1,
        perPage: 100,
        days: "all",
        // TODO(jon): This should really be chunked into a per-day type thing.

        device: [this.device.id],
      };
    },
    async fetchRecordingCount() {
      this.recordingsCountLoading = true;
      const recordingCountResponse = await api.recording.queryCount(
        this.recordingQuery()
      );
      if (recordingCountResponse.success) {
        const {
          result: { count },
        } = recordingCountResponse;
        this.recordingsCount = count;
      }
      this.recordingsCountLoading = false;
    },
    async fetchVisitsCount() {
      this.visitsCountLoading = true;
      const visitsCountResponse = await api.monitoring.queryVisitPage({
        page: 1,
        perPage: 1,
        days: "all",
        device: [this.device.id],
      });
      if (visitsCountResponse.success) {
        const {
          result: {
            params: { pagesEstimate },
          },
        } = visitsCountResponse;
        this.visitsCount = pagesEstimate;
      }
      this.visitsCountLoading = false;
    },
  },
};
</script>
<style lang="scss">
.device-tabs {
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
