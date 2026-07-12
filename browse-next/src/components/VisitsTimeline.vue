<script setup lang="ts">
import {
  computed,
  inject,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import type { Ref } from "vue";
import {
  timezoneForLatLng,
  visitClassificationLabel,
  visitClassificationLabelFromPath,
  visitClassificationPath,
  visitsBySpecies as visitsBySpeciesCalc,
} from "@models/visitsUtils";
import { DateTime } from "luxon";
import type { NamedPoint } from "@models/mapUtils";
import { displayLabelForClassificationLabel } from "@api/classificationsUtils.ts";
import type { StationId as LocationId } from "@typedefs/api/common";
import TooltipOnTruncation from "@/components/TooltipOnTruncation.vue";
import type { ApiStaticVisitResponse } from "@typedefs/api/visit";

const currentlyHighlightedLocation = inject(
  "currentlyHighlightedLocation",
) as Ref<LocationId | null>;

const props = defineProps<{
  visits: ApiStaticVisitResponse[];
  locations: NamedPoint[];
  startDate: Date;
}>();

// TODO: Factor this out into a more generic timeline component.
// TODO: Show dusk/dawn on the timeline somehow?

const labelContainer = ref<HTMLDivElement | null>(null);
const clipLabelLeft = ref<HTMLDivElement | null>(null);
const checkClipping = (
  label: HTMLDivElement,
  labelBounds: DOMRect,
  clipBounds: DOMRect,
) => {
  if (labelBounds.right > clipBounds.right) {
    label.style.display = "none";
  } else {
    label.style.display = "block";
  }
};

const evaluateLabelClipping = () => {
  if (labelContainer.value) {
    const containerBounds = labelContainer.value.getBoundingClientRect();
    const labels = labelContainer.value.querySelectorAll(
      ".visits-timeline-date-label",
    );
    let leftMostLabel = null;
    let leftMostVal = containerBounds.right;
    for (let i = 0; i < labels.length; i++) {
      const label = labels[i] as HTMLDivElement;
      const labelBounds = label.getBoundingClientRect();
      if (labelBounds.left < leftMostVal) {
        leftMostLabel = label;
        leftMostVal = labelBounds.left;
      }
      checkClipping(label, labelBounds, containerBounds);
    }
    if (clipLabelLeft.value && leftMostLabel) {
      const clipBounds = clipLabelLeft.value.getBoundingClientRect();
      checkClipping(
        leftMostLabel as HTMLDivElement,
        leftMostLabel.getBoundingClientRect(),
        clipBounds,
      );
    }
  }
};

onMounted(() => {
  evaluateLabelClipping();
  window.addEventListener("resize", evaluateLabelClipping);
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", evaluateLabelClipping);
});

const timezoneForActiveStations = computed<string>(() => {
  if (props.locations.length) {
    const location = props.locations[0];
    return timezoneForLatLng(location.location);
  }
  return "Auckland/Pacific";
});

const dates = computed<DateTime[]>(() => {
  const now = DateTime.now().setZone(timezoneForActiveStations.value);
  const d = [
    DateTime.fromISO(props.startDate.toISOString(), {
      zone: timezoneForActiveStations.value,
    }),
  ];
  while (d[d.length - 1].plus({ days: 1 }) < now) {
    d.push(d[d.length - 1].plus({ days: 1 }));
  }
  for (let i = 1; i < d.length; i++) {
    d[i] = d[i].set({ hour: 0, minute: 0, second: 0, millisecond: 0 });
  }
  d.push(now);
  return d;
});

const dateLabels = computed<DateTime[]>(() => {
  return dates.value.slice(0, dates.value.length - 1);
});

// Recalculate clipping of date labels whenever the dates change.
watch(dateLabels, () => nextTick(evaluateLabelClipping));

const visitsBySpecies = computed<[string, ApiStaticVisitResponse[]][]>(() =>
  visitsBySpeciesCalc(props.visits).sort((a, b) => {
    // Sort by count and break ties by name alphabetically
    const order = b[1].length - a[1].length;
    if (order === 0) {
      return a[0] > b[0] ? 1 : -1;
    }
    return order;
  }),
);

const getLeft = (minTime: number, time: number, maxTime: number) => {
  return Math.max(0, ((time - minTime) / (maxTime - minTime)) * 100);
};

const getRight = (minTime: number, time: number, maxTime: number) => {
  return Math.min(100, (1 - (time - minTime) / (maxTime - minTime)) * 100);
};

const minTime = computed<number>(() => {
  if (dates.value.length) {
    return dates.value[0].toMillis();
  }
  return 0;
});

const maxTime = computed<number>(() => {
  if (dates.value.length) {
    return dates.value[dates.value.length - 1].toMillis();
  }
  return 0;
});

const dateAndDayOfWeek = (date: DateTime): string => {
  return `${date.weekdayShort} ${date.day}`;
};

const mouseOverVisit = (visit: ApiStaticVisitResponse) => {
  currentlyHighlightedLocation.value = visit.locationId;
};

const mouseLeftVisit = (_visit: ApiStaticVisitResponse) => {
  currentlyHighlightedLocation.value = null;
};
</script>
<template>
  <div class="visits-timeline">
    <div
      v-for="([species, visits], index) in visitsBySpecies"
      :key="index"
      class="d-flex visits-timeline-row"
    >
      <div class="d-flex align-items-center" style="width: 100px">
        <tooltip-on-truncation
          class="visits-timeline-species-name text-capitalize"
          >{{
            displayLabelForClassificationLabel(
              visitClassificationLabelFromPath(species).toLowerCase(),
            )
          }}</tooltip-on-truncation
        >
      </div>
      <div class="flex-fill position-relative">
        <div
          v-for="visit in visits"
          :key="visit.startTime"
          @mouseenter="() => mouseOverVisit(visit)"
          @mouseleave="() => mouseLeftVisit(visit)"
          :title="
            DateTime.fromISO(visit.startTime, {
              zone: timezoneForActiveStations,
            }).toString()
          "
          :style="{
            left: `${getLeft(
              minTime,
              new Date(visit.startTime).getTime(),
              maxTime,
            )}%`,
            right: `${getRight(
              minTime,
              new Date(visit.endTime).getTime(),
              maxTime,
            )}%`,
          }"
          :class="[
            'event-item-visit',
            visitClassificationLabel(visit),
            ...(visitClassificationPath(visit) || '').split('.'),
          ]"
        />
        <div
          v-for="(date, index) in dates"
          :key="index"
          class="event-item"
          :style="{
            left: `${getLeft(minTime, date.toMillis(), maxTime)}%`,
          }"
        />
      </div>
    </div>
  </div>
  <div class="visits-timeline-date-labels d-flex">
    <div style="min-width: 100px"></div>
    <div class="flex-fill position-relative" ref="labelContainer">
      <div
        v-for="(date, index) in dateLabels"
        :key="index"
        :style="{
          left: `${getLeft(minTime, date.toMillis(), maxTime)}%`,
        }"
        class="visits-timeline-date-label py-1"
      >
        {{ dateAndDayOfWeek(date) }}
      </div>
      <div
        class="clip-left-label position-absolute"
        ref="clipLabelLeft"
        key="clip-left-label"
        :style="{
          left: `${getLeft(minTime, dates[0].toMillis(), maxTime)}%`,
          right: `${getRight(
            minTime,
            dates[Math.min(1, dates.length - 1)].toMillis(),
            maxTime,
          )}%`,
        }"
      ></div>
    </div>
  </div>
