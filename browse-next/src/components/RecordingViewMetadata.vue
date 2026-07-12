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
import { RecordingType } from "@typedefs/api/consts.ts";
import { useMediaQuery } from "@vueuse/core";
import { useRoute } from "vue-router";

const props = defineProps<{
  recording: LoadedResource<ApiRecordingResponse>;
}>();

const route = useRoute();
const isMobile = useMediaQuery("(max-width: 991px)");
const isDesktop = useMediaQuery("(min-width: 992px)");

const recordingType = computed<RecordingType | null>(() => {
  if (props.recording) {
    return (props.recording as ApiRecordingResponse).type;
  }
  if (
    ["dashboard-visit", "activity-visit"].includes(
      route.meta.context as string,
    ) ||
    route.query["recording-mode"] === "cameras"
  ) {
    return RecordingType.ThermalRaw;
  } else {
    return RecordingType.Audio;
  }
});

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
  return (
    recordingDateTime.value?.toLocaleString({ dateStyle: "medium" }) ||
    "&ndash;"
  );
});
const recordingStartTime = computed<string>(() => {
  return (
    recordingDateTime.value?.toLocaleString({
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h12",
    }) || "&ndash;"
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
    class="recording-metadata overflow-hidden p-3"
    :class="{
      'recording-type-audio d-flex flex-column h-100':
        recordingType === RecordingType.Audio,
      'recording-type-video justify-content-between p-lg-4 pb-lg-2':
        recordingType === RecordingType.ThermalRaw,
      'd-inline-flex': isDesktop && recordingType === RecordingType.ThermalRaw,
      'd-flex flex-fill flex-column':
        isMobile && recordingType === RecordingType.ThermalRaw,
    }"
  >
    <div
      class="recording-details d-flex flex-column overflow-hidden"
      :class="{
        'flex-shrink-0': isMobile || recordingType === RecordingType.Audio,
      }"
    >
      <div class="flex-shrink-0 mb-2 overflow-hidden">
        <span
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
        </span>
        <span class="station-name overflow-hidden d-inline-flex pe-2">
          <location-name
            :name="currentLocationName"
            truncate
            class="fw-semibold"
          />
        </span>
      </div>
      <div class="recording-date-time d-flex">
        <div class="d-flex align-items-center">
          <material-symbol name="calendar_today" size="1.125rem" class="me-1" />
          <span v-html="recordingDate" />
        </div>
        <div class="d-flex align-items-center ms-3">
          <material-symbol name="schedule" size="1.125rem" class="me-1" />
          <span v-html="recordingStartTime" data-cy="recording start time" />
        </div>
      </div>
      <slot></slot>
    </div>
    <map-with-points
      class="recording-location-map"
      :class="{
        'flex-fill': isMobile || recordingType === RecordingType.Audio,
      }"
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

<style scoped lang="less">
@import "../assets/less/breakpoints.less";
@import "../assets/less/spacing.less";
@import "../assets/less/elevation.less";

.device-name,
.station-name {
  max-width: 100%;
}

.recording-metadata {
  // set a min-width, otherwise when audio recordings load this div is very squished
  @media (min-width: @breakpoint-lg) {
    min-width: calc(var(--cp-grid-base) * 96);
  }
  &.recording-type-video {
    .recording-location-map {
      .standard-shadow-inset();
      border: 1px solid var(--border-color-light);
      @media (max-width: @breakpoint-md-max) {
        width: 100%;
        height: calc(var(--cp-grid-base) * 44);
        margin-top: var(--cp-spacing-md);
        border-radius: var(--bs-border-radius);
      }
      @media (min-width: @breakpoint-lg) {
        width: calc(var(--cp-grid-base) * 26);
        height: calc(var(--cp-grid-base) * 26);
        min-width: calc(var(--cp-grid-base) * 26);
        border-radius: 100%;
      }
    }
  }
  &.recording-type-audio {
    @media (min-width: @breakpoint-lg) {
      width: calc(var(--cp-grid-base) * 96);
      border-left: 1px solid var(--bs-border-color);
    }
    .recording-location-map {
      width: 100%;
      height: calc(var(--cp-grid-base) * 44);
      margin-top: var(--cp-spacing-md);
      border-radius: var(--bs-border-radius);
      @media (min-width: @breakpoint-lg) {
        max-height: calc(var(--cp-grid-base) * 88);
      }
    }
  }
}
</style>
