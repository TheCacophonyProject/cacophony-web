<script setup lang="ts">
import {
  creatingNewProject,
  DevicesForCurrentProject,
  isSmallScreen,
  isViewingAsSuperUser,
  joiningNewProject,
  type LoggedInUser,
  pinSideNav,
  type SelectedProject,
  showSideNavBg,
  showSwitchProject,
  sideNavIsPinned,
  urlNormalisedCurrentProjectName,
  userHasMultipleProjects,
  userIsAdminForCurrentSelectedProject,
} from "@models/LoggedInUser.ts";
import IconCacophonyLogoFull from "@/components/icons/IconCacophonyLogoFull.vue";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";
import { RouterLink } from "vue-router";
import {
  computed,
  type ComputedRef,
  inject,
  onMounted,
  ref,
  type Ref,
  watch,
} from "vue";
import {
  allHistoricLocations,
  currentSelectedProject,
  currentUser,
} from "@models/provides.ts";
import type { LoadedResource } from "@apiClient/types.ts";
import { BDropdown, BDropdownItemButton, BTooltip } from "bootstrap-vue-next";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";

const fallibleCurrentSelectedProject = inject(
  currentSelectedProject,
) as ComputedRef<SelectedProject | false>;

const selectedProject = computed<SelectedProject>(() => {
  return fallibleCurrentSelectedProject.value as SelectedProject;
});
const globalSideNav = ref<HTMLDivElement>();
const allLocations: Ref<LoadedResource<ApiLocationResponse[]>> | undefined =
  inject(allHistoricLocations);
const someLocationsNeedRenaming = computed<boolean>(() => {
  if (allLocations?.value) {
    return (allLocations.value as ApiLocationResponse[]).some(
      (location) => !location.retiredAt && location.needsRename,
    );
  }
  return false;
});

const someDeviceNeedsAttention = computed<boolean>(() => {
  if (DevicesForCurrentProject.value) {
    return DevicesForCurrentProject.value.some((device) => {
      if (!device.hasOwnProperty("isHealthy")) {
        return false;
      }
      return !device.isHealthy;
    });
  }
  return false;
});

const fallibleCurrentUser = inject(currentUser) as Ref<
  LoadedResource<LoggedInUser>
>;

const CurrentUser = computed<LoggedInUser>(() => {
  return fallibleCurrentUser.value as LoggedInUser;
});

const currentUserName = computed<string>(() => {
  // Remove spaces.
  return CurrentUser.value.userName.replace(/ /g, "&nbsp;");
});

const hideNavBg = ref<boolean>(true);

watch(pinSideNav, (next) => {
  if (!next && isSmallScreen.value) {
    setTimeout(() => {
      hideNavBg.value = true;
    }, 20);
  } else if (next && isSmallScreen.value) {
    hideNavBg.value = false;
  }
});
onMounted(() => {
  window.addEventListener("click", (e: MouseEvent) => {
    const navBounds = globalSideNav.value?.getBoundingClientRect();
    if (navBounds && e.clientX > navBounds?.right && pinSideNav.value) {
      pinSideNav.value = false;
    }
  });
});
</script>

