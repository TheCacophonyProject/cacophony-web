<template>
  <b-container fluid class="admin outer">
    <MapWithPoints
      v-if="station"
      :height="200"
      :radius="60"
      :can-change-base-map="false"
      :is-interactive="false"
      :zoom="false"
      :points="[{ name: station.name, location }]"
    ></MapWithPoints>
    <b-jumbotron class="jumbotron" fluid>
      <div>
        <h1 class="d-inline-block">
          <GroupLink
            :group-name="groupName"
            context="stations"
            :use-link="userIsMemberOfGroup"
          />
          <font-awesome-icon
            icon="chevron-right"
            size="xs"
            style="color: #666; font-size: 16px"
          />
          <StationLink
            :group-name="groupName"
            :station-name="stationName"
            context="visits"
          />
          <span v-if="stationIsRetired">(retired)</span>
        </h1>
      </div>
      <div v-if="userIsGroupAdmin">
        <p class="lead d-sm-none d-md-inline-block">Manage this station.</p>
      </div>
    </b-jumbotron>
    <div v-if="!loadedStation" class="container no-tabs">
      Loading station...
      <spinner />
    </div>
    <div v-else-if="station" class="tabs-container">
      <tab-list v-model="currentTabIndex">
        <tab-list-item lazy>
          <template #title>
            <TabTemplate
              title="Visits"
              :isLoading="visitsCountLoading"
              :value="visitsCount"
            />
          </template>
          <MonitoringTab
            :group-name="groupName"
            :station-name="stationName"
            :visits-query="visitsQuery()"
          />
        </tab-list-item>
        <tab-list-item lazy>
          <template #title>
            <TabTemplate
              title="Reference photos"
              :isLoading="!loadedStation"
              :value="referencePhotos.length"
            />
          </template>
          <StationReferencePhotosTab :station="station" />
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
            :station-name="stationName"
            :recordings-query="recordingsQueryFinal"
          />
        </tab-list-item>
      </tab-list>
    </div>
    <div v-else class="container no-tabs">
      Sorry but group <i> &nbsp; {{ groupName }} &nbsp; </i> does not have a
      station called <i> &nbsp; {{ stationName }}</i
      >.
    </div>
  </b-container>
</template>

<script lang="ts">
import { mapState } from "vuex";
import Spinner from "../components/Spinner.vue";
import api from "../api";
import TabTemplate from "@/components/TabTemplate.vue";
import RecordingsTab from "@/components/RecordingsTab.vue";
import MonitoringTab from "@/components/MonitoringTab.vue";
import { latLng } from "leaflet";
import { isViewingAsOtherUser } from "@/components/NavBar.vue";
import { shouldViewAsSuperUser } from "@/utils";
import MapWithPoints from "@/components/MapWithPoints.vue";
import GroupLink from "@/components/GroupLink.vue";
import StationLink from "@/components/StationLink.vue";
import TabList from "@/components/TabList.vue";
import TabListItem from "@/components/TabListItem.vue";
import StationReferencePhotosTab from "@/components/StationReferencePhotosTab.vue";

// TODO(jon): Implement visits/monitoring page for stations - this will require API changes.

