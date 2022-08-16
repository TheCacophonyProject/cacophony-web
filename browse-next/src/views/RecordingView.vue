<script setup lang="ts">
// eslint-disable-next-line no-undef
import { useRoute } from "vue-router";
import { computed, inject, onMounted, ref, watch } from "vue";
import type { ComputedRef, Ref } from "vue";
import type { LatLng, RecordingId, StationId } from "@typedefs/api/common";
import {
  timezoneForLocation,
  visitDuration,
  visitTimeAtLocation,
} from "@models/visitsUtils";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import router from "@/router";
import { getRecordingById } from "@api/Recording";
import type { JwtToken } from "@api/types";
import {
  selectedVisit,
  maybeFilteredVisitsContext as visitsContext,
} from "@models/SelectionContext";
import type { ApiVisitResponse } from "@typedefs/api/monitoring";
import MapWithPoints from "@/components/MapWithPoints.vue";
import type { ApiStationResponse } from "@typedefs/api/station";
import { DateTime } from "luxon";
import type { NamedPoint } from "@models/mapUtils";
import { truncateLongStationNames } from "@/utils";
const route = useRoute();
const emit = defineEmits(["close"]);

const stations: Ref<ApiStationResponse[] | null> =
  inject("activeStationsContext") || ref(null);

const recordingIds = ref(
  (() => {
    const ids = route.params.recordingIds;
    return (ids && (ids as string).split(",").map(Number)) || [];
  })()
);
const currentRecordingId = ref<number>(Number(route.params.currentRecordingId));
const currentStationId = ref<StationId | null>(null);
const currentStations = ref<ApiStationResponse[] | null>(stations.value);
const visitLabel = ref<string>(route.params.visitLabel as string);

watch(
  () => route.params.currentRecordingId,
  (nextRecordingId) => {
    currentRecordingId.value = Number(nextRecordingId);
    loadRecording();
  }
);

watch(stations, (nextStations) => {
  if (nextStations) {
    console.log("Stations", nextStations);
    currentStations.value = nextStations;
  }
});

watch(
  () => route.params.visitLabel,
  (nextVisitLabel) => {
    visitLabel.value = nextVisitLabel as string;
  }
);

watch(
  () => route.params.recordingIds,
  (nextRecordingIds) => {
    if (nextRecordingIds) {
      recordingIds.value = (nextRecordingIds as string).split(",").map(Number);
    } else {
      recordingIds.value = [];
    }
  }
);

const nextVisit = computed<ApiVisitResponse | null>(() => {
  return (
    (currentVisitIndex.value !== null &&
      visitsContext.value &&
      currentVisitIndex.value < visitsContext.value.length - 1 &&
      visitsContext.value[currentVisitIndex.value + 1]) ||
    null
  );
});

const previousVisit = computed<ApiVisitResponse | null>(() => {
  return (
    (currentVisitIndex.value !== null &&
      visitsContext.value &&
      currentVisitIndex.value !== 0 &&
      visitsContext.value[currentVisitIndex.value - 1]) ||
    null
  );
});

const currentRecordingIndex = computed<number | null>(() => {
  const index = recordingIds.value.indexOf(currentRecordingId.value);
  if (index === -1) {
    return null;
  }
  return index;
});

const nextRecordingIndex = computed<number | null>(() => {
  if (currentRecordingIndex.value !== null) {
    if (currentRecordingIndex.value + 1 >= recordingIds.value.length) {
      return null;
    }
    return currentRecordingIndex.value + 1;
  }
  return null;
});

const previousRecordingIndex = computed<number | null>(() => {
  if (currentRecordingIndex.value !== null) {
    if (currentRecordingIndex.value - 1 < 0) {
      return null;
    }
    return currentRecordingIndex.value - 1;
  }
  return null;
});

const isInVisitContext = computed<boolean>(() => {
  return !!visitLabel.value;
});

const currentVisitIndex = computed<number | null>(() => {
  if (visitsContext.value && selectedVisit.value) {
    const currentVisitIndex = visitsContext.value.indexOf(selectedVisit.value);
    if (currentVisitIndex !== -1) {
      return currentVisitIndex;
    }
    return null;
  }
  return null;
});

const hasNextRecording = computed<boolean>(() => {
  return nextRecordingIndex.value !== null;
});

