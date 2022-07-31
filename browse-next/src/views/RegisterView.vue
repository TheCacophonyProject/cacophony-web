<script setup lang="ts">
import { computed, ref } from "vue";
import { BAlert } from "bootstrap-vue-3";
import { setLoggedInUserData } from "@models/LoggedInUser";
import { getEUAVersion, register as registerUser } from "@api/User";
import { formFieldInputText, isValidName } from "@/utils";
import type { ErrorResult, FieldValidationError } from "@api/types";
import type { FormInputValue, FormInputValidationState } from "@/utils";
import { useRouter } from "vue-router";

// ---------- userName ------------
const userName: FormInputValue = formFieldInputText();
const userNameFieldValidationError = computed<
  undefined | false | FieldValidationError
>(
  () =>
    registerErrorMessage.value &&
    registerErrorMessage.value.errorType === "validation" &&
    (registerErrorMessage.value.errors as FieldValidationError[])!.find(
      ({ param }) => param === "userName"
    )
);
const userNameIsTooShort = computed<boolean>(
  () => userName.value.trim().length < 3
);
const userNameInUse = computed<boolean>(
  () => !!userNameFieldValidationError.value
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
  () => (userName.touched ? isValidUserName.value : null)
);

// ---------- email ------------
const userEmailAddress: FormInputValue = formFieldInputText();
const emailInUse = computed<boolean>(() => !!emailFieldValidationError.value);
const emailFieldValidationError = computed(() => {
  return (
    registerErrorMessage.value &&
    registerErrorMessage.value.errorType === "validation" &&
    (registerErrorMessage.value.errors as FieldValidationError[])!.find(
      ({ param }) => param === "email"
    )
  );
});
const emailIsTooShort = computed<boolean>(
  () => userEmailAddress.value.trim().length < 3
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
  return !emailIsTooShort.value && email.includes("@");
});
const needsValidationAndIsValidEmailAddress =
  computed<FormInputValidationState>(() =>
    userEmailAddress.touched ? isValidEmailAddress.value : null
  );

// ---------- password ------------
const userPassword: FormInputValue = formFieldInputText();
const userPasswordConfirmation: FormInputValue = formFieldInputText();
const isValidPassword = computed<boolean>(() => !passwordIsTooShort.value);
const passwordIsTooShort = computed<boolean>(
  () => userPassword.value.trim().length < 8
);
const needsValidationAndIsValidPassword = computed<FormInputValidationState>(
  () => (userPassword.touched ? isValidPassword.value : null)
);
const passwordConfirmationMatches = computed<boolean>(
  () => userPasswordConfirmation.value.trim() === userPassword.value.trim()
);
const needsValidationAndIsValidPasswordConfirmation =
  computed<FormInputValidationState>(() =>
    userPasswordConfirmation.touched
      ? isValidPassword.value && passwordConfirmationMatches.value
      : null
  );

// ---------- password visibility ------------
const showPassword = ref(false);
const togglePasswordVisibility = () => {
  showPassword.value = !showPassword.value;
};

