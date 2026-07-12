<script setup lang="ts">
import type { RouteLocationRaw, RouteParams } from "vue-router";
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
  visitClassificationLabel,
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
import { BModal, BTooltip } from "bootstrap-vue-next";
import LocationName from "@/components/LocationName.vue";
import type { ApiStaticVisitResponse } from "@typedefs/api/visit";

const selectedVisit = inject(
  "currentlySelectedVisit",
) as Ref<ApiStaticVisitResponse | null>;
const currentUser = inject(currentUserInfo) as Ref<LoggedInUser | null>;
const visitsContext = inject("visitsContext") as Ref<
  ApiStaticVisitResponse[] | null
>;
const route = useRoute();
const emit = defineEmits<{
  (e: "close"): void;
  (e: "start-blocking-work"): void;
  (e: "end-blocking-work"): void;
  (e: "loaded-recording", type: RecordingType): void;
  (
    e: "recording-updated",
    recordingId: RecordingId,
    action: "deleted" | "updated",
    newClassification?: string,
    oldClassification?: string,
  ): void;
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

const nextVisit = computed<ApiStaticVisitResponse | null>(() => {
  return (
    (currentVisitIndex.value !== null &&
      visitsContext.value &&
      currentVisitIndex.value !== 0 &&
      (visitsContext.value as ApiStaticVisitResponse[])[
        currentVisitIndex.value - 1
      ]) ||
    null
  );
});

const previousVisit = computed<ApiStaticVisitResponse | null>(() => {
  return (
    (currentVisitIndex.value !== null &&
      visitsContext.value &&
      (currentVisitIndex.value as number) <
        (visitsContext.value as ApiStaticVisitResponse[]).length &&
      (visitsContext.value as ApiStaticVisitResponse[])[
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
      visitsContext.value as ApiStaticVisitResponse[]
    ).indexOf(selectedVisit.value as ApiStaticVisitResponse);
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
    return gotoVisit(selectedVisit.value as ApiStaticVisitResponse, true);
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

const gotoVisit = async (
  visit: ApiStaticVisitResponse,
  startOfVisit: boolean,
) => {
  let recId;
  if (!startOfVisit) {
    recId = visit.recordingIds[visit.recordingIds.length - 1];
  } else {
    recId = visit.recordingIds[0];
  }
  const recordingIds = visit.recordingIds.join(",");
  const params: RouteParams = {
    ...route.params,
    currentRecordingId: recId.toString(),
    recordingIds,
  };
  const visitLabel = visitClassificationLabel(visit);
  if (visitLabel) {
    params.visitLabel = visitLabel;
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
    return gotoVisit(selectedVisit.value as ApiStaticVisitResponse, false);
  }
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
          emit(
            "recording-updated",
            recording.value.id,
            "updated",
            tag,
            changedTag.what,
          );
        } else {
          console.error("Failed to find changed tag", tag);
        }
        if (trackToPatch.id === -1) {
          await selectedTrack(-1, true);
        }
      } else if (action === "remove") {
        emit(
          "recording-updated",
          recording.value.id,
          "updated",
          undefined,
          tag,
        );
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

const inTextEditMode = ref<boolean>(false);
const textEditModeChanged = (enabled: boolean) => {
  inTextEditMode.value = enabled;
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
  // Reset scroll offset when new recording loads
  document.documentElement.style.setProperty("--scroll-y-offset", `0px`);
  if (currentRecordingId.value) {
    // Load the current recording, and then preload the next and previous recordings.
    // This behaviour will differ depending on whether we're viewing raw recordings or visits.
    recording.value = null;
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
  let date;
  const now = new Date();
  if (selectedVisit.value) {
    date = DateTime.fromISO(selectedVisit.value.startTime);
  } else {
    //date = DateTime.fromJSDate(new Date());
  }
  if (date && locationContext && locationContext.value) {
    const zone = timezoneForLatLng(locationContext.value);
    date = date.setZone(zone);
  }
  let dateString = "";
  if (date) {
    if (date.year != now.getFullYear()) {
      dateString = `${date.toFormat("d MMM yy")}, `;
    } else {
      dateString = `${date.toFormat("d MMM")}, `;
    }
  }
  if (!isMobileView.value) {
    dateString = "";
  }
  if (selectedVisit.value && locationContext && locationContext.value) {
    const visit = selectedVisit.value as ApiStaticVisitResponse;
    const duration = visitDuration(visit, !!isDesktop.value);
    let visitStart = timeAtLocation(visit.startTime, locationContext.value);
    const visitEnd = timeAtLocation(visit.endTime, locationContext.value);
    if (visitStart === visitEnd) {
      return `${dateString}${visitStart} (${duration})`;
    }
    if (visitStart.slice(-2) === visitEnd.slice(-2)) {
      // If visitStart has the same suffix as visitEnd, omit it.
      visitStart = visitStart.replace(/ am/i, "").replace(/ pm/i, "");
    }
    return `${dateString}${visitStart}&ndash;${visitEnd} (${duration})`;
  }
  return `${dateString.replace(", ", "")}`;
});

const recordingDurationString = computed<string>(() => {
  let date;
  const now = new Date();
  if (recording.value) {
    date = DateTime.fromJSDate(new Date(recording.value.recordingDateTime));
  } else {
    //date = DateTime.fromJSDate(now);
  }

  if (date && recording.value && locationContext && locationContext.value) {
    const zone = timezoneForLatLng(
      recording.value.location || locationContext.value,
    );
    date = date.setZone(zone);
  }
  let dateString = "";
  if (date) {
    if (date.year != now.getFullYear()) {
      dateString = `${date.toFormat("d MMM yy")}, `;
    } else {
      dateString = `${date.toFormat("d MMM")}, `;
    }
  }
  if (!isMobileView.value) {
    dateString = "";
  }
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
      return `${dateString}${visitStart} (${duration})`;
    }
    if (visitStart.slice(-2) === visitEnd.slice(-2)) {
      // If visitStart has the same suffix as visitEnd, omit it.
      visitStart = visitStart.replace(/ am/i, "").replace(/ pm/i, "");
    }
    return `${dateString}${visitStart}&ndash;${visitEnd} (${duration})`;
  }
  return "&nbsp;";
});

const isDesktop = useMediaQuery("(min-width: 992px)");
const isMobileView = computed<boolean>(() => {
  return !isDesktop.value;
});

watch(isMobileView, async (next, prev) => {
  if (!next) {
    document.documentElement.style.setProperty("--scroll-y-offset", `0px`);
    if (((route.name || "") as string).endsWith("info")) {
      // Redirect
      const routeName = (route.name as string).replace("info", "tracks");
      await router.push({
        ...route,
        name: routeName as string,
      } as RouteLocationRaw);
    }
  }
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
    const mimeType =
      downloadedFileResponse.headers.get("Content-Type") ||
      "application/octet-stream";
    const downloadSize =
      Number(downloadedFileResponse.headers.get("X-Fallback-Content-Length")) ||
      0;
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

const deleteRecording = async () => {
  if (recording.value) {
    const recordingIdToDelete = recording.value.id;
    const deleteResponse =
      await ClientApi.Recordings.deleteRecording(recordingIdToDelete);
    if (deleteResponse.success) {
      if (isInVisitContext.value) {
        emit("recording-updated", recordingIdToDelete, "deleted");
      } else {
        const targetRecording = (loadedRecordings.value || []).find(
          (rec) => rec.id === recordingIdToDelete,
        );
        if (targetRecording) {
          (targetRecording as MaybeDeletedRecording).tombstoned = true;
        }
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
          console.log("No recordings to advance to, close modal automatically");
          emit("close");
        }
      }
    }
  }
};
const inlineModal = ref<boolean>(false);
const onScroll = (e: Event) => {
  // So, when we make the player smaller, we're also *reducing* the scrollTop amount again.
  const scrollTop = (e.target as HTMLElement).scrollTop;
  if (playerContainer.value) {
    document.documentElement.style.setProperty(
      "--scroll-y-offset",
      `${Math.max(0, scrollTop).toString()}px`,
    );
  }
};

const locationName = (
  visitOrRecording: ApiStaticVisitResponse | ApiRecordingResponse,
): string => {
  if ("stationName" in visitOrRecording) {
    return visitOrRecording.stationName || "";
  } else if ("locationName" in visitOrRecording) {
    return visitOrRecording.locationName;
  }
  return "";
};
</script>
<template>
  <div
    class="recording-view d-flex flex-column"
    data-cy="recording view"
    :class="{
      'recording-type-audio':
        recordingType && recordingType === RecordingType.Audio,
    }"
  >
    <div v-if="inlineModal" class="dimmed">
      <b-modal v-model="inlineModal" no-backdrop no-footer no-header centered>
        <div
          class="inline-modal"
          id="recording-status-modal"
          ref="inlineModalEl"
        />
      </b-modal>
    </div>
    <header
      class="recording-view-header d-flex align-items-center justify-content-between ps-sm-3 pe-0 pe-sm-1 ps-2 py-sm-2"
    >
      <div v-if="isInVisitContext" class="overflow-hidden w-100">
        <span
          class="recording-header-type w-100 fs-6 align-items-center d-inline-flex"
          ><span class="fw-medium me-2">Visit</span
          ><location-name
            :icon-size="0.85"
            class="text-secondary"
            truncate
            v-if="isMobileView && (selectedVisit || recording)"
            :name="
              locationName(
                (selectedVisit as ApiStaticVisitResponse) ||
                  (recording as ApiRecordingResponse),
              )
            "
        /></span>
        <div
          class="recording-header-details d-flex align-items-baseline mb-1 mb-sm-0"
        >
          <span
            class="recording-header-label fw-semibold text-capitalize"
            data-cy="recording visit classification"
            >{{ displayLabelForClassificationLabel(visitLabel) }}</span
          >
          <span
            v-if="isInGreaterVisitContext"
            data-cy="visit duration"
            v-html="visitDurationString"
            class="recording-header-time ms-2 ms-sm-2 text-secondary"
          />
          <span
            v-else
            data-cy="visit duration"
            class="recording-header-time ms-2 ms-sm-2 text-secondary"
            v-html="visitDurationString"
          ></span>
        </div>
      </div>
      <div v-else class="overflow-hidden w-100">
        <span
          class="recording-header-type w-100 fs-6 align-items-center d-inline-flex"
        >
          <span
            class="fw-medium me-2 text-nowrap"
            v-if="recordingType && recordingType === RecordingType.ThermalRaw"
            >Thermal Recording</span
          >
          <span
            class="fw-medium me-2 text-nowrap"
            v-else-if="recordingType && recordingType === RecordingType.Audio"
            >Audio recording</span
          >
          <location-name
            class="text-secondary"
            :icon-size="0.85"
            truncate
            v-if="isMobileView && recording"
            :name="recording.stationName || ''"
          />
        </span>
        <div class="recording-header-details mb-1 mb-sm-0">
          <span
            v-html="recordingDurationString"
            class="recording-header-time text-muted"
          />
        </div>
      </div>
      <button
        data-cy="close recording view"
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
        >
          <cptv-player
            :recording="recording as ApiRecordingResponse"
            :in-text-edit-mode="inTextEditMode"
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
            @request-next-recording="gotoNextRecordingOrVisit"
            @request-prev-recording="gotoPreviousRecordingOrVisit"
            @request-next-visit="gotoNextVisit"
            @request-prev-visit="gotoPreviousVisit"
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
          class="sticky-top recording-tabs-mobile"
        />
        <div
          class="recording-info d-flex flex-column flex-fill"
          :class="{
            'overflow-hidden':
              isDesktop && recordingType === RecordingType.ThermalRaw,
          }"
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
              @text-edit-mode-change="textEditModeChanged"
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
            data-cy="goto previous recording or visit"
            type="button"
            class="btn btn-icon d-flex d-md-none flex-row-reverse align-items-center position-relative"
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
          <b-tooltip
            placement="bottom"
            teleport-to="body"
            :delay="{ show: 1000, hide: 100 }"
            v-if="isInGreaterVisitContext && hasPreviousVisit"
          >
            <template #target>
              <button
                type="button"
                data-cy="goto previous visit"
                class="btn d-none d-md-flex flex-row-reverse align-items-center position-relative"
                :disabled="!hasPreviousVisit"
                @click.prevent="gotoPreviousVisit"
              >
                <span
                  class="d-none d-md-flex ps-2 flex-column align-items-start"
                >
                  <span class="fs-6 text-body-secondary"
                    >Prev<span class="d-none d-lg-inline">ious</span>
                    visit</span
                  >
                  <span
                    v-if="previousVisit"
                    class="text-capitalize fw-medium fs-6"
                  >
                    {{
                      displayLabelForClassificationLabel(
                        visitClassificationLabel(previousVisit),
                      ) || "none"
                    }}
                  </span>
                </span>
                <material-symbol
                  name="keyboard_double_arrow_left"
                  size="1.25rem"
                  class="me-1"
                />
              </button>
            </template>
            alt + shift + left arrow
          </b-tooltip>
          <!-- Desktop only button, advances through recordings -->
          <b-tooltip
            placement="bottom"
            teleport-to="body"
            :delay="{ show: 1000, hide: 100 }"
            v-if="hasPreviousRecording"
          >
            <template #target>
              <button
                data-cy="goto previous recording"
                type="button"
                class="btn d-none d-md-flex flex-row-reverse align-items-center position-relative"
                @click.prevent="gotoPreviousRecording"
              >
                <span
                  class="d-none d-md-flex ps-2 flex-column align-items-start"
                >
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
            </template>
            alt + left arrow
          </b-tooltip>
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
          <b-tooltip
            placement="bottom"
            teleport-to="body"
            :delay="{ show: 1000, hide: 100 }"
            v-if="hasNextRecording"
          >
            <!-- Desktop only button, advances through recordings -->
            <template #target>
              <button
                data-cy="goto next recording"
                type="button"
                class="btn d-none d-md-flex align-items-center position-relative"
                @click.prevent="gotoNextRecording"
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
            </template>
            alt + right arrow
          </b-tooltip>
          <b-tooltip
            placement="bottom"
            teleport-to="body"
            :delay="{ show: 1000, hide: 100 }"
            v-if="isInGreaterVisitContext && hasNextVisit"
          >
            <!-- Desktop only button, advances through visits -->
            <template #target>
              <button
                data-cy="goto next visit"
                type="button"
                class="btn d-none d-md-flex align-items-center position-relative"
                :disabled="!hasNextVisit"
                @click.prevent="gotoNextVisit"
              >
                <span class="d-none d-sm-flex pe-2 flex-column align-items-end">
                  <span class="fs-6 text-body-secondary">Next visit</span>
                  <span v-if="nextVisit" class="text-capitalize fw-medium fs-6">
                    {{
                      displayLabelForClassificationLabel(
                        visitClassificationLabel(nextVisit),
                      ) || "none"
                    }}
                  </span>
                </span>
                <material-symbol
                  name="keyboard_double_arrow_right"
                  size="1.25rem"
                  class="ms-1"
                />
              </button>
            </template>
            alt + shift + right arrow
          </b-tooltip>
          <!-- Mobile only button without labels, advances through recordings and visits -->
          <button
            type="button"
            class="btn btn-icon d-flex d-md-none align-items-center"
            :disabled="!hasNextRecording && !hasNextVisit"
            @click.prevent="gotoNextRecordingOrVisit"
            data-cy="goto next recording or visit"
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
  //--modal-width: calc(min(calc(100svw - 20px), 400px));
  //width: var(--modal-width);
  //height: auto;
  //max-height: calc(100svh - 30px);
  //position: absolute;
  //overflow-y: auto;
  //top: 40%;
  //left: calc(50% - (var(--modal-width) / 2));
  //background: var(--bs-white);
  //z-index: 2000;
  //border-radius: var(--bs-border-radius);
  //.standard-shadow();
}

.dimmed {
  user-select: none;
  // FIXME: This breaks at certain breakpoints because they are position fixed.
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  right: 0;
  z-index: 2400;
  background: rgba(0, 0, 0, 0.2);
}
</style>

<style lang="less">
@import "../assets/less/breakpoints.less";

.player-and-tagging {
  overscroll-behavior-y: none;
  .video-container {
    height: var(--video-container-height);

    @media screen and (min-width: @breakpoint-lg) and (max-width: @breakpoint-lg-max) {
      max-width: 576px;
      max-height: 432px;
    }
  }
}
.player-container {
  margin-bottom: min(var(--min-player-height), var(--scroll-y-offset));
}
:root {
  --scroll-y-offset: 0px;
  --num-unique-y-slots: 0;
  --min-player-height: 150px;
  --max-player-height: min(480px, 75svw);
  @media screen and (min-width: @breakpoint-lg) and (max-width: @breakpoint-lg-max) {
    --max-player-height: min(432px, 75svw);
  }
  --max-scroll-y-offset: calc(
    var(--max-player-height) - var(--min-player-height)
  );
  // Shrink amount should be in the range 0..1
  --scroll-ratio: calc(var(--scroll-y-offset) / var(--max-scroll-y-offset));
  --shrink-amount: 1;
  //calc(
  //    min(
  //        1,
  //        max(
  //            0,
  //            var(--scroll-ratio)
  //        )
  //    )
  //);
  //--shrink-amount: calc(min(1, max(0, calc(0))));
  //--track-height: calc(7px - calc(4px * var(--shrink-amount)));
  //--track-height: calc(3px + calc(10px / var(--num-unique-y-slots) * 0.5));
  --track-height: min(7px, calc(3px + calc(10px / var(--num-unique-y-slots))));
  --min-height-for-tracks: 44px;
  --player-chrome-height: 44px;
  --height-for-tracks: calc(
    max(
      var(--min-height-for-tracks),
      calc(var(--track-height, 0px) * calc(var(--num-unique-y-slots) + 4))
    )
  );
  --video-container-height: calc(
    min(
      var(--max-player-height),
      max(
        var(--min-player-height),
        calc(var(--max-player-height) - var(--scroll-y-offset))
      )
    )
  );
}
.recording-tabs-mobile {
  top: calc(
    var(--video-container-height) + var(--height-for-tracks) +
      var(--player-chrome-height)
  );
}
</style>
