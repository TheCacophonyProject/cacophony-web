<script lang="ts" setup>
import { onBeforeMount, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  debugGetEmailConfirmationToken,
  validateEmailConfirmationToken,
} from "@api/User";
import { setLoggedInUserData } from "@models/LoggedInUser";
import type { ErrorResult } from "@api/types";

const checkingValidateEmailToken = ref(false);
const validateToken = ref("");
const isValidValidateToken = ref(false);
const validateError = ref<ErrorResult | null>(null);
const router = useRouter();
const { params } = useRoute();

const testToken = ref("");

onBeforeMount(async () => {
  // Get an email confirmation token for testing.
  const tokenResponse = await debugGetEmailConfirmationToken("admin@email.com");
  if (tokenResponse.success) {
    testToken.value = tokenResponse.result.token.replace(/\./g, ":");
  }

  // Get the token, and sent it to the backend.
  if (params.token) {
    checkingValidateEmailToken.value = true;
    if (Array.isArray(params.token) && params.token.length) {
      validateToken.value = (params.token.shift() as string).replace(/:/g, ".");
    } else if (typeof params.token === "string") {
      validateToken.value = params.token.replace(/:/g, ".");
    }

    // FIXME - check it's a valid token payload locally.

    const validateTokenResponse = await validateEmailConfirmationToken(
      validateToken.value
    );
    if (!validateTokenResponse.success) {
      if (validateTokenResponse.status === 401) {
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
        apiToken: token,
        refreshToken,
      });

      await router.push({
        path: "/",
      });
    }
    checkingValidateEmailToken.value = false;
  } else {
    // No token supplied, redirect to sign-in
    await router.push({
      path: "sign-in",
    });
  }
});
</script>
<template>
  <h1 v-if="checkingValidateEmailToken">
    <span class="spinner-border-sm spinner-border"></span> Confirming your email
  </h1>
  <div v-else-if="!isValidValidateToken">
    {{ validateError }}
  </div>
  <div v-else>
    <p>{{ testToken.replace(/\./g, ":") }}</p>
  </div>
</template>