</template>
<style scoped lang="less">
.event-item {
  border-left: 1px solid var(--border-color-light);
  position: absolute;
  bottom: 0;
  top: 0;
}
.event-item-visit {
  background: var(--cp-tag-no-priority);
  position: absolute;
  bottom: 2px;
  top: 2px;
  min-width: 2.5px;
  border-radius: var(--bs-border-radius-sm);

  &.mustelid {
    background: var(--cp-tag-priority-1);
  }
  &.possum,
  &.cat {
    background: var(--cp-tag-priority-2);
  }
  &.rodent,
  &.hedgehog {
    background: var(--cp-tag-priority-3);
  }
}
.visits-timeline {
  > .visits-timeline-row {
    background: var(--bs-white);
    height: calc(var(--cp-grid-base) * 7);
    &:not(:last-child) {
      border-bottom: 1px solid var(--border-color-light);
    }
    &:last-child {
      border-radius: var(--bs-border-radius);
    }
  }
}
.visits-timeline-date-label {
  position: absolute;
  white-space: nowrap;
  font-size: var(--cp-font-size-sm);
  user-select: none;
  color: var(--bs-secondary-color);
}
.visits-timeline-species-name {
  font-size: var(--cp-font-size-sm);
  padding: 0 var(--cp-spacing-xs);
  font-weight: var(--cp-font-weight-medium);
}
.clip-left-label {
  min-height: 1px;
}
</style>
