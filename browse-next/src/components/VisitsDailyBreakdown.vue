<script setup lang="ts">
import type { ApiVisitResponse } from "@typedefs/api/monitoring";
import type { StationId as LocationId } from "@typedefs/api/common";
import { computed, inject, ref } from "vue";
import type { Ref } from "vue";
import {
  visitsCountBySpecies as visitsCountBySpeciesCalc,
  timeAtLocation,
  visitDuration,
  VisitProcessingStates,
  someRecordingStillProcessing,
} from "@models/visitsUtils";
import type { DateTime } from "luxon";
import type { IsoFormattedDateString, LatLng } from "@typedefs/api/common";
import * as sunCalc from "suncalc";
import { API_ROOT } from "@api/root";
import {
  displayLabelForClassificationLabel,
  getClassificationForLabel,
} from "@api/Classifications";
import ImageLoader from "@/components/ImageLoader.vue";
import { RecordingProcessingState } from "@typedefs/api/consts.ts";
// TODO: Change this to just after sunset - we should show the new in progress night, with no activity.
// TODO: Empty nights in our time window should still show, assuming we had heartbeat events during them?
//  Of course, we don't currently do this.

const currentlySelectedVisit = inject(
  "currentlySelectedVisit"
) as Ref<ApiVisitResponse | null>;

const now = new Date();
const props = defineProps<{
  visits: ApiVisitResponse[];
  startTime: DateTime;
  isNocturnal: boolean;
  location: LatLng;
  currentlyHighlightedLocation?: LocationId;
}>();

const emit = defineEmits<{
  (e: "selected-visit", payload: ApiVisitResponse): void;
  (e: "change-highlighted-location", payload: LocationId | null): void;
}>();

const endTime = computed<DateTime>(() => props.startTime.plus({ day: 1 }));
const visitCountBySpecies = computed<[string, string, number][]>(() =>
  visitsCountBySpeciesCalc(props.visits)
);

const periodInProgress = computed<boolean>(() => {
  const { sunrise } = sunCalc.getTimes(
    endTime.value.toJSDate(),
    props.location.lat,
    props.location.lng
  );
  return endTime.value.toJSDate() > now && sunrise > now;
});

interface EventItem {
  type: "sun" | "visit";
  name: string;
  timeStart: IsoFormattedDateString;
  date: Date;
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
  for (const visit of props.visits) {
    if (!visit.classification) {
      debugger;
    }
  }

  const events: (VisitEventItem | SunEventItem)[] = props.visits.map(
    (visit) =>
      ({
        type: "visit",
        name: visit.classification,
        timeStart: visit.timeStart,
        data: visit,
        date: new Date(visit.timeStart),
      } as VisitEventItem)
  );

  const now = new Date();
  const endTime = events[0].date;
  const startTime = events[events.length - 1].date;
  {
    // If the startTime is *after* its own sunrise, then use the sunset from it.
    const { sunrise, sunset } = sunCalc.getTimes(
      startTime,
      props.location.lat,
      props.location.lng
    );
    if (startTime > sunrise) {
      events.push({
        type: "sun",
        name: `Sunset`,
        timeStart: sunset.toISOString(),
        date: sunset,
      } as SunEventItem);
    } else {
      // startTime is after midnight, so use the sunset from the previous day.
      const prevDay = new Date(startTime);
      prevDay.setDate(prevDay.getDate() - 1);
      const { sunset } = sunCalc.getTimes(
        prevDay,
        props.location.lat,
        props.location.lng
      );
      events.push({
        type: "sun",
        name: `Sunset`,
        timeStart: sunset.toISOString(),
        date: sunset,
      } as SunEventItem);
    }
  }
  {
    const { sunrise, sunset } = sunCalc.getTimes(
      endTime,
      props.location.lat,
      props.location.lng
    );
    if (now < sunrise) {
      // If we're before sunrise, then use the "Now" placeholder
      events.push({
        type: "sun",
        name: `Now`,
        timeStart: now.toISOString(),
        date: now,
      } as SunEventItem);
    } else if (endTime < sunrise || (endTime > sunrise && endTime < sunset)) {
      // If the endTime is *before* its own sunrise, then use the sunrise from it.
      events.push({
        type: "sun",
        name: `Sunrise`,
        timeStart: sunrise.toISOString(),
        date: sunrise,
      } as SunEventItem);
    } else {
      // Otherwise, use the sunrise from the next day.
      const endTimePlusOneDay = new Date(endTime);
      endTimePlusOneDay.setDate(endTimePlusOneDay.getDate() + 1);
      const { sunrise } = sunCalc.getTimes(
        endTimePlusOneDay,
        props.location.lat,
        props.location.lng
      );
      if (sunrise < now) {
        events.push({
          type: "sun",
          name: `Sunrise`,
          timeStart: sunrise.toISOString(),
          date: sunrise,
        } as SunEventItem);
      } else {
        events.push({
          type: "sun",
          name: `Now`,
          timeStart: now.toISOString(),
          date: now,
        } as SunEventItem);
      }
    }
  }
  events.sort((a, b) => {
    return b.date.getTime() - a.date.getTime();
  });
  return events;
});

