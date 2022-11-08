<script setup lang="ts">
import { useRoute } from "vue-router";
import type { RouteParamsRaw } from "vue-router";
import { computed, inject, nextTick, onMounted, ref, watch } from "vue";
import type { ComputedRef, Ref } from "vue";
import type {
  LatLng,
  RecordingId,
  StationId,
  TagId,
  TrackId,
} from "@typedefs/api/common";
import {
  timezoneForLocation,
  visitDuration,
  visitTimeAtLocation,
} from "@models/visitsUtils";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import router from "@/router";
import { getRecordingById } from "@api/Recording";
import {
  selectedVisit,
  maybeFilteredVisitsContext as visitsContext,
} from "@models/SelectionContext";
import type { ApiVisitResponse } from "@typedefs/api/monitoring";
import MapWithPoints from "@/components/MapWithPoints.vue";
import type { ApiStationResponse } from "@typedefs/api/station";
import { DateTime } from "luxon";
import type { NamedPoint } from "@models/mapUtils";
import CptvPlayer from "@/components/cptv-player/CptvPlayer.vue";
import type { ApiTrackResponse } from "@typedefs/api/track";
import type { ApiRecordingTagResponse } from "@typedefs/api/tag";
import { useElementSize, useMediaQuery } from "@vueuse/core";
import RecordingViewLabels from "@/components/RecordingViewLabels.vue";
import RecordingViewTracks from "@/components/RecordingViewTracks.vue";
import RecordingViewActionButtons from "@/components/RecordingViewActionButtons.vue";
import { displayLabelForClassificationLabel } from "@api/Classifications";
import { CurrentUser, CurrentUserCreds } from "@models/LoggedInUser";
import type { ApiHumanTrackTagResponse } from "@typedefs/api/trackTag";
import type { VisitRecordingTag } from "@typedefs/api/monitoring";
import { API_ROOT } from "@api/root";
import { deleteRecording as apiDeleteRecording } from "@api/Recording";

const route = useRoute();
const emit = defineEmits(["close"]);
const inlineModalEl = ref<HTMLDivElement>();

const { height: inlineModalHeight } = useElementSize(inlineModalEl);
watch(inlineModalHeight, (newHeight) => {
  if (inlineModalEl.value) {
    inlineModalEl.value.style.top = `calc(50% - ${newHeight / 2}px)`;
  }
});

const stations: Ref<ApiStationResponse[] | null> =
  inject("activeStationsContext") || ref(null);

const recordingIds = ref(
  (() => {
    const ids = route.params.recordingIds;
    return (ids && (ids as string).split(",").map(Number)) || [];
  })()
);
const currentRecordingId = ref<number>(Number(route.params.currentRecordingId));
const _currentStationId = ref<StationId | null>(null);
const currentTrack = ref<ApiTrackResponse | undefined>(undefined);
const userSelectedTrack = ref<ApiTrackResponse | undefined>(undefined);
const currentStations = ref<ApiStationResponse[] | null>(stations.value);
const visitLabel = ref<string>(route.params.visitLabel as string);

watch(
  () => route.params.currentRecordingId,
  (nextRecordingId) => {
    currentRecordingId.value = Number(nextRecordingId);
    loadRecording();
  }
);

watch(
  () => route.params.trackId,
  (nextTrackId) => {
    currentTrack.value = recording.value?.tracks.find(
      ({ id }) => id == Number(nextTrackId)
    );
  }
);

