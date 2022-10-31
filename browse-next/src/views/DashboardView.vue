<script setup lang="ts">
import SectionHeader from "@/components/SectionHeader.vue";
import { computed, onMounted, provide, ref, watch } from "vue";
import { getAllVisitsForGroup } from "@api/Monitoring";
import { currentSelectedGroup, UserGroups } from "@models/LoggedInUser";
import type { SelectedGroup } from "@models/LoggedInUser";
import type { ApiVisitResponse } from "@typedefs/api/monitoring";
import HorizontalOverflowCarousel from "@/components/HorizontalOverflowCarousel.vue";
import RecordingViewModal from "@/components/RecordingViewModal.vue";
import type { ApiStationResponse } from "@typedefs/api/station";
import { getStationsForGroup } from "@api/Group";
import GroupVisitsSummary from "@/components/GroupVisitsSummary.vue";
import StationVisitSummary from "@/components/StationVisitSummary.vue";
import VisitsBreakdownList from "@/components/VisitsBreakdownList.vue";
import type { LatLng } from "@typedefs/api/common";
import { BSpinner } from "bootstrap-vue-3";
import type { ApiGroupResponse } from "@typedefs/api/group";
import { useRoute, useRouter } from "vue-router";
import {
  currentVisitsFilter,
  maybeFilteredVisitsContext,
  selectedVisit,
  visitHasClassification,
  visitorIsPredator,
  visitsContext,
} from "@models/SelectionContext";
import { useMediaQuery } from "@vueuse/core";
import {
  classifications,
  getClassifications,
  displayLabelForClassificationLabel,
} from "@api/Classifications";

const audioMode = ref<boolean>(false);

const router = useRouter();
const route = useRoute();
const isMobileView = useMediaQuery("(max-width: 639px)");

const maybeFilteredDashboardVisitsContext = computed<ApiVisitResponse[]>(() => {
  if (visitsContext.value) {
    return visitsContext.value.filter(visitorIsPredator);
  }
  return [];
});

// Two ways we can go about next/prev visit.  We pass the loaded visits through from the parent context,
// and then move through them as an array index.

// Otherwise, we pass the visit context/scope (group or a set of stations) to the recordings view,
// and when it reaches the end of the current visit set, it queries for prev/next visit using the visit start/end time, and the scope.
// Second option is more resilient to changes of classification, although if the classification changes, we also need to broadcast that
// to the parent list, and have that refresh...

watch(
  selectedVisit,
  (visit: ApiVisitResponse | null, prevVisit: ApiVisitResponse | null) => {
    if (visit && !prevVisit) {
      // Set route so that modal shows up
      const recordingIds = visit.recordings.map(({ recId }) => recId);
      const params = {
        visitLabel: visit.classification,
        currentRecordingId: recordingIds[0].toString(),
      };
      if (recordingIds.length > 1) {
        (params as Record<string, string>).recordingIds =
          recordingIds.join(",");
      }
      router.push({
        name: "dashboard-visit",
        params,
      });
    } else if (!visit && prevVisit) {
      // We've stopped having a selected visit modal
      currentVisitsFilter.value = null;
    }
  }
);
// Use provide to provide selected visit context to loaded modal.
// If url is saved and returned to, the best we can do is display the visit, but we can't do next/prev visits.

// TODO - Reload these from user preferences.
const timePeriodDays = ref<number>(7);
const visitsOrRecordings = ref<"visits" | "recordings">("visits");
const speciesOrStations = ref<"species" | "station">("species");
const loadingVisitsProgress = ref<number>(0);

const stations = ref<ApiStationResponse[] | null>(null);

const speciesSummary = computed<Record<string, number>>(() => {
  return maybeFilteredDashboardVisitsContext.value.reduce(
    (acc: Record<string, number>, currentValue: ApiVisitResponse) => {
      if (currentValue.classification) {
        acc[currentValue.classification] =
          acc[currentValue.classification] || 0;
        acc[currentValue.classification]++;
      }
      return acc;
    },
    {}
  );
});

const earliestDate = computed<Date>(() => {
  const now = new Date();
  return new Date(now.setUTCDate(now.getUTCDate() - timePeriodDays.value));
});

