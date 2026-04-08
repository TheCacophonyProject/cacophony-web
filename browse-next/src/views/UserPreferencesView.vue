<script setup lang="ts">
import SectionHeader from "@/components/SectionHeader.vue";
import { setLoggedInUserData } from "@models/LoggedInUser";
import type { LoggedInUser } from "@models/LoggedInUser";
import { computed, inject, ref } from "vue";
import type { Ref } from "vue";
import { formFieldInputText, isValidName } from "@/utils";
import type { FormInputValidationState, FormInputValue } from "@/utils";
import type { ErrorResult, FieldValidationError } from "@apiClient/types";
import { ClientApi } from "@/api";
import type { ApiLoggedInUserResponse } from "@typedefs/api/user";
import router from "@/router";
import { currentUser as currentUserInfo } from "@models/provides";
import SectionCard from "@/components/SectionCard.vue";
import {
  BAlert,
  BForm,
  BFormGroup,
  BFormInput,
  BFormInvalidFeedback,
  BModal,
  type BvTriggerableEvent,
} from "bootstrap-vue-next";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";

const currentUser = inject(currentUserInfo) as Ref<LoggedInUser | null>;

const changeDisplayNameModal = ref<boolean>(false);
const changeEmailModal = ref<boolean>(false);
const changePasswordModal = ref<boolean>(false); // New modal for password change

const updateUserErrorMessage = ref<ErrorResult | false>(false);
const userUpdateInProgress = ref(false);
const hasNonValidationError = computed({
  get: () => {
    // Validation error messages should be handled at the field level.
    return (
      updateUserErrorMessage.value !== false &&
      updateUserErrorMessage.value.errorType !== "validation"
    );
  },
  set: (val: boolean) => {
    if (!val) {
      updateUserErrorMessage.value = false;
    }
  },
});

const userUpdateErrorMessagesDisplay = computed(() => {
  if (updateUserErrorMessage.value) {
    return updateUserErrorMessage.value.messages.join(", ");
  } else {
    return "";
  }
});

// Hold onto a snapshot of the submitted details so that we can see if the user
// edits the fields to correct any validation errors
const submittedDetails = ref<{
  emailAddress?: string;
  name?: string;
} | null>(null);

// ---------- userName ------------
const userName: FormInputValue = formFieldInputText();
const userNameFieldValidationError = computed<
  undefined | false | FieldValidationError
>(
  () =>
    updateUserErrorMessage.value &&
    updateUserErrorMessage.value.errorType === "validation" &&
    (updateUserErrorMessage.value.errors as FieldValidationError[])?.find(
      ({ param }) => param === "userName",
    ),
);
const userNameFieldValidationErrorMessage = computed<string>(() => {
  return (userNameFieldValidationError.value as FieldValidationError).msg;
});
const userNameIsTooShort = computed<boolean>(
  () => userName.value.trim().length < 3,
);
const userNameInUse = computed<boolean>(
  () => !!userNameFieldValidationError.value,
);
const isValidUserName = computed<boolean>(() => {
  if (
    submittedDetails.value !== null &&
    userName.value.trim() === submittedDetails.value.name &&
    userNameInUse.value
  ) {
    return false;
  }
  return isValidName(userName.value.trim());
});
const needsValidationAndIsValidUserName = computed<FormInputValidationState>(
  () => (userName.touched ? isValidUserName.value : undefined),
);

// ---------- email ------------
const userEmailAddress: FormInputValue = formFieldInputText();
const emailInUse = computed<boolean>(() => !!emailFieldValidationError.value);
const emailFieldValidationError = computed(() => {
  return (
    updateUserErrorMessage.value &&
    updateUserErrorMessage.value.errorType === "validation" &&
    (updateUserErrorMessage.value.errors as FieldValidationError[])?.find(
      ({ param }) => param === "email",
    )
  );
});
const emailFieldValidationErrorMessage = computed<string>(() => {
  return (emailFieldValidationError.value as FieldValidationError).msg;
});
const emailIsTooShort = computed<boolean>(
  () => userEmailAddress.value.trim().length < 3,
);
const isValidEmailAddress = computed<boolean>(() => {
  if (
    submittedDetails.value !== null &&
    userEmailAddress.value.trim() === submittedDetails.value.emailAddress &&
    emailInUse.value
  ) {
    return false;
  }
  const { value } = userEmailAddress;
  const email = value.trim();
  return !emailIsTooShort.value && email.includes("@") && !email.includes(" ");
});
const needsValidationAndIsValidEmailAddress =
  computed<FormInputValidationState>(() =>
    userEmailAddress.touched ? isValidEmailAddress.value : undefined,
  );

