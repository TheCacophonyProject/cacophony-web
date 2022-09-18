<script setup lang="ts">
import { joiningNewGroup, UserGroups } from "@models/LoggedInUser";
import { formFieldInputText } from "@/utils";
import type { FormInputValidationState } from "@/utils";
import { computed, onBeforeMount, reactive, ref } from "vue";
import { getGroupsForGroupAdminByEmail } from "@api/User";
import type { ApiGroupResponse } from "@typedefs/api/group";
import { BFormCheckboxGroup } from "bootstrap-vue-3";
import { requestToJoinGroups } from "@api/User";

const groupAdminEmailAddress = formFieldInputText();
const submittingJoinRequest = ref(false);
let groupsChosen = ref(reactive<ApiGroupResponse[]>([]));
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

onBeforeMount(() => {
  joiningNewGroup.enabled = true;
});

const resetFormValues = () => {
  groupAdminEmailAddress.touched = false;
  groupAdminEmailAddress.value = "";
  joiningNewGroup.visible = false;
};

const joinExistingGroup = async () => {
  // TODO:
  // Once an email address has been added, we should be able to get a list of the groups that
  // that user is an admin for, and list them so that the user can select which groups they want
  // to request permission to join.
  console.log("Join a group");
  submittingJoinRequest.value = true;
  const joinRequestResponse = await requestToJoinGroups(
    groupAdminEmailAddress.value.trim(),
    groupsChosen.value.map(({ id }) => id)
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
      groupsChosen.value = reactive(groups);
      console.log("Default group chosen");
    }
    joinableGroups.value = groups;
  } else {
    // Maybe the user didn't exist, or wasn't an admin user of any groups.
  }
  submittingJoinRequest.value = false;
};
</script>
<template>
  <b-modal
    v-model="joiningNewGroup.enabled"
    title="Join a group"
    ok-title="Send join request"
    @ok="joinExistingGroup"
    :ok-disabled="
      !isValidEmailAddress || !groupsChosen.length || submittingJoinRequest
    "
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
          :disabled="!isValidEmailAddress"
          @click.stop.prevent="getGroupsForAdmin"
        >
          Next
        </button>
      </div>
      <div v-else-if="joinableGroups && joinableGroups.length > 1">
        <p>Select the group(s) you'd like to join.</p>
        <div>
          <b-form-checkbox-group
            stacked
            v-model="groupsChosen"
            :options="joinableGroupsCheckboxOptions"
            id="available-groups"
            name="available-groups"
          />
        </div>
      </div>
    </b-form>
  </b-modal>
</template>
