<script setup lang="ts">

import {
  creatingNewProject,
  DevicesForCurrentProject, isSmallScreen,
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
import {RouterLink} from "vue-router";
import {computed, type ComputedRef, inject, onMounted, ref, type Ref, watch} from "vue";
import {currentSelectedProject, currentUser} from "@models/provides.ts";
import type {LoadedResource} from "@api/types.ts";
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
          class="d-block cacophony-logo-link"
          title=""
          data-bs-toggle="tooltip"
          data-bs-placement="right"
          data-bs-original-title="Icon-only"
      >
        <icon-cacophony-logo-full />
        <span class="visually-hidden">Icon-only</span>
      </router-link>
      <div
          class="d-flex flex-row group-switcher justify-content-between mt-5 mb-2"
      >
        <button
            class="btn btn-light current-group d-flex flex-fill me-1 align-items-center"
            v-if="userHasMultipleProjects"
            data-cy="switch project button"
            @click="() => (showSwitchProject.enabled = true)"
        >
          {{ selectedProject.groupName }}
          <span class="switch-label figure ms-1"
          ><font-awesome-icon icon="retweet" class="switch-icon"
          /></span>
        </button>
        <span
            v-else
            class="btn current-group d-flex flex-fill me-1 align-items-center"
        >{{ selectedProject.groupName }}</span
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
        >
          <template #button-content>
            <font-awesome-icon icon="plus" color="rgb(153, 153, 153)" />
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
      </div>
    </div>
    <ul class="nav nav-pills nav-flush flex-column mb-auto pt-3">
      <li class="nav-item">
        <router-link
            :to="{
              name: 'dashboard',
              params: {
                projectName: urlNormalisedCurrentProjectName,
              },
            }"
            alt="dashboard"
            class="nav-link py-3 d-flex flex-row"
            aria-current="page"
            title=""
            data-bs-toggle="tooltip"
            data-bs-placement="right"
            data-bs-original-title="Dashboard"
        >
            <span class="nav-icon-wrapper">
              <font-awesome-icon icon="gauge-high" />
            </span>
          <span>Dashboard</span>
        </router-link>
      </li>
      <li class="nav-item mb-4">
        <router-link
            :to="{
              name: 'locations',
              params: {
                projectName: urlNormalisedCurrentProjectName,
              },
            }"
            class="nav-link py-3 d-flex flex-row"
            title=""
            data-bs-toggle="tooltip"
            data-bs-placement="right"
            data-bs-original-title="Locations"
        >
            <span class="nav-icon-wrapper">
              <font-awesome-icon icon="location-dot" />
            </span>
          <span>Locations</span>
        </router-link>
      </li>
      <li class="nav-item">
        <router-link
            :to="{
              name: 'activity',
              params: {
                projectName: urlNormalisedCurrentProjectName,
              },
            }"
            class="nav-link py-3 d-flex flex-row"
            title=""
            data-bs-toggle="tooltip"
            data-bs-placement="right"
            data-bs-original-title="Search"
        >
            <span class="nav-icon-wrapper">
              <font-awesome-icon icon="magnifying-glass" />
            </span>
          <span>Activity</span>
        </router-link>
      </li>
      <li class="nav-item">
        <router-link
            :to="{
              name: 'devices',
              params: {
                projectName: urlNormalisedCurrentProjectName,
              },
            }"
            class="nav-link py-3 d-flex flex-row"
            title=""
            data-bs-toggle="tooltip"
            data-bs-placement="right"
            data-bs-original-title="Devices"
        >
            <span class="nav-icon-wrapper">
              <span class="icon-alert-wrapper">
                <font-awesome-icon icon="microchip" />
                <svg
                    class="alert-icon"
                    width="12"
                    height="12"
                    xmlns="http://www.w3.org/2000/svg"
                    v-if="someDeviceNeedsAttention"
                >
                  <path
                      d="M2.99.8C3.9.27 4.9 0 6 0a5.97 5.97 0 0 1 5.2 9.01 5.97 5.97 0 0 1-8.21 2.19A5.97 5.97 0 0 1 .8 2.99 5.97 5.97 0 0 1 3 .8Zm3.94 9.13A.26.26 0 0 0 7 9.74V8.26a.26.26 0 0 0-.07-.19.23.23 0 0 0-.17-.07h-1.5a.25.25 0 0 0-.18.08.25.25 0 0 0-.08.18v1.48c0 .07.03.13.08.18.05.05.11.08.18.08h1.5c.07 0 .12-.02.17-.07ZM6.9 7.19a.2.2 0 0 0 .08-.14l.14-4.85c0-.06-.02-.1-.07-.14a.3.3 0 0 0-.2-.06h-1.7a.3.3 0 0 0-.2.06.15.15 0 0 0-.08.14l.14 4.85c0 .06.02.1.08.14a.3.3 0 0 0 .18.06h1.45c.07 0 .13-.02.18-.06Z"
                      fill="darkred"
                  />
                </svg>
              </span>
            </span>
          <span>Devices</span>
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
      <li class="nav-item" v-if="!isViewingAsSuperUser">
        <router-link
            :to="{
              name: 'user-project-settings',
              params: {
                projectName: urlNormalisedCurrentProjectName,
              },
            }"
            class="nav-link py-3 d-flex flex-row"
            title=""
            data-bs-toggle="tooltip"
            data-bs-placement="right"
            data-bs-original-title="My preferences"
        >
            <span class="nav-icon-wrapper">
              <font-awesome-icon icon="gear" />
            </span>
          <span>My&nbsp;preferences</span>
        </router-link>
      </li>
      <li class="nav-item" v-if="userIsAdminForCurrentSelectedProject">
        <router-link
            :to="{
              name: 'project-settings',
              params: {
                projectName: urlNormalisedCurrentProjectName,
              },
            }"
            class="nav-link py-3 d-flex flex-row"
            title=""
            data-bs-toggle="tooltip"
            data-bs-placement="right"
            data-bs-original-title="Manage project"
        >
            <span class="nav-icon-wrapper">
              <font-awesome-icon icon="screwdriver-wrench" />
            </span>
          <span>Manage&nbsp;project</span>
        </router-link>
      </li>
    </ul>
    <div class="border-top d-flex">
      <router-link
          :to="{ name: 'user-settings' }"
          class="d-flex py-3 text-decoration-none flex-fill align-items-center flex-row"
          data-cy="user settings nav button"
      >
          <span class="nav-icon-wrapper">
            <span class="icon-alert-wrapper">
              <font-awesome-icon icon="user" />
              <svg
                  v-if="!CurrentUser.emailConfirmed"
                  class="alert-icon"
                  width="12"
                  height="12"
                  xmlns="http://www.w3.org/2000/svg"
              >
                <path
                    d="M2.99.8C3.9.27 4.9 0 6 0a5.97 5.97 0 0 1 5.2 9.01 5.97 5.97 0 0 1-8.21 2.19A5.97 5.97 0 0 1 .8 2.99 5.97 5.97 0 0 1 3 .8Zm3.94 9.13A.26.26 0 0 0 7 9.74V8.26a.26.26 0 0 0-.07-.19.23.23 0 0 0-.17-.07h-1.5a.25.25 0 0 0-.18.08.25.25 0 0 0-.08.18v1.48c0 .07.03.13.08.18.05.05.11.08.18.08h1.5c.07 0 .12-.02.17-.07ZM6.9 7.19a.2.2 0 0 0 .08-.14l.14-4.85c0-.06-.02-.1-.07-.14a.3.3 0 0 0-.2-.06h-1.7a.3.3 0 0 0-.2.06.15.15 0 0 0-.08.14l.14 4.85c0 .06.02.1.08.14a.3.3 0 0 0 .18.06h1.45c.07 0 .13-.02.18-.06Z"
                    fill="#d9001b"
                />
              </svg>
            </span>
          </span>
        <span v-html="currentUserName" class="text-nowrap"></span>
      </router-link>
      <router-link
          :to="{ name: 'sign-out' }"
          data-cy="sign out link"
          class="d-block py-3 text-decoration-none border-start"
      >
          <span class="nav-icon-wrapper">
            <font-awesome-icon icon="right-from-bracket" />
          </span>
      </router-link>
    </div>
  </nav>
  <div
      class="nav-bg"
      :class="{ visible: showSideNavBg, hidden: hideNavBg }"
  ></div>