const hasNextVisit = computed<boolean>(() => {
  return nextVisit.value !== null;
});

const hasPreviousRecording = computed<boolean>(() => {
  return previousRecordingIndex.value !== null;
});

const hasPreviousVisit = computed<boolean>(() => {
  return previousVisit.value !== null;
});

const gotoNextRecordingOrVisit = () => {
  if (hasNextRecording.value) {
    gotoNextRecording();
  } else {
    gotoNextVisit();
  }
};

const gotoNextRecording = () => {
  if (hasNextRecording.value) {
    const nextRecordingId =
      recordingIds.value[nextRecordingIndex.value as number];
    router.push({
      name: route.name as string,
      params: {
        ...route.params,
        recordingIds: recordingIds.value.join(","),
        visitLabel: visitLabel.value,
        currentRecordingId: nextRecordingId,
      },
    });
  }
};

const gotoNextVisit = () => {
  if (nextVisit.value) {
    selectedVisit.value = nextVisit.value;
    router.push({
      name: route.name as string,
      params: {
        ...route.params,
        recordingIds: selectedVisit.value.recordings
          .map(({ recId }) => recId)
          .join(","),
        visitLabel: selectedVisit.value.classification,
        currentRecordingId: selectedVisit.value.recordings[0].recId,
      },
    });
  }
};

const gotoPreviousRecordingOrVisit = () => {
  if (hasPreviousRecording.value) {
    gotoPreviousRecording();
  } else {
    gotoPreviousVisit();
  }
};

const gotoPreviousRecording = () => {
  if (hasPreviousRecording.value) {
    const previousRecordingId =
      recordingIds.value[previousRecordingIndex.value as number];
    router.push({
      name: route.name as string,
      params: {
        ...route.params,
        recordingIds: recordingIds.value.join(","),
        visitLabel: visitLabel.value,
        currentRecordingId: previousRecordingId,
      },
    });
  }
};

const gotoPreviousVisit = () => {
  if (previousVisit.value) {
    selectedVisit.value = previousVisit.value;
    const currentRecordingId =
      selectedVisit.value.recordings[selectedVisit.value.recordings.length - 1]
        .recId;
    const recordingIds = selectedVisit.value.recordings
      .map(({ recId }) => recId)
      .join(",");
    router.push({
      name: route.name as string,
      params: {
        ...route.params,
        visitLabel: selectedVisit.value.classification,
        recordingIds,
        currentRecordingId,
      },
    });
  }
};

// TODO - Handle previous visits

const recalculateCurrentVisit = () => {
  console.log("TODO - recalculate current visit");
  // When a tag for the current visit changes, we need to recalculate visits.  Should we tell the parent to do this,
  // or just do it ourselves and get out of sync with the parent?  I'm leaning towards telling the parent.
};

const locationContext: ComputedRef<LatLng> | undefined =
  inject("locationContext");

const isInGreaterVisitContext = computed<boolean>(() => {
  return !!selectedVisit.value;
});

interface RecordingData {
  recording: ApiRecordingResponse;
  downloadJwt: JwtToken<RecordingId>;
}

const recordingData = ref<RecordingData | null>(null);

const recordingIsLoading = computed(() => recordingData.value === null);

const loadRecording = async () => {
  console.log("Load recording");
  recordingData.value = null;
  if (currentRecordingId.value) {
    // Load the current recording, and then preload the next and previous recordings.
    // This behaviour will differ depending on whether we're viewing raw recordings or visits.
    const recordingResponse = await getRecordingById(currentRecordingId.value);

    if (recordingResponse.success) {
      // NOTE: Only handling RAW recordings here, and assuming they always exist.
      recordingData.value = {
        recording: recordingResponse.result.recording,

        // TODO: Handle expiry of this
        downloadJwt: recordingResponse.result.downloadRawJWT || "",
      };
      console.log("Loaded recording", recordingData.value);
    } else {
      // TODO: Handle recording permissions error
    }
  }
};

onMounted(async () => {
  await loadRecording();
});

