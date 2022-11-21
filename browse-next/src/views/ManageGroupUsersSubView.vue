<script setup lang="ts">
import {
  currentSelectedGroup as fallibleCurrentSelectedGroup,
  CurrentUser as fallibleCurrentUser,
  userDisplayName,
} from "@models/LoggedInUser";
import type { LoggedInUser, SelectedGroup } from "@models/LoggedInUser";
import { computed, onBeforeMount, ref } from "vue";
import { getUsersForGroup } from "@api/Group";
import type { GroupId } from "@typedefs/api/common";
import type { ApiGroupUserResponse } from "@typedefs/api/group";
import SimpleTable from "@/components/SimpleTable.vue";
import TwoStepDeleteButton from "@/components/TwoStepDeleteButton.vue";
import type {
  CardTableItems,
  CardTableValue,
} from "@/components/CardTableTypes";
import LeaveGroupModal from "@/components/LeaveGroupModal.vue";
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
    // Filter out invited users, non-member or existing member
    // groupUsers.value = groupUsersResponse.result.users.filter(
    //   (user) => user.id !== undefined
    // );
    groupUsers.value = groupUsersResponse.result.users;
  } else {
    // Do something with error.
  }
  loadingUsers.value = false;
});

const editUserAdmin = async (user: ApiGroupUserResponse) => {
  console.log("Edit user admin state");
};
const selectedLeaveGroup = ref(false);
const removeUser = async (user: ApiGroupUserResponse) => {
  if (user.id === CurrentUser.value.id) {
    selectedLeaveGroup.value = true;
  } else {
    console.log("Remove user from group");
  }
};

const isLastAdminUser = (user: ApiGroupUserResponse): boolean => {
  return (
    user.admin && groupUsers.value.filter((user) => user.admin).length === 1
  );
};

const tableItems = computed<CardTableItems>(() => {
  return groupUsers.value
    .map((user: ApiGroupUserResponse) => ({
      userName:
        user.id === CurrentUser.value.id
          ? `${user.userName} (you)`
          : user.userName,
      administrator: user.admin ? "Yes" : "",
      groupOwner: "No",
      _editAdmin: {
        type: "button",
        icon: "pencil-alt",
        color: "#444",
        action: () => editUserAdmin(user),
        // Maybe this should be a component?
      },
      _deleteAction: {
        type: "component",
        component: TwoStepDeleteButton,
        icon: "trash-can",
        color: "#444",
        align: "right",
        label: () =>
          user.id === CurrentUser.value.id
            ? "Leave group"
            : `Remove <strong><em>${user.userName}</em></strong> from group`,
        // TODO: If you try to delete yourself, we should have a modal confirmation, even if there are other admin users?
        //  Actually, that's the same as the "Leave group" functionality.
        disabled: () => isLastAdminUser(user),
        action: () => removeUser(user),
      },
    }))
    .reduce(
      (acc: CardTableItems, item: Record<string, CardTableValue>) => {
        if (acc.headings.length === 0) {
          acc.headings = Object.keys(item);
        }
        acc.values.push(Object.values(item));
        return acc;
      },
      {
        headings: [],
        values: [],
      }
    );
});
const showInviteUserModal = ref<boolean>(false);
const pendingUserEmail = ref<string>("");

const invitePendingUser = async () => {
  // If the user doesn't exist, we could create the user as a "pending" user.
  // If they do exist, we can add the group/user relationship with a "pending" flag?
  // If the user clicks the link and there's no pending flag waiting, that means the invitation has been revoked.
  // This means the user can't reuse a link to rejoin a group if they're removed.
  // Another option is just to have an invites table?
};

// TODO: Billing users - there must be at least one owner/billing user at all times.  For a billing user to be removed
//  from the group, billing/ownership must be transferred to another user first.
</script>
<template>
  <h1 class="d-none d-md-block h5">Users</h1>
  <div
    class="d-flex flex-column flex-md-row flex-fill mb-3 justify-content-md-between"
  >
    <p class="">
      Manage the users associated with {{ currentSelectedGroup.groupName }}.
    </p>
    <div class="d-flex justify-content-end ms-md-5">
      <button
        type="button"
        class="btn btn-outline-secondary ms-2"
        @click.stop.prevent="() => (showInviteUserModal = true)"
      >
        Invite user
      </button>
    </div>
  </div>
  <div
    v-if="loadingUsers"
    class="d-flex align-items-center justify-content-center"
  >
    <b-spinner variant="secondary" />
  </div>
  <simple-table :items="tableItems" compact v-else />

  <b-modal
    v-model="showInviteUserModal"
    centered
    @ok="invitePendingUser"
    ok-title="Invite user"
    title="Invite a user"
  >
    <p>
      You can invite a user to this group by entering their email here. They'll
      be sent an email with a link that will let them join your group.
    </p>
  </b-modal>
  <leave-group-modal v-model="selectedLeaveGroup" />
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
