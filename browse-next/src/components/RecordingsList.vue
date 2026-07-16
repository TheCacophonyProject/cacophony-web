<template>
  <div
    class="mb-3 day-container"
    v-for="day in recordingsByDay"
    :key="day.dateTime.day"
  >
    <div
      class="day-header fw-medium pb-2 pb-sm-3"
      v-if="
        day.items.filter((r) => !r.data.hasOwnProperty('tombstoned')).length !==
        0
      "
    >
      {{ day.dateTime.toLocaleString(DateTime.DATE_FULL) }}
    </div>

    <div
      v-for="(item, index) in day.items"
      :key="index"
      @click="selectedRecording(item)"
      @mouseenter="() => highlightedLocation(item)"
      @mouseleave="() => unhighlightedLocation(item)"
      class="list-item"
      :class="{
        'd-none': item.data.hasOwnProperty('tombstoned'),
      }"
      :data-cy="`recording ${index}`"
    >
      <div
        v-if="!item.data.hasOwnProperty('tombstoned')"
        class="d-flex user-select-none"
        :class="[
          item.type,
          {
            selected:
              item.type === 'recording' &&
              item.data.id === currentlySelectedRecordingId,
          },
        ]"
      >
        <div
          class="visit-time-duration d-flex flex-column flex-shrink-0"
          :class="item.type !== 'recording' ? 'py-2 py-sm-3' : 'py-2'"
        >
          <span
            v-if="item.type === 'recording'"
            class="pb-1 fs-6 text-secondary lh-sm"
            data-cy="recording time"
            >{{
              timeAtLocation(item.data.recordingDateTime, canonicalLocation)
            }}</span
          >
          <span v-else class="fs-6 text-body-tertiary">{{
            timeAtLocation(item.data, canonicalLocation)
          }}</span>
          <span
            data-cy="recording duration"
            class="duration fs-6 text-secondary"
            v-if="
              item.type === 'recording' &&
              item.data.type === RecordingType.ThermalRaw
            "
            v-html="formatDuration(item.data.duration * 1000)"
          ></span>
        </div>
        <div class="visit-timeline">
          <svg
            viewBox="0 0 32 36"
            class="sun-icon"
            xmlns="http://www.w3.org/2000/svg"
            v-if="item.type === 'sunrise'"
          >
            <rect x="-2" y="-2" width="36" height="40" fill="#f6f6f6" />
            <g transform="matrix(0.151304,0,0,0.151304,-22.1954,-34.6843)">
              <path
                fill="currentColor"
                d="M161.213,434.531L161.213,418.781L194.046,418.781L194.541,415.968C195.47,410.687 197.983,404.084 201.238,398.372L204.49,392.666L181.46,369.671L192.71,358.421L215.841,381.516L219.464,379.197C224.28,376.115 229.455,373.935 235.838,372.298L241.088,370.952L241.492,337.781L257.934,337.781L258.338,370.952L263.588,372.298C269.971,373.935 275.146,376.115 279.962,379.197L283.585,381.516L306.703,358.434L317.973,369.629L294.734,392.906L296.282,395.156C299.306,399.551 302.884,407.739 304.177,413.221L305.487,418.781L338.213,418.781L338.213,434.531L161.213,434.531ZM288.226,414.843C286.39,408.589 283.456,403.805 278.213,398.518C262.19,382.361 237.323,382.358 221.203,398.51C215.98,403.743 213.057,408.516 211.2,414.842L210.044,418.78L289.382,418.78L288.226,414.843Z"
              />
              <path
                fill="currentColor"
                d="M241.463,322.031L241.463,289.781C241.463,289.781 218.213,289.525 218.213,289.212C218.213,288.899 249.713,257.169 249.713,257.169C249.713,257.169 281.213,288.899 281.213,289.212C281.213,289.525 257.963,289.781 257.963,289.781L257.963,322.031L241.463,322.031Z"
                style="fill-rule: nonzero"
              />
            </g>
          </svg>
          <svg
            viewBox="0 0 32 36"
            class="sun-icon"
            xmlns="http://www.w3.org/2000/svg"
            v-else-if="item.type === 'sunset'"
          >
            <rect x="-2" y="-2" width="36" height="40" fill="#f6f6f6" />
            <g transform="matrix(0.151304,0,0,0.151304,-22.1954,-34.6843)">
              <path
                fill="currentColor"
                d="M161.213,434.531L161.213,418.781L194.046,418.781L194.541,415.968C195.47,410.687 197.983,404.084 201.238,398.372L204.49,392.666L181.46,369.671L192.71,358.421L215.841,381.516L219.464,379.197C224.28,376.115 229.455,373.935 235.838,372.298L241.088,370.952L241.492,337.781L257.934,337.781L258.338,370.952L263.588,372.298C269.971,373.935 275.146,376.115 279.962,379.197L283.585,381.516L306.703,358.434L317.973,369.629L294.734,392.906L296.282,395.156C299.306,399.551 302.884,407.739 304.177,413.221L305.487,418.781L338.213,418.781L338.213,434.531L161.213,434.531ZM288.226,414.843C286.39,408.589 283.456,403.805 278.213,398.518C262.19,382.361 237.323,382.358 221.203,398.51C215.98,403.743 213.057,408.516 211.2,414.842L210.044,418.78L289.382,418.78L288.226,414.843Z"
              />
              <path
                fill="currentColor"
                class="sun-arrow"
                d="M241.463,322.031L241.463,289.781C241.463,289.781 218.213,289.525 218.213,289.212C218.213,288.899 249.713,257.169 249.713,257.169C249.713,257.169 281.213,288.899 281.213,289.212C281.213,289.525 257.963,289.781 257.963,289.781L257.963,322.031L241.463,322.031Z"
                style="fill-rule: nonzero"
              />
            </g>
          </svg>
          <div v-else class="circle"></div>
        </div>
        <div
          v-if="item.type !== 'recording'"
          class="py-2 py-sm-3 ps-2 text-capitalize fs-6"
        >
          {{ item.type }}
        </div>
        <div
          v-else
          class="recording-detail d-flex align-items-start flex-fill overflow-hidden"
          :class="{
            redacted: (item.data as ApiRecordingResponse).redacted,
            'mb-0': removeMarginBottom(day.items, index),
          }"
        >
          <div
            class="visit-thumb rounded-1"
            v-if="item.data.type !== RecordingType.Audio"
          >
            <image-loader
              :src="thumbnailSrcForRecording(item.data)"
              alt="Thumbnail for first recording of this visit"
              width="64"
              height="64"
            />
          </div>
          <div class="overflow-hidden flex-grow-1">
            <div
              class="tags-container d-flex justify-content-between flex-grow-1"
            >
              <div class="d-flex flex-wrap align-items-start gap-1">
                <span
                  class="visit-species-tag d-flex align-items-center bg-light text-dark rounded-1"
                  v-if="
                    processingInProgress.includes(
                      (item.data as ApiRecordingResponse).processingState,
                    )
                  "
                  ><b-spinner small variant="secondary" /><span class="ms-1"
                    >AI Queued</span
                  ></span
                >
                <span
                  v-else-if="item && item.data && item.data.tracks.length > 0"
                  class="d-flex flex-wrap align-items-start gap-1"
                >
                  <span
                    class="visit-species-tag d-flex align-items-center text-capitalize"
                    :class="
                      (tag.path && tag.path.split('.')) ||
                      (pathForTag(tag.what) || '').split('.')
                    "
                    :key="tag.what"
                    v-for="tag in canonicalTagsForRecording(item.data)"
                    ><span class="me-1">{{
                      displayLabelForClassificationLabel(
                        tag.what,
                        tag.automatic && !tag.human,
                      )
                    }}</span>
                    <material-symbol
                      v-if="tag.human && tag.automatic"
                      name="check"
                      size="1.125rem"
                    />
                    <material-symbol
                      v-else-if="tag.human"
                      name="person"
                      filled
                      size="1rem"
                    />
                    <material-symbol
                      v-else-if="tag.automatic"
                      name="settings"
                      filled
                      size="0.875rem"
                    />
                  </span>
                </span>
                <span
                  class="visit-species-tag text-capitalize"
                  :class="[label.what.toLowerCase().split(' ').join('-')]"
                  :key="label.what"
                  v-for="label in regularLabelsForRecording(
                    (item as RecordingItem).data,
                  )"
                  >{{ label.what }}
                </span>
              </div>
              <div
                class="d-inline-flex flex-grow-1 justify-content-end gap-2 ms-2"
              >
                <span
                  :class="[label.what]"
                  :key="label.what"
                  v-for="label in specialLabelsForRecording(
                    (item as RecordingItem).data,
                  )"
                >
                  <material-symbol
                    :name="
                      label.what === 'cool'
                        ? 'star'
                        : label.what === 'requires review'
                          ? 'flag'
                          : 'chat'
                    "
                    :style="
                      label.what === 'cool'
                        ? 'color:goldenrod'
                        : label.what === 'requires review'
                          ? 'color:#ad0707'
                          : 'color:#3279ed'
                    "
                    size="1.125rem"
                    filled
                  />
                </span>
              </div>
            </div>

            <span class="track-metadata d-flex align-items-center">
              <location-name
                :name="(item as RecordingItem).data.stationName || ''"
                truncate
                class="fs-6"
              />
            </span>
            <div class="d-flex flex-wrap align-items-start">
              <span class="track-metadata d-flex fs-6 me-2">
                <device-name
                  no-margin
                  truncate
                  :color="'rgba(0, 0, 0, 0.5)'"
                  :name="(item as RecordingItem).data.deviceName"
                  :type="deviceTypeFor((item as RecordingItem).data.deviceId)"
                ></device-name>
              </span>
              <span class="track-metadata d-flex align-items-center fs-6">
                <material-symbol
                  name="clear_all"
                  size="1.125rem"
                  class="me-1"
                />
                <span v-if="(item as RecordingItem).data.tracks.length === 0"
                  >No tracks</span
                ><span
                  v-else-if="(item as RecordingItem).data.tracks.length === 1"
                  >1 track</span
                ><span v-else
                  >{{ (item as RecordingItem).data.tracks.length }} tracks</span
                ></span
              >
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import {
  displayLabelForClassificationLabel,
  flatClassifications,
  getClassifications,
} from "@/api/classificationsUtils.ts";
import { formatDuration, timeAtLocation } from "@/models/visitsUtils";
import { DateTime } from "luxon";
import type {
  DeviceId,
  LatLng,
  RecordingId,
  StationId as LocationId,
} from "@typedefs/api/common";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import { onBeforeMount, onMounted, ref } from "vue";
import ImageLoader from "@/components/ImageLoader.vue";
import {
  DeviceType,
  RecordingProcessingState,
  RecordingType,
} from "@typedefs/api/consts.ts";
import {
  canonicalTagsForRecording,
  type TagItem,
} from "@models/recordingUtils.ts";
import type { ApiTrackResponse } from "@typedefs/api/track";
import type { ApiTrackTag } from "@typedefs/api/trackTag";
import type { ApiDeviceResponse } from "@typedefs/api/device";
import DeviceName from "@/components/DeviceName.vue";
import { ClientApi } from "@/api";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";
import LocationName from "@/components/LocationName.vue";
import { BSpinner } from "bootstrap-vue-next";