</template>

<style scoped lang="less">
#global-side-nav {
  transform: translateX(calc(var(--global-side-nav-expanded-width) * -1.0));
  @media (min-width: 639px) {
    transform: unset;
  }

  background: white;
  position: fixed;
  bottom: 0;
  top: 0;
  left: 0;
  width: var(--global-side-nav-collapsed-width);
  overflow: hidden;
  user-select: none;
  transition:
      width 0.2s,
      transform 0.2s;
  box-shadow: 0 0 5px rgba(0, 0, 0, 0.1);
  z-index: 1021;

  .nav-icon-wrapper {
    // Keep the icons vertically aligned relative to one-another.
    display: block;
    width: var(--global-side-nav-collapsed-width);
    text-align: center;
  }

  .nav-link {
    padding-left: 0;
    padding-right: 0;
  }

  a {
    color: #444;
    font-weight: 500;
    font-size: 0.875rem;

    svg {
      color: #808080;
    }
    &:active,
    &.router-link-active:not(.cacophony-logo-link) {
      svg {
        color: #4c4c4c;
      }
    }

    &.router-link-active:not(.cacophony-logo-link) {
      background: unset;
      position: relative;
      &::before {
        content: " ";
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 4px;
        background-color: #6dbd4b;
      }
    }

    &:active,
    &:active:hover {
      background-color: #efefef;
    }
    &:hover {
      // Some kind of animated gradient here?
      background-color: #fcfcfc;
    }
  }

  // Top part of nav containing logo and group selector.
  .nav-top {
    transition: background-color 0.2s;
    .group-switcher {
      opacity: 0;
      transition: opacity 0.2s;
      width: var(--global-side-nav-expanded-width);
      .current-group {
        text-transform: uppercase;
        font-weight: 500;
      }
      .switch-label {
        font-variant: small-caps;
        font-style: italic;
        font-size: 70%;
        .switch-icon {
          transform: skewX(-20deg);
        }
      }
      .add-group {
        color: #999;
      }
    }
  }

  .cacophony-logo-link {
    padding: 0.6rem;
  }

  // Expanded menu state
  &.pinned {
    transform: translateX(0);
    width: var(--global-side-nav-expanded-width);
    .nav-top {
      background-color: #fafafa;
      .group-switcher {
        opacity: 1;
      }
    }
  }

  @media screen and (min-width: 639px) {
    &:hover,
    &.pinned {
      transform: translateX(0);
      width: var(--global-side-nav-expanded-width);
      .nav-top {
        background-color: #fafafa;
        .group-switcher {
          opacity: 1;
        }
      }
    }
  }

  .icon-alert-wrapper {
    position: relative;
    .alert-icon {
      position: absolute;
      top: -25%;
      right: -65%;
    }
  }
}
.nav-bg {
  opacity: 0;
  transition: opacity 0.2s;
  &.hidden {
    display: none;
  }
  &.visible {
    background: rgba(0, 0, 0, 0.5);
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 1001;
    opacity: 1;
    display: block;
  }
}
</style>
<style lang="less">
#global-side-nav {
  #cacophony-logo-full {
    transform: scale(0.725);
    transform-origin: 0 0;

    .text {
      transform: translate3d(0, 0, 0);
      transition: opacity 0.2s;
      opacity: 0;
    }
  }

  &:hover,
  &.pinned {
    #cacophony-logo-full .text {
      opacity: 1;
    }
  }
}
</style>