<script setup lang="ts">
import type { ComputedRef } from "vue";
import { inject, ref, watch } from "vue";
import type { RouteRecordName } from "vue-router";
import { useRoute, useRouter } from "vue-router";
import { BModal } from "bootstrap-vue-next";
import { urlNormalisedCurrentSelectedProjectName } from "@models/provides";
import type { RecordingId } from "@typedefs/api/common";
import { RecordingType } from "@typedefs/api/consts.ts";

const route = useRoute();
const router = useRouter();
const emit = defineEmits<{
  (e: "close"): void;
  (e: "shown"): void;
  (
    e: "recording-updated",
    recording: RecordingId,
    action: "deleted" | "updated",
    newClassification?: string,
    oldClassification?: string,
  ): void;
}>();

const urlNormalisedGroupName = inject(
  urlNormalisedCurrentSelectedProjectName,
) as ComputedRef<string>;
const props = withDefaults(
  defineProps<{
    fadeIn: boolean;
    parentRouteName: string;
    showInactive?: boolean;
    noCloseOnBackdrop?: boolean;
  }>(),
  {
    showInactive: false,
    noCloseOnBackdrop: false,
  },
);

const closedModal = () => {
  const params = { projectName: urlNormalisedGroupName.value };
  if (props.parentRouteName === "devices" && props.showInactive) {
    (params as Record<string, string>).all = "all";
  }
  router.push({
    name: props.parentRouteName,
    params,
    query: route.query,
  });
  emit("close");
};
const modal = ref<typeof BModal | null>(null);
// Okay, if we're in a visit context, and the user changes the tags, we're going to wait while we re-query the visit.

// To recreate the visits context *around* this visit we need:
//  - Are the visits group or station based? (Can also be 1 or more stations, if we're coming from search)
//  - Were the visits filtered on any particular species?

// TODO: Provide parent context to return to as a prop or provide
const isModalRouteName = (name: RouteRecordName) => {
  // return ["dashboard-visit", "dashboard-recording"].some((str) =>
  //   (name as string).startsWith(str)
  // );
  return name !== props.parentRouteName;
};
const show = ref(isModalRouteName(route.name as string));

watch(route, (next) => {
  show.value = !!(next && next.name && isModalRouteName(next.name));
});

const noFadeInternal = ref<boolean>(!props.fadeIn);
const onShown = () => {
  setTimeout(() => {
    noFadeInternal.value = false;
  }, 100);
  emit("shown");
};
const recordingType = ref<RecordingType>(RecordingType.ThermalRaw);
const updatedRecording = (
  recordingId: RecordingId,
  action: "deleted" | "updated",
  newClassification?: string,
  oldClassification?: string,
) => {
  emit(
    "recording-updated",
    recordingId,
    action,
    newClassification,
    oldClassification,
  );
};
const loadedRecording = (type: RecordingType) => {
  recordingType.value = type;
};

const isBusy = ref<boolean>(false);
</script>
<template>
  <router-view v-slot="{ Component }">
    <b-modal
      v-model="show"
      centered
      lazy
      no-footer
      no-header
      :no-fade="noFadeInternal"
      ref="modal"
      size="xl"
      @hide="show = false"
      @hidden="closedModal"
      @shown="onShown"
      :cancel-disabled="isBusy"
      :no-close-on-backdrop="
        recordingType === RecordingType.Audio || isBusy || noCloseOnBackdrop
      "
      :no-close-on-esc="isBusy"
      body-class="p-0"
      :content-class="{
        'inline-view-modal': true,
        disabled: isBusy,
      }"
      :dialog-class="[
        'inline-view-dialog',
        'm-0',
        'm-sm-auto',
        'modal-fullscreen-sm-down',
        { disabled: isBusy },
      ]"
    >
      <component
        :is="Component"
        @close="show = false"
        @start-blocking-work="isBusy = true"
        @end-blocking-work="isBusy = false"
        @recording-updated="updatedRecording"
        @loaded-recording="loadedRecording"
      />
    </b-modal>
  </router-view>
</template>

<style lang="less">
@import "../assets/less/breakpoints";
.inline-view-dialog {
  pointer-events: none;
  user-select: none;
  @media (min-width: @breakpoint-md) and (max-width: @breakpoint-lg-max) {
    max-width: 98vw;
  }
}
.inline-view-modal {
  overflow: hidden;
  // TODO What's the best way to set the width of this at different breakpoints?
  &.disabled {
    pointer-events: none;
    user-select: none;
  }
}
</style>
