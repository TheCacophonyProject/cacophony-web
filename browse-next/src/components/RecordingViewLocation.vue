<script setup lang="ts">
import { MaterialSymbol } from "@dbetka/vue-material-symbols";
import TooltipOnTruncation from "@/components/TooltipOnTruncation.vue";
import MapWithPoints from "@/components/MapWithPoints.vue";
import LocationName from "@/components/LocationName.vue";
import { computed } from "vue";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import { urlNormaliseName } from "@/utils.ts";
import type { LoadedResource } from "@apiClient/types.ts";
import { DateTime } from "luxon";
import { timezoneForLatLng } from "@models/visitsUtils.ts";
import type { NamedPoint } from "@models/mapUtils.ts";

const props = defineProps<{
  recording: LoadedResource<ApiRecordingResponse>;
}>();

const currentLocationName = computed<string>(() => {
  return (
    (props.recording &&
      (props.recording as ApiRecordingResponse).stationName) ||
    "–"
  );
});

const currentDeviceName = computed<string>(() => {
  return (
    (props.recording && (props.recording as ApiRecordingResponse).deviceName) ||
    "–"
  );
});

const recordingDateTime = computed<DateTime | null>(() => {
  if (props.recording) {
    const rec = props.recording as ApiRecordingResponse;
    if (rec.location) {
      const zone = timezoneForLatLng(rec.location);
      return DateTime.fromISO(rec.recordingDateTime, {
        zone,
      });
    }
    return DateTime.fromISO(rec.recordingDateTime);
  }
  return null;
});

const recordingDate = computed<string>(() => {
  return recordingDateTime.value?.toFormat("dd/MM/yyyy") || "&ndash;";
});
const recordingStartTime = computed<string>(() => {
  return (
    recordingDateTime.value
      ?.toLocaleString({
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h12",
      })
      .replace(/ /g, "") || "&ndash;"
  );
});

const mapPointForRecording = computed<NamedPoint[]>(() => {
  if (props.recording) {
    const rec = props.recording as ApiRecordingResponse;
    if (rec.location) {
      return [
        {
          name: currentLocationName.value,
          location: rec.location,
          project: rec.groupName,
        },
      ] as NamedPoint[];
    }
  }
  return [];
});
</script>

<template>
  <div
    class="recording-station-info d-inline-flex justify-content-between p-4 pb-2"
  >
    <div class="recording-details d-flex flex-column flex-fill">
      <div class="mb-2">
        <div
          class="device-name text-truncate d-inline-flex align-items-center me-3"
        >
          <material-symbol name="memory" size="1.125rem" class="me-1" />
          <router-link
            class="text-truncate fw-semibold"
            v-if="recording && recording.deviceId"
            :to="{
              name: 'device-status',
              params: {
                deviceId: recording.deviceId,
                deviceName: urlNormaliseName(recording.deviceName),
              },
            }"
          >
            <tooltip-on-truncation>{{
              currentDeviceName
            }}</tooltip-on-truncation>
          </router-link>
        </div>
        <div class="station-name text-truncate d-inline-flex">
          <location-name
            :name="currentLocationName"
            truncate
            class="fw-semibold"
          />
        </div>
      </div>
      <div class="recording-date-time d-flex">
        <div class="d-flex align-items-center">
          <material-symbol name="calendar_today" size="1.125rem" class="me-1" />
          <span v-html="recordingDate" />
        </div>
        <div class="d-flex align-items-center ms-3">
          <material-symbol name="schedule" size="1.125rem" class="me-1" />
          <span v-html="recordingStartTime" />
        </div>
      </div>
      <slot></slot>
    </div>
    <map-with-points
      class="recording-location-map"
      :points="mapPointForRecording"
      :active-points="mapPointForRecording"
      :highlighted-point="null"
      :is-interactive="false"
      :markers-are-interactive="false"
      :has-attribution="false"
      :can-change-base-map="false"
      :zoom="false"
      :radius="30"
    />
  </div>
</template>

<style scoped lang="less"></style>
