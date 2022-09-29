<script setup lang="ts">
// ---------- password ------------
import { formFieldInputText } from "@/utils";
import type { FormInputValue, FormInputValidationState } from "@/utils";
import { computed, onBeforeMount, ref } from "vue";
import type { ErrorResult } from "@api/types";
import { changePassword, validatePasswordResetToken } from "@api/User";
import type { ApiLoggedInUserResponse } from "@typedefs/api/user";
import { useRoute, useRouter } from "vue-router";

const userPassword: FormInputValue = formFieldInputText();
const userPasswordConfirmation: FormInputValue = formFieldInputText();
const isValidPassword = computed<boolean>(() => !passwordIsTooShort.value);
const passwordIsTooShort = computed<boolean>(
  () => userPassword.value.trim().length < 9
);
const needsValidationAndIsValidPassword = computed<FormInputValidationState>(
  () => (userPassword.touched ? isValidPassword.value : undefined)
);
const passwordConfirmationMatches = computed<boolean>(
  () => userPasswordConfirmation.value.trim() === userPassword.value.trim()
);
const needsValidationAndIsValidPasswordConfirmation =
  computed<FormInputValidationState>(() =>
    userPasswordConfirmation.touched
      ? isValidPassword.value && passwordConfirmationMatches.value
      : undefined
  );

// ---------- password visibility ------------
const showPassword = ref(false);
const togglePasswordVisibility = () => {
  showPassword.value = !showPassword.value;
};

// ---------- general ------------
const registerErrorMessage = ref<ErrorResult | false>(false);
const resetInProgress = ref(false);

// This starts of true when the page loads
const checkingResetToken = ref(false);
const invalidResetToken = ref(false);
const changedPassword = ref(false);
const resetToken = ref("");
const resetUser = ref<ApiLoggedInUserResponse | null>(null);
const userName = computed(() => {
  if (resetUser.value === null) {
    return "";
  }
  return resetUser.value.userName;
});

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
const resetFormIsFilledAndValid = computed<boolean>(
  () => isValidPassword.value && passwordConfirmationMatches.value
);
const router = useRouter();
const { params } = useRoute();
onBeforeMount(async () => {
  if (params.token) {
    checkingResetToken.value = true;
    if (Array.isArray(params.token) && params.token.length) {
      resetToken.value = params.token.shift() as string;
    } else if (typeof params.token === "string") {
      resetToken.value = params.token;
    }
    const validateTokenResponse = await validatePasswordResetToken(
      params.token as string
    );
    if (!validateTokenResponse.success) {
      // Grab the error.
      invalidResetToken.value = true;
      await router.push({
        name: "reset-password",
      });
    } else {
      resetUser.value = validateTokenResponse.result.userData;
      await router.push({
        name: "reset-password",
      });
    }
    checkingResetToken.value = false;
  } else {
    // No token supplied, redirect to sign-in
    await router.push({
      path: "sign-in",
    });
  }
});

const resetPassword = async () => {
  resetInProgress.value = true;
  const resetToken = "FOO";
  const changePasswordResponse = await changePassword(
    resetToken,
    userPassword.value
  );
  if (changePasswordResponse.success) {
    // FIXME - sign in automatically now?
    changedPassword.value = true;
    // TODO, show success message, and sign-in button.
  } else {
    // TODO What failures can we have.
    // FIXME - handle network connection refused.
    // TODO - Should network connection failure be a global message? (Maybe similar to the rocket chat banner).
    //  Once we get a network connection failure, we should poll to re-submit the request using an exponential back-off strategy.
  }
  resetInProgress.value = false;
};
</script>
<template>
  <div class="reset-password-form px-4 pb-4 pt-5">
    <img
      src="../assets/logo-full.svg"
      alt="The Cacophony Project logo"
      width="220"
      class="mx-auto d-block mb-5"
    />
    <h1 class="h4 text-center mb-4">
      <span v-if="checkingResetToken">Authorising...</span>
      <span v-else-if="invalidResetToken" class="alert-danger p-2 rounded"
        >Invalid reset token</span
      >
      <span v-else>Reset your password</span>
    </h1>
    <div v-if="invalidResetToken">
      <p class="mb-4 text-center">
        Reason the reset token was invalid (already used, validation failed etc)
      </p>
      <div class="alternate-action-links d-flex justify-content-between my-2">
        <router-link :to="{ name: 'register' }" class="small"
          >Create a new account</router-link
        >
        <router-link :to="{ name: 'sign-in' }" class="small"
          >Sign in to your account</router-link
        >
      </div>
    </div>
    <div v-if="checkingResetToken" class="text-center mb-5">
      <span class="spinner-border" />
    </div>
    <div v-else-if="!invalidResetToken">
      <h2>{{ userName }}, {{ resetToken }}</h2>
      <b-form
        class="d-flex flex-column"
        @submit.stop.prevent="resetPassword"
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
          <div class="input-group">
            <b-form-input
              :type="showPassword ? 'text' : 'password'"
              v-model="userPassword.value"
              @blur="userPassword.touched = true"
              :state="needsValidationAndIsValidPassword"
              aria-label="password"
              placeholder="new password"
              :disabled="resetInProgress"
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
            placeholder="re-enter new password"
            :disabled="resetInProgress"
            required
          />
          <b-form-invalid-feedback
            :state="needsValidationAndIsValidPasswordConfirmation"
          >
            <span>Passwords don't match</span>
          </b-form-invalid-feedback>
        </div>
        <button
          type="submit"
          class="btn btn-primary"
          :disabled="!resetFormIsFilledAndValid || resetInProgress"
        >
          <span v-if="resetInProgress">
            <span
              class="spinner-border spinner-border-sm"
              role="status"
              aria-hidden="true"
            ></span>
            Registering...
          </span>
          <span v-else>Reset my password</span>
        </button>
      </b-form>
    </div>
  </div>
</template>
<style scoped lang="less">
.reset-password-form {
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
