<script setup lang="ts">
import { addNewGroup } from "@api/Group";
import {
  CurrentUser,
  setLoggedInUserData,
  UserGroups,
  type LoggedInUser, switchCurrentGroup,
} from "@models/LoggedInUser";
import { computed, nextTick, ref, watch } from "vue";
import type { ErrorResult } from "@api/types";
import { BModal } from "bootstrap-vue-3";
import { formFieldInputText, type FormInputValidationState } from "@/utils";
import type { ApiUserSettings } from "@typedefs/api/user";

const props = defineProps<{ show: boolean }>();
const emit = defineEmits(["finished"]);
const newGroupName = formFieldInputText();
const isValidGroupName = computed<boolean>(() => newGroupName.value !== "");
const needsValidationAndIsValidGroupName = computed<FormInputValidationState>(
  () => (newGroupName.touched ? isValidGroupName.value : null)
);

const showModal = ref(false);
const submittingCreateRequest = ref(false);
watch(props, (next) => {
  showModal.value = next.show;
});

const onHidden = () => {
  console.log("Hidden");
  newGroupName.value = "";
  newGroupName.touched = false;
  emit("finished");
};

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
      emit("finished");
      switchCurrentGroup({ groupName, id: newGroupId });
    } else {
      // User groups doesn't exist?
      debugger;
    }
  } else {
    // Allow latin unicode characters with accents in names, normalise them to ascii for urls.
    createNewGroupError.value = createGroupResponse.result;
    console.log(createNewGroupError.value);
  }
  submittingCreateRequest.value = false;
};
</script>
<template>
  <b-modal
    v-model="showModal"
    title="Create a new group"
    centered
    @hidden="onHidden"
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
