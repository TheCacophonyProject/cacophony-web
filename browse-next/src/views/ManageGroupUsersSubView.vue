<script setup lang="ts">
import {
  currentSelectedGroup as fallibleCurrentSelectedGroup,
  CurrentUser as fallibleCurrentUser,
  type LoggedInUser,
  type SelectedGroup,
} from "@models/LoggedInUser";
import { computed, onBeforeMount, ref } from "vue";
import { getUsersForGroup } from "@api/Group";
import type { GroupId } from "@typedefs/api/common";
import type { ApiGroupUserResponse } from "@typedefs/api/group";
const groupUsers = ref<ApiGroupUserResponse[]>([]);
const loadingUsers = ref(false);

// NOTE: If this route loaded, these globals are properly set, so we can unwrap the fallible versions.
const currentSelectedGroup = computed<SelectedGroup>(() => {
  return fallibleCurrentSelectedGroup.value as SelectedGroup;
});
const CurrentUser = computed<LoggedInUser>(() => {
  return fallibleCurrentUser.value as LoggedInUser;
});

onBeforeMount(async () => {
  loadingUsers.value = true;
  const groupUsersResponse = await getUsersForGroup(
    (currentSelectedGroup.value as { groupName: string; id: GroupId }).id
  );
  if (groupUsersResponse.success) {
    console.log(groupUsersResponse);
    groupUsers.value = groupUsersResponse.result.users;
  } else {
    // Do something with error.
  }
  loadingUsers.value = false;
});
</script>
<template>
  <h1 class="d-none d-md-block h5">Users</h1>
  <p class="d-none d-md-block small">
    Manage the users associated with {{ currentSelectedGroup.groupName }}.
  </p>
  <div class="container-md px-0">
    <div class="d-flex flex-column">
      <div class="thead">
        <span>User</span>
        <span>Group Admin?</span>
      </div>
      <div
        class="c-card d-flex justify-content-between"
        v-for="{ userName, id, admin } in groupUsers"
        :key="id"
      >
        <div class="d-flex flex-column flex-md-row justify-content-between">
          <div>
            <em v-if="CurrentUser.id === id">{{ userName }}</em>
            <span v-else>{{ userName }}</span>
            <span v-if="CurrentUser.id === id"> (you)</span>
          </div>
          <div>Administrator: {{ admin ? "Yes" : "No" }}</div>
        </div>
        <div>Edit</div>
        <div>Delete</div>
      </div>
    </div>
  </div>
</template>
<style lang="less" scoped>
.thead {
  background: #ccc;
}
.c-card {
  border-radius: 2px;
  background-color: #ffffff;
  box-sizing: border-box;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.1);
  padding: 0.75rem;
}
</style>
