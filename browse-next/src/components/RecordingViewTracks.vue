<script setup lang="ts">
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import TrackTaggerRow from "@/components/TrackTaggerRow.vue";
import { TagColours } from "@/consts";
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { ApiTrackResponse } from "@typedefs/api/track";
import type { TrackId } from "@typedefs/api/common";
import { removeTrackTag, replaceTrackTag } from "@api/Recording";
import { CurrentUser } from "@models/LoggedInUser";
import type { ApiHumanTrackTagResponse } from "@typedefs/api/trackTag";
const route = useRoute();
const router = useRouter();
// eslint-disable-next-line vue/no-setup-props-destructure
const { recording } = defineProps<{
  recording?: ApiRecordingResponse;
}>();

const currentTrack = ref<ApiTrackResponse | null>(null);

const emit = defineEmits<{
  (e: "track-tag-changed", trackId: TrackId): void; // TODO
  (e: "track-selected", track: { trackId: TrackId }): void;
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

const expandedItemChanged = (trackId: TrackId, expanded: boolean) => {
  const params = { ...route.params, trackId, detail: "detail" };
  if (!expanded) {
    delete (params as Record<string, string | number>).detail;
  }
  router.replace({
    ...route,
    params,
  });
};

const selectedTrack = (trackId: TrackId) => {
  if (trackId !== currentTrackId.value) {
    const track = getTrackById(trackId);
    if (track) {
      // Change track.
      emit("track-selected", { trackId });
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
      track.tags = track.tags.filter(
        (tag) => tag.userId !== CurrentUser.value?.id
      );
      if (thisUserTag && thisUserTag.what === tag) {
        // We are removing the current tag.
        await removeTrackTag(recording.id, trackId, thisUserTag.id);
      } else {
        // We are adding or replacing the current tag.
        const interimTag: ApiHumanTrackTagResponse = {
          trackId,
          id: -1,
          what: tag,
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
        }
      }
      // TODO emit trackTagChanged, maybe trigger visit recalculation.
    }
    updatingTags.value = false;

    // FIXME - Emit the local changes to tracks to the parent recording view, so that video overlays etc are updated.
    // Also should reload the dashboard level stuff any time a tag changes.
  }
};

const recordingTracksLocal = ref<ApiTrackResponse[]>([]);

// eslint-disable-next-line vue/no-setup-props-destructure

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
      :selected="(currentTrack && currentTrack.id === track.id) || false"
      :color="TagColours[index % TagColours.length]"
      :track="track"
    />
  </div>
</template>
