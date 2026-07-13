<script setup lang="ts">
import {
  creatingNewProject,
  joiningNewProject,
  userDisplayName,
  userHasConfirmedEmailAddress,
  userHasProjects,
  userHasPendingProjects,
  pendingUserProjects,
  refreshUserProjects,
  urlNormalisedCurrentProjectName,
  setLoggedInUserData,
} from "@models/LoggedInUser";
import type { LoggedInUser } from "@models/LoggedInUser";
import {
  computed,
  inject,
  onBeforeMount,
  onUnmounted,
  type Ref,
  ref,
} from "vue";
import type { FormInputValidationState, FormInputValue } from "@/utils";
import { formFieldInputText } from "@/utils";
import CardTable from "@/components/CardTable.vue";
import type { ApiGroupResponse as ApiProjectResponse } from "@typedefs/api/group";
import { useRoute, useRouter } from "vue-router";
import { currentUser } from "@models/provides.ts";
import { ClientApi } from "@/api";
import { DEFAULT_AUTH_ID } from "@apiClient/types.ts";
import {
  BAlert,
  BBadge,
  BButton,
  BForm,
  BFormInput,
  BFormInvalidFeedback,
  BLink,
} from "bootstrap-vue-next";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";

const CurrentUser = inject(currentUser) as Ref<LoggedInUser | null>;

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
  if (
    !CurrentUser.value ||
    (CurrentUser.value && !(CurrentUser.value as LoggedInUser).emailConfirmed)
  ) {
    // FIXME(auth):
    const userIsActivated = false; //refreshLocallyStoredUserActivation();
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
  const emailUpdateResponse = await ClientApi.Users.changeAccountEmail(
    newUserEmailAddress.value,
  );
  if (emailUpdateResponse.success) {
    emailAddressUpdated.value = true;
    setLoggedInUserData({
      ...(CurrentUser.value as LoggedInUser),
      email: newUserEmailAddress.value,
    });
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
const acceptInvitationToProject = async (project: ApiProjectResponse) => {
  acceptingInvite.value = true;
  const acceptInviteResponse = await ClientApi.Users.acceptProjectInvitation(
    project.id,
  );
  if (acceptInviteResponse.success) {
    await refreshUserProjects();
    await router.push({
      name: "dashboard",
      params: {
        projectName: urlNormalisedCurrentProjectName.value,
      },
    });
  }
  acceptingInvite.value = false;
};

const resendAccountActivationEmail = async () => {
  submittingResendActivationRequest.value = true;
  const resendResponse = await ClientApi.Users.resendAccountActivationEmail();
  if (resendResponse.success) {
    resendRequestSent.value = true;
  } else {
    resendError.value =
      "We were unable to resend your account activation email.";
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
    newUserEmailAddress.touched ? isValidEmailAddress.value : undefined,
  );

const pendingProjectTableItems = computed(() => {
  return pendingUserProjects.value.map((group) => {
    const item: {
      groupName: { value: string; cellClasses?: string[] };
      permissions?: { value: ApiProjectResponse };
      status: { value: ApiProjectResponse };
    } = {
      groupName: { value: group.groupName, cellClasses: ["w-100"] },
      status: { value: group },
    };
    if (group.admin || group.owner) {
      item.permissions = { value: group };
    }
    return item;
  });
});

const isDev = computed(() => {
  return import.meta.env.DEV;
});

const debugConfirmEmail = async () => {
  const tokenResponse = await ClientApi.Users.debugGetEmailConfirmationToken(
    CurrentUser.value?.email as string,
  );
  if (tokenResponse.success) {
    const token = tokenResponse.result.token;
    const validateTokenResponse =
      await ClientApi.Users.validateEmailConfirmationToken(token);
    if (validateTokenResponse.success) {
      const { userData, token, refreshToken, signOutUser } =
        validateTokenResponse.result;
      if (signOutUser) {
        await router.push({ name: "sign-out" });
        return;
      }

      // FIXME(auth): See if refreshingToken and decodedToken are automatically populated here?
      ClientApi.registerCredentials(DEFAULT_AUTH_ID, {
        userData,
        apiToken: token,
        refreshToken,
      });

      await router.push({
        path: "/",
      });
    }
  }
};
</script>
<template>
  <div v-if="CurrentUser">
    <div
      class="setup-form bg-white m-md-2 m-lg-3 py-3 py-sm-4 py-md-5 px-3 px-sm-4 px-md-5"
      :class="{
        'project-setup': userHasConfirmedEmailAddress && !userHasProjects,
      }"
    >
      <div class="d-flex justify-content-between mb-5">
        <img
          src="../assets/cacophony-monitoring-logo.svg"
          alt="The Cacophony Project Monitoring Platform logo"
          width="256"
        />
        <h3 class="h5 mt-4 ms-3 text-muted d-none d-sm-block">
          Finish setting up your account
        </h3>
      </div>

      <div v-if="!userHasConfirmedEmailAddress && !userHasProjects">
        <h1 class="h2 mb-4">Confirm your email address</h1>
        <h2 class="h4 mb-4">
          Kia ora <span>{{ userDisplayName }}</span>
        </h2>
        <p class="mt-3">Welcome to your new Cacophony account.</p>
        <p>
          You should have received an email with a link to confirm your email
          address <strong>{{ CurrentUser?.email }}</strong
          >.
        </p>
        <p>
          Before you can get setup, we need you click the link in that email to
          activate your account.
        </p>
        <p>
          If you haven't just received an email with a confirmation link, check
          your spam folder first. You can also request a new confirmation email.
        </p>
        <div class="d-flex justify-content-center mt-4">
          <button
            class="btn btn-secondary"
            type="button"
            data-cy="resend confirmation email"
            @click="resendAccountActivationEmail"
            :disabled="submittingResendActivationRequest"
          >
            <span v-if="submittingResendActivationRequest">
              <span class="spinner-border spinner-border-sm"></span>
              Resending...
            </span>
            <span v-else> Resend confirmation email</span>
          </button>
          <button
            v-if="isDev"
            type="button"
            class="btn btn-warning ms-2"
            @click="debugConfirmEmail"
          >
            DEBUG confirm email
          </button>
        </div>
        <b-alert
          :model-value="resendRequestSent"
          variant="light"
          class="mt-4 mb-0"
        >
          <div class="description d-flex">
            <material-symbol name="info" class="me-2" size="1.25rem" />
            <p class="mb-0" data-cy="email send failure fallback">
              If you haven't received the confirmation email after a few minutes
              and have already checked your spam folder, please contact
              <a
                href="mailto:support@cacophony.org.nz?subject=Account%20Confirmation%20Email%20Issue"
                >support@cacophony.org.nz</a
              >
            </p>
          </div>
        </b-alert>
      </div>
      <div v-else-if="!userHasConfirmedEmailAddress">
        <h1 class="h2 mb-4">Confirm your email address</h1>
        <h2 class="h4 mb-4">
          Kia ora <span>{{ userDisplayName }}</span>
        </h2>
        <p class="mt-3">Welcome to your Cacophony account.</p>
        <p v-if="CurrentUser?.email && !emailAddressUpdated">
          Before you can continue, we need to confirm your email address.
        </p>
        <div v-if="CurrentUser?.email && !emailAddressUpdated">
          <p v-if="!emailAddressUpdated && CurrentUser?.email" class="mt-3">
            We have <strong>{{ CurrentUser?.email }}</strong> as the email
            address you want to use with Cacophony.
          </p>
          <p>
            If you haven't just received an email with a confirmation link,
            check your spam folder first. You can also request a new
            confirmation email.
          </p>
          <div v-if="!emailAddressUpdated" class="my-4 mb-5">
            <button
              class="btn btn-secondary"
              type="button"
              data-cy="resend confirmation email"
              @click="resendAccountActivationEmail"
              :disabled="
                submittingResendActivationRequest || emailUpdateInProgress
              "
            >
              <span v-if="submittingResendActivationRequest">
                <span class="spinner-border spinner-border-sm"></span>
                Sending...
              </span>
              <span v-else>Resend account confirmation email</span>
            </button>
            <b-alert
              :model-value="resendRequestSent"
              variant="light"
              class="mt-3 mb-4"
            >
              <div class="description d-flex">
                <material-symbol name="info" class="me-2" size="1.25rem" />
                <p class="mb-0" data-cy="email send failure fallback">
                  If you haven't received the confirmation email after a few
                  minutes and have already checked your spam folder, please
                  contact
                  <a
                    href="mailto:support@cacophony.org.nz?subject=Account%20Confirmation%20Email%20Issue"
                    >support@cacophony.org.nz</a
                  >.
                </p>
              </div>
            </b-alert>
          </div>
        </div>
        <p v-else-if="!CurrentUser?.email">
          There is no email address associated with your account. Please enter
          one.
        </p>
        <div v-if="!emailAddressUpdated">
          <div v-if="CurrentUser?.email">
            <h5 class="h5 mt-4 mb-3">Wrong email address?</h5>
            <p>
              If this is NOT the email address you use with Cacophony, update it
              now:
            </p>
          </div>
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
                placeholder="New email address"
                :disabled="emailUpdateInProgress"
              />
              <button
                class="btn btn-outline-secondary ms-1"
                type="submit"
                data-cy="update email address button"
                :disabled="!isValidEmailAddress || emailUpdateInProgress"
              >
                <span
                  v-if="emailUpdateInProgress"
                  class="d-flex align-items-center justify-content-center gap-2"
                >
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
          <b-form-invalid-feedback
            :state="needsValidationAndIsValidEmailAddress"
          >
            Enter a valid email address.
          </b-form-invalid-feedback>
        </div>
        <p v-else>
          Your email address has been changed to
          <strong>{{ CurrentUser?.email }}</strong
          >.<br />You should receive a confirmation email to this address.
          You'll need to confirm your new email address before you can continue.
        </p>
        <b-alert
          :model-value="emailAddressUpdated"
          variant="light"
          class="mt-4 mb-0"
        >
          <div class="description d-flex">
            <material-symbol name="info" class="me-2" size="1.25rem" />
            <p class="mb-0">
              Check your spam folder if you can't find the confirmation email.
            </p>
          </div>
        </b-alert>
      </div>
      <div v-else class="flex-fill">
        <h1 class="h2 mb-4">Join or create a project</h1>
        <p>You don't belong to any projects yet.</p>
        <p>
          Projects are a collection of recording devices out in the field
          gathering data, and users (like you) who can access the recordings and
          reporting from those devices.
        </p>
        <div class="mt-4 mt-sm-5">
          <div
            v-if="userHasPendingProjects"
            data-cy="pending project memberships"
            class="mb-0"
          >
            <h5 class="h3 mb-3">Pending project memberships</h5>
            <p>
              Below are the projects you requested to join and the status of the
              invitation. You can also
              <b-link @click="joiningNewProject.enabled = true"
                >create a new project</b-link
              >
              or
              <b-link @click="joiningNewProject.enabled = true"
                >ask to join another existing project</b-link
              >.
            </p>
            <card-table :items="pendingProjectTableItems" class="mt-4 mt-md-0">
              <template #card="{ card }">
                <div>
                  <div
                    class="d-flex align-items-center justify-content-between"
                  >
                    <div>
                      <h6 class="h5 mb-0 me-2">{{ card.groupName.value }}</h6>
                      <div
                        class="d-flex mt-2"
                        v-if="
                          card.status.value.admin || card.status.value.owner
                        "
                      >
                        <b-badge
                          v-if="card.status.value.admin"
                          variant="light"
                          bg-variant="primary-subtle"
                          class="me-2"
                          >Admin
                        </b-badge>
                        <b-badge
                          v-if="card.status.value.owner"
                          variant="light"
                          bg-variant="success-subtle"
                          >Owner
                        </b-badge>
                      </div>
                    </div>

                    <div
                      v-if="card.status.value.pending === 'requested'"
                      class="d-flex align-items-center"
                      :data-cy="`waiting for approval from admin of ${card.groupName.value}`"
                    >
                      <material-symbol
                        name="schedule"
                        size="1.25rem"
                        class="me-2"
                      />
                      Waiting<span class="d-none d-sm-none"> for approval</span>
                    </div>
                    <div v-else-if="card.status.value.pending === 'invited'">
                      <button
                        type="button"
                        :data-cy="`accept project invitation button for ${card.groupName.value}`"
                        class="btn btn-secondary d-flex align-items-center text-nowrap"
                        @click.prevent="
                          () => acceptInvitationToProject(card.status.value)
                        "
                        :disabled="acceptingInvite"
                      >
                        <material-symbol name="check" size="1.25rem" />
                        <span class="ps-2"
                          >Accept<span class="d-none d-sm-none">
                            invitation</span
                          ></span
                        >
                      </button>
                    </div>
                  </div>
                </div>
              </template>
              <template #permissions="{ cell }">
                <div class="d-flex">
                  <b-badge
                    v-if="cell.value.admin"
                    variant="light"
                    bg-variant="primary-subtle"
                    class="me-2"
                    >Admin
                  </b-badge>
                  <b-badge
                    v-if="cell.value.owner"
                    variant="light"
                    bg-variant="success-subtle"
                    >Owner
                  </b-badge>
                </div>
              </template>
              <template #status="{ cell }">
                <div v-if="cell.value.pending === 'requested'">
                  <div
                    class="d-flex align-items-center"
                    :data-cy="`waiting for approval from admin of ${cell.value.groupName}`"
                  >
                    <material-symbol
                      name="schedule"
                      size="1.25rem"
                      class="me-2"
                    />
                    Waiting for approval
                  </div>
                </div>
                <div v-else-if="cell.value.pending === 'invited'">
                  <button
                    type="button"
                    class="btn btn-secondary d-flex align-items-center text-nowrap"
                    @click.prevent="() => acceptInvitationToProject(cell.value)"
                    :data-cy="`accept project invitation button for ${cell.value.groupName}`"
                    :disabled="acceptingInvite"
                  >
                    <material-symbol name="check" size="1.25rem" />
                    <span class="ps-2">Accept invitation</span>
                  </button>
                </div>
              </template>
            </card-table>
          </div>
          <div v-else>
            <div class="mb-4 mb-sm-5">
              <h5 class="h3 mb-3">Start a new project</h5>
              <p>
                If you are the person setting up a new device, first create a
                new project. All the devices you manage will be linked together
                through this project, so choose a name for your project that
                relates to your organisation, project or property.
              </p>
              <button
                class="btn btn-primary"
                type="button"
                data-cy="create new project button"
                @click="creatingNewProject.enabled = true"
              >
                Create a new project
              </button>
            </div>
            <div>
              <h5 class="h3 mb-3">Join a project</h5>
              <p>
                Alternately, you can ask to become a member of an existing
                project. Once granted permission by a project administrator,
                you'll be able to see all of the recording data from that
                project.
              </p>
              <button
                class="btn btn-secondary"
                type="button"
                data-cy="join existing project button"
                @click="joiningNewProject.enabled = true"
              >
                Ask to join an existing project
              </button>
            </div>
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
@import "../assets/less/breakpoints";
@import "../assets/less/elevation";
.setup-form {
  max-width: 704px;
  @media (min-width: @breakpoint-md) {
    border-radius: var(--bs-border-radius-lg);
    .standard-shadow();
  }
  h1 {
    font-weight: var(--cp-font-weight-semilbold);
  }
}
</style>
