<script setup lang="ts">
import type {
  ApiRecordingResponse,
  ApiThermalRecordingResponse,
} from "@typedefs/api/recording";
import TrackTaggerRow from "@/components/TrackTaggerRow.vue";
import { TagColours } from "@/consts";
import {
  computed,
  type ComputedRef,
  inject,
  onBeforeMount,
  onMounted,
  type Ref,
  ref,
  watch,
} from "vue";
import { type RouteLocationRaw, useRoute, useRouter } from "vue-router";
import type {
  ApiTrackDataRequest,
  ApiTrackResponse,
} from "@typedefs/api/track";
import type { TrackId, TrackTagId } from "@typedefs/api/common";
import {
  addRecordingLabel,
  createDummyTrack,
  deleteTrack,
  removeTrackTag,
  replaceTrackTag,
} from "@api/Recording";
import {
  type LoggedInUser,
  persistUserProjectSettings,
  type SelectedProject,
} from "@models/LoggedInUser";
import type {
  ApiHumanTrackTagResponse,
  ApiTrackTag,
  ApiTrackTagResponse,
  TrackTagData,
} from "@typedefs/api/trackTag";
import {
  displayLabelForClassificationLabel,
  getPathForLabel,
} from "@api/Classifications";
import {
  currentSelectedProject as currentActiveProject,
  currentUser as currentUserInfo,
} from "@models/provides";
import {
  RecordingProcessingState,
  RecordingType,
} from "@typedefs/api/consts.ts";
import type { ApiRecordingTagResponse } from "@typedefs/api/tag";
import type { ApiGroupUserSettings as ApiProjectUserSettings } from "@typedefs/api/group";

const route = useRoute();
const router = useRouter();
const props = withDefaults(
  defineProps<{
    recording?: ApiRecordingResponse | null;
  }>(),
  { recording: null },
);

const prevRecordingType = ref<RecordingType | null>(null);

const recordingType = computed<null | RecordingType>(() => {
  if (props.recording) {
    return props.recording.type;
  } else if (prevRecordingType.value) {
    return prevRecordingType.value;
  }
  return null;
});

const currentUser = inject(currentUserInfo) as Ref<LoggedInUser>;

const currentTrack = ref<ApiTrackResponse | null>(null);

const emit = defineEmits<{
  (
    e: "track-tag-changed",
    payload: { track: ApiTrackResponse; tag: string; action: "add" | "remove" },
  ): void;
  (
    e: "track-selected",
    track: { trackId: TrackId; automatically: boolean },
  ): void;
  (e: "track-removed", track: { trackId: TrackId }): void;
  (e: "added-recording-label", label: ApiRecordingTagResponse): void;
  (e: "delete-recording"): void;
}>();

const getTrackById = (trackId: TrackId): ApiTrackResponse | null => {
  return props.recording?.tracks.find(({ id }) => id == trackId) || null;
};

const currentTrackId = computed(() => Number(route.params.trackId));

watch(
  () => route.params.trackId,
  (nextTrackId) => {
    currentTrack.value = getTrackById(Number(nextTrackId));
  },
);

const showFalseTriggers = ref<boolean>(false);

const currentProject = inject(currentActiveProject) as ComputedRef<
  SelectedProject | false
>;
const userProjectSettings = computed<ApiProjectUserSettings>(() => {
  return (
    (currentProject.value as SelectedProject).userSettings || {
      displayMode: "visits",
      tags: [],
      notificationPreferences: {},
    }
  );
});

const savingFalseTriggerSettings = ref<boolean>(false);
const initialised = ref<boolean>(false);
const loadDateTime = ref<Date>(new Date());
onBeforeMount(() => {
  showFalseTriggers.value =
    userProjectSettings.value.showFalseTriggers || false;
});

watch(showFalseTriggers, async (next) => {
  if (initialised.value) {
    const settings = JSON.parse(JSON.stringify(userProjectSettings.value));
    settings.showFalseTriggers = next;
    savingFalseTriggerSettings.value = true;
    await persistUserProjectSettings(settings);
    savingFalseTriggerSettings.value = false;
  }
});

const cloneLocalTracks = (tracks: ApiTrackResponse[]) => {
  // NOTE: If there's no tracks on a recording, we can create a dummy one, which can be added
  //  via the API as soon as there is a user tag present.
  if (props.recording) {
    if (
      tracks.length === 0 &&
      props.recording.processingState !== RecordingProcessingState.Tracking
    ) {
      recordingTracksLocal.value = [
        {
          id: -1,
          start: 0,
          end: props.recording.duration || 0,
          tags: [],
          filtered: false,
        },
      ];
      expandedItemChanged(-1, true);
    } else {
      // Local mutable copy of tracks + tags for when we update things.
      recordingTracksLocal.value = tracks.map((track) => ({
        id: track.id,
        end: track.end,
        start: track.start,
        tags: JSON.parse(JSON.stringify(track.tags)),
        filtered: track.filtered,
      }));
    }
  }
};