// ---------- password ------------
const currentPassword: FormInputValue = formFieldInputText();
const newPassword: FormInputValue = formFieldInputText();
const confirmPassword: FormInputValue = formFieldInputText();

const passwordError = ref<string>("");
const showPasswordErrors = ref<boolean>(false);

const isValidPassword = computed<boolean>(() => {
  if (newPassword.value.trim().length < 8) {
    return false;
  }
  // Check for at least one uppercase letter, one lowercase letter, and one digit
  const hasUpper = /[A-Z]/.test(newPassword.value);
  const hasLower = /[a-z]/.test(newPassword.value);
  const hasDigit = /\d/.test(newPassword.value);

  return hasUpper && hasLower && hasDigit;
});

const passwordsMatch = computed<boolean>(() => {
  return newPassword.value === confirmPassword.value;
});

const resetFormFields = () => {
  userEmailAddress.value = "";
  userEmailAddress.touched = false;
  userName.value = "";
  userName.touched = false;
  currentPassword.value = "";
  currentPassword.touched = false;
  newPassword.value = "";
  newPassword.touched = false;
  confirmPassword.value = "";
  confirmPassword.touched = false;
  submittedDetails.value = null;
  passwordError.value = "";
  showPasswordErrors.value = false;
};

const updateUserDisplayName = async () => {
  const name = userName.value.trim();
  // Clear any errors
  updateUserErrorMessage.value = false;
  submittedDetails.value = {
    name,
  };

  userUpdateInProgress.value = true;
  const updatedUserResponse = await ClientApi.Users.updateUserFields({
    userName: name,
  });

  if (updatedUserResponse.success) {
    const currentUserInfo = currentUser.value || {};
    setLoggedInUserData({
      ...(currentUserInfo as ApiLoggedInUserResponse),
      userName: name,
    });
  } else {
    updateUserErrorMessage.value = updatedUserResponse.result;
  }
  userUpdateInProgress.value = false;
};

const updateUserEmailAddress = async () => {
  const emailAddress = userEmailAddress.value.trim();
  // Clear any errors
  updateUserErrorMessage.value = false;
  submittedDetails.value = {
    emailAddress,
  };

  userUpdateInProgress.value = true;
  const updatedUserResponse = await ClientApi.Users.updateUserFields({
    email: emailAddress,
  });

  if (updatedUserResponse.success) {
    const currentUserInfo = currentUser.value || {};
    setLoggedInUserData({
      ...(currentUserInfo as ApiLoggedInUserResponse),
      email: emailAddress,
      emailConfirmed: false,
    });
    // TODO: Show some kind of confirmation prompt saying that the user will be directed to confirm their new email address?
    await router.push({
      name: "setup",
      query: {
        updated: true.toString(),
      },
    });
  } else {
    updateUserErrorMessage.value = updatedUserResponse.result;
  }
  userUpdateInProgress.value = false;
};

