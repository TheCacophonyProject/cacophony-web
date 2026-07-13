<script setup lang="ts">
import { userProjectsLoaded } from "@models/LoggedInUser";
import type { LoggedInUser, SelectedProject } from "@models/LoggedInUser";
import {
  computed,
  defineAsyncComponent,
  inject,
  onBeforeMount,
  ref,
} from "vue";
import type { Ref } from "vue";
import { ClientApi } from "@/api";
import type { GroupId as ProjectId } from "@typedefs/api/common";
import type { ApiGroupUserResponse as ApiProjectUserResponse } from "@typedefs/api/group";
import CardTable from "@/components/CardTable.vue";
import type { CardTableRows, CardTableItem } from "@/components/CardTableTypes";
import LeaveProjectModal from "@/components/LeaveProjectModal.vue";

const ProjectInviteModal = defineAsyncComponent(
  () => import("@/components/ProjectInviteModal.vue"),
);
import {
  currentUser as currentUserInfo,
  currentSelectedProject as selectedProject,
} from "@models/provides";
import type { LoadedResource } from "@apiClient/types";
import SectionCard from "@/components/SectionCard.vue";
import TwoStepActionButton from "@/components/TwoStepActionButton.vue";
import {
  BAlert,
  BBadge,
  BForm,
  BFormCheckboxGroup,
  BModal,
  BSpinner,
  BTooltip,
} from "bootstrap-vue-next";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";

const projectUsers = ref<LoadedResource<ApiProjectUserResponse[]>>(null);
const loadingUsers = ref(false);
const fallibleCurrentUser = inject(currentUserInfo) as Ref<LoggedInUser | null>;
const fallibleCurrentSelectedProject = inject(
  selectedProject,
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
  projectUsers.value = await ClientApi.Projects.getUsersForProject(
    (currentSelectedProject.value as { groupName: string; id: ProjectId }).id,
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
    updateUserResponse = await ClientApi.Projects.addOrUpdateProjectUser(
      (currentSelectedProject.value as SelectedProject).groupName,
      permissions.value.includes("admin"),
      permissions.value.includes("owner"),
      user.id,
    );
  } else {
    // The user is invited, and the userName field is actually the email
    updateUserResponse = await ClientApi.Projects.addOrUpdateProjectUser(
      (currentSelectedProject.value as SelectedProject).groupName,
      permissions.value.includes("admin"),
      permissions.value.includes("owner"),
      undefined,
      user.userName,
    );
  }
  if (updateUserResponse.success) {
    await loadProjectUsers();
  }
};

