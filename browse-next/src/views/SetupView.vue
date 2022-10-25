<script setup lang="ts">
import {
  creatingNewGroup,
  CurrentUser,
  joiningNewGroup,
  refreshLocallyStoredUserActivation,
  userDisplayName,
  userHasConfirmedEmailAddress,
  userHasGroups,
} from "@models/LoggedInUser";
import {
  changeAccountEmail,
  resendAccountActivationEmail as resendEmail,
} from "@api/User";
import { computed, onUnmounted, ref } from "vue";
import type { FormInputValidationState, FormInputValue } from "@/utils";
import { formFieldInputText } from "@/utils";

// TODO: Stop admins adding users without confirmed email addresses.
//  Maybe the list users api should only return "active/verified" users.
//  User JWT tokens get an 'activated: false' property, which means that they can't be used via certain API endpoints.

const submittingResendActivationRequest = ref(false);
const resendRequestSent = ref(false);
const emailAddressUpdated = ref(false);
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
      <p>Before you can get setup, we need you confirm your email address.</p>
      <div v-if="CurrentUser?.email">
        <p>
          <strong>{{ CurrentUser?.email }}</strong> is the email address we
          currently have associated with your account.
        </p>
        <hr />
        <p>
          <strong
            >If this is NOT the email address you use, update it now:</strong
          >
        </p>
      </div>
      <p v-else>
        There is no email address associated with your account. Please enter
        one.
      </p>
      <div v-if="!emailAddressUpdated">
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
              aria-label="new email address"
              placeholder="new email address"
              :disabled="emailUpdateInProgress"
            />
            <button
              class="btn btn-secondary ms-3"
              type="submit"
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
        <span>{{ CurrentUser?.email }}</span
        >. You should receive a confirmation email to this address. You'll need
        to confirm your new email address before your can continue.
      </p>
      <hr v-if="!emailAddressUpdated && CurrentUser?.email" />
      <p v-if="!emailAddressUpdated && CurrentUser?.email" class="mt-3">
        If <strong>{{ CurrentUser?.email }}</strong> is correct:
      </p>
      <p
        v-if="!emailAddressUpdated"
        class="mt-3 d-flex flex-md-row flex-column justify-content-md-between align-items-start"
      >
        <button
          class="btn btn-secondary me-3 mb-3"
          type="button"
          @click="resendAccountActivationEmail"
          :disabled="resendRequestSent || emailUpdateInProgress"
        >
          <span v-if="submittingResendActivationRequest">
            <span class="spinner-border spinner-border-sm"></span> Sending...
          </span>
          <span v-else> Send account confirmation email. </span>
        </button>
      </p>
      <p class="alert alert-secondary">
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
              @click="creatingNewGroup.visible = true"
            >
              <font-awesome-icon icon="plus" /> Create a new group
            </button>
          </div>
        </div>
        <div class="card mb-3 option-item">
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
              @click="joiningNewGroup.visible = true"
            >
              <font-awesome-icon icon="question" /> Ask to join an existing
              group
            </button>
          </div>
        </div>
      </div>
    </div>
    <router-link to="sign-out" class="text-center d-block my-3"
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
