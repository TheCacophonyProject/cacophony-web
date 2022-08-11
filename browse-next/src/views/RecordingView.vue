<script setup lang="ts">
// eslint-disable-next-line no-undef
import { useRoute } from "vue-router";
import { computed, inject, onMounted, ref } from "vue";
import type { ComputedRef } from "vue";
import type { ApiVisitResponse } from "@typedefs/api/monitoring";
import type { LatLng } from "@typedefs/api/common";
import { visitDuration, visitTimeAtLocation } from "@models/visitsUtils";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import router from "@/router";
import { urlNormalisedCurrentGroupName } from "@models/LoggedInUser";
const route = useRoute();
const emit = defineEmits(["close"]);

const recordingIds = computed(() => {
  const ids = route.params.recordingIds;
  return (ids && (ids as string).split(",").map(Number)) || [];
});
const currentRecordingId = computed<number>(() =>
  Number(route.params.currentRecordingId)
);
const visitLabel = computed<string>(() => route.params.visitLabel as string);

const nextRecordingIndex = computed(() => {
  return recordingIds.value.indexOf(Number(currentRecordingId.value)) + 1;
});

const previousRecordingIndex = computed(() => {
  if (recordingIds.value.indexOf(Number(currentRecordingId.value)) === 0) {
    return -1;
  }
  return recordingIds.value.indexOf(Number(currentRecordingId.value)) - 1;
});

const isInVisitContext = computed<boolean>(() => {
  return !!visitLabel.value;
});

const hasNextRecording = computed<boolean>(() => {
  return nextRecordingIndex.value < recordingIds.value.length + 1;
});

const hasPreviousRecording = computed<boolean>(() => {
  return previousRecordingIndex.value >= 0;
});

const gotoNextRecording = () => {
  if (nextRecordingIndex.value < recordingIds.value.length) {
    console.log(nextRecordingIndex.value);
    const nextRecordingId = recordingIds.value[nextRecordingIndex.value];
    console.log("HERE", nextRecordingId);
    router.push({
      name: route.name as string,
      params: {
        recordingIds: recordingIds.value.join(","),
        visitLabel: visitLabel.value,
        currentRecordingId: nextRecordingId,
        groupName: urlNormalisedCurrentGroupName.value,
      },
    });
  }
};

const gotoPreviousRecording = () => {};

// TODO - Handle previous visits

const visitContext: ComputedRef<ApiVisitResponse> | undefined =
  inject("selectedVisit");
const locationContext: ComputedRef<LatLng> | undefined =
  inject("locationContext");

const isInGreaterVisitContext = computed<boolean>(() => {
  return !!visitContext;
});

const recording = ref<ApiRecordingResponse | null>(null);

const loadRecording = async () => {
  // Load the current recording, and then preload the next and previous recordings.
  // This behaviour will differ depending on whether we're viewing raw recordings or visits.
};

onMounted(async () => {
  await loadRecording();
});

const visitDurationString = computed<string>(() => {
  if (
    visitContext &&
    locationContext &&
    visitContext.value &&
    locationContext.value
  ) {
    const duration = visitDuration(visitContext.value);
    let visitStart = visitTimeAtLocation(
      visitContext.value.timeStart,
      locationContext.value
    );
    const visitEnd = visitTimeAtLocation(
      visitContext.value.timeEnd,
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
      <div class="player">{{ currentRecordingId }}</div>
      <div class="recording-info">
        <span v-if="isInVisitContext">In a visit {{ visitLabel }}</span>
      </div>
    </div>
    <footer class="recording-view-footer py-1">
      <nav class="d-flex justify-content-between">
        <button
          type="button"
          class="btn d-flex flex-row-reverse align-items-center"
          :disabled="!hasPreviousRecording"
          @click="gotoPreviousRecording"
        >
          <span class="d-none d-md-flex ps-2 flex-column align-items-start">
            <span class="fs-8 fw-bold">Previous recording</span>
            <span class="fs-9" v-if="hasPreviousRecording"
              >{{ previousRecordingIndex - 1 }}/
              {{ recordingIds.length }}</span
            >
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
          :disabled="!hasNextRecording"
          @click="gotoNextRecording"
        >
          <span class="d-none d-md-flex pe-2 flex-column align-items-end">
            <span class="fs-8 fw-bold">Next recording</span>
            <span class="fs-9" v-if="hasNextRecording"
              >{{ nextRecordingIndex + 1 }}/{{ recordingIds.length }}</span
            >
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
  border-top: 2px solid #e1e1e1;
}
.recording-info {
}
.player {
  background: #ccc;
  width: 640px;
  min-height: 500px;
}
</style>
