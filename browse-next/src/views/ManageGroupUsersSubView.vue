<script setup lang="ts">
import {
  currentSelectedGroup as fallibleCurrentSelectedGroup,
  CurrentUser as fallibleCurrentUser,
  userDisplayName,
} from "@models/LoggedInUser";
import type { LoggedInUser, SelectedGroup } from "@models/LoggedInUser";
import { computed, onBeforeMount, ref } from "vue";
import {
  addOrUpdateGroupUser,
  getUsersForGroup,
  removeGroupUser,
} from "@api/Group";
import type { GroupId, UserId } from "@typedefs/api/common";
import type { ApiGroupUserResponse } from "@typedefs/api/group";
import SimpleTable from "@/components/SimpleTable.vue";
import TwoStepActionButton from "@/components/TwoStepActionButton.vue";
import type {
  CardTableItems,
  TableCellValue,
} from "@/components/CardTableTypes";
import LeaveGroupModal from "@/components/LeaveGroupModal.vue";
import GroupInviteModal from "@/components/GroupInviteModal.vue";
const groupUsers = ref<ApiGroupUserResponse[]>([]);
const loadingUsers = ref(false);

// NOTE: If this route loaded, these globals are properly set, so we can unwrap the fallible versions.
const currentSelectedGroup = computed<SelectedGroup>(() => {
  return fallibleCurrentSelectedGroup.value as SelectedGroup;
});
const CurrentUser = computed<LoggedInUser>(() => {
  return fallibleCurrentUser.value as LoggedInUser;
});

const loadGroupUsers = async () => {
  loadingUsers.value = true;
  const groupUsersResponse = await getUsersForGroup(
    (currentSelectedGroup.value as { groupName: string; id: GroupId }).id
  );
  if (groupUsersResponse.success) {
    groupUsers.value = groupUsersResponse.result.users;
  } else {
    // Do something with error.
  }
  loadingUsers.value = false;
};

onBeforeMount(async () => {
  await loadGroupUsers();
});

const showEditPermissions = ref<boolean>(false);
const editPermissionsForUser = ref<ApiGroupUserResponse | null>(null);
const editUserAdmin = async (user: ApiGroupUserResponse) => {
  editPermissionsForUser.value = user;
  showEditPermissions.value = true;
  if (user.admin && user.owner) {
    permissions.value = ["admin", "owner"];
  } else if (user.admin) {
    permissions.value = ["admin"];
  } else if (user.owner) {
    permissions.value = ["owner"];
  } else {
    permissions.value = [];
  }
};
const updateUserPermissions = async () => {
  let updateUserResponse;
  const user = editPermissionsForUser.value as ApiGroupUserResponse;
  if (user.id) {
    updateUserResponse = await addOrUpdateGroupUser(
      (currentSelectedGroup.value as SelectedGroup).groupName,
      permissions.value.includes("admin"),
      permissions.value.includes("owner"),
      user.id
    );
  } else {
    // The user is invited, and the userName field is actually the email
    updateUserResponse = await addOrUpdateGroupUser(
      (currentSelectedGroup.value as SelectedGroup).groupName,
      permissions.value.includes("admin"),
      permissions.value.includes("owner"),
      undefined,
      user.userName
    );
  }
  if (updateUserResponse.success) {
    await loadGroupUsers();
  }
};

const acceptPendingUser = async (user: ApiGroupUserResponse) => {
  console.log("Accept pending user");
};
const selectedLeaveGroup = ref(false);
const removeUser = async (user: ApiGroupUserResponse) => {
  if (user.id === CurrentUser.value.id) {
    selectedLeaveGroup.value = true;
  } else {
    let removeUserResponse;
    if (user.id) {
      removeUserResponse = await removeGroupUser(
        (currentSelectedGroup.value as SelectedGroup).groupName,
        user.id
      );
    } else {
      // The user is invited, and the userName field is actually the email
      removeUserResponse = await removeGroupUser(
        (currentSelectedGroup.value as SelectedGroup).groupName,
        undefined,
        user.userName
      );
    }
    if (removeUserResponse.success) {
      console.log("Removed user from group");
      await loadGroupUsers();
    }
  }
};

const isLastAdminUser = (user?: ApiGroupUserResponse): boolean => {
  if (!user) {
    return true;
  }
  return (
    user.admin &&
    !user.pending &&
    groupUsers.value.filter((user) => user.admin && !user.pending).length === 1
  );
};

const isLastOwnerUser = (user?: ApiGroupUserResponse): boolean => {
  if (!user) {
    return true;
  }
  return (
    user.owner &&
    !user.pending &&
    groupUsers.value.filter((user) => user.owner && !user.pending).length === 1
  );
};

// TODO: Should we have one integrated table, or a pending table and a users table?
// What should the ordering of the users be?

// User activity summary would be cool: Tagging activity and data usage activity.

const userIsCurrentUser = (user: ApiGroupUserResponse) =>
  user.id === CurrentUser.value.id;

const anyPendingJoinRequests = computed<boolean>(() => {
  return groupUsers.value.some(
    (groupUser) => groupUser.pending === "requested"
  );
});

