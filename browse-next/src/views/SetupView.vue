<script setup lang="ts">
import {
  userDisplayName,
  userHasConfirmedEmailAddress,
  CurrentUser,
  refreshLocallyStoredUserActivation,
  setLoggedInUserData,
} from "@models/LoggedInUser";
import {
  debugGetEmailConfirmationToken,
  resendAccountActivationEmail as resendEmail,
  validateEmailConfirmationToken,
} from "@api/User";
import { ref, onUnmounted, computed } from "vue";
import { BForm, BFormInput, BModal } from "bootstrap-vue-3";
import { formFieldInputText, type FormInputValidationState } from "@/utils";
import CreateGroupModal from "@/components/CreateGroupModal.vue";
import { useRouter } from "vue-router";

// TODO: Stop admins adding users without confirmed email addresses.
//  Maybe the list users api should only return "active/verified" users.
//  User JWT tokens get an 'activated: false' property, which means that they can't be used via certain API endpoints.

const submittingResendActivationRequest = ref(false);
const resendRequestSent = ref(false);
const resendError = ref<null | string>(null);

const selectedCreateNewGroup = ref(false);
const selectedJoinExistingGroup = ref(false);

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

const router = useRouter();
const debugConfirmEmail = async () => {
  const tokenResponse = await debugGetEmailConfirmationToken(
    CurrentUser.value?.email as string
  );
  if (tokenResponse.success) {
    const token = tokenResponse.result.token;
    const validateTokenResponse = await validateEmailConfirmationToken(token);
    if (validateTokenResponse.success) {
      const { userData, token, refreshToken, signOutUser } =
        validateTokenResponse.result;
      if (signOutUser) {
        await router.push({ name: "sign-out" });
        return;
      }
      setLoggedInUserData({
        ...userData,
        apiToken: token,
        refreshToken,
        refreshingToken: false
      });

      await router.push({
        path: "/",
      });
    }
  }
};

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

const joinExistingGroup = () => {
  console.log("Join a group");
};
</script>
<template>
  <!--  TODO: Use the version of this that's already in the App.vue parent layer  -->
  <create-group-modal
    :show="selectedCreateNewGroup"
    @finished="selectedCreateNewGroup = false"
  />
  <b-modal
    v-model="selectedJoinExistingGroup"
    title="Join a group"
    ok-title="Send join request"
    @ok="joinExistingGroup"
    :ok-disabled="!isValidEmailAddress || submittingJoinRequest"
    :cancel-disabled="submittingJoinRequest"
    centered
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
  <div class="container-md d-flex flex-column flex-fill">
    <h1>Finish setting up your account</h1>
    <div>
      <span class="h3">
        Kia ora <span>{{ userDisplayName }}</span>
      </span>
    </div>
    <div v-if="!userHasConfirmedEmailAddress">
      <p>
        Welcome to your Cacophony account. You should have received an email
        with a link to confirm your email address
        <em>{{ CurrentUser.email }}</em
        >. Before you can get setup, we need you click the link in that email to
        activate your account.
      </p>
      <p>
        If you can't find the email we sent, make sure to check your spam
        folder.
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

        <button class="btn btn-primary" @click="debugConfirmEmail">
          DEBUG validate email.
        </button>
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
              @click="selectedCreateNewGroup = true"
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
              @click="selectedJoinExistingGroup = true"
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
</style>
