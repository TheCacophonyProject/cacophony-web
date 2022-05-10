<script setup lang="ts">
import { RouterView, RouterLink } from "vue-router";
import GitReleaseInfoBar from "@/components/GitReleaseInfoBar.vue";
//import BlockingUserActionRequiredModal from "@/components/BlockingUserActionRequiredModal.vue";
import NetworkConnectionAlertModal from "@/components/NetworkConnectionAlertModal.vue";
import IconCacophonyLogoFull from "@/components/icons/IconCacophonyLogoFull.vue";
import {
  userIsLoggedIn,
  userHasGroups,
  CurrentUser,
  euaIsOutOfDate,
  currentSelectedGroup,
  userHasMultipleGroups,
  isLoggingInAutomatically,
  isFetchingGroups,
  isResumingSession,
  UserGroups,
} from "@/models/LoggedInUser";
import { defineAsyncComponent, ref } from "vue";
import { BSpinner } from "bootstrap-vue-3";
import CreateGroupModal from "@/components/CreateGroupModal.vue";

const BlockingUserActionRequiredModal = defineAsyncComponent(
  () => import("@/components/BlockingUserActionRequiredModal.vue")
);

const userIsSuperAdmin = false;
const loggedInAsAnotherUser = false;
const environmentIsProduction = false;

const creatingNewGroup = ref(false);
const createNewGroup = () => {
  console.log("Create new group");
  creatingNewGroup.value = true;
};

const clearCreateNewGroup = () => {
  console.log("Clear create new group");
  creatingNewGroup.value = false;
};
// TODO: This should be an exported ref/reactive thingy.
// Once a user logs in, they have a last selected group.
// When a user switches a group, it gets flagged and saved server-side as the last selected group (saved as group id *and name*, since groups can be renamed?)
//const currentSelectedGroup = { groupName: "foo", id: 1 };
</script>
<template>
  <blocking-user-action-required-modal
    v-if="userIsLoggedIn && euaIsOutOfDate"
  />
  <network-connection-alert-modal />
  <create-group-modal
    :show="creatingNewGroup"
    @finished="clearCreateNewGroup"
  />
  <git-release-info-bar />
  <main
    class="justify-content-center align-items-center d-flex"
    v-if="isLoggingInAutomatically || isFetchingGroups"
  >
    <h1 class="h3"><b-spinner /> Signing in...</h1>
  </main>
  <main
    id="main-wrapper"
    class="d-flex logged-in has-git-info-bar"
    v-else-if="userIsLoggedIn && userHasGroups"
  >
    <nav id="global-side-nav" class="d-flex flex-column flex-shrink-0">
      <div class="nav-top">
        <router-link
          :to="{
            name: 'dashboard',
            params: {
              groupName: currentSelectedGroup.groupName,
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
          <div class="d-flex">
            <button class="btn current-group" v-if="userHasMultipleGroups">
              {{ currentSelectedGroup.groupName }}
              <span class="switch-label figure"
                ><font-awesome-icon icon="retweet" class="switch-icon"
              /></span>
            </button>
            <span v-else class="current-group">{{
              currentSelectedGroup.groupName
            }}</span>
          </div>
          <button class="btn add-group" @click.stop.prevent="createNewGroup">
            <font-awesome-icon icon="plus" />
          </button>
        </div>
      </div>
      <ul class="nav nav-pills nav-flush flex-column mb-auto pt-3">
        <li class="nav-item">
          <router-link
            :to="{
              name: 'dashboard',
              params: {
                groupName: currentSelectedGroup.groupName,
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
                groupName: currentSelectedGroup.groupName,
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
              name: 'search',
              params: {
                groupName: currentSelectedGroup.groupName,
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
            <span>Search</span>
          </router-link>
        </li>
        <li class="nav-item">
          <router-link
            :to="{
              name: 'devices',
              params: {
                groupName: currentSelectedGroup.groupName,
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
                groupName: currentSelectedGroup.groupName,
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
                groupName: currentSelectedGroup.groupName,
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
        <li class="nav-item">
          <router-link
            :to="{
              name: 'group-settings',
              params: {
                groupName: currentSelectedGroup.groupName,
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
          <span>{{ CurrentUser.userName }}</span>
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
    <section id="main-content">
      <div class="container pt-3">
        <router-view />
      </div>
    </section>
  </main>
  <main v-else-if="userIsLoggedIn && !userHasGroups" class="d-flex flex-column">
    <router-view />
  </main>
  <main
    v-else
    class="logged-out justify-content-center align-items-center d-flex flex-column flex-fill"
  >
    <router-view />
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
  &:hover {
    #cacophony-logo-full .text {
      opacity: 1;
    }
  }
}
</style>

<style lang="less" scoped>
#main-wrapper {
  position: relative;
  padding-left: 3.5rem;
  max-height: 100vh;
  &.has-git-info-bar {
    max-height: calc(100vh - 24px);
  }
}

#main-content {
  background: #f6f6f6;
  width: 100%;
  overflow-y: auto;
}

#global-side-nav {
  @collapsed-width: 3.5rem;
  @expanded-width: 20rem;

  background: white;
  position: absolute;
  bottom: 0;
  top: 0;
  left: 0;
  width: @collapsed-width;
  overflow: hidden;
  transition: width 0.2s;
  box-shadow: 0 0 5px rgba(0, 0, 0, 0.1);
  z-index: 1;


  .nav-icon-wrapper {
    // Keep the icons vertically aligned relative to one-another.
    display: block;
    width: @collapsed-width;
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
      width: @expanded-width;
      .current-group {
        text-transform: uppercase;
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
      }
    }
  }

  .cacophony-logo-link {
    padding: 0.6rem;
  }

  // Expanded menu state
  &:hover {
    width: @expanded-width;
    .nav-top {
      background-color: #fafafa;
      .group-switcher {
        opacity: 1;
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

.logged-in {
}
.logged-out {
  @media (min-width: 768px) {
    background: #95a5a6;
  }
}
</style>
<style src="vue-multiselect/dist/vue-multiselect.css"></style>
