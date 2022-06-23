<script setup lang="ts">
import SectionHeader from "@/components/SectionHeader.vue";
import { onMounted, ref, watch } from "vue";
import { getAllVisitsForGroup } from "@api/Monitoring";
import { currentSelectedGroup } from "@models/LoggedInUser";

const audioMode = ref<boolean>(false);

// TODO - Reload these from user preferences.
const timePeriodDays = ref<number>(60);
const visitsOrRecordings = ref<"visits" | "recordings">("visits");
const speciesOrStations = ref<"species" | "station">("species");

const loading = ref<boolean>(false);

const reloadDashboard = async () => {
  if (currentSelectedGroup.value) {
    loading.value = true;
    const visits = await getAllVisitsForGroup(
      currentSelectedGroup.value.id,
      timePeriodDays.value
      // TODO - use progress?
    );
    console.log(visits);
    loading.value = false;
  }
};

watch(timePeriodDays, reloadDashboard);
// I don't think the underlying data changes?
//watch(visitsOrRecordings, reloadDashboard);
//watch(speciesOrStations, reloadDashboard);

onMounted(async () => {
  await reloadDashboard();
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
          <option value="7">7 days</option>
          <option value="30">1 month</option></select
        ><span> grouped by </span
        ><select class="form-select form-select-sm" v-model="speciesOrStations">
          <option>species</option>
          <option>station</option>
        </select>
      </div>
    </div>
  </div>
  <h2>Species summary</h2>
  <div style="background: #ccc; height: 93px" class="mb-5"></div>

  <h2>Visits summary</h2>
  <div style="background: #ccc; height: 500px" class="mb-5"></div>

  <h2>Stations summary</h2>
  <div style="background: #ccc; height: 500px"></div>
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
