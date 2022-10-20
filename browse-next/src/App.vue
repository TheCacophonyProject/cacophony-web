<script setup lang="ts">
import { RouterView, RouterLink, useRoute } from "vue-router";

// TODO only in dev mode, otherwise we need an info button somewhere for production
import GitReleaseInfoBar from "@/components/GitReleaseInfoBar.vue";
import NetworkConnectionAlertModal from "@/components/NetworkConnectionAlertModal.vue";
import IconCacophonyLogoFull from "@/components/icons/IconCacophonyLogoFull.vue";
import {
  userIsLoggedIn,
  userHasGroups,
  CurrentUser as fallibleCurrentUser,
  euaIsOutOfDate,
  currentSelectedGroup as fallibleCurrentSelectedGroup,
  userHasMultipleGroups,
  isLoggingInAutomatically,
  isFetchingGroups,
  userIsAdminForCurrentSelectedGroup,
  userHasConfirmedEmailAddress,
  showSwitchGroup,
  creatingNewGroup,
  joiningNewGroup,
  urlNormalisedCurrentGroupName,
  rafFps,
  pinSideNav,
  showSideNavBg,
  isWideScreen,
  sideNavIsPinned,
  isSmallScreen,
} from "@/models/LoggedInUser";
import type { SelectedGroup, LoggedInUser } from "@/models/LoggedInUser";
import {
  computed,
  defineAsyncComponent,
  onBeforeMount,
  onMounted,
  ref,
  watch,
} from "vue";
import { BSpinner } from "bootstrap-vue-3";
import SwitchGroupsModal from "@/components/SwitchGroupsModal.vue";
import JoinExistingGroupModal from "@/components/JoinExistingGroupModal.vue";

const globalSideNav = ref<HTMLDivElement>();

const BlockingUserActionRequiredModal = defineAsyncComponent(
  () => import("@/components/BlockingUserActionRequiredModal.vue")
);

const CreateGroupModal = defineAsyncComponent(
  () => import("@/components/CreateGroupModal.vue")
);

const _userIsSuperAdmin = false;
const _loggedInAsAnotherUser = false;
const _environmentIsProduction = false;
const hasGitReleaseInfoBar = ref(false);

const currentSelectedGroup = computed<SelectedGroup>(() => {
  return fallibleCurrentSelectedGroup.value as SelectedGroup;
});

const CurrentUser = computed<LoggedInUser>(() => {
  return fallibleCurrentUser.value as LoggedInUser;
});

const currentUserName = computed<string>(() => {
  // Remove spaces.
  return CurrentUser.value.userName.replace(/ /g, "&nbsp;");
});

const route = useRoute();

onBeforeMount(() => {
  // Override bootstrap CSS variables.
  // This has to appear after the original bootstrap CSS variable declarations in the DOM to take effect.
  const styleOverrides = document.createElement("style");
  styleOverrides.innerText = `:root { --bs-body-font-family: "Roboto", sans-serif; } body { font-family: var(--bs-body-font-family); }`;
  document.body.insertBefore(styleOverrides, document.body.firstChild);
});

