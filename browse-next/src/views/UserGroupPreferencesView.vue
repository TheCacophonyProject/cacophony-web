<script setup lang="ts">
import { onMounted, ref } from "vue";
import SectionHeader from "@/components/SectionHeader.vue";
import type { ApiAlertResponse } from "@typedefs/api/alerts";
import { getAlertsForCurrentUser } from "@api/Alert";
import LeaveGroupModal from "@/components/LeaveGroupModal.vue";

const selectedLeaveGroup = ref(false);
const alerts = ref<ApiAlertResponse[]>([]);

onMounted(async () => {
  const response = await getAlertsForCurrentUser();
  if (response.success) {
    alerts.value = response.result.alerts;
  }
});
</script>
<template>
  <section-header>My group preferences</section-header>

  <h6>Things that could appear here:</h6>
  <ul>
    <li>My group/station alert settings</li>
    <li>Prefer video or audio views by default?</li>
    <li>My preferred tags for video, audio</li>
  </ul>

  <ul v-if="alerts.length">
    <li v-for="alert in alerts" :key="alert.id">{{ alert }}</li>
  </ul>
  <leave-group-modal v-model="selectedLeaveGroup" />
  <button
    class="btn btn-outline-danger"
    type="button"
    @click="selectedLeaveGroup = true"
  >
    Leave this group
  </button>
</template>
