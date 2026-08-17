<script setup lang="ts">
import type { StationId as LocationId } from "@typedefs/api/common";
import { computed, inject, ref } from "vue";
import type { Ref } from "vue";
import {
  visitsCountBySpecies as visitsCountBySpeciesCalc,
  timeAtLocation,
  visitDuration,
} from "@models/visitsUtils";
import type { DateTime } from "luxon";
import type { IsoFormattedDateString, LatLng } from "@typedefs/api/common";
import * as sunCalc from "suncalc";
import { ClientApi } from "@/api";
import {
  displayLabelForClassificationLabel,
  getClassificationForLabel,
} from "@api/classificationsUtils.ts";
import ImageLoader from "@/components/ImageLoader.vue";
import { BSpinner } from "bootstrap-vue-next";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";
import LocationName from "@/components/LocationName.vue";
import type { ApiStaticVisitResponse } from "@typedefs/api/visit";
// TODO: Change this to just after sunset - we should show the new in progress night, with no activity.
// TODO: Empty nights in our time window should still show, assuming we had startup/shutdown events during them?
//  Of course, we don't currently do this.  This could be done with new "activity days" API.

const currentlySelectedVisit = inject(
  "currentlySelectedVisit",
) as Ref<ApiStaticVisitResponse | null>;

const now = new Date();
const props = defineProps<{
  visits: ApiStaticVisitResponse[];
  startTime: DateTime;
  isNocturnal: boolean;
  location: LatLng;
  currentlyHighlightedLocation?: LocationId;
}>();

const emit = defineEmits<{
  (e: "selected-visit", payload: ApiStaticVisitResponse): void;
  (e: "change-highlighted-location", payload: LocationId | null): void;
}>();

const endTime = computed<DateTime>(() => props.startTime.plus({ day: 1 }));
const visitCountBySpecies = computed<[string, string, number][]>(() =>
  visitsCountBySpeciesCalc(props.visits),
);

