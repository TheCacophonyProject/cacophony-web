<script setup lang="ts">
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import TrackTaggerRow from "@/components/TrackTaggerRow.vue";
import { TagColours } from "@/consts";
import type { Ref } from "vue";
import { computed, inject, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { ApiTrackResponse } from "@typedefs/api/track";
import type { TrackId, TrackTagId } from "@typedefs/api/common";
import { removeTrackTag, replaceTrackTag } from "@api/Recording";
import type { LoggedInUser } from "@models/LoggedInUser";
import type { ApiHumanTrackTagResponse } from "@typedefs/api/trackTag";
import {
  displayLabelForClassificationLabel,
  getPathForLabel,
} from "@api/Classifications";
import { currentUser as currentUserInfo } from "@models/provides";
import { RecordingType } from "@typedefs/api/consts.ts";

const route = useRoute();
const router = useRouter();
const { recording } = defineProps<{
  recording?: ApiRecordingResponse | null;
}>();

// eslint-disable-next-line no-undef
const currentUser = inject(currentUserInfo) as Ref<LoggedInUser>;

const currentTrack = ref<ApiTrackResponse | null>(null);

const emit = defineEmits<{
  (
    e: "track-tag-changed",
    payload: { track: ApiTrackResponse; tag: string; action: "add" | "remove" }
  ): void;
  (
    e: "track-selected",
    track: { trackId: TrackId; automatically: boolean }
  ): void;
}>();

const getTrackById = (trackId: TrackId): ApiTrackResponse | null => {
  return recording?.tracks.find(({ id }) => id == trackId) || null;
};

const currentTrackId = computed(() => Number(route.params.trackId));

watch(
  () => route.params.trackId,
  (nextTrackId) => {
    currentTrack.value = getTrackById(Number(nextTrackId));
  }
);

const cloneLocalTracks = (tracks: ApiTrackResponse[]) => {
  // Local mutable copy of tracks + tags for when we update things.
  recordingTracksLocal.value = tracks.map((track) => ({
    id: track.id,
    end: track.end,
    start: track.start,
    automatic: track.automatic,
    tags: JSON.parse(JSON.stringify(track.tags)),
    filtered: track.filtered,
  }));
};

watch(
  () => recording,
  (nextRecording) => {
    cloneLocalTracks(nextRecording?.tracks || []);
    if (route.params.trackId) {
      currentTrack.value = getTrackById(currentTrackId.value);
    }
    if (nextRecording?.type === RecordingType.TrailCamImage) {
      // Select the only dummy track
      //currentTrack.value = getTrackById()
      expandedItemChanged(nextRecording.tracks[0].id, true);
    }
  }
);

onMounted(() => {
  cloneLocalTracks(recording?.tracks || []);
  if (route.params.trackId) {
    currentTrack.value = getTrackById(currentTrackId.value);
  }
});

const expandedItemChanged = async (trackId: TrackId, expanded: boolean) => {
  const params = { ...route.params, trackId, detail: "detail" };
  if (!expanded) {
    delete (params as Record<string, string | number>).detail;
  }
  await router.replace({
    ...route,
    params,
  });
  if (expanded) {
    // Select and play the track?
    const track = getTrackById(trackId);
    if (track) {
      // Change track.
      emit("track-selected", { trackId, automatically: false });
    }
  }
};

const selectedTrack = (trackId: TrackId) => {
  if (trackId !== currentTrackId.value) {
    const track = getTrackById(trackId);
    if (track) {
      // Change track.
      emit("track-selected", { trackId, automatically: false });
    }
  }
};

const updatingTags = ref<boolean>(false);
const addOrRemoveUserTag = async ({
  tag,
  trackId,
}: {
  tag: string;
  trackId: TrackId;
}) => {
  if (recording && currentUser.value && !updatingTags.value) {
    updatingTags.value = true;
    // Remove the current user tag from recordingTracksLocal
    const track = recordingTracksLocal.value.find(
      (track) => track.id === trackId
    );
    if (track) {
      const thisUserTag = track.tags.find(
        (tag) => tag.userId === currentUser.value?.id
      );
      track.tags = track.tags.filter((tag) => tag !== thisUserTag);
      if (thisUserTag && thisUserTag.what === tag) {
        // We are removing the current tag.
        const removeTagResponse = await removeTrackTag(
          recording.id,
          trackId,
          thisUserTag.id
        );
        if (removeTagResponse.success) {
          const completelyRemoved = !track.tags.some(
            (tag) =>
              displayLabelForClassificationLabel(tag.what, tag.automatic) ===
              displayLabelForClassificationLabel(thisUserTag.what)
          );
          if (completelyRemoved) {
            emit("track-tag-changed", { track, tag, action: "remove" });
          }
        } else {
          // Add the tag back if failed
          track.tags.push(thisUserTag);
        }
      } else {
        const tagAlreadyExists = track.tags.some(
          (existingTag) =>
            displayLabelForClassificationLabel(
              existingTag.what,
              existingTag.automatic
            ) === displayLabelForClassificationLabel(tag)
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
        };
        track.tags.push(interimTag);
        const newTagResponse = await replaceTrackTag(
          {
            what: tag,
            confidence: 0.85,
          },
          recording.id,
          trackId
        );
        if (newTagResponse.success && newTagResponse.result.trackTagId) {
          interimTag.id = newTagResponse.result.trackTagId;
          if (!tagAlreadyExists) {
            emit("track-tag-changed", { track, tag, action: "add" });
          }
        } else {
          // Remove the interim tag
          track.tags.pop();
        }
      }
    }
    cloneLocalTracks(recording.tracks);
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
  if (recording && currentUser.value && !updatingTags.value) {
    updatingTags.value = true;
    // Remove the current user tag from recordingTracksLocal
    const track = recordingTracksLocal.value.find(
      (track) => track.id === trackId
    );
    if (track) {
      const targetTag = track.tags.find((tag) => tag.id === trackTagId);
      if (targetTag) {
        track.tags = track.tags.filter((tag) => tag !== targetTag);
        // We are removing the current tag.
        const removeTagResponse = await removeTrackTag(
          recording.id,
          trackId,
          targetTag.id
        );
        if (removeTagResponse.success) {
          // Make sure there are no remaining tags with the same what:
          const completelyRemoved = !track.tags.some(
            (tag) => tag.what === targetTag.what
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

// FIXME - replace with b-accordion component.
</script>
<template>
  <div v-if="recording" class="accordion">
    <track-tagger-row
      v-for="(track, index) in recordingTracksLocal"
      :key="index"
      :index="index"
      @expanded-changed="expandedItemChanged"
      @selected-track="selectedTrack"
      @add-or-remove-user-tag="addOrRemoveUserTag"
      @remove-tag="removeTag"
      :selected="(currentTrack && currentTrack.id === track.id) || false"
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
