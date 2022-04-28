<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { BAlert } from "bootstrap-vue-3";
import { CurrentUser } from "@/models/LoggedInUser";
import { isEmpty, delayMs, formFieldInputText } from "@/utils";
import type { ApiLoggedInUserResponse as LoggedInUser } from "@typedefs/api/user";

// TODO Automatically trim form fields on submit?
// TODO Can we parse e.g body.password in the messages into contextual error messages?
// TODO Remember me preference checkbox?

interface FormInputValue {
  value: string;
  touched: boolean;
}

type FormInputValidationState = boolean | null;

const showPassword = ref(false);
const togglePasswordVisibility = () => {
  showPassword.value = !showPassword.value;
};

// TODO - tooltip on eye button?

const userEmailAddress: FormInputValue = formFieldInputText();
const userPassword: FormInputValue = formFieldInputText();
const rememberMe: FormInputValue = formFieldInputText(false);
const signInErrorMessage = ref("");
const signInInProgress = ref(false);

const hasError = computed({
  get: () => {
    return !isEmpty(signInErrorMessage.value);
  },
  set: (val: boolean) => {
    if (!val) {
      signInErrorMessage.value = "";
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

const isValidPassword = computed<boolean>(
  () => userPassword.value.trim().length >= 8
);

const needsValidationAndIsValidPassword = computed<FormInputValidationState>(
  () => (userPassword.touched ? isValidPassword.value : null)
);

const signInFormIsFilledAndValid = computed<boolean>(
  () => isValidEmailAddress.value && isValidPassword.value
);

const login = async () => {
  const emailAddress = userEmailAddress.value.trim();
  const password = userPassword.value.trim();
  signInInProgress.value = true;
  await delayMs(1000);
  signInInProgress.value = false;

  // Handle login response here, update the global loggedInUser object.
  CurrentUser.value = reactive<LoggedInUser>({
    email: "",
    endUserAgreement: 1,
    id: 1,
    globalPermission: "off",
    userName: "Test_user",
  } as LoggedInUser);
};
</script>
<template>
  <div class="sign-in-form px-4 pb-4 pt-5">
    <img
      src="../assets/logo-full.svg"
      alt="The Cacophony Project logo"
      width="220"
      class="mx-auto d-block mb-5"
    />
    <h1 class="h4 text-center mb-4">Sign in</h1>
    <b-form class="d-flex flex-column" @submit.stop.prevent="login" novalidate>
      <b-alert
        v-model="hasError"
        variant="danger"
        dismissible
        class="text-center"
        @dismissed="hasError = false"
      >
        {{ signInErrorMessage }}
      </b-alert>
      <div class="mb-3">
        <b-form-input
          type="email"
          v-model="userEmailAddress.value"
          @blur="userEmailAddress.touched = true"
          :state="needsValidationAndIsValidEmailAddress"
          aria-label="email address"
          placeholder="email address"
          :disabled="signInInProgress"
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
            :disabled="signInInProgress"
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
      <div class="input-group mb-3">
        <b-form-checkbox
          v-model="rememberMe.value"
          @blur="rememberMe.touched = true"
          :disabled="signInInProgress"
        >
          <span class="small"> Stay signed in on this device </span>
        </b-form-checkbox>
      </div>
      <button
        type="submit"
        class="btn btn-primary mb-3"
        :disabled="!signInFormIsFilledAndValid || signInInProgress"
      >
        <span v-if="signInInProgress">
          <span
            class="spinner-border spinner-border-sm"
            role="status"
            aria-hidden="true"
          ></span>
          Signing in...
        </span>
        <span v-else>Sign in</span>
      </button>
    </b-form>
    <div class="alternate-action-links d-flex justify-content-between my-2">
      <router-link to="forgot-password" class="small"
        >Forgot password?</router-link
      >
      <router-link to="register" class="small"
        >Create a new account</router-link
      >
    </div>
  </div>
</template>

<style scoped lang="less">
.sign-in-form {
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
