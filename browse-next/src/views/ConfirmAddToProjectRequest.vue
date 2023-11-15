<script lang="ts" setup>
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { confirmAddToProjectRequest } from "@api/User";
import {
  nonPendingUserProjects,
  refreshUserProjects,
  urlNormalisedCurrentProjectName,
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
const alreadyPartOfProject = ref(false);
const validateError = ref<ErrorResult | null>(null);
const router = useRouter();
const { params } = useRoute();
onMounted(async () => {
  // Get the token, and sent it to the backend.
  checkingValidateEmailToken.value = true;
  if (params.token) {
    debugger;
    const token = (params.token as string).replace(/:/g, ".");
    const jwtToken = decodeJWT(token) as JwtAcceptInviteTokenPayload | null;
    if (jwtToken && jwtToken.group) {
      const validateTokenResponse = await confirmAddToProjectRequest(
        token
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
          if (validateError.value.messages[0] === "User already belongs to group") {
            alreadyPartOfProject.value = true;
          }
        }
      } else {
        await refreshUserProjects();
        const nextProject = nonPendingUserProjects.value.find(
          ({ id }) => id === jwtToken.group
        );
        let nextProjectName = urlNormalisedCurrentProjectName.value;
        if (nextProject) {
          nextProjectName = urlNormaliseName(nextProject.groupName);
        }
        isValidValidateToken.value = true;
        console.warn("Redirecting to dashboard");
        await router.push({
          name: "dashboard",
          params: {
            projectName: nextProjectName,
          },
        });
      }
      checkingValidateEmailToken.value = false;
    }
  }
});
</script>
<template>
  <h1 v-if="checkingValidateEmailToken">
    <span class="spinner-border-sm spinner-border"></span> Confirming request
  </h1>
  <div v-else-if="alreadyPartOfProject">
    <span>You're already a member of this project</span>
  </div>
  <div v-else-if="!isValidValidateToken">
    <span>Error: Confirming request failed</span>
    {{ validateError }}
  </div>
</template>