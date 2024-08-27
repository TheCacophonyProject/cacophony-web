<script setup lang="ts">
import {
  joiningNewProject,
  refreshUserProjects,
  UserProjects,
} from "@models/LoggedInUser";
import { formFieldInputText } from "@/utils";
import type { FormInputValidationState } from "@/utils";
import { computed, onMounted, ref } from "vue";
import { getProjectsForProjectAdminByEmail } from "@api/User";
import type { ApiGroupResponse as ApiProjectResponse } from "@typedefs/api/group";
import { requestToJoinGroup } from "@api/User";
import type { LoadedResource } from "@api/types.ts";

const projectAdminEmailAddress = formFieldInputText();
const submittingJoinRequest = ref(false);
const projectChosen = ref<string>("");
const joinableProjects = ref<LoadedResource<ApiProjectResponse[]>>(null);
const hasJoinableProjects = computed<boolean>(
  () => !!joinableProjects.value && joinableProjects.value.length !== 0
);
const hasMultipleJoinableProjects = computed<boolean>(
  () => !!joinableProjects.value && joinableProjects.value.length > 1
);
const emailIsTooShort = computed<boolean>(
  () => projectAdminEmailAddress.value.trim().length < 3
);

const joinableProjectsLoaded = computed<boolean>(
  () => !!joinableProjects.value
);

const joinableProjectsCheckboxOptions = computed<
  { text: string; value: string }[]
>(
  () =>
    (joinableProjects.value &&
      (joinableProjects.value as ApiProjectResponse[]).map(
        ({ id, groupName }) => ({
          text: groupName,
          value: id.toString(),
        })
      )) ||
    []
);

const isValidEmailAddress = computed<boolean>(() => {
  const { value } = projectAdminEmailAddress;
  const email = value.trim();
  return !emailIsTooShort.value && email.includes("@") && !email.includes(" ");
});
const needsValidationAndIsValidEmailAddress =
  computed<FormInputValidationState>(() =>
    projectAdminEmailAddress.touched ? isValidEmailAddress.value : undefined
  );

onMounted(() => {
  joiningNewProject.visible = true;
});

const resetFormValues = () => {
  projectAdminEmailAddress.touched = false;
  projectAdminEmailAddress.value = "";
  joiningNewProject.enabled = false;
};

const joinExistingGroup = async () => {
  submittingJoinRequest.value = true;
  const joinRequestResponse = await requestToJoinGroup(
    projectAdminEmailAddress.value.trim(),
    Number(projectChosen.value)
  );
  if (joinRequestResponse.success) {
    // Groups changed, reload groups.
    await refreshUserProjects();

    // TODO Yay
  } else {
    // TODO Boo
  }
  submittingJoinRequest.value = false;
};

const getGroupsForAdmin = async () => {
  submittingJoinRequest.value = true;
  const projectsResponse = await getProjectsForProjectAdminByEmail(
    projectAdminEmailAddress.value.trim()
  );
  if (projectsResponse.success) {
    // Filter out any groups we're already a member of.
    const groups = projectsResponse.result.groups.filter(
      ({ id }) =>
        !(UserProjects.value || []).find(
          (existingGroup: ApiProjectResponse) => existingGroup.id === id
        )
    );
    if (groups.length === 0) {
      // Admin user has no groups we can join.
    }
    if (groups.length === 1) {
      projectChosen.value = groups[0].id.toString();
    }
    joinableProjects.value = groups;
  } else {
    // Maybe the user didn't exist, or wasn't an admin user of any groups.
  }
  submittingJoinRequest.value = false;
  //joiningNewGroup.visible = false;
};
</script>
<template>
  <b-modal
    v-model="joiningNewProject.visible"
    title="Join a group"
    ok-title="Send join request"
    @ok="joinExistingGroup"
    :ok-disabled="
      !isValidEmailAddress || !projectChosen || submittingJoinRequest
    "
    :cancel-disabled="submittingJoinRequest"
    centered
    @hidden="resetFormValues"
  >
    <b-form data-cy="join existing group form">
      <p>
        To join an existing project, you need to know the email address of the
        project administrator.
      </p>
      <div class="input-group mb-3">
        <b-form-input
          type="email"
          v-model="projectAdminEmailAddress.value"
          @blur="projectAdminEmailAddress.touched = true"
          :state="needsValidationAndIsValidEmailAddress"
          aria-label="project admin email address"
          placeholder="project admin email address"
          data-cy="project admin email address"
          :disabled="submittingJoinRequest"
          @input="joinableProjects = null"
          required
        />
        <b-form-invalid-feedback :state="needsValidationAndIsValidEmailAddress">
          <span>Enter a valid email address</span>
        </b-form-invalid-feedback>
      </div>
      <div
        class="input-group justify-content-end d-flex"
        v-if="!joinableProjectsLoaded"
      >
        <button
          class="btn btn-primary"
          data-cy="list joinable projects button"
          :disabled="!isValidEmailAddress || submittingJoinRequest"
          @click.stop.prevent="getGroupsForAdmin"
        >
          Next
        </button>
      </div>
      <div v-else-if="!hasJoinableProjects">
        <p>
          This user is not the administrator of any projects that you can join.
        </p>
      </div>
      <div v-else-if="hasMultipleJoinableProjects">
        <p>Select the project you'd like to join.</p>
        <div>
          <b-form-radio-group
            stacked
            v-model="projectChosen"
            :options="joinableProjectsCheckboxOptions"
            id="available-groups"
            name="available-groups"
          />
        </div>
      </div>
    </b-form>
  </b-modal>
</template>