<template>
  <nav
    id="global-side-nav"
    ref="globalSideNav"
    :class="[
      'global-side-nav',
      'd-flex',
      'flex-column',
      'flex-shrink-0',
      { pinned: sideNavIsPinned },
    ]"
  >
    <div class="nav-top">
      <router-link
        :to="{
          name: 'dashboard',
          params: {
            projectName: urlNormalisedCurrentProjectName,
          },
        }"
        alt="home"
        class="d-block w-100"
        title=""
        data-bs-original-title="Icon-only"
      >
        <icon-cacophony-logo-full class="cacophony-logo" />
        <span class="visually-hidden">Cacophony Monitoring Platform</span>
      </router-link>
      <div class="group-switcher mt-5 mb-2">
        <div
          class="d-flex flex-row justify-content-between align-items-center me-1"
        >
          <label
            class="current-group-label text-body-secondary mx-3 text-nowrap"
            >Your projects</label
          >
          <b-dropdown
            no-caret
            auto-close
            no-flip
            @show="pinSideNav = true"
            @hide="pinSideNav = false"
            data-cy="switch or join project button"
            id="switch-or-join-group-button"
            variant="light"
            size="lg"
            class="group-dropdown"
          >
            <template #button-content>
              <span id="create-project-btn" class="d-flex py-1">
                <material-symbol name="add" size="1.25rem" /><span
                  class="visually-hidden"
                  >Create or join project</span
                >
              </span>
            </template>
            <b-dropdown-item-button
              @click.stop.prevent="creatingNewProject.enabled = true"
            >
              <span data-cy="create new project button"
                >Create a new project</span
              >
            </b-dropdown-item-button>
            <b-dropdown-item-button
              data-cy="join existing project button"
              @click.stop.prevent="joiningNewProject.enabled = true"
            >
              <span>Join an existing project</span>
            </b-dropdown-item-button>
          </b-dropdown>
          <b-tooltip
            target="create-project-btn"
            hover
            placement="top"
            offset="20"
          >
            Create or join project
          </b-tooltip>
        </div>
        <div class="d-flex flex-row justify-content-between">
          <button
            class="btn btn-lg btn-light d-flex flex-fill me-1 align-items-center text-uppercase w-100 fw-medium"
            v-if="userHasMultipleProjects"
            data-cy="switch project button"
            @click="() => (showSwitchProject.enabled = true)"
            id="switch-project-btn"
          >
            <span class="overflow-hidden text-truncate text-nowrap">{{
              selectedProject.groupName
            }}</span>
            <material-symbol name="keyboard_arrow_down" class="ms-1" />
          </button>
          <span
            v-else
            class="px-3 py-2 text-uppercase w-100 fw-medium overflow-hidden text-truncate text-nowrap"
            >{{ selectedProject.groupName }}</span
          >
          <b-tooltip
            v-if="userHasMultipleProjects"
            target="switch-project-btn"
            hover
            placement="bottom"
          >
            Switch project
          </b-tooltip>
        </div>
      </div>
    </div>
    <ul class="nav nav-pills nav-flush flex-column mb-auto pt-3">
      <li class="nav-item w-100">
        <router-link
          :to="{
            name: 'dashboard',
            params: {
              projectName: urlNormalisedCurrentProjectName,
            },
          }"
          alt="dashboard"
          class="nav-link py-3 d-flex flex-row align-items-center"
          aria-current="page"
          title=""
          data-bs-toggle="tooltip"
          data-bs-placement="right"
          data-bs-original-title="Dashboard"
        >
          <span class="nav-icon-wrapper d-flex">
            <material-symbol name="dashboard_2" />
          </span>
          <span class="nav-text ms-3">Dashboard</span>
        </router-link>
      </li>
      <li class="nav-item w-100">
        <router-link
          :to="{
            name: 'activity',
            params: {
              projectName: urlNormalisedCurrentProjectName,
            },
          }"
          class="nav-link py-3 d-flex flex-row align-items-center"
          title=""
          data-bs-toggle="tooltip"
          data-bs-placement="right"
          data-bs-original-title="Search"
        >
          <span class="nav-icon-wrapper d-flex">
            <material-symbol name="search" />
          </span>
          <span class="nav-text ms-3">Activity</span>
        </router-link>
      </li>
      <li class="nav-item w-100">
        <router-link
          :to="{
            name: 'devices',
            params: {
              projectName: urlNormalisedCurrentProjectName,
            },
          }"
          class="nav-link py-3 d-flex flex-row align-items-center"
          title=""
          data-bs-toggle="tooltip"
          data-bs-placement="right"
          data-bs-original-title="Devices"
        >
          <span class="nav-icon-wrapper d-flex">
            <material-symbol name="memory" />
            <svg
              class="alert-icon"
              width="12"
              height="12"
              xmlns="http://www.w3.org/2000/svg"
              v-if="someDeviceNeedsAttention"
            >
              <path
                d="M2.99.8C3.9.27 4.9 0 6 0a5.97 5.97 0 0 1 5.2 9.01 5.97 5.97 0 0 1-8.21 2.19A5.97 5.97 0 0 1 .8 2.99 5.97 5.97 0 0 1 3 .8Zm3.94 9.13A.26.26 0 0 0 7 9.74V8.26a.26.26 0 0 0-.07-.19.23.23 0 0 0-.17-.07h-1.5a.25.25 0 0 0-.18.08.25.25 0 0 0-.08.18v1.48c0 .07.03.13.08.18.05.05.11.08.18.08h1.5c.07 0 .12-.02.17-.07ZM6.9 7.19a.2.2 0 0 0 .08-.14l.14-4.85c0-.06-.02-.1-.07-.14a.3.3 0 0 0-.2-.06h-1.7a.3.3 0 0 0-.2.06.15.15 0 0 0-.08.14l.14 4.85c0 .06.02.1.08.14a.3.3 0 0 0 .18.06h1.45c.07 0 .13-.02.18-.06Z"
              />
            </svg>
          </span>
          <span class="nav-text ms-3">Devices</span>
        </router-link>
      </li>
      <li class="nav-item w-100">
        <router-link
          :to="{
            name: 'locations',
            params: {
              projectName: urlNormalisedCurrentProjectName,
            },
          }"
          class="nav-link py-3 d-flex flex-row align-items-center"
          title=""
          data-bs-toggle="tooltip"
          data-bs-placement="right"
          data-bs-original-title="Locations"
        >
          <span class="nav-icon-wrapper d-flex">
            <material-symbol name="pin_drop" />
            <svg
              class="warning-icon"
              height="16px"
              width="16px"
              viewBox="0 -960 960 960"
              xmlns="http://www.w3.org/2000/svg"
              v-if="someLocationsNeedRenaming"
            >
              <path
                d="M120.91-153q-10.41 0-18.13-4.7-7.71-4.7-12.28-12.3-5-7.5-4.25-16.75t5.25-17.75l360-598.5q4.5-8.5 12.28-12 7.77-3.5 16.25-3.5 8.47 0 16.22 3.5 7.75 3.5 12.25 12l360 598.5q4.5 8.5 5.25 17.75T869.5-170q-5 7.5-12.5 12.25T839.09-153H120.91ZM504-278.79q10-9.79 10-24T504.21-327q-9.79-10-24-10T456-327.21q-10 9.79-10 24t9.79 24.21q9.79 10 24 10t24.21-9.79Zm0-115.06q10-9.85 10-23.65v-122q0-13.8-9.79-23.65-9.79-9.85-23.5-9.85T457-563.15q-10 9.85-10 23.65v122q0 13.8 9.79 23.65 9.79 9.85 23.5 9.85t23.71-9.85Z"
              />
            </svg>
          </span>
          <span class="nav-text ms-3">Locations</span>
        </router-link>
      </li>
      <!--        NOTE: remove Report until we know what to do with it. -->
      <!--        <li class="nav-item">-->
      <!--          <router-link-->
      <!--            :to="{-->
      <!--              name: 'report',-->
      <!--              params: {-->
      <!--                projectName: urlNormalisedCurrentProjectName,-->
      <!--              },-->
      <!--            }"-->
      <!--            class="nav-link py-3 d-flex flex-row"-->
      <!--            title=""-->
      <!--            data-bs-toggle="tooltip"-->
      <!--            data-bs-placement="right"-->
      <!--            data-bs-original-title="Report"-->
      <!--          >-->
      <!--            <span class="nav-icon-wrapper">-->
      <!--              <font-awesome-icon icon="chart-pie" />-->
      <!--            </span>-->
      <!--            <span>Report</span>-->
      <!--          </router-link>-->
      <!--        </li>-->
      <li class="nav-item w-100" v-if="!isViewingAsSuperUser">
        <router-link
          :to="{
            name: 'user-project-settings',
            params: {
              projectName: urlNormalisedCurrentProjectName,
            },
          }"
          class="nav-link py-3 d-flex flex-row align-items-center"
          title=""
          data-bs-toggle="tooltip"
          data-bs-placement="right"
          data-bs-original-title="My preferences"
        >
          <span class="nav-icon-wrapper d-flex">
            <material-symbol name="settings" />
          </span>
          <span class="nav-text ms-3">My&nbsp;preferences</span>
        </router-link>
      </li>
      <li class="nav-item w-100" v-if="userIsAdminForCurrentSelectedProject">
        <router-link
          :to="{
            name: 'project-settings',
            params: {
              projectName: urlNormalisedCurrentProjectName,
            },
          }"
          class="nav-link py-3 d-flex flex-row align-items-center"
          title=""
          data-bs-toggle="tooltip"
          data-bs-placement="right"
          data-bs-original-title="Manage project"
        >
          <span class="nav-icon-wrapper d-flex">
            <material-symbol name="handyman" />
          </span>
          <span class="nav-text ms-3">Manage&nbsp;project</span>
        </router-link>
      </li>
    </ul>
    <div class="d-flex align-items-center">
      <router-link
        :to="{ name: 'user-settings' }"
        class="nav-link overflow-hidden d-flex p-3 text-decoration-none flex-fill align-items-center flex-row rounded-2"
        data-cy="user settings nav button"
      >
        <span class="nav-icon-wrapper d-flex">
          <material-symbol name="account_circle" />
          <svg
            v-if="!CurrentUser.emailConfirmed"
            class="alert-icon"
            width="12"
            height="12"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M2.99.8C3.9.27 4.9 0 6 0a5.97 5.97 0 0 1 5.2 9.01 5.97 5.97 0 0 1-8.21 2.19A5.97 5.97 0 0 1 .8 2.99 5.97 5.97 0 0 1 3 .8Zm3.94 9.13A.26.26 0 0 0 7 9.74V8.26a.26.26 0 0 0-.07-.19.23.23 0 0 0-.17-.07h-1.5a.25.25 0 0 0-.18.08.25.25 0 0 0-.08.18v1.48c0 .07.03.13.08.18.05.05.11.08.18.08h1.5c.07 0 .12-.02.17-.07ZM6.9 7.19a.2.2 0 0 0 .08-.14l.14-4.85c0-.06-.02-.1-.07-.14a.3.3 0 0 0-.2-.06h-1.7a.3.3 0 0 0-.2.06.15.15 0 0 0-.08.14l.14 4.85c0 .06.02.1.08.14a.3.3 0 0 0 .18.06h1.45c.07 0 .13-.02.18-.06Z"
            />
          </svg>
        </span>
        <span
          v-html="currentUserName"
          class="nav-text text-nowrap ms-3 text-truncate"
        ></span>
      </router-link>
      <router-link
        :to="{ name: 'sign-out' }"
        data-cy="sign out link"
        class="sign-out-link btn btn-light btn-md p-3 ms-1"
        id="sign-out-link"
      >
        <span class="nav-icon-wrapper">
          <material-symbol name="logout" size="1.25rem" /><span
            class="visually-hidden"
            >Sign out</span
          >
        </span>
      </router-link>
      <b-tooltip target="sign-out-link" hover placement="bottom">
        Sign out
      </b-tooltip>
    </div>
  </nav>
  <div
    class="nav-bg"
    :class="{ visible: showSideNavBg, hidden: hideNavBg }"
  ></div>
</template>

<style scoped lang="less">
@import "../assets/less/breakpoints.less";
@import "../assets/less/elevation.less";
.global-side-nav {
  position: fixed;
  bottom: 0;
  top: 0;
  left: 0;
  z-index: 1021;
  overflow-y: auto;
  overflow-x: hidden;
  user-select: none;
  background: var(--bs-white);
  .main-nav-shadow();
  padding: var(--cp-spacing-md)
    calc(var(--cp-spacing-xs) + var(--cp-spacing-xxxs)) var(--cp-spacing-xs);
  width: var(--global-side-nav-collapsed-width);
  transform: translateX(calc(var(--global-side-nav-expanded-width) * -1));
  transition:
    width 0.2s,
    transform 0.2s;
  @media (min-width: @breakpoint-sm) {
    transform: unset;
  }

  // Top part of nav containing logo and group selector.
  .nav-top {
    .group-switcher {
      opacity: 0;
      transition: opacity 0.2s;
    }
  }

  // Main navigation links
  a.nav-link {
    color: var(--text-primary);
    font-weight: var(--cp-font-weight-medium);

    &:hover {
      background-color: var(--cp-color-green-50);
      color: var(--cp-color-green-800);
    }

    &:active,
    &:active:hover {
      background-color: var(--cp-color-green-100);
    }

    &.router-link-active {
      background-color: color-mix(
        in oklch,
        var(--cp-color-primary),
        transparent 90%
      );
      color: var(--cp-color-green-800);
    }

    .nav-icon-wrapper {
      position: relative;

      .alert-icon,
      .warning-icon {
        position: absolute;
        right: calc(var(--cp-spacing-xs) * -1);
        top: calc(var(--cp-spacing-xxs) * -1);
      }
      .alert-icon {
        fill: var(--bs-danger);
      }
      .warning-icon {
        fill: var(--bs-warning);
      }
    }

    .nav-text {
      width: 0;
      overflow: hidden;
    }
  }

  .sign-out-link {
    display: none;
    opacity: 0;
  }

  // Expanded menu state
  &.pinned {
    transform: translateX(0);
    width: var(--global-side-nav-expanded-width);

    .nav-top {
      .group-switcher {
        opacity: 1;
      }
    }
    a.nav-link .nav-text {
      animation: 0.2s show-nav-text both;
    }
    .sign-out-link {
      display: block;
      animation: 0.2s 0.1s show-sign-out-link both;
    }
  }

  @media screen and (min-width: @breakpoint-sm) {
    &:hover,
    &.pinned {
      transform: translateX(0);
      width: var(--global-side-nav-expanded-width);

      .nav-top {
        .group-switcher {
          opacity: 1;
        }
      }
      a.nav-link .nav-text {
        animation: 0.2s show-nav-text both;
      }
      .sign-out-link {
        display: block;
        animation: 0.2s 0.1s show-sign-out-link both;
      }
    }
  }
}
.nav-bg {
  background: rgba(0, 0, 0, 0.5);
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1020;
  transition: opacity 0.2s linear;
  &.hidden {
    pointer-events: none;
    opacity: 0;
  }
  &.visible {
    opacity: 1;
  }
}

@keyframes show-nav-text {
  1% {
    width: 0;
    opacity: 0;
  }
  100% {
    width: 100%;
    opacity: 1;
  }
}

@keyframes show-sign-out-link {
  1% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}
</style>
<style lang="less">
.global-side-nav {
  .cacophony-logo {
    transform: scale(1.08);
    transform-origin: 0 0;

    .text {
      transform: translate3d(0, 0, 0);
      transition: opacity 0.2s;
      opacity: 0;
    }
  }
  &.pinned {
    @media screen and (min-width: 1651px) {
      .cacophony-logo {
        transition:
          transform 0.1s linear,
          margin-top 0.1s linear;
        transform: scale(1.15);
        margin-top: 2px;
      }
    }
  }

  // Customised nav buttons. Needs to be global to be able to style the dropdown btn
  .btn-light {
    background: transparent;
    border: none;
    &:hover {
      background: var(--bs-gray-100);
    }
    &:active {
      background: var(--bs-gray-200);
    }
  }

  &:hover,
  &.pinned {
    .cacophony-logo .text {
      display: block;
      opacity: 1;
    }
  }
}
</style>
