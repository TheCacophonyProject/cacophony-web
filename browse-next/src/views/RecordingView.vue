<script setup lang="ts">
import type { RouteParams } from "vue-router";
import { useRoute } from "vue-router";
import {
  computed,
  type ComputedRef,
  inject,
  nextTick,
  onMounted,
  type Ref,
  ref,
  watch,
} from "vue";
import type {
  DeviceId,
  LatLng,
  RecordingId,
  StationId as LocationId,
  TagId,
  TrackId,
} from "@typedefs/api/common";
import {
  formatDuration,
  timeAtLocation,
  timezoneForLatLng,
  visitDuration,
} from "@models/visitsUtils";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import router from "@/router";
import {
  deleteRecording as apiDeleteRecording,
  getRecordingById,
} from "@api/Recording";
import type {
  ApiVisitResponse,
  VisitRecordingTag,
} from "@typedefs/api/monitoring";
import MapWithPoints from "@/components/MapWithPoints.vue";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import { DateTime } from "luxon";
import type { NamedPoint } from "@models/mapUtils";
import CptvPlayer from "@/components/cptv-player/CptvPlayer.vue";
import type { ApiTrackResponse } from "@typedefs/api/track";
import type { ApiRecordingTagResponse } from "@typedefs/api/tag";
import { useElementSize, useMediaQuery } from "@vueuse/core";
import RecordingViewActionButtons from "@/components/RecordingViewActionButtons.vue";
import { displayLabelForClassificationLabel } from "@api/Classifications";
import type { LoggedInUser, LoggedInUserAuth } from "@models/LoggedInUser";
import type { ApiHumanTrackTagResponse } from "@typedefs/api/trackTag";
import { API_ROOT } from "@api/root";
import {
  activeLocations,
  currentUser as currentUserInfo,
  currentUserCreds as currentUserCredentials,
  latLngForActiveLocations,
} from "@models/provides";
import type { LoadedResource } from "@api/types";
import {
  RecordingProcessingState,
  RecordingType,
} from "@typedefs/api/consts.ts";
import { hasReferenceImageForDeviceAtTime } from "@api/Device.ts";
import sunCalc from "suncalc";
import { urlNormaliseName } from "@/utils.ts";
import SpectrogramViewer from "@/components/SpectrogramViewer.vue";
import RecordingViewNotes from "@/components/RecordingViewNotes.vue";
import RecordingViewLabels from "@/components/RecordingViewLabels.vue";
import RecordingViewTracks from "@/components/RecordingViewTracks.vue";
import { maybeRefreshStaleCredentials } from "@api/fetch.ts";

const selectedVisit = inject(
  "currentlySelectedVisit",
) as Ref<ApiVisitResponse | null>;
const currentUser = inject(currentUserInfo) as Ref<LoggedInUser | null>;
const visitsContext = inject("visitsContext") as Ref<ApiVisitResponse[] | null>;
const currentUserCreds = inject(
  currentUserCredentials,
) as Ref<LoggedInUserAuth | null>;

const route = useRoute();
const emit = defineEmits<{
  (e: "close"): void;
  (e: "start-blocking-work"): void;
  (e: "end-blocking-work"): void;
  (e: "loaded-recording", type: RecordingType): void;
  (e: "recording-updated", recordingId: RecordingId, action: string): void;
}>();
const inlineModalEl = ref<HTMLDivElement>();

const { height: inlineModalHeight } = useElementSize(inlineModalEl);
watch(inlineModalHeight, (newHeight) => {
  if (inlineModalEl.value) {
    (inlineModalEl.value as HTMLDivElement).style.top = `calc(50% - ${
      newHeight / 2
    }px)`;
  }
});

const locations: Ref<ApiLocationResponse[] | null> =
  inject(activeLocations) || ref(null);

const loadedRecordingIds = inject(
  "loadedRecordingIds",
  computed(() => []),
) as ComputedRef<RecordingId[]>;
const loadedRecordings = inject("loadedRecordings") as Ref<
  ApiRecordingResponse[]
>;
const canLoadMoreRecordingsInPast = inject(
  "canLoadMoreRecordingsInPast",
  ref(false),
) as ComputedRef<boolean>;
const requestLoadMoreRecordingsInPast = inject(
  "requestLoadMoreRecordingsInPast",
  () => {
    //
  },
) as () => Promise<void>;
const currentRecordingCount = inject(
  "currentRecordingCount",
  ref(0),
) as ComputedRef<number>;
const canExpandCurrentQueryIntoPast = inject(
  "canExpandCurrentQueryInPast",
  computed(() => false),
) as ComputedRef<boolean>;
const updatedRecording = inject(
  "updatedRecording",
  (recording: ApiRecordingResponse, recordingWasDeleted = false) => {
    //
  },
) as (recording: ApiRecordingResponse, recordingWasDeleted?: boolean) => void;

const recordingIds = ref(
  (() => {
    const ids = route.params.recordingIds;
    return (ids && (ids as string).split(",").map(Number)) || [];
  })(),
);

const allRecordingIds = computed<RecordingId[]>(() => {
  return recordingIds.value.length
    ? recordingIds.value
    : loadedRecordingIds.value;
});

const currentRecordingId = ref<number>(Number(route.params.currentRecordingId));
const _currentLocationId = ref<LocationId | null>(null);
const currentTrack = ref<ApiTrackResponse | undefined>(undefined);
const userSelectedTrack = ref<ApiTrackResponse | undefined>(undefined);
const currentLocations = ref<ApiLocationResponse[] | null>(locations.value);
const visitLabel = ref<string>((route.params.visitLabel as string) || "");

const deviceNameSpan = ref<HTMLSpanElement>();
const stationNameSpan = ref<HTMLSpanElement>();
const stationNameIsTruncated = ref<boolean>(false);
const deviceNameIsTruncated = ref<boolean>(false);

const recordingIsProcessing = computed<boolean>(() => {
  if (recording.value) {
    return ![
      RecordingProcessingState.ReTrackFailed,
      RecordingProcessingState.TrackingFailed,
      RecordingProcessingState.AnalyseThermalFailed,
      RecordingProcessingState.FinishedFailed,
      RecordingProcessingState.AnalyseFailed,
      RecordingProcessingState.ReprocessFailed,
      RecordingProcessingState.Finished,
    ].includes(recording.value.processingState);
  }
  return false;
});

watch(
  () => route.params.currentRecordingId,
  (nextRecordingId, prev) => {
    currentRecordingId.value = Number(nextRecordingId);
    loadRecording();
  },
);

watch(
  () => route.params.trackId,
  (nextTrackId, prevTrackId) => {
    if (recording.value) {
      currentTrack.value = (
        recording.value as ApiRecordingResponse
      ).tracks.find(({ id }) => id == Number(nextTrackId));
    }
  },
);

watch(locations, (nextStations) => {
  if (nextStations) {
    currentLocations.value = nextStations;
  }
});

watch(
  () => route.params.visitLabel,
  (nextVisitLabel) => {
    visitLabel.value = nextVisitLabel as string;
  },
);

watch(
  () => route.params.recordingIds,
  (nextRecordingIds) => {
    if (nextRecordingIds) {
      recordingIds.value = (nextRecordingIds as string).split(",").map(Number);
    } else {
      recordingIds.value = [];
    }
  },
);

const nextVisit = computed<ApiVisitResponse | null>(() => {
  return (
    (currentVisitIndex.value !== null &&
      visitsContext.value &&
      currentVisitIndex.value !== 0 &&
      (visitsContext.value as ApiVisitResponse[])[
        currentVisitIndex.value - 1
      ]) ||
    null
  );
});

