<script setup lang="ts">
import { computed } from "vue";
import { currentSelectedGroup } from "@models/LoggedInUser";
import type { SelectedGroup } from "@models/LoggedInUser";

const leaveGroup = () => {
  //  If we're not an admin of the group, or we're an admin but not the *last* admin
  // If we leave the group, redirect to the next group, or setup screen.
};
const groupName = computed(() => {
  return (currentSelectedGroup.value as SelectedGroup).groupName;
});
</script>
<template>
  <b-modal
    @ok="leaveGroup"
    ok-variant="danger"
    ok-title="Yes, leave this group"
  >
    <template #title>
      <font-awesome-icon
        icon="exclamation-triangle"
        class="me-2"
        color="#dc3545"
      />
      <span>Leave '{{ groupName }}'</span>
    </template>
    <p>
      Are you <strong><em>sure?</em></strong>
    </p>
    <p>
      You will lose access to this group, and will have to re-request access
      from the group administrator if you want to see this group again. You will
      no longer receive notifications for this group.
    </p>
  </b-modal>
</template>
