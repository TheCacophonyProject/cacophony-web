<script lang="ts" setup>
import { BBadge, BModal } from "bootstrap-vue-next";
import {
  currentSelectedProject,
  showSwitchProject,
  type LoggedInUser,
} from "@models/LoggedInUser";
import {
  computed,
  inject,
  nextTick,
  onBeforeMount,
  onMounted,
  ref,
  type Ref,
  watch,
} from "vue";
import { type RouteLocationRaw, useRoute, useRouter } from "vue-router";
import { urlNormaliseName } from "@/utils";
import { currentUser as currentUserInfo } from "@models/provides.ts";
import { userProjects as currentUserProjects } from "@models/provides.ts";
import type { ApiGroupResponse as ApiProjectResponse } from "@typedefs/api/group";
import { DateTime } from "luxon";
import Multiselect from "@vueform/multiselect";
import type { LoadedResource } from "@apiClient/types.ts";
import type { ApiLoggedInUserResponse } from "@typedefs/api/user";
import type { DeviceId, UserId } from "@typedefs/api/common";
import type { ApiDeviceResponse } from "@typedefs/api/device";
import DeviceName from "@/components/DeviceName.vue";
import { ClientApi } from "@/api";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";

const router = useRouter();
const currentRoute = useRoute();
const userProjects = inject(currentUserProjects) as Ref<ApiProjectResponse[]>;
const currentUser = inject(currentUserInfo) as Ref<LoggedInUser>;

interface MultiSelectElement extends Multiselect {
  $el: HTMLElement;
}

