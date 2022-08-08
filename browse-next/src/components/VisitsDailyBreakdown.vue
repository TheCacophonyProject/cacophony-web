<script setup lang="ts">
import type { ApiVisitResponse } from "@typedefs/api/monitoring";
import { computed, ref } from "vue";
import {
  timezoneForLocation,
  visitsCountBySpecies as visitsCountBySpeciesCalc,
} from "@models/visitsUtils";
import { DateTime, Duration } from "luxon";
import type { IsoFormattedDateString, LatLng } from "@typedefs/api/common";
import * as sunCalc from "suncalc";
import { API_ROOT } from "@api/api";

// TODO: Change this to just after sunset - we should show the new in progress night, with no activity.
// TODO: Empty nights in our time window should still show, assuming we had heartbeat events during them?
//  Of course, we don't currently do this.

const now = new Date();
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
  const { sunrise } = sunCalc.getTimes(
    endTime.value.toJSDate(),
    location.lat,
    location.lng
  );
  return endTime.value.toJSDate() > now && sunrise > now;
});

interface EventItem {
  type: "sun" | "visit";
  name: string;
  timeStart: IsoFormattedDateString;
}

interface VisitEventItem extends EventItem {
  type: "visit";
  data: ApiVisitResponse;
}

interface SunEventItem extends EventItem {
  type: "sun";
}

const visitEvents = computed<(VisitEventItem | SunEventItem)[]>(() => {
  // Take visits and interleave sunrise/sunset events.
  // TODO - When visits are loaded, should we make the timeStart and timeEnd be Dates?
  const events = [];
  let usedSunrise = false;
  {
    const visit = visits[0];
    const { sunrise, sunset } = sunCalc.getTimes(
      new Date(visit.timeStart),
      location.lat,
      location.lng
    );
    const useSunset =
      sunset > startTime.toJSDate() && sunset < endTime.value.toJSDate();
    const useSunrise =
      sunrise > startTime.toJSDate() && sunrise < endTime.value.toJSDate();
    if (useSunrise && sunrise < new Date(visit.timeStart)) {
      events.push({
        type: "sun",
        name: "Sunrise",
        timeStart: sunrise.toISOString(),
      } as SunEventItem);
      usedSunrise = true;
    }
    if (useSunset && sunset < new Date(visit.timeStart)) {
      events.push({
        type: "sun",
        name: "Sunset",
        timeStart: sunset.toISOString(),
      } as SunEventItem);
    }
    events.push({
      type: "visit",
      name: visit.classification,
      timeStart: visit.timeStart,
      data: visit,
    } as VisitEventItem);
  }

  for (let i = 1; i < visits.length; i++) {
    const visit = visits[i];
    const prevVisit = visits[i - 1];
    const { sunrise, sunset } = sunCalc.getTimes(
      new Date(visit.timeStart),
      location.lat,
      location.lng
    );
    const useSunset =
      sunset > startTime.toJSDate() && sunset < endTime.value.toJSDate();
    const useSunrise =
      sunrise > startTime.toJSDate() && sunrise < endTime.value.toJSDate();
    if (
      useSunrise &&
      sunrise > new Date(prevVisit.timeStart) &&
      sunrise < new Date(visit.timeStart)
    ) {
      events.push({
        type: "sun",
        name: "Sunrise",
        timeStart: sunrise.toISOString(),
      } as SunEventItem);
      usedSunrise = true;
    }
    if (
      useSunset &&
      sunset > new Date(prevVisit.timeStart) &&
      sunset < new Date(visit.timeStart)
    ) {
      events.push({
        type: "sun",
        name: "Sunset",
        timeStart: sunset.toISOString(),
      } as SunEventItem);
    }
    events.push({
      type: "visit",
      name: visit.classification,
      timeStart: visit.timeStart,
      data: visit,
    } as VisitEventItem);

    if (
      i === visits.length - 1 &&
      sunrise < now &&
      sunrise > new Date(visit.timeStart) &&
      !usedSunrise
    ) {
      // Add the sunrise at the end if it hasn't been added
      events.push({
        type: "sun",
        name: "Sunrise",
        timeStart: sunrise.toISOString(),
      } as SunEventItem);
    } else if (i === visits.length - 1 && !usedSunrise) {
      events.push({
        type: "sun",
        name: "now",
        timeStart: now.toISOString(),
      } as SunEventItem);
    }
  }
  return events;
});

const nightOfRange = computed<string>(() => {
  // TODO: In the future we may want to make this hard-coded sunrise/sunset offset value reflect the camera recording window preferences for cameras in this group.
  let range = "";
  if (startTime.monthLong === endTime.value.monthLong) {
    range = `Night of ${startTime.day}&ndash;${endTime.value.day} ${startTime.monthLong} ${startTime.year}`;
  } else if (startTime.year === endTime.value.year) {
    range = `Night of ${startTime.day} ${startTime.monthLong}&ndash;${endTime.value.day} ${endTime.value.monthLong} ${startTime.year}`;
  }
  if (periodInProgress.value) {
    return `${range} (in progress)`;

    // TODO: Should partial nights that are part of the end of the window be marked as partial, or should we go all the
    //  way back to the beginning of the night?  Maybe just have the header have the day that it spans, i.e. if before
    //  midnight is cropped, just have the date of the morning?
  }
  return range;
});