watch(stations, (nextStations) => {
  if (nextStations) {
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
    gotoRecording(nextRecordingId);
  }
};

const gotoNextVisit = () => {
  if (nextVisit.value) {
    selectedVisit.value = nextVisit.value;
    gotoVisit(selectedVisit.value, true);
  }
};

const gotoPreviousRecordingOrVisit = () => {
  if (hasPreviousRecording.value) {
    gotoPreviousRecording();
  } else {
    gotoPreviousVisit();
  }
};

const gotoRecording = (recordingId: RecordingId) => {
  const params = {
    ...route.params,
    recordingIds: recordingIds.value.join(","),
    visitLabel: visitLabel.value,
    currentRecordingId: recordingId,
  };
  delete (params as RouteParamsRaw).trackId;
  delete (params as RouteParamsRaw).detail;
  router.push({
    name: route.name as string,
    params,
  });
};

const gotoVisit = (visit: ApiVisitResponse, startOfVisit: boolean) => {
  let currentRecordingId;
  if (!startOfVisit) {
    currentRecordingId = visit.recordings[visit.recordings.length - 1].recId;
  } else {
    currentRecordingId = visit.recordings[0].recId;
  }
  const recordingIds = visit.recordings.map(({ recId }) => recId).join(",");
  const params = {
    ...route.params,
    visitLabel: visit.classification,
    recordingIds,
    currentRecordingId,
  };
  delete (params as RouteParamsRaw).trackId;
  delete (params as RouteParamsRaw).detail;
  router.push({
    name: route.name as string,
    params,
  });
};

const gotoPreviousRecording = () => {
  if (hasPreviousRecording.value) {
    const previousRecordingId =
      recordingIds.value[previousRecordingIndex.value as number];
    gotoRecording(previousRecordingId);
  }
};

const gotoPreviousVisit = () => {
  if (previousVisit.value) {
    selectedVisit.value = previousVisit.value;
    gotoVisit(selectedVisit.value, false);
  }
};

// TODO - Handle previous visits

const recalculateCurrentVisit = async (
  track: ApiTrackResponse,
  addedTag?: ApiHumanTrackTagResponse,
  removedTag?: string
) => {
  if (recording.value) {
    // When a tag for the current visit changes, we need to recalculate visits.  Should we tell the parent to do this,
    // or just do it ourselves and get out of sync with the parent?  I'm leaning towards telling the parent.
    const recordingId = recording.value.id;
    // Find the visit:
    const targetVisit = visitsContext.value.find((visit) =>
      visit.recordings.find(({ recId }) => recId === recordingId)
    );
    if (targetVisit) {
      const targetVisitRecording = targetVisit.recordings.find(
        ({ recId }) => recId === recordingId
      ) as { recId: number; start: string; tracks: VisitRecordingTag[] };
      const targetTrack = targetVisitRecording.tracks.find(
        ({ id }) => id === track.id
      );
      if (targetTrack) {
        if (removedTag) {
          // If we removed the last human tag from the visit, then the visit classification will fall back to the best
          // AI tag.
          targetTrack.isAITagged = true;
          targetTrack.tag = null;
          // If there are still user tags, then the visit classification becomes the next user tag.
        } else if (addedTag) {
          targetTrack.isAITagged = false;
          targetTrack.tag = addedTag.what;
        }

        // Now, recalculate the visit:
        // If there are any human tags, pick the most numerous one as the classification.
        const humanTags: Record<string, number> = {};
        for (const recording of targetVisit.recordings) {
          for (const track of recording.tracks) {
            if (!track.isAITagged) {
              humanTags[track.tag as string] =
                humanTags[track.tag as string] || 0;
              humanTags[track.tag as string] += 1;
            }
          }
        }
        const humanTagCounts = Object.entries(humanTags);
        if (humanTagCounts.length) {
          let bestHumanTagCount = 0;
          let bestHumanTag;
          for (const [tag, count] of humanTagCounts) {
            if (count > bestHumanTagCount) {
              bestHumanTagCount = count;
              bestHumanTag = tag;
            }
          }
          targetVisit.classification = bestHumanTag;
          targetVisit.classFromUserTag = true;
        } else {
          // If there are no human tags, pick the most pre-calculated AI one.
          targetVisit.classification = targetVisit.classificationAi;
          targetVisit.classFromUserTag = false;
        }
        const params = {
          ...route.params,
          visitLabel: targetVisit.classification,
        };
        await router.replace({
          name: route.name as string,
          params,
        });
        console.warn(
          "recalculate visit",
          targetVisit,
          track,
          addedTag,
          removedTag
        );
      } else {
        console.warn("failed to find target track in visit");
      }
    } else {
      console.warn("failed to find visit context to update");
    }
  }
};

const trackTagChanged = async ({
  track,
  tag,
  action,
}: {
  track: ApiTrackResponse;
  tag: string;
  action: "add" | "remove";
}) => {
  if (recording.value) {
    const trackToPatch = recording.value.tracks.find(
      ({ id }) => id === track.id
    );
    if (trackToPatch) {
      trackToPatch.tags = [...track.tags];
      if (action === "add") {
        const changedTag = trackToPatch.tags.find(
          ({ what, userId }) => what === tag && userId === CurrentUser.value?.id
        );
        if (changedTag) {
          await recalculateCurrentVisit(
            track,
            changedTag as ApiHumanTrackTagResponse
          );
        } else {
          console.error("Failed to find changed tag", tag);
        }
      } else if (action === "remove") {
        await recalculateCurrentVisit(track, undefined, tag);
      }
    }
  }
};

const addedRecordingLabel = (label: ApiRecordingTagResponse) => {
  if (recording.value) {
    recording.value.tags.push(label);
  }
};

const removedRecordingLabel = (labelId: TagId) => {
  if (recording.value) {
    recording.value.tags = recording.value.tags.filter(
      (tag) => tag.id !== labelId
    );
  }
};

const locationContext: ComputedRef<LatLng> | undefined =
  inject("locationContext");

const isInGreaterVisitContext = computed<boolean>(() => {
  return !!selectedVisit.value;
});

const recording = ref<ApiRecordingResponse | null>(null);

const tracks = computed<ApiTrackResponse[]>(() => {
  if (recording.value) {
    return recording.value.tracks;
  }
  return [];
});

const tags = computed<ApiRecordingTagResponse[]>(() => {
  if (recording.value) {
    return recording.value.tags;
  }
  return [];
});

const loadRecording = async () => {
  recording.value = null;
  if (currentRecordingId.value) {
    // Load the current recording, and then preload the next and previous recordings.
    // This behaviour will differ depending on whether we're viewing raw recordings or visits.
    const recordingResponse = await getRecordingById(currentRecordingId.value);

    if (recordingResponse.success) {
      // NOTE: Only handling RAW recordings here, and assuming they always exist.
      recording.value = recordingResponse.result.recording;

      if (route.params.trackId) {
        currentTrack.value = recording.value?.tracks.find(
          ({ id }) => id == Number(route.params.trackId)
        );
      }

      if (
        !route.params.trackId ||
        (route.params.trackId && !currentTrack.value)
      ) {
        // set the default track if not set
        if (recording.value.tracks.length) {
          await selectedTrack(recording.value.tracks[0].id, true);
        }
      }
    } else {
      // TODO: Handle recording permissions error
    }
  }
};

const selectedTrack = async (trackId: TrackId, automatically: boolean) => {
  const params = {
    ...route.params,
    trackId,
  };

  if (!automatically) {
    // Make the player start playing at the beginning of the selected track,
    // and stop when it reaches the end of that track.
    userSelectedTrack.value = recording.value?.tracks.find(
      ({ id }) => id === trackId
    );
    await nextTick(() => {
      userSelectedTrack.value = undefined;
    });
  }
  // TODO: Should this automatically get removed if the selectedTrack has changed due to
  //  the recording playing onto a new track
  delete (params as Record<string, string | number>).detail;
  await router.replace({
    name: route.name as string,
    params,
  });
};
const selectedTrackWrapped = ({
  trackId,
  automatically,
}: {
  trackId: TrackId;
  automatically: boolean;
}) => selectedTrack(trackId, automatically);

onMounted(async () => {
  await loadRecording();
});

const visitDurationString = computed<string>(() => {
  if (selectedVisit.value && locationContext && locationContext.value) {
    const duration = visitDuration(selectedVisit.value, true);
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
  if (recording.value) {
    if (recording.value.location) {
      const zone = timezoneForLocation(recording.value.location);
      return DateTime.fromISO(recording.value.recordingDateTime, {
        zone,
      });
    }
    return DateTime.fromISO(recording.value.recordingDateTime);
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
  return recording.value?.stationName || "";
});

const currentDeviceName = computed<string>(() => {
  return recording.value?.deviceName || "";
});

const mapPointForRecording = computed<NamedPoint[]>(() => {
  if (recording.value?.location) {
    return [
      {
        name: currentStationName.value,
        location: recording.value?.location,
        group: recording.value?.groupName,
      },
    ] as NamedPoint[];
  }
  return [];
});

const navLinkClasses = ["nav-item", "nav-link", "border-0", "fs-7", "fw-bold"];
const activeTabName = computed(() => {
  return route.name;
});

const desktop = useMediaQuery("(min-width: 1040px)");
const isMobileView = computed<boolean>(() => {
  return !desktop.value;
});

const recordingViewContext = "dashboard-visit";

const recordingInfo = ref<HTMLDivElement>();
const playerContainer = ref<HTMLDivElement>();

const playerHeight = useElementSize(playerContainer);
watch(playerHeight.height, (newHeight) => {
  if (recordingInfo.value) {
    if (desktop.value) {
      recordingInfo.value.style.maxHeight = `${newHeight}px`;
    } else {
      recordingInfo.value.style.maxHeight = "auto";
    }
  }
});

const exportRequested = ref<boolean | "advanced">(false);
const requestedExport = () => {
  inlineModal.value = true;
  nextTick(() => {
    exportRequested.value = true;
  });
};

const showHeaderInfo = ref<boolean>(false);
const requestedHeaderInfoDisplay = () => {
  inlineModal.value = true;
  nextTick(() => {
    showHeaderInfo.value = true;
  });
};
const dismissHeaderInfo = () => {
  inlineModal.value = false;
  showHeaderInfo.value = false;
};

const exportCompleted = () => {
  inlineModal.value = false;
  exportRequested.value = false;
};

const requestedAdvancedExport = () => {
  inlineModal.value = true;
  nextTick(() => {
    exportRequested.value = "advanced";
  });
};

const requestedDownload = async () => {
  if (recording.value) {
    const request = {
      mode: "cors",
      cache: "no-cache",
      headers: {
        Authorization: CurrentUserCreds.value?.apiToken,
      },
      method: "get",
    };

    const download = (url: string, filename: string) => {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename || "download";
      anchor.click();
    };
    const recordingId = recording.value.id;
    const cptvFileResponse = await window.fetch(
      `${API_ROOT}/api/v1/recordings/raw/${recordingId}`,
      request as RequestInit
    );
    const cptvUintArray = await cptvFileResponse.blob();
    download(
      URL.createObjectURL(
        new Blob([cptvUintArray], { type: "application/octet-stream" })
      ),
      `recording_${recordingId}${new Date(
        recording.value.recordingDateTime
      ).toLocaleString()}.cptv`
    );
  }
};

const deleteRecording = async () => {
  if (recording.value) {
    // TODO:
    // this.$emit("recording-updated", { id: recordingId, action: "deleted" });
    //const deleteResponse = await apiDeleteRecording(recording.value.id);

    // TODO: Change the current context to remove the recording, recalc visit etc.

    if (
      hasNextRecording.value ||
      hasNextVisit.value ||
      hasPreviousRecording.value ||
      hasPreviousVisit.value
    ) {
      if (hasNextRecording.value || hasNextVisit.value) {
        await gotoNextRecordingOrVisit();
      } else {
        await gotoPreviousRecordingOrVisit();
      }
    }
    console.log("Delete recording");
  }
};

const inlineModal = ref<boolean>(false);

// TODO: When we scroll down, can we keep the player at the top of the screen for a while, but reduce the height of it?
</script>
<template>
  <div
    class="recording-view d-flex flex-column"
    :class="{ dimmed: inlineModal }"
  >
    <header
      class="recording-view-header d-flex justify-content-between px-sm-3 px-2 py-sm-1"
    >
      <div v-if="isInVisitContext">
        <span class="recording-header-type text-uppercase fw-bold">Visit</span>
        <div class="recording-header-details mb-1 mb-sm-0">
          <span class="recording-header-label fw-bold text-capitalize">{{
            displayLabelForClassificationLabel(visitLabel)
          }}</span>
          <span
            v-if="isInGreaterVisitContext"
            v-html="visitDurationString"
            class="ms-sm-3 ms-2 recording-header-time"
            style="color: #444"
          />
        </div>
      </div>
      <button
        type="button"
        class="btn"
        @click.stop.prevent="() => emit('close')"
      >
        <font-awesome-icon icon="xmark" />
      </button>
    </header>
    <div class="player-overflow flex-grow-1">
      <div class="player-and-tagging d-flex">
        <div class="player-container" ref="playerContainer">
          <cptv-player
            :recording="recording"
            :recording-id="currentRecordingId"
            :current-track="currentTrack"
            :has-next="hasNextRecording || hasNextVisit"
            :has-prev="hasPreviousRecording || hasPreviousVisit"
            :user-selected-track="userSelectedTrack"
            :export-requested="exportRequested"
            :display-header-info="showHeaderInfo"
            @export-completed="exportCompleted"
            @request-next-recording="gotoNextRecordingOrVisit"
            @request-prev-recording="gotoPreviousRecordingOrVisit"
            @request-header-info-display="requestedHeaderInfoDisplay"
            @dismiss-header-info="dismissHeaderInfo"
            @track-selected="
              ({ trackId, automatically }) =>
                selectedTrack(trackId, automatically)
            "
          />
        </div>
        <div
          class="recording-info d-flex flex-column flex-fill overflow-hidden"
          ref="recordingInfo"
        >
          <!-- Desktop view only -->
          <div class="recording-station-info d-flex mb-3" v-if="!isMobileView">
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
            <div class="flex-fill overflow-hidden">
              <div class="fw-bolder d-flex">
                <div class="station-name pt-3 px-3 text-truncate">
                  <font-awesome-icon
                    icon="map-marker-alt"
                    size="xs"
                    class="me-2"
                    color="rgba(0, 0, 0, 0.7)"
                  />
                  <span class="text-truncate">
                    {{ currentStationName }}
                  </span>
                </div>
                <div class="device-name pt-3 pe-2 text-truncate">
                  <font-awesome-icon
                    icon="microchip"
                    size="xs"
                    class="me-2"
                    color="rgba(0, 0, 0, 0.7)"
                  />
                  <span class="text-truncate">
                    {{ currentDeviceName }}
                  </span>
                </div>
              </div>
              <div class="recording-date-time fs-7 d-flex px-3 mt-1">
                <div>
                  <font-awesome-icon
                    :icon="['far', 'calendar']"
                    size="sm"
                    class="me-1"
                    color="rgba(0, 0, 0, 0.5)"
                  />
                  <span v-html="recordingDate" />
                </div>
                <div class="ms-4">
                  <font-awesome-icon
                    :icon="['far', 'clock']"
                    size="sm"
                    class="me-1"
                    color="rgba(0, 0, 0, 0.5)"
                  />
                  <span v-html="recordingStartTime" />
                </div>
              </div>
              <recording-view-action-buttons
                :recording="recording"
                @added-recording-label="addedRecordingLabel"
                @removed-recording-label="removedRecordingLabel"
                @requested-export="requestedExport"
                @requested-advanced-export="requestedAdvancedExport"
                @requested-download="requestedDownload"
                @delete-recording="deleteRecording"
              />
            </div>
          </div>
          <ul
            class="nav nav-tabs justify-content-md-center justify-content-evenly"
            v-if="!isMobileView"
          >
            <router-link
              :class="[
                ...navLinkClasses,
                { active: activeTabName === `${recordingViewContext}-tracks` },
              ]"
              title="Tracks"
              :to="{
                name: `${recordingViewContext}-tracks`,
                params: {
                  ...route.params,
                  trackId: currentTrack?.id || tracks[0]?.id,
                },
              }"
              >Tracks
              <span v-if="activeTabName !== `${recordingViewContext}-tracks`"
                >({{ tracks.length }})</span
              ></router-link
            >
            <router-link
              :class="[
                ...navLinkClasses,
                { active: activeTabName === `${recordingViewContext}-labels` },
              ]"
              title="Labels"
              :to="{
                name: `${recordingViewContext}-labels`,
                params: {
                  ...route.params,
                  trackId: currentTrack?.id || tracks[0]?.id,
                },
              }"
              >Labels
              <span v-if="activeTabName !== `${recordingViewContext}-labels`"
                >({{ tags.length }})</span
              ></router-link
            >
          </ul>
          <div class="tags-overflow" v-if="!isMobileView">
            <router-view
              :recording="recording"
              @track-tag-changed="trackTagChanged"
              @track-selected="selectedTrackWrapped"
              @added-recording-label="addedRecordingLabel"
              @removed-recording-label="removedRecordingLabel"
            />
          </div>
          <!-- Mobile view only -->
          <recording-view-tracks
            v-if="isMobileView"
            :recording="recording"
            class="recording-tracks"
            @track-tag-changed="trackTagChanged"
            @track-selected="
              ({ trackId, automatically }) =>
                selectedTrack(trackId, automatically)
            "
          />
          <div
            class="recording-info-mobile p-3 flex-grow-1"
            v-if="isMobileView"
          >
            <div
              class="recording-station-info bg-white d-flex mb-3 flex-column-reverse mt-3"
            >
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
              <div
                class="flex-fill d-flex align-items-sm-center p-2 px-3 flex-column flex-sm-row"
              >
                <div class="fw-bolder d-flex">
                  <div class="station-name pe-3 text-truncate">
                    <font-awesome-icon
                      icon="map-marker-alt"
                      size="xs"
                      class="me-2"
                      color="rgba(0, 0, 0, 0.7)"
                    />
                    <span class="text-truncate">
                      {{ currentStationName }}
                    </span>
                  </div>
                  <div class="device-name pe-2 text-truncate">
                    <font-awesome-icon
                      icon="microchip"
                      size="xs"
                      class="me-2"
                      color="rgba(0, 0, 0, 0.7)"
                    />
                    <span class="text-truncate">
                      {{ currentDeviceName }}
                    </span>
                  </div>
                </div>

                <div class="recording-date-time fs-7 d-flex px-sm-3 ps-0 mt-1">
                  <div>
                    <font-awesome-icon
                      :icon="['far', 'calendar']"
                      size="sm"
                      class="me-1"
                      color="rgba(0, 0, 0, 0.5)"
                    />
                    <span v-html="recordingDate" />
                  </div>
                  <div class="ms-4">
                    <font-awesome-icon
                      :icon="['far', 'clock']"
                      size="sm"
                      class="me-1"
                      color="rgba(0, 0, 0, 0.5)"
                    />
                    <span v-html="recordingStartTime" />
                  </div>
                </div>
              </div>
            </div>
            <recording-view-labels
              :recording="recording"
              @added-recording-label="addedRecordingLabel"
              @removed-recording-label="removedRecordingLabel"
              v-if="isMobileView"
            />
          </div>
        </div>
      </div>
    </div>
    <footer class="recording-view-footer">
      <div class="visit-progress">
        <div
          class="progress-bar"
          v-if="currentRecordingIndex"
          :style="{
            width: `${
              ((currentRecordingIndex + 1) / recordingIds.length) * 100
            }%`,
          }"
        ></div>
      </div>
      <nav class="d-flex py-1 footer-nav flex-fill">
        <button
          type="button"
          class="btn d-flex flex-row-reverse align-items-center prev-button"
          :disabled="!hasPreviousRecording && !hasPreviousVisit"
          @click.stop.prevent="gotoPreviousRecordingOrVisit"
        >
          <span class="d-none d-sm-flex ps-2 flex-column align-items-start">
            <span class="fs-8 fw-bold" v-if="hasPreviousRecording"
              >Previous recording</span
            >
            <span class="fs-8 fw-bold" v-else-if="hasPreviousVisit"
              >Previous visit</span
            >
            <span class="fs-8" v-else v-html="'&nbsp;'"></span>
            <span class="fs-9" v-if="previousRecordingIndex !== null"
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
        <recording-view-action-buttons
          class="action-buttons"
          v-if="isMobileView"
          :recording="recording"
          @added-recording-label="addedRecordingLabel"
          @removed-recording-label="removedRecordingLabel"
          @requested-export="requestedExport"
          @requested-advanced-export="requestedAdvancedExport"
          @requested-download="requestedDownload"
          @delete-recording="deleteRecording"
        />
        <button
          type="button"
          class="btn d-flex align-items-center next-button"
          :disabled="!hasNextRecording && !hasNextVisit"
          @click.stop.prevent="gotoNextRecordingOrVisit"
        >
          <span class="d-none d-sm-flex pe-2 flex-column align-items-end">
            <span class="fs-8 fw-bold" v-if="hasNextRecording"
              >Next recording</span
            >
            <span class="fs-8 fw-bold" v-else-if="hasNextVisit"
              >Next visit</span
            >
            <span class="fs-8" v-else v-html="'&nbsp;'"></span>
            <span class="fs-9" v-if="nextRecordingIndex !== null"
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
  <div
    v-if="inlineModal"
    class="inline-modal"
    id="recording-status-modal"
    ref="inlineModalEl"
  />
