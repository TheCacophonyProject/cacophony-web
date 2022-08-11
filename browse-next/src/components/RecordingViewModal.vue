<script setup lang="ts">
import { computed, ref } from "vue";
import { urlNormalisedCurrentGroupName } from "@models/LoggedInUser";
import { useRoute, useRouter } from "vue-router";
import { BModal } from "bootstrap-vue-3";
const route = useRoute();
const router = useRouter();
const emit = defineEmits(["close"]);
const closeModal = () => {
  router.push({
    name: "dashboard",
    params: { groupName: urlNormalisedCurrentGroupName.value },
  });
  emit("close");
};
const modal = ref<typeof BModal | null>(null);

// Okay, if we're in a visit context, and the user changes the tags, we're going to wait while we re-query the visit.

// To recreate the visits context *around* this visit we need:
//  - Are the visits group or station based?
//  - Were the visits filtered on any particular species?

// TODO: Provide parent context to return to as a prop or provide
const show = computed<boolean>({
  get: () =>
    route.name === "dashboard-visit" || route.name === "dashboard-recording",
  set: (value: boolean) => {
    if (!value) {
      // Return to dashboard from modal.
      modal.value?.hide();
    }
  },
});
</script>
<template>
  <b-modal v-model="show" centered hide-footer hide-header @hidden="closeModal">
    <router-view @close="show = false" />
  </b-modal>
</template>

<style scoped></style>
