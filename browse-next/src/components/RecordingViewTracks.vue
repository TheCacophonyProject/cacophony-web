<script setup lang="ts">
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import type {
  ApiAutomaticTrackTagResponse,
  ApiHumanTrackTagResponse,
} from "@typedefs/api/trackTag";

// eslint-disable-next-line vue/no-setup-props-destructure
const { recording } = defineProps<{
  recording?: ApiRecordingResponse;
}>();

const calculatedTagClassification = (
  tags: (ApiHumanTrackTagResponse | ApiAutomaticTrackTagResponse)[]
): string => {
  return tags[0].what;
};
</script>
<template>
  <div v-if="recording">
    <div v-for="(track, index) in recording.tracks" :key="index">
      <span class="track-number">{{ index + 1 }}</span>
      <span class="classification">{{
        calculatedTagClassification(track.tags)
      }}</span>
    </div>
  </div>
</template>

<style scoped></style>