watch(
  () => props.recording?.tracks,
  (nextTracks) => {
    cloneLocalTracks(nextTracks || []);
  },
  { deep: true },
);

watch(
  () => props.recording,
  (nextRecording) => {
    cloneLocalTracks(nextRecording?.tracks || []);

    if (nextRecording) {
      prevRecordingType.value = nextRecording.type;
      if (route.params.trackId) {
        currentTrack.value = getTrackById(currentTrackId.value);
      } else if (
        recordingTracksPossiblyFiltered.value.length !== 0 &&
        nextRecording.type !== RecordingType.Audio
      ) {
        emit("track-selected", {
          trackId: recordingTracksPossiblyFiltered.value[0].id,
          automatically: true,
        });
      }
    }
  },
);

onMounted(() => {
  cloneLocalTracks(props.recording?.tracks || []);
  if (route.params.trackId) {
    currentTrack.value = getTrackById(currentTrackId.value);
  } else if (recordingTracksPossiblyFiltered.value.length !== 0) {
    emit("track-selected", {
      trackId: recordingTracksPossiblyFiltered.value[0].id,
      automatically: true,
    });
  }
  initialised.value = true;
});

const expandedItemChanged = async (trackId: TrackId, expanded: boolean) => {
  const params = { ...route.params, trackId, detail: "detail" };
  if (!expanded) {
    delete (params as Record<string, string | number>).detail;
  }
  await router.replace({
    ...route,
    params,
  } as RouteLocationRaw);
  if (expanded) {
    // Select and play the track.
    const track = getTrackById(trackId);
    if (track) {
      // Change track.
      emit("track-selected", { trackId, automatically: false });
    }
  }
};

const selectedTrack = (trackId: TrackId, forceReplay = false) => {
  if (trackId !== currentTrackId.value || forceReplay) {
    const track = getTrackById(trackId);
    if (track) {
      // Change track.
      emit("track-selected", { trackId, automatically: false });
    }
  }
};

const removedTrack = async ({ trackId }: { trackId: TrackId }) => {
  if (props.recording) {
    const response = await deleteTrack(props.recording, trackId);
    if (response.success) {
      emit("track-removed", { trackId });
    }
  }
};

const updatingTags = ref<boolean>(false);

const groupSettingsRedactHumanSpeech = computed<boolean>(() => {
  if (currentProject.value) {
    return currentProject.value.settings?.filterHuman || false;
  }
  return false;
});

