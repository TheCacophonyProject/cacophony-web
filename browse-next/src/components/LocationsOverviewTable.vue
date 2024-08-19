<template>
  <card-table
    compact
    :items="locations"
    @entered-item="enteredTableItem"
    @left-item="leftTableItem"
    :highlighted-item="highlightedItem"
    :max-card-width="2000"
  >
    <template #card="{ card }">
      <div>
        <strong>
          {{ card.name }}
        </strong>
        <div v-html="activeBetween(card as ApiLocationResponse)" />
      </div>
      <div class="d-flex mt-2 justify-content-end">
        <b-button
          class="align-items-center justify-content-between d-flex"
          variant="link"
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
          variant="link"
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
const noWrap = (str: string) => str.replace(/ /g, "&nbsp;");
const lastSeenAt = (location: ApiLocationResponse): string => {
  const lastTime = lastActiveLocationTime(location);
  return noWrap(
    lastTime
      ? (DateTime.fromJSDate(lastTime).toRelative() as string)
      : "never (empty location)"
  );
};

const activeBetween = (station: ApiLocationResponse): string => {
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
