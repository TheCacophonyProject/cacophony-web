<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { BAlert } from "bootstrap-vue-3";
import { login } from "@models/LoggedInUser";
import { isEmpty, formFieldInputText } from "@/utils";
import type { FormInputValue, FormInputValidationState } from "@/utils";
import { useRoute, useRouter } from "vue-router";
import type { RouteLocationRaw } from "vue-router";

// TODO Can we parse e.g body.password in the messages into contextual error messages?

const showPassword = ref(false);
const togglePasswordVisibility = () => {
  showPassword.value = !showPassword.value;
};

// TODO - tooltip on eye button?

const userEmailAddress: FormInputValue = formFieldInputText();
const userPassword: FormInputValue = formFieldInputText();
const signInErrorMessage = ref("");
const signInInProgress = reactive({
  requestPending: false,
});

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

const router = useRouter();
const route = useRoute();
const submitLogin = async () => {
  await login(userEmailAddress.value, userPassword.value, signInInProgress);
  const nextUrl = route.query.nextUrl;
  const to: RouteLocationRaw = {
    path: "/",
  };
  if (nextUrl) {
    to.query = {
      nextUrl,
    };
  }
  await router.push(to);
};

const isValidEmailAddress = computed<boolean>(() => {
  const { value } = userEmailAddress;
  const email = value.trim();
  return email.length > 3 && email.includes("@") && !email.includes(" ");
});

const needsValidationAndIsValidEmailAddress =
  computed<FormInputValidationState>(() =>
    userEmailAddress.touched ? isValidEmailAddress.value : undefined
  );

const isValidPassword = computed<boolean>(
  () => userPassword.value.trim().length >= 8
);

const needsValidationAndIsValidPassword = computed<FormInputValidationState>(
  () => (userPassword.touched ? isValidPassword.value : undefined)
);

const signInFormIsFilledAndValid = computed<boolean>(
  () => isValidEmailAddress.value && isValidPassword.value
);
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
    <b-form
      class="d-flex flex-column"
      @submit.stop.prevent="submitLogin"
      novalidate
    >
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
          data-cy="email address"
          :disabled="signInInProgress.requestPending"
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
            data-cy="password"
            :disabled="signInInProgress.requestPending"
            required
          />
          <button
            type="button"
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
          <span v-else-if="userPassword.value.trim().length < 8">
            Password must be at least 8 characters
          </span>
        </b-form-invalid-feedback>
      </div>
      <button
        type="submit"
        class="btn btn-primary mb-3"
        data-cy="sign in button"
        :disabled="
          !signInFormIsFilledAndValid || signInInProgress.requestPending
        "
      >
        <div
          v-if="signInInProgress.requestPending"
          class="d-flex align-items-center justify-content-center"
        >
          <b-spinner role="status" aria-hidden="true" small></b-spinner>
          <span class="ms-2">Signing in...</span>
        </div>
        <span v-else>Sign in</span>
      </button>
    </b-form>
    <div class="alternate-action-links d-flex justify-content-between my-2">
      <router-link :to="{ name: 'forgot-password' }" class="small"
        >Forgot password?</router-link
      >
      <router-link :to="{ name: 'register' }" class="small"
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
