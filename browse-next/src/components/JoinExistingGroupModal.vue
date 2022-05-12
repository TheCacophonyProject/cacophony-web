<script setup lang="ts">
import { joiningNewGroup } from "@models/LoggedInUser";
import { formFieldInputText } from "@/utils";
import type { FormInputValidationState } from "@/utils";
import { computed, ref } from "vue";

const groupAdminEmailAddress = formFieldInputText();
const submittingJoinRequest = ref(false);
const emailIsTooShort = computed<boolean>(
  () => groupAdminEmailAddress.value.trim().length < 3
);
const isValidEmailAddress = computed<boolean>(() => {
  const { value } = groupAdminEmailAddress;
  const email = value.trim();
  return !emailIsTooShort.value && email.includes("@");
});
const needsValidationAndIsValidEmailAddress =
  computed<FormInputValidationState>(() =>
    groupAdminEmailAddress.touched ? isValidEmailAddress.value : null
  );

const resetFormValues = () => {
  groupAdminEmailAddress.touched = false;
  groupAdminEmailAddress.value = "";
};

const joinExistingGroup = () => {
  // TODO:
  // Once an email address has been added, we should be able to get a list of the groups that
  // that user is an admin for, and list them so that the user can select which groups they want
  // to request permission to join.
  console.log("Join a group");
};
</script>
<template>
  <b-modal
    v-model="joiningNewGroup"
    title="Join a group"
    ok-title="Send join request"
    @ok="joinExistingGroup"
    :ok-disabled="!isValidEmailAddress || submittingJoinRequest"
    :cancel-disabled="submittingJoinRequest"
    centered
    @hidden="resetFormValues"
  >
    <b-form>
      <p>
        To join an existing group, you need to know the email address of a group
        administrator.
      </p>
      <b-form-input
        type="email"
        v-model="groupAdminEmailAddress.value"
        @blur="groupAdminEmailAddress.touched = true"
        :state="needsValidationAndIsValidEmailAddress"
        aria-label="group admin email address"
        placeholder="group admin email address"
        :disabled="submittingJoinRequest"
        required
      />
      <b-form-invalid-feedback :state="needsValidationAndIsValidEmailAddress">
        <span>Enter a valid email address</span>
      </b-form-invalid-feedback>
    </b-form>
  </b-modal>
</template>