const frameTimes: number[] = [];
const pollFrameTimes = () => {
  frameTimes.push(performance.now());
  if (frameTimes.length < 10) {
    requestAnimationFrame(pollFrameTimes);
  } else {
    const diffs = [];
    for (let i = 1; i < frameTimes.length; i++) {
      diffs.push(frameTimes[i] - frameTimes[i - 1]);
    }
    let total = 0;
    for (const val of diffs) {
      total += val;
    }
    // Get the average frame time
    const multiplier = Math.round(1000 / (total / diffs.length) / 30);
    if (multiplier === 1) {
      // 30fps
      rafFps.value = 30;
    } else if (multiplier === 2 || multiplier === 3) {
      // 60fps
      rafFps.value = 60;
    } else if (multiplier >= 4) {
      // 120fps
      rafFps.value = 120;
    }
  }
};

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
  // Wait a second so that we know rendering has settled down, then try to work out the display refresh rate.
  setTimeout(pollFrameTimes, 1000);
  window.addEventListener("click", (e: MouseEvent) => {
    const navBounds = globalSideNav.value?.getBoundingClientRect();
    if (navBounds && e.clientX > navBounds?.right && pinSideNav.value) {
      pinSideNav.value = false;
    }
  });
});
</script>
<template>
  <div class="debug">Logged in? {{ userIsLoggedIn }}</div>
  <blocking-user-action-required-modal v-if="euaIsOutOfDate" />
  <network-connection-alert-modal id="network-issue-modal" />
  <switch-groups-modal
    v-if="showSwitchGroup.visible"
    id="switch-groups-modal"
  />
  <create-group-modal v-if="creatingNewGroup.visible" id="create-group-modal" />
  <join-existing-group-modal
    v-if="joiningNewGroup.visible"
    id="join-group-modal"
  />
  <git-release-info-bar v-if="hasGitReleaseInfoBar" id="release-info-modal" />
  <main
    class="justify-content-center align-items-center d-flex"
    v-if="isLoggingInAutomatically || isFetchingGroups"
  >
    <h1 class="h3"><b-spinner /> Signing in...</h1>
  </main>
  <main
    id="main-wrapper"
    :class="[
      'd-flex',
      'logged-in',
      { 'has-git-info-bar': hasGitReleaseInfoBar },
    ]"
    v-else-if="userIsLoggedIn && userHasGroups && userHasConfirmedEmailAddress"
  >
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
              groupName: urlNormalisedCurrentGroupName,
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
          class="
            d-flex
            flex-row
            group-switcher
            justify-content-between
            mt-5
            mb-2
          "
        >
          <button
            class="
              btn btn-light
              current-group
              d-flex
              flex-fill
              me-1
              align-items-center
            "
            v-if="userHasMultipleGroups"
            @click="showSwitchGroup.visible = true"
          >
            {{ currentSelectedGroup.groupName }}
            <span class="switch-label figure ms-1"
              ><font-awesome-icon icon="retweet" class="switch-icon"
            /></span>
          </button>
          <span
            v-else
            class="btn current-group d-flex flex-fill me-1 align-items-center"
            >{{ currentSelectedGroup.groupName }}</span
          >

          <div class="dropdown">
            <button
              class="btn btn-light add-group"
              type="button"
              id="switch-or-join-group-button"
              data-bs-toggle="dropdown"
              @click="pinSideNav = true"
              @blur="pinSideNav = false"
            >
              <font-awesome-icon icon="plus" />
            </button>
            <ul
              class="dropdown-menu"
              aria-labelledby="switch-or-join-group-button"
            >
              <li>
                <button
                  class="dropdown-item"
                  type="button"
                  @click.stop.prevent="creatingNewGroup.visible = true"
                >
                  Create a new group
                </button>
              </li>
              <li>
                <button
                  class="dropdown-item"
                  type="button"
                  @click.stop.prevent="joiningNewGroup.visible = true"
                >
                  Join an existing group
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <ul class="nav nav-pills nav-flush flex-column mb-auto pt-3">
        <li class="nav-item">
          <router-link
            :to="{
              name: 'dashboard',
              params: {
                groupName: urlNormalisedCurrentGroupName,
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
              name: 'stations',
              params: {
                groupName: urlNormalisedCurrentGroupName,
              },
            }"
            class="nav-link py-3 d-flex flex-row"
            title=""
            data-bs-toggle="tooltip"
            data-bs-placement="right"
            data-bs-original-title="Stations"
          >
            <span class="nav-icon-wrapper">
              <font-awesome-icon icon="location-dot" />
            </span>
            <span>Stations</span>
          </router-link>
        </li>
        <li class="nav-item">
          <router-link
            :to="{
              name: 'activity',
              params: {
                groupName: urlNormalisedCurrentGroupName,
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
                groupName: urlNormalisedCurrentGroupName,
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
                >
                  <path
                    d="M2.99.8C3.9.27 4.9 0 6 0a5.97 5.97 0 0 1 5.2 9.01 5.97 5.97 0 0 1-8.21 2.19A5.97 5.97 0 0 1 .8 2.99 5.97 5.97 0 0 1 3 .8Zm3.94 9.13A.26.26 0 0 0 7 9.74V8.26a.26.26 0 0 0-.07-.19.23.23 0 0 0-.17-.07h-1.5a.25.25 0 0 0-.18.08.25.25 0 0 0-.08.18v1.48c0 .07.03.13.08.18.05.05.11.08.18.08h1.5c.07 0 .12-.02.17-.07ZM6.9 7.19a.2.2 0 0 0 .08-.14l.14-4.85c0-.06-.02-.1-.07-.14a.3.3 0 0 0-.2-.06h-1.7a.3.3 0 0 0-.2.06.15.15 0 0 0-.08.14l.14 4.85c0 .06.02.1.08.14a.3.3 0 0 0 .18.06h1.45c.07 0 .13-.02.18-.06Z"
                    fill="#d9001b"
                  />
                </svg>
              </span>
            </span>
            <span>Devices</span>
          </router-link>
        </li>
        <li class="nav-item">
          <router-link
            :to="{
              name: 'report',
              params: {
                groupName: urlNormalisedCurrentGroupName,
              },
            }"
            class="nav-link py-3 d-flex flex-row"
            title=""
            data-bs-toggle="tooltip"
            data-bs-placement="right"
            data-bs-original-title="Report"
          >
            <span class="nav-icon-wrapper">
              <font-awesome-icon icon="chart-pie" />
            </span>
            <span>Report</span>
          </router-link>
        </li>
        <li class="nav-item">
          <router-link
            :to="{
              name: 'user-group-settings',
              params: {
                groupName: urlNormalisedCurrentGroupName,
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
        <li class="nav-item" v-if="userIsAdminForCurrentSelectedGroup">
          <router-link
            :to="{
              name: 'group-settings',
              params: {
                groupName: urlNormalisedCurrentGroupName,
              },
            }"
            class="nav-link py-3 d-flex flex-row"
            title=""
            data-bs-toggle="tooltip"
            data-bs-placement="right"
            data-bs-original-title="Manage group"
          >
            <span class="nav-icon-wrapper">
              <font-awesome-icon icon="screwdriver-wrench" />
            </span>
            <span>Manage&nbsp;group</span>
          </router-link>
        </li>
      </ul>
      <div class="border-top d-flex">
        <router-link
          :to="{ name: 'user-settings' }"
          class="d-flex py-3 text-decoration-none flex-fill"
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
          <span v-html="currentUserName"></span>
        </router-link>
        <router-link
          :to="{ name: 'sign-out' }"
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
    <section id="main-content" :class="{ 'offset-content': isWideScreen }">
      <div class="container-xxl py-0">
        <div class="section-top-padding pt-5 pb-4 d-sm-none"></div>
        <!--  The group-scoped views.  -->
        <div class="d-flex flex-column router-view">
          <router-view v-if="!route.meta.nonMainView" />
        </div>
      </div>
    </section>
  </main>
  <main
    v-else
    :class="[
      userIsLoggedIn && (!userHasGroups || !userHasConfirmedEmailAddress)
        ? 'account-setup'
        : 'logged-out',
      'd-flex',
      'flex-column',
      'account-setup',
      'justify-content-center',
      'align-items-center',
      'flex-fill',
    ]"
  >
    <!--  When logging out, the existing router view gets re-mounted in here, which we don't want.  -->
    <router-view v-if="route.meta.nonMainView" />
  </main>
