<script setup lang="ts">
import { onMounted, ref } from "vue";
import SectionHeader from "@/components/SectionHeader.vue";
import type { ApiAlertResponse } from "@typedefs/api/alerts";
import { getAlertsForCurrentUser } from "@api/Alert";

const selectedLeaveGroup = ref(false);
const alerts = ref<ApiAlertResponse[]>([]);

onMounted(async () => {
  const response = await getAlertsForCurrentUser();
  if (response.success) {
    alerts.value = response.result.alerts;
  }
});

const leaveGroup = () => {
  //  If we're not an admin of the group, or we're an admin but not the *last* admin
  // If we leave the group, redirect to the next group, or setup screen.
};
</script>
<template>
  <section-header>My group preferences</section-header>

  <ul v-if="alerts.length">
    <li v-for="alert in alerts" :key="alert.id">{{ alert }}</li>
  </ul>
  <div>
    My alert settings. My preferred tags for video, audio. Show audio or video
    by default?
  </div>

  <b-modal v-model="selectedLeaveGroup">
    <p>
      Are you sure? You will lose access to this group, and will have to
      re-request access from the group administrator if you want to see this
      group again. You will no longer receive notifications for this group.
    </p>
    <button class="btn btn-danger" type="button" @click="leaveGroup">
      Yes, leave this group
    </button>
  </b-modal>
  <button
    class="btn btn-outline-danger"
    type="button"
    @click="selectedLeaveGroup = true"
  >
    Leave this group
  </button>
</template>
