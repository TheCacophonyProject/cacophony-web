<script lang="ts" setup>
import { BModal } from "bootstrap-vue-next";
import {
  currentSelectedProject,
  showSwitchProject,
  type LoggedInUser,
} from "@models/LoggedInUser";
import { computed, inject, onMounted, type Ref } from "vue";
import { useRoute } from "vue-router";
import { urlNormaliseName } from "@/utils";
import { currentUser as currentUserInfo } from "@models/provides.ts";
import { userProjects as currentUserProjects } from "@models/provides.ts";
import type { ApiGroupResponse } from "@typedefs/api/group";
import { DateTime } from "luxon";

const userProjects = inject(currentUserProjects) as Ref<ApiGroupResponse[]>;
const currentUser = inject(currentUserInfo) as Ref<LoggedInUser>;

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

const getLatestRecordingTime = (group: ApiGroupResponse): Date => {
  const lastThermal =
    (group.lastThermalRecordingTime &&
      new Date(group.lastThermalRecordingTime)) ||
    new Date(0);
  const lastAudio =
    (group.lastAudioRecordingTime && new Date(group.lastAudioRecordingTime)) ||
    new Date(0);
  if (lastThermal > lastAudio) {
    return lastThermal;
  }
  return lastAudio;
};

// Sort projects by latest active device
const sortedUserProjects = computed(() => {
  const projects = [...userProjects.value].map((project) => ({
    ...project,
    latestRecordingTime: getLatestRecordingTime(project),
  }));
  projects.sort((a, b) => {
    return b.latestRecordingTime.getTime() - a.latestRecordingTime.getTime();
  });
  return projects;
});

const lastActiveRelativeToNow = (date: Date): string => {
  if (date.getTime() === 0) {
    return "not active";
  }
  return `active ${DateTime.fromJSDate(date).toRelative() as string}`;
};

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
    <div v-if="currentUser.globalPermission !== 'off'">
      View any project
      <multiselect :options="sortedUserProjects"> </multiselect>
    </div>
    <div class="list-group" v-if="sortedUserProjects">
      <p v-if="currentUser.globalPermission !== 'off'">My projects</p>
      <router-link
        :class="[
          'list-group-item',
          { 'list-group-item-action': groupName !== currentProjectName },
          { disabled: groupName === currentProjectName },
        ]"
        v-for="(
          {
            groupName,
            id,
            lastThermalRecordingTime,
            lastAudioRecordingTime,
            latestRecordingTime,
          },
          index
        ) in sortedUserProjects"
        :key="id"
        :to="nextRoute(groupName)"
        :aria-disabled="groupName === currentProjectName"
        :tabindex="groupName === currentProjectName ? -1 : index"
        @click="showSwitchProject.visible = false"
      >
        <span class="d-flex justify-content-between">
          <span>
            <span
              >{{ groupName }} ({{
                lastActiveRelativeToNow(latestRecordingTime)
              }})</span
            >
            <span v-if="groupName === currentProjectName" class="ms-1"
              >(selected)</span
            >
          </span>
          <span>
            <font-awesome-icon
              color="#999"
              icon="camera"
              v-if="lastThermalRecordingTime"
              class="ms-1"
            />
            <font-awesome-icon
              color="#999"
              icon="music"
              v-if="lastAudioRecordingTime"
              class="ms-1"
            />
            <font-awesome-icon
              color="#999"
              icon="question"
              v-if="!lastAudioRecordingTime && !lastThermalRecordingTime"
              class="ms-1"
            />
          </span>
        </span>
      </router-link>
    </div>
  </b-modal>
</template>
