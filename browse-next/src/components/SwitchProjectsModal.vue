<script lang="ts" setup>
import { BModal } from "bootstrap-vue-next";
import {
  currentSelectedProject,
  showSwitchProject,
  type LoggedInUser,
  shouldViewAsSuperUser,
} from "@models/LoggedInUser";
import { computed, inject, onBeforeMount, onMounted, ref, type Ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { urlNormaliseName } from "@/utils";
import { currentUser as currentUserInfo } from "@models/provides.ts";
import { userProjects as currentUserProjects } from "@models/provides.ts";
import type { ApiGroupResponse as ApiProjectResponse } from "@typedefs/api/group";
import { DateTime } from "luxon";
import Multiselect from "@vueform/multiselect";
import type { LoadedResource } from "@api/types.ts";
import { getAllProjects } from "@api/Project.ts";

const router = useRouter();
const currentRoute = useRoute();
const userProjects = inject(currentUserProjects) as Ref<ApiProjectResponse[]>;
const currentUser = inject(currentUserInfo) as Ref<LoggedInUser>;

const nextRoute = (projectName: string) => {
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

const getLatestRecordingTime = (group: ApiProjectResponse): Date => {
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

const selectedGroupName = ref<string>("");

onBeforeMount(async () => {
  if (
    !sortedUserProjects.value.find(
      ({ groupName }) => currentProjectName.value === groupName
    )
  ) {
    await loadAllProjects();
    if (
      (allProjects.value || []).find(
        ({ groupName }) => groupName === currentProjectName.value
      )
    ) {
      selectedGroupName.value = currentProjectName.value;
    }
  }
});

const allProjects = ref<LoadedResource<ApiProjectResponse[]>>(null);
const loadAllProjects = async () => {
  if (allProjects.value === null) {
    // Load projects
    const response = await getAllProjects(false);
    if (response.success) {
      allProjects.value = response.result.groups;
    }
  }
  return allNonUserProjects.value;
};

const allNonUserProjects = computed<ApiProjectResponse[]>(() => {
  if (allProjects.value) {
    return allProjects.value
      .filter(
        (project) =>
          !sortedUserProjects.value.map((p) => p.id).includes(project.id)
      )
      .map((project) => {
        return {
          ...project,
          latestRecordingTime: getLatestRecordingTime(project),
        };
      })
      .sort(
        (a, b) =>
          b.latestRecordingTime.getTime() - a.latestRecordingTime.getTime()
      );
  }
  return [];
});

const gotoNonUserProject = async () => {
  await router.push(nextRoute(selectedGroupName.value));
  showSwitchProject.visible = false;
};

onMounted(() => {
  showSwitchProject.visible = true;
});

interface ProjectListOption extends ApiProjectResponse {
  latestRecordingTime: Date;
}
</script>
<template>
  <b-modal
    title="Switch project"
    v-model="showSwitchProject.visible"
    centered
    hide-footer
    @hidden="showSwitchProject.enabled = false"
  >
    <div
      v-if="currentUser.globalPermission !== 'off'"
      class="super-user-overrides"
    >
      <div class="mb-3">
        Go to any project
        <multiselect
          placeholder="Select a project"
          value-prop="groupName"
          :options="loadAllProjects"
          v-model="selectedGroupName"
          @select="gotoNonUserProject"
        >
          <template #option="{ option }: { option: ProjectListOption }">
            <span class="d-flex justify-content-between w-100">
              <span>
                <span
                  >{{ option.groupName }} ({{
                    lastActiveRelativeToNow(option.latestRecordingTime)
                  }})</span
                >
                <span
                  v-if="option.groupName === currentProjectName"
                  class="ms-1"
                  >(selected)</span
                >
              </span>
              <span>
                <font-awesome-icon
                  color="#999"
                  icon="camera"
                  v-if="option.lastThermalRecordingTime"
                  class="ms-1"
                />
                <font-awesome-icon
                  color="#999"
                  icon="music"
                  v-if="option.lastAudioRecordingTime"
                  class="ms-1"
                />
                <font-awesome-icon
                  color="#999"
                  icon="question"
                  v-if="
                    !option.lastAudioRecordingTime &&
                    !option.lastThermalRecordingTime
                  "
                  class="ms-1"
                />
              </span>
            </span>
          </template>
          <template #singlelabel="{ value }: { value: ProjectListOption }">
            <span class="w-100 px-3">
              <span>
                <span
                  >{{ value.groupName }} ({{
                    lastActiveRelativeToNow(value.latestRecordingTime)
                  }})</span
                >
              </span>
              <span>
                <font-awesome-icon
                  color="#999"
                  icon="camera"
                  v-if="value.lastThermalRecordingTime"
                  class="ms-1"
                />
                <font-awesome-icon
                  color="#999"
                  icon="music"
                  v-if="value.lastAudioRecordingTime"
                  class="ms-1"
                />
                <font-awesome-icon
                  color="#999"
                  icon="question"
                  v-if="
                    !value.lastAudioRecordingTime &&
                    !value.lastThermalRecordingTime
                  "
                  class="ms-1"
                />
              </span>
            </span>
          </template>
        </multiselect>
      </div>
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
<style src="@vueform/multiselect/themes/default.css"></style>
