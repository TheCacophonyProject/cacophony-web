<script setup lang="ts">
import {
  creatingNewGroup,
  CurrentUser,
  joiningNewGroup,
  refreshLocallyStoredUserActivation,
  userDisplayName,
  userHasConfirmedEmailAddress,
  userHasGroups,
  userHasPendingGroups,
  pendingUserGroups,
  refreshUserGroups,
  urlNormalisedCurrentGroupName,
} from "@models/LoggedInUser";
import {
  acceptGroupInvitation,
  changeAccountEmail,
  resendAccountActivationEmail as resendEmail,
} from "@api/User";
import { computed, onBeforeMount, onUnmounted, ref } from "vue";
import type { FormInputValidationState, FormInputValue } from "@/utils";
import { formFieldInputText } from "@/utils";
import CardTable from "@/components/CardTable.vue";
import type { ApiGroupResponse } from "@typedefs/api/group";
import { useRoute, useRouter } from "vue-router";

// TODO: Stop admins adding users without confirmed email addresses.
//  Maybe the list users api should only return "active/verified" users.
//  User JWT tokens get an 'activated: false' property, which means that they can't be used via certain API endpoints.

const submittingResendActivationRequest = ref(false);
const resendRequestSent = ref(false);

const router = useRouter();
const route = useRoute();
const emailAddressUpdated = ref(route.query.updated === "true");

onBeforeMount(async () => {
  if (route.query.updated) {
    // Redirect to remove param
    await router.replace({
      name: "setup",
    });
  }
});

const emailUpdateInProgress = ref(false);
const resendError = ref<null | string>(null);
const emailUpdateError = ref<string | false>(false);
const newUserEmailAddress: FormInputValue = formFieldInputText();

const hasError = computed({
  get: () => {
    return emailUpdateError.value !== false;
  },
  set: (val: boolean) => {
    if (!val) {
      emailUpdateError.value = false;
    }
  },
});

const checkForActivatedUser = () => {
  // NOTE: The user can click the email confirmation link, which opens up in another window, and should
  //  update the localStorage user.  So, this page should try to refresh the user from localStorage regularly,
  //  to respond when that happens.
  if (!CurrentUser.value?.emailConfirmed) {
    const userIsActivated = refreshLocallyStoredUserActivation();
    if (userIsActivated) {
      clearInterval(userChecker);
    }
  } else {
    clearInterval(userChecker);
  }
};

const userChecker = setInterval(checkForActivatedUser, 1000);

onUnmounted(() => {
  clearInterval(userChecker);
});

const updateEmailAddress = async () => {
  emailUpdateInProgress.value = true;
  const emailUpdateResponse = await changeAccountEmail(
    newUserEmailAddress.value
  );
  if (emailUpdateResponse.success) {
    emailAddressUpdated.value = true;
  } else {
    const err =
      emailUpdateResponse.result.errors && emailUpdateResponse.result.errors[0];
    if (err) {
      emailUpdateError.value = typeof err === "string" ? err : err.msg;
    }
  }
  emailUpdateInProgress.value = false;
};

const acceptingInvite = ref<boolean>(false);
const acceptInvitationToGroup = async (group: ApiGroupResponse) => {
  acceptingInvite.value = true;
  const acceptInviteResponse = await acceptGroupInvitation(group.id);
  if (acceptInviteResponse.success) {
    await refreshUserGroups();
    await router.push({
      name: "dashboard",
      params: {
        groupName: urlNormalisedCurrentGroupName.value,
      },
    });
  }
  acceptingInvite.value = false;
};

const resendAccountActivationEmail = async () => {
  submittingResendActivationRequest.value = true;
  const resendResponse = await resendEmail();
  if (resendResponse.success) {
    resendRequestSent.value = true;
  } else {
    resendError.value =
      "We were unable to re-send your account activation email.";
  }
  submittingResendActivationRequest.value = false;
};

const isValidEmailAddress = computed<boolean>(() => {
  const { value } = newUserEmailAddress;
  const email = value.trim();
  return !emailUpdateError.value && email.length > 3 && email.includes("@");
});

const needsValidationAndIsValidEmailAddress =
  computed<FormInputValidationState>(() =>
    newUserEmailAddress.touched ? isValidEmailAddress.value : undefined
  );

const pendingGroupTableItems = computed(() => {
  return pendingUserGroups.value.map((group) => {
    const item: {
      groupName: string;
      status: { value: ApiGroupResponse };
      permissions?: { value: ApiGroupResponse };
    } = {
      groupName: group.groupName,
      status: { value: group },
    };
    if (group.admin || group.owner) {
      item.permissions = { value: group };
    }
    return item;
  });
});

