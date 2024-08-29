<script setup lang="ts">
import { computed } from "vue";
import { currentSelectedProject } from "@models/LoggedInUser";
import type { SelectedProject } from "@models/LoggedInUser";

const leaveProject = () => {
  // If we're not an admin of the group, or we're an admin but not the *last* admin
  // If we leave the group, redirect to the next group, or setup screen.
};
const projectName = computed(() => {
  return (currentSelectedProject.value as SelectedProject).groupName;
});
</script>
<template>
  <b-modal
    @ok="leaveProject"
    ok-variant="danger"
    ok-title="Yes, leave this project"
  >
    <template #title>
      <font-awesome-icon
        icon="exclamation-triangle"
        class="me-2"
        color="#dc3545"
      />
      <span>Leave '{{ projectName }}'</span>
    </template>
    <p>
      Are you <strong><em>sure?</em></strong>
    </p>
    <p>
      You will lose access to this project, and will have to re-request access
      from the project administrator if you want to see this project again. You
      will no longer receive notifications for this project.
    </p>
  </b-modal>
</template>