const previousVisit = computed<ApiVisitResponse | null>(() => {
  return (
    (currentVisitIndex.value !== null &&
      visitsContext.value &&
      (currentVisitIndex.value as number) <
        (visitsContext.value as ApiVisitResponse[]).length &&
      (visitsContext.value as ApiVisitResponse[])[
        currentVisitIndex.value + 1
      ]) ||
    null
  );
});

const previousRecordingId = computed<RecordingId | null>(() => {
  if (previousRecordingIndex.value !== null) {
    return allRecordingIds.value[previousRecordingIndex.value];
  }
  return null;
});

const nextRecordingId = computed<RecordingId | null>(() => {
  if (nextRecordingIndex.value !== null) {
    return allRecordingIds.value[nextRecordingIndex.value];
  }
  return null;
});

const currentRecordingIndex = computed<number | null>(() => {
  const index = allRecordingIds.value.indexOf(currentRecordingId.value);
  if (index === -1) {
    return null;
  }
  return index;
});

const nextRecordingIndex = computed<number | null>(() => {
  if (recordingViewContext === "activity-recording") {
    if (currentRecordingIndex.value !== null) {
      if (currentRecordingIndex.value - 1 < 0) {
        return null;
      }
      return currentRecordingIndex.value - 1;
    }
  } else {
    const total = recordingIds.value.length;
    if (currentRecordingIndex.value !== null) {
      if (currentRecordingIndex.value + 1 >= total) {
        return null;
      }
      return currentRecordingIndex.value + 1;
    }
  }
  return null;
});

const previousRecordingIndex = computed<number | null>(() => {
  if (recordingViewContext === "activity-recording") {
    const total = loadedRecordingIds.value.length;
    if (currentRecordingIndex.value !== null) {
      if (currentRecordingIndex.value + 1 >= total) {
        return null;
      }
      return currentRecordingIndex.value + 1;
    }
  } else {
    if (currentRecordingIndex.value !== null) {
      if (currentRecordingIndex.value - 1 < 0) {
        return null;
      }
      return currentRecordingIndex.value - 1;
    }
  }
  return null;
});

const isInVisitContext = computed<boolean>(() => {
  return !!visitLabel.value;
});

const currentVisitIndex = computed<number | null>(() => {
  if (visitsContext.value && selectedVisit.value) {
    const currentVisitIndex = (
      visitsContext.value as ApiVisitResponse[]
    ).indexOf(selectedVisit.value as ApiVisitResponse);
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

const gotoNextRecordingOrVisit = async () => {
  if (hasNextRecording.value) {
    return gotoNextRecording();
  } else if (isInVisitContext.value) {
    return gotoNextVisit();
  }
};

const gotoNextRecording = async () => {
  if (nextRecordingId.value) {
    return gotoRecording(nextRecordingId.value as RecordingId);
  }
};

const gotoNextVisit = async () => {
  if (nextVisit.value) {
    selectedVisit.value = nextVisit.value;
    return gotoVisit(selectedVisit.value as ApiVisitResponse, true);
  }
};

const gotoPreviousRecordingOrVisit = async () => {
  if (hasPreviousRecording.value) {
    return gotoPreviousRecording();
  } else if (isInVisitContext.value) {
    return gotoPreviousVisit();
  }
};

const gotoRecording = async (recordingId: RecordingId) => {
  console.log("gotoRecording", recordingId);
  const params: RouteParams = {
    ...route.params,
    currentRecordingId: recordingId.toString(),
  };
  if (recordingIds.value.length) {
    params.recordingIds = recordingIds.value.join(",");
  }
  if (visitLabel.value) {
    params.visitLabel = visitLabel.value;
  }
  delete params.trackId;
  delete params.detail;
  return router.push({
    name: route.name as string,
    params,
    query: route.query,
  });
};

const gotoVisit = async (visit: ApiVisitResponse, startOfVisit: boolean) => {
  let recId;
  if (!startOfVisit) {
    recId = visit.recordings[visit.recordings.length - 1].recId;
  } else {
    recId = visit.recordings[0].recId;
  }
  const recordingIds = visit.recordings.map(({ recId }) => recId).join(",");
  const params: RouteParams = {
    ...route.params,
    currentRecordingId: recId.toString(),
    recordingIds,
  };
  if (visit.classification) {
    params.visitLabel = visit.classification;
  }
  delete params.trackId;
  delete params.detail;
  return router.push({
    name: route.name as string,
    params,
    query: route.query,
  });
};

const gotoPreviousRecording = async () => {
  if (previousRecordingId.value) {
    if (
      previousRecordingIndex.value === allRecordingIds.value.length - 5 &&
      canLoadMoreRecordingsInPast.value
    ) {
      await requestLoadMoreRecordingsInPast();
    }
    return gotoRecording(previousRecordingId.value as RecordingId);
  }
};

const gotoPreviousVisit = async () => {
  if (previousVisit.value) {
    selectedVisit.value = previousVisit.value;
    return gotoVisit(selectedVisit.value as ApiVisitResponse, false);
  }
};

const visitForRecording = computed<string>(() => {
  if (recording.value) {
    const humanTags: Record<string, number> = {};
    const aiTags: Record<string, number> = {};
    for (const track of (recording.value as ApiRecordingResponse).tracks) {
      for (const tag of track.tags) {
        if (!tag.automatic) {
          humanTags[tag.what] = humanTags[tag.what] || 0;
          humanTags[tag.what] += 1;
        } else {
          aiTags[tag.what] = aiTags[tag.what] || 0;
          aiTags[tag.what] += 1;
        }
      }
    }

    const humanTagCounts = Object.entries(humanTags);
    if (humanTagCounts.length) {
      let bestHumanTagCount = 0;
      let bestHumanTag;
      // If there's anything human tagged that's not false-positive or unidentified, use that first.
      for (const [tag, count] of humanTagCounts.filter(
        ([tag, _]) => !["false-positive", "unidentified"].includes(tag),
      )) {
        if (count > bestHumanTagCount) {
          bestHumanTagCount = count;
          bestHumanTag = tag;
        }
      }
      if (!bestHumanTag) {
        for (const [tag, count] of humanTagCounts) {
          if (count > bestHumanTagCount) {
            bestHumanTagCount = count;
            bestHumanTag = tag;
          }
        }
      }
      return (
        (bestHumanTag &&
          displayLabelForClassificationLabel(bestHumanTag, false)) ||
        ""
      );
    } else {
      const aiTagCounts = Object.entries(aiTags);
      if (aiTagCounts.length) {
        let bestAiTagCount = 0;
        let bestAiTag;

        // TODO: If the counts are the same, prefer non-other based tags.

        for (const [tag, count] of aiTagCounts) {
          if (count > bestAiTagCount) {
            bestAiTagCount = count;
            bestAiTag = tag;
          }
        }
        return (
          (bestAiTag && displayLabelForClassificationLabel(bestAiTag, true)) ||
          ""
        );
      }
    }
    return "None";
  }
  return "";
});

const negativeThingTags = [
  "part",
  "poor tracking",
  "unidentified",
  "unknown",
  "false-positive",
];

// TODO - Handle previous visits
const recalculateCurrentVisit = async (
  track: ApiTrackResponse,
  addedTag?: ApiHumanTrackTagResponse,
  removedTag?: string,
) => {
  if (recording.value && isInVisitContext.value) {
    // When a tag for the current visit changes, we need to recalculate visits.  Should we tell the parent to do this,
    // or just do it ourselves and get out of sync with the parent?  I'm leaning towards telling the parent.
    const recordingId = (recording.value as ApiRecordingResponse).id;
    // Find the visit:
    const targetVisit =
      visitsContext.value &&
      (visitsContext.value as ApiVisitResponse[]).find((visit) =>
        visit.recordings.find(({ recId }) => recId === recordingId),
      );
    if (targetVisit) {
      const targetVisitRecording = targetVisit.recordings.find(
        ({ recId }) => recId === recordingId,
      ) as { recId: number; start: string; tracks: VisitRecordingTag[] };
      const targetTrack = targetVisitRecording.tracks.find(
        ({ id }) => id === track.id,
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
        await mutateCurrentVisit(targetVisit);
      } else {
        console.warn("failed to find target track in visit");
      }
    } else {
      console.warn("failed to find visit context to update");
    }
  }
};

const mutateCurrentVisit = async (targetVisit: ApiVisitResponse) => {
  // Now, recalculate the visit:
  // If there are any human tags, pick the most numerous one as the classification,
  // Unless it is a false-positive or similar, but only if there is another animal tag
  const humanTags: Record<string, number> = {};
  for (const recording of targetVisit.recordings) {
    for (const track of recording.tracks) {
      if (!track.isAITagged && track.tag !== null) {
        humanTags[track.tag as string] = humanTags[track.tag as string] || 0;
        humanTags[track.tag as string] += 1;
      }
    }
  }

  const hasNonFalsePositiveTag =
    Object.keys(humanTags).filter((tag) => !negativeThingTags.includes(tag))
      .length !== 0;
  const humanTagCounts = Object.entries(humanTags);
  if (humanTagCounts.length) {
    let bestHumanTagCount = 0;
    let bestHumanTag;
    for (const [tag, count] of humanTagCounts) {
      if (
        (hasNonFalsePositiveTag && !negativeThingTags.includes(tag)) ||
        !hasNonFalsePositiveTag
      ) {
        if (count > bestHumanTagCount) {
          bestHumanTagCount = count;
          bestHumanTag = tag;
        }
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
    query: route.query,
  });
};

const trackRemoved = ({ trackId }: { trackId: TrackId }) => {
  if (recording.value) {
    const index = recording.value.tracks.findIndex(({ id }) => id === trackId);
    recording.value.tracks.splice(index, 1);
    if (currentTrack.value && currentTrack.value.id === trackId) {
      currentTrack.value = undefined;
      deselectedTrack();
    }
  }
};

const trackTagChanged = async ({
  track,
  tag,
  newId,
  action,
}: {
  track: ApiTrackResponse;
  tag: string;
  newId?: TrackId;
  action: "add" | "remove";
}) => {
  if (recording.value) {
    let trackToPatch = (recording.value as ApiRecordingResponse).tracks.find(
      ({ id }) => id === track.id,
    );
    if (
      !trackToPatch &&
      ((recording.value as ApiRecordingResponse).tracks.length === 0 ||
        recordingType.value === RecordingType.Audio)
    ) {
      // This track was probably just created, so add it.
      (recording.value as ApiRecordingResponse).tracks.push(track);
      trackToPatch = track;
    }
    if (trackToPatch) {
      if (newId) {
        trackToPatch.id = newId;
      }
      trackToPatch.tags = [...track.tags];
      if (action === "add") {
        const changedTag = trackToPatch.tags.find(
          ({ what, userId }) => what === tag && userId === currentUser.value?.id,
        );
        if (changedTag) {
          await recalculateCurrentVisit(
            track,
            changedTag as ApiHumanTrackTagResponse,
          );
        } else {
          console.error("Failed to find changed tag", tag);
        }
        if (trackToPatch.id === -1) {
          await selectedTrack(-1, true);
        }
      } else if (action === "remove") {
        await recalculateCurrentVisit(track, undefined, tag);
      }
      if (!isInVisitContext.value) {
        updatedRecording(recording.value as ApiRecordingResponse);
      }
    }
  }
};

const addedRecordingLabel = (label: ApiRecordingTagResponse) => {
  if (recording.value) {
    (recording.value as ApiRecordingResponse).tags.push(label);
    if (!isInVisitContext.value) {
      updatedRecording(recording.value as ApiRecordingResponse);
    }
  }
};

const removedRecordingLabel = (labelId: TagId) => {
  if (recording.value) {
    (recording.value as ApiRecordingResponse).tags = (
      recording.value as ApiRecordingResponse
    ).tags.filter((tag) => tag.id !== labelId);
    if (!isInVisitContext.value) {
      updatedRecording(recording.value as ApiRecordingResponse);
    }
  }
};

const locationContext: ComputedRef<LatLng> | undefined = inject(
  latLngForActiveLocations,
);

const isInGreaterVisitContext = computed<boolean>(() => {
  return !!selectedVisit.value;
});

const recording = ref<LoadedResource<ApiRecordingResponse>>(null);

const tracks = computed<ApiTrackResponse[]>(() => {
  if (recording.value) {
    return (recording.value as ApiRecordingResponse).tracks;
  }
  return [];
});

const tags = computed<ApiRecordingTagResponse[]>(() => {
  if (recording.value) {
    return (recording.value as ApiRecordingResponse).tags.filter(
      (tag) => tag.detail !== "note",
    );
  }
  return [];
});

const notes = computed<ApiRecordingTagResponse[]>(() => {
  if (recording.value) {
    return (recording.value as ApiRecordingResponse).tags.filter(
      (tag) => tag.detail === "note",
    );
  }
  return [];
});

const checkNameTruncations = () => {
  stationNameIsTruncated.value =
    (stationNameSpan.value &&
      stationNameSpan.value?.offsetWidth <
        stationNameSpan.value?.scrollWidth) ||
    false;
  deviceNameIsTruncated.value =
    (deviceNameSpan.value &&
      deviceNameSpan.value?.offsetWidth < deviceNameSpan.value?.scrollWidth) ||
    false;
};

interface Timespan {
  fromDateTime: Date;
  untilDateTime?: Date;
}

const deviceSettingsMap = new Map<DeviceId, Timespan[]>();

const deviceHasReferencePhotoAtRecordingTime = ref<boolean>(false);
const checkReferencePhotoAtTime = async (deviceId: DeviceId, atTime: Date) => {
  deviceHasReferencePhotoAtRecordingTime.value = false;
  if (deviceSettingsMap.has(deviceId)) {
    const validTimespans = deviceSettingsMap.get(deviceId);
    const matchingTimespan = (validTimespans as Timespan[]).find(
      (timespan) =>
        timespan.fromDateTime < atTime &&
        (!timespan.untilDateTime || timespan.untilDateTime > atTime),
    );
    if (matchingTimespan) {
      deviceHasReferencePhotoAtRecordingTime.value = true;
      return;
    }
  }

  const hasReferenceResponse = await hasReferenceImageForDeviceAtTime(
    deviceId,
    atTime,
    true,
  );
  if (
    // We know the earliest time for the reference image, and the location.
    // We could infer that later recordings for this device at the exact same location
    // are the same reference image.
    hasReferenceResponse.success
  ) {
    if (!deviceSettingsMap.has(deviceId)) {
      deviceSettingsMap.set(deviceId, []);
    }
    const { fromDateTime, untilDateTime } = hasReferenceResponse.result;
    const photoValidityTimespan: { untilDateTime?: Date; fromDateTime: Date } =
      { fromDateTime: new Date(fromDateTime) };
    if (untilDateTime) {
      photoValidityTimespan.untilDateTime = new Date(untilDateTime);
    }
    (
      deviceSettingsMap.get(deviceId) as {
        untilDateTime?: Date;
        fromDateTime: Date;
      }[]
    ).push(photoValidityTimespan);
    deviceHasReferencePhotoAtRecordingTime.value = true;
  }
};

const isNightTime = (date: Date, location: LatLng): boolean => {
  const { sunrise, sunset } = sunCalc.getTimes(
    date,
    location.lat,
    location.lng,
  );

  const hourMin = date.getHours() * 60 + date.getMinutes();
  const sunriseHourMin = sunrise.getHours() * 60 + sunrise.getMinutes();
  const sunsetHourMin = sunset.getHours() * 60 + sunset.getMinutes();

  return hourMin < sunriseHourMin || hourMin > sunsetHourMin;
};

const loadRecording = async () => {
  if (currentRecordingId.value) {
    // Load the current recording, and then preload the next and previous recordings.
    // This behaviour will differ depending on whether we're viewing raw recordings or visits.
    recording.value = await getRecordingById(currentRecordingId.value);
    if (recording.value) {
      if (
        (recording.value.type === RecordingType.ThermalRaw &&
          recording.value.duration < 2.5 &&
          recording.value.duration > 1.8) ||
        (recording.value.type === RecordingType.Audio &&
          recording.value.duration > 9.8 &&
          recording.value.duration < 11)
      ) {
        recording.value.tags.push({
          id: -1,
          confidence: 1,
          detail: "Test recording",
          createdAt: recording.value.recordingDateTime,
        });
      }

      const rec = recording.value as ApiRecordingResponse;
      emit("loaded-recording", rec.type);
      prevRecordingType.value = rec.type;

      if (recordingIsProcessing.value) {
        setTimeout(loadRecording, 30000);
      }

      if (
        [RecordingType.ThermalRaw, RecordingType.TrailCamImage].includes(
          rec.type,
        )
      ) {
        // If not already known, check if there is a reference image for the recording device at the time
        // the recording was made.
        const _ = checkReferencePhotoAtTime(
          rec.deviceId,
          new Date(rec.recordingDateTime),
        );
      }

      const _ = nextTick(checkNameTruncations);
      if (route.params.trackId) {
        currentTrack.value = (
          recording.value as ApiRecordingResponse
        ).tracks.find(({ id }) => id == Number(route.params.trackId));
      }

      // if (
      //   !route.params.trackId ||
      //   (route.params.trackId && !currentTrack.value)
      // ) {
      //   // set the default track if not set
      //   if ((recording.value as ApiRecordingResponse).tracks.length) {
      //     await selectedTrack(
      //       (recording.value as ApiRecordingResponse).tracks[0].id,
      //       true
      //     );
      //   }
      // }
    } else {
      console.log("Recording load failed");
      // TODO Handle failure to get recording
    }
  } else {
    console.log("No recording id??");
  }
};

const deselectedTrack = async () => {
  await nextTick(() => {
    userSelectedTrack.value = undefined;
  });
  await router.replace({
    name: route.name as string,
    params: {},
    query: route.query,
  });
};

const selectedTrackWrap = (payload: {
  trackId: TrackId;
  automatically: boolean;
}) => selectedTrack(payload.trackId, payload.automatically);
const selectedTrack = async (trackId: TrackId, automatically: boolean) => {
  const params = {
    ...route.params,
    trackId,
  };
  if (
    recording.value &&
    recording.value.tracks.find(({ id }) => id == trackId)
  ) {
    if (!automatically) {
      // Make the player start playing at the beginning of the selected track,
      // and stop when it reaches the end of that track.
      if (recording.value) {
        userSelectedTrack.value = (
          recording.value as ApiRecordingResponse
        ).tracks.find(({ id }) => id === trackId);
        await nextTick(() => {
          userSelectedTrack.value = undefined;
        });
      }
    } else {
      // TODO: Should this automatically get removed if the selectedTrack has changed due to
      //  the recording playing onto a new track
      delete (params as Record<string, string | number>).detail;
    }
    await router.replace({
      name: route.name as string,
      params,
      query: route.query,
    });
  }
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
    const visit = selectedVisit.value as ApiVisitResponse;
    const duration = visitDuration(visit, true);
    let visitStart = timeAtLocation(visit.timeStart, locationContext.value);
    const visitEnd = timeAtLocation(visit.timeEnd, locationContext.value);
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

const recordingDurationString = computed<string>(() => {
  if (recording.value && locationContext && locationContext.value) {
    const rec = recording.value as ApiRecordingResponse;
    const durationMs = rec.duration * 1000;
    const duration = formatDuration(durationMs, true);
    let visitStart = timeAtLocation(
      rec.recordingDateTime,
      rec.location || locationContext.value,
    );
    const visitEnd = timeAtLocation(
      new Date(
        new Date(rec.recordingDateTime).getTime() + durationMs,
      ).toISOString(),
      rec.location || locationContext.value,
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
    const rec = recording.value as ApiRecordingResponse;
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

const currentLocationName = computed<string>(() => {
  return (
    (recording.value &&
      (recording.value as ApiRecordingResponse).stationName) ||
    "–"
  );
});

const currentDeviceName = computed<string>(() => {
  return (
    (recording.value && (recording.value as ApiRecordingResponse).deviceName) ||
    "–"
  );
});

const mapPointForRecording = computed<NamedPoint[]>(() => {
  if (recording.value) {
    const rec = recording.value as ApiRecordingResponse;
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

const navLinkClasses = ["nav-item", "nav-link", "border-0", "fs-7", "fw-bold"];
const activeTabName = computed(() => {
  return route.name;
});

const desktop = useMediaQuery("(min-width: 1040px)");
const isMobileView = computed<boolean>(() => {
  return !desktop.value;

  // ||
  //   (!!recordingType.value && recordingType.value === RecordingType.Audio)
});

const recordingViewContext: string = (route.meta as Record<string, string>)
  .context;

const recordingInfo = ref<HTMLDivElement>();
const playerContainer = ref<HTMLDivElement>();

const playerHeight = useElementSize(playerContainer);
watch(playerHeight.height, (newHeight) => {
  if (recordingInfo.value) {
    const recordingInfoEl = recordingInfo.value as HTMLDivElement;
    if (desktop.value && recordingType.value !== RecordingType.Audio) {
      recordingInfoEl.style.maxHeight = `${newHeight}px`;
    } else if (desktop.value && recordingType.value === RecordingType.Audio) {
      recordingInfoEl.removeAttribute("style");
    } else {
      recordingInfoEl.style.maxHeight = "auto";
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

const getExtensionForMimeType = (mimeType: string): string => {
  let fileExt = "raw";
  switch (mimeType) {
    case "audio/ogg":
      fileExt = "ogg";
      break;
    case "audio/wav":
      fileExt = "wav";
      break;
    case "audio/mp4":
      fileExt = "m4a";
      break;
    case "video/mp4":
      fileExt = "m4v";
      break;
    case "audio/mpeg":
      fileExt = "mp3";
      break;
    case "image/webp":
      fileExt = "webp";
      break;
    case "image/jpeg":
      fileExt = "jpg";
      break;
    case "application/x-cptv":
      fileExt = "cptv";
      break;
  }
  return fileExt;
};

const requestedDownload = async () => {
  if (recording.value) {
    const rec = recording.value as ApiRecordingResponse;
    await maybeRefreshStaleCredentials();
    const request = {
      mode: "cors",
      cache: "no-cache",
      headers: {
        Authorization: currentUserCreds.value?.apiToken,
      },
      method: "get",
    };

    const download = (url: string, filename: string) => {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename || "download";
      anchor.click();
    };
    const recordingId = rec.id;
    const downloadedFileResponse = await window.fetch(
      `${API_ROOT}/api/v1/recordings/raw/${recordingId}/archive`,
      // eslint-disable-next-line no-undef
      request as RequestInit,
    );
    const mimeType =
      downloadedFileResponse.headers.get("Content-Type") ||
      "application/octet-stream";
    const rawFileUint8Array = await downloadedFileResponse.arrayBuffer();
    download(
      URL.createObjectURL(new Blob([rawFileUint8Array], { type: mimeType })),
      `recording-${recordingId}-${DateTime.fromJSDate(
        new Date(rec.recordingDateTime),
      ).toFormat("dd-MM-yyyy--HH-mm-ss")}.${getExtensionForMimeType(mimeType)}`,
    );
  }
};

const recordingHasRealDuration = computed<boolean>(() => {
  if (recording.value) {
    if (
      (recording.value as ApiRecordingResponse).type ===
      RecordingType.ThermalRaw
    ) {
      return true;
    }
  }
  return false;
});

const prevRecordingType = ref<RecordingType | null>(null);

const recordingType = computed<RecordingType | null>(() => {
  if (recording.value && !!recording.value) {
    return (recording.value as ApiRecordingResponse).type;
  } else if (prevRecordingType.value) {
    return prevRecordingType.value;
  } else if (route.query["recording-mode"]) {
    if (route.query["recording-mode"] === "audio") {
      return RecordingType.Audio;
    } else {
      return RecordingType.ThermalRaw;
    }
  }
  return null;
});

interface MaybeDeletedRecording extends ApiRecordingResponse {
  tombstoned?: boolean;
}
interface MaybeDeletedVisit extends ApiVisitResponse {
  tombstoned?: boolean;
}

const deleteRecording = async () => {
  if (recording.value) {
    const recordingIdToDelete = recording.value.id;
    const deleteResponse = await apiDeleteRecording(recording.value.id);
    if (deleteResponse.success) {
      const hasNextRec = hasNextRecording.value;
      const hasNextVis = hasNextVisit.value;
      const hasPrevRec = hasPreviousRecording.value;
      const hasPrevVis = hasPreviousVisit.value;

      if (hasNextRec || hasNextVis || hasPrevRec || hasPrevVis) {
        if (hasNextRec || hasNextVis) {
          await gotoNextRecordingOrVisit();
        } else {
          await gotoPreviousRecordingOrVisit();
        }
      } else {
        // Close the modal if there are no other recordings to move to.
        emit("close");
      }
      if (isInVisitContext.value) {
        const ids = (
          (route.params.recordingIds &&
            (route.params.recordingIds as string).split(",").map(Number)) ||
          []
        ).filter((id) => id !== recordingIdToDelete);
        const params = {
          ...route.params,
          recordingIds: ids.map((id) => String(id)).join(","),
        };
        await router.replace({
          name: route.name as string,
          params,
          query: route.query,
        });
      }
      if (isInVisitContext.value) {
        // Remove from visits context, then recalc current visit.
        // Find the visit:
        const targetVisit =
          visitsContext.value &&
          (visitsContext.value as ApiVisitResponse[]).find((visit) =>
            visit.recordings.find(({ recId }) => recId === recordingIdToDelete),
          );
        if (targetVisit) {
          const targetVisitRecordingIndex = targetVisit.recordings.findIndex(
            ({ recId }) => recId === recordingIdToDelete,
          );
          targetVisit.recordings.splice(targetVisitRecordingIndex, 1);
          if (targetVisit.recordings.length !== 0) {
            await mutateCurrentVisit(targetVisit);
          } else {
            (targetVisit as MaybeDeletedVisit).tombstoned = true;
          }
        }
      } else {
        const targetRecording = (loadedRecordings.value || []).find(
          (rec) => rec.id === recordingIdToDelete,
        );
        if (targetRecording) {
          (targetRecording as MaybeDeletedRecording).tombstoned = true;
        }
      }
    }
  }
};
const inlineModal = ref<boolean>(false);
</script>
<template>
  <div
    class="recording-view d-flex flex-column"
    :class="{
      dimmed: inlineModal,
      'recording-type-audio':
        recordingType && recordingType === RecordingType.Audio,
    }"
  >
    <header
      class="recording-view-header d-flex justify-content-between ps-sm-3 pe-sm-1 ps-2 pe-1 py-sm-1"
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
      <div v-else>
        <span class="recording-header-type text-uppercase fw-bold">
          <span
            v-if="recordingType && recordingType === RecordingType.ThermalRaw"
            >Thermal Recording</span
          >
          <span
            v-else-if="
              recordingType && recordingType === RecordingType.TrailCamImage
            "
            >Trailcam image</span
          >
          <span
            v-else-if="recordingType && recordingType === RecordingType.Audio"
            >Audio recording</span
          >
        </span>
        <div class="recording-header-details mb-1 mb-sm-0">
          <span class="recording-header-label fw-bold text-capitalize" v-if="isInVisitContext">{{
            visitForRecording
          }}</span>
          <span
            v-if="recordingHasRealDuration"
            v-html="recordingDurationString"
            class="recording-header-time"
            :class="{
              'ms-sm-3': isInVisitContext,
              'ms-2': isInVisitContext,
            }"
            style="color: #444"
          />
        </div>
      </div>
      <button
        type="button"
        class="btn btn-square btn-hi"
        @click.stop.prevent="() => emit('close')"
      >
        <font-awesome-icon icon="xmark" />
      </button>
    </header>

    <!--  Camera recording  -->
    <div class="player-overflow" v-if="recordingType !== RecordingType.Audio">
      <div class="player-and-tagging d-flex">
        <div class="player-container">
          <div ref="playerContainer">
            <cptv-player
              :recording="recording as ApiRecordingResponse"
              :recording-id="currentRecordingId"
              :current-track="currentTrack"
              :has-next="hasNextRecording || hasNextVisit"
              :has-prev="hasPreviousRecording || hasPreviousVisit"
              :user-selected-track="userSelectedTrack"
              :export-requested="exportRequested"
              :display-header-info="showHeaderInfo"
              :has-reference-photo="deviceHasReferencePhotoAtRecordingTime"
              @export-completed="exportCompleted"
              @request-next-recording="
                async () => await gotoNextRecordingOrVisit()
              "
              @request-prev-recording="
                async () => await gotoPreviousRecordingOrVisit()
              "
              @request-next-visit="async () => await gotoNextVisit()"
              @request-prev-visit="async () => await gotoPreviousVisit()"
              @request-header-info-display="requestedHeaderInfoDisplay"
              @dismiss-header-info="dismissHeaderInfo"
              @track-selected="selectedTrackWrap"
            />
          </div>
        </div>
        <div class="recording-info d-flex flex-column" ref="recordingInfo">
          <!-- Desktop view only -->
          <div
            class="recording-station-info d-inline-flex mb-3"
            v-if="!isMobileView"
          >
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
            <div class="recording-details d-flex flex-column flex-fill">
              <div
                class="fw-bolder"
                :class="{
                  'recording-details-hover':
                    stationNameIsTruncated || deviceNameIsTruncated,
                }"
              >
                <div
                  class="device-name pt-3 px-3 text-truncate d-inline-flex"
                  :class="{ 'is-truncated': deviceNameIsTruncated }"
                >
                  <font-awesome-icon
                    icon="microchip"
                    size="xs"
                    class="me-2"
                    color="rgba(0, 0, 0, 0.7)"
                  />
                  <router-link
                    class="text-truncate non-blue-link"
                    ref="deviceNameSpan"
                    v-if="recording && recording.deviceId"
                    :to="{
                      name: 'device-diagnostics',
                      params: {
                        deviceId: recording.deviceId,
                        deviceName: urlNormaliseName(recording.deviceName),
                      },
                    }"
                  >
                    {{ currentDeviceName }}
                  </router-link>
                </div>
                <div
                  class="station-name pt-3 pe-2 text-truncate d-inline-flex"
                  :class="{ 'is-truncated': stationNameIsTruncated }"
                >
                  <font-awesome-icon
                    icon="map-marker-alt"
                    size="xs"
                    class="me-2"
                    color="rgba(0, 0, 0, 0.7)"
                  />
                  <span class="text-truncate" ref="stationNameSpan">
                    {{ currentLocationName }}
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
                query: route.query,
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
                query: route.query,
              }"
              >Labels
              <span v-if="activeTabName !== `${recordingViewContext}-labels`"
                >({{ tags.length }})</span
              ></router-link
            >
            <router-link
              :class="[
                ...navLinkClasses,
                { active: activeTabName === `${recordingViewContext}-notes` },
              ]"
              title="Notes"
              :to="{
                name: `${recordingViewContext}-notes`,
                params: {
                  ...route.params,
                  trackId: currentTrack?.id || tracks[0]?.id,
                },
                query: route.query,
              }"
              >Notes
              <span v-if="activeTabName !== `${recordingViewContext}-notes`"
                >({{ notes.length }})</span
              ></router-link
            >
          </ul>
          <div class="tags-overflow" v-if="!isMobileView">
            <!-- RecordingViewTracks -->
            <router-view
              :recording="recording"
              @track-tag-changed="trackTagChanged"
              @track-selected="selectedTrackWrapped"
              @track-removed="trackRemoved"
              @added-recording-label="addedRecordingLabel"
              @removed-recording-label="removedRecordingLabel"
              @delete-recording="deleteRecording"
            />
          </div>
          <!-- Mobile view only -->
          <recording-view-tracks
            v-if="isMobileView"
            :recording="recording"
            class="recording-tracks"
            @track-tag-changed="trackTagChanged"
            @track-removed="trackRemoved"
            @track-selected="selectedTrackWrap"
            @added-recording-label="addedRecordingLabel"
            @delete-recording="deleteRecording"
          />
          <div
            class="recording-info-mobile p-3 flex-grow-1"
            v-if="isMobileView"
          >
            <recording-view-labels
              :recording="recording as ApiRecordingResponse"
              @added-recording-label="addedRecordingLabel"
              @removed-recording-label="removedRecordingLabel"
              v-if="isMobileView"
            />
            <recording-view-notes
              :recording="recording as ApiRecordingResponse"
              @added-recording-label="addedRecordingLabel"
              @removed-recording-label="removedRecordingLabel"
              v-if="isMobileView"
            />
            <div
              class="recording-station-info bg-white d-flex mb-3 flex-column-reverse mt-3"
            >

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
              <div
                class="flex-fill d-flex align-items-sm-center p-2 px-3 flex-column flex-sm-row"
              >
                <div class="fw-bolder d-flex">
                  <div class="device-name pe-3 text-truncate">
                    <font-awesome-icon
                      icon="microchip"
                      size="xs"
                      class="me-2"
                      color="rgba(0, 0, 0, 0.7)"
                    />
                    <router-link
                      class="text-truncate non-blue-link"
                      ref="deviceNameSpan"
                      v-if="recording && recording.deviceId"
                      :to="{
                        name: 'device-diagnostics',
                        params: {
                          deviceId: recording.deviceId,
                          deviceName: urlNormaliseName(recording.deviceName),
                        },
                      }"
                    >
                      {{ currentDeviceName }}
                    </router-link>
                  </div>
                  <div class="station-name pe-2 text-truncate">
                    <font-awesome-icon
                      icon="map-marker-alt"
                      size="xs"
                      class="me-2"
                      color="rgba(0, 0, 0, 0.7)"
                    />
                    <span class="text-truncate">
                      {{ currentLocationName }}
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

          </div>
        </div>
      </div>
    </div>
    <!-- Audio recording -->
    <div
      class="player-container"
      ref="playerContainer"
      v-if="recordingType === RecordingType.Audio"
    >
      <spectrogram-viewer
        :recording="recording"
        :user-selected-track="userSelectedTrack"
        :recording-id="currentRecordingId"
        @track-selected="selectedTrackWrap"
        @track-deselected="deselectedTrack"
        @track-tag-changed="trackTagChanged"
        @track-removed="trackRemoved"
        @delete-recording="deleteRecording"
        :current-track="currentTrack"
      />
    </div>
    <div
      class="d-flex flex-row overflow-auto flex-fill recording-type-audio"
      ref="recordingInfo"
      v-if="recordingType === RecordingType.Audio"
    >
      <!-- Desktop view only -->
      <div class="recording-info d-flex flex-column">
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
              query: route.query,
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
              query: route.query,
            }"
            >Labels
            <span v-if="activeTabName !== `${recordingViewContext}-labels`"
              >({{ tags.length }})</span
            ></router-link
          >
          <router-link
            :class="[
              ...navLinkClasses,
              { active: activeTabName === `${recordingViewContext}-notes` },
            ]"
            title="Notes"
            :to="{
              name: `${recordingViewContext}-notes`,
              params: {
                ...route.params,
                trackId: currentTrack?.id || tracks[0]?.id,
              },
              query: route.query,
            }"
            >Notes
            <span v-if="activeTabName !== `${recordingViewContext}-notes`"
              >({{ notes.length }})</span
            ></router-link
          >
        </ul>
        <div class="overflow-auto recording-type-audio">
          <router-view
            v-if="!isMobileView"
            :recording="recording"
            @track-tag-changed="trackTagChanged"
            @track-selected="selectedTrackWrapped"
            @track-removed="trackRemoved"
            @added-recording-label="addedRecordingLabel"
            @removed-recording-label="removedRecordingLabel"
            @delete-recording="deleteRecording"
          />
          <recording-view-tracks
            v-if="isMobileView && recording"
            :recording="recording"
            class="recording-tracks"
            @track-tag-changed="trackTagChanged"
            @track-removed="trackRemoved"
            @track-selected="selectedTrackWrap"
            @added-recording-label="addedRecordingLabel"
            @delete-recording="deleteRecording"
          />
          <div class="recording-info-mobile p-3" v-if="isMobileView">
            <div
              class="recording-station-info bg-white d-flex mb-3 flex-column-reverse mt-3"
            >
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
              <div
                class="flex-fill d-flex align-items-sm-center p-2 px-3 flex-column flex-sm-row"
              >
                <div class="fw-bolder d-flex">
                  <div class="device-name pe-3 text-truncate">
                    <font-awesome-icon
                      icon="microchip"
                      size="xs"
                      class="me-2"
                      color="rgba(0, 0, 0, 0.7)"
                    />
                    <router-link
                      class="text-truncate non-blue-link"
                      ref="deviceNameSpan"
                      v-if="recording && recording.deviceId"
                      :to="{
                        name: 'device-diagnostics',
                        params: {
                          deviceId: recording.deviceId,
                          deviceName: urlNormaliseName(recording.deviceName),
                        },
                      }"
                    >
                      {{ currentDeviceName }}
                    </router-link>
                  </div>
                  <div class="station-name pe-2 text-truncate">
                    <font-awesome-icon
                      icon="map-marker-alt"
                      size="xs"
                      class="me-2"
                      color="rgba(0, 0, 0, 0.7)"
                    />
                    <span class="text-truncate">
                      {{ currentLocationName }}
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
              :recording="recording as ApiRecordingResponse"
              @added-recording-label="addedRecordingLabel"
              @removed-recording-label="removedRecordingLabel"
              v-if="isMobileView"
            />
            <recording-view-notes
              :recording="recording as ApiRecordingResponse"
              @added-recording-label="addedRecordingLabel"
              @removed-recording-label="removedRecordingLabel"
              v-if="isMobileView"
            />
          </div>
        </div>
      </div>
      <div
        class="recording-station-info"
        style="min-width: min(30%, 550px)"
        v-if="!isMobileView"
      >
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
        <div class="recording-details d-flex flex-column">
          <div
            class="fw-bolder"
            :class="{
              'recording-details-hover':
                stationNameIsTruncated || deviceNameIsTruncated,
            }"
          >
            <div
              class="device-name pt-3 px-3 text-truncate d-inline-flex"
              :class="{ 'is-truncated': deviceNameIsTruncated }"
            >
              <font-awesome-icon
                icon="microchip"
                size="xs"
                class="me-2"
                color="rgba(0, 0, 0, 0.7)"
              />
              <router-link
                class="text-truncate non-blue-link"
                ref="deviceNameSpan"
                v-if="recording && recording.deviceId"
                :to="{
                  name: 'device-diagnostics',
                  params: {
                    deviceId: recording.deviceId,
                    deviceName: urlNormaliseName(recording.deviceName),
                  },
                }"
              >
                {{ currentDeviceName }}
              </router-link>
            </div>
            <div
              class="station-name pt-3 pe-2 text-truncate d-inline-flex"
              :class="{ 'is-truncated': stationNameIsTruncated }"
            >
              <font-awesome-icon
                icon="map-marker-alt"
                size="xs"
                class="me-2"
                color="rgba(0, 0, 0, 0.7)"
              />
              <span class="text-truncate" ref="stationNameSpan">
                {{ currentLocationName }}
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
            v-if="recording"
            :recording="recording"
            :classes="['align-self-center']"
            @added-recording-label="addedRecordingLabel"
            @removed-recording-label="removedRecordingLabel"
            @requested-export="requestedExport"
            @requested-advanced-export="requestedAdvancedExport"
            @requested-download="requestedDownload"
            @delete-recording="deleteRecording"
          />
        </div>
      </div>
    </div>

    <!-- Mobile view only -->
    <footer class="recording-view-footer">
      <div class="visit-progress">
        <div
          class="progress-bar"
          v-if="currentRecordingIndex !== null"
          :style="{
            width: `${
              ((currentRecordingIndex + 1) / recordingIds.length) * 100
            }%`,
          }"
        ></div>
      </div>
      <nav class="d-flex footer-nav flex-fill">
        <div class="prev-button d-flex">
          <!-- Mobile only button without labels, advances through recordings and visits -->
          <button
            type="button"
            class="btn d-flex d-md-none flex-row-reverse align-items-center btn-hi position-relative"
            :disabled="!hasPreviousRecording && !hasPreviousVisit"
            @click.prevent="gotoPreviousRecordingOrVisit"
          >
            <span class="px-1">
              <svg
                :width="hasPreviousRecording ? 10 : 17"
                height="16"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M10 2.28c0 .17-.06.32-.18.45L4.69 8l5.13 5.27a.64.64 0 0 1 0 .89l-1.6 1.65a.59.59 0 0 1-.44.19.59.59 0 0 1-.43-.19L.18 8.45A.62.62 0 0 1 0 8c0-.17.06-.32.18-.45L7.35.2a.59.59 0 0 1 .43-.2c.17 0 .31.06.43.19l1.6 1.65c.13.12.19.27.19.44Z"
                  fill="#666"
                />
                <path
                  v-if="!hasPreviousRecording"
                  transform="translate(7 0)"
                  d="M10 2.28c0 .17-.06.32-.18.45L4.69 8l5.13 5.27a.64.64 0 0 1 0 .89l-1.6 1.65a.59.59 0 0 1-.44.19.59.59 0 0 1-.43-.19L.18 8.45A.62.62 0 0 1 0 8c0-.17.06-.32.18-.45L7.35.2a.59.59 0 0 1 .43-.2c.17 0 .31.06.43.19l1.6 1.65c.13.12.19.27.19.44Z"
                  fill="#666"
                />
              </svg>
            </span>
          </button>
          <!-- Desktop only button, advances through visits -->
          <button
            type="button"
            class="btn d-none d-md-flex flex-row-reverse align-items-center btn-hi position-relative"
            :disabled="!hasPreviousVisit"
            @click.prevent="gotoPreviousVisit"
            v-if="isInGreaterVisitContext"
            title="alt+shift &larr;"
          >
            <span class="d-none d-md-flex ps-2 flex-column align-items-start">
              <span class="fs-8 fw-bold" v-if="hasPreviousVisit"
                >Prev<span class="d-sm-none d-cs-inline">ious</span> visit</span
              >
              <span class="fs-8" v-else v-html="'&nbsp;'"></span>
              <span class="fs-9" v-if="previousVisit">
                <span class="text-capitalize fw-bold">{{
                  displayLabelForClassificationLabel(
                    previousVisit.classification as string,
                  )
                }}</span
                >,&nbsp;<span
                  >{{ previousVisit.recordings.length }} rec<span
                    class="d-sm-none d-cs-inline"
                    >ording</span
                  ><span v-if="previousVisit.recordings.length > 1"
                    >s</span
                  ></span
                >
              </span>
              <span class="fs-9" v-else v-html="'&nbsp;'"></span>
            </span>
            <span class="px-1">
              <svg width="17" height="16" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M10 2.28c0 .17-.06.32-.18.45L4.69 8l5.13 5.27a.64.64 0 0 1 0 .89l-1.6 1.65a.59.59 0 0 1-.44.19.59.59 0 0 1-.43-.19L.18 8.45A.62.62 0 0 1 0 8c0-.17.06-.32.18-.45L7.35.2a.59.59 0 0 1 .43-.2c.17 0 .31.06.43.19l1.6 1.65c.13.12.19.27.19.44Z"
                  fill="#666"
                />
                <path
                  transform="translate(7 0)"
                  d="M10 2.28c0 .17-.06.32-.18.45L4.69 8l5.13 5.27a.64.64 0 0 1 0 .89l-1.6 1.65a.59.59 0 0 1-.44.19.59.59 0 0 1-.43-.19L.18 8.45A.62.62 0 0 1 0 8c0-.17.06-.32.18-.45L7.35.2a.59.59 0 0 1 .43-.2c.17 0 .31.06.43.19l1.6 1.65c.13.12.19.27.19.44Z"
                  fill="#666"
                />
              </svg>
            </span>
          </button>
          <!-- Desktop only button, advances through recordings -->
          <button
            type="button"
            class="btn d-none d-md-flex flex-row-reverse align-items-center btn-hi position-relative"
            v-if="hasPreviousRecording"
            @click.prevent="gotoPreviousRecording"
            title="alt &larr;"
          >
            <span class="d-none d-md-flex ps-2 flex-column align-items-start">
              <span class="fs-8 fw-bold"
                >Prev<span
                  :class="{
                    'd-sm-none': hasPreviousVisit,
                    'd-cs-inline': hasPreviousVisit,
                  }"
                  >ious</span
                >
                rec<span
                  :class="{
                    'd-sm-none': hasPreviousVisit,
                    'd-cs-inline': hasPreviousVisit,
                  }"
                  >ording</span
                ></span
              >
              <span class="fs-9"
                >{{ (previousRecordingIndex as number) + 1 }}/{{
                  currentRecordingCount || allRecordingIds.length
                }}</span
              >
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
        </div>
        <recording-view-action-buttons
          class="action-buttons"
          v-if="isMobileView"
          :recording="recording as ApiRecordingResponse"
          @added-recording-label="addedRecordingLabel"
          @removed-recording-label="removedRecordingLabel"
          @requested-export="requestedExport"
          @requested-advanced-export="requestedAdvancedExport"
          @requested-download="requestedDownload"
          @delete-recording="deleteRecording"
        />
        <div class="next-button d-flex">
          <!-- Desktop only button, advances through recordings -->
          <button
            type="button"
            class="btn d-none d-md-flex align-items-center btn-hi position-relative"
            v-if="hasNextRecording"
            @click.prevent="gotoNextRecording"
            title="alt &rarr;"
          >
            <span class="d-none d-sm-flex pe-2 flex-column align-items-end">
              <span class="fs-8 fw-bold"
                >Next rec<span
                  :class="{
                    'd-sm-none': hasNextVisit,
                    'd-cs-inline': hasNextVisit,
                  }"
                  >ording</span
                ></span
              >
              <span class="fs-9"
                >{{ (nextRecordingIndex as number) + 1 }}/{{
                  currentRecordingCount || allRecordingIds.length
                }}</span
              >
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
          <!-- Desktop only button, advances through visits -->
          <button
            type="button"
            class="btn d-none d-md-flex align-items-center btn-hi position-relative"
            :disabled="!hasNextVisit"
            @click.prevent="gotoNextVisit"
            v-if="isInGreaterVisitContext"
            title="alt+shift &rarr;"
          >
            <span class="d-none d-sm-flex pe-2 flex-column align-items-end">
              <span class="fs-8 fw-bold" v-if="hasNextVisit">Next visit</span>
              <span class="fs-8" v-else v-html="'&nbsp;'"></span>
              <span class="fs-9" v-if="nextVisit">
                <span class="text-capitalize fw-bold">{{
                  displayLabelForClassificationLabel(
                    nextVisit.classification as string,
                  )
                }}</span
                >,&nbsp;<span
                  >{{ nextVisit.recordings.length }} rec<span
                    class="d-sm-none d-cs-inline"
                    >ording</span
                  ><span v-if="nextVisit.recordings.length > 1">s</span></span
                >
              </span>
              <span class="fs-9" v-else v-html="'&nbsp;'"></span>
            </span>
            <span class="px-1">
              <svg width="17" height="16" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M10 8c0 .17-.06.32-.18.45L2.65 15.8a.59.59 0 0 1-.43.19.59.59 0 0 1-.43-.19l-1.6-1.65a.62.62 0 0 1-.19-.44c0-.17.06-.32.18-.45L5.31 8 .18 2.73A.62.62 0 0 1 0 2.28a.6.6 0 0 1 .18-.44L1.78.19A.59.59 0 0 1 2.23 0c.17 0 .31.06.43.19l7.17 7.36c.12.13.18.28.18.45Z"
                  fill="#666"
                />
                <path
                  transform="translate(7 0)"
                  d="M10 8c0 .17-.06.32-.18.45L2.65 15.8a.59.59 0 0 1-.43.19.59.59 0 0 1-.43-.19l-1.6-1.65a.62.62 0 0 1-.19-.44c0-.17.06-.32.18-.45L5.31 8 .18 2.73A.62.62 0 0 1 0 2.28a.6.6 0 0 1 .18-.44L1.78.19A.59.59 0 0 1 2.23 0c.17 0 .31.06.43.19l7.17 7.36c.12.13.18.28.18.45Z"
                  fill="#666"
                />
              </svg>
            </span>
          </button>
          <!-- Mobile only button without labels, advances through recordings and visits -->
          <button
            type="button"
            class="btn d-flex d-md-none align-items-center btn-hi"
            :disabled="!hasNextRecording && !hasNextVisit"
            @click.prevent="async () => await gotoNextRecordingOrVisit()"
          >
            <span class="px-1">
              <svg
                :width="hasNextRecording ? 10 : 17"
                height="16"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M10 8c0 .17-.06.32-.18.45L2.65 15.8a.59.59 0 0 1-.43.19.59.59 0 0 1-.43-.19l-1.6-1.65a.62.62 0 0 1-.19-.44c0-.17.06-.32.18-.45L5.31 8 .18 2.73A.62.62 0 0 1 0 2.28a.6.6 0 0 1 .18-.44L1.78.19A.59.59 0 0 1 2.23 0c.17 0 .31.06.43.19l7.17 7.36c.12.13.18.28.18.45Z"
                  fill="#666"
                />
                <path
                  transform="translate(7 0)"
                  v-if="!hasNextRecording"
                  d="M10 8c0 .17-.06.32-.18.45L2.65 15.8a.59.59 0 0 1-.43.19.59.59 0 0 1-.43-.19l-1.6-1.65a.62.62 0 0 1-.19-.44c0-.17.06-.32.18-.45L5.31 8 .18 2.73A.62.62 0 0 1 0 2.28a.6.6 0 0 1 .18-.44L1.78.19A.59.59 0 0 1 2.23 0c.17 0 .31.06.43.19l7.17 7.36c.12.13.18.28.18.45Z"
                  fill="#666"
                />
              </svg>
            </span>
          </button>
        </div>
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

.overflow-x-hidden {
  overflow-x: hidden;
}
// TODO: When there is overflow, show shadows at top/bottom
.player-overflow {
  @media screen and (max-width: 1040px) {
    overflow-y: auto;
  }
  background: #f6f6f6;
}
.player-overflow.recording-type-audio {
  overflow-y: auto;
  background: #f6f6f6;
}
.tags-overflow {
  @media screen and (min-width: 1041px) {
    overflow-y: scroll;
    @headerHeight: 64px;
    @playerHeight: 426px;
    @locationInfoHeight: 120px;
    @tabsHeight: 38.5px;
    @footerHeight: 55px;
    flex: 1;
    //max-height: min(
    //  @playerHeight,
    //  calc(
    //    100svh -
    //      (
    //        @headerHeight + @playerHeight + @locationInfoHeight + @tabsHeight +
    //          @footerHeight
    //      )
    //  )
    //);
    height: 100%;
  }
}
.footer-nav {
  flex-direction: row;
  justify-content: center;
  align-items: stretch;
  position: relative;

  @media screen and (min-width: 576px) {
    min-height: 55px;
  }
  min-height: 48px;
}
.next-button,
.prev-button {
  position: absolute;
  top: 0;
  bottom: 0;
}
.next-button {
  right: 0;
}
.prev-button {
  left: 0;
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
  @container (max-height: 940px) {
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
  }
}
.recording-view-footer {
  background: white;
  .visit-progress {
    height: 2px;
    background: #e1e1e1;
    .progress-bar {
      transition: width 0.3s;
      // TODO - make the progress bar proportional to the offset of the recording within the visit timeline.
      // When the video is playing, we could even update it for the duration of the video?
      height: 100%;
      background: #6dbd4b;
    }
  }
}
.recording-info {
  width: 100%;
}
.recording-station-info {
  .standard-shadow();
}
.recording-details {
  max-width: 318px;
}
.recording-type-audio .recording-details {
  max-width: unset;
}
.recording-location-map {
  @media screen and (max-width: 1039px) {
    width: 100%;
    height: 180px;
  }
  width: 120px;
  height: 120px;
  min-width: 120px;
}
@media screen and (min-width: 880px) {
  .d-cs-inline {
    display: inline !important;
  }
}
.nav-item.active {
  background: unset;
  border-bottom: 3px solid #6dbd4b !important;
}
.station-name,
.recording-date-time {
  color: #444;
}
@media screen and (min-width: 1041px) {
  .recording-details-hover {
    &:hover {
      position: relative;
      .device-name,
      .station-name {
        transition: all 0.2s ease-in-out;
        opacity: 0.25;
        &:hover {
          opacity: 1;
        }
      }
      .station-name:hover {
        transform: translateX(-90%);
        > span {
          min-width: 270px;
        }
      }
    }
  }
}

.device-name span {
  transition: background-color 1s ease-in;
  background-color: transparent;
}

.device-name,
.station-name {
  max-width: 50%;
  width: 50%;
  cursor: default;
  padding-top: 0;
  align-items: center;
  background-color: transparent;
  @media screen and (min-width: 1041px) {
    &:hover {
      z-index: 1;
      background: #f6f6f6;
      > span {
        background: #f6f6f6;
        border-radius: 3px;
      }

      > .text-truncate {
        overflow: unset;
        white-space: unset;
        word-break: break-all;
        z-index: 1;
      }
      overflow: visible;
    }
  }
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
.player-and-tagging.recording-type-audio {
  flex-direction: column;
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

.recording-view.recording-type-audio {
  background: white;
  position: fixed;
  top: 16px;
  bottom: 16px;
  left: 16px;
  right: 16px;
  container-type: size;
  @media screen and (max-width: 1040px) {
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
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
.player-container {
  background: black;
}
.non-blue-link {
  color: inherit;
}
</style>
