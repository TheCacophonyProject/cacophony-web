<script setup lang="ts">
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import TrackTaggerRow from "@/components/TrackTaggerRow.vue";
import { TagColours } from "@/consts";
import { onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import type { ApiTrackResponse } from "@typedefs/api/track";
import type { TrackId } from "@typedefs/api/common";
const route = useRoute();
// eslint-disable-next-line vue/no-setup-props-destructure
const { recording } = defineProps<{
  recording?: ApiRecordingResponse;
}>();

const currentTrack = ref<ApiTrackResponse | null>(null);

const getTrackById = (trackId: TrackId): ApiTrackResponse | null => {
  return recording?.tracks.find(({ id }) => id == trackId) || null;
};

watch(
  () => route.params.trackId,
  (nextTrackId) => {
    currentTrack.value = getTrackById(Number(nextTrackId));
  }
);

watch(
  () => recording,
  () => {
    if (route.params.trackId) {
      currentTrack.value = getTrackById(Number(route.params.trackId));
    }
  }
);

onMounted(() => {
  if (route.params.trackId) {
    currentTrack.value = getTrackById(Number(route.params.trackId));
  }
});

const expandedItemIndex = ref<number>(-1);
const expandedItemChanged = (index: number) => {
  expandedItemIndex.value = index;
};

// eslint-disable-next-line vue/no-setup-props-destructure
</script>
<template>
  <div v-if="recording">
    <track-tagger-row
      v-for="(track, index) in recording.tracks"
      :key="index"
      :index="index"
      @expanded-changed="expandedItemChanged"
      :selected="(currentTrack && currentTrack.id === track.id) || false"
      :expanded-index="expandedItemIndex"
      :color="TagColours[index % TagColours.length]"
      :track="track"
    />
  </div>
</template>
