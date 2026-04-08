<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import {
  login,
  refreshUserProjects,
  urlNormalisedCurrentProjectName,
} from "@models/LoggedInUser";
import type { PendingRequest } from "@models/LoggedInUser";
import { isEmpty, formFieldInputText } from "@/utils";
import type { FormInputValue, FormInputValidationState } from "@/utils";
import { useRoute, useRouter } from "vue-router";
import type { RouteLocationRaw } from "vue-router";
import {
  BAlert,
  BForm,
  BFormInput,
  BFormInvalidFeedback,
  BSpinner,
} from "bootstrap-vue-next";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";

const showPassword = ref(false);
const togglePasswordVisibility = () => {
  showPassword.value = !showPassword.value;
};

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

const hasProjectInviteToken = computed<boolean>(() => {
  return (
    !!route.query.nextUrl && route.query.nextUrl.includes("/accept-invite/")
  );
});

const submitLogin = async () => {
  delete (signInInProgress as PendingRequest).errors;
  await login(userEmailAddress.value, userPassword.value, signInInProgress);
  if ((signInInProgress as PendingRequest).errors) {
    signInErrorMessage.value =
      (signInInProgress as PendingRequest).errors?.messages[0] || "";
  } else {
    const nextUrl = route.query.nextUrl;
    await refreshUserProjects();
    if (nextUrl) {
      const to: RouteLocationRaw = {
        path: nextUrl as string,
      };
      await router.push(to);
    } else {
      if (urlNormalisedCurrentProjectName.value) {
        await router.push({
          name: "dashboard",
          params: {
            projectName: urlNormalisedCurrentProjectName.value,
          },
        });
      } else {
        await router.push({
          name: "setup",
        });
      }
    }
  }
};

const isValidEmailAddress = computed<boolean>(() => {
  const { value } = userEmailAddress;
  const email = value.trim();
  return email.length > 3 && email.includes("@") && !email.includes(" ");
});

const needsValidationAndIsValidEmailAddress =
  computed<FormInputValidationState>(() =>
    userEmailAddress.touched ? isValidEmailAddress.value : undefined,
  );

const isValidPassword = computed<boolean>(
  () => userPassword.value.trim().length >= 8,
);

const needsValidationAndIsValidPassword = computed<FormInputValidationState>(
  () => (userPassword.touched ? isValidPassword.value : undefined),
);

const signInFormIsFilledAndValid = computed<boolean>(
  () => isValidEmailAddress.value && isValidPassword.value,
);
</script>
<template>
  <div class="sign-in-form p-4">
    <img
      src="../assets/cacophony-monitoring-logo.svg"
      alt="The Cacophony Project logo"
      width="256"
      class="mx-auto d-block mb-5"
    />
    <h1 class="h4 text-center mb-4">Sign in</h1>
    <b-form
      class="d-flex flex-column"
      @submit.stop.prevent="submitLogin"
      novalidate
    >
      <b-alert v-model="hasError" variant="danger" class="text-center">
        {{ signInErrorMessage }}
      </b-alert>
      <b-alert
        v-model="hasProjectInviteToken"
        variant="warning"
        class="text-center"
      >
        You've been invited to join a project.<br />To accept the invitation,
        first sign in. <br />If you don't yet have an account, first create one,
        using the email address that the invite was sent to.
      </b-alert>
      <div class="mb-3">
        <b-form-input
          type="email"
          v-model="userEmailAddress.value"
          @blur="userEmailAddress.touched = true"
          :state="needsValidationAndIsValidEmailAddress"
          @input="hasError = false"
          aria-label="Email address"
          placeholder="Email address"
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
            @input="hasError = false"
            :state="needsValidationAndIsValidPassword"
            aria-label="Password"
            placeholder="Password"
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
            <material-symbol
              :name="showPassword ? 'visibility_off' : 'visibility'"
              size="1.25rem"
            />
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
        class="btn btn-primary btn-lg mb-3"
        data-cy="sign in button"
        :disabled="
          !signInFormIsFilledAndValid || signInInProgress.requestPending
        "
      >
        <span
          v-if="signInInProgress.requestPending"
          class="d-flex align-items-center justify-content-center"
        >
          <b-spinner role="status" aria-hidden="true" small></b-spinner>
          <span class="ms-2">Signing in...</span>
        </span>
        <span v-else>Sign in</span>
      </button>
    </b-form>
    <div class="alternate-action-links d-flex justify-content-between my-2">
      <router-link
        :to="{ name: 'forgot-password' }"
        class="small text-decoration-none"
        data-cy="forgotten password link"
        >Forgot password?</router-link
      >
      <router-link
        :to="{ name: 'register' }"
        class="small text-decoration-none"
        data-cy="create new account link"
        >Create a new account</router-link
      >
    </div>
  </div>
</template>

<style scoped lang="less">
.sign-in-form {
  max-width: 360px;
  width: 100%;
}
</style>