const tableItems = computed<CardTableItems<ApiGroupUserResponse | boolean>>(
  () => {
    return groupUsers.value
      .map((value: ApiGroupUserResponse) => {
        let item: Record<
          string,
          TableCellValue<ApiGroupUserResponse | boolean>
        > = {
          user: {
            value,
            cellClasses: ["w-100"],
          },
          permissions: {
            value: value.admin,
          },
          _groupOwner: {
            value: value.owner,
          },
          _editPermissions: {
            value,
          },
          _deleteAction: {
            value,
          },
        };
        if (anyPendingJoinRequests.value) {
          item = {
            user: item.user,
            joinRequests: {
              value: value.pending === "requested" ? value : false,
              cellClasses: ["w-100"],
            },
            ...item,
          };
        }
        return item;
      })
      .reduce(
        (
          acc: CardTableItems<ApiGroupUserResponse | boolean>,
          item: Record<string, TableCellValue<ApiGroupUserResponse | boolean>>
        ) => {
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
  }
);
const showInviteUserModal = ref<boolean>(false);

// NOTE: Billing users - there must be at least one owner/billing user at all times.  For a billing user to be removed
//  from the group, billing/ownership must be transferred to another user first.  Same goes for admin users.
const permissions = ref<string[]>([]);
const permissionsOptions = computed(() => [
  {
    value: "admin",
    text: "Group admin",
    disabled: isLastAdminUser(editPermissionsForUser.value || undefined),
  },
  {
    value: "owner",
    text: "Group owner",
    disabled: isLastOwnerUser(editPermissionsForUser.value || undefined),
  },
]);
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
        <font-awesome-icon icon="envelope" />
        <span class="ps-2">Invite someone</span>
      </button>
    </div>
  </div>
  <div
    v-if="loadingUsers"
    class="d-flex align-items-center justify-content-center"
  >
    <b-spinner variant="secondary" />
  </div>
  <simple-table :items="tableItems" compact v-else>
    <template #user="{ item }">
      <div class="d-flex align-items-center">
        <span>{{ item.value.userName }}</span>
        <b-badge
          v-if="userIsCurrentUser(item.value)"
          variant="secondary"
          class="ms-2 fs-8"
          >You</b-badge
        >
        <b-badge
          v-else-if="item.value.pending === 'requested'"
          variant="primary"
          class="ms-2 fs-8"
          >Wants to join</b-badge
        >
        <b-badge
          v-else-if="item.value.pending === 'invited'"
          class="ms-2 fs-8"
          variant="warning"
          >Invited</b-badge
        >
      </div>
    </template>
    <template #permissions="{ item }">
      <div
        class="fs-7 text-secondary d-flex align-items-center"
        v-if="item.value"
      >
        <font-awesome-icon icon="check-circle" class="fs-6" />
        <span class="ps-2">admin</span>
      </div>
    </template>
    <template #_groupOwner="{ item }">
      <div
        class="fs-7 text-secondary d-flex align-items-center"
        v-if="item.value"
      >
        <font-awesome-icon icon="check-circle" class="fs-6" />
        <span class="ps-2">owner</span>
      </div>
    </template>
    <template #joinRequests="{ item }">
      <two-step-action-button
        v-if="item.value.pending"
        class="text-end"
        :action="() => acceptPendingUser(item.value)"
        icon="check"
        :confirmation-label="`Accept <strong><em>${item.value.userName}</em></strong> into group`"
        label="Approve request"
        classes="btn-outline-secondary d-flex align-items-center fs-7 text-nowrap w-100"
        alignment="centered"
      />
    </template>
    <template #_deleteAction="{ item }">
      <two-step-action-button
        class="text-end"
        classes="btn-outline-secondary fs-7"
        :action="() => removeUser(item.value)"
        icon="trash-can"
        :disabled="isLastAdminUser(item.value)"
        :confirmation-label="
          userIsCurrentUser(item.value)
            ? 'Leave group'
            : item.value.pending === 'requested'
            ? `Deny request from <strong><em>${item.value.userName}</em></strong> to join group`
            : item.value.pending === 'invited'
            ? `Revoke invitation to <strong><em>${item.value.userName}</em></strong>`
            : `Remove <strong><em>${item.value.userName}</em></strong> from group`
        "
        alignment="right"
      />
    </template>
    <template #_editPermissions="{ item }">
      <button
        class="btn btn-outline-secondary d-flex align-items-center fs-7 text-nowrap"
        @click.prevent="() => editUserAdmin(item.value)"
        :disabled="isLastOwnerUser(item.value) && isLastAdminUser(item.value)"
      >
        <font-awesome-icon icon="pencil-alt" />
        <span class="ps-2">Change permissions</span>
      </button>
    </template>
  </simple-table>
  <group-invite-modal v-model="showInviteUserModal" />
  <leave-group-modal v-model="selectedLeaveGroup" />
  <b-modal
    v-model="showEditPermissions"
    centered
    :title="`Edit permissions for ${editPermissionsForUser?.userName}`"
    ok-title="Update permissions"
    @hidden="permissions = []"
    @ok="updateUserPermissions"
  >
    <p>You can update a users' group permissions.</p>
    <p>
      Making a user into a group admin means they can do destructive actions
      like delete recordings, and can add and remove group users.
    </p>
    <p>
      Making a user into a group owner designates them as a point-of-contact for
      the group, and means that they are ultimately responsible for the group.
    </p>
    <hr />
    <b-form>
      <div class="input-group mt-2">
        <b-form-checkbox-group
          v-model="permissions"
          :options="permissionsOptions"
        />
      </div>
    </b-form>
  </b-modal>
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