const loadVisits = async () => {
  if (currentSelectedGroup.value) {
    visitsContext.value = null;
    const allVisits = await getAllVisitsForGroup(
      currentSelectedGroup.value.id,
      timePeriodDays.value,
      (val) => {
        // TODO - Do we want to display loading progress via the UI?
        loadingVisitsProgress.value = val;
      }
    );
    visitsContext.value = allVisits.visits;
  }
};

const reloadDashboard = async () => {
  await Promise.all([loadStations(), loadVisits()]);
};

watch(timePeriodDays, loadVisits);
watch(currentSelectedGroup, reloadDashboard);

onMounted(async () => {
  if (!classifications.value) {
    await getClassifications();
  }
});
// I don't think the underlying data changes?
//watch(visitsOrRecordings, reloadDashboard);
//watch(speciesOrStations, reloadDashboard);
// TODO - Use this to show which stations *could* have had recordings, but may have had no activity.
const stationsWithOnlineOrActiveDevicesInSelectedTimeWindow = computed<
  ApiStationResponse[]
>(() => {
  if (stations.value) {
    return stations.value.filter((station) => {
      if (audioMode.value) {
        return (
          (station.lastActiveAudioTime &&
            new Date(station.lastActiveAudioTime) > earliestDate.value) ||
          (station.lastAudioRecordingTime &&
            new Date(station.lastAudioRecordingTime) > earliestDate.value)
        );
      } else {
        return (
          (station.lastActiveThermalTime &&
            new Date(station.lastActiveThermalTime) > earliestDate.value) ||
          (station.lastThermalRecordingTime &&
            new Date(station.lastThermalRecordingTime) > earliestDate.value)
        );
      }
    });
  }
  return [];
});

provide(
  "activeStationsContext",
  stationsWithOnlineOrActiveDevicesInSelectedTimeWindow
);

const allStations = computed<ApiStationResponse[]>(() => {
  if (stations.value) {
    return stations.value;
  }
  return [];
});

const loadStations = async () => {
  if (currentSelectedGroup.value) {
    stations.value = null;
    const stationsResponse = await getStationsForGroup(
      currentSelectedGroup.value.id.toString(),
      true
    );
    if (stationsResponse.success) {
      stations.value = stationsResponse.result.stations;
    } else {
      // TODO: Handle errors?
      stations.value = [];
    }
  }
};

const canonicalLocationForActiveStations = computed<LatLng>(() => {
  if (stationsWithOnlineOrActiveDevicesInSelectedTimeWindow.value.length) {
    return stationsWithOnlineOrActiveDevicesInSelectedTimeWindow.value[0]
      .location;
  }
  return { lat: 0, lng: 0 };
});

// TODO - Maybe this should be some global context variable too.
provide("locationContext", canonicalLocationForActiveStations);

onMounted(async () => {
  await reloadDashboard();
  // Load visits for time period.
  // Get species summary.
});

const isLoading = computed<boolean>(
  () => stations.value === null || visitsContext.value === null
);

const currentSelectedGroupHasAudioAndThermal = computed<boolean>(() => {
  if (currentSelectedGroup.value && UserGroups.value) {
    const group = UserGroups.value.find(
      ({ id }) => id === (currentSelectedGroup.value as SelectedGroup).id
    );
    return (
      (group as ApiGroupResponse).lastAudioRecordingTime !== undefined &&
      (group as ApiGroupResponse).lastThermalRecordingTime !== undefined
    );
  }
  return true;
});

const _hasSelectedVisit = computed<boolean>({
  get: () =>
    (route.name as string).startsWith("dashboard-visit") ||
    (route.name as string).startsWith("dashboard-recording"),
  set: (value: boolean) => {
    if (!value) {
      // Return to dashboard from modal.
      router.push({
        name: "dashboard",
        params: { groupName: route.params.groupName },
      });
      selectedVisit.value = null;
    }
  },
});

const showVisitsForTag = (tag: string) => {
  // set the selected visit to the last visit with the tag,
  // and set the filter for the context to the tag.
  currentVisitsFilter.value = visitHasClassification(tag);
  if (maybeFilteredVisitsContext.value.length) {
    selectedVisit.value = maybeFilteredVisitsContext.value[0];
  }
};

const hasVisitsForSelectedTimePeriod = computed<boolean>(() => {
  return (
    stationsWithOnlineOrActiveDevicesInSelectedTimeWindow.value.length !== 0
  );
});

