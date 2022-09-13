<script setup lang="ts">
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import TrackTaggerRow from "@/components/TrackTaggerRow.vue";
import { TagColours } from "@/consts";
import { ref, watch } from "vue";
import { useRoute } from "vue-router";
import type { ApiTrackResponse } from "@typedefs/api/track";
const route = useRoute();
const { recording } = defineProps<{
  recording?: ApiRecordingResponse;
}>();

const currentTrack = ref<ApiTrackResponse | null>(null);

watch(
  () => route.params.trackId,
  (nextTrackId) => {
    currentTrack.value =
      recording?.tracks.find(({ id }) => id == Number(nextTrackId)) || null;
  }
);

// eslint-disable-next-line vue/no-setup-props-destructure
</script>
<template>
  <div v-if="recording">
    <track-tagger-row
      v-for="(track, index) in recording.tracks"
      :key="index"
      :index="index"
      :selected="currentTrack && currentTrack.id === track.id"
      :color="TagColours[index % TagColours.length]"
      :track="track"
    />
  </div>
</template>
