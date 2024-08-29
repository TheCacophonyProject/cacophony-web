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
  () => userPassword.value.trim().length < 8
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
const resetErrorMessage = ref<ErrorResult | false>(false);
const resetInProgress = ref(false);

// This starts of true when the page loads
const checkingResetToken = ref(false);
const invalidResetToken = ref(false);
const changedPassword = ref(false);
const resetToken = ref("");
const resetUser = ref<ApiLoggedInUserResponse | null>(null);
const hasNonValidationError = computed({
  get: () => {
    // Validation error messages should be handled at the field level.
    return (
      resetErrorMessage.value !== false &&
      resetErrorMessage.value.errorType !== "validation"
    );
  },
  set: (val: boolean) => {
    if (!val) {
      resetErrorMessage.value = false;
    }
  },
});

const resetErrorMessagesDisplay = computed(() => {
  if (resetErrorMessage.value) {
    return resetErrorMessage.value.messages.join(", ");
  } else {
    return "";
  }
});
const resetFormIsFilledAndValid = computed<boolean>(
  () => isValidPassword.value && passwordConfirmationMatches.value
);
const invalidReason = ref<string>("");
const router = useRouter();
const { params } = useRoute();
onBeforeMount(async () => {
  if (params.token) {
    checkingResetToken.value = true;
    if (Array.isArray(params.token) && params.token.length) {
      resetToken.value = params.token.shift() as string;
    } else if (typeof params.token === "string") {
      resetToken.value = params.token.replace(/:/g, ".");
    }
    const validateTokenResponse = await validatePasswordResetToken(
      resetToken.value
    );
    checkingResetToken.value = false;
    console.log(validateTokenResponse);
    if (!validateTokenResponse.success) {
      invalidReason.value = validateTokenResponse.result.messages[0];
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
  } else {
    // No token supplied, redirect to sign-in
    await router.push({
      name: "sign-in",
    });
  }
});
const resetPassword = async () => {
  resetInProgress.value = true;
  const changePasswordResponse = await changePassword(
    resetToken.value,
    userPassword.value
  );
  console.log("Resetting", userPassword.value);
  if (changePasswordResponse.success) {
    changedPassword.value = true;
  } else {
    resetErrorMessage.value = changePasswordResponse.result;
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
      <span v-else-if="!changedPassword">Reset your password</span>
      <span v-if="changedPassword">Your password was reset</span>
    </h1>
    <div v-if="invalidResetToken">
      <div class="mb-3 text-danger">{{ invalidReason }}</div>
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
    <div v-else-if="!invalidResetToken && !changedPassword">
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
          {{ resetErrorMessagesDisplay }}
        </b-alert>
        <div class="mb-3">
          <div class="input-group">
            <b-form-input
              data-cy="new password field"
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
        <div class="mb-3">
          <b-form-input
            data-cy="new password confirmation field"
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
          data-cy="reset password button"
          :disabled="!resetFormIsFilledAndValid || resetInProgress"
        >
          <span v-if="resetInProgress">
            <span
              class="spinner-border spinner-border-sm"
              role="status"
              aria-hidden="true"
            ></span>
            Resetting...
          </span>
          <span v-else>Reset my password</span>
        </button>
      </b-form>
    </div>
    <div v-if="changedPassword" class="d-flex justify-content-center">
      <b-button
        data-cy="sign in button"
        class="d-flex flex-grow-1 justify-content-center"
        :to="{ name: 'sign-in' }"
        variant="primary"
        >Go to sign in</b-button
      >
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