type RecordingItem = { type: "recording"; data: ApiRecordingResponse };
type SunItem = { type: "sunset" | "sunrise"; data: string };

const processingInProgress = [
  RecordingProcessingState.Analyse,
  RecordingProcessingState.Tracking,
  RecordingProcessingState.TrackAndAnalyse,
];

const props = withDefaults(
  defineProps<{
    recordingsByDay: {
      dateTime: DateTime;
      items: (RecordingItem | SunItem)[];
    }[];
    devices: ApiDeviceResponse[];
    canonicalLocation: LatLng;
    currentlySelectedRecordingId: RecordingId | null;
  }>(),
  { currentlySelectedRecordingId: null },
);

const emit = defineEmits<{
  (e: "selected-recording", id: RecordingId): void;
  (e: "change-highlighted-location", id: LocationId | null): void;
}>();

const labelsForRecording = (recording: ApiRecordingResponse): TagItem[] => {
  // Get unique tags for recording, and compile the taggers.
  const uniqueLabels: Record<string, TagItem> = {};
  for (const tag of recording.tags) {
    let isHumanTagged = false;
    uniqueLabels[tag.detail] = uniqueLabels[tag.detail] || {
      human: false,
      automatic: false,
      what: tag.detail,
      displayName: tag.detail,
      path: "",
    };
    const existingTag = uniqueLabels[tag.detail];
    if (!existingTag.human && !tag.automatic) {
      isHumanTagged = true;
      existingTag.human = !tag.automatic;
    }
    if (!existingTag.automatic && tag.automatic) {
      existingTag.automatic = tag.automatic;
    }

    for (const tag of Object.values(uniqueLabels)) {
      if ((isHumanTagged && tag.human) || (!isHumanTagged && tag.automatic)) {
        uniqueLabels[tag.what] = uniqueLabels[tag.what] || tag;
      }
    }
    // Just take the human tags for the track, fall back to automatic.
  }
  return Object.values(uniqueLabels).sort((a, b) => {
    return a.what > b.what ? 1 : -1;
  });
};