const mapTrack = (track: ApiTrackResponse): ApiTrackDataRequest => {
  const mappedTrack: ApiTrackDataRequest = {
    end_s: track.end,
    start_s: track.start,
    positions: track.positions,
    automatic: false,
  };
  return mappedTrack as ApiTrackDataRequest;
};
const addOrRemoveUserTag = async ({
  tag,
  trackId,
}: {
  tag: string;
  trackId: TrackId;
}) => {
  if (props.recording && currentUser.value && !updatingTags.value) {
    updatingTags.value = true;
    // Remove the current user tag from recordingTracksLocal
    const track = recordingTracksLocal.value.find(
      (track) => track.id === trackId,
    );
    let trackWasCreated = false;
    let willDeleteRecording = false;
    if (track) {
      if (track.id === -1) {
        // This is a dummy track and needs to be created via the API before we can actually tag it.
        const dummyTrack = mapTrack(track);
        const positions = [];
        if (props.recording.type === RecordingType.TrailCamImage) {
          positions.push({
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            order: 0,
          });
        } else if (props.recording.type === RecordingType.ThermalRaw) {
          const recording = props.recording as ApiThermalRecordingResponse;
          if (!recording.tags.some((tag) => tag.detail === "missed track")) {
            // If we're adding a dummy track to a thermal recording, also add the "missed track" tag.
            addRecordingLabel(recording.id, "missed track").then(
              (labelResponse) => {
                if (labelResponse.success) {
                  emit("added-recording-label", {
                    id: labelResponse.result.tagId,
                    detail: "Missed track",
                    createdAt: new Date().toISOString(),
                    confidence: 0.9,
                  });
                }
              },
            );
          }
          const numFrames = Math.floor(
            recording.additionalMetadata?.totalFrames || recording.duration * 9,
          );
          for (let i = 0; i < numFrames; i++) {
            positions.push({
              x: 0,
              y: 0,
              width: 160,
              height: 120,
              order: i,
            });
          }
        }
        dummyTrack.positions = positions;
        track.positions = positions;
        const createdTrack = await createDummyTrack(
          props.recording,
          dummyTrack,
        );
        if (createdTrack.success) {
          track.id = createdTrack.result.trackId;
          trackId = track.id;
          trackWasCreated = true;
        } else {
          console.error("Failed creating dummy track");
        }
      }

      const thisUserTag = track.tags.find(
        (tag) => tag.userId === currentUser.value?.id,
      );
      track.tags = track.tags.filter((tag) => tag !== thisUserTag);
      if (thisUserTag && thisUserTag.what === tag) {
        // We are removing the current tag.
        const removeTagResponse = await removeTrackTag(
          props.recording.id,
          trackId,
          thisUserTag.id,
        );
        if (removeTagResponse.success) {
          const completelyRemoved = !track.tags.some(
            (tag) =>
              displayLabelForClassificationLabel(tag.what, tag.automatic) ===
              displayLabelForClassificationLabel(thisUserTag.what),
          );
          if (completelyRemoved) {
            emit("track-tag-changed", { track, tag, action: "remove" });
          }
        } else {
          // Add the tag back if failed
          track.tags.push(thisUserTag);
        }
      } else {
        const tagAlreadyExists = track.tags
          .filter((tag) => tag.userId === currentUser.value?.id)
          .some(
            (existingTag) =>
              displayLabelForClassificationLabel(
                existingTag.what,
                existingTag.automatic,
              ) === displayLabelForClassificationLabel(tag),
          );
        // We are adding or replacing the current tag.
        const interimTag: ApiHumanTrackTagResponse = {
          trackId,
          id: -1,
          what: tag,
          path: getPathForLabel(tag),
          userId: currentUser.value?.id,
          userName: currentUser.value?.userName,
          automatic: false,
          confidence: 0.85,
          model: null,
          createdAt: new Date().toISOString(),
        };
        track.tags.push(interimTag);


        if (tag === "human" && recordingType.value === RecordingType.Audio && groupSettingsRedactHumanSpeech.value) {
          // Offer to delete the recording, using built in confirmation because it's blocking and easy for this edge case.
          willDeleteRecording = confirm("Your project has been configured to delete recordings containing human speech. Do you want to delete this recording?");
        }
        if (willDeleteRecording) {
          // Do delete
          emit("delete-recording");
        } else {
          const newTagResponse = await replaceTrackTag(
              {
                what: tag,
                confidence: 0.85,
              },
              props.recording.id,
              trackId,
          );
          if (newTagResponse.success && newTagResponse.result.trackTagId) {
            interimTag.id = newTagResponse.result.trackTagId;
            if (!tagAlreadyExists) {
              emit("track-tag-changed", {track, tag, action: "add"});
            }
          } else {
            // Remove the interim tag
            track.tags.pop();
          }
        }
      }
    }
    if (trackWasCreated && !willDeleteRecording) {
      emit("track-selected", { trackId, automatically: false });
    }
    updatingTags.value = false;
  }
};

const removeTag = async ({
  trackTagId,
  trackId,
}: {
  trackTagId: TrackTagId;
  trackId: TrackId;
}) => {
  if (props.recording && currentUser.value && !updatingTags.value) {
    updatingTags.value = true;
    // Remove the current user tag from recordingTracksLocal
    const track = recordingTracksLocal.value.find(
      (track) => track.id === trackId,
    );
    if (track) {
      const targetTag = track.tags.find((tag) => tag.id === trackTagId);
      if (targetTag) {
        track.tags = track.tags.filter((tag) => tag !== targetTag);
        // We are removing the current tag.
        const removeTagResponse = await removeTrackTag(
          props.recording.id,
          trackId,
          targetTag.id,
        );
        if (removeTagResponse.success) {
          // Make sure there are no remaining tags with the same what:
          const completelyRemoved = !track.tags.some(
            (tag) => tag.what === targetTag.what,
          );
          if (completelyRemoved) {
            emit("track-tag-changed", {
              track,
              tag: targetTag.what,
              action: "remove",
            });
          }
        } else {
          // Add the tag back if failed
          track.tags.push(targetTag);
        }
      }
    }
    updatingTags.value = false;
  }
};

