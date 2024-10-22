<script setup lang="ts">
import { computed, nextTick, onBeforeMount, onUpdated, ref } from "vue";
import { useRoute } from "vue-router";
import type { DeviceId } from "@typedefs/api/common";
import type { DeviceEvent } from "@typedefs/api/event";
import {
  type EventApiParams,
  getKnownEventTypesForDeviceInLastMonth,
  getLatestEventsByDeviceId,
} from "@api/Device.ts";
import Multiselect from "@vueform/multiselect";
import {
  type MaybeElement,
  useIntersectionObserver,
  useWindowSize,
} from "@vueuse/core";
import type { LoadedResource } from "@api/types.ts";
import { DateTime } from "luxon";

const route = useRoute();
const deviceId = computed<DeviceId>(
  () => Number(route.params.deviceId) as DeviceId
);
const loadedDeviceEvents = ref<LoadedResource<DeviceEvent[]>>(null);
const deviceEvents = computed<DeviceEvent[]>(() => {
  return loadedDeviceEvents.value || [];
});

onBeforeMount(() => {
  loadedDeviceEvents.value = null;
});

const oneMonthAgo = new Date();
oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
let needsObserverUpdate = false;
let currentObserver: { stop: () => void } | null;

const { height: windowHeight } = useWindowSize();
const eventHeight = 100;
const twoPagesWorthOfEvents = computed<number>(() => {
  return Math.floor((windowHeight.value / eventHeight) * 2);
});

const knownEventTypes = ref<LoadedResource<string[]>>(null);

const homogeniseLabel = (str: string): string => {
  const parts: string[] = [""];
  let prevWasUpperCase = false;
  for (let i = 0; i < str.length; i++) {
    const char = str.charAt(i);
    const charIsNumeric = !isNaN(Number(char));
    const charIsUpperCase = !charIsNumeric && char.toUpperCase() === char;
    if (
      (parts[parts.length - 1] !== "" &&
        charIsUpperCase &&
        !prevWasUpperCase) ||
      char === "-"
    ) {
      parts.push("");
    }
    if (char !== "-") {
      parts[parts.length - 1] += char.toLowerCase();
    }
    prevWasUpperCase = charIsUpperCase;
  }
  return parts.join(" ");
};

const selectedEventTypes = ref<string[]>([]);
const knownEventTypesOptions = computed<{ value: string; label: string }[]>(
  () => {
    return (knownEventTypes.value || [])
      .map((key) => ({
        value: key,
        label: homogeniseLabel(key),
      }))
      .sort((a, b) => (a.label > b.label ? 1 : -1));
  }
);

const loadingEvents = ref<boolean>(false);
const loadedBackUntilDateTime = ref<Date>(new Date());
const loadSomeEvents = async (filterByEvents?: string[]) => {
  if (loadedBackUntilDateTime.value > oneMonthAgo) {
    loadingEvents.value = true;
    const params: EventApiParams = {
      startTime: oneMonthAgo.toISOString(),
      endTime: loadedBackUntilDateTime.value.toISOString(),
      limit: twoPagesWorthOfEvents.value,
    };
    if (filterByEvents && filterByEvents.length) {
      params.type = filterByEvents;
    } else if (selectedEventTypes.value.length && !filterByEvents) {
      params.type = selectedEventTypes.value;
    }
    const response = await getLatestEventsByDeviceId(deviceId.value, params);
    if (response.success) {
      if (response.result.rows.length !== 0) {
        const earliestEvent =
          response.result.rows[response.result.rows.length - 1];
        loadedBackUntilDateTime.value = new Date(earliestEvent.dateTime);
        if (!loadedDeviceEvents.value) {
          loadedDeviceEvents.value = [];
        }
        loadedDeviceEvents.value.push(...response.result.rows);
        needsObserverUpdate = true;
      } else {
        // We must have loaded all the events in the last month
        loadedBackUntilDateTime.value = oneMonthAgo;
      }
    }
    loadingEvents.value = false;
  }
};

const canExpandSearchBackFurther = computed<boolean>(() => {
  return loadedBackUntilDateTime.value === oneMonthAgo;
});

onBeforeMount(async () => {
  // Load distinct event types for device.
  // Provide filtering over those event types.
  // Provide lazy loading of the events
  // Mobile and desktop views of cards vs table?
  // Event timelines?
  // Events grouped by day?

  // Load up to one month worth of events – historical events older than that generally aren't that useful.
  // Lazy load up to two pages worth of event items with the current filters.
  const types = await getKnownEventTypesForDeviceInLastMonth(deviceId.value);
  if (types.success) {
    knownEventTypes.value = types.result.eventTypes;
  }
  await reloadEvents();
});

const reloadEvents = async (newEvents?: string[]) => {
  currentObserver && currentObserver.stop();
  currentObserver = null;
  loadedDeviceEvents.value = [];
  loadedBackUntilDateTime.value = new Date();
  await loadSomeEvents(newEvents);
};

