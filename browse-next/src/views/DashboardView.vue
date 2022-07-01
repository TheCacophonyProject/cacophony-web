<script setup lang="ts">
import SectionHeader from "@/components/SectionHeader.vue";
import { computed, onMounted, ref, watch } from "vue";
import { getAllVisitsForGroup } from "@api/Monitoring";
import { currentSelectedGroup } from "@models/LoggedInUser";
import type { ApiVisitResponse } from "@typedefs/api/monitoring";
import HorizontalOverflowCarousel from "@/components/HorizontalOverflowCarousel.vue";
import type { ApiStationResponse } from "@typedefs/api/station";
import { getStationsForGroup } from "@api/Group";
import GroupVisitsSummary from "@/components/GroupVisitsSummary.vue";
import StationVisitSummary from "@/components/StationVisitSummary.vue";

const audioMode = ref<boolean>(false);

// TODO - Reload these from user preferences.
const timePeriodDays = ref<number>(7);
const visitsOrRecordings = ref<"visits" | "recordings">("visits");
const speciesOrStations = ref<"species" | "station">("species");

const loadingVisits = ref<boolean>(false);
const loadingVisitsProgress = ref<number>(0);
const visits = ref<ApiVisitResponse[]>([]);

const ignored: string[] = [
  "unknown",
  "none",
  "unidentified",
  "false-positive",
  "bird",
];

const visitorIsPredator = (visit: ApiVisitResponse) =>
  visit && visit.classification && !ignored.includes(visit.classification);

const predatorVisits = computed<ApiVisitResponse[]>(() =>
  visits.value.filter(visitorIsPredator)
);

const speciesSummary = computed<Record<string, number>>(() => {
  return predatorVisits.value.reduce(
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
const now = new Date();
const earliestDate = computed<Date>(() => {
  return new Date(now.setDate(now.getDate() - timePeriodDays.value));
});

const loadVisits = async () => {
  if (currentSelectedGroup.value) {
    loadingVisits.value = true;
    const allVisits = await getAllVisitsForGroup(
      currentSelectedGroup.value.id,
      timePeriodDays.value,
      (val) => {
        // TODO - Do we want to display loading progress via the UI?
        loadingVisitsProgress.value = val;
      }
    );
    visits.value = allVisits.visits;
    loadingVisits.value = false;
  }
};

watch(timePeriodDays, loadVisits);
watch(currentSelectedGroup, loadVisits);
// I don't think the underlying data changes?
//watch(visitsOrRecordings, reloadDashboard);
//watch(speciesOrStations, reloadDashboard);

const stations = ref<ApiStationResponse[]>([]);
const loadingStations = ref(false);
const stationsWithRecordingsInSelectedTimeWindow = computed<
  ApiStationResponse[]
>(() => {
  return stations.value.filter((station) => {
    if (audioMode.value) {
      return (
        station.lastAudioRecordingTime &&
        new Date(station.lastAudioRecordingTime) > earliestDate.value
      );
    } else {
      return (
        station.lastThermalRecordingTime &&
        new Date(station.lastThermalRecordingTime) > earliestDate.value
      );
    }
  });
});

const loadStations = async () => {
  if (currentSelectedGroup.value) {
    loadingStations.value = true;
    const stationsResponse = await getStationsForGroup(
      currentSelectedGroup.value.id.toString(),
      true
    );
    if (stationsResponse.success) {
      stations.value = stationsResponse.result.stations;
    }
    loadingStations.value = false;
  }
};

onMounted(async () => {
  await Promise.all([loadStations(), loadVisits()]);
  // Load visits for time period.
  // Get species summary.
});
</script>
<template>
  <div class="header-container">
    <section-header>Dashboard</section-header>
    <div class="dashboard-scope mt-sm-3 d-sm-flex flex-column align-items-end">
      <div class="d-flex align-items-center">
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
      <div class="scope-filters d-flex align-items-center">
        <span>View </span
        ><select
          class="form-select form-select-sm"
          v-model="visitsOrRecordings"
        >
          <option>visits</option>
          <option>recordings</option></select
        ><span> in the last </span
        ><select class="form-select form-select-sm" v-model="timePeriodDays">
          <option value="1">24 hours</option>
          <option value="3">3 days</option>
          <option value="7">7 days</option></select
        ><span> grouped by </span
        ><select class="form-select form-select-sm" v-model="speciesOrStations">
          <option>species</option>
          <option>station</option>
        </select>
      </div>
    </div>
  </div>
  <h2>Species summary</h2>
  <horizontal-overflow-carousel class="species-summary-container mb-5">
    <div class="card-group species-summary flex-nowrap">
      <div
        v-for="[key, val] in Object.entries(speciesSummary)"
        :key="key"
        class="card d-flex flex-row species-summary-item align-items-center"
      >
        <img width="24" height="auto" class="species-icon ms-3" />
        <div class="d-flex justify-content-evenly flex-column ms-3 pe-3">
          <div class="species-count fs-4 lh-sm">{{ val }}</div>
          <div class="species-name fs-6 lh-sm small">{{ key }}</div>
        </div>
      </div>
    </div>
  </horizontal-overflow-carousel>
  <h2>Visits summary</h2>
  <group-visits-summary
    class="mb-5"
    :stations="stationsWithRecordingsInSelectedTimeWindow"
    :visits="predatorVisits"
  />

  <h2>Stations summary</h2>
  <horizontal-overflow-carousel class="mb-5">
    <!--   TODO - Media breakpoint at which the carousel stops being a carousel? -->
    <div class="card-group species-summary flex-nowrap">
      <station-visit-summary
        v-for="(station, index) in stationsWithRecordingsInSelectedTimeWindow"
        :station="station"
        :stations="stationsWithRecordingsInSelectedTimeWindow"
        :visits="predatorVisits"
        :key="index"
      />
    </div>
  </horizontal-overflow-carousel>
</template>
<style lang="less" scoped>
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
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.1);
  background: white;
}

.species-summary {
  min-height: 68px;
  user-select: none;
  .card {
    border-radius: unset;
    border-left-width: 0;
    border-bottom-width: 0;
    border-top-width: 0;
  }
  .species-icon {
    width: 24px;
    background: #aaa;
    min-height: 24px;
  }
  .species-summary-item {
    padding: 2px;
    min-width: 130px; // TODO @media breakpoints
  }
  .species-count {
    font-weight: 500;
  }
  .species-name {
    //font-size
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