const periodInProgress = computed<boolean>(() => {
  const { sunrise } = sunCalc.getTimes(
    endTime.value.toJSDate(),
    props.location.lat,
    props.location.lng,
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
  data: ApiStaticVisitResponse;
}

interface SunEventItem extends EventItem {
  type: "sun";
}

const visitEvents = computed<(VisitEventItem | SunEventItem)[]>(() => {
  // Take visits and interleave sunrise/sunset events.
  const events: (VisitEventItem | SunEventItem)[] = props.visits.map(
    (visit) => {
      const classification = (
        visit.humanClassification ||
        visit.aiClassification ||
        "none"
      )
        .split(".")
        .pop();
      return {
        type: "visit",
        name: classification,
        timeStart: visit.startTime,
        data: visit,
        date: new Date(visit.startTime),
      } as VisitEventItem;
    },
  );
  const now = new Date();
  if (props.isNocturnal) {
    const endTime = events[0].date;
    const startTime = events[events.length - 1].date;
    {
      // If the startTime is *after* its own sunrise, then use the sunset from it.
      const { sunrise, sunset } = sunCalc.getTimes(
        startTime,
        props.location.lat,
        props.location.lng,
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
          props.location.lng,
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
        props.location.lng,
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
          props.location.lng,
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
  } else {
    const endTime = events[0].date;
    const { sunrise, sunset } = sunCalc.getTimes(
      endTime,
      props.location.lat,
      props.location.lng,
    );
    events.push({
      type: "sun",
      name: `Sunrise`,
      timeStart: sunrise.toISOString(),
      date: sunrise,
    } as SunEventItem);
    if (sunset < now) {
      events.push({
        type: "sun",
        name: `Sunset`,
        timeStart: sunset.toISOString(),
        date: sunset,
      } as SunEventItem);
    } else if (sunrise < endTime) {
      events.push({
        type: "sun",
        name: `Now`,
        timeStart: now.toISOString(),
        date: now,
      } as SunEventItem);
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

const thumbnailSrcForVisit = (
  visit: ApiStaticVisitResponse,
  prevUrl?: string,
): string => {
  const recId =
    visit.humanClassificationRecordingId || visit.aiClassificationRecordingId;
  const trackId =
    visit.humanClassificationTrackId || visit.humanClassificationTrackId;
  if (recId && trackId && !prevUrl) {
    return `${ClientApi.getApiRoot()}/api/v1/recordings/${recId}/thumbnail?trackId=${trackId}`;
  } else if (recId) {
    return `${ClientApi.getApiRoot()}/api/v1/recordings/${recId}/thumbnail`;
  }
  return `${ClientApi.getApiRoot()}/api/v1/recordings/${visit.recordingIds[0]}/thumbnail`;
};

const selectedVisit = (visit: VisitEventItem | SunEventItem) => {
  if (visit.type === "visit") {
    emit("selected-visit", visit.data);
  }
};

const highlightedLocation = (visit: VisitEventItem | SunEventItem) => {
  if (visit.type === "visit") {
    emit("change-highlighted-location", visit.data.locationId);
  }
};
const unhighlightedLocation = (visit: VisitEventItem | SunEventItem) => {
  if (visit.type === "visit") {
    emit("change-highlighted-location", null);
  }
};

const isStillProcessing = computed<boolean>(() => {
  // TODO: Poll to see if processing has finished
  // return visitEvents.value.some(
  //   (visit) =>
  //     visit.type === "visit" &&
  //     visit.data.recordings.some((rec) =>
  //       VisitProcessingStates.includes(rec.processingState),
  //     ),
  // );
  return false;
});
</script>
<template>
  <div class="visits-daily-breakdown mb-3" @click="openDetailIfClosed">
    <div
      class="header py-2 px-3 d-flex gap-2 justify-content-between user-select-none align-items-center"
      @click="toggleVisitsDetail"
      :class="showVisitsDetail ? 'is-expanded' : ''"
    >
      <div class="d-flex align-items-center flex-shrink-1">
        <span
          v-if="isNocturnal"
          v-html="nightOfRange"
          class="visit-title flex-shrink-1"
        />
        <span v-else class="visit-title flex-shrink-1">
          {{ startTime.day }} {{ startTime.monthLong }} {{ startTime.year }}
          {{ periodInProgress ? "(in progress)" : "" }}
        </span>
        <material-symbol
          v-if="isNocturnal"
          name="dark_mode"
          size="1.125rem"
          class="night-icon px-2"
        />
      </div>
      <div class="d-flex align-items-center flex-shrink-0">
        <material-symbol
          v-if="hasVisits"
          :name="showVisitsDetail ? 'keyboard_arrow_up' : 'keyboard_arrow_down'"
          size="1.5rem"
        />
      </div>
    </div>
    <div v-if="!showVisitsDetail" class="visits-summary">
      <div
        class="no-activity p-3 fs-6 text-body-tertiary text-center"
        v-if="!hasVisits"
      >
        No activity
      </div>
      <div
        v-else
        class="visits-species-count-wrapper d-flex flex-wrap p-3 user-select-none"
      >
        <div
          v-for="([classification, path, count], index) in visitCountBySpecies"
          class="visit-species-count"
          :data-cy="`visit species ${classification}`"
          :class="[classification, ...path.split('.')]"
          :key="index"
        >
          <span
            class="count text-capitalize d-inline-flex justify-content-center align-items-center"
          >
            <b-spinner
              v-if="classification === 'unclassified'"
              small
              variant="light"
              class="mx-1"
            />
            <span
              :class="{ 'me-1': classification === 'unclassified' }"
              data-cy="visit count"
              >{{ count }}</span
            >
          </span>
          <span class="text-capitalize species d-inline-block">
            {{ displayLabelForClassificationLabel(classification) }}
          </span>
        </div>
      </div>
    </div>
    <div v-else class="visits-detail px-2 py-3">
      <div
        v-for="(visit, index) in visitEvents"
        :key="index"
        class="visit-event-item px-1 d-flex user-select-none"
        :data-cy="`${visit.type} ${index}`"
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
          class="visit-time-duration d-flex flex-column py-2 flex-shrink-0 fs-6"
          :class="
            visit.type === 'visit' ? 'text-secondary' : 'text-body-tertiary'
          "
        >
          <span
            data-cy="visit start time"
            :class="visit.type === 'visit' ? 'lh-sm pb-1' : ''"
            >{{ visitTime(visit.timeStart) }}</span
          >
          <span
            data-cy="visit duration"
            class="duration lh-sm"
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
        <div v-if="visit.type === 'sun'" class="py-2 fs-6">
          {{ visit.name }}
        </div>
        <div
          v-else
          class="d-flex py-2 flex-fill overflow-hidden"
          :data-cy="`visit species ${visit.name}`"
        >
          <div class="visit-thumb rounded-1">
            <image-loader
              :src="thumbnailSrcForVisit(visit.data)"
              @image-not-found="
                (prevUrl) => thumbnailSrcForVisit(visit.data, prevUrl)
              "
              alt="Thumbnail for first recording of this visit"
              width="48"
              height="48"
            />
            <span
              class="num-recordings fw-medium px-1"
              data-cy="visit recording count"
              >{{ visit.data.recordingIds.length }}</span
            >
          </div>
          <div class="ps-2 ps-sm-3 overflow-hidden">
            <div class="d-flex flex-wrap align-items-center gap-1 mb-1">
              <span
                class="visit-species-tag text-capitalize d-inline-flex align-items-center"
                :class="[
                  visit.name,
                  ...(
                    (getClassificationForLabel(visit.name)?.path as string) ||
                    ''
                  ).split('.'),
                ]"
                ><span>{{
                  displayLabelForClassificationLabel(visit.name)
                }}</span>

                <material-symbol
                  v-if="visit.data.humanClassification"
                  name="check"
                  size="1.125rem"
                  class="ms-1"
                />
              </span>
              <!--              <span-->
              <!--                v-if="visit.data.userTagsConflict"-->
              <!--                class="visit-species-tag text-capitalize d-inline-flex align-items-center bg-warning text-black"-->
              <!--              >-->
              <!--                <material-symbol name="swords" size="1.125rem" class="me-1" />-->
              <!--                Controversial-->
              <!--              </span>-->
            </div>
            <span class="track-metadata d-flex align-items-center">
              <location-name
                :name="(visit as VisitEventItem).data.locationName || ''"
                truncate
                class="fs-6"
              />
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped lang="less">
@import "../assets/less/breakpoints";
@import "../assets/less/elevation";
.spinner-border-sm {
  --bs-spinner-width: 0.65rem;
  --bs-spinner-height: 0.65rem;
  --bs-spinner-border-width: 0.2em;
}

.visits-daily-breakdown {
  background: var(--bs-white);
  border-radius: var(--bs-border-radius);
  .standard-shadow();
  .header {
    cursor: pointer;
    border-bottom: 1px solid var(--border-color-light);
    border-radius: var(--bs-border-radius) var(--bs-border-radius) 0 0;
    background: color-mix(in srgb, var(--bs-white), transparent 15%);
    backdrop-filter: blur(8px);
    font-weight: var(--cp-font-weight-medium);
    &.is-expanded {
      position: sticky;
      z-index: 1;
      @media (max-width: @breakpoint-xs-max) {
        top: calc(
          var(--cp-mobile-header-height) +
            var(--cp-mobile-search-trigger-height)
        );
      }
      @media (min-width: @breakpoint-sm) and (max-width: @breakpoint-sm-max) {
        top: var(--cp-mobile-header-height);
      }
      @media (min-width: @breakpoint-md) {
        top: 0;
      }
    }
    .night-icon {
      color: var(--bs-gray-500);
    }
  }
  .visits-species-count-wrapper {
    cursor: pointer;
    gap: var(--cp-spacing-sm);
  }
  .visit-species-count {
    display: inline-block;
    border-radius: var(--bs-border-radius-sm);
    background: color-mix(in srgb, var(--cp-tag-no-priority), transparent 88%);
    .species {
      padding: var(--cp-spacing-xxxs) var(--cp-spacing-xs);
    }
    .count {
      display: inline-block;
      min-width: calc(var(--cp-grid-base) * 5); // 20px
      padding: var(--cp-spacing-xxxs);
      background: var(--bs-gray-600);
      color: var(--bs-white);
      text-align: center;
      font-weight: var(--cp-font-weight-medium);
      border-top-left-radius: var(--bs-border-radius-sm);
      border-bottom-left-radius: var(--bs-border-radius-sm);
    }
    &.mustelid {
      background: color-mix(
        in srgb,
        var(--cp-tag-priority-badge-1),
        transparent 88%
      );
      .count {
        background: var(--cp-tag-priority-badge-1);
      }
    }
    &.possum,
    &.cat {
      background: color-mix(
        in srgb,
        var(--cp-tag-priority-badge-2),
        transparent 88%
      );
      .count {
        background: var(--cp-tag-priority-badge-2);
      }
    }
    &.rodent,
    &.hedgehog {
      background: color-mix(
        in srgb,
        var(--cp-tag-priority-badge-3),
        transparent 88%
      );
      .count {
        background: var(--cp-tag-priority-badge-3);
      }
    }
  }
}

.visit-event-item {
  transition: background-color linear 0.2s;
  border-radius: var(--bs-border-radius-sm);
  cursor: pointer;
  &:hover:not(&.sun) {
    background: var(--bs-gray-200);
  }
  &.selected {
    background: var(--bs-gray-400);
  }
  &.sun {
    color: var(--bs-tertiary-color);
  }
  .visit-time-duration {
    width: calc(var(--cp-grid-base) * 13);
    text-align: right;
  }
  .visit-timeline {
    border-left: 2px solid var(--bs-gray-300);
    width: 2px;
    @media (max-width: @breakpoint-xs-max) {
      margin-left: var(--cp-spacing-md);
      margin-right: var(--cp-spacing-md);
    }
    @media (min-width: @breakpoint-sm) {
      margin-left: var(--cp-spacing-lg);
      margin-right: var(--cp-spacing-lg);
    }
    .circle {
      margin-top: var(--cp-spacing-sm);
      width: calc(var(--cp-grid-base) * 2); // 8px
      height: calc(var(--cp-grid-base) * 2);
      border-radius: var(--cp-grid-base);
      background: var(--bs-white);
      transform: translateX(-5px);
      border: 2px solid var(--bs-gray-400);
    }
    .sun-icon {
      width: calc(var(--cp-grid-base) * 2); // 8px
      height: calc(var(--cp-grid-base) * 2);
      color: var(--bs-gray-400);
      transform: translateX(-4.5px) scale(3.5);
      margin-top: var(--cp-spacing-xs);
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
        width: 2px;
        left: -2px;
        border-left: 2px dashed var(--bs-white);
        transition: border-color 0.2s;
      }
    }
  }
  &:hover:not(&.sun) {
    &:first-child,
    &:last-child {
      .visit-timeline {
        &::before {
          border-left: 2px dashed var(--bs-gray-200);
        }
      }
    }
  }
  .visit-thumb {
    min-width: calc(var(--cp-grid-base) * 12); // 48px
    max-width: calc(var(--cp-grid-base) * 12);
    width: calc(var(--cp-grid-base) * 12);
    height: calc(var(--cp-grid-base) * 12);
    overflow: hidden;
    position: relative;
    background: var(--bs-gray-200);
    border-radius: var(--bs-border-radius-sm);
    .num-recordings {
      background: color-mix(in srgb, var(--bs-black), transparent 20%);
      font-size: var(--cp-font-size-xs);
      color: var(--bs-white);
      position: absolute;
      bottom: 0;
      left: 0;
      border-top-right-radius: var(--bs-border-radius-sm);
    }
  }
  .visit-species-tag {
    background: var(--cp-tag-no-priority);
    color: var(--bs-white);
    display: inline-block;
    //line-height: var(--cp-line-height-md);
    border-radius: var(--bs-border-radius-sm);
    font-weight: var(--cp-font-weight-medium);
    padding-left: calc(var(--cp-spacing-xxs) + var(--cp-spacing-xxxs));
    padding-right: calc(var(--cp-spacing-xxs) + var(--cp-spacing-xxxs));
    @media (max-width: @breakpoint-xs-max) {
      font-size: var(--cp-font-size-sm);
    }
    @media (min-width: @breakpoint-sm) {
      font-size: var(--cp-font-size-md);
    }
    &.mustelid {
      background: var(--cp-tag-priority-badge-1);
    }
    &.possum,
    &.cat {
      background: var(--cp-tag-priority-badge-2);
    }
    &.rodent,
    &.hedgehog {
      background: var(--cp-tag-priority-badge-3);
    }
  }
}
</style>