// ---------- acceptedEUA ------------
const acceptedEUA: FormInputValue = formFieldInputText(false);
const needsValidationAndAcceptedEUA = computed<FormInputValidationState>(() =>
  acceptedEUA.touched ? Boolean(acceptedEUA.value) : null
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
  if (registerErrorMessage.value) {
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
    Boolean(acceptedEUA.value)
);

// Hold onto a snapshot of the submitted details so that we can see if the user
// edits the fields to correct any validation errors
const submittedDetails = ref<{
  emailAddress: string;
  password: string;
  name: string;
} | null>(null);

const router = useRouter();
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
  const latestEUAVersionResponse = await getEUAVersion();
  let latestEUAVersion = undefined;
  if (latestEUAVersionResponse.success) {
    latestEUAVersion = latestEUAVersionResponse.result.euaVersion;
  }
  const newUserResponse = await registerUser(
    name,
    password,
    emailAddress,
    latestEUAVersion
  );
  if (newUserResponse.success) {
    const newUser = newUserResponse.result;
    setLoggedInUserData({
      ...newUser.userData,
      refreshToken: newUser.refreshToken,
      apiToken: newUser.token,
      refreshingToken: false,
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
  <div class="register-form px-4 pb-4 pt-5">
    <img
      src="../assets/logo-full.svg"
      alt="The Cacophony Project logo"
      width="220"
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
          @blur="userName.touched = true"
          :state="needsValidationAndIsValidUserName"
          aria-label="username"
          placeholder="username"
          :disabled="registrationInProgress"
          required
        />
        <b-form-invalid-feedback :state="needsValidationAndIsValidUserName">
          <span v-if="userNameIsTooShort">
            Username must be at least 3 characters
          </span>
          <span v-else-if="!isValidName(userName.value.trim())">
            Username must contain at least one letter (either case). It can also
            contain numbers, underscores and hyphens, but must
            <em>begin</em> with a letter or number.
          </span>
          <span v-else-if="userNameInUse">
            {{ userNameFieldValidationError.msg }}
          </span>
        </b-form-invalid-feedback>
      </div>
      <div class="mb-3">
        <b-form-input
          type="email"
          v-model="userEmailAddress.value"
          @blur="userEmailAddress.touched = true"
          :state="needsValidationAndIsValidEmailAddress"
          aria-label="email address"
          placeholder="email address"
          :disabled="registrationInProgress"
          required
        />
        <b-form-invalid-feedback :state="needsValidationAndIsValidEmailAddress">
          <span v-if="emailInUse">{{ emailFieldValidationError.msg }}</span>
          <span v-else>Enter a valid email address</span>
        </b-form-invalid-feedback>
      </div>
      <div class="mb-3">
        <div class="input-group">
          <b-form-input
            :type="showPassword ? 'text' : 'password'"
            v-model="userPassword.value"
            @blur="userPassword.touched = true"
            :state="needsValidationAndIsValidPassword"
            aria-label="password"
            placeholder="password"
            :disabled="registrationInProgress"
            required
          />
          <button
            type="button"
            :title="showPassword ? 'hide password' : 'show password'"
            class="
              input-group-text
              toggle-password-visibility-btn
              justify-content-center
            "
            @click.stop.prevent="togglePasswordVisibility"
          >
            <font-awesome-icon :icon="showPassword ? 'eye-slash' : 'eye'" />
          </button>
        </div>
        <b-form-invalid-feedback :state="needsValidationAndIsValidPassword">
          <span v-if="userPassword.value.trim().length === 0">
            Password cannot be blank
          </span>
          <span v-else-if="userPassword.value.trim().length < 8">
            Password must be at least 8 characters
          </span>
        </b-form-invalid-feedback>
      </div>
      <div class="mb-3">
        <b-form-input
          :type="showPassword ? 'text' : 'password'"
          v-model="userPasswordConfirmation.value"
          @blur="userPasswordConfirmation.touched = true"
          :state="needsValidationAndIsValidPasswordConfirmation"
          aria-label="re-enter password"
          placeholder="re-enter password"
          :disabled="registrationInProgress"
          required
        />
        <b-form-invalid-feedback
          :state="needsValidationAndIsValidPasswordConfirmation"
        >
          <span>Passwords don't match</span>
        </b-form-invalid-feedback>
      </div>
      <div class="input-group mb-3">
        <b-form-checkbox
          v-model="acceptedEUA.value"
          @blur="acceptedEUA.touched = true"
          :state="needsValidationAndAcceptedEUA"
          :disabled="registrationInProgress"
          required
        >
          <span class="small">
            I accept the
            <a
              target="_blank"
              href="https://www.2040.co.nz/pages/2040-end-user-agreement"
            >
              end user agreement
            </a>
            terms
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
  background: white;
  max-width: 360px;
  width: 100%;
  @media (min-width: 768px) {
    border-radius: 0.25rem;
  }
}
.toggle-password-visibility-btn {
  min-width: 3rem;
}
.alternate-action-links a {
  text-decoration: none;
  text-align: center;
  &:hover {
    text-decoration: underline;
  }
}
</style>