const specialLabels = ["cool", "requires review", "note"];
const regularLabelsForRecording = (
  recording: ApiRecordingResponse,
): TagItem[] => {
  return labelsForRecording(recording).filter(
    (label) => !specialLabels.includes(label.what),
  );
};
const specialLabelsForRecording = (
  recording: ApiRecordingResponse,
): TagItem[] => {
  return labelsForRecording(recording).filter((label) =>
    specialLabels.includes(label.what),
  );
};

const tagsForTrack = (track: ApiTrackResponse): ApiTrackTag[] => {
  const humanTags = track.tags.filter((track) => !track.automatic);
  if (humanTags.length) {
    return humanTags;
  }
  return track.tags;
};

const thumbnailSrcForRecording = (recording: ApiRecordingResponse): string => {
  const nonFalsePositiveTrack = recording.tracks.filter((track) => {
    return tagsForTrack(track).some(
      (tag) => !["false-positive", "unidentified"].includes(tag.what),
    );
  });
  // FIXME: Extract this
  if (nonFalsePositiveTrack.length !== 0) {
    return `${ClientApi.getApiRoot()}/api/v1/recordings/${recording.id}/thumbnail?trackId=${nonFalsePositiveTrack[0].id}`;
  }
  return `${ClientApi.getApiRoot()}/api/v1/recordings/${recording.id}/thumbnail`;
};