export default {
  name: "StationView",
  components: {
    StationReferencePhotosTab,
    StationLink,
    GroupLink,
    MapWithPoints,
    Spinner,
    TabTemplate,
    RecordingsTab,
    TabList,
    TabListItem,
    MonitoringTab,
  },
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
    userIsMemberOfGroup(): boolean {
      return this.userIsSuperUserAndViewingAsSuperUser || !!this.group;
    },
    userIsGroupAdmin() {
      return (
        this.userIsSuperUserAndViewingAsSuperUser ||
        (this.group && this.group.admin)
      );
    },
    stationName() {
      return this.$route.params.stationName;
    },
    groupName() {
      return this.$route.params.groupName;
    },
    currentTabName() {
      return this.$route.params.tabName;
    },
    stationId() {
      return this.$route.params.stationId;
    },
    location() {
      if (this.station) {
        return latLng(this.station.location.lat, this.station.location.lng);
      }
      return null;
    },
    referencePhotos(): string[] {
      return (
        (this.station.settings && this.station.settings.referenceImages) || []
      );
    },
    currentTabIndex: {
      get() {
        return Math.max(0, this.tabNames.indexOf(this.currentTabName));
      },
      set(tabIndex) {
        const nextTabName = this.tabNames[tabIndex];
        if (nextTabName !== this.currentTabName) {
          let name = "station";
          const params: any = {
            groupName: this.groupName,
            stationName: this.stationName,
            tabName: nextTabName,
          };
          if (this.stationId) {
            params.stationId = this.stationId;
            name = "station-id";
          }
          this.$router.push({
            name,
            params,
          });
        }
      },
    },
  },
  data() {
    return {
      loadedStation: false,
      recordingsCountLoading: false,
      visitsCountLoading: false,
      recordingsCount: 0,
      visitsCount: 0,
      recordingsQueryFinal: {},
      visitsQueryFinal: {},
      station: null,
      stationIsRetired: false,
      group: {},
      tabNames: ["visits", "reference-photos", "recordings"],
    };
  },
  async mounted() {
    const nextTabName = this.tabNames[this.currentTabIndex];
    if (nextTabName !== this.currentTabName) {
      let name = "station";
      const params: any = {
        groupName: this.groupName,
        stationName: this.stationName,
        tabName: nextTabName,
      };
      if (this.stationId) {
        params.stationId = this.stationId;
        name = "station-id";
      }
      await this.$router.replace({
        name,
        params,
      });
    }

    this.currentTabIndex = this.tabNames.indexOf(this.currentTabName);
    await this.fetchStation();
    await this.fetchVisitsCount();
  },
  methods: {
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
    async fetchStation() {
      try {
        if (!this.stationId) {
          // eslint-disable-next-line no-unused-vars
          const [groupResponse, stationsResponse] = await Promise.all([
            api.groups.getGroup(this.groupName),
            api.groups.getStationsForGroup(this.groupName, true),
          ]);
          if (groupResponse.success) {
            this.group = groupResponse.result.group;
          }
          if (stationsResponse.success) {
            const station = stationsResponse.result.stations.filter(
              (station) => station.name === this.stationName
            );
            if (station.length > 1) {
              const nonRetired = station.find(
                (item) => !item.hasOwnProperty("retiredAt")
              );
              if (nonRetired) {
                this.station = nonRetired;
              } else {
                const sortedByLatestRetired = station.sort(
                  (a, b) =>
                    new Date(a.retiredAt).getTime() -
                    new Date(b.retiredAt).getTime()
                );
                this.station = sortedByLatestRetired.pop();
                this.stationIsRetired = true;
              }
            } else if (station.length === 1) {
              this.station = station[0];
            }
          }
        } else {
          const stationResponse = await api.station.getStationById(
            this.stationId
          );
          if (stationResponse.success) {
            this.station = stationResponse.result.station;
            if (this.station.hasOwnProperty("retiredAt")) {
              this.stationIsRetired = true;
            }
          }
        }
        this.recordingsQueryFinal = {
          tagMode: "any",
          offset: 0,
          limit: 10,
          days: "all",
          station: [this.station.id],
        };
        this.recordingsCountLoading = true;
        {
          const countResponse = await api.recording.queryCount(
            this.recordingsQueryFinal
          );
          if (countResponse.success) {
            this.recordingsCount = countResponse.result.count;
          }
        }
        this.recordingsCountLoading = false;

        // this.visitsCountLoading = true;
        // {
        //   const { result } = await api.monitoring.queryVisitPage(
        //     this.recordingsQueryFinal
        //   );
        //   this.visitsCount = result.visits.length;
        // }
        // this.visitsCountLoading = false;
      } catch (e) {
        // TODO - we will move away from global error handling, and show any errors locally in the component
      }
      this.loadedStation = true;
    },
    visitsQuery() {
      return {
        page: 1,
        perPage: 100,
        days: "all",
        // TODO(jon): This should really be chunked into a per-day type thing.

        station: [this.station.id],
      };
    },
  },
};
</script>
<style lang="scss">
.admin .jumbotron {
  margin-bottom: unset;
}
.admin.outer {
  position: relative;
  .jumbotron {
    top: 0;
    position: absolute;
    width: 100%;
    background: transparent;
    z-index: 1000;
    h1,
    p.lead {
      padding: 3px;
      background: white;
    }
  }
  .tabs-container {
    position: relative;
    z-index: 1001;
    .group-tabs .card-header {
      background: unset;
    }
    .nav-item {
      border-top-left-radius: 3px;
      border-top-right-radius: 3px;
      background: transparentize(whitesmoke, 0.15);
    }
    .tabs {
      position: absolute;
      top: -53px;
      width: 100%;
    }
  }
}
</style>
