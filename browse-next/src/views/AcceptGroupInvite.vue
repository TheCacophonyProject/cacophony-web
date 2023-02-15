<script lang="ts" setup>
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { acceptGroupInvitation } from "@api/User";
import {
  nonPendingUserGroups,
  refreshUserGroups,
  urlNormalisedCurrentGroupName,
  userIsLoggedIn,
} from "@models/LoggedInUser";
import type { ErrorResult, JwtAcceptInviteTokenPayload } from "@api/types";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { HttpStatusCode } from "@typedefs/api/consts.ts";
import { decodeJWT, urlNormaliseName } from "@/utils";
const checkingValidateEmailToken = ref(false);
const validateToken = ref("");
const isValidValidateToken = ref(false);
const alreadyPartOfGroup = ref(false);
const validateError = ref<ErrorResult | null>(null);
const router = useRouter();
const { params } = useRoute();
onMounted(async () => {
  // Get the token, and sent it to the backend.
  checkingValidateEmailToken.value = true;
  if (params.token) {
    const token = (params.token as string).replace(/:/g, ".");
    const jwtToken = decodeJWT(token) as JwtAcceptInviteTokenPayload | null;
    if (jwtToken && jwtToken.group) {
      const alreadyAddedToGroup =
        userIsLoggedIn.value &&
        nonPendingUserGroups.value.find(({ id }) => id === jwtToken.group);
      if (!alreadyAddedToGroup) {
        const validateTokenResponse = await acceptGroupInvitation(
          jwtToken.group
        );
        if (!validateTokenResponse.success) {
          if (
            validateTokenResponse.status === HttpStatusCode.AuthorizationError
          ) {
            /*       await router.push({
            path: "/",
          });*/
          } else {
            // Grab the error.
            isValidValidateToken.value = false;
            validateError.value = validateTokenResponse.result;
          }
        } else {
          await refreshUserGroups();
          const nextGroup = nonPendingUserGroups.value.find(
            ({ id }) => id === jwtToken.group
          );
          let nextGroupName = urlNormalisedCurrentGroupName.value;
          if (nextGroup) {
            nextGroupName = urlNormaliseName(nextGroup.groupName);
          }
          isValidValidateToken.value = true;
          console.warn("Redirecting to dashboard");
          await router.push({
            name: "dashboard",
            params: {
              groupName: nextGroupName,
            },
          });
        }
        checkingValidateEmailToken.value = false;
      } else {
        alreadyPartOfGroup.value = true;
      }
    }
  }
});
</script>
<template>
  <h1 v-if="checkingValidateEmailToken">
    <span class="spinner-border-sm spinner-border"></span> Accepting invite
  </h1>
  <div v-else-if="!isValidValidateToken">
    <span>Error: Accepting invite failed</span>
    {{ validateError }}
  </div>
  <div v-else-if="alreadyPartOfGroup">
    <span>You're already a member of this group</span>
  </div>
</template>