</template>

<style scoped lang="less">
@import "../assets/font-sizes.less";
@import "../assets/mixins.less";

// TODO: When there is overflow, show shadows at top/bottom
.player-overflow {
  @media screen and (max-width: 1040px) {
    overflow-y: auto;
  }
  background: #f6f6f6;
}
.tags-overflow {
  @media screen and (min-width: 1041px) {
    overflow-y: scroll;
    height: 100%;
  }
}
.footer-nav {
  flex-direction: row;
  justify-content: center;
  position: relative;

  @media screen and (min-width: 576px) {
    min-height: 55px;
  }
  min-height: 48px;
}
.prev-button {
  position: absolute;
  left: 0;
}
.next-button {
  position: absolute;
  right: 0;
}

.recording-tracks {
  box-shadow: 0 0 6px rgba(0, 0, 0, 0.4);
  z-index: 1;
}

.recording-view-header {
  border-bottom: 2px solid #e1e1e1;
  .recording-header-type {
    .fs-8();
  }
  .recording-header-details {
    line-height: 1;
  }
  .recording-header-label {
    .fs-6();
  }
  .recording-header-time {
    .fs-8();
  }
  @media screen and (min-width: 576px) {
    .recording-header-type {
      .fs-8();
    }
    .recording-header-details {
      line-height: unset;
    }
    .recording-header-label {
      .fs-5();
    }
    .recording-header-time {
      .fs-7();
    }
  }
}
.recording-view-footer {
  background: white;
  .visit-progress {
    height: 2px;
    background: #e1e1e1;
    .progress-bar {
      // TODO - make the progress bar proportional to the offset of the recording within the visit timeline.
      // When the video is playing, we could even update it for the duration of the video?
      height: 100%;
      background: #6dbd4b;
    }
  }
}
.recording-info {
}
.recording-info-mobile {
}
.recording-station-info {
  .standard-shadow();
}