const recordingTracksLocal = ref<ApiTrackResponse[]>([]);
const recordingTracksPossiblyFiltered = computed<ApiTrackResponse[]>(() => {
  if (!showFalseTriggers.value) {
    return recordingTracksLocal.value.filter((track) => {
      const userTags = track.tags.filter((tag) => !tag.automatic);
      const userHasNonFalseTriggerTags = userTags.some(
        (tag) => tag.what !== "false-positive" && tag.what !== "noise",
      );
      const userHasFalseTriggerTags = userTags.some(
        (tag) => tag.what === "false-positive" || tag.what === "noise",
      );
      if (userHasNonFalseTriggerTags) {
        return true;
      }
      const userFalseTrigger =
        userHasFalseTriggerTags && !userHasNonFalseTriggerTags;
      if (userFalseTrigger) {
        //If the track was just marked as false-positive by the user, keep it visible for now
        if (
          userTags.some(
            (tag) =>
              (tag.what === "false-positive" || tag.what === "noise") &&
              tag.createdAt &&
              new Date(tag.createdAt) > loadDateTime.value,
          )
        ) {
          return true;
        }
        return false;
      }
      // Handle multiple Master AI tags
      const aiMasterTags = track.tags.filter(
        (tag) => tag.automatic && tag.model === "Master",
      );
      return !(
        aiMasterTags.some(
          (tag) => tag.what === "false-positive" || tag.what === "noise",
        ) &&
        !aiMasterTags.some(
          (tag) => tag.what !== "false-positive" && tag.what !== "noise",
        )
      );
    });
  }
  return recordingTracksLocal.value;
});

const numFalseTriggers = computed<number>(() => {
  let falseTriggerCount = 0;
  for (const track of recordingTracksLocal.value) {
    const userTags = track.tags.filter((tag) => !tag.automatic);
    const userFalseTrigger =
      userTags.some(
        (tag) => tag.what === "false-positive" || tag.what === "noise",
      ) &&
      !userTags.some(
        (tag) => tag.what !== "false-positive" && tag.what !== "noise",
      );
    if (userFalseTrigger) {
      falseTriggerCount++;
      continue;
    }

    // Handle multiple Master AI tags
    const aiMasterTags = track.tags.filter(
      (tag) => tag.automatic && tag.model === "Master",
    );
    const aiNoiseOnly =
      aiMasterTags.some(
        (tag) => tag.what === "false-positive" || tag.what === "noise",
      ) &&
      !aiMasterTags.some(
        (tag) => tag.what !== "false-positive" && tag.what !== "noise",
      );

    if (aiNoiseOnly && !userTags.length) {
      falseTriggerCount++;
    }
  }
  return falseTriggerCount;
});
const recordingHasFalseTriggers = computed<boolean>(() => {
  return numFalseTriggers.value !== 0;
});
</script>
<template>
  <div
    v-if="
      recording &&
      recording.processingState === RecordingProcessingState.Tracking
    "
    class="d-flex justify-content-center align-items-center mt-3"
  >
    <div>
      <b-spinner variant="secondary" small class="me-2" />Track creation in
      progress.
    </div>
  </div>
  <div
    v-else-if="
      recording &&
      recording.processingState !== RecordingProcessingState.Tracking
    "
    class="accordion"
  >
    <div v-if="recordingHasFalseTriggers" class="p-2">
      <b-form-checkbox switch v-model="showFalseTriggers"
        ><span class="fs-7"
          >Show<span v-if="showFalseTriggers">ing</span> {{ numFalseTriggers }}
          <span v-if="!showFalseTriggers">hidden </span>
          <span v-if="recordingType !== RecordingType.Audio"
            >False Trigger<span v-if="numFalseTriggers !== 1">s</span></span
          >
          <span v-else
            >noise track<span v-if="numFalseTriggers !== 1">s</span></span
          > </span
        ><b-spinner
          class="ms-1"
          v-if="savingFalseTriggerSettings"
          variant="secondary"
          small
      /></b-form-checkbox>
    </div>
    <track-tagger-row
      v-for="(track, index) in recordingTracksPossiblyFiltered"
      :key="track.id"
      :index="index"
      :processing-state="recording.processingState"
      :is-audio-recording="recordingType === RecordingType.Audio"
      @expanded-changed="expandedItemChanged"
      @selected-track="selectedTrack"
      @removed-track="removedTrack"
      @add-or-remove-user-tag="addOrRemoveUserTag"
      @remove-tag="removeTag"
      :selected="
        (currentTrack && currentTrack.id === track.id) ||
        track.id === -1 ||
        false
      "
      :color="TagColours[index % TagColours.length]"
      :track="track"
    />
  </div>
  <div
    v-else
    class="d-flex justify-content-center align-items-center loading p-5 h-100"
  >
    <b-spinner variant="secondary" />
  </div>
</template>
