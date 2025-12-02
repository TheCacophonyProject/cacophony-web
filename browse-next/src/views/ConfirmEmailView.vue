<script lang="ts" setup>
import { inject, onBeforeMount, type Ref, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {ClientApi} from "@/api";
import {
  type LoggedInUser,
  setLoggedInUserData,
  urlNormalisedCurrentProjectName,
  userHasProjects,
  userIsLoggedIn,
} from "@models/LoggedInUser";
import { DEFAULT_AUTH_ID, type ErrorResult } from "@apiClient/types";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { HttpStatusCode } from "@typedefs/api/consts.ts";
import type { ApiLoggedInUserResponse } from "@typedefs/api/user";
import { currentUser } from "@models/provides.ts";
const CurrentUser = inject(currentUser) as Ref<LoggedInUser | null>;
const checkingValidateEmailToken = ref(false);
const validateToken = ref("");
const isValidValidateToken = ref(false);
const validateError = ref<ErrorResult | null>(null);
const router = useRouter();
const { params } = useRoute();

const testToken = ref("");

onBeforeMount(async () => {
  // Get an email confirmation token for testing.
  // const tokenResponse = await debugGetEmailConfirmationToken("admin@email.com");
  // if (tokenResponse.success && tokenResponse.status === HttpStatusCode.Ok) {
  //   testToken.value = tokenResponse.result.token.replace(/\./g, ":");
  // }

  // Get the token, and sent it to the backend.
  const alreadyValidated =
    userIsLoggedIn.value &&
    CurrentUser.value &&
    (CurrentUser.value as ApiLoggedInUserResponse).emailConfirmed;
  if (params.token && !alreadyValidated) {
    checkingValidateEmailToken.value = true;
    if (Array.isArray(params.token) && params.token.length) {
      validateToken.value = (params.token.shift() as string).replace(/:/g, ".");
    } else if (typeof params.token === "string") {
      validateToken.value = params.token.replace(/:/g, ".");
    }

    const validateTokenResponse = await ClientApi.Users.validateEmailConfirmationToken(
      validateToken.value,
    );
    if (!validateTokenResponse.success) {
      if (validateTokenResponse.status === HttpStatusCode.AuthorizationError) {
        // await router.push({
        //   path: "/",
        // });
      } else {
        // Grab the error.
        isValidValidateToken.value = false;
        validateError.value = validateTokenResponse.result;
      }
    } else {
      isValidValidateToken.value = true;
      const { userData, token, refreshToken, signOutUser } =
        validateTokenResponse.result;
      if (signOutUser) {
        await router.push({ name: "sign-out" });
        return;
      }
      setLoggedInUserData({
        ...userData,
      });
      ClientApi.registerCredentials(DEFAULT_AUTH_ID, {
        apiToken: token,
        refreshToken,
        userData,
      });

      // NOTE: Should redirect to "setup" if user has no groups
      if (userHasProjects.value) {
        console.warn("Redirecting to dashboard");
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
    checkingValidateEmailToken.value = false;
  } else {
    if (userIsLoggedIn.value) {
      if (userHasProjects.value) {
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
    } else {
      // No token supplied, redirect to sign-in
      await router.push({
        name: "sign-in",
      });
    }
  }
});
</script>
<template>
  <div v-if="checkingValidateEmailToken">
    <b-spinner size="xl" class="me-2" /><span class="h1"
      >Confirming your email</span
    >
  </div>
  <div v-else-if="!isValidValidateToken">
    {{ validateError }}
  </div>
  <div v-else>
    <p>{{ testToken.replace(/\./g, ":") }}</p>
  </div>
</template>
