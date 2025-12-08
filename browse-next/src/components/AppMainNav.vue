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
import { currentSelectedProject, currentUser } from "@models/provides.ts";
import type { LoadedResource } from "@apiClient/types.ts";
import { BTooltip } from "bootstrap-vue-next";

const fallibleCurrentSelectedProject = inject(
  currentSelectedProject,
) as ComputedRef<SelectedProject | false>;

const selectedProject = computed<SelectedProject>(() => {
  return fallibleCurrentSelectedProject.value as SelectedProject;
});
const globalSideNav = ref<HTMLDivElement>();

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
    }, 300);
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
            triggers="hover"
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
            target="switch-project-btn"
            triggers="hover"
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
          </span>
          <span class="nav-text ms-3">Locations</span>
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
      <b-tooltip target="sign-out-link" triggers="hover" placement="bottom">
        Sign out
      </b-tooltip>
    </div>
  </nav>
</template>

<style scoped lang="less">
@import "../assets/less/breakpoints.less";
.global-side-nav {
  position: fixed;
  bottom: 0;
  top: 0;
  left: 0;
  z-index: 1021;
  overflow-y: auto;
  overflow-x: hidden;
  user-select: none;
  background: #fff;
  box-shadow: 0 0 5px rgba(0, 0, 0, 0.1);
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

      .alert-icon {
        position: absolute;
        right: calc(var(--cp-spacing-xs) * -1);
        top: calc(var(--cp-spacing-xxs) * -1);
        fill: var(--bs-danger);
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
    /*transform: scale(0.725);*/
    transform-origin: 0 0;

    .text {
      transform: translate3d(0, 0, 0);
      transition: opacity 0.2s;
      opacity: 0;
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
