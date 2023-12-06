<script setup lang="ts">
import { onMounted, ref } from "vue";
import SectionHeader from "@/components/SectionHeader.vue";
import { getAlertsForCurrentUser } from "@api/Alert";
import LeaveProjectModal from "@/components/LeaveProjectModal.vue";
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { useRoute } from "vue-router";
const route = useRoute();
</script>

<template>
  <div>
    <div class="taggingContent">
      <h3>Tagging Preferences</h3>
      <p>My preferred tags for video, audio </p>
    </div>
  </div>
</template>

<style scoped>
.taggingContent {
  background-color: white;
  border-radius: 0.5em;
  margin-left: 0.7em;
  padding-top: 1.7em;
  padding-left: 1.7em;
  padding-right: 1.7em;
  padding-bottom: 1em;
}
</style>