onUpdated(() => {
  if (needsObserverUpdate) {
    // Add observers
    let nearLast;
    nearLast = document.querySelector(".event-item:nth-last-child(3)");
    if (!nearLast) {
      nearLast = document.querySelector(".event-item:nth-last-child(2)");
    }
    if (!nearLast) {
      nearLast = document.querySelector(".event-item:last-child");
    }
    if (nearLast) {
      // Check if it's already visible.
      const bounds = nearLast.getBoundingClientRect();
      if (bounds.top >= 0 && bounds.top <= windowHeight.value) {
        if (canExpandSearchBackFurther.value) {
          nextTick(() => loadSomeEvents());
        }
      } else {
        // Observe when this element comes into view.
        currentObserver = useIntersectionObserver(
          ref(nearLast as MaybeElement),
          (intersections: IntersectionObserverEntry[]) => {
            for (const intersection of intersections) {
              if (intersection.isIntersecting) {
                currentObserver && currentObserver.stop();
                currentObserver = null;
                loadSomeEvents();
                break;
              }
            }
          }
        );
      }
    }
    needsObserverUpdate = false;
  }
});

const lagTimeForUpload = (event: DeviceEvent): string => {
  const delay = DateTime.fromISO(event.createdAt)
    .diff(DateTime.fromISO(event.dateTime), ["days", "hours", "minutes"])
    .toObject();
  if (delay.days === 0 && delay.hours === 0) {
    if ((delay.minutes as number) < 1) {
      return "immediately";
    } else {
      const mins = Math.round(delay.minutes as number);
      return `${mins} minute${mins > 1 ? "s" : ""} later`;
    }
  }
  if (delay.days === 0) {
    const hours = Math.round(delay.hours as number);
    return `${hours} hour${hours > 1 ? "s" : ""} later`;
  }
  const days = Math.round(delay.days as number);
  return `${days} day${days > 1 ? "s" : ""} later`;
};
</script>

<template>
  <div class="d-flex flex-column">
    <div class="filters sticky-sm-top py-3 d-flex align-items-center">
      <div class="me-2">Filter&nbsp;events&nbsp;</div>
      <multiselect
        v-model="selectedEventTypes"
        :options="knownEventTypesOptions"
        placeholder="all"
        mode="tags"
        :can-clear="false"
        @change="reloadEvents"
      ></multiselect>
    </div>
    <div v-if="loadedDeviceEvents && deviceEvents.length">
      <div
        v-for="(event, index) in deviceEvents"
        :key="index"
        class="event-item my-2 rounded-1 d-flex flex-column"
      >
        <div class="d-flex flex-column">
          <div
            class="d-flex justify-content-between flex-fill event-title p-2 rounded-top-1 bg-secondary"
          >
            <div class="me-2 text-capitalize">
              <strong>{{ homogeniseLabel(event.EventDetail.type) }}</strong>
            </div>
            <div>
              <span>{{
                DateTime.fromISO(event.dateTime).toLocaleString({
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "numeric",
                })
              }}</span>
            </div>
          </div>
          <div class="p-2">
            <span
              ><strong>Logged</strong>
              {{ DateTime.fromISO(event.dateTime).toRelative() }},
              <strong>uploaded</strong>
              {{ lagTimeForUpload(event) }}</span
            >
          </div>
        </div>
        <div
          class="container"
          v-if="Object.keys(event.EventDetail.details).length"
        >
          <div
            v-for="([key, val], index) in Object.entries(
              event.EventDetail.details
            ).filter(([_, vv], i) => !!vv)"
            :key="index"
            class="row"
          >
            <div class="col">
              <strong class="text-capitalize">{{ key }}:</strong>
            </div>
            <div class="col" v-if="!Array.isArray(val)">
              <div
                v-if="val && typeof val === 'object' && Object.keys(val as Object).length !== 0"
              >
                <div
                  class="row"
                  v-for="([k, v], idx) in Object.entries(val as Object)"
                  :key="idx"
                >
                  <div class="col">
                    <strong class="text-capitalize">{{ k }}:</strong>
                  </div>
                  <div class="col">
                    {{ v }}
                  </div>
                </div>
              </div>
              <span v-else>{{ val }}</span>
            </div>
            <div class="col" v-else>
              <div class="row" v-for="(item, idx) in val" :key="idx">
                <div class="col">{{ item }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div
      v-else-if="loadedDeviceEvents !== null && !loadingEvents"
      class="d-flex justify-content-center align-items-center py-3"
    >
      <span>No events found for device in the last month</span>
    </div>
    <div
      v-if="loadingEvents"
      class="d-flex justify-content-center align-items-center py-3"
    >
      <b-spinner variant="secondary" />
    </div>
  </div>
</template>

<style scoped lang="less">
.event-item {
  background: #cecece;
  //&:nth-child(even) {
  //  background: #e1e1e1;
  //}
}
.row {
  background: #e1e1e1;
  &:nth-child(even) {
    background: #cecece;
  }
}
.event-title {
  color: white;
}
.filters {
  background: #f6f6f6;
  border-bottom: 1px solid #ccc;
}

@media screen and (max-width: 575px) {
  .filters {
    position: sticky;
    top: 50px;
  }
}
.container > .row:not(:last-child) {
  border-bottom: 1px solid #bbb;
}
</style>
