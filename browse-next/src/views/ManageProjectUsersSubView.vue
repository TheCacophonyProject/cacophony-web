<script setup lang="ts">
import { userProjectsLoaded } from "@models/LoggedInUser";
import type { LoggedInUser, SelectedProject } from "@models/LoggedInUser";
import { computed, inject, onBeforeMount, ref } from "vue";
import type { Ref } from "vue";
import {
  addOrUpdateProjectUser,
  getUsersForProject,
  removeProjectUser,
} from "@api/Project";
import type { GroupId as ProjectId } from "@typedefs/api/common";
import type { ApiGroupUserResponse as ApiProjectUserResponse } from "@typedefs/api/group";
import CardTable from "@/components/CardTable.vue";
import TwoStepActionButton from "@/components/TwoStepActionButton.vue";
import type { CardTableRows, CardTableItem } from "@/components/CardTableTypes";
import LeaveProjectModal from "@/components/LeaveProjectModal.vue";
import ProjectInviteModal from "@/components/ProjectInviteModal.vue";
import {
  currentUser as currentUserInfo,
  currentSelectedProject as selectedProject,
} from "@models/provides";
import type { LoadedResource } from "@api/types";
const projectUsers = ref<LoadedResource<ApiProjectUserResponse[]>>(null);
const loadingUsers = ref(false);
const fallibleCurrentUser = inject(currentUserInfo) as Ref<LoggedInUser | null>;
const fallibleCurrentSelectedProject = inject(
  selectedProject
) as Ref<SelectedProject>;
// NOTE: If this route loaded, these globals are properly set, so we can unwrap the fallible versions.
const currentSelectedProject = computed<SelectedProject>(() => {
  return fallibleCurrentSelectedProject.value as SelectedProject;
});
const currentUser = computed<LoggedInUser>(() => {
  return fallibleCurrentUser.value as LoggedInUser;
});

const loadProjectUsers = async () => {
  loadingUsers.value = true;
  await userProjectsLoaded();
  projectUsers.value = await getUsersForProject(
    (currentSelectedProject.value as { groupName: string; id: ProjectId }).id
  );
  loadingUsers.value = false;
};

onBeforeMount(async () => {
  await loadProjectUsers();
});

const showEditPermissions = ref<boolean>(false);
const editPermissionsForUser = ref<ApiProjectUserResponse | null>(null);
const editUserAdmin = async (user: ApiProjectUserResponse) => {
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
  const user = editPermissionsForUser.value as ApiProjectUserResponse;
  if (user.id) {
    updateUserResponse = await addOrUpdateProjectUser(
      (currentSelectedProject.value as SelectedProject).groupName,
      permissions.value.includes("admin"),
      permissions.value.includes("owner"),
      user.id
    );
  } else {
    // The user is invited, and the userName field is actually the email
    updateUserResponse = await addOrUpdateProjectUser(
      (currentSelectedProject.value as SelectedProject).groupName,
      permissions.value.includes("admin"),
      permissions.value.includes("owner"),
      undefined,
      user.userName
    );
  }
  if (updateUserResponse.success) {
    await loadProjectUsers();
  }
};

const acceptPendingUser = async (user: ApiProjectUserResponse) => {
  // TODO: Loading state
  const acceptPendingUserResponse = await addOrUpdateProjectUser(
    (currentSelectedProject.value as SelectedProject).groupName,
    user.admin,
    user.owner,
    user.id
  );
  if (acceptPendingUserResponse) {
    await loadProjectUsers();
  }
};
const selectedLeaveGroup = ref(false);
const removeUser = async (user: ApiProjectUserResponse) => {
  if (user.id === currentUser.value.id) {
    selectedLeaveGroup.value = true;
  } else {
    let removeUserResponse;
    if (user.id) {
      removeUserResponse = await removeProjectUser(
        (currentSelectedProject.value as SelectedProject).groupName,
        user.id
      );
    } else {
      // The user is invited, and the userName field is actually the email
      removeUserResponse = await removeProjectUser(
        (currentSelectedProject.value as SelectedProject).groupName,
        undefined,
        user.userName
      );
    }
    if (removeUserResponse.success) {
      console.log("Removed user from group");
      await loadProjectUsers();
    }
  }
};

const isLastAdminUser = (user?: ApiProjectUserResponse): boolean => {
  if (!user) {
    return true;
  }
  return (
    user.admin &&
    !user.pending &&
    (projectUsers.value || []).filter((user) => user.admin && !user.pending)
      .length === 1
  );
};

