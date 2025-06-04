<script lang="ts" setup>
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {ClientApi} from "@/api";
import {
  nonPendingUserProjects,
  refreshUserProjects,
  urlNormalisedCurrentProjectName,
} from "@models/LoggedInUser";
import type { ErrorResult, JwtAcceptInviteTokenPayload } from "@apiClient/types";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { HttpStatusCode } from "@typedefs/api/consts.ts";
import { urlNormaliseName } from "@/utils";
import { decodeJWT } from "@apiClient/utils.ts";
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
  if (params.token && validateToken.value === "") {
    const token = (params.token as string).replace(/:/g, ".");
    validateToken.value = token;
    const jwtToken = decodeJWT(token) as JwtAcceptInviteTokenPayload | null;
    if (jwtToken && jwtToken.group) {
      const validateTokenResponse = await ClientApi.Users.confirmAddToProjectRequest(token);
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
          if (
            validateError.value &&
            validateError.value.messages[0] === "User already belongs to group"
          ) {
            alreadyPartOfProject.value = true;
          }
        }
      } else {
        await refreshUserProjects();
        const nextProject = nonPendingUserProjects.value.find(
          ({ id }) => id === jwtToken.group,
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
  <div v-if="checkingValidateEmailToken">
    <b-spinner size="xl" class="me-2" /><span class="h1"
      >Confirming request</span
    >
  </div>
  <div v-else-if="alreadyPartOfProject">
    <span>You're already a member of this project</span>
  </div>
  <div v-else-if="!isValidValidateToken">
    <span>Error: Confirming request failed</span>
    {{ validateError }}
  </div>
</template>
