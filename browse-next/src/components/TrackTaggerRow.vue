<script setup lang="ts">
import type { ApiTrackResponse } from "@typedefs/api/track";
import type {
  ApiAutomaticTrackTagResponse,
  ApiHumanTrackTagResponse,
  TrackTagData,
} from "@typedefs/api/trackTag";
import { computed } from "vue";
// eslint-disable-next-line @typescript-eslint/no-unused-vars,vue/no-setup-props-destructure
const { track, index, color } = defineProps<{
  track: ApiTrackResponse;
  index: number;
  color: { foreground: string; background: string };
}>();

const calculatedTagClassification = (
  tags: (ApiHumanTrackTagResponse | ApiAutomaticTrackTagResponse)[]
): string => {
  // TODO, port Master logic from browse
  return tags[0].what;
};

const hasUserTag = computed<boolean>(() => {
  return track.tags.some((tag) => !tag.automatic);
});

const masterTag = computed<ApiAutomaticTrackTagResponse | null>(() => {
  const tag = track.tags.find(
    (tag) =>
      tag.automatic && tag.data && (tag.data as TrackTagData).name === "Master"
  );
  if (tag) {
    return tag as ApiAutomaticTrackTagResponse;
  }
  return null;
});
</script>
<template>
  <div class="track p-2 fs-8 d-flex align-items-center">
    <span
      class="track-number me-3 fw-bold text-center d-inline-block"
      :style="{
        background: color.background,
        color: color.foreground === 'dark' ? '#333' : '#fff',
      }"
      >{{ index + 1 }}</span
    >
    <div v-if="!hasUserTag && masterTag" class="d-flex flex-column">
      <span class="text-uppercase fs-9 fw-bold">AI Classification</span>
      <span
        class="classification text-capitalize d-inline-block fw-bold"
        v-if="masterTag"
        >{{ masterTag.what }}</span
      >
    </div>
    <span v-else>
<!--      TODO -->
    </span>
  </div>
</template>
<style scoped lang="less">
.track-number {
  background-color: orange;
  color: white;
  line-height: 20px;
  padding: 0;
  width: 22px;
  border: 1px solid #ccc;
}
.track {
  height: 48px;
  background-color: #f6f6f6;
  border-top: 1px solid white;
  color: rgba(68, 68, 68, 0.8);
  &.selected {
    background-color: white;
    color: #444;
  }
}
</style>
