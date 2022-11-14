<script setup lang="ts">
import { addNewGroup } from "@api/Group";
import {
  UserGroups,
  switchCurrentGroup,
  creatingNewGroup,
  urlNormalisedCurrentGroupName,
} from "@models/LoggedInUser";
import { computed, onBeforeMount, onMounted, ref } from "vue";
import type { ErrorResult } from "@api/types";
import { BModal } from "bootstrap-vue-3";
import { formFieldInputText } from "@/utils";
import type { FormInputValidationState } from "@/utils";
import { useRouter } from "vue-router";

const newGroupName = formFieldInputText();
const isValidGroupName = computed<boolean>(() => newGroupName.value !== "");
const needsValidationAndIsValidGroupName = computed<FormInputValidationState>(
  () => (newGroupName.touched ? isValidGroupName.value : undefined)
);

const submittingCreateRequest = ref(false);
const resetFormValues = () => {
  newGroupName.value = "";
  newGroupName.touched = false;
  creatingNewGroup.enabled = false;
};

onMounted(() => {
  console.log("Mounted");
  creatingNewGroup.visible = true;
});

const router = useRouter();
const createNewGroupError = ref<ErrorResult | null>(null);
const createNewGroup = async () => {
  submittingCreateRequest.value = true;
  const groupName = newGroupName.value.trim();
  const createGroupResponse = await addNewGroup(groupName);
  if (createGroupResponse.success) {
    if (Array.isArray(UserGroups.value)) {
      const newGroupId = createGroupResponse.result.groupId;
      UserGroups.value.push({
        groupName,
        id: createGroupResponse.result.groupId,
        admin: true,
      });
      UserGroups.value.sort((a, b) => a.groupName.localeCompare(b.groupName));
      switchCurrentGroup({ groupName, id: newGroupId });
      await router.push({
        name: "group-settings",
        params: { groupName: urlNormalisedCurrentGroupName.value },
      });
      creatingNewGroup.visible = false;
    } else {
      // User groups doesn't exist?
      console.error("FIXME");
    }
  } else {
    // Allow latin unicode characters with accents in names, normalise them to ascii for urls.
    createNewGroupError.value = createGroupResponse.result;
  }
  submittingCreateRequest.value = false;
};
</script>
<template>
  <b-modal
    v-model="creatingNewGroup.visible"
    title="Create a new group"
    centered
    @hidden="resetFormValues"
  >
    <b-form @submit.stop.prevent="createNewGroup">
      <b-form-input
        type="text"
        placeholder="group name"
        v-model="newGroupName.value"
        @blur="newGroupName.touched = true"
        :state="needsValidationAndIsValidGroupName"
        :disabled="submittingCreateRequest"
      />
      <b-form-invalid-feedback :state="needsValidationAndIsValidGroupName">
        <span v-if="newGroupName.value.trim().length === 0">
          Group name cannot be blank
        </span>
        <span v-else-if="newGroupName.value.trim().length <= 8">
          Group name must be at least 8 characters // TODO - group name regex
          (include macrons)
        </span>
      </b-form-invalid-feedback>
      <template #footer>
        <button
          class="btn btn-primary"
          type="submit"
          :disabled="submittingCreateRequest"
        >
          <span
            v-if="submittingCreateRequest"
            class="spinner-border spinner-border-sm"
          ></span>
          {{ submittingCreateRequest ? "Creating group" : "Create group" }}
        </button>
      </template>
    </b-form>
  </b-modal>
</template>