const capitalize = (str: string): string =>
  `${str.slice(0, 1).toUpperCase()}${str.slice(1)}`;

const truncateLongStationNames = (str: string): string => {
  const split = str.indexOf("_");
  if (split !== -1 && str.length > 30) {
    return str.slice(0, split) + "...";
  }
  return str;
};

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
  const localTime = DateTime.fromISO(timeIsoString, { zone });
  return localTime
    .toLocaleString({
      hour: "numeric",
      minute: "2-digit",
      hourCycle: "h12",
    })
    .replace(/ /g, "");
};

const visitDuration = (visit: ApiVisitResponse): string => {
  const millis =
    new Date(visit.timeEnd).getTime() - new Date(visit.timeStart).getTime();
  const minsSecs = Duration.fromMillis(millis).shiftTo("minutes", "seconds");
  if (minsSecs.minutes > 0) {
    return minsSecs.toFormat("m'm''&nbsp;'ss's'");
  }
  return minsSecs.toFormat("ss's'");
};

const thumbnailSrcForVisit = (visit: ApiVisitResponse): string => {
  return `${API_ROOT}/api/v1/recordings/${visit.recordings[0].recId}/thumbnail`;
};
</script>
<template>
  <div class="visits-daily-breakdown mb-3" @click="openDetailIfClosed">
    <div
      class="header p-2 d-flex justify-content-between user-select-none align-items-center"
      @click="toggleVisitsDetail"
    >
      <div>
        <span v-if="isNocturnal" v-html="nightOfRange" />
        <span v-else>
          {{ startTime.day }} {{ startTime.monthLong }} {{ startTime.year }}
          {{ periodInProgress ? "(in progress)" : "" }}
        </span>
        <span v-if="isNocturnal" class="night-icon px-2"
          ><font-awesome-icon icon="moon"
        /></span>
      </div>
      <font-awesome-icon
        v-if="hasVisits"
        class="px-2"
        size="sm"
        icon="chevron-right"
        :rotation="showVisitsDetail ? 270 : 90"
      />
    </div>
    <div v-if="!showVisitsDetail">
      <div class="no-activity p-3" v-if="!hasVisits">No activity</div>
      <div v-else class="visits-species-count p-3 user-select-none">
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
      <div
        v-for="(visit, index) in visitEvents"
        :key="index"
        class="visit-event-item d-flex user-select-none"
        :class="[visit.type]"
      >
        <div class="visit-time-duration d-flex flex-column py-2 pe-2">
          <span class="pb-1">{{ visitTime(visit.timeStart) }}</span>
          <span
            class="duration"
            v-if="visit.type === 'visit'"
            v-html="visitDuration(visit.data)"
          ></span>
        </div>
        <div class="visit-timeline">
          <div class="circle"></div>
        </div>
        <div v-if="visit.type === 'sun'" class="py-2 ps-2">
          {{ visit.name }}
        </div>
        <div v-else class="d-flex py-2 ps-2">
          <div class="visit-thumb">
            <img
              :src="thumbnailSrcForVisit(visit.data)"
              alt="Thumbnail for first recording of this visit"
              width="45"
              height="45"
            />
            <span class="num-recordings px-1">{{
              visit.data.recordings.length
            }}</span>
          </div>
          <div class="pb-3 ps-2 d-flex flex-column">
            <div>
              <span class="visit-species-tag px-1 mb-1" :class="[visit.name]">{{
                capitalize(visit.name)
              }}</span>
            </div>
            <span
              ><font-awesome-icon
                icon="map-marker-alt"
                size="xs"
                class="station-icon pe-1"
              />{{ truncateLongStationNames(visit.data.stationName) }}</span
            >
          </div>
        </div>
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
.sun {
  color: #aaa;
}
.night-icon {
  color: rgba(0, 0, 0, 0.2);
}
.visit-event-item {
  font-size: 12px;
  line-height: 14px;
  transition: background-color linear 0.2s;
  border-radius: 3px;
  &:hover:not(&.sun) {
    background: #eee;
  }

  .visit-time-duration {
    width: 70px;
    color: #666;
    text-align: right;
    .duration {
      font-size: 10px;
    }
  }
  &.sun {
    .visit-time-duration {
      color: #aaa;
    }
  }
  .visit-thumb {
    width: 45px;
    height: 45px;
    overflow: hidden;
    position: relative;
    background: #aaa;
    .num-recordings {
      background: rgba(0, 0, 0, 0.8);
      color: white;
      position: absolute;
      bottom: 0;
      left: 0;
    }
  }
  .visit-timeline {
    border-left: 1px solid #ddd;
    .circle {
      margin-top: 12px;
      width: 6px;
      height: 6px;
      border-radius: 3px;
      background: white;
      transform: translateX(-3.5px);
      border: 1px solid #ddd;
    }
  }
  .visit-species-tag {
    background: #999;
    color: white;
    display: inline-block;
    border-radius: 3px;
    line-height: 20px;
    font-weight: 500;
    &.mustelid {
      background: #ad0000;
    }
    &.possum,
    &.cat {
      background: #a30014;
    }
    &.rodent,
    &.hedgehog {
      background: #a36000;
    }
  }
  .station-icon {
    color: rgba(0, 0, 0, 0.5);
  }
}
</style>