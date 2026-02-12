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
  useTemplateRef,
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
import type {
  ApiAudioRecordingMetadataResponse,
  ApiAudioRecordingResponse,
  ApiRecordingResponse,
  ApiThermalRecordingMetadataResponse,
  ApiThermalRecordingResponse,
} from "@typedefs/api/recording";
import router from "@/router";
import type {
  ApiVisitResponse,
  VisitRecordingTag,
} from "@typedefs/api/monitoring";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import { DateTime } from "luxon";
import CptvPlayer from "@/components/cptv-player/CptvPlayer.vue";
import type { ApiTrackResponse } from "@typedefs/api/track";
import type { ApiRecordingTagResponse } from "@typedefs/api/tag";
import { useElementSize, useMediaQuery } from "@vueuse/core";
import RecordingViewActionButtons from "@/components/RecordingViewActionButtons.vue";
import { displayLabelForClassificationLabel } from "@api/classificationsUtils.ts";
import type { LoggedInUser } from "@models/LoggedInUser";
import type { ApiHumanTrackTagResponse } from "@typedefs/api/trackTag";
import { ClientApi } from "@/api";
import {
  activeLocations,
  currentUser as currentUserInfo,
  latLngForActiveLocations,
} from "@models/provides";
import { DEFAULT_AUTH_ID, type LoadedResource } from "@apiClient/types";
import {
  RecordingProcessingState,
  RecordingType as ConcreteRecordingType,
  RecordingType,
} from "@typedefs/api/consts.ts";
import sunCalc from "suncalc";
import { capitalize } from "@/utils.ts";
import SpectrogramViewer from "@/components/SpectrogramViewer.vue";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";
import RecordingViewMetadata from "@/components/RecordingViewMetadata.vue";
import RecordingViewTabs from "@/components/RecordingViewTabs.vue";

const selectedVisit = inject(
  "currentlySelectedVisit",
) as Ref<ApiVisitResponse | null>;
const currentUser = inject(currentUserInfo) as Ref<LoggedInUser | null>;
const visitsContext = inject("visitsContext") as Ref<ApiVisitResponse[] | null>;
const route = useRoute();
const emit = defineEmits<{
  (e: "close"): void;
  (e: "start-blocking-work"): void;
  (e: "end-blocking-work"): void;
  (e: "loaded-recording", type: RecordingType): void;
  (e: "recording-updated", recordingId: RecordingId, action: string): void;
}>();
const inlineModalEl = ref<HTMLDivElement>();
const stickyTabs = useTemplateRef("stickyTabs");
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

const hasRecordingsOrVisitsInContext = computed<boolean>(() => {
  return (
    hasPreviousRecording.value ||
    hasPreviousVisit.value ||
    hasNextRecording.value ||
    hasNextVisit.value
  );
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
    const index = recording.value.tracks.findIndex(
      ({ id }: { id: TrackId }) => id === trackId,
    );
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
          ({ what, userId }) =>
            what === tag && userId === currentUser.value?.id,
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

  // FIXME: We'd like a way of cancelling this request if we navigate to another device.
  const hasReferenceResponse =
    await ClientApi.Devices.hasReferenceImageForDeviceAtTime(
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
    const recordingResponse = await ClientApi.Recordings.getRecordingById(
      currentRecordingId.value,
    );
    if (recordingResponse) {
      recording.value = recordingResponse;

      if (
        (recording.value.type === ConcreteRecordingType.ThermalRaw &&
          recording.value.duration < 2.5 &&
          recording.value.duration > 1.8) ||
        "status" in
          ((recording.value as ApiThermalRecordingResponse)
            .additionalMetadata || {}) ||
        (recording.value.type === ConcreteRecordingType.Audio &&
          recording.value.duration < 11 &&
          recording.value.duration > 9.8) ||
        "status" in
          ((recording.value as ApiAudioRecordingResponse).additionalMetadata ||
            {})
      ) {
        let detail = "Test Recording";
        if (
          "status" in
          ((
            recording.value as
              | ApiAudioRecordingResponse
              | ApiThermalRecordingResponse
          ).additionalMetadata || {})
        ) {
          detail = capitalize(
            `${((recording.value as ApiAudioRecordingResponse).additionalMetadata as ApiAudioRecordingMetadataResponse | ApiThermalRecordingMetadataResponse).status} recording`,
          );
        }
        recording.value.tags.push({
          id: -1,
          confidence: 1,
          detail,
          createdAt: recording.value.recordingDateTime,
        });
      }

      const rec = recording.value as ApiRecordingResponse;
      emit("loaded-recording", rec.type);
      prevRecordingType.value = rec.type;

      if (recordingIsProcessing.value) {
        setTimeout(loadRecording, 30000);
      }

      if (rec.type === RecordingType.ThermalRaw) {
        // If not already known, check if there is a reference image for the recording device at the time
        // the recording was made.
        const _ = checkReferencePhotoAtTime(
          rec.deviceId,
          new Date(rec.recordingDateTime),
        );
      }

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
      console.warn("Recording load failed");
      // TODO: Handle failure to get recording (it may have been deleted, or we may not have authorisation)
    }
  } else {
    console.warn("No recording id??");
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
    recording.value.tracks.find(({ id }: { id: TrackId }) => id == trackId)
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
    const duration = visitDuration(visit, !!isDesktop.value);
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

const isDesktop = useMediaQuery("(min-width: 992px)");
const isMobileView = computed<boolean>(() => {
  return !isDesktop.value;
});

const recordingViewContext: string = (route.meta as Record<string, string>)
  .context;

const recordingInfo: Ref<HTMLDivElement | null> =
  useTemplateRef("recordingInfo");
const playerContainer: Ref<HTMLDivElement | null> =
  useTemplateRef("playerContainer");

const playerHeight = useElementSize(playerContainer);

watch(playerHeight.height, (newHeight) => {
  if (recordingInfo.value) {
    const recordingInfoEl = recordingInfo.value as HTMLDivElement;
    if (isDesktop.value && recordingType.value !== RecordingType.Audio) {
      recordingInfoEl.style.maxHeight = `${newHeight}px`;
    } else if (isDesktop.value && recordingType.value === RecordingType.Audio) {
      recordingInfoEl.removeAttribute("style");
    } else {
      recordingInfoEl.style.maxHeight = "auto";
    }
  }
});

const exportRequested = ref<boolean | "advanced" | "download">(false);
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
    const apiToken = await ClientApi.getCredentials(DEFAULT_AUTH_ID);
    if (!apiToken) {
      console.warn("api token not found");
      return;
    }
    const request = {
      mode: "cors",
      cache: "no-cache",
      headers: {
        Authorization: apiToken,
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
    inlineModal.value = true;
    await nextTick(() => {
      exportRequested.value = "download";
    });
    const downloadedFileResponse = await window.fetch(
      `${ClientApi.getApiRoot()}/api/v1/recordings/raw/${recordingId}`,
      // eslint-disable-next-line no-undef
      request as RequestInit,
    );
    let mimeType =
      downloadedFileResponse.headers.get("Content-Type") ||
      "application/octet-stream";
    let downloadSize = 0;
    if (mimeType.includes("__")) {
      // We've shoved some fileSize info into the mime type, since this is the only header that seems to get through.
      downloadSize = Number(mimeType.split("__")[1]);
      mimeType = mimeType.split("__")[0];
    }
    const chunks = [];
    if (downloadSize && downloadedFileResponse.body) {
      let loaded = 0;
      const reader = downloadedFileResponse.body.getReader();
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break; // Reading is complete
        }

        chunks.push(value);
        loaded += value.length;

        // Calculate and log progress (update a UI element here)
        downloadProgress.value = Math.round((loaded / downloadSize) * 100);
      }
    } else {
      chunks.push(await downloadedFileResponse.arrayBuffer());
    }
    //const rawFileUint8Array = await downloadedFileResponse.arrayBuffer();
    inlineModal.value = false;
    await nextTick(() => {
      exportRequested.value = false;
      downloadProgress.value = 0;
    });
    download(
      URL.createObjectURL(new Blob(chunks, { type: mimeType })),
      `recording-${recordingId}-${DateTime.fromJSDate(
        new Date(rec.recordingDateTime),
      ).toFormat("dd-MM-yyyy--HH-mm-ss")}.${getExtensionForMimeType(mimeType)}`,
    );
  }
};
const downloadProgress = ref<number>(0);
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
    const deleteResponse = await ClientApi.Recordings.deleteRecording(
      recording.value.id,
    );
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
const scrollOffsetY = ref<number>(0);
const onScroll = (e: Event) => {
  // So, when we make the player smaller, we're also *reducing* the scrollTop amount again.
  const scrollTop = (e.target as HTMLElement).scrollTop;
  if (playerContainer.value) {
    scrollOffsetY.value = scrollTop;
  }
};
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
      class="recording-view-header d-flex justify-content-between ps-sm-3 pe-0 pe-sm-1 ps-2 py-sm-2"
    >
      <div v-if="isInVisitContext">
        <span class="recording-header-type fs-6 fw-medium">Visit</span>
        <div class="recording-header-details mb-1 mb-sm-0">
          <span class="recording-header-label fw-semibold text-capitalize">{{
            displayLabelForClassificationLabel(visitLabel)
          }}</span>
          <span
            v-if="isInGreaterVisitContext"
            v-html="visitDurationString"
            class="recording-header-time ms-2 ms-sm-2 text-secondary"
          />
        </div>
      </div>
      <div v-else>
        <span class="recording-header-type fs-6 fw-medium">
          <span
            v-if="recordingType && recordingType === RecordingType.ThermalRaw"
            >Thermal Recording</span
          >
          <span
            v-else-if="recordingType && recordingType === RecordingType.Audio"
            >Audio recording</span
          >
        </span>
        <div class="recording-header-details mb-1 mb-sm-0">
          <span
            class="recording-header-label fw-semibold text-capitalize"
            v-if="isInVisitContext"
            >{{ visitForRecording }}</span
          >
          <span
            v-if="recordingHasRealDuration"
            v-html="recordingDurationString"
            class="recording-header-time text-muted"
            :class="{
              'ms-sm-3': isInVisitContext,
              'ms-2': isInVisitContext,
            }"
          />
        </div>
      </div>
      <button
        type="button"
        class="btn btn-icon d-flex align-items-center"
        @click.stop.prevent="() => emit('close')"
      >
        <material-symbol name="close" />
      </button>
    </header>
    <!--  Camera recording  -->
    <div
      class="player-overflow flex-grow-1"
      v-if="recordingType !== RecordingType.Audio"
      :class="{ 'd-flex': isMobileView }"
    >
      <div
        @scroll.passive="onScroll"
        class="player-and-tagging d-flex"
        :class="{ 'flex-fill overflow-x-hidden': isMobileView }"
      >
        <div
          class="player-container bg-black"
          ref="playerContainer"
          :class="{ 'sticky-top': isMobileView }"
          :style="{ 'margin-bottom': `${Math.min(200, scrollOffsetY)}px` }"
        >
          <cptv-player
            :scroll-offset-y="scrollOffsetY"
            :recording="recording as ApiRecordingResponse"
            :recording-id="currentRecordingId"
            :download-progress="downloadProgress"
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
          >
          </cptv-player>
        </div>
        <recording-view-tabs
          :recording="recording"
          :current-track="currentTrack"
          v-if="isMobileView"
          class="sticky-top"
          :style="{ top: `${playerHeight.height.value}px` }"
          ref="stickyTabs"
        />
        <div
          class="recording-info d-flex flex-column flex-fill"
          ref="recordingInfo"
        >
          <recording-view-metadata v-if="isDesktop" :recording="recording">
            <recording-view-action-buttons
              :recording="recording"
              @added-recording-label="addedRecordingLabel"
              @removed-recording-label="removedRecordingLabel"
              @requested-export="requestedExport"
              @requested-advanced-export="requestedAdvancedExport"
              @requested-download="requestedDownload"
              @delete-recording="deleteRecording"
            />
          </recording-view-metadata>
          <recording-view-tabs
            :recording="recording"
            :current-track="currentTrack"
            v-if="isDesktop"
          />
          <div class="tags-overflow d-flex flex-grow-1" ref="scrollContainer">
            <!-- RecordingViewTracks, RecordingViewLabels, RecordingViewNotes, RecordingViewMetadata (mobile) -->
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
      class="recording-type-audio d-flex flex-row overflow-y-auto overflow-x-hidden flex-fill"
      ref="recordingInfo"
      v-if="recordingType === RecordingType.Audio"
    >
      <div class="recording-info d-flex flex-column flex-fill overflow-hidden">
        <recording-view-tabs
          :recording="recording"
          :current-track="currentTrack"
        />
        <div
          class="recording-type-audio overflow-y-auto overflow-x-hidden h-100"
        >
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
      </div>
      <recording-view-metadata v-if="!isMobileView" :recording="recording">
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
      </recording-view-metadata>
    </div>

    <!-- Footer -->
    <footer
      v-if="(hasRecordingsOrVisitsInContext && isDesktop) || isMobileView"
      class="recording-view-footer"
    >
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

      <nav class="d-flex justify-content-between flex-fill">
        <div class="prev-button d-flex">
          <!-- Mobile only button without labels, advances through recordings and visits -->
          <button
            type="button"
            class="btn d-flex d-md-none flex-row-reverse align-items-center btn-hi position-relative"
            :disabled="!hasPreviousRecording && !hasPreviousVisit"
            @click.prevent="gotoPreviousRecordingOrVisit"
          >
            <material-symbol
              v-if="hasPreviousRecording"
              name="keyboard_arrow_left"
            />
            <material-symbol
              v-if="hasPreviousVisit && !hasPreviousRecording"
              name="keyboard_double_arrow_left"
            />
          </button>
          <!-- Desktop only button, advances through visits -->
          <button
            type="button"
            class="btn d-none d-md-flex flex-row-reverse align-items-center position-relative"
            :disabled="!hasPreviousVisit"
            @click.prevent="gotoPreviousVisit"
            v-if="isInGreaterVisitContext && hasPreviousVisit"
            title="alt+shift &larr;"
          >
            <span class="d-none d-md-flex ps-2 flex-column align-items-start">
              <span class="fs-6 text-body-secondary"
                >Prev<span class="d-none d-lg-inline">ious</span> visit</span
              >
              <span v-if="previousVisit" class="text-capitalize fw-medium fs-6">
                {{
                  displayLabelForClassificationLabel(
                    previousVisit.classification as string,
                  )
                }}
              </span>
            </span>
            <material-symbol
              name="keyboard_double_arrow_left"
              size="1.25rem"
              class="me-1"
            />
          </button>
          <!-- Desktop only button, advances through recordings -->
          <button
            type="button"
            class="btn d-none d-md-flex flex-row-reverse align-items-center position-relative"
            v-if="hasPreviousRecording"
            @click.prevent="gotoPreviousRecording"
            title="alt &larr;"
          >
            <span class="d-none d-md-flex ps-2 flex-column align-items-start">
              <span class="fs-6 text-body-secondary"
                >Prev<span
                  class=""
                  :class="{
                    'd-none': hasPreviousVisit,
                    'd-lg-inline': hasPreviousVisit,
                  }"
                  >ious</span
                >
                rec<span
                  :class="{
                    'd-sm-none': hasPreviousVisit,
                    'd-lg-inline': hasPreviousVisit,
                  }"
                  >ording</span
                ></span
              >
              <span class="fs-6 fw-medium"
                >{{ (previousRecordingIndex as number) + 1 }}/{{
                  currentRecordingCount || allRecordingIds.length
                }}</span
              >
            </span>
            <material-symbol
              name="keyboard_arrow_left"
              size="1.25rem"
              class="me-1"
            />
          </button>
        </div>
        <recording-view-action-buttons
          class="action-buttons ms-auto me-auto"
          v-if="isMobileView"
          :recording="recording as ApiRecordingResponse"
          @added-recording-label="addedRecordingLabel"
          @removed-recording-label="removedRecordingLabel"
          @requested-export="requestedExport"
          @requested-advanced-export="requestedAdvancedExport"
          @requested-download="requestedDownload"
          @delete-recording="deleteRecording"
        />
        <div class="next-button d-flex justify-content-end">
          <!-- Desktop only button, advances through recordings -->
          <button
            type="button"
            class="btn d-none d-md-flex align-items-center position-relative"
            v-if="hasNextRecording"
            @click.prevent="gotoNextRecording"
            title="alt &rarr;"
          >
            <span class="d-none d-sm-flex pe-2 flex-column align-items-end">
              <span class="fs-6 text-body-secondary"
                >Next rec<span
                  :class="{
                    'd-sm-none': hasNextVisit,
                    'd-lg-inline': hasNextVisit,
                  }"
                  >ording</span
                ></span
              >
              <span class="fs-6 fw-medium"
                >{{ (nextRecordingIndex as number) + 1 }}/{{
                  currentRecordingCount || allRecordingIds.length
                }}</span
              >
            </span>
            <material-symbol
              name="keyboard_arrow_right"
              size="1.25rem"
              class="ms-1"
            />
          </button>
          <!-- Desktop only button, advances through visits -->
          <button
            type="button"
            class="btn d-none d-md-flex align-items-center position-relative"
            :disabled="!hasNextVisit"
            @click.prevent="gotoNextVisit"
            v-if="isInGreaterVisitContext && hasNextVisit"
            title="alt+shift &rarr;"
          >
            <span class="d-none d-sm-flex pe-2 flex-column align-items-end">
              <span class="fs-6 text-body-secondary">Next visit</span>
              <span v-if="nextVisit" class="text-capitalize fw-medium fs-6">
                {{
                  displayLabelForClassificationLabel(
                    nextVisit.classification as string,
                  )
                }}
              </span>
            </span>
            <material-symbol
              name="keyboard_double_arrow_right"
              size="1.25rem"
              class="ms-1"
            />
          </button>
          <!-- Mobile only button without labels, advances through recordings and visits -->
          <button
            type="button"
            class="btn btn-icon d-flex d-md-none align-items-center"
            :disabled="!hasNextRecording && !hasNextVisit"
            @click.prevent="async () => await gotoNextRecordingOrVisit()"
          >
            <material-symbol
              v-if="hasNextRecording"
              name="keyboard_arrow_right"
            />
            <material-symbol
              v-if="hasNextVisit && !hasNextRecording"
              name="keyboard_double_arrow_right"
            />
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
@import "../assets/less/typography.less";
@import "../assets/less/elevation.less";
@import "../assets/less/breakpoints.less";

.recording-view {
  @media screen and (max-width: @breakpoint-md-max) {
    background: var(--bs-white);
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
  }
  &.recording-type-audio {
    background: var(--bs-white);
    position: fixed;
    top: var(--cp-spacing-base);
    bottom: var(--cp-spacing-base);
    left: var(--cp-spacing-base);
    right: var(--cp-spacing-base);
    container-type: size;
    @media screen and (max-width: @breakpoint-md-max) {
      top: 0;
      bottom: 0;
      left: 0;
      right: 0;
    }
    @media screen and (min-width: @breakpoint-lg) {
      border-radius: var(--bs-modal-border-radius);
    }
  }
}

// TODO: When there is overflow, show shadows at top/bottom
.player-overflow {
  @media (max-width: @breakpoint-md-max) {
    overflow-y: auto;
  }
  &.recording-type-audio {
    overflow-y: auto;
  }
}

.recording-view-header {
  border-bottom: 1px solid var(--border-color-light);
}

.recording-header-details {
  @media (max-width: @breakpoint-xs-max) {
    line-height: var(--cp-line-height-sm);
  }
  @media (min-width: @breakpoint-sm) {
    line-height: var(--cp-line-height-md);
  }
}

.recording-header-label {
  @media (max-width: @breakpoint-xs-max) {
    font-size: var(--cp-font-size-md);
  }
  @media (min-width: @breakpoint-sm) {
    font-size: var(--cp-font-size-lg);
  }
}

.recording-header-time {
  @media (max-width: @breakpoint-xs-max) {
    font-size: var(--cp-font-size-sm);
  }
  @media (min-width: @breakpoint-sm) {
    font-size: var(--cp-font-size-md);
  }
}

.recording-view-footer {
  @media (min-width: @breakpoint-sm) {
    padding-bottom: var(--cp-spacing-xxxs);
  }
  .visit-progress {
    height: 2px;
    background: var(--border-color-light);
    @media (min-width: @breakpoint-sm) {
      margin-bottom: var(--cp-spacing-xxxs);
    }
    .progress-bar {
      transition: width 0.3s;
      // TODO - make the progress bar proportional to the offset of the recording within the visit timeline.
      // When the video is playing, we could even update it for the duration of the video?
      height: 100%;
      background: var(--cp-color-primary);
    }
  }
  .prev-button,
  .next-button {
    // maybe there's a cleaner way of doing this but it works for now
    width: calc(calc(100% - 256px) / 2); // 256px is the width of action buttons
  }
}

// only for video
.player-and-tagging {
  @media screen and (max-width: @breakpoint-md-max) {
    flex-direction: column;
  }
  @media screen and (min-width: @breakpoint-lg) {
    flex-direction: row;
  }
}

.tags-overflow {
  //max-height: 1000000px;
  @media (max-width: @breakpoint-md-max) {
    overflow: auto;
  }
  @media (min-width: @breakpoint-lg) {
    overflow-y: auto;
    flex: 1;
    height: 100%;
  }
}

// Video export modals
.inline-modal {
  // TODO - Max width for mobile breakpoints
  @width: 400px;
  @height: auto;
  width: @width;
  height: @height;
  position: absolute;
  top: 40%;
  left: calc(50% - (@width / 2));
  background: var(--bs-white);
  z-index: 401;
  border-radius: var(--bs-border-radius);
  .standard-shadow();
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
</style>

<style lang="less">
@import "../assets/less/breakpoints.less";

.player-and-tagging {
  overscroll-behavior-y: none;
  .video-container {
    @media screen and (min-width: @breakpoint-lg) and (max-width: @breakpoint-lg-max) {
      max-width: 576px;
    }
  }
}
</style>
