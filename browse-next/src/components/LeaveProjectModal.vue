<script setup lang="ts">
import { computed } from "vue";
import { currentSelectedProject } from "@models/LoggedInUser";
import type { SelectedProject } from "@models/LoggedInUser";
import { BModal } from "bootstrap-vue-next";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";

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
      <div class="d-flex align-items-center">
        <material-symbol name="warning" class="text-danger me-2" />
        <span>Leave project</span>
      </div>
    </template>
    <p>
      Are you sure you want to leave <strong>{{ projectName }}</strong
      >?
    </p>
    <p class="mb-0">
      You will lose access to this project, and will have to re-request access
      from the project administrator if you want to see this project again. You
      will no longer receive notifications for this project.
    </p>
  </b-modal>
</template>
