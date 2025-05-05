<script lang="ts" setup>
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { acceptProjectInvitation } from "@api/User";
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
const alreadyPartOfProject = ref(false);
const checkingValidateEmailToken = ref(false);
const isValidValidateToken = ref(false);
const validateError = ref<ErrorResult | null>(null);
const validateToken = ref("");
const router = useRouter();
const { params } = useRoute();
onMounted(async () => {
  // Get the token, and sent it to the backend.
  checkingValidateEmailToken.value = true;
  if (params.token && validateToken.value == "") {
    const token = (params.token as string).replace(/:/g, ".");
    validateToken.value = token;
    const jwtToken = decodeJWT(token) as JwtAcceptInviteTokenPayload | null;
    if (jwtToken && jwtToken.group) {
      const alreadyAddedToProject =
        userIsLoggedIn.value &&
        nonPendingUserProjects.value.find(({ id }) => id === jwtToken.group);
      if (!alreadyAddedToProject) {
        const validateTokenResponse = await acceptProjectInvitation(
          jwtToken.group,
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
      } else {
        alreadyPartOfProject.value = true;
      }
    }
  }
});
</script>
<template>
  <div v-if="checkingValidateEmailToken">
    <b-spinner size="xl" class="me-2" /><span class="h1">Accepting invite</span>
  </div>
  <div v-else-if="!isValidValidateToken">
    <span>Error: Accepting invite failed</span>
    {{ validateError }}
  </div>
  <div v-else-if="alreadyPartOfProject">
    <span>You're already a member of this project</span>
  </div>
</template>
