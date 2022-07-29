<script setup lang="ts">
import type { ApiVisitResponse } from "@typedefs/api/monitoring";
import { computed, ref } from "vue";
import {
  timezoneForLocation,
  visitsCountBySpecies as visitsCountBySpeciesCalc,
} from "@models/VisitsUtils";
import { DateTime } from "luxon";
import type { LatLng } from "@typedefs/api/common";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { visits, startTime, isNocturnal, location } = defineProps<{
  visits: ApiVisitResponse[];
  startTime: DateTime;
  isNocturnal: boolean;
  location: LatLng;
}>();

const endTime = computed<DateTime>(() => startTime.plus({ day: 1 }));
const visitCountBySpecies = computed<[string, number][]>(() =>
  visitsCountBySpeciesCalc(visits)
);

const periodInProgress = computed<boolean>(() => {
  return endTime.value.toJSDate() > new Date();
});

const nightOfRange = computed<string>(() => {
  // TODO: Check to see if the current "night" is still in progress - i.e. it's before 30mins after dawn.
  //  add (in progress) to the header.
  // TODO: In the future we may want to make this hard-coded value reflect the camera recording window preferences for cameras in this group.
  let range;
  if (startTime.monthLong === endTime.value.monthLong) {
    range = `Night of ${startTime.day}&ndash;${endTime.value.day} ${startTime.monthLong} ${startTime.year}`;
  } else if (startTime.year === endTime.value.year) {
    range = `Night of ${startTime.day} ${startTime.monthLong}&ndash;${endTime.value.day} ${endTime.value.monthLong} ${startTime.year}`;
  }
  range = `Night of ${startTime.day} ${startTime.monthLong} ${startTime.year}&ndash;${endTime.value.day} ${endTime.value.monthLong} ${endTime.value.year}`;
  if (periodInProgress.value) {
    return `${range} (in progress)`;
  }
  return range;
});

const capitalize = (str: string): string =>
  `${str.slice(0, 1).toUpperCase()}${str.slice(1)}`;

const showVisitsDetail = ref(false);
const toggleVisitsDetail = (e: Event) => {
  e.preventDefault();
  e.stopPropagation();
  if (hasVisits.value) {
    showVisitsDetail.value = !showVisitsDetail.value;
  }
};
const openDetailIfClosed = (e: Event) => {
  e.preventDefault();
  e.stopPropagation();
  if (!showVisitsDetail.value && hasVisits.value) {
    showVisitsDetail.value = true;
  }
};
const hasVisits = computed<boolean>(() => {
  return visitCountBySpecies.value.length !== 0;
});

const visitTime = (timeIsoString: string) => {
  const zone = timezoneForLocation(location);
  return DateTime.fromISO(timeIsoString, { zone }).toString();
};
</script>
<template>
  <div
    class="visits-daily-breakdown mb-3"
    @click="openDetailIfClosed"
  >
    <div
      class="header p-2 d-flex justify-content-between user-select-none"
      @click="toggleVisitsDetail"
    >
      <div>
        <span v-if="isNocturnal" v-html="nightOfRange" />
        <span v-else>
          {{ startTime.day }} {{ startTime.monthLong }}
          {{ periodInProgress ? "(in progress)" : "" }}
        </span>
      </div>
      <font-awesome-icon
        v-if="hasVisits"
        class="px-2"
        icon="chevron-right"
        :rotation="showVisitsDetail ? 270 : 90"
      />
    </div>
    <div v-if="!showVisitsDetail">
      <div class="no-activity p-3" v-if="!hasVisits">No activity</div>
      <div v-else class="visits-species-count p-3">
        <div
          v-for="([classification, count], index) in visitCountBySpecies"
          :class="[classification, 'visit-species-count']"
          :key="index"
        >
          <span class="count">{{ count }}</span>
          <span class="species">{{ capitalize(classification) }}</span>
        </div>
      </div>
    </div>
    <div v-else class="p-3">
      <div v-for="(visit, index) in visits" :key="index">
        <span>#recordings {{ visit.recordings.length }}</span>
        <span>class: {{ visit.classification }}</span>
        <span>station: {{ visit.stationName }}</span>
        <span>Time: {{ visitTime(visit.timeStart) }}</span>
      </div>
    </div>
  </div>
</template>
<style scoped lang="less">
.visits-daily-breakdown {
  width: 540px;
  background: white;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.1);

  .header {
    border-bottom: 1px solid #eee;
    font-size: 13px;
    font-weight: 500;
  }
  .visit-species-count {
    border-radius: 2px;
    color: #444444;
    display: inline-block;
    height: 24px;
    line-height: 24px;
    font-size: 12px;
    &:not(:first-child) {
      margin-left: 21px;
    }
    .species {
      padding: 0 5px;
    }
    .count {
      background: #7d7d7d;
      border-top-left-radius: 2px;
      border-bottom-left-radius: 2px;
      color: white;
      text-align: center;
      padding: 0 2px;
      min-width: 21px;
      font-weight: 500;
      display: inline-block;
    }
    background: rgba(125, 125, 125, 0.1);
    &.mustelid {
      background: rgba(173, 0, 0, 0.1);
      .count {
        background: #ad0000;
      }
    }
    &.possum,
    &.cat {
      background: rgba(163, 0, 20, 0.1);
      .count {
        background: #a30014;
      }
    }
    &.rodent,
    &.hedgehog {
      background: rgba(163, 96, 0, 0.1);
      .count {
        background: #a36000;
      }
    }
  }
}
</style>
