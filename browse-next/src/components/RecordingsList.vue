<template>
  <div
    class="mb-3 day-container"
    v-for="day in recordingsByDay"
    :key="day.dateTime.day"
  >
    <div class="day-header fw-bold px-2 pb-2 fs-7">
      {{ day.dateTime.toLocaleString(DateTime.DATE_FULL) }}
    </div>

    <div
      v-for="(item, index) in day.items"
      :key="index"
      class="list-item d-flex user-select-none fs-8"
      :class="[
        item.type,
        {
          selected:
            item.type === 'recording' &&
            item.data.id === currentlySelectedRecordingId,
        },
      ]"
      @click="selectedRecording(item)"
      @mouseenter="() => highlightedLocation(item)"
      @mouseleave="() => unhighlightedLocation(item)"
    >
      <div
        class="visit-time-duration d-flex flex-column py-2 pe-3 flex-shrink-0"
      >
        <span class="pb-1" v-if="item.type === 'recording'">{{
          timeAtLocation(item.data.recordingDateTime, canonicalLocation)
        }}</span>
        <span class="pb-1" v-else>{{
          timeAtLocation(item.data, canonicalLocation)
        }}</span>
        <span
          class="duration fs-8"
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
      <div v-if="item.type !== 'recording'" class="py-2 ps-3 text-capitalize">
        {{ item.type }}
      </div>
      <div
        v-else
        class="d-flex py-2 ps-2 align-items-start flex-fill overflow-hidden recording-detail my-1 me-1"
      >
        <div class="visit-thumb rounded-1">
          <image-loader
            :src="thumbnailSrcForRecording(item.data)"
            alt="Thumbnail for first recording of this visit"
            width="45"
            height="45"
          />
        </div>
        <div
          class="ps-3 d-flex flex-column text-truncate flex-wrap flex-grow-1"
        >
          <div
            class="tags-container d-flex justify-content-between flex-grow-1"
          >
            <div class="d-flex flex-wrap">
              <span
                class="d-flex align-items-center mb-1 bg-light rounded-1 p-1"
                v-if="processingInProgress.includes((item.data as ApiRecordingResponse).processingState)"
                ><b-spinner small variant="secondary" /><span class="ms-1"
                  >AI Queued</span
                ></span
              >
              <span
                v-else
                class="visit-species-tag px-1 mb-1 text-capitalize me-1"
                :class="tag.path.split('.')"
                :key="tag.what"
                v-for="tag in tagsForRecording(item.data)"
                ><span class="me-1">{{
                  displayLabelForClassificationLabel(
                    tag.what,
                    tag.automatic && !tag.human
                  )
                }}</span
                ><font-awesome-icon
                  icon="check"
                  size="xs"
                  v-if="tag.human && tag.automatic"
                  class="mx-1 align-middle"
                  style="padding-bottom: 2px"
                /><font-awesome-icon
                  icon="user"
                  size="xs"
                  v-else-if="tag.human"
                  class="mx-1 align-middle"
                  style="padding-bottom: 2px"
                /><font-awesome-icon
                  icon="cog"
                  size="xs"
                  v-else-if="tag.automatic"
                  class="mx-1 align-middle"
                  style="padding-bottom: 2px"
                />
              </span>
              <span
                class="visit-species-tag px-1 mb-1 text-capitalize me-1"
                :class="[label.what]"
                :key="label.what"
                v-for="label in regularLabelsForRecording((item as RecordingItem).data)"
                >{{ label.what }}
              </span>
            </div>
            <div>
              <span
                class="px-1 mb-1 me-1"
                :class="[label.what]"
                :key="label.what"
                v-for="label in specialLabelsForRecording((item as RecordingItem).data)"
              >
                <font-awesome-icon
                  :icon="
                    label.what === 'cool' ? ['fas', 'star'] : ['fas', 'flag']
                  "
                  :color="label.what === 'cool' ? 'goldenrod' : '#ad0707'"
                />
              </span>
            </div>
          </div>

          <span class="visit-station-name text-truncate flex-shrink-1 pe-2"
            ><font-awesome-icon
              icon="map-marker-alt"
              size="xs"
              class="station-icon pe-1 text"
            />{{ (item as RecordingItem).data.stationName }}</span
          >
          <div class="d-flex">
            <span class="visit-station-name text-truncate flex-shrink-1 pe-2"
              ><font-awesome-icon
                icon="video"
                size="xs"
                class="station-icon pe-1 text"
              />{{ (item as RecordingItem).data.deviceName }}</span
            >
            <span class="visit-station-name text-truncate flex-shrink-1 pe-2"
              ><font-awesome-icon
                icon="stream"
                size="xs"
                class="station-icon pe-1 text"
              /><span v-if="(item as RecordingItem).data.tracks.length === 0"
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
</template>

<script lang="ts" setup>
import { displayLabelForClassificationLabel } from "@/api/Classifications";
import { formatDuration, timeAtLocation } from "@/models/visitsUtils";
import { DateTime } from "luxon";
import type {
  LatLng,
  RecordingId,
  StationId as LocationId,
} from "@typedefs/api/common";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import { API_ROOT } from "@api/root";
import { ref } from "vue";
import ImageLoader from "@/components/ImageLoader.vue";
import {
  RecordingProcessingState,
  RecordingType,
} from "@typedefs/api/consts.ts";
import { type TagItem, tagsForRecording } from "@models/recordingUtils.ts";

type RecordingItem = { type: "recording"; data: ApiRecordingResponse };
type SunItem = { type: "sunset" | "sunrise"; data: string };

