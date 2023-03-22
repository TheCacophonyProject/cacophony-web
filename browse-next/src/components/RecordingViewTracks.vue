<script setup lang="ts">
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import TrackTaggerRow from "@/components/TrackTaggerRow.vue";
import { TagColours } from "@/consts";
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { ApiTrackResponse } from "@typedefs/api/track";
import type { TrackId, TrackTagId } from "@typedefs/api/common";
import { removeTrackTag, replaceTrackTag } from "@api/Recording";
import { CurrentUser } from "@models/LoggedInUser";
import type { ApiHumanTrackTagResponse } from "@typedefs/api/trackTag";
import {getPathForLabel} from "@api/Classifications";
const route = useRoute();
const router = useRouter();
const { recording } = defineProps<{
  recording?: ApiRecordingResponse | null;
}>();

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
  if (recording && CurrentUser.value && !updatingTags.value) {
    updatingTags.value = true;
    // Remove the current user tag from recordingTracksLocal
    const track = recordingTracksLocal.value.find(
      (track) => track.id === trackId
    );
    if (track) {
      const thisUserTag = track.tags.find(
        (tag) => tag.userId === CurrentUser.value?.id
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
            (tag) => tag.what === thisUserTag.what
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
          (existingTag) => existingTag.what === tag
        );
        // We are adding or replacing the current tag.
        const interimTag: ApiHumanTrackTagResponse = {
          trackId,
          id: -1,
          what: tag,
          path: getPathForLabel(tag),
          userId: CurrentUser.value?.id,
          userName: CurrentUser.value?.userName,
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
  if (recording && CurrentUser.value && !updatingTags.value) {
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