const nightOfRange = computed<string>(() => {
  // TODO: In the future we may want to make this hard-coded sunrise/sunset offset value reflect the camera recording window preferences for cameras in this group.
  let range = "";
  if (props.startTime.monthLong === endTime.value.monthLong) {
    range = `Night of ${props.startTime.day}&ndash;${endTime.value.day} ${props.startTime.monthLong} ${props.startTime.year}`;
  } else if (props.startTime.year === endTime.value.year) {
    range = `Night of ${props.startTime.day} ${props.startTime.monthLong}&ndash;${endTime.value.day} ${endTime.value.monthLong} ${props.startTime.year}`;
  }
  if (periodInProgress.value) {
    return `${range} (in progress)`;

    // TODO: Should partial nights that are part of the end of the window be marked as partial, or should we go all the
    //  way back to the beginning of the night?  Maybe just have the header have the day that it spans, i.e. if before
    //  midnight is cropped, just have the date of the morning?
  }
  return range;
});

const showVisitsDetail = ref(false);
const toggleVisitsDetail = (e: Event) => {
  e.preventDefault();
  e.stopPropagation();
  if (hasVisits.value) {
    showVisitsDetail.value = !showVisitsDetail.value;
    if (showVisitsDetail.value) {
      // Expand
    } else {
      // Contract
    }
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

const visitTime = (timeIsoString: string) =>
  timeAtLocation(timeIsoString, props.location);

const thumbnailSrcForVisit = (visit: ApiVisitResponse): string => {
  if (visit.recordings.length) {
    return `${API_ROOT}/api/v1/recordings/${visit.recordings[0].recId}/thumbnail`;
  }
  return "";
};

const selectedVisit = (visit: VisitEventItem | SunEventItem) => {
  if (visit.type === "visit") {
    emit("selected-visit", visit.data);
  }
};

const highlightedLocation = (visit: VisitEventItem | SunEventItem) => {
  if (visit.type === "visit") {
    emit("change-highlighted-location", visit.data.stationId);
  }
};
const unhighlightedLocation = (visit: VisitEventItem | SunEventItem) => {
  if (
    visit.type === "visit" &&
    props.currentlyHighlightedLocation === visit.data.stationId
  ) {
    emit("change-highlighted-location", null);
  }
};

const isStillProcessing = computed<boolean>(() => {
  // TODO: Poll to see if processing has finished
  return visitEvents.value.some(
    (visit) =>
      visit.type === "visit" &&
      visit.data.recordings.some((rec) =>
        VisitProcessingStates.includes(rec.processingState)
      )
  );
});
</script>
<template>
  <div class="visits-daily-breakdown mb-3" @click="openDetailIfClosed">
    <div
      class="header fs-7 p-2 d-flex justify-content-between user-select-none align-items-center"
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
      <div>
        <span
          v-if="isStillProcessing"
          class="d-inline-flex align-items-center bg-light px-1 rounded-1"
        >
          <b-spinner small variant="secondary" />
          <span class="ms-2 me-1 fs-8" style="color: #7d7d7d">AI Queued</span>
        </span>
        <font-awesome-icon
          v-if="hasVisits"
          class="px-2"
          size="sm"
          icon="chevron-right"
          :rotation="showVisitsDetail ? 270 : 90"
        />
      </div>
    </div>
    <div v-if="!showVisitsDetail" class="visits-summary">
      <div class="no-activity p-3" v-if="!hasVisits">No activity</div>
      <div v-else class="visits-species-count p-3 pb-1 user-select-none">
        <div
          v-for="([classification, path, count], index) in visitCountBySpecies"
          class="fs-8 visit-species-count"
          :class="[classification, ...path.split('.')]"
          :key="index"
        >
          <span class="count text-capitalize">
            <b-spinner
              v-if="classification === 'unclassified'"
              small
              class="mx-1"
            />
            <span :class="{ 'me-1': classification === 'unclassified' }">{{
              count
            }}</span>
          </span>
          <span class="text-capitalize species d-inline-block">
            {{ displayLabelForClassificationLabel(classification) }}
          </span>
        </div>
      </div>
    </div>
    <div v-else class="p-1 visits-detail">
      <div
        v-for="(visit, index) in visitEvents"
        :key="index"
        class="visit-event-item d-flex user-select-none fs-8"
        :class="[
          visit.type,
          {
            selected:
              visit.type === 'visit' && visit.data === currentlySelectedVisit,
          },
        ]"
        @click="selectedVisit(visit)"
        @mouseenter="() => highlightedLocation(visit)"
        @mouseleave="() => unhighlightedLocation(visit)"
      >
        <div
          class="visit-time-duration d-flex flex-column py-2 pe-3 flex-shrink-0"
        >
          <span class="pb-1">{{ visitTime(visit.timeStart) }}</span>
          <span
            class="duration fs-8"
            v-if="visit.type === 'visit'"
            v-html="visitDuration(visit.data)"
          ></span>
        </div>
        <div class="visit-timeline">
          <svg
            viewBox="0 0 32 36"
            class="sun-icon"
            xmlns="http://www.w3.org/2000/svg"
            v-if="visit.type === 'sun' && visit.name === 'Sunrise'"
          >
            <rect x="0" y="0" width="32" height="36" fill="white" />
            <g transform="matrix(0.151304,0,0,0.151304,-22.1954,-34.6843)">
              <path
                fill="currentColor"
                d="M161.213,434.531L161.213,418.781L194.046,418.781L194.541,415.968C195.47,410.687 197.983,404.084 201.238,398.372L204.49,392.666L181.46,369.671L192.71,358.421L215.841,381.516L219.464,379.197C224.28,376.115 229.455,373.935 235.838,372.298L241.088,370.952L241.492,337.781L257.934,337.781L258.338,370.952L263.588,372.298C269.971,373.935 275.146,376.115 279.962,379.197L283.585,381.516L306.703,358.434L317.973,369.629L294.734,392.906L296.282,395.156C299.306,399.551 302.884,407.739 304.177,413.221L305.487,418.781L338.213,418.781L338.213,434.531L161.213,434.531ZM288.226,414.843C286.39,408.589 283.456,403.805 278.213,398.518C262.19,382.361 237.323,382.358 221.203,398.51C215.98,403.743 213.057,408.516 211.2,414.842L210.044,418.78L289.382,418.78L288.226,414.843Z"
              />
              <path
                fill="currentColor"
                d="M241.463,322.031L241.463,289.781C241.463,289.781 218.213,289.525 218.213,289.212C218.213,288.899 249.713,257.169 249.713,257.169C249.713,257.169 281.213,288.899 281.213,289.212C281.213,289.525 257.963,289.781 257.963,289.781L257.963,322.031L241.463,322.031Z"
                style="fill-rule: nonzero"
              />
            </g>
          </svg>
          <svg
            viewBox="0 0 32 36"
            class="sun-icon"
            xmlns="http://www.w3.org/2000/svg"
            v-else-if="visit.type === 'sun' && visit.name === 'Sunset'"
          >
            <rect x="0" y="0" width="32" height="36" fill="white" />
            <g transform="matrix(0.151304,0,0,0.151304,-22.1954,-34.6843)">
              <path
                fill="currentColor"
                d="M161.213,434.531L161.213,418.781L194.046,418.781L194.541,415.968C195.47,410.687 197.983,404.084 201.238,398.372L204.49,392.666L181.46,369.671L192.71,358.421L215.841,381.516L219.464,379.197C224.28,376.115 229.455,373.935 235.838,372.298L241.088,370.952L241.492,337.781L257.934,337.781L258.338,370.952L263.588,372.298C269.971,373.935 275.146,376.115 279.962,379.197L283.585,381.516L306.703,358.434L317.973,369.629L294.734,392.906L296.282,395.156C299.306,399.551 302.884,407.739 304.177,413.221L305.487,418.781L338.213,418.781L338.213,434.531L161.213,434.531ZM288.226,414.843C286.39,408.589 283.456,403.805 278.213,398.518C262.19,382.361 237.323,382.358 221.203,398.51C215.98,403.743 213.057,408.516 211.2,414.842L210.044,418.78L289.382,418.78L288.226,414.843Z"
              />
              <path
                fill="currentColor"
                class="sun-arrow"
                d="M241.463,322.031L241.463,289.781C241.463,289.781 218.213,289.525 218.213,289.212C218.213,288.899 249.713,257.169 249.713,257.169C249.713,257.169 281.213,288.899 281.213,289.212C281.213,289.525 257.963,289.781 257.963,289.781L257.963,322.031L241.463,322.031Z"
                style="fill-rule: nonzero"
              />
            </g>
          </svg>
          <div v-else class="circle"></div>
        </div>
        <div v-if="visit.type === 'sun'" class="py-2 ps-3">
          {{ visit.name }}
        </div>
        <div
          v-else
          class="d-flex py-2 ps-3 align-items-center flex-fill overflow-hidden"
        >
          <div class="visit-thumb">
            <image-loader
              :src="thumbnailSrcForVisit(visit.data)"
              alt="Thumbnail for first recording of this visit"
              width="45"
              height="45"
            />
            <span class="num-recordings px-1">{{
              visit.data.recordings.length
            }}</span>
          </div>
          <div class="ps-3 d-flex flex-column text-truncate">
            <div>
              <span
                class="visit-species-tag px-1 mb-1 text-capitalize d-inline-flex align-items-center"
                :class="[
                  visit.name,
                  ...(getClassificationForLabel(visit.name)?.path as string || '').split(
                    '.'
                  ),
                ]"
                ><b-spinner
                  small
                  class="me-1"
                  variant="light"
                  v-if="someRecordingStillProcessing(visit.data)"
                /><span v-if="someRecordingStillProcessing(visit.data)"
                  >AI Queued</span
                ><span v-else>{{
                  displayLabelForClassificationLabel(visit.name)
                }}</span>
                <font-awesome-icon
                  icon="check"
                  v-if="visit.data.classFromUserTag"
                  class="mx-1 align-middle"
                  style="padding-bottom: 2px"
                />
              </span>
              <span
                v-if="visit.data.userTagsConflict"
                class="visit-species-tag px-1 mb-1 text-capitalize ms-1 bg-warning text-black"
              >
                <font-awesome-icon icon="exclamation-triangle" />
                Controversial
              </span>
            </div>
            <span class="visit-station-name text-truncate flex-shrink-1 pe-2"
              ><font-awesome-icon
                icon="map-marker-alt"
                size="xs"
                class="station-icon pe-1 text"
              />{{ (visit as VisitEventItem).data.stationName }}</span
            >
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped lang="less">
.spinner-border-sm {
  --bs-spinner-width: 0.65rem;
  --bs-spinner-height: 0.65rem;
  --bs-spinner-border-width: 0.2em;
}

