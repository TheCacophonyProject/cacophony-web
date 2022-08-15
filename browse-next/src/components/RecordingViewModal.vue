<script setup lang="ts">
import { ref, watch } from "vue";
import { urlNormalisedCurrentGroupName } from "@models/LoggedInUser";
import { useRoute, useRouter } from "vue-router";
import type { RouteRecordName } from "vue-router";
import { BModal } from "bootstrap-vue-3";
const route = useRoute();
const router = useRouter();
const emit = defineEmits(["close"]);
const closedModal = () => {
  router.push({
    name: "dashboard",
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
  return ["dashboard-visit", "dashboard-recording"].includes(name as string);
};
const show = ref(isModalRouteName(route.name as string));

watch(route, (next) => {
  show.value = !!(next && next.name && isModalRouteName(next.name));
});
</script>
<template>
  <b-modal
    v-model="show"
    centered
    hide-footer
    hide-header
    ref="modal"
    @hide="show = false"
    @hidden="closedModal"
    body-class="p-0"
    content-class="recording-view-modal"
  >
    <router-view @close="show = false" />
  </b-modal>
</template>

<style lang="less">
.recording-view-modal {
  border-radius: 2px;
  box-shadow: 0 0 5px 0 rgba(0, 0, 0, 0.2);

  // TODO What's the best way to set the width of this at different breakpoints?
}
</style>
