<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { BAlert } from "bootstrap-vue-3";
import { CurrentUser } from "@/models/LoggedInUser";
import type { LoggedInUser } from "@/models/LoggedInUser";
import { isEmpty, delayMs, formFieldInputText, isValidName } from "@/utils";

// TODO Automatically trim form fields on submit?
// TODO Can we parse e.g body.password in the messages into contextual error messages?

interface FormInputValue {
  value: string;
  touched: boolean;
}

type FormInputValidationState = boolean | null;

const showPassword = ref(false);
const togglePasswordVisibility = () => {
  showPassword.value = !showPassword.value;
};

const userName: FormInputValue = formFieldInputText();
const userEmailAddress: FormInputValue = formFieldInputText();
const userPassword: FormInputValue = formFieldInputText();
const userPasswordConfirmation: FormInputValue = formFieldInputText();
const acceptedEUA: FormInputValue = formFieldInputText(false);

const registerErrorMessage = ref("");
const registrationInProgress = ref(false);

const hasError = computed({
  get: () => {
    return !isEmpty(registerErrorMessage.value);
  },
  set: (val: boolean) => {
    if (!val) {
      registerErrorMessage.value = "";
    }
  },
});

const isValidEmailAddress = computed<boolean>(() => {
  const { value } = userEmailAddress;
  const email = value.trim();
  return email.length > 3 && email.includes("@");
});

const needsValidationAndIsValidEmailAddress =
  computed<FormInputValidationState>(() =>
    userEmailAddress.touched ? isValidEmailAddress.value : null
  );

const needsValidationAndIsValidUserName = computed<FormInputValidationState>(
  () => (userName.touched ? isValidUserName.value : null)
);

const isValidPassword = computed<boolean>(
  () => userPassword.value.trim().length >= 8
);

const isValidUserName = computed<boolean>(() =>
  isValidName(userName.value.trim())
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

const needsValidationAndAcceptedEUA = computed<FormInputValidationState>(() =>
  acceptedEUA.touched ? Boolean(acceptedEUA.value) : null
);

const registrationFormIsFilledAndValid = computed<boolean>(
  () =>
    isValidEmailAddress.value &&
    isValidPassword.value &&
    isValidUserName.value &&
    passwordConfirmationMatches.value &&
    Boolean(acceptedEUA.value)
);

const register = async () => {
  const emailAddress = userEmailAddress.value.trim();
  const password = userPassword.value.trim();
  const name = userName.value.trim();
  registrationInProgress.value = true;
  await delayMs(1000);
  registrationInProgress.value = false;

  // FIXME - Remove remember me feature and move it to the sign-in page.

  // Register, then log the user in.
  // TODO: Send an email confirmation email, and make sure we don't try to send transactional emails until we've validated the email address.

  // Handle login response here, update the global loggedInUser object.
  CurrentUser.value = reactive<LoggedInUser>({
    email: "",
    endUserAgreement: 1,
    id: 1,
    globalPermission: "off",
    userName: "Test_user",
    apiToken: "FOO",
  } as LoggedInUser);
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
        v-model="hasError"
        variant="danger"
        dismissible
        class="text-center"
        @dismissed="hasError = false"
      >
        {{ registerErrorMessage }}
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
          <span v-if="userName.value.trim().length < 3">
            Username must be at least 3 characters
          </span>
          <span v-else-if="!isValidName(userName.value.trim())">
            Username must contain at least one letter (either case). It can also
            contain numbers, underscores and hyphens, but must
            <em>begin</em> with a letter or number.
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
          Enter a valid email address
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
            :title="showPassword ? 'hide password' : 'show password'"
            class="input-group-text toggle-password-visibility-btn justify-content-center"
            @click.stop.prevent="togglePasswordVisibility"
          >
            <font-awesome-icon :icon="showPassword ? 'eye-slash' : 'eye'" />
          </button>
        </div>
        <b-form-invalid-feedback :state="needsValidationAndIsValidPassword">
          <span v-if="userPassword.value.trim().length === 0">
            Password cannot be blank
          </span>
          <span v-else-if="userPassword.value.trim().length <= 8">
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
