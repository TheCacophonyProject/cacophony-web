<script setup lang="ts">
import {
  userDisplayName,
  userHasConfirmedEmailAddress,
  creatingNewGroup,
  joiningNewGroup,
  CurrentUser,
  refreshLocallyStoredUserActivation,
  setLoggedInUserData,
} from "@models/LoggedInUser";
import {
  debugGetEmailConfirmationToken,
  resendAccountActivationEmail as resendEmail,
  validateEmailConfirmationToken,
} from "@api/User";
import { ref, onUnmounted } from "vue";
import { useRouter } from "vue-router";

// TODO: Stop admins adding users without confirmed email addresses.
//  Maybe the list users api should only return "active/verified" users.
//  User JWT tokens get an 'activated: false' property, which means that they can't be used via certain API endpoints.

const submittingResendActivationRequest = ref(false);
const resendRequestSent = ref(false);
const resendError = ref<null | string>(null);

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
        refreshingToken: false,
      });

      await router.push({
        path: "/",
      });
    }
  }
};
</script>
<template>
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
              @click="creatingNewGroup = true"
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
              @click="joiningNewGroup = true"
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
