<script setup lang="ts">
import { onBeforeMount, ref, watch } from "vue";
import { urlNormalisedCurrentGroupName } from "@models/LoggedInUser";
import { useRoute, useRouter } from "vue-router";
import type { RouteRecordName } from "vue-router";
import { BModal } from "bootstrap-vue-3";
const route = useRoute();
const router = useRouter();
const emit = defineEmits(["close", "shown"]);

const { fadeIn, parentRouteName } = defineProps<{
  fadeIn: boolean;
  parentRouteName: string;
}>();

const closedModal = () => {
  router.push({
    name: parentRouteName,
    params: { groupName: urlNormalisedCurrentGroupName.value },
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
  return name !== parentRouteName;
};
const show = ref(isModalRouteName(route.name as string));

watch(route, (next) => {
  show.value = !!(next && next.name && isModalRouteName(next.name));
});

const noFadeInternal = ref<boolean>(!fadeIn);
const onShown = () => {
  noFadeInternal.value = false;
  emit("shown");
};
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
      body-class="p-0"
      content-class="inline-view-modal"
      dialog-class="inline-view-dialog m-0 m-sm-auto modal-fullscreen-sm-down"
    >
      <component :is="Component" @close="show = false" />
    </b-modal>
  </router-view>
</template>

<style lang="less">
.inline-view-modal {
  border-radius: 2px;
  box-shadow: 0 0 5px 0 rgba(0, 0, 0, 0.2);

  // TODO What's the best way to set the width of this at different breakpoints?
}
.inline-view-dialog {
  max-width: 1080px;
}
</style>
