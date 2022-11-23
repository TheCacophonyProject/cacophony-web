<script setup lang="ts">
import { joiningNewGroup, UserGroups } from "@models/LoggedInUser";
import { formFieldInputText } from "@/utils";
import type { FormInputValidationState } from "@/utils";
import { computed, onMounted, ref } from "vue";
import { getGroupsForGroupAdminByEmail } from "@api/User";
import type { ApiGroupResponse } from "@typedefs/api/group";
import { requestToJoinGroup } from "@api/User";

const groupAdminEmailAddress = formFieldInputText();
const submittingJoinRequest = ref(false);
const groupChosen = ref<string>("");
const joinableGroups = ref<ApiGroupResponse[] | null>(null);
const emailIsTooShort = computed<boolean>(
  () => groupAdminEmailAddress.value.trim().length < 3
);

const joinableGroupsCheckboxOptions = computed<
  { text: string; value: string }[]
>(
  () =>
    (joinableGroups.value &&
      joinableGroups.value.map(({ id, groupName }) => ({
        text: groupName,
        value: id.toString(),
      }))) ||
    []
);

const isValidEmailAddress = computed<boolean>(() => {
  const { value } = groupAdminEmailAddress;
  const email = value.trim();
  return !emailIsTooShort.value && email.includes("@");
});
const needsValidationAndIsValidEmailAddress =
  computed<FormInputValidationState>(() =>
    groupAdminEmailAddress.touched ? isValidEmailAddress.value : undefined
  );

onMounted(() => {
  joiningNewGroup.visible = true;
});

const resetFormValues = () => {
  groupAdminEmailAddress.touched = false;
  groupAdminEmailAddress.value = "";
  joiningNewGroup.enabled = false;
};

const joinExistingGroup = async () => {
  // TODO:
  // Once an email address has been added, we should be able to get a list of the groups that
  // that user is an admin for, and list them so that the user can select which groups they want
  // to request permission to join.

  // FIXME - Now only allowing one group at a time to be requested.
  submittingJoinRequest.value = true;
  const joinRequestResponse = await requestToJoinGroup(
    groupAdminEmailAddress.value.trim(),
    Number(groupChosen.value)
  );
  if (joinRequestResponse.success) {
    // TODO Yay
  } else {
    // TODO Boo
  }
  submittingJoinRequest.value = false;
};

const getGroupsForAdmin = async () => {
  submittingJoinRequest.value = true;
  const groupsResponse = await getGroupsForGroupAdminByEmail(
    groupAdminEmailAddress.value.trim()
  );
  if (groupsResponse.success) {
    // Filter out any groups we're already a member of.
    const groups = groupsResponse.result.groups.filter(
      ({ id }) =>
        !(UserGroups.value || []).find(
          (existingGroup: ApiGroupResponse) => existingGroup.id === id
        )
    );
    if (groups.length === 0) {
      // Admin user has no groups we can join.
    }
    if (groups.length === 1) {
      groupChosen.value = groups[0].id.toString();
    }
    joinableGroups.value = groups;
  } else {
    // Maybe the user didn't exist, or wasn't an admin user of any groups.
  }
  submittingJoinRequest.value = false;
  //joiningNewGroup.visible = false;
};
</script>
<template>
  <b-modal
    v-model="joiningNewGroup.visible"
    title="Join a group"
    ok-title="Send join request"
    @ok="joinExistingGroup"
    :ok-disabled="!isValidEmailAddress || !groupChosen || submittingJoinRequest"
    :cancel-disabled="submittingJoinRequest"
    centered
    @hidden="resetFormValues"
  >
    <b-form>
      <p>
        To join an existing group, you need to know the email address of the
        group administrator.
      </p>
      <div class="input-group mb-3">
        <b-form-input
          type="email"
          v-model="groupAdminEmailAddress.value"
          @blur="groupAdminEmailAddress.touched = true"
          :state="needsValidationAndIsValidEmailAddress"
          aria-label="group admin email address"
          placeholder="group admin email address"
          :disabled="submittingJoinRequest"
          @input="joinableGroups = null"
          required
        />
        <b-form-invalid-feedback :state="needsValidationAndIsValidEmailAddress">
          <span>Enter a valid email address</span>
        </b-form-invalid-feedback>
      </div>
      <div
        class="input-group justify-content-end d-flex"
        v-if="!joinableGroups"
      >
        <button
          class="btn btn-primary"
          :disabled="!isValidEmailAddress || submittingJoinRequest"
          @click.stop.prevent="getGroupsForAdmin"
        >
          Next
        </button>
      </div>
      <div v-else-if="joinableGroups && joinableGroups.length === 0">
        <p>
          This user is not the administrator of any groups that you can join.
        </p>
      </div>
      <div v-else-if="joinableGroups && joinableGroups.length > 1">
        <p>Select the group you'd like to join.</p>
        <div>
          <b-form-radio-group
            stacked
            v-model="groupChosen"
            :options="joinableGroupsCheckboxOptions"
            id="available-groups"
            name="available-groups"
          />
        </div>
      </div>
    </b-form>
  </b-modal>
</template>
