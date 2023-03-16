<script lang="ts" setup>
import { BModal } from "bootstrap-vue-3";
import {
  UserProjects,
  currentSelectedProject,
  showSwitchProject,
} from "@models/LoggedInUser";
import { computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { urlNormaliseName } from "@/utils";

const nextRoute = (projectName: string) => {
  const currentRoute = useRoute();
  if (currentRoute.params.groupName) {
    return {
      ...currentRoute,
      params: {
        ...currentRoute.params,
        projectName: urlNormaliseName(projectName),
      },
    };
  } else {
    // On a non-group scoped route, so reset to dashboard view
    return {
      ...currentRoute,
      name: "dashboard",
      params: {
        ...currentRoute.params,
        projectName: urlNormaliseName(projectName),
      },
    };
  }
};
const currentProjectName = computed<string>(() => {
  return (
    (currentSelectedProject.value && currentSelectedProject.value.groupName) ||
    ""
  );
});

onMounted(() => {
  showSwitchProject.visible = true;
});

// TODO: Add icons for a) the kinds of devices in the group, and b) If there are recent recordings in the last 24 hours for each device type.
</script>
<template>
  <b-modal
    title="Switch project"
    v-model="showSwitchProject.visible"
    centered
    hide-footer
    @hidden="showSwitchProject.enabled = false"
  >
    <div class="list-group">
      <router-link
        :class="[
          'list-group-item',
          { 'list-group-item-action': groupName !== currentProjectName },
          { disabled: groupName === currentProjectName },
        ]"
        v-for="({ groupName, id }, index) in UserProjects"
        :key="id"
        :to="nextRoute(groupName)"
        :aria-disabled="groupName === currentProjectName"
        :tabindex="groupName === currentProjectName ? -1 : index"
        @click="showSwitchProject.visible = false"
      >
        {{ groupName }}
        <span v-if="groupName === currentProjectName">(selected)</span>
      </router-link>
    </div>
  </b-modal>
</template>
