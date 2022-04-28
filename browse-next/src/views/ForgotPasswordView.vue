<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { BAlert } from "bootstrap-vue-3";
import {isEmpty, delayMs, formFieldInputText} from "@/utils";

// TODO Automatically trim form fields on submit?
// TODO Can we parse e.g body.password in the messages into contextual error messages?
// TODO Remember me preference checkbox?

interface FormInputValue {
  value: string;
  touched: boolean;
}

type FormInputValidationState = boolean | null;

const userEmailAddress: FormInputValue = formFieldInputText();
const resetErrorMessage = ref("");
const resetInProgress = ref(false);
const resetSubmitted = ref(false);

const hasError = computed({
  get: () => {
    return !isEmpty(resetErrorMessage.value);
  },
  set: (val: boolean) => {
    if (!val) {
      resetErrorMessage.value = "";
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

const resetPassword = async () => {
  const emailAddress = userEmailAddress.value.trim();
  resetInProgress.value = true;
  await delayMs(1000);
  resetInProgress.value = false;
  resetSubmitted.value = true;
  // Form submitted, please check your email.  If you don't see an email within 5 minutes, make sure to check your spam folder.
};
</script>
<template>
  <div class="forgot-password-form px-4 pb-4 pt-5">
    <img
      src="../assets/logo-full.svg"
      alt="The Cacophony Project logo"
      width="220"
      class="mx-auto d-block mb-5"
    />
    <div v-if="resetSubmitted">
      <p>
        An email with a link to reset your password has been sent to
        <span class="email-address-confirmation">{{
          userEmailAddress.value
        }}</span>
      </p>
      <p class="mb-4 small">
        If you don't receive the email within 5 minutes, make sure to check your
        spam folder.
      </p>
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
            type="email"
            v-model="userEmailAddress.value"
            @blur="userEmailAddress.touched = true"
            :state="needsValidationAndIsValidEmailAddress"
            aria-label="email address"
            placeholder="email address"
            :disabled="resetInProgress"
            required
          />
          <b-form-invalid-feedback
            :state="needsValidationAndIsValidEmailAddress"
          >
            Enter a valid email address
          </b-form-invalid-feedback>
        </div>
        <button
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
          <span v-else>Send account recovery email</span>
        </button>
      </b-form>
    </div>
    <div class="alternate-action-links d-flex justify-content-between my-2">
      <router-link to="register" class="small"
        >Create a new account</router-link
      >
      <router-link to="sign-in" class="small"
        >Sign in to your account</router-link
      >
    </div>
  </div>
</template>

<style scoped lang="less">
.forgot-password-form {
  background: white;
  max-width: 360px;
  width: 100%;
  @media (min-width: 768px) {
    border-radius: 0.25rem;
  }
}
.email-address-confirmation {
  font-style: italic;
  font-weight: bold;
}
.alternate-action-links a {
  text-decoration: none;
  text-align: center;
  &:hover {
    text-decoration: underline;
  }
}
</style>
