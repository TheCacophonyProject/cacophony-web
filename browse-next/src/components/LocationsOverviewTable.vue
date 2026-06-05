<script setup lang="ts">
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import CardTable from "@/components/CardTable.vue";
import {
  lastActiveLocationTime,
  locationHasAudioRecordings,
  locationHasThermalRecordings,
} from "@/utils";
import { DateTime, type ToRelativeOptions } from "luxon";
import { ref } from "vue";
import type { StationId as LocationId } from "@typedefs/api/common";
import RenameableLocationName from "@/components/RenameableLocationName.vue";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";
import type { GenericCardTableValue } from "@/components/CardTableTypes.ts";
import { BButton } from "bootstrap-vue-next";

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
    @entered-item="enteredTableItem as GenericCardTableValue<unknown>"
    @left-item="leftTableItem as GenericCardTableValue<unknown>"
    :max-card-width="2000"
    standalone
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
      <div class="location-buttons d-flex align-items-center">
        <span
          class="py-1 py-sm-2"
          v-if="locationHasThermalRecordings(location)"
        >
          <b-button
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
        </span>
        <div v-if="locationHasThermalRecordings(location)" class="vr"></div>
        <span
          class="py-1 py-sm-2"
          v-if="locationHasThermalRecordings(location)"
        >
          <b-button
            class="align-items-center justify-content-between d-flex btn-icon"
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
            <span class="ms-2"
              >Thermal
              <span class="d-none d-sm-inline-block">recordings</span></span
            >
          </b-button>
        </span>
        <div
          v-if="
            locationHasAudioRecordings(location) &&
            locationHasThermalRecordings(location)
          "
          class="vr"
        ></div>
        <span class="py-1 py-sm-2" v-if="locationHasAudioRecordings(location)">
          <b-button
            class="align-items-center justify-content-between d-flex btn-icon"
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
            <span class="ms-2"
              >Audio
              <span class="d-none d-sm-inline-block">recordings</span></span
            >
          </b-button>
        </span>
      </div>
    </template>
  </card-table>
</template>

<style scoped lang="less">
@import "../assets/less/breakpoints";
.location-buttons {
  border-top: 1px solid var(--border-color-light);
  @media screen and (min-width: @breakpoint-xs) and (max-width: @breakpoint-sm-max) {
    padding: 0 var(--cp-spacing-xs);
    margin-left: calc(var(--cp-spacing-md) * -1);
    margin-right: calc(var(--cp-spacing-md) * -1);
    margin-bottom: calc(var(--cp-spacing-md) * -1);
    gap: var(--cp-spacing-xxs);
  }
  @media screen and (min-width: @breakpoint-md) {
    margin-left: calc(var(--cp-spacing-xl) * -1);
    margin-right: calc(var(--cp-spacing-xl) * -1);
    margin-bottom: calc(var(--cp-spacing-xl) * -1);
    padding: 0 var(--cp-spacing-md);
    gap: var(--cp-spacing-xs);
  }
  .vr {
    background-color: var(--border-color-light);
    opacity: 1;
  }
}
</style>