// TODO: When hovering a visit entry, highlight station on the map.  What's the best way to plumb this reactivity through?
</script>
<template>
  <div class="header-container">
    <section-header>Dashboard</section-header>
    <div class="dashboard-scope mt-sm-3 d-sm-flex flex-column align-items-end">
      <div
        class="d-flex align-items-center"
        v-if="currentSelectedGroupHasAudioAndThermal"
      >
        <span
          :class="['toggle-label', 'me-2', { selected: !audioMode }]"
          @click="audioMode = false"
          >Thermal</span
        ><b-form-checkbox
          class="bi-modal-switch"
          v-model="audioMode"
          switch
        /><span
          @click="audioMode = true"
          :class="['toggle-label', { selected: audioMode }]"
          >Audio</span
        >
      </div>
      <div
        class="scope-filters d-flex align-items-sm-center flex-column flex-sm-row mb-3 mb-sm-0"
      >
        <div class="d-flex flex-row align-items-center justify-content-between">
          <span>View </span>
          <select
            class="form-select form-select-sm text-end"
            v-model="visitsOrRecordings"
          >
            <option>visits</option>
            <option>recordings</option>
          </select>
        </div>
        <div class="d-flex flex-row align-items-center justify-content-between">
          <span> in the last </span>
          <select
            class="form-select form-select-sm text-end"
            v-model="timePeriodDays"
          >
            <option value="7">7 days</option>
            <option value="1">24 hours</option>
            <option value="3">3 days</option>
          </select>
        </div>
        <div class="d-flex flex-row align-items-center justify-content-between">
          <span> grouped by </span>
          <select
            class="form-select form-select-sm text-end"
            v-model="speciesOrStations"
          >
            <option>species</option>
            <option>station</option>
          </select>
        </div>
      </div>
    </div>
  </div>
  <h2 class="dashboard-subhead" v-if="hasVisitsForSelectedTimePeriod">
    Species summary
  </h2>
  <horizontal-overflow-carousel class="species-summary-container mb-sm-5 mb-4">
    <div class="card-group species-summary flex-sm-nowrap flex-wrap d-flex">
      <div
        v-for="[key, val] in Object.entries(speciesSummary)"
        :key="key"
        class="card d-flex flex-row species-summary-item align-items-center"
        @click="showVisitsForTag(key)"
      >
        <img width="24" height="auto" class="species-icon ms-sm-3 ms-1" />
        <div
          class="d-flex justify-content-evenly flex-sm-column ms-sm-3 ms-2 pe-sm-3 pe-1 align-items-center align-items-sm-start"
        >
          <div class="species-count pe-sm-0 pe-1 lh-sm">{{ val }}</div>
          <div class="species-name lh-sm small text-capitalize">
            {{ displayLabelForClassificationLabel(key) }}
          </div>
        </div>
      </div>
    </div>
  </horizontal-overflow-carousel>
  <h2 class="dashboard-subhead" v-if="hasVisitsForSelectedTimePeriod">
    Visits summary
  </h2>
  <div class="d-md-flex flex-md-row">
    <group-visits-summary
      v-if="!isMobileView"
      class="mb-5 flex-md-fill"
      :stations="allStations"
      :active-stations="stationsWithOnlineOrActiveDevicesInSelectedTimeWindow"
      :visits="maybeFilteredDashboardVisitsContext"
      :start-date="earliestDate"
      :loading="isLoading"
    />
    <visits-breakdown-list
      :visits="maybeFilteredDashboardVisitsContext"
      :location="canonicalLocationForActiveStations"
    />
  </div>
  <h2 class="dashboard-subhead" v-if="hasVisitsForSelectedTimePeriod">
    Stations summary
  </h2>
  <horizontal-overflow-carousel class="mb-5">
    <!--   TODO - Media breakpoint at which the carousel stops being a carousel? -->
    <b-spinner v-if="isLoading" />
    <div
      class="card-group species-summary flex-sm-nowrap"
      v-else-if="hasVisitsForSelectedTimePeriod"
    >
      <station-visit-summary
        v-for="(
          station, index
        ) in stationsWithOnlineOrActiveDevicesInSelectedTimeWindow"
        :station="station"
        :active-stations="stationsWithOnlineOrActiveDevicesInSelectedTimeWindow"
        :stations="allStations"
        :visits="maybeFilteredDashboardVisitsContext"
        :key="index"
      />
    </div>
    <div v-else>
      There were no active stations in the last {{ timePeriodDays }} days for
      this group.
      <em
        >TODO: Suggest to user that they put out some devices, or make sure the
        batteries are charged?</em
      >
    </div>
  </horizontal-overflow-carousel>
  <recording-view-modal @close="selectedVisit = null" />