const selectedRecording = (recording: SunItem | RecordingItem) => {
  if (recording.type === "recording") {
    if (!recording.data.redacted) {
      emit("selected-recording", (recording as RecordingItem).data.id);
    }
  }
};
const currentlyHighlightedLocation = ref<LocationId | null>(null);

const highlightedLocation = (item: RecordingItem | SunItem) => {
  if (item.type === "recording") {
    emit(
      "change-highlighted-location",
      (item.data as ApiRecordingResponse).stationId as number,
    );
  }
};
const unhighlightedLocation = (item: RecordingItem | SunItem) => {
  if (
    item.type === "recording" &&
    currentlyHighlightedLocation.value ===
      (item.data as ApiRecordingResponse).stationId
  ) {
    emit("change-highlighted-location", null);
  }
};

const deviceTypeFor = (deviceId: DeviceId): DeviceType => {
  const device = props.devices.find((device) => device.id === deviceId);
  if (device) {
    return device.type;
  }
  return DeviceType.Thermal;
};

const pathForTag = (tag: string): string => {
  return flatClassifications.value[tag]?.path || tag;
};

onBeforeMount(async () => {
  await getClassifications();
});

const removeMarginBottom = (
  items: (RecordingItem | SunItem)[],
  index: number,
): boolean => {
  if (index === items.length - 1) {
    return true;
  }
  if (index + 1 < items.length && items[index + 1].type !== "recording") {
    return true;
  }
  return false;
};
</script>

<style scoped lang="less">
@import "../assets/less/breakpoints";
@import "../assets/less/elevation";
.spinner-border-sm {
  --bs-spinner-width: 0.65rem;
  --bs-spinner-height: 0.65rem;
  --bs-spinner-border-width: 0.2em;
}
.day-header {
  position: sticky;
  background: color-mix(in srgb, var(--app-bg-color), transparent 15%);
  backdrop-filter: blur(8px);
  padding-top: var(--cp-spacing-sm);
  z-index: 1;
  margin-left: -4px;
  margin-right: -4px;
  padding-left: 4px;
  padding-right: 4px;
  @media (max-width: @breakpoint-xs-max) {
    top: var(--cp-mobile-header-height);
  }
  @media (min-width: @breakpoint-sm) {
    top: 0;
  }
}

