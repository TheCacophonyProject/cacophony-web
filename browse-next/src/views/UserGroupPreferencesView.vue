<script setup lang="ts">
import { onMounted, ref } from "vue";
import SectionHeader from "@/components/SectionHeader.vue";
import type { ApiAlertResponse } from "@typedefs/api/alerts";
import { getAlertsForCurrentUser } from "@api/Alert";
import LeaveProjectModal from "@/components/LeaveProjectModal.vue";

const selectedLeaveProject = ref(false);
const alerts = ref<ApiAlertResponse[]>([]);
const isNotOnlyProjectOwnerOrAdmin = ref<true>;

onMounted(async () => {
  const response = await getAlertsForCurrentUser();
  if (response.success) {
    alerts.value = response.result.alerts;
  }
});
</script>
<template>
  <section-header>My project preferences</section-header>

  <h6>Things that could appear here:</h6>
  <ul>
    <li>My project/location alert settings</li>
    <li>Prefer video or audio views by default?</li>
    <li>My preferred tags for video, audio</li>
  </ul>

  <ul v-if="alerts.length">
    <li v-for="alert in alerts" :key="alert.id">{{ alert }}</li>
  </ul>
  <leave-project-modal v-model="selectedLeaveProject" />
  <button
    class="btn btn-outline-danger"
    type="button"
    @click="selectedLeaveProject = true"
    v-if="!isNotOnlyProjectOwnerOrAdmin"
  >
    Leave this project
  </button>
</template>