const nextRoute = (projectName: string): RouteLocationRaw => {
  const newRoute = {
    ...currentRoute,
    name: "dashboard",
    params: {
      projectName: urlNormaliseName(projectName),
    },
    query: null,
  };
  delete (newRoute as never)["path"];
  delete (newRoute as never)["fullPath"];
  return newRoute as unknown as RouteLocationRaw;
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
  const projects = [...(userProjects.value || [])].map((project) => ({
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

const selectedProjectName = ref<string>("");

onBeforeMount(async () => {
  if (currentUser.value.globalPermission !== "off") {
    await loadAllProjects();
  }
  if (
    !sortedUserProjects.value.find(
      ({ groupName }) => currentProjectName.value === groupName,
    )
  ) {
    if (
      (allProjects.value || []).find(
        ({ groupName }) => groupName === currentProjectName.value,
      )
    ) {
      selectedProjectName.value = currentProjectName.value;
    }
  }
});

const allProjectsInternal = ref<LoadedResource<ApiProjectResponse[]>>(null);
const loadAllProjects = async () => {
  if (allProjectsInternal.value === null) {
    // Load projects
    const response = await ClientApi.Projects.getAllProjects(false);
    if (response.success) {
      allProjectsInternal.value = response.result.groups;
    }
  }
  return allNonUserProjects.value;
};

const allNonUserProjects = computed<ApiProjectResponse[]>(() => {
  if (allProjects.value) {
    return (
      allProjects.value
        // .filter(
        //   (project) =>
        //     !sortedUserProjects.value.map((p) => p.id).includes(project.id)
        // )
        .map((project) => {
          return {
            ...project,
            latestRecordingTime: getLatestRecordingTime(project),
          };
        })
        .sort(
          (a, b) =>
            b.latestRecordingTime.getTime() - a.latestRecordingTime.getTime(),
        )
    );
  }
  return [];
});

const allProjects = computed<ApiProjectResponse[]>(() => {
  if (userToFilterProjects.value && filterUserProjects.value) {
    return filterUserProjects.value || [];
  }
  return allProjectsInternal.value || [];
});

const gotoNonUserProject = async () => {
  await router.push(nextRoute(selectedProjectName.value));
  showSwitchProject.visible = false;
};

const gotoNonUserProjectForDevice = async () => {
  const device = (devicesList.value || []).find(
    (device) => device.id === deviceToFilterProjects.value,
  );
  if (device) {
    selectedProjectName.value = device.groupName;
    await router.push(nextRoute(selectedProjectName.value));
    showSwitchProject.visible = false;
  }
};

onMounted(() => {
  showSwitchProject.visible = true;
});

interface ProjectListOption extends ApiProjectResponse {
  latestRecordingTime: Date;
}
const projectSearch = ref<MultiSelectElement>();
const projectSearchEnabled = ref<boolean>(false);
const enableProjectSearch = async () => {
  projectSearchEnabled.value = true;
  await nextTick();
  projectSearch.value &&
    projectSearch.value.$el
      .querySelectorAll("input")
      .forEach((input: HTMLInputElement) => {
        if (input !== document.activeElement) {
          input.focus();
        }
      });
};
const disableProjectSearch = () => {
  projectSearchEnabled.value = false;
};

const userSearch = ref<MultiSelectElement>();
const userSearchEnabled = ref<boolean>(false);
const enableUserSearch = async () => {
  userSearchEnabled.value = true;
  await nextTick();
  userSearch.value &&
    userSearch.value.$el
      .querySelectorAll("input")
      .forEach((input: HTMLInputElement) => {
        if (input !== document.activeElement) {
          input.focus();
        }
      });
};
const disableUserSearch = () => {
  userSearchEnabled.value = false;
};

const deviceSearch = ref<MultiSelectElement>();
const deviceSearchEnabled = ref<boolean>(false);
const enableDeviceSearch = async () => {
  deviceSearchEnabled.value = true;
  await nextTick();
  deviceSearch.value &&
    deviceSearch.value.$el
      .querySelectorAll("input")
      .forEach((input: HTMLInputElement) => {
        if (input !== document.activeElement) {
          input.focus();
        }
      });
};
const disableDeviceSearch = () => {
  deviceSearchEnabled.value = false;
};

const usersList = ref<LoadedResource<ApiLoggedInUserResponse[]>>(null);
const devicesList = ref<LoadedResource<ApiDeviceResponse[]>>(null);
const userToFilterProjects = ref<UserId | null>(null);
const deviceToFilterProjects = ref<DeviceId | null>(null);
const filterUser = computed(() =>
  (usersList.value || []).find(
    (user) => user.id === userToFilterProjects.value,
  ),
);
const loadAllUsers = async () => {
  const response = await ClientApi.Users.list();
  if (response.success) {
    usersList.value = response.result.usersList
      .filter((u) => !!u.email)
      .sort((a, b) => {
        const ua = a.userName.toLowerCase();
        const ub = b.userName.toLowerCase();
        if (ua > ub) {
          return 1;
        } else if (ua === ub) {
          const uae = a.email.toLowerCase();
          const ube = b.email.toLowerCase();
          if (uae > ube) {
            return 1;
          }
        }
        return -1;
      });
    return usersList.value;
  }
  return [];
};
const loadAllDevices = async () => {
  const devices = await ClientApi.Devices.getActiveDevicesForCurrentUser();
  if (devices) {
    devicesList.value = devices;
  } else {
    devicesList.value = [];
  }
  return devicesList.value;
};
const filterUserProjects = ref<ApiProjectResponse[] | null>(null);
watch(userToFilterProjects, (userId) => {
  if (userId) {
    if (filterUser.value) {
      ClientApi.Users.superUserGetProjectsForUserByEmail(
        filterUser.value.email,
      ).then((projects) => {
        if (projects) {
          filterUserProjects.value = projects as ApiProjectResponse[];
          if (
            selectedProjectName.value &&
            !filterUserProjects.value.some(
              (project) => project.groupName === selectedProjectName.value,
            )
          ) {
            selectedProjectName.value = "";
          }
        }
      });
    }
  } else {
    filterUserProjects.value = null;
  }
});
</script>
<template>
  <b-modal
    title="Switch project"
    v-model="showSwitchProject.visible"
    centered
    no-footer
    @hidden="showSwitchProject.enabled = false"
  >
    <div
      v-if="currentUser && currentUser.globalPermission !== 'off'"
      class="super-user-overrides"
    >
      <div class="mb-3">
        <label class="mb-2">Go to any project</label>
        <multiselect
          placeholder="Select a project"
          value-prop="groupName"
          :can-clear="false"
          :options="allNonUserProjects"
          v-model="selectedProjectName"
          @select="gotoNonUserProject"
          track-by="groupName"
          ref="projectSearch"
          :searchable="projectSearchEnabled"
          @open="enableProjectSearch"
          @close="disableProjectSearch"
        >
          <template #option="{ option }: { option: ProjectListOption }">
            <span class="d-flex justify-content-between w-100">
              <span class="d-flex align-items-center">
                <span class="fw-medium">{{ option.groupName }}</span>
                <span class="ms-1"
                  >({{
                    lastActiveRelativeToNow(option.latestRecordingTime)
                  }})</span
                >
                <span
                  v-if="option.groupName === currentProjectName"
                  class="ms-1"
                  >(selected)</span
                >
              </span>
              <span class="d-flex align-items-center">
                <material-symbol
                  name="videocam"
                  size="1.125rem"
                  class="text-secondary ms-1"
                  v-if="option.lastThermalRecordingTime"
                />
                <material-symbol
                  name="music_note"
                  size="1.125rem"
                  class="text-secondary ms-1"
                  v-if="option.lastAudioRecordingTime"
                />
                <material-symbol
                  name="question_mark"
                  size="1.125rem"
                  class="text-secondary ms-1"
                  v-if="
                    !option.lastAudioRecordingTime &&
                    !option.lastThermalRecordingTime
                  "
                />
              </span>
            </span>
          </template>
          <template #singlelabel="{ value }: { value: ProjectListOption }">
            <span class="w-100 px-3 d-flex align-items-center">
              <span>
                <span class="fw-medium">{{ value.groupName }}</span>
                (<span>{{
                  lastActiveRelativeToNow(value.latestRecordingTime)
                }}</span
                >)
              </span>
              <span class="d-flex align-items-center">
                <material-symbol
                  name="videocam"
                  size="1.125rem"
                  class="text-secondary ms-2"
                  v-if="value.lastThermalRecordingTime"
                />
                <material-symbol
                  name="music_note"
                  size="1.125rem"
                  class="text-secondary ms-2"
                  v-if="value.lastAudioRecordingTime"
                />
                <material-symbol
                  name="question_mark"
                  size="1.125rem"
                  class="text-secondary ms-2"
                  v-if="
                    !value.lastAudioRecordingTime &&
                    !value.lastThermalRecordingTime
                  "
                />
              </span>
            </span>
          </template>
        </multiselect>
      </div>
      <div class="mb-3">
        <label class="mb-2">Filter to projects for user</label>
        <multiselect
          placeholder="Select a user"
          value-prop="id"
          ref="userSearch"
          :can-clear="false"
          :options="loadAllUsers"
          :resolve-on-load="true"
          v-model="userToFilterProjects"
          track-by="email"
          :searchable="userSearchEnabled"
          @open="enableUserSearch"
          @close="disableUserSearch"
        >
          <template #option="{ option }: { option: ApiLoggedInUserResponse }">
            <span class="fw-medium">{{ option.userName }}</span>
            <span class="ms-1">({{ option.email }})</span>
          </template>
          <template
            #singlelabel="{ value }: { value: ApiLoggedInUserResponse }"
          >
            <span class="w-100 px-3">
              <span class="fw-medium">{{ value.userName }}</span>
              <span class="ms-1">({{ value.email }})</span>
            </span>
          </template>
        </multiselect>
      </div>
      <div class="mb-3">
        <label class="mb-2">Go to project containing device</label>
        <multiselect
          placeholder="Select a device"
          value-prop="id"
          ref="deviceSearch"
          label="deviceName"
          :can-clear="false"
          :options="loadAllDevices"
          :resolve-on-load="true"
          @select="gotoNonUserProjectForDevice"
          v-model="deviceToFilterProjects"
          trackBy="deviceName"
          :searchable="deviceSearchEnabled"
          @open="enableDeviceSearch"
          @close="disableDeviceSearch"
        >
          <template #option="{ option }: { option: ApiDeviceResponse }">
            <device-name :name="option.deviceName" :type="option.type" />
          </template>
          <template #singlelabel="{ value }: { value: ApiDeviceResponse }">
            <device-name :name="value.deviceName" :type="value.type" />
          </template>
        </multiselect>
      </div>
    </div>
    <div class="list-group" v-if="sortedUserProjects">
      <p v-if="currentUser.globalPermission !== 'off'" class="mb-2">
        My projects
      </p>
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
        :data-cy="urlNormaliseName(groupName)"
        :to="nextRoute(groupName)"
        :aria-disabled="groupName === currentProjectName"
        :tabindex="groupName === currentProjectName ? -1 : index"
        @click="showSwitchProject.visible = false"
      >
        <span class="d-flex justify-content-between align-items-center">
          <span>
            <span class="fw-medium">{{ groupName }}</span>
            <span class="ms-1"
              >({{ lastActiveRelativeToNow(latestRecordingTime) }})</span
            >
            <b-badge
              v-if="groupName === currentProjectName"
              class="ms-1"
              variant="dark"
            >
              Selected
            </b-badge>
          </span>
          <span class="d-flex align-items-center">
            <material-symbol
              name="videocam"
              size="1.125rem"
              class="text-secondary ms-2"
              v-if="lastThermalRecordingTime"
            />
            <material-symbol
              name="music_note"
              size="1.125rem"
              class="text-secondary ms-2"
              v-if="lastAudioRecordingTime"
            />
            <material-symbol
              name="question_mark"
              size="1.125rem"
              class="text-secondary ms-2"
              v-if="!lastAudioRecordingTime && !lastThermalRecordingTime"
            />
          </span>
        </span>
      </router-link>
    </div>
  </b-modal>
</template>
<style lang="css">
@import url("@vueform/multiselect/themes/default.css");
</style>