// const router = useRouter();
// const debugConfirmEmail = async () => {
//   const tokenResponse = await debugGetEmailConfirmationToken(
//     CurrentUser.value?.email as string
//   );
//   if (tokenResponse.success) {
//     const token = tokenResponse.result.token;
//     const validateTokenResponse = await validateEmailConfirmationToken(token);
//     if (validateTokenResponse.success) {
//       const { userData, token, refreshToken, signOutUser } =
//         validateTokenResponse.result;
//       if (signOutUser) {
//         await router.push({ name: "sign-out" });
//         return;
//       }
//       setLoggedInUserData({
//         ...userData,
//         apiToken: token,
//         refreshToken,
//         refreshingToken: false,
//       });
//
//       await router.push({
//         path: "/",
//       });
//     }
//   }
// };
</script>
<template>
  <div
    class="setup-form p-4 pb-3"
    :class="{ 'groups-setup': userHasConfirmedEmailAddress && !userHasGroups }"
    v-if="CurrentUser"
  >
    <h1>Finish setting up your account</h1>
    <div>
      <span class="h3">
        Kia ora <span>{{ userDisplayName }}</span>
      </span>
    </div>
    <div v-if="!userHasConfirmedEmailAddress && !userHasGroups">
      <p class="mt-3">
        Welcome to your new Cacophony account. You should have received an email
        with a link to confirm your email address
        <strong>{{ CurrentUser?.email }}</strong
        >. Before you can get setup, we need you click the link in that email to
        activate your account.
      </p>
      <p>
        <button
          class="btn btn-secondary"
          type="button"
          data-cy="resend confirmation email"
          @click="resendAccountActivationEmail"
          :disabled="resendRequestSent"
        >
          <span v-if="submittingResendActivationRequest">
            <span class="spinner-border spinner-border-sm"></span> Re-sending...
          </span>
          <span v-else> Re-send my confirmation email. </span>
        </button>
      </p>
      <p class="alert alert-secondary">
        NOTE: If you can't find the email we sent, make sure to check your spam
        folder.
      </p>
    </div>
    <div v-else-if="!userHasConfirmedEmailAddress">
      <p class="mt-3">Welcome to your Cacophony account.</p>
      <p>Before you can continue, we need to confirm your email address.</p>
      <div v-if="CurrentUser?.email && !emailAddressUpdated">
        <hr />
        <p v-if="!emailAddressUpdated && CurrentUser?.email" class="mt-3">
          If <strong>{{ CurrentUser?.email }}</strong> is the email address you
          currently use, and you <em>haven't</em> just received an email with a
          confirmation link, you can click this button to resend your email
          confirmation email.
        </p>
        <p
          v-if="!emailAddressUpdated"
          class="mt-3 d-flex flex-md-row flex-column justify-content-md-between align-items-start"
        >
          <button
            class="btn btn-secondary me-3 mb-3"
            type="button"
            data-cy="send account confirmation email"
            @click="resendAccountActivationEmail"
            :disabled="resendRequestSent || emailUpdateInProgress"
          >
            <span v-if="submittingResendActivationRequest">
              <span class="spinner-border spinner-border-sm"></span> Sending...
            </span>
            <span v-else>Send account confirmation email. </span>
          </button>
        </p>
      </div>
      <p v-else-if="!CurrentUser?.email">
        There is no email address associated with your account. Please enter
        one.
      </p>
      <div v-if="!emailAddressUpdated">
        <hr />
        <p v-if="CurrentUser?.email">
          <strong
            >If this is NOT the email address you use, update it now:</strong
          >
        </p>
        <b-form @submit.stop.prevent="updateEmailAddress" novalidate>
          <b-alert
            v-model="hasError"
            variant="danger"
            dismissible
            class="text-center"
            @dismissed="hasError = false"
          >
            {{ emailUpdateError }}
          </b-alert>
          <div class="d-flex">
            <b-form-input
              type="email"
              v-model="newUserEmailAddress.value"
              @blur="newUserEmailAddress.touched = true"
              @focus="emailUpdateError = false"
              :state="needsValidationAndIsValidEmailAddress"
              data-cy="new email address"
              aria-label="new email address"
              placeholder="new email address"
              :disabled="emailUpdateInProgress"
            />
            <button
              class="btn btn-secondary ms-3"
              type="submit"
              data-cy="update email address button"
              :disabled="!isValidEmailAddress || emailUpdateInProgress"
            >
              <span v-if="emailUpdateInProgress">
                <span class="spinner-border spinner-border-sm"></span>
                <span v-if="CurrentUser?.email">Updating...</span
                ><span v-else>Adding...</span>
              </span>
              <span v-else>
                <span v-if="CurrentUser?.email">Update</span
                ><span v-else>Add</span>
              </span>
            </button>
          </div>
        </b-form>
        <b-form-invalid-feedback :state="needsValidationAndIsValidEmailAddress">
          Enter a valid email address
        </b-form-invalid-feedback>
      </div>
      <p v-else>
        Your email address has been changed to
        <strong>{{ CurrentUser?.email }}</strong
        >. You should receive a confirmation email to this address. You'll need
        to confirm your new email address before your can continue.
      </p>
      <p class="alert alert-secondary mt-3">
        NOTE: If you can't find the email we send, make sure to check your spam
        folder.
      </p>
    </div>
    <div v-else class="flex-fill">
      <h2 class="h3">You don't belong to any groups ... yet.</h2>
      <p>
        Groups are a <em>collection</em> of recording devices out in the field
        gathering data, and users (like you) who can access the recordings and
        reporting from those devices.
      </p>
      <div class="d-flex flex-column flex-md-row">
        <div class="card mb-3 me-md-3 option-item">
          <div class="card-body d-flex flex-column justify-content-between">
            <h5 class="card-title">Start a new group</h5>
            <p>
              If you are the person setting up a new device, first create a new
              group. All the devices you manage will be linked together through
              this group, so choose a name for your group that relates to your
              organisation, project or property.
            </p>
            <button
              class="btn btn-primary"
              type="button"
              data-cy="create new group button"
              @click="creatingNewGroup.enabled = true"
            >
              <font-awesome-icon icon="plus" /> Create a new group
            </button>
          </div>
        </div>
        <div class="card mb-3 option-item">
          <div
            class="card-body d-flex flex-column"
            v-if="userHasPendingGroups"
            data-cy="pending group memberships"
          >
            <h5 class="card-title">Pending group memberships</h5>
            <card-table :items="pendingGroupTableItems">
              <template #card="{ card }">
                <div>
                  <div
                    class="d-flex align-items-center justify-content-between"
                  >
                    <h6>{{ card.groupName }}</h6>
                    <div v-if="card.status.value.pending === 'requested'">
                      Waiting for approval from group admin
                    </div>
                    <div v-else-if="card.status.value.pending === 'invited'">
                      <button
                        type="button"
                        data-cy="accept group invitation button"
                        class="btn btn-outline-secondary d-flex align-items-center fs-7 text-nowrap"
                        @click.prevent="
                          () => acceptInvitationToGroup(card.status.value)
                        "
                        :disabled="acceptingInvite"
                      >
                        <font-awesome-icon icon="thumbs-up" />
                        <span class="ps-2">Accept invitation</span>
                      </button>
                    </div>
                  </div>

                  <div
                    class="d-flex align-items-center justify-content-between"
                    v-if="card.status.value.admin || card.status.value.owner"
                  >
                    <div
                      class="fs-7 text-secondary d-flex align-items-center"
                      v-if="card.status.value.admin"
                    >
                      <font-awesome-icon icon="check-circle" class="fs-6" />
                      <span class="ps-2">admin</span>
                    </div>
                    <div
                      class="fs-7 text-secondary d-flex align-items-center ms-3"
                      v-if="card.status.value.owner"
                    >
                      <font-awesome-icon icon="check-circle" class="fs-6" />
                      <span class="ps-2">owner</span>
                    </div>
                  </div>
                </div>
              </template>
              <template #status="{ cell }">
                <div v-if="cell.value.pending === 'requested'">
                  Waiting for approval from group admin
                </div>
                <div v-else-if="cell.value.pending === 'invited'">
                  <button
                    type="button"
                    class="btn btn-outline-secondary d-flex align-items-center fs-7 text-nowrap"
                    @click.prevent="() => acceptInvitationToGroup(cell.value)"
                    :disabled="acceptingInvite"
                  >
                    <font-awesome-icon icon="thumbs-up" />
                    <span class="ps-2">Accept invitation</span>
                  </button>
                </div>
              </template>
              <template #permissions="{ cell }">
                <div
                  class="fs-7 text-secondary d-flex align-items-center"
                  v-if="cell.value.admin"
                >
                  <font-awesome-icon icon="check-circle" class="fs-6" />
                  <span class="ps-2">admin</span>
                </div>
                <div
                  class="fs-7 text-secondary d-flex align-items-center ms-3"
                  v-if="cell.value.owner"
                >
                  <font-awesome-icon icon="check-circle" class="fs-6" />
                  <span class="ps-2">owner</span>
                </div>
              </template>
            </card-table>
          </div>
          <div class="card-body d-flex flex-column">
            <h5 class="card-title">Join a group</h5>
            <p class="flex-fill">
              Alternately, you can ask to become a member of an existing group.
              Once granted permission by a group administrator, you'll be able
              to see all of the recording data from that group.
            </p>
            <button
              class="btn btn-secondary"
              type="button"
              data-cy="join existing group button"
              @click="joiningNewGroup.enabled = true"
            >
              <font-awesome-icon icon="question" /> Ask to join an existing
              group
            </button>
          </div>
        </div>
      </div>
    </div>
    <router-link
      to="sign-out"
      class="text-center d-block my-3"
      data-cy="sign out link"
      >Sign out</router-link
    >
  </div>
</template>
<style lang="less">
.option-item {
  @media (min-width: 768px) {
    max-width: 50%;
  }
}
.setup-form {
  background: white;
  //max-width: 360px;
  //width: 100%;
  @media (min-width: 768px) {
    border-radius: 0.25rem;
  }
  //&.groups-setup {
  //  max-width: 768px;
  //}
}
</style>
