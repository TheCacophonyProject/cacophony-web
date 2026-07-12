<script setup lang="ts">
import { computed, ref } from "vue";
import {
  BAlert,
  BForm,
  BFormCheckbox,
  BFormInput,
  BFormInvalidFeedback,
} from "bootstrap-vue-next";
import { setLoggedInUserData } from "@models/LoggedInUser";
import { ClientApi } from "@/api";
import { formFieldInputText, isValidName } from "@/utils";
import {
  DEFAULT_AUTH_ID,
  type ErrorResult,
  type FieldValidationError,
} from "@apiClient/types";
import type { FormInputValue, FormInputValidationState } from "@/utils";
import { useRoute, useRouter } from "vue-router";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";

// ---------- userName ------------
const userName: FormInputValue = formFieldInputText();
const userNameFieldValidationError = computed<
  undefined | false | FieldValidationError
>(
  () =>
    registerErrorMessage.value &&
    registerErrorMessage.value.errorType === "validation" &&
    (registerErrorMessage.value.errors as FieldValidationError[])?.find(
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
    registerErrorMessage.value &&
    registerErrorMessage.value.errorType === "validation" &&
    (registerErrorMessage.value.errors as FieldValidationError[])?.find(
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
const userPassword: FormInputValue = formFieldInputText();
const userPasswordConfirmation: FormInputValue = formFieldInputText();
const isValidPassword = computed<boolean>(() => !passwordIsTooShort.value);
const passwordIsTooShort = computed<boolean>(
  () => userPassword.value.trim().length < 8,
);
const needsValidationAndIsValidPassword = computed<FormInputValidationState>(
  () => (userPassword.touched ? isValidPassword.value : undefined),
);
const passwordConfirmationMatches = computed<boolean>(
  () => userPasswordConfirmation.value.trim() === userPassword.value.trim(),
);
const needsValidationAndIsValidPasswordConfirmation =
  computed<FormInputValidationState>(() =>
    userPasswordConfirmation.touched
      ? isValidPassword.value && passwordConfirmationMatches.value
      : undefined,
  );

// ---------- password visibility ------------
const showPassword = ref(false);
const togglePasswordVisibility = () => {
  showPassword.value = !showPassword.value;
};

// ---------- acceptedEUA ------------
const acceptedEUA: FormInputValue = formFieldInputText(false);
const needsValidationAndAcceptedEUA = computed<FormInputValidationState>(() =>
  acceptedEUA.touched ? Boolean(acceptedEUA.value) : undefined,
);

// ---------- general ------------
const registerErrorMessage = ref<ErrorResult | false>(false);
const registrationInProgress = ref(false);

const hasNonValidationError = computed({
  get: () => {
    // Validation error messages should be handled at the field level.
    return (
      registerErrorMessage.value !== false &&
      registerErrorMessage.value.errorType !== "validation"
    );
  },
  set: (val: boolean) => {
    if (!val) {
      registerErrorMessage.value = false;
    }
  },
});

const registerErrorMessagesDisplay = computed(() => {
  if (
    registerErrorMessage.value &&
    Array.isArray(registerErrorMessage.value.messages)
  ) {
    return registerErrorMessage.value.messages.join(", ");
  } else {
    return "";
  }
});
const registrationFormIsFilledAndValid = computed<boolean>(
  () =>
    isValidEmailAddress.value &&
    isValidPassword.value &&
    isValidUserName.value &&
    passwordConfirmationMatches.value &&
    Boolean(acceptedEUA.value),
);

// Hold onto a snapshot of the submitted details so that we can see if the user
// edits the fields to correct any validation errors
const submittedDetails = ref<{
  emailAddress: string;
  password: string;
  name: string;
} | null>(null);

const router = useRouter();
const route = useRoute();
const register = async () => {
  const emailAddress = userEmailAddress.value.trim();
  const password = userPassword.value.trim();
  const name = userName.value.trim();
  // Clear any errors
  registerErrorMessage.value = false;
  submittedDetails.value = {
    emailAddress,
    password,
    name,
  };

  registrationInProgress.value = true;
  // Register, then log the user in.
  const latestEUAVersionResponse = await ClientApi.Users.getEUAVersion();
  let latestEUAVersion = undefined;
  if (latestEUAVersionResponse.success) {
    latestEUAVersion = latestEUAVersionResponse.result.euaVersion;
  }

  const tokenUrlPrefix = "/accept-invite/";
  let signupInviteToken;
  if (route.query.nextUrl) {
    const nextUrl = route.query.nextUrl as unknown as string;
    if (nextUrl.startsWith(tokenUrlPrefix)) {
      // We're a new user signing up from an email link with a project invite.
      signupInviteToken = nextUrl
        .replace(tokenUrlPrefix, "")
        .replace(/:/g, ".");
    }
  }
  const newUserResponse = await ClientApi.Users.register(
    name,
    password,
    emailAddress,
    latestEUAVersion,
    signupInviteToken,
  );
  if (newUserResponse.success) {
    const newUser = newUserResponse.result;
    setLoggedInUserData({
      ...newUser.userData,
    });
    ClientApi.registerCredentials(DEFAULT_AUTH_ID, {
      refreshToken: newUser.refreshToken,
      apiToken: newUser.token,
      userData: newUser.userData,
    });
    await router.push({
      name: "setup",
    });
  } else {
    registerErrorMessage.value = newUserResponse.result;
  }
  registrationInProgress.value = false;
};
</script>
<template>
  <div class="register-form p-4">
    <img
      src="../assets/cacophony-monitoring-logo.svg"
      alt="The Cacophony Project logo"
      width="256"
      class="mx-auto d-block mb-5"
    />
    <h1 class="h4 text-center mb-4">Register a new account</h1>
    <b-form
      class="d-flex flex-column"
      @submit.stop.prevent="register"
      novalidate
    >
      <b-alert
        v-model="hasNonValidationError"
        variant="danger"
        dismissible
        class="text-center"
        @dismissed="hasNonValidationError = false"
      >
        {{ registerErrorMessagesDisplay }}
      </b-alert>
      <div class="mb-3">
        <b-form-input
          type="text"
          v-model="userName.value"
          @blur="() => (userName.touched = true)"
          :state="needsValidationAndIsValidUserName"
          aria-label="Name"
          placeholder="Name"
          data-cy="username"
          :disabled="registrationInProgress"
          required
        />
        <b-form-invalid-feedback :state="needsValidationAndIsValidUserName">
          <span v-if="userNameIsTooShort">
            Name must be at least 3 characters.
          </span>
          <span v-else-if="!isValidName(userName.value.trim())">
            Name must contain at least one letter and start with either a letter
            or a number. Valid characters include numbers, underscores, hyphens
            and spaces.
          </span>
          <span v-else-if="userNameInUse">
            {{ userNameFieldValidationErrorMessage }}
          </span>
        </b-form-invalid-feedback>
      </div>
      <div class="mb-3">
        <b-form-input
          type="email"
          v-model="userEmailAddress.value"
          @blur="() => (userEmailAddress.touched = true)"
          :state="needsValidationAndIsValidEmailAddress"
          aria-label="email address"
          placeholder="Email address"
          data-cy="email address"
          :disabled="registrationInProgress"
          required
        />
        <b-form-invalid-feedback :state="needsValidationAndIsValidEmailAddress">
          <span v-if="emailInUse">{{ emailFieldValidationErrorMessage }}</span>
          <span v-else>Enter a valid email address.</span>
        </b-form-invalid-feedback>
      </div>
      <div class="mb-3">
        <div class="input-group">
          <b-form-input
            :type="showPassword ? 'text' : 'password'"
            v-model="userPassword.value"
            @blur="() => (userPassword.touched = true)"
            :state="needsValidationAndIsValidPassword"
            aria-label="password"
            placeholder="Password"
            data-cy="password"
            :disabled="registrationInProgress"
            required
          />
          <button
            type="button"
            :title="showPassword ? 'hide password' : 'show password'"
            class="input-group-text toggle-password-visibility-btn justify-content-center"
            @click.stop.prevent="togglePasswordVisibility"
          >
            <material-symbol
              :name="showPassword ? 'visibility_off' : 'visibility'"
              size="1.25rem"
            />
          </button>
        </div>
        <b-form-invalid-feedback :state="needsValidationAndIsValidPassword">
          <span v-if="userPassword.value.trim().length === 0">
            Password cannot be blank.
          </span>
          <span v-else-if="userPassword.value.trim().length < 8">
            Password must be at least 8 characters.
          </span>
        </b-form-invalid-feedback>
      </div>
      <div class="mb-3">
        <b-form-input
          :type="showPassword ? 'text' : 'password'"
          v-model="userPasswordConfirmation.value"
          @blur="() => (userPasswordConfirmation.touched = true)"
          :state="needsValidationAndIsValidPasswordConfirmation"
          aria-label="confirm password"
          placeholder="Confirm password"
          data-cy="password confirmation"
          :disabled="registrationInProgress"
          required
        />
        <b-form-invalid-feedback
          :state="needsValidationAndIsValidPasswordConfirmation"
        >
          <span>Passwords don't match.</span>
        </b-form-invalid-feedback>
      </div>
      <div class="input-group mb-3">
        <b-form-checkbox
          v-model="acceptedEUA.value"
          @blur="() => (acceptedEUA.touched = true)"
          :state="needsValidationAndAcceptedEUA"
          :disabled="registrationInProgress"
          data-cy="accept eua"
          required
        >
          <span class="small">
            I accept the
            <a
              target="_blank"
              href="https://www.2040.co.nz/pages/2040-end-user-agreement"
            >
              <span>end user agreement</span>
            </a>
            terms.
          </span>
        </b-form-checkbox>
        <b-form-invalid-feedback :state="needsValidationAndAcceptedEUA">
          <span
            >You must accept the end user agreement to create an account</span
          >
        </b-form-invalid-feedback>
      </div>
      <button
        type="submit"
        class="btn btn-primary mb-3"
        data-cy="register button"
        :disabled="!registrationFormIsFilledAndValid || registrationInProgress"
      >
        <span v-if="registrationInProgress">
          <span
            class="spinner-border spinner-border-sm"
            role="status"
            aria-hidden="true"
          ></span>
          Registering...
        </span>
        <span v-else>Create new account</span>
      </button>
    </b-form>
    <div
      class="alternate-action-links d-flex justify-content-center my-2 small"
    >
      <span
        >Already have an account?
        <router-link to="sign-in">Sign in here</router-link>.</span
      >
    </div>
  </div>
</template>

<style scoped lang="less">
.register-form {
  max-width: 360px;
  width: 100%;
}
</style>