</template>
<style lang="less" scoped>
@import "../assets/font-sizes.less";

.group-name {
  text-transform: uppercase;
  color: #aaa;
  font-family: "Roboto Medium", "Roboto Regular", Roboto, sans-serif;
  font-weight: 500;
  // font-size: var(--bs-body-font-size);
  // FIXME - Use modified bs-body-font-size?
  font-size: 14px;
}
h1 {
  font-family: "Roboto Bold", "Roboto Regular", "Roboto", sans-serif;
  font-size: 22px;
  font-weight: 700;
  color: #444;
}
h2 {
  font-family: "Roboto Medium", "Roboto Regular", "Roboto", sans-serif;
  font-weight: 500;
  color: #444;
  font-size: 17px;
}
.header-container {
  @media screen and (min-width: 576px) {
    position: relative;
  }
}
.dashboard-scope {
  @media screen and (min-width: 576px) {
    position: absolute;
    top: 0;
    right: 0;
  }
}
.toggle-label {
  color: #999;
  font-weight: 500;
  font-size: 14px;
  transition: color 0.2s linear;
  cursor: pointer;
  user-select: none;
  &.selected {
    color: #666;
  }
}

.scope-filters {
  font-size: 14px;
  color: #999;
  .form-select {
    background-color: unset;
    border: 0;
    width: auto;
  }
  span {
    white-space: nowrap;
  }
}

.species-summary-container {
  @media screen and (min-width: 576px) {
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.1);
    background: white;
  }
}

.species-summary {
  min-height: 68px;
  user-select: none;

  .card {
    border-radius: unset;
    border-width: 0;
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.1);
    @media screen and (min-width: 576px) {
      box-shadow: unset;
      border-left-width: 0;
      border-bottom-width: 0;
      border-top-width: 0;
      border-right-width: 1px;
      margin: unset;
      &:last-child {
        border-right-width: 0;
      }
    }
  }
  .species-icon {
    width: 24px;
    background: #aaa;
    min-height: 24px;
  }
  .species-summary-item {
    &:nth-child(even) {
      margin: 0 0 4px 2px;
    }
    &:nth-child(odd) {
      margin: 0 2px 4px 0;
    }
    height: 47px;
    @media screen and (min-width: 576px) {
      height: unset;
      &:nth-child(even) {
        margin: unset;
      }
      &:nth-child(odd) {
        margin: unset;
      }
    }
    cursor: pointer;
    user-select: none;
    text-decoration: none;
    color: inherit;
    padding: 2px;
    width: calc(50% - 2px);
    min-width: 130px; // TODO @media breakpoints
    transition: background-color 0.2s ease-in-out;
    &:hover {
      background-color: #ececec;
    }
    @media screen and (min-width: 576px) {
      width: unset;
      margin: unset;
    }

    .species-count {
      font-weight: 500;
    }
    .species-name,
    .species-count {
      .fs-7();
    }
    @media screen and (min-width: 576px) {
      .species-count {
        .fs-4();
      }
      .species-name {
        .fs-6();
      }
    }
  }
}

.dashboard-subhead {
  .fs-6();
  @media screen and (min-width: 576px) {
    font-size: unset;
  }
}
</style>
<style lang="less">
.bi-modal-switch.form-check-input,
.bi-modal-switch.form-check-input:checked,
.bi-modal-switch.form-check-input:focus {
  background-color: #0d6efd;
  border-color: #0d6efd;
  position: relative;
  background-image: unset;
  &::before {
    position: absolute;
    height: 100%;
    width: 14px;
    display: block;
    content: " ";
    background-repeat: no-repeat;
    background-image: url(../assets/switch-base.svg);
    background-size: auto 100%;
    transition: transform 0.15s ease-in-out, left 0.2s ease-in-out;
  }
}
.bi-modal-switch.form-check-input {
  &::before {
    left: 0;
    transform: rotate(-180deg);
  }
}
.bi-modal-switch.form-check-input:checked {
  &::before {
    left: 16px;
    transform: rotate(0);
  }
}
</style>
