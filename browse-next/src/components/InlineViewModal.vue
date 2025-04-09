<script setup lang="ts">
import { inject, ref, watch } from "vue";
import type { ComputedRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { RouteRecordName } from "vue-router";
import { BModal } from "bootstrap-vue-next";
import { urlNormalisedCurrentSelectedProjectName } from "@models/provides";
import type { RecordingId } from "@typedefs/api/common";
const route = useRoute();
const router = useRouter();
const emit = defineEmits(["close", "shown"]);

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

const updatedRecording = (recordingId: RecordingId, action: string) => {};

const isBusy = ref<boolean>(false);
</script>
<template>
  <router-view v-slot="{ Component }">
    <b-modal
      v-model="show"
      centered
      lazy
      hide-footer
      hide-header
      :no-fade="noFadeInternal"
      ref="modal"
      @hide="show = false"
      @hidden="closedModal"
      @shown="onShown"
      :cancel-disabled="isBusy"
      :no-close-on-backdrop="isBusy || noCloseOnBackdrop"
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
      />
    </b-modal>
  </router-view>
</template>

<style lang="less">
.inline-view-dialog {
  pointer-events: none;
  user-select: none;
}
.inline-view-modal {
  border-radius: 2px;
  box-shadow: 0 0 5px 0 rgba(0, 0, 0, 0.2);

  // TODO What's the best way to set the width of this at different breakpoints?
  &.disabled {
    pointer-events: none;
    user-select: none;
  }
}
.inline-view-dialog {
  max-width: 1080px;
  overflow: hidden;
}
</style>
