<script setup lang="ts">
import { computed, ref } from "vue";
import {
  BAlert,
  BForm,
  BFormInput,
  BFormInvalidFeedback,
} from "bootstrap-vue-next";
import { formFieldInputText } from "@/utils";
import type { FormInputValidationState, FormInputValue } from "@/utils";

import { ClientApi } from "@/api";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";

const userEmailAddress: FormInputValue = formFieldInputText();
const resetErrorMessage = ref<string | false>(false);
const resetInProgress = ref(false);
const resetSubmitted = ref(false);

const hasError = computed({
  get: () => {
    return resetErrorMessage.value !== false;
  },
  set: (val: boolean) => {
    if (!val) {
      resetErrorMessage.value = false;
    }
  },
});

const isValidEmailAddress = computed<boolean>(() => {
  const { value } = userEmailAddress;
  const email = value.trim();
  return email.length > 3 && email.includes("@") && !email.includes(" ");
});

const needsValidationAndIsValidEmailAddress =
  computed<FormInputValidationState>(() =>
    userEmailAddress.touched ? isValidEmailAddress.value : undefined,
  );

const resetPassword = async () => {
  const emailAddress = userEmailAddress.value.trim();
  resetInProgress.value = true;
  resetSubmitted.value = false;
  const resetPasswordResponse =
    await ClientApi.Users.sendPasswordResetRequest(emailAddress);
  if (resetPasswordResponse.success) {
    resetSubmitted.value = true;
  } else {
    // Do the thing with errors.
    resetErrorMessage.value = resetPasswordResponse.result.messages.join(", ");
    resetSubmitted.value = false;
  }
  resetInProgress.value = false;
};
</script>
<template>
  <div class="forgot-password-form p-4">
    <img
      src="../assets/cacophony-monitoring-logo.svg"
      alt="The Cacophony Project logo"
      width="256"
      class="mx-auto d-block mb-5"
    />
    <div v-if="resetSubmitted">
      <b-alert :model-value="true" variant="light" class="mb-4">
        <div class="description d-flex">
          <material-symbol name="info" class="me-2" size="1.25rem" />
          <div>
            <p>
              An email with a link to reset your password has been sent to
              <span class="fw-medium">{{ userEmailAddress.value }}</span
              >.
            </p>
            <p class="mb-0">
              Check your spam folder if you don't receive an email within 5
              minutes. Check the email address you entered for any typos.
            </p>
          </div>
        </div>
      </b-alert>
    </div>
    <div v-else>
      <h1 class="h4 text-center mb-4">Reset password</h1>
      <b-form
        class="d-flex flex-column"
        @submit.stop.prevent="resetPassword"
        novalidate
      >
        <b-alert
          v-model="hasError"
          variant="danger"
          dismissible
          class="text-center"
          @dismissed="hasError = false"
        >
          {{ resetErrorMessage }}
        </b-alert>
        <div class="mb-3">
          <b-form-input
            data-cy="user email address"
            type="email"
            v-model="userEmailAddress.value"
            @blur="userEmailAddress.touched = true"
            :state="needsValidationAndIsValidEmailAddress"
            aria-label="email address"
            placeholder="Email address"
            :disabled="resetInProgress"
            required
          />
          <b-form-invalid-feedback
            :state="needsValidationAndIsValidEmailAddress"
          >
            Enter a valid email address.
          </b-form-invalid-feedback>
        </div>
        <button
          data-cy="send reset password email button"
          type="submit"
          class="btn btn-primary mb-3"
          :disabled="!isValidEmailAddress || resetInProgress"
        >
          <span v-if="resetInProgress">
            <span
              class="spinner-border spinner-border-sm"
              role="status"
              aria-hidden="true"
            ></span>
            Sending email...
          </span>
          <span v-else>Send recovery email</span>
        </button>
      </b-form>
    </div>
    <div class="alternate-action-links d-flex justify-content-between my-2">
      <router-link :to="{ name: 'sign-in' }" class="small text-decoration-none">
        Sign in to your account
      </router-link>
      <router-link
        :to="{ name: 'register' }"
        class="small text-decoration-none"
      >
        Create a new account
      </router-link>
    </div>
  </div>
</template>

<style scoped lang="less">
.forgot-password-form {
  max-width: 360px;
  width: 100%;
}
</style>
