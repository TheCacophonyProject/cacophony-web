<script setup lang="ts">
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import CardTable from "@/components/CardTable.vue";
import { lastActiveLocationTime, locationHasAudioRecordings, locationHasThermalRecordings } from "@/utils";
import { DateTime, type ToRelativeOptions } from "luxon";
import { ref } from "vue";
import type { StationId as LocationId } from "@typedefs/api/common";
import RenameableLocationName from "@/components/RenameableLocationName.vue";
import {MaterialSymbol} from "@dbetka/vue-material-symbols";

const oneMinute = 1000 * 60;
const oneHour = oneMinute * 60;
const oneDay = oneHour * 24;
const oneWeek = oneDay * 7;
const oneMonth = oneWeek * 4.3;
const threeMonths = oneMonth * 3;
const sixMonths = oneMonth * 6;
const oneYear = oneDay * 365;
const twoYears = oneYear * 2;
const getRelativeUnits = (date: Date): ToRelativeOptions | undefined => {
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
      : "never (empty location)",
  );
};

const activeBetween = (station: ApiLocationResponse): string => {
  const startRelUnits = noWrap(
    DateTime.fromJSDate(new Date(station.activeAt)).toRelative() || "",
  );
  const endRelUnits = lastSeenAt(station);
  if (startRelUnits === endRelUnits) {
    return `Over ${startRelUnits}`;
  }
  return `${DateTime.fromJSDate(
    new Date(station.activeAt),
  ).toRelative()} &ndash; ${lastSeenAt(station)}`;
};

const { locations, highlightedItem = null } = defineProps<{
  locations: ApiLocationResponse[];
  highlightedItem: ApiLocationResponse | null;
}>();
const emit = defineEmits<{
  (e: "entered-item", payload: ApiLocationResponse): void;
  (e: "left-item", payload: ApiLocationResponse): void;
  (e: "show-rename-hint", el: HTMLSpanElement): void;
  (e: "hide-rename-hint"): void;
  (
    e: "updated-location-name",
    payload: { newName: string; id: LocationId },
  ): void;
}>();
const enteredTableItem = (item: ApiLocationResponse) => {
  emit("entered-item", item);
};

const leftTableItem = (item: ApiLocationResponse) => {
  emit("left-item", item);
};

const showRenameHint = (e: HTMLSpanElement) => {
  emit("show-rename-hint", e);
};
const hideRenameHint = () => {
  emit("hide-rename-hint");
};
const changedLocationName = (payload: { newName: string; id: LocationId }) => {
  emit("updated-location-name", payload);
};
</script>
<template>
  <card-table
    compact
    :items="locations"
    @entered-item="enteredTableItem"
    @left-item="leftTableItem"
    :max-card-width="2000"
  >
    <template #card="{ card: location }: { card: ApiLocationResponse }">
      <div>
        <renameable-location-name
          :location="location"
          @hide-rename-hint="hideRenameHint"
          @show-rename-hint="showRenameHint"
          @changed-location-name="changedLocationName"
        />
        <p v-html="activeBetween(location)" />
      </div>
      <div class="location-buttons d-flex mt-2 px-2 py-2 border-top border-2 border-light">
        <b-button
          v-if="locationHasThermalRecordings(location)"
          class="align-items-center justify-content-between d-flex btn-icon"
          variant="light"
          :to="{
            name: 'activity',
            query: {
              locations: [location.id],
              'display-mode': 'visits',
              from: new Date(location.activeAt).toISOString(),
              until: (
                lastActiveLocationTime(location) || new Date()
              ).toISOString(),
            },
          }"
          >
          <material-symbol name="video_library" size="1.25rem" />
          <span class="ms-2">Visits</span>
        </b-button>
        <div v-if="locationHasThermalRecordings(location)" class="vr"></div>
        <b-button
          class="align-items-center justify-content-between d-flex btn-icon"
          v-if="locationHasThermalRecordings(location)"
          variant="light"
          :to="{
            name: 'activity',
            query: {
              locations: [location.id],
              'display-mode': 'recordings',
              'recording-mode': 'cameras',
              from: new Date(location.activeAt).toISOString(),
              until: (
                lastActiveLocationTime(location) || new Date()
              ).toISOString(),
            },
          }"
          >
          <material-symbol name="videocam" size="1.25rem" />
          <span class="ms-2">Thermal <span class="d-none d-sm-inline-block">recordings</span></span>
        </b-button>
        <div v-if="locationHasAudioRecordings(location)" class="vr"></div>
        <b-button
          class="align-items-center justify-content-between d-flex btn-icon"
          v-if="locationHasAudioRecordings(location)"
          variant="light"
          :to="{
            name: 'activity',
            query: {
              locations: [location.id],
              'display-mode': 'recordings',
              'recording-mode': 'audio',
              from: new Date(location.activeAt).toISOString(),
              until: (
                lastActiveLocationTime(location) || new Date()
              ).toISOString(),
            },
          }"
        >
          <material-symbol name="music_note" size="1.25rem" />
          <span class="ms-2">Audio <span class="d-none d-sm-inline-block">recordings</span></span>
        </b-button>
      </div>
    </template>
  </card-table>
</template>

<style scoped lang="less">
@import "../assets/less/breakpoints";
.location-buttons {
  @media screen and (min-width: @breakpoint-xs) and (max-width: @breakpoint-sm-max) {
    margin-left: calc(var(--cp-spacing-md) * -1);
    margin-right: calc(var(--cp-spacing-md) * -1);
    margin-bottom: calc(var(--cp-spacing-md) * -1);
  }
  @media screen and (min-width: @breakpoint-md) {
    margin-left: calc(var(--cp-spacing-lg) * -1);
    margin-right: calc(var(--cp-spacing-lg) * -1);
    margin-bottom: calc(var(--cp-spacing-lg) * -1);
  }

  padding-top: var(--cp-spacing-xs);
  gap: var(--cp-spacing-xxs);
  .vr {
    background-color: var(--border-color-light);
  }
}
</style>
