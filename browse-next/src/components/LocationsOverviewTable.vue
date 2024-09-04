<template>
  <card-table
    compact
    :items="locations"
    @entered-item="enteredTableItem"
    @left-item="leftTableItem"
    :max-card-width="2000"
  >
    <template #card="{ card }">
      <div>
        <strong>
          {{ card.name }}
        </strong>
        <div v-html="activeBetween(card as ApiLocationResponse)" />
      </div>
      <div class="d-flex mt-2 mb-1">
        <b-button
          class="align-items-center justify-content-between d-flex"
          variant="light"
          :to="{
            name: 'activity',
            query: {
              locations: [card.id],
              'display-mode': 'visits',
              from: new Date(card.activeAt).toISOString(),
              until: (lastActiveLocationTime(card) || new Date()).toISOString(),
            },
          }"
          ><span class="me-2">Visits</span>
          <font-awesome-icon
            icon="arrow-turn-down"
            :rotation="270"
            size="xs"
            class="ps-1"
          />
        </b-button>
        <b-button
          class="align-items-center justify-content-between d-flex ms-2"
          variant="light"
          :to="{
            name: 'activity',
            query: {
              locations: [card.id],
              'display-mode': 'recordings',
              from: new Date(card.activeAt).toISOString(),
              until: (lastActiveLocationTime(card) || new Date()).toISOString(),
            },
          }"
          ><span class="me-2">Recordings</span>
          <font-awesome-icon
            icon="arrow-turn-down"
            :rotation="270"
            size="xs"
            class="ps-1"
          />
        </b-button>
      </div>
    </template>
  </card-table>
</template>

<script setup lang="ts">
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import CardTable from "@/components/CardTable.vue";
import { lastActiveLocationTime } from "@/utils";
import { DateTime } from "luxon";

const oneMinute = 1000 * 60;
const oneHour = oneMinute * 60;
const oneDay = oneHour * 24;
const oneWeek = oneDay * 7;
const oneMonth = oneWeek * 4.3;
const threeMonths = oneMonth * 3;
const sixMonths = oneMonth * 6;
const oneYear = oneDay * 365;
const twoYears = oneYear * 2;
const getRelativeUnits = (date: Date) => {
  const now = new Date().getTime();
  const elapsed = now - date.getTime();
  if (elapsed > oneYear && elapsed < twoYears) {
    return { unit: "months" };
  }
  return undefined;
};
const noWrap = (str: string) => str.replace(/ /g, "&nbsp;");
const lastSeenAt = (location: ApiLocationResponse): string => {
  const lastTime = lastActiveLocationTime(location);
  const relativeUnits = (lastTime && getRelativeUnits(lastTime)) || undefined;
  return noWrap(
    lastTime
      ? (DateTime.fromJSDate(lastTime).toRelative(relativeUnits) as string)
      : "never (empty location)"
  );
};

const activeBetween = (station: ApiLocationResponse): string => {
  const startRelUnits = noWrap(
    DateTime.fromJSDate(new Date(station.activeAt)).toRelative() || ""
  );
  const endRelUnits = lastSeenAt(station);
  if (startRelUnits === endRelUnits) {
    return `Over ${startRelUnits}`;
  }
  return `${DateTime.fromJSDate(
    new Date(station.activeAt)
  ).toRelative()} &ndash; ${lastSeenAt(station)}`;
};

const _props = withDefaults(
  defineProps<{
    locations: ApiLocationResponse[];
    highlightedItem: ApiLocationResponse | null;
  }>(),
  { highlightedItem: null }
);

const emit = defineEmits<{
  (e: "entered-item", payload: ApiLocationResponse): void;
  (e: "left-item", payload: ApiLocationResponse): void;
}>();
const enteredTableItem = (item: ApiLocationResponse) => {
  emit("entered-item", item);
};

const leftTableItem = (item: ApiLocationResponse) => {
  emit("left-item", item);
};
</script>

<style scoped lang="less"></style>