const isLastOwnerUser = (user?: ApiProjectUserResponse): boolean => {
  if (!user) {
    return true;
  }
  return (
    user.owner &&
    !user.pending &&
    (projectUsers.value || []).filter((user) => user.owner && !user.pending)
      .length === 1
  );
};

// TODO: Should we have one integrated table, or a pending table and a users table?
// What should the ordering of the users be?

// User activity summary would be cool: Tagging activity and data usage activity.

const userIsCurrentUser = (user: ApiProjectUserResponse) =>
  user.id === currentUser.value.id;

const tableItems = computed<CardTableRows<ApiProjectUserResponse>>(() => {
  return (projectUsers.value || [])
    .map((value: ApiProjectUserResponse) => {
      const item: Record<string, CardTableItem<ApiProjectUserResponse>> = {
        user: {
          value,
          cellClasses: ["w-100"],
        },
        permissions: {
          value,
          cellClasses: ["d-flex", "justify-content-end"],
        },
        _deleteAction: {
          value,
        },
      };
      return item;
    })
    .sort(({ user: { value: a } }, { user: { value: b } }) => {
      if (a.id && b.id) {
        return b.id - a.id;
      } else if (a.id && !b.id) {
        return 1;
      } else if (!a.id && b.id) {
        return -1;
      } else {
        return a.userName > b.userName ? 1 : -1;
      }
    });
});
const showInviteUserModal = ref<boolean>(false);