const visitDurationString = computed<string>(() => {
  if (selectedVisit.value && locationContext && locationContext.value) {
    const duration = visitDuration(selectedVisit.value);
    let visitStart = visitTimeAtLocation(
      selectedVisit.value.timeStart,
      locationContext.value
    );
    const visitEnd = visitTimeAtLocation(
      selectedVisit.value.timeEnd,
      locationContext.value
    );
    if (visitStart === visitEnd) {
      return `${visitStart} (${duration})`;
    }
    if (visitStart.slice(-2) === visitEnd.slice(-2)) {
      // If visitStart has the same suffix as visitEnd, omit it.
      visitStart = visitStart.replace("am", "").replace("pm", "");
    }
    return `${visitStart}&ndash;${visitEnd} (${duration})`;
  }
  return "";
});

const recordingDateTime = computed<DateTime | null>(() => {
  if (recordingData.value) {
    if (recordingData.value.recording.location) {
      const zone = timezoneForLocation(recordingData.value.recording.location);
      return DateTime.fromISO(recordingData.value.recording.recordingDateTime, {
        zone,
      });
    }
    return DateTime.fromISO(recordingData.value?.recording.recordingDateTime);
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

const currentStationName = computed<string>(() => {
  return truncateLongStationNames(
    recordingData.value?.recording.stationName || ""
  );
});

const mapPointForRecording = computed<NamedPoint[]>(() => {
  if (recordingData.value && recordingData.value.recording.location) {
    return [
      {
        name: currentStationName.value,
        location: recordingData.value.recording.location,
        group: recordingData.value.recording.groupName,
      },
    ] as NamedPoint[];
  }
  return [];
});

const navLinkClasses = ["nav-item", "nav-link", "border-0"];
const activeTabName = computed(() => {
  return route.name;
});

const recordingViewContext = "dashboard-visit";
</script>
<template>
  <div class="recording-view">
    <header
      class="recording-view-header d-flex justify-content-between px-3 py-1"
    >
      <div v-if="isInVisitContext">
        <span class="text-uppercase fs-8 fw-bold">Visit</span>
        <div>
          <span class="fs-5 fw-bold text-capitalize">{{ visitLabel }}</span>
          <span
            v-if="isInGreaterVisitContext"
            v-html="visitDurationString"
            class="ms-3 fs-7"
            style="color: #444"
          />
        </div>
      </div>
      <button type="button" class="btn" @click="() => emit('close')">
        <font-awesome-icon icon="xmark" />
      </button>
    </header>
    <div class="d-flex">
      <div class="player-container">
        <div class="player"></div>
        <div class="player-tracks"></div>
      </div>
      <div class="recording-info d-flex flex-column flex-fill">
        <div class="recording-station-info d-flex mb-3">
          <map-with-points
            class="recording-location-map"
            :points="mapPointForRecording"
            :active-points="mapPointForRecording"
            :highlighted-point="ref(null)"
            :is-interactive="false"
            :markers-are-interactive="false"
            :has-attribution="false"
            :can-change-base-map="false"
            :zoom="false"
            :radius="30"
          />
          <div>
            <div>{{ currentStationName }}</div>
            <div class="recording-date-time">
              <span v-html="recordingDate" />
              <span v-html="recordingStartTime" />
            </div>
          </div>
        </div>
        <ul
          class="nav nav-tabs justify-content-md-center justify-content-evenly"
        >
          <router-link
            :class="[
              ...navLinkClasses,
              { active: activeTabName === `${recordingViewContext}-tracks` },
            ]"
            title="Tracks"
            :to="{
              name: `${recordingViewContext}-tracks`,
              params: route.params,
            }"
            >Tracks (6)</router-link
          >
          <router-link
            :class="[
              ...navLinkClasses,
              { active: activeTabName === `${recordingViewContext}-labels` },
            ]"
            title="Labels"
            :to="{
              name: `${recordingViewContext}-labels`,
              params: route.params,
            }"
            >Labels (3)</router-link
          >
        </ul>
        <router-view
          :recording="recordingData && recordingData.recording"
          @trackTagChanged="recalculateCurrentVisit"
        />
      </div>
    </div>
    <footer class="recording-view-footer">
      <div class="visit-progress">
        <div
          class="progress-bar"
          :style="{
            width: `${
              ((currentRecordingIndex + 1) / recordingIds.length) * 100
            }%`,
          }"
        ></div>
      </div>
      <nav class="d-flex py-1 justify-content-between">
        <button
          type="button"
          class="btn d-flex flex-row-reverse align-items-center"
          :disabled="!hasPreviousRecording && !hasPreviousVisit"
          @click="gotoPreviousRecordingOrVisit"
        >
          <span class="d-none d-md-flex ps-2 flex-column align-items-start">
            <span class="fs-8 fw-bold" v-if="hasPreviousRecording"
              >Previous recording</span
            >
            <span class="fs-8 fw-bold" v-else-if="hasPreviousVisit"
              >Previous visit</span
            >
            <span class="fs-8" v-else v-html="'&nbsp;'"></span>
            <span class="fs-9" v-if="hasPreviousRecording"
              >{{ previousRecordingIndex + 1 }}/ {{ recordingIds.length }}</span
            >
            <span class="fs-9" v-else-if="previousVisit">
              <span class="text-capitalize fw-bold">{{
                previousVisit.classification
              }}</span
              >,&nbsp;<span
                >{{ previousVisit.recordings.length }} recording<span
                  v-if="previousVisit.recordings.length > 1"
                  >s</span
                ></span
              >
            </span>
            <span class="fs-9" v-else v-html="'&nbsp;'"></span>
          </span>
          <span class="px-1">
            <svg width="10" height="16" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M10 2.28c0 .17-.06.32-.18.45L4.69 8l5.13 5.27a.64.64 0 0 1 0 .89l-1.6 1.65a.59.59 0 0 1-.44.19.59.59 0 0 1-.43-.19L.18 8.45A.62.62 0 0 1 0 8c0-.17.06-.32.18-.45L7.35.2a.59.59 0 0 1 .43-.2c.17 0 .31.06.43.19l1.6 1.65c.13.12.19.27.19.44Z"
                fill="#666"
              />
            </svg>
          </span>
        </button>
        <button
          type="button"
          class="btn d-flex align-items-center"
          :disabled="!hasNextRecording && !hasNextVisit"
          @click="gotoNextRecordingOrVisit"
        >
          <span class="d-none d-md-flex pe-2 flex-column align-items-end">
            <span class="fs-8 fw-bold" v-if="hasNextRecording"
              >Next recording</span
            >
            <span class="fs-8 fw-bold" v-else-if="hasNextVisit"
              >Next visit</span
            >
            <span class="fs-8" v-else v-html="'&nbsp;'"></span>
            <span class="fs-9" v-if="hasNextRecording"
              >{{ nextRecordingIndex + 1 }}/{{ recordingIds.length }}</span
            >
            <span class="fs-9" v-else-if="nextVisit">
              <span class="text-capitalize fw-bold">{{
                nextVisit.classification
              }}</span
              >,&nbsp;<span
                >{{ nextVisit.recordings.length }} recording<span
                  v-if="nextVisit.recordings.length > 1"
                  >s</span
                ></span
              >
            </span>
            <span class="fs-9" v-else v-html="'&nbsp;'"></span>
          </span>
          <span class="px-1">
            <svg width="10" height="16" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M10 8c0 .17-.06.32-.18.45L2.65 15.8a.59.59 0 0 1-.43.19.59.59 0 0 1-.43-.19l-1.6-1.65a.62.62 0 0 1-.19-.44c0-.17.06-.32.18-.45L5.31 8 .18 2.73A.62.62 0 0 1 0 2.28a.6.6 0 0 1 .18-.44L1.78.19A.59.59 0 0 1 2.23 0c.17 0 .31.06.43.19l7.17 7.36c.12.13.18.28.18.45Z"
                fill="#666"
              />
            </svg>
          </span>
        </button>
      </nav>
    </footer>
  </div>
</template>

<style scoped lang="less">
.recording-view-header {
  border-bottom: 2px solid #e1e1e1;
}
.recording-view-footer {
  .visit-progress {
    height: 2px;
    background: #e1e1e1;
    .progress-bar {
      height: 100%;
      background: #6dbd4b;
    }
  }
}
.recording-info {
}
.player {
  background: #ccc;
  width: 640px;
  min-height: 500px;
  aspect-ratio: 4 / 3;
}
.recording-location-map {
  width: 120px;
  height: 120px;
}
.nav-item.active {
  background: unset;
  border-bottom: 3px solid #6dbd4b !important;
}
</style>
