<script setup lang="ts">
import { addNewProject } from "@api/Project";
import {
  UserProjects,
  switchCurrentProject,
  creatingNewProject,
  urlNormalisedCurrentProjectName,
} from "@models/LoggedInUser";
import { computed, onMounted, ref } from "vue";
import type { ErrorResult } from "@api/types";
import { BModal } from "bootstrap-vue-next";
import { formFieldInputText } from "@/utils";
import type { FormInputValidationState } from "@/utils";
import { useRouter } from "vue-router";

const newProjectName = formFieldInputText();
const isValidProjectName = computed<boolean>(
  () => newProjectName.value !== "" && newProjectName.value.length > 2,
);
const needsValidationAndIsValidProjectName = computed<FormInputValidationState>(
  () => (newProjectName.touched ? isValidProjectName.value : undefined),
);

const submittingCreateRequest = ref(false);
const resetFormValues = () => {
  newProjectName.value = "";
  newProjectName.touched = false;
  creatingNewProject.enabled = false;
};

onMounted(() => {
  creatingNewProject.visible = true;
});

const router = useRouter();
const createNewProjectError = ref<ErrorResult | null>(null);
const createNewProject = async () => {
  submittingCreateRequest.value = true;
  const projectName = newProjectName.value.trim();
  const createProjectResponse = await addNewProject(projectName);
  if (createProjectResponse.success) {
    if (Array.isArray(UserProjects.value)) {
      const newProjectId = createProjectResponse.result.groupId;
      UserProjects.value.push({
        groupName: projectName,
        id: createProjectResponse.result.groupId,
        admin: true,
        owner: true,
      });
      UserProjects.value.sort((a, b) => a.groupName.localeCompare(b.groupName));
      switchCurrentProject({ groupName: projectName, id: newProjectId });
      await router.push({
        name: "project-settings",
        params: { projectName: urlNormalisedCurrentProjectName.value },
      });
      creatingNewProject.visible = false;
    } else {
      // User groups doesn't exist?
      // FIXME -- Existing group name needs error message.
      console.error("FIXME");
    }
  } else {
    // Allow latin unicode characters with accents in names, normalise them to ascii for urls.
    createNewProjectError.value = createProjectResponse.result;
  }
  submittingCreateRequest.value = false;
};
</script>
<template>
  <b-modal
    v-model="creatingNewProject.visible"
    title="Create a new project"
    centered
    @hidden="resetFormValues"
  >
    <b-form @submit.stop.prevent="createNewProject">
      <b-form-input
        type="text"
        placeholder="project name"
        data-cy="new project name"
        v-model="newProjectName.value"
        @blur="newProjectName.touched = true"
        @input="newProjectName.touched = true"
        :state="needsValidationAndIsValidProjectName"
        :disabled="submittingCreateRequest"
      />
      <b-form-invalid-feedback :state="needsValidationAndIsValidProjectName">
        <span v-if="newProjectName.value.trim().length === 0">
          Project name cannot be blank
        </span>
        <span v-else-if="newProjectName.value.trim().length < 3">
          Project name must be at least 3 characters
        </span>
      </b-form-invalid-feedback>
    </b-form>
    <template #footer>
      <button
        class="btn btn-primary"
        type="submit"
        data-cy="create project button"
        @click.stop.prevent="createNewProject"
        :disabled="
          !needsValidationAndIsValidProjectName || submittingCreateRequest
        "
      >
        <span
          v-if="submittingCreateRequest"
          class="spinner-border spinner-border-sm"
        ></span>
        {{ submittingCreateRequest ? "Creating project" : "Create project" }}
      </button>
    </template>
  </b-modal>
</template>