// NOTE: Billing users - there must be at least one owner/billing user at all times.  For a billing user to be removed
//  from the group, billing/ownership must be transferred to another user first.  Same goes for admin users.
const permissions = ref<string[]>([]);
const permissionsOptions = computed(() => [
  {
    value: "admin",
    text: "Project admin",
    disabled: isLastAdminUser(editPermissionsForUser.value || undefined),
  },
  {
    value: "owner",
    text: "Project owner",
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
      Manage the users associated with {{ currentSelectedProject.groupName }}.
    </p>
    <div class="d-flex justify-content-end ms-md-5">
      <button
        type="button"
        class="btn btn-outline-secondary ms-2"
        @click.stop.prevent="() => (showInviteUserModal = true)"
        data-cy="invite someone to project button"
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
  <card-table :items="tableItems" compact v-else :max-card-width="730">
    <template #card="{ card }">
      <div class="d-flex align-items-center justify-content-between">
        <div>
          <span>{{ card.user.value.userName }}</span>
          <b-badge
            v-if="userIsCurrentUser(card.user.value)"
            variant="secondary"
            class="ms-2 fs-8"
            >You</b-badge
          >
          <b-badge
            v-else-if="card.user.value.pending === 'requested'"
            variant="primary"
            class="ms-2 fs-8"
            >Wants to join</b-badge
          >
          <b-badge
            v-else-if="card.user.value.pending === 'invited'"
            class="ms-2 fs-8"
            variant="warning"
            >Invited</b-badge
          >
        </div>
        <two-step-action-button
          v-if="card.user.value.pending === 'requested'"
          class="text-end"
          :action="() => acceptPendingUser(card.user.value)"
          icon="check"
          variant="outline-secondary"
          :confirmation-label="`Accept <strong><em>${card.user.value.userName}</em></strong> into group`"
          label="Approve request"
          classes="btn-outline-secondary d-flex align-items-center fs-7 text-nowrap w-100"
          alignment="right"
        />
      </div>
      <div
        class="d-flex justify-content-between align-items-center mt-2 flex-row-reverse"
      >
        <button
          type="button"
          class="btn btn-outline-secondary d-flex align-items-center fs-7 text-nowrap"
          @click.prevent="() => editUserAdmin(card.permissions.value)"
          :disabled="
            isLastOwnerUser(card.permissions.value) &&
            isLastAdminUser(card.permissions.value)
          "
        >
          <font-awesome-icon icon="pencil-alt" />
          <span class="ps-2">Change permissions</span>
        </button>
        <div class="d-flex">
          <div
            class="fs-7 text-secondary d-flex align-items-center me-2"
            v-if="card.permissions.value.admin"
          >
            <font-awesome-icon icon="check-circle" class="fs-6" />
            <span class="ps-2">admin</span>
          </div>
          <div
            class="fs-7 text-secondary d-flex align-items-center"
            v-if="card.permissions.value.owner"
          >
            <font-awesome-icon icon="check-circle" class="fs-6" />
            <span class="ps-2">owner</span>
          </div>
        </div>
      </div>
      <div class="d-flex justify-content-end mt-2">
        <two-step-action-button
          class="text-end"
          :classes="['fs-7', 'text-nowrap', 'ms-2']"
          :action="() => removeUser(card._deleteAction.value)"
          icon="trash-can"
          :disabled="isLastAdminUser(card._deleteAction.value)"
          label="Remove user"
          variant="outline-secondary"
          :confirmation-label="
            userIsCurrentUser(card._deleteAction.value)
              ? 'Leave group'
              : card._deleteAction.value.pending === 'requested'
              ? `Deny request from <strong><em>${card._deleteAction.value.userName}</em></strong> to join project`
              : card._deleteAction.value.pending === 'invited'
              ? `Revoke invitation to <strong><em>${card._deleteAction.value.userName}</em></strong>`
              : `Remove <strong><em>${card._deleteAction.value.userName}</em></strong> from project`
          "
          alignment="right"
        />
      </div>
    </template>
    <template #user="{ cell }">
      <div class="d-flex align-items-center">
        <div>
          <span class="text-nowrap">{{ cell.value.userName }}</span>
          <b-badge
            v-if="userIsCurrentUser(cell.value)"
            variant="secondary"
            class="ms-2 fs-8"
            >You</b-badge
          >
          <b-badge
            v-else-if="cell.value.pending === 'requested'"
            variant="primary"
            class="ms-2 fs-8"
            >Wants to join</b-badge
          >
          <b-badge
            v-else-if="cell.value.pending === 'invited'"
            class="ms-2 fs-8"
            variant="warning"
            >Invited</b-badge
          >
        </div>
        <two-step-action-button
          v-if="cell.value.pending === 'requested'"
          class="text-end"
          :action="() => acceptPendingUser(cell.value)"
          icon="check"
          variant="outline-secondary"
          :confirmation-label="`Accept <strong><em>${cell.value.userName}</em></strong> into project`"
          label="Approve request"
          :classes="['fs-7', 'text-nowrap', 'ms-2']"
          alignment="centered"
        />
      </div>
    </template>
    <template #permissions="{ cell }">
      <div
        class="fs-7 text-secondary d-flex align-items-center"
        v-if="cell.value.admin"
      >
        <font-awesome-icon icon="check-circle" class="fs-6" />
        <span class="ps-2">admin</span>
      </div>

      <div
        class="fs-7 text-secondary d-flex align-items-center ms-3"
        v-if="cell.value.owner"
      >
        <font-awesome-icon icon="check-circle" class="fs-6" />
        <span class="ps-2">owner</span>
      </div>
      <button
        type="button"
        class="btn btn-outline-secondary d-flex align-items-center fs-7 text-nowrap ms-3"
        @click.prevent="() => editUserAdmin(cell.value)"
        :disabled="isLastOwnerUser(cell.value) && isLastAdminUser(cell.value)"
      >
        <font-awesome-icon icon="pencil-alt" />
        <span class="ps-2 change-permissions-btn-text">Change permissions</span>
      </button>
    </template>
    <template #_deleteAction="{ cell }">
      <two-step-action-button
        class="text-end"
        :classes="['fs-7', 'text-nowrap', 'ms-2']"
        variant="outline-secondary"
        :action="() => removeUser(cell.value)"
        icon="trash-can"
        :disabled="isLastAdminUser(cell.value)"
        :confirmation-label="
          userIsCurrentUser(cell.value)
            ? 'Leave group'
            : cell.value.pending === 'requested'
            ? `Deny request from <strong><em>${cell.value.userName}</em></strong> to join project`
            : cell.value.pending === 'invited'
            ? `Revoke invitation to <strong><em>${cell.value.userName}</em></strong>`
            : `Remove <strong><em>${cell.value.userName}</em></strong> from project`
        "
        alignment="right"
      />
    </template>
  </card-table>
  <project-invite-modal
    v-model="showInviteUserModal"
    @invited="loadProjectUsers"
  />
  <leave-project-modal v-model="selectedLeaveGroup" />
  <b-modal
    v-model="showEditPermissions"
    centered
    :title="`Edit permissions for ${editPermissionsForUser?.userName}`"
    ok-title="Update permissions"
    @hidden="permissions = []"
    @ok="updateUserPermissions"
  >
    <p>You can update a users' permissions for this project.</p>
    <p>
      Making a user into a project admin means they can do destructive actions
      like delete recordings, and can add and remove other project users.
    </p>
    <p>
      Making a user into a project owner designates them as a point-of-contact
      for the project, and means that they are ultimately responsible for the
      project.
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
.change-permissions-btn-text {
  display: inline;
}
@media screen and (max-width: 900px) {
  .change-permissions-btn-text {
    display: none;
  }
}
</style>