.recording-location-map {
  @media screen and (max-width: 1040px) {
    width: 100%;
    height: 180px;
  }
  width: 120px;
  height: 120px;
  min-width: 120px;
}
.nav-item.active {
  background: unset;
  border-bottom: 3px solid #6dbd4b !important;
}
.station-name,
.recording-date-time {
  color: #444;
}
.device-name,
.station-name {
  max-width: 100%;
}

.nav-tabs {
  .nav-link:not(.active) {
    color: inherit;
  }
  .active {
    cursor: default;
  }
}
.player-and-tagging {
  flex-direction: row;
  @media screen and (max-width: 1040px) {
    flex-direction: column;
  }
}
.recording-view {
  @media screen and (max-width: 1040px) {
    background: white;
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    .recording-view-footer {
      //position: absolute;
      //bottom: 0;
      //left: 0;
      //right: 0;
    }
  }
}

.dimmed {
  user-select: none;
  position: relative;

  &::after {
    content: "";
    display: block;
    background: rgba(0, 0, 0, 0.2);
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    right: 0;
    z-index: 400;
  }
}
.inline-modal {
  // TODO - Max width for mobile breakpoints
  @width: 400px;
  @height: auto;
  width: @width;
  height: @height;
  position: absolute;
  border-radius: 2px;
  top: 40%;
  left: calc(50% - (@width / 2));
  background: white;
  z-index: 401;
  .standard-shadow();
}
</style>