</template>

<style lang="less">
#app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
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
:root {
  --bs-body-font-size: 1rem;
  --bs-btn-disabled-border-color: transparent;
  --bs-btn-focus-border-color: transparent;
  --bs-btn-active-border-color: transparent;
}

@import "./assets/font-sizes.less";
</style>

<style lang="less" scoped>
@global-side-nav-collapsed-width: 3.5rem;
@global-side-nav-expanded-width: 20rem;
#main-wrapper {
  position: relative;
  @media (min-width: 576px) {
    padding-left: @global-side-nav-collapsed-width;
  }
  max-height: 100vh;
  &.has-git-info-bar {
    max-height: calc(100vh - 24px);
  }
}

#main-content {
  background: #f6f6f6;
  width: 100%;
  overflow-y: auto;
  transition: margin-left 0.2s;
  &.offset-content {
    margin-left: calc(
      @global-side-nav-expanded-width - @global-side-nav-collapsed-width
    );
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
#global-side-nav {
  transform: translateX(-@global-side-nav-expanded-width);
  @media (min-width: 576px) {
    transform: unset;
  }

  background: white;
  position: fixed;
  bottom: 0;
  top: 0;
  left: 0;
  width: @global-side-nav-collapsed-width;
  overflow: hidden;
  transition: width 0.2s, transform 0.2s;
  box-shadow: 0 0 5px rgba(0, 0, 0, 0.1);
  z-index: 1002;

  .nav-icon-wrapper {
    // Keep the icons vertically aligned relative to one-another.
    display: block;
    width: @global-side-nav-collapsed-width;
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
      width: @global-side-nav-expanded-width;
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
    width: @global-side-nav-expanded-width;
    .nav-top {
      background-color: #fafafa;
      .group-switcher {
        opacity: 1;
      }
    }
  }

  @media screen and (min-width: 576px) {
    &:hover,
    &.pinned {
      transform: translateX(0);
      width: @global-side-nav-expanded-width;
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

main {
  flex: auto;
  flex-wrap: nowrap;
  /*height: 100vh;*/
  /*min-height: 100vh;*/
  /*max-height: 100vh;*/
  /*overflow-x: auto;*/
  /*overflow-y: hidden;*/
}

.router-view {
  min-height: 100vh;
}

.logged-in {
}
.account-setup {
  @media (min-width: 768px) {
    background: #95a5a6;
  }
}
.logged-out {
  @media (min-width: 768px) {
    background: #95a5a6;
  }
}

.debug {
  display: none;
  right: 0;
  bottom: 0;
  position: absolute;
  z-index: 10000;
  background: white;
  padding: 10px;
}
</style>
<style src="vue-multiselect/dist/vue-multiselect.css"></style>
