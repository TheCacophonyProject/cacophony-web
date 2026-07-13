<script setup lang="ts">
import { BBadge } from "bootstrap-vue-next";
import { useRoute } from "vue-router";
import { computed, ref } from "vue";
import type { DeviceId } from "@typedefs/api/common";
import type { LoadedResource } from "@apiClient/types.ts";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import type { NamedPoint } from "@models/mapUtils.ts";
import type { ApiTrackResponse } from "@typedefs/api/track";
import type { ApiRecordingTagResponse } from "@typedefs/api/tag";
import { useMediaQuery } from "@vueuse/core";
const route = useRoute();
const navLinkClasses = ["nav-item", "nav-link"];
const activeTabName = computed(() => {
  return route.name;
});
const recordingViewContext: string = (route.meta as Record<string, string>)
  .context;

const props = defineProps<{
  recording: LoadedResource<ApiRecordingResponse>;
  currentTrack?: ApiTrackResponse;
}>();

const tracks = computed<ApiTrackResponse[]>(() => {
  if (props.recording) {
    return (props.recording as ApiRecordingResponse).tracks;
  }
  return [];
});

const tags = computed<ApiRecordingTagResponse[]>(() => {
  if (props.recording) {
    return (props.recording as ApiRecordingResponse).tags.filter(
      (tag) => tag.detail !== "note",
    );
  }
  return [];
});

const notes = computed<ApiRecordingTagResponse[]>(() => {
  if (props.recording) {
    return (props.recording as ApiRecordingResponse).tags.filter(
      (tag) => tag.detail === "note",
    );
  }
  return [];
});

const desktop = useMediaQuery("(min-width: 992px)");
const isMobileView = computed<boolean>(() => {
  return !desktop.value;
});
</script>

<template>
  <ul
    class="nav nav-underline nav-fill px-0 px-sm-2 px-md-4 gap-0 gap-sm-2 recording-view-tabs"
  >
    <router-link
      :class="[
        ...navLinkClasses,
        { active: activeTabName === `${recordingViewContext}-tracks` },
      ]"
      title="Tracks"
      :to="{
        name: `${recordingViewContext}-tracks`,
        params: {
          ...route.params,
          trackId: currentTrack?.id,
        },
        query: route.query,
      }"
      >Tracks
      <b-badge
        v-if="activeTabName !== `${recordingViewContext}-tracks`"
        variant="light"
        text-variant="primary-emphasis"
        >{{ tracks.length }}</b-badge
      ></router-link
    >
    <router-link
      :class="[
        ...navLinkClasses,
        { active: activeTabName === `${recordingViewContext}-labels` },
      ]"
      title="Labels"
      :to="{
        name: `${recordingViewContext}-labels`,
        params: {
          ...route.params,
          trackId: currentTrack?.id,
        },
        query: route.query,
      }"
      >Labels
      <b-badge
        v-if="activeTabName !== `${recordingViewContext}-labels` && tags.length"
        variant="light"
        text-variant="primary-emphasis"
        >{{ tags.length }}</b-badge
      ></router-link
    >
    <router-link
      :class="[
        ...navLinkClasses,
        { active: activeTabName === `${recordingViewContext}-notes` },
      ]"
      title="Notes"
      :to="{
        name: `${recordingViewContext}-notes`,
        params: {
          ...route.params,
          trackId: currentTrack?.id,
        },
        query: route.query,
      }"
      >Notes
      <b-badge
        v-if="activeTabName !== `${recordingViewContext}-notes` && notes.length"
        variant="light"
        text-variant="primary-emphasis"
        >{{ notes.length }}</b-badge
      ></router-link
    >
    <router-link
      v-if="isMobileView"
      :class="[
        ...navLinkClasses,
        {
          active: activeTabName === `${recordingViewContext}-info`,
        },
      ]"
      title="Info"
      :to="{
        name: `${recordingViewContext}-info`,
        params: {
          ...route.params,
          trackId: currentTrack?.id,
        },
        query: route.query,
      }"
      >Info
    </router-link>
  </ul>
</template>

<style scoped>
ul {
  background-color: white;
}
</style>
