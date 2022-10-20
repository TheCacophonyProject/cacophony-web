<script setup lang="ts">
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import TrackTaggerRow from "@/components/TrackTaggerRow.vue";
import { TagColours } from "@/consts";
import { onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import type { ApiTrackResponse } from "@typedefs/api/track";
import type { TrackId } from "@typedefs/api/common";
import { replaceTrackTag } from "@api/Recording";
const route = useRoute();
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
      currentTrack.value = getTrackById(Number(route.params.trackId));
    }
  }
);

onMounted(() => {
  cloneLocalTracks(recording?.tracks || []);
  if (route.params.trackId) {
    currentTrack.value = getTrackById(Number(route.params.trackId));
  }
});

const expandedTrackId = ref<TrackId>(-1);
const expandedItemChanged = (trackId: TrackId) => {
  expandedTrackId.value = trackId;
};

const selectedTrackAtIndex = (trackId: TrackId) => {
  if (trackId !== Number(route.params.trackId)) {
    const track = getTrackById(trackId);
    if (track) {
      // Change track.
      emit("track-selected", { trackId });
    }
  }
};

const addUserTag = async ({
  tag,
  trackId,
}: {
  tag: string;
  trackId: TrackId;
}) => {
  if (recording) {
    // TODO: Update local mutable tags store.

    await replaceTrackTag(
      {
        what: tag,
        confidence: 0.85,
      },
      recording.id,
      trackId
    );

    // TODO emit trackTagChanged, maybe trigger visit recalculation.
  }
};

const recordingTracksLocal = ref<ApiTrackResponse[]>([]);

// eslint-disable-next-line vue/no-setup-props-destructure
</script>
<template>
  <div v-if="recording">
    <track-tagger-row
      v-for="(track, index) in recordingTracksLocal"
      :key="index"
      :index="index"
      @expanded-changed="expandedItemChanged"
      @selected-track-at-index="selectedTrackAtIndex"
      @add-user-tag="addUserTag"
      :selected="(currentTrack && currentTrack.id === track.id) || false"
      :expanded-id="expandedTrackId"
      :color="TagColours[index % TagColours.length]"
      :track="track"
    />
  </div>
</template>
