<script setup lang="ts">
import { addNewGroup } from "@api/Group";
import { UserGroups } from "@models/LoggedInUser";
import { computed, ref, defineEmits, defineProps, watch } from "vue";
import type { ErrorResult } from "@api/types";
import { BModal } from "bootstrap-vue-3";
import { formFieldInputText, type FormInputValidationState } from "@/utils";

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

const emitClear = () => {
  console.log("Clearing");
  emit("finished");
};

const createNewGroupError = ref<ErrorResult | null>(null);
const createNewGroup = async () => {
  submittingCreateRequest.value = true;
  const groupName = newGroupName.value.trim();
  const createGroupResponse = await addNewGroup(groupName);
  if (createGroupResponse.success) {
    if (Array.isArray(UserGroups.value)) {
      UserGroups.value.push({
        groupName,
        id: createGroupResponse.result.groupId,
        admin: true,
      });

      // TODO: Save the current (new) group to the local user settings, and persist it to the server.
    }
  } else {
    createNewGroupError.value = createGroupResponse.result;
  }
  submittingCreateRequest.value = false;
  emitClear();
  newGroupName.value = "";
};
</script>
<template>
  <b-modal
    v-model="showModal"
    title="Create a new group"
    centered
    @hidden="emitClear"
  >
    <b-form>
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
    </b-form>
    <template #footer>
      <button
        class="btn btn-primary"
        @click.prevent.stop="createNewGroup"
        :disabled="submittingCreateRequest"
      >
        <span
          v-if="submittingCreateRequest"
          class="spinner-border spinner-border-sm"
        ></span>
        {{ submittingCreateRequest ? "Creating group" : "Create group" }}
      </button>
    </template>
  </b-modal>
</template>