.visits-daily-breakdown {
  background: white;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.1);

  .header {
    border-bottom: 1px solid #eee;
    font-weight: 500;
  }
  .visit-species-count {
    border-radius: 2px;
    color: #444444;
    display: inline-block;
    height: 24px;
    line-height: 24px;
    margin-bottom: 10px;
    &:not(:last-child) {
      margin-right: 21px;
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
  line-height: 14px;
  transition: background-color linear 0.2s;
  border-radius: 3px;
  > * {
    pointer-events: none;
  }
  &:hover:not(&.sun) {
    background: #eee;
  }
  &.selected {
    background: #aaa;
  }
  .visit-time-duration {
    width: 70px;
    color: #666;
    text-align: right;
  }
  &.sun {
    .visit-time-duration {
      color: #aaa;
    }
  }
  .visit-thumb {
    min-width: 45px;
    max-width: 45px;
    width: 45px;
    height: 45px;
    overflow: hidden;
    position: relative;
    background: #aaa;
    border-radius: 2.5px;
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
    .sun-icon {
      margin-top: 12px;
      width: 6px;
      height: 6px;
      color: #ccc;
      background: white;
      transform: translateX(-3.5px) scale(3.5);
      .sun-arrow {
        transform-box: fill-box;
        transform-origin: center;
        transform: rotate(180deg);
      }
    }
  }
  &:first-child,
  &:last-child {
    .visit-timeline {
      position: relative;
      &::before {
        position: absolute;
        display: block;
        content: " ";
        height: 50%;
        width: 1px;
        left: -1px;
        border-left: 1px dashed white;
      }
    }
  }
  &:last-child {
    .visit-timeline {
      &::before {
        top: 15px;
        height: unset;
        bottom: 0;
      }
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
img.image-loading {
  background: red;
}
</style>
