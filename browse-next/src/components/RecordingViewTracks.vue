<script setup lang="ts">
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import TrackTaggerRow from "@/components/TrackTaggerRow.vue";
import { TagColours } from "@/consts";
// eslint-disable-next-line vue/no-setup-props-destructure
const { recording } = defineProps<{
  recording?: ApiRecordingResponse;
}>();
</script>
<template>
  <div v-if="recording">
    <track-tagger-row
      v-for="(track, index) in recording.tracks"
      :key="index"
      :index="index"
      :color="TagColours[index % recording.tracks.length]"
      :track="track"
    />
  </div>
</template>