const changePassword = async (e: BvTriggerableEvent) => {
  // Validate that all fields are filled
  if (!newPassword.value.trim() || !confirmPassword.value.trim()) {
    passwordError.value = "All fields are required";
    showPasswordErrors.value = true;
    e.preventDefault();
    return;
  }

  // Validate new password strength
  if (newPassword.value.trim().length < 8) {
    passwordError.value = "New password must be at least 8 characters long";
    showPasswordErrors.value = true;
    e.preventDefault();
    return;
  }
  if (!isValidPassword.value) {
    passwordError.value =
      "New password must contain uppercase, lowercase and digit";
    showPasswordErrors.value = true;
    e.preventDefault();
    return;
  }

  // Check if passwords match
  if (newPassword.value !== confirmPassword.value) {
    passwordError.value = "Passwords do not match";
    showPasswordErrors.value = true;
    e.preventDefault();
    return;
  }

  // Clear any errors
  updateUserErrorMessage.value = false;
  passwordError.value = "";
  showPasswordErrors.value = false;

  userUpdateInProgress.value = true;
  const updatedUserResponse = await ClientApi.Users.changePasswordWhileLoggedIn(
    newPassword.value,
  );
  if (updatedUserResponse.success) {
    changePasswordModal.value = false; // Close modal after successful change
    await router.push({ name: "sign-out" });
  } else {
    passwordError.value = "Something went wrong, please try again later";
    e.preventDefault();
  }

  userUpdateInProgress.value = false;
};
</script>
<template>
  <section-header>Account Settings</section-header>
  <div class="row mb-4 pb-2 pb-sm-0 mb-sm-4 mb-lg-5">
    <div class="col-lg-3">
      <h3 class="section-card-heading">User Settings</h3>
      <p class="text-secondary pb-1">
        Your details across the Cacophony Monitoring Platform. These settings
        don't affect projects.
      </p>
    </div>
    <div class="col-lg-9">
      <section-card>
        <template #header-title> My details </template>
        <div class="container">
          <div class="account-settings-list row py-2 d-flex align-items-center">
            <span class="col-sm-3 ps-0 fw-medium">Name</span>
            <div class="d-flex align-items-center col-sm-9 ps-0">
              <span data-cy="user display name">{{
                currentUser?.userName
              }}</span>
              <button
                type="button"
                class="btn btn-icon d-flex justify-content-center ms-2"
                data-cy="change display name button"
                @click="() => (changeDisplayNameModal = true)"
              >
                <material-symbol name="edit" size="1.25rem" />
              </button>
            </div>
          </div>
          <div class="account-settings-list row py-2 d-flex align-items-center">
            <span class="col-sm-3 fw-medium ps-0">Email address</span>
            <div class="col-sm-9 d-flex align-items-center ps-0">
              <span data-cy="user email">{{ currentUser?.email }}</span>
              <button
                type="button"
                class="btn btn-icon d-flex justify-content-center ms-2"
                data-cy="change email address button"
                @click.prevent="() => (changeEmailModal = true)"
              >
                <material-symbol name="edit" size="1.25rem" />
              </button>
            </div>
          </div>
          <!-- New password change section -->
          <div class="account-settings-list row py-2 d-flex align-items-center">
            <span class="col-sm-3 fw-medium ps-0">Password</span>
            <div class="col-sm-9 d-flex align-items-center ps-0">
              <button
                type="button"
                class="btn btn-light d-flex justify-content-center mt-2 mt-sm-0"
                data-cy="change password button"
                @click="() => (changePasswordModal = true)"
              >
                <material-symbol
                  name="edit"
                  size="1.25rem"
                  class="me-2"
                />Change
              </button>
            </div>
          </div>
        </div>
      </section-card>
    </div>
  </div>

  <b-modal
    v-model="changeDisplayNameModal"
    title="Change name"
    id="change-display-name"
    @ok="updateUserDisplayName"
    @hidden="resetFormFields"
    ok-title="Save"
  >
    <b-form
      class="d-flex flex-column"
      @submit.stop.prevent="updateUserDisplayName"
      novalidate
    >
      <b-alert
        v-model="hasNonValidationError"
        variant="danger"
        dismissible
        class="text-center"
        @dismissed="hasNonValidationError = false"
      >
        {{ userUpdateErrorMessagesDisplay }}
      </b-alert>
      <b-form-group
        label="Name"
        description="The name displayed in your projects and used to identify you."
      >
        <b-form-input
          id="name"
          type="text"
          v-model="userName.value"
          @blur="() => (userName.touched = true)"
          :state="needsValidationAndIsValidUserName"
          aria-label="New display name"
          placeholder="New display name"
          data-cy="display name"
          :disabled="userUpdateInProgress"
          required
        />
      </b-form-group>
      <b-form-invalid-feedback :state="needsValidationAndIsValidUserName">
        <span v-if="userNameIsTooShort">
          Username must be at least 3 characters.
        </span>
        <span v-else-if="!isValidName(userName.value.trim())">
          Username must contain at least one letter (either case). It can also
          contain numbers, underscores and hyphens, and spaces but must
          <strong>begin</strong> with a letter or number.
        </span>
        <span v-else-if="userNameInUse">
          {{ userNameFieldValidationErrorMessage }}
        </span>
      </b-form-invalid-feedback>
    </b-form>
  </b-modal>

  <b-modal
    v-model="changeEmailModal"
    title="Change email address"
    @ok="updateUserEmailAddress"
    id="change-email-address"
    @hidden="resetFormFields"
    ok-title="Save"
  >
    <b-form
      class="d-flex flex-column"
      @submit.stop.prevent="updateUserEmailAddress"
      novalidate
    >
      <b-alert
        v-model="hasNonValidationError"
        variant="danger"
        dismissible
        class="text-center"
        @dismissed="hasNonValidationError = false"
      >
        {{ userUpdateErrorMessagesDisplay }}
      </b-alert>
      <b-form-group
        label="Email"
        description="The email you use to sign into Cacophony."
      >
        <b-form-input
          type="text"
          v-model="userEmailAddress.value"
          @blur="() => (userEmailAddress.touched = true)"
          :state="needsValidationAndIsValidEmailAddress"
          aria-label="New email address"
          placeholder="New email address"
          data-cy="email address"
          :disabled="userUpdateInProgress"
          required
        />
      </b-form-group>
      <b-form-invalid-feedback :state="needsValidationAndIsValidEmailAddress">
        <span v-if="emailInUse">{{ emailFieldValidationErrorMessage }}</span>
        <span v-else>Enter a valid email address.</span>
      </b-form-invalid-feedback>
    </b-form>
  </b-modal>

  <!-- New password change modal -->
  <b-modal
    v-model="changePasswordModal"
    title="Change your password"
    id="change-password"
    @ok="changePassword"
    @hidden="resetFormFields"
    ok-title="Save"
  >
    <p>
      You will be logged out after changing your password and will need to sign
      in again using your new password.
    </p>
    <b-form class="d-flex flex-column" novalidate>
      <b-alert
        v-model="hasNonValidationError"
        variant="danger"
        dismissible
        class="text-center"
        @dismissed="hasNonValidationError = false"
      >
        {{ userUpdateErrorMessagesDisplay }}
      </b-alert>

      <!-- New password field -->
      <b-form-group label="New Password">
        <b-form-input
          type="password"
          v-model="newPassword.value"
          @blur="() => (newPassword.touched = true)"
          aria-label="New password"
          placeholder="New password"
          data-cy="new-password"
          :disabled="userUpdateInProgress"
          required
          class="mb-3"
        />
        <b-form-invalid-feedback v-if="showPasswordErrors && !isValidPassword">
          Password must be at least 8 characters long and contain uppercase,
          lowercase and digit
        </b-form-invalid-feedback>
      </b-form-group>

      <!-- Confirm password field -->
      <b-form-group label="Confirm New Password">
        <b-form-input
          type="password"
          v-model="confirmPassword.value"
          @blur="() => (confirmPassword.touched = true)"
          aria-label="Confirm new password"
          placeholder="Confirm new password"
          data-cy="confirm-password"
          :disabled="userUpdateInProgress"
          required
        />
        <b-form-invalid-feedback v-if="showPasswordErrors && !passwordsMatch">
          Passwords do not match
        </b-form-invalid-feedback>
      </b-form-group>

      <!-- General error message -->
      <div v-if="passwordError" class="text-danger mb-2">
        {{ passwordError }}
      </div>
    </b-form>
  </b-modal>

  <!--  <h6>Things that could appear here:</h6>-->
  <!--  <ul>-->
  <!--    <li>Review the End User Agreement?</li>-->
  <!--    <li>Show release info/changelog?</li>-->
  <!--    <li>Global transactional email settings</li>-->
  <!--  </ul>-->
</template>

<style scoped lang="less">
.account-settings-list {
  &:not(:last-of-type) {
    border-bottom: 1px solid #eee;
  }
}
</style>
