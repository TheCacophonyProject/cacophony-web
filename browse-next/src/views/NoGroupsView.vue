<script setup lang="ts">
import { userDisplayName } from "@models/LoggedInUser";
</script>
<template>
  <div>
    <div>
      <span class="h3">
        Kia ora <span>{{ userDisplayName }}</span>
      </span>
    </div>
    <div>
      <h1>You don't belong to any groups yet</h1>
      <p>
        If you are setting up a device, create a new group. All the devices you
        manage will be linked together through this group, so choose a name for
        your group that relates to your organisation, project or property.
      </p>
      <button class="btn btn-primary">
        <font-awesome-icon icon="plus" /> Create a new group
      </button>
      <button class="btn btn-secondary">Ask to join an existing group</button>
    </div>
  </div>
</template>
