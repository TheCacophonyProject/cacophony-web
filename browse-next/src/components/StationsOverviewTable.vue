<template>
  <card-table
    compact
    :items="stations"
    @entered-item="enteredTableItem"
    @left-item="leftTableItem"
    :highlighted-item="highlightedItem"
  >
    <template #card="{ card }">
      <span>
        {{ card.name }}
      </span>
      <div v-html="activeBetween(card as ApiStationResponse)" />
    </template>
  </card-table>
</template>

<script setup lang="ts">
import type { ApiStationResponse } from "@typedefs/api/station";
import CardTable from "@/components/CardTable.vue";
import { lastActiveStationTime } from "@/utils";
import { DateTime } from "luxon";
const noWrap = (str: string) => str.replace(/ /g, "&nbsp;");
const lastSeenAt = (station: ApiStationResponse): string => {
  const lastTime = lastActiveStationTime(station);
  return noWrap(
    lastTime
      ? (DateTime.fromJSDate(lastTime).toRelative() as string)
      : "never (empty station)"
  );
};

const activeBetween = (station: ApiStationResponse): string => {
  return `${DateTime.fromJSDate(
    new Date(station.activeAt)
  ).toRelative()} &ndash; ${lastSeenAt(station)}`;
};

const { stations, highlightedItem } = defineProps<{
  stations: ApiStationResponse[];
  highlightedItem: ApiStationResponse | null;
}>();

const emit = defineEmits<{
  (e: "entered-item", payload: ApiStationResponse): void;
  (e: "left-item", payload: ApiStationResponse): void;
}>();
const enteredTableItem = (item: ApiStationResponse) => {
  emit("entered-item", item);
};

const leftTableItem = (item: ApiStationResponse) => {
  emit("left-item", item);
};
</script>

<style scoped lang="less"></style>
