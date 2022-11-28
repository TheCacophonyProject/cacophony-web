<script setup lang="ts">
import { currentSelectedGroup } from "@models/LoggedInUser";
import type { SelectedGroup } from "@models/LoggedInUser";
import { formFieldInputText } from "@/utils";
import type { FormInputValidationState } from "@/utils";
import { computed, ref } from "vue";
import { BFormCheckboxGroup } from "bootstrap-vue-3";
import { inviteSomeoneToGroup } from "@api/Group";

const emit = defineEmits<{
  (e: "invited"): void;
}>();
const inviteeEmailAddress = formFieldInputText();
const submittingInvite = ref<boolean>(false);
const inviteSent = ref<boolean>(false);
const emailIsTooShort = computed<boolean>(
  () => inviteeEmailAddress.value.trim().length < 3
);
const isValidEmailAddress = computed<boolean>(() => {
  const { value } = inviteeEmailAddress;
  const email = value.trim();
  return !emailIsTooShort.value && email.includes("@");
});
const needsValidationAndIsValidEmailAddress =
  computed<FormInputValidationState>(() =>
    inviteeEmailAddress.touched ? isValidEmailAddress.value : undefined
  );
const resetFormValues = () => {
  inviteeEmailAddress.touched = false;
  inviteeEmailAddress.value = "";
  permissions.value = [];
};

const invitePendingUser = async () => {
  submittingInvite.value = true;
  const inviteResponse = await inviteSomeoneToGroup(
    (currentSelectedGroup.value as SelectedGroup).id,
    inviteeEmailAddress.value,
    permissions.value.includes("admin"),
    permissions.value.includes("owner")
  );
  if (inviteResponse.success) {
    inviteSent.value = true;
    emit("invited");
  } else {
    // TODO: Display error.
  }
  // If the user doesn't exist, we could create the user as a "pending" user.
  // If they do exist, we can add the group/user relationship with a "pending" flag?
  // If the user clicks the link and there's no pending flag waiting, that means the invitation has been revoked.
  // This means the user can't reuse a link to rejoin a group if they're removed.
  // Another option is just to have an invites table?
  submittingInvite.value = false;
};

const permissionsOptions = [
  { value: "admin", text: "Invite as a group admin" },
  { value: "owner", text: "Invite as a group owner" },
];

const permissions = ref<string[]>([]);
</script>
<template>
  <b-modal
    centered
    id="invite-someone-modal"
    @ok="invitePendingUser"
    ok-title="Send invitation"
    title="Invite someone"
    :ok-disabled="!isValidEmailAddress || submittingInvite"
    :cancel-disabled="submittingInvite"
    @hidden="resetFormValues"
  >
    <b-form>
      <p>
        You can invite someone to this group by entering their email here.
        They'll be sent an email with a link that will let them join your group.
      </p>
      <div class="input-group mb-3">
        <b-form-input
          type="email"
          v-model="inviteeEmailAddress.value"
          @blur="inviteeEmailAddress.touched = true"
          :state="needsValidationAndIsValidEmailAddress"
          aria-label="email address"
          placeholder="email address"
          :disabled="submittingInvite"
          data-cy="invitee email address"
          required
        />
        <b-form-invalid-feedback :state="needsValidationAndIsValidEmailAddress">
          <span>Enter a valid email address</span>
        </b-form-invalid-feedback>
      </div>
      <div class="input-group">
        <b-form-checkbox-group
          v-model="permissions"
          :options="permissionsOptions"
        />
      </div>
    </b-form>
  </b-modal>
</template>
