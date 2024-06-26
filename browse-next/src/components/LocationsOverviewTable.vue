<template>
  <card-table
    compact
    :items="locations"
    @entered-item="enteredTableItem"
    @left-item="leftTableItem"
    :highlighted-item="highlightedItem"
  >
    <template #card="{ card }">
      <span>
        {{ card.name }}
      </span>
      <div v-html="activeBetween(card as ApiLocationResponse)" />
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