.redacted {
  opacity: 0.5;
  pointer-events: none;
}
.sunrise,
.sunset {
  color: var(--bs-tertiary-color);
}
.list-item {
  transition: background-color linear 0.2s;
  > * {
    //pointer-events: none;
  }
  .visit-time-duration {
    width: calc(var(--cp-grid-base) * 13); // 64px
    text-align: right;
  }
  .visit-timeline {
    border-left: 2px solid var(--bs-gray-300);
    width: 2px;
    @media (max-width: @breakpoint-xs-max) {
      margin-left: var(--cp-spacing-sm);
      margin-right: var(--cp-spacing-sm);
    }
    @media (min-width: @breakpoint-sm) {
      margin-left: var(--cp-spacing-md);
      margin-right: var(--cp-spacing-md);
    }
    .circle {
      margin-top: var(--cp-spacing-sm);
      width: calc(var(--cp-grid-base) * 2); // 8px
      height: calc(var(--cp-grid-base) * 2);
      border-radius: var(--cp-grid-base);
      background: var(--bs-white);
      transform: translateX(-5px);
      border: 2px solid var(--bs-gray-400);
    }
    .sun-icon {
      width: calc(var(--cp-grid-base) * 2); // 8px
      height: calc(var(--cp-grid-base) * 2);
      color: var(--bs-gray-400);
      transform: translateX(-4.5px) scale(3.5);
      @media (max-width: @breakpoint-xs-max) {
        margin-top: var(--cp-spacing-xs);
      }
      @media (min-width: @breakpoint-sm) {
        margin-top: var(--cp-spacing-lg);
      }
      .sun-arrow {
        transform-box: fill-box;
        transform-origin: center;
        transform: rotate(180deg);
      }
    }
  }
  &:first-child,
  &:last-child {
    .visit-timeline {
      position: relative;
      &::before {
        position: absolute;
        display: block;
        content: " ";
        height: 50%;
        width: 2px;
        left: -2px;
        border-left: 2px dashed var(--app-bg-color);
      }
    }
  }
  &:last-child {
    .visit-timeline {
      &::before {
        top: var(--cp-spacing-md);
        height: unset;
        bottom: 0;
      }
    }
  }
  .recording-detail {
    container-type: inline-size;
    background: var(--bs-white);
    border-radius: var(--bs-border-radius);
    cursor: pointer;
    transform: translate3d(0, 0, 0);
    transition:
      transform 0.1s,
      box-shadow 0.15s;
    .standard-shadow();
    @media (max-width: @breakpoint-xs-max) {
      padding: var(--cp-spacing-xs);
      margin-bottom: var(--cp-spacing-xs);
    }
    @media (min-width: @breakpoint-sm) {
      padding: var(--cp-spacing-sm);
      margin-bottom: var(--cp-spacing-sm);
    }
    &:hover {
      box-shadow: 0 6px 12px 0 rgba(44, 79, 1, 0.1);
      transform: translate3d(0, -2px, 0);
    }
  }
  .visit-thumb {
    min-width: calc(var(--cp-grid-base) * 16); // 64px
    max-width: calc(var(--cp-grid-base) * 16);
    width: calc(var(--cp-grid-base) * 16);
    height: calc(var(--cp-grid-base) * 16);
    overflow: hidden;
    position: relative;
    background: var(--bs-gray-200);
    border-radius: var(--bs-border-radius-sm);
    @media (max-width: @breakpoint-xs-max) {
      margin-right: var(--cp-spacing-sm);
    }
    @media (min-width: @breakpoint-sm) {
      margin-right: var(--cp-spacing-md);
    }
  }
  .tags-container {
    margin-bottom: var(--cp-spacing-xxs);
  }
  .visit-species-tag {
    background: var(--cp-tag-no-priority);
    color: var(--bs-white);
    display: inline-block;
    //line-height: var(--cp-line-height-md);
    border-radius: var(--bs-border-radius-sm);
    font-weight: var(--cp-font-weight-medium);
    padding-left: calc(var(--cp-spacing-xxs) + var(--cp-spacing-xxxs));
    padding-right: calc(var(--cp-spacing-xxs) + var(--cp-spacing-xxxs));
    @media (max-width: @breakpoint-xs-max) {
      font-size: var(--cp-font-size-sm);
    }
    @media (min-width: @breakpoint-sm) {
      font-size: var(--cp-font-size-md);
    }
    &.mustelid {
      background: var(--cp-tag-priority-badge-1);
    }
    &.possum,
    &.cat {
      background: var(--cp-tag-priority-badge-2);
    }
    &.rodent,
    &.hedgehog {
      background: var(--cp-tag-priority-badge-3);
    }
    &.test-recording,
    &.startup-recording,
    &.shutdown-recording {
      background: #6a8bd5;
    }
    &.redacted-for-privacy {
      background: #d56a6e;
    }
  }
}
</style>