const acceptPendingUser = async (user: ApiProjectUserResponse) => {
  // TODO: Loading state
  const acceptPendingUserResponse =
    await ClientApi.Projects.addOrUpdateProjectUser(
      (currentSelectedProject.value as SelectedProject).groupName,
      user.admin,
      user.owner,
      user.id,
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
      removeUserResponse = await ClientApi.Projects.removeProjectUser(
        (currentSelectedProject.value as SelectedProject).groupName,
        user.id,
      );
    } else {
      // The user is invited, and the userName field is actually the email
      removeUserResponse = await ClientApi.Projects.removeProjectUser(
        (currentSelectedProject.value as SelectedProject).groupName,
        undefined,
        user.userName,
      );
    }
    if (removeUserResponse.success) {
      // Removed user from project
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
        },
        _actions: {
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
  <div class="row mb-2 pb-2 pb-sm-0 mb-sm-4 mb-lg-5">
    <div class="col-lg-3">
      <h3 class="section-card-heading">Project users</h3>
      <p class="text-secondary pb-1">
        Manage the users associated with {{ currentSelectedProject.groupName }}.
      </p>
    </div>
    <div class="col-lg-9">
      <section-card>
        <template #header-title> Users</template>
        <template #header-action>
          <button
            type="button"
            class="btn btn-outline-secondary d-flex justify-content-center align-items-center ms-2"
            @click.stop.prevent="() => (showInviteUserModal = true)"
            data-cy="invite someone to project button"
          >
            <material-symbol name="mail" size="1.25rem" />
            <span class="ps-2">Invite someone</span>
          </button>
        </template>
        <div
          v-if="loadingUsers"
          class="d-flex align-items-center justify-content-center"
        >
          <b-spinner variant="secondary" />
        </div>
        <card-table :items="tableItems" compact v-else :max-card-width="575">
          <template #card="{ card }">
            <div class="d-flex justify-content-between align-items-center">
              <div class="w-100 overflow-hidden">
                <div>
                  <span class="w-100 me-2 text-break">{{
                    card.user.value.userName
                  }}</span>
                  <b-badge
                    v-if="userIsCurrentUser(card.user.value)"
                    variant="dark"
                    >You
                  </b-badge>
                </div>
                <div class="d-flex">
                  <div class="d-flex gap-2">
                    <b-badge
                      v-if="card.permissions.value.admin"
                      variant="light"
                      bg-variant="primary-subtle"
                      class="mt-2"
                      >Admin
                    </b-badge>

                    <b-badge
                      v-if="card.permissions.value.owner"
                      variant="light"
                      bg-variant="success-subtle"
                      class="mt-2"
                      >Owner
                    </b-badge>
                  </div>
                </div>
                <div>
                  <b-badge
                    v-if="card.user.value.pending === 'requested'"
                    variant="primary"
                    class="mt-2"
                    >Wants to join
                  </b-badge>
                  <b-badge
                    v-else-if="card.user.value.pending === 'invited'"
                    variant="warning"
                    class="mt-2"
                    >Invited
                  </b-badge>
                </div>
              </div>
              <div class="d-flex justify-content-end align-items-center">
                <button
                  type="button"
                  class="btn btn-icon d-flex align-items-center justify-content-center"
                  @click.prevent="() => editUserAdmin(card.permissions.value)"
                  :disabled="
                    isLastOwnerUser(card.permissions.value) &&
                    isLastAdminUser(card.permissions.value)
                  "
                  aria-label="Change user permissions"
                >
                  <material-symbol name="manage_accounts" size="1.25rem" />
                  <span class="visually-hidden">Change permissions</span>
                </button>
                <two-step-action-button
                  :action="() => removeUser(card._actions.value)"
                  icon="delete"
                  :disabled="isLastAdminUser(card._actions.value)"
                  :confirmation-extra="
                    userIsCurrentUser(card._actions.value)
                      ? `Leave group? You won't be able to access this group anymore.`
                      : card._actions.value.pending === 'requested'
                        ? `Deny request from <strong>${card._actions.value.userName}</strong> to join project?`
                        : card._actions.value.pending === 'invited'
                          ? `Revoke invitation to <strong>${card._actions.value.userName}</strong>?`
                          : `Remove <strong>${card._actions.value.userName}</strong> from project?`
                  "
                  aria-label="Remove user"
                  :tooltip-label="
                    userIsCurrentUser(card._actions.value)
                      ? 'Leave project'
                      : card._actions.value.pending === 'requested'
                        ? `Deny request`
                        : card._actions.value.pending === 'invited'
                          ? `Revoke invitation`
                          : `Remove`
                  "
                  :confirmation-label="
                    userIsCurrentUser(card._actions.value)
                      ? 'Leave group'
                      : card._actions.value.pending === 'requested'
                        ? `Deny request`
                        : card._actions.value.pending === 'invited'
                          ? `Revoke invitation`
                          : `Remove from project`
                  "
                />
              </div>
            </div>
            <two-step-action-button
              v-if="card.user.value.pending === 'requested'"
              :action="() => acceptPendingUser(card.user.value)"
              icon="check"
              :confirmation-extra="`Accept <strong>${card.user.value.userName}</strong> into group?`"
              :confirmation-label="`Accept`"
              label="Approve request"
              class="mt-2"
              placement="top"
              :confirmation-btn-variant-class="`btn-secondary`"
              :classes="['ms-auto']"
            />
          </template>
          <template #user="{ cell }">
            <div class="d-flex align-items-center">
              <div>
                <span class="text-nowrap me-2">{{ cell.value.userName }}</span>
                <b-badge v-if="userIsCurrentUser(cell.value)" bg-variant="dark"
                  >You
                </b-badge>
                <b-badge
                  v-else-if="cell.value.pending === 'requested'"
                  variant="success"
                  >Wants to join
                </b-badge>
                <b-badge
                  v-else-if="cell.value.pending === 'invited'"
                  variant="warning"
                  >Invited
                </b-badge>
              </div>
            </div>
          </template>
          <template #permissions="{ cell }">
            <div v-if="cell" class="d-flex flex-fill align-items-center gap-2">
              <b-badge
                v-if="cell.value.admin"
                variant="light"
                bg-variant="primary-subtle"
                >Admin
              </b-badge>

              <b-badge
                v-if="cell.value.owner"
                variant="light"
                bg-variant="success-subtle"
                >Owner
              </b-badge>
            </div>
          </template>
          <template #_actions="{ cell }">
            <div class="d-flex">
              <two-step-action-button
                v-if="cell.value.pending === 'requested'"
                :action="() => acceptPendingUser(cell.value)"
                :confirmation-extra="`Accept <strong>${cell.value.userName}</strong> into project?`"
                :confirmation-label="`Accept`"
                label="Approve request"
                icon="check"
                tooltip-label="Approve"
                alignment="centered"
                class="text-nowrap"
                :confirmation-btn-variant-class="`btn-secondary`"
              />
              <b-tooltip placement="right">
                <template #target>
                  <button
                    type="button"
                    class="btn btn-icon d-flex align-items-center"
                    aria-label="Change user permissions"
                    @click.prevent="() => editUserAdmin(cell.value)"
                    :disabled="
                      isLastOwnerUser(cell.value) && isLastAdminUser(cell.value)
                    "
                  >
                    <material-symbol name="manage_accounts" size="1.25rem" />
                    <span class="visually-hidden">Change permissions</span>
                  </button>
                </template>
                Change user permissions
              </b-tooltip>
              <two-step-action-button
                :action="() => removeUser(cell.value)"
                :classes="['text-nowrap']"
                icon="delete"
                :disabled="isLastAdminUser(cell.value)"
                :confirmation-extra="
                  userIsCurrentUser(cell.value)
                    ? `Leave group? You won't be able to access this group anymore.`
                    : cell.value.pending === 'requested'
                      ? `Deny request from <strong>${cell.value.userName}</strong> to join project?`
                      : cell.value.pending === 'invited'
                        ? `Revoke invitation to <strong>${cell.value.userName}</strong>?`
                        : `Remove <strong>${cell.value.userName}</strong> from project?`
                "
                :confirmation-label="
                  userIsCurrentUser(cell.value)
                    ? 'Leave group'
                    : cell.value.pending === 'requested'
                      ? `Deny request`
                      : cell.value.pending === 'invited'
                        ? `Revoke invitation`
                        : `Remove from project`
                "
                :tooltip-label="
                  userIsCurrentUser(cell.value)
                    ? 'Leave project'
                    : cell.value.pending === 'requested'
                      ? `Deny request`
                      : cell.value.pending === 'invited'
                        ? `Revoke invitation`
                        : `Remove`
                "
                alignment="right"
              />
            </div>
          </template>
        </card-table>
      </section-card>
    </div>
  </div>

  <project-invite-modal
    v-model="showInviteUserModal"
    @invited="loadProjectUsers"
  />
  <leave-project-modal v-model="selectedLeaveGroup" />
  <b-modal
    v-model="showEditPermissions"
    centered
    title="Edit user permissions"
    ok-title="Update permissions"
    @hidden="permissions = []"
    @ok="updateUserPermissions"
  >
    <p>
      Edit project permissions for
      <span class="fw-semibold">{{ editPermissionsForUser?.userName }}</span
      >.
    </p>
    <b-form>
      <div class="input-group mt-2">
        <b-form-checkbox-group
          v-model="permissions"
          :options="permissionsOptions"
        />
      </div>
    </b-form>
    <b-alert :model-value="true" variant="light" class="mt-3 mb-0">
      <div class="description d-flex">
        <material-symbol
          name="info"
          class="d-none d-sm-inline me-2"
          size="1.25rem"
        />
        <div>
          <p class="mb-2">
            <span class="fw-medium">Project admins</span> can do destructive
            actions (such as deleting recordings) and can add and remove project
            users.
          </p>
          <p class="mb-0">
            <span class="fw-medium">Project owners</span> are the
            point-of-contact for the project, and are ultimately responsible for
            it.
          </p>
        </div>
      </div>
    </b-alert>
  </b-modal>
</template>
<style lang="less" scoped></style>