const processingInProgress = [
  RecordingProcessingState.Analyse,
  RecordingProcessingState.Tracking,
];

const _props = withDefaults(
  defineProps<{
    recordingsByDay: {
      dateTime: DateTime;
      items: (RecordingItem | SunItem)[];
    }[];
    canonicalLocation: LatLng;
    currentlySelectedRecordingId: RecordingId | null;
  }>(),
  { currentlySelectedRecordingId: null }
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
  return Object.values(uniqueLabels);
};

const specialLabels = ["cool", "requires review"];
const regularLabelsForRecording = (
  recording: ApiRecordingResponse
): TagItem[] => {
  return labelsForRecording(recording).filter(
    (label) => !specialLabels.includes(label.what)
  );
};
const specialLabelsForRecording = (
  recording: ApiRecordingResponse
): TagItem[] => {
  return labelsForRecording(recording).filter((label) =>
    specialLabels.includes(label.what)
  );
};

const thumbnailSrcForRecording = (recording: ApiRecordingResponse): string => {
  return `${API_ROOT}/api/v1/recordings/${recording.id}/thumbnail`;
};

const selectedRecording = (recording: SunItem | RecordingItem) => {
  if (recording.type === "recording") {
    emit("selected-recording", (recording as RecordingItem).data.id);
  }
};
const currentlyHighlightedLocation = ref<LocationId | null>(null);

const highlightedLocation = (item: RecordingItem | SunItem) => {
  if (item.type === "recording") {
    emit(
      "change-highlighted-location",
      (item.data as ApiRecordingResponse).stationId as number
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
</script>

<style scoped lang="less">
.spinner-border-sm {
  --bs-spinner-width: 0.65rem;
  --bs-spinner-height: 0.65rem;
  --bs-spinner-border-width: 0.2em;
}
.visit-station-name {
  max-width: calc(100% - 1rem);
}
.visits-daily-breakdown {
  background: white;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.1);

  .header {
    border-bottom: 1px solid #eee;
    font-weight: 500;
  }
  .visit-species-count {
    border-radius: 2px;
    color: #444444;
    display: inline-block;
    height: 24px;
    line-height: 24px;
    margin-bottom: 10px;
    &:not(:last-child) {
      margin-right: 21px;
    }
    .species {
      padding: 0 5px;
    }
    .count {
      background: #7d7d7d;
      border-top-left-radius: 2px;
      border-bottom-left-radius: 2px;
      color: white;
      text-align: center;
      padding: 0 2px;
      min-width: 21px;
      font-weight: 500;
      display: inline-block;
    }
    background: rgba(125, 125, 125, 0.1);
    &.mustelid {
      background: rgba(173, 0, 0, 0.1);
      .count {
        background: #ad0000;
      }
    }
    &.possum,
    &.cat {
      background: rgba(163, 0, 20, 0.1);
      .count {
        background: #a30014;
      }
    }
    &.rodent,
    &.hedgehog {
      background: rgba(163, 96, 0, 0.1);
      .count {
        background: #a36000;
      }
    }
  }
}
.sunrise,
.sunset {
  color: #aaa;
}
.night-icon {
  color: rgba(0, 0, 0, 0.2);
}
.list-item {
  line-height: 14px;
  transition: background-color linear 0.2s;
  border-radius: 3px;
  > * {
    pointer-events: none;
  }
  &:hover:not(&[class*="sun"]) {
    background: #eee;
  }
  &.selected {
    background: #aaa;
  }
  .visit-time-duration {
    width: 70px;
    color: #666;
    text-align: right;
  }
  &.sunrise,
  &.sunset {
    .visit-time-duration {
      color: #aaa;
    }
  }
  .visit-thumb {
    min-width: 45px;
    max-width: 45px;
    width: 45px;
    height: 45px;
    overflow: hidden;
    position: relative;
    background: #aaa;
    border-radius: 2.5px;
    .num-recordings {
      background: rgba(0, 0, 0, 0.8);
      color: white;
      position: absolute;
      bottom: 0;
      left: 0;
    }
  }
  .visit-timeline {
    border-left: 1px solid #ddd;
    .circle {
      margin-top: 12px;
      width: 6px;
      height: 6px;
      border-radius: 3px;
      background: white;
      transform: translateX(-3.5px);
      border: 1px solid #ddd;
    }
    .sun-icon {
      margin-top: 12px;
      width: 6px;
      height: 6px;
      color: #ccc;
      background: white;
      transform: translateX(-3.5px) scale(3.5);
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
        width: 1px;
        left: -1px;
        border-left: 1px dashed white;
      }
    }
  }
  &:last-child {
    .visit-timeline {
      &::before {
        top: 15px;
        height: unset;
        bottom: 0;
      }
    }
  }
  .visit-species-tag {
    background: #999;
    color: white;
    display: inline-block;
    border-radius: 3px;
    line-height: 20px;
    font-weight: 500;
    &.mustelid {
      background: #ad0000;
    }
    &.possum,
    &.cat {
      background: #a30014;
    }
    &.rodent,
    &.hedgehog {
      background: #a36000;
    }
  }
  .station-icon {
    color: rgba(0, 0, 0, 0.5);
  }

  .recording-detail {
    max-width: 469px;
    background: white;
    border-radius: 3px;
  }
}
img.image-loading {
  background: red;
}
.day-header {
  position: sticky;
  top: 0;
  background: rgba(246, 246, 246, 0.85);
  padding-top: 12px;
  z-index: 1;
  border-bottom: 1px solid #ddd;
}
</style>
