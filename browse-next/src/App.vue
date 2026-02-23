<script setup lang="ts">
import { RouterView, RouterLink, useRoute } from "vue-router";

// TODO only in dev mode, otherwise we need an info button somewhere for production
import GitReleaseInfoBar from "@/components/GitReleaseInfoBar.vue";
import NetworkConnectionAlertModal from "@/components/NetworkConnectionAlertModal.vue";
import IconCacophonyLogoFull from "@/components/icons/IconCacophonyLogoFull.vue";
import {
  euaIsOutOfDate,
  userHasMultipleProjects,
  isLoggingInAutomatically,
  isFetchingProjects,
  userIsAdminForCurrentSelectedProject,
  userHasConfirmedEmailAddress,
  showSwitchProject,
  creatingNewProject,
  joiningNewProject,
  urlNormalisedCurrentProjectName,
  rafFps,
  pinSideNav,
  showSideNavBg,
  isWideScreen,
  sideNavIsPinned,
  isSmallScreen,
  showUnimplementedModal,
  DevicesForCurrentProject,
  isViewingAsSuperUser,
} from "@/models/LoggedInUser";
import type { SelectedProject, LoggedInUser } from "@/models/LoggedInUser";
import {
  userHasProjects as hasProjects,
  userIsLoggedIn as hasLoggedInUser,
  currentUser,
  currentSelectedProject,
} from "@models/provides.ts";
import {
  computed,
  defineAsyncComponent,
  inject,
  onBeforeMount,
  onMounted,
  ref,
  watch,
} from "vue";
import type { ComputedRef, Ref } from "vue";
import { BModal, BSpinner } from "bootstrap-vue-next";
import SwitchProjectsModal from "@/components/SwitchProjectsModal.vue";
import AppMainNav from "@/components/AppMainNav.vue";

const userIsLoggedIn = inject(hasLoggedInUser) as ComputedRef<boolean>;
const userHasProjects = inject(hasProjects) as ComputedRef<boolean>;
const BlockingUserActionRequiredModal = defineAsyncComponent(
  () => import("@/components/BlockingUserActionRequiredModal.vue"),
);

const CreateProjectModal = defineAsyncComponent(
  () => import("@/components/CreateProjectModal.vue"),
);

const JoinExistingProjectModal = defineAsyncComponent(
  () => import("@/components/JoinExistingProjectModal.vue"),
);
const hasGitReleaseInfoBar = ref(false);

const route = useRoute();

onMounted(() => {
  // Wait a second so that we know rendering has settled down, then try to work out the display refresh rate.
  setTimeout(pollFrameTimes, 1000);
});

const frameTimes: number[] = [];
const pollFrameTimes = () => {
  // Initial condition
  frameTimes.push(performance.now());
  if (frameTimes.length < 10) {
    requestAnimationFrame(pollFrameTimes);
  } else {
    const diffs = [];
    for (let i = 1; i < frameTimes.length; i++) {
      diffs.push((frameTimes[i] as number) - (frameTimes[i - 1] as number));
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
</script>
<template>
  <div class="debug">Logged in? {{ userIsLoggedIn }}</div>
  <blocking-user-action-required-modal v-if="euaIsOutOfDate" />
  <network-connection-alert-modal id="network-issue-modal" />
  <b-modal
    id="unimplemented-modal"
    v-model="showUnimplementedModal"
    centered
    ok-only
    title="Unimplemented feature"
    hide-backdrop
  >
    <div>Sorry, this feature is not yet implemented.</div>
  </b-modal>
  <switch-projects-modal
    v-if="showSwitchProject.enabled"
    id="switch-groups-modal"
  />
  <create-project-modal
    v-if="creatingNewProject.enabled"
    id="create-group-modal"
  />
  <join-existing-project-modal
    v-if="joiningNewProject.enabled"
    id="join-project-modal"
  />
  <git-release-info-bar v-if="hasGitReleaseInfoBar" id="release-info-modal" />
  <main
    class="justify-content-center align-items-center d-flex"
    v-if="isLoggingInAutomatically || isFetchingProjects"
  >
    <div
      class="d-flex flex-column align-items-center justify-content-center user-select-none"
    >
      <b-spinner variant="secondary" />
      <span class="h3 d-block mt-3"
        ><span v-if="isLoggingInAutomatically">Signing in...</span></span
      >
    </div>
  </main>
  <main
    id="main-wrapper"
    :class="[
      'd-flex',
      'logged-in',
      { 'has-git-info-bar': hasGitReleaseInfoBar },
    ]"
    v-else-if="
      userIsLoggedIn &&
      userHasConfirmedEmailAddress &&
      userHasProjects &&
      !route.meta.nonMainView
    "
  >
    <app-main-nav />
    <section
      id="main-content"
      :class="{ 'offset-content': isWideScreen }"
      class="d-flex"
    >
      <div
        class="container-xxl px-sm-3 px-md-4 py-0 d-flex flex-fill flex-column"
      >
        <div class="section-top-padding pt-5 pb-4 d-sm-none"></div>
        <!--  The group-scoped views.  -->
        <div class="d-flex flex-column router-view flex-fill">
          <router-view />
        </div>
      </div>
    </section>
  </main>
  <main
    v-else-if="route.meta.nonMainView"
    :class="[
      userIsLoggedIn && (!userHasProjects || !userHasConfirmedEmailAddress)
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
    <router-view />
  </main>
</template>

<style lang="less">
@import "./assets/less/base.less";

:root {
  --global-side-nav-collapsed-width: calc(var(--cp-grid-base) * 19); // 76px
  --global-side-nav-expanded-width: calc(var(--cp-grid-base) * 68); // 272px
}

#app {
  display: flex;
  flex-direction: column;
  min-height: 100svh;
}

#unimplemented-modal {
  z-index: 20000;
}

.dropdown-btn {
  height: 100%;
  aspect-ratio: 1;
  &::after {
    display: none;
  }
}

.dropdown-toggle.dropdown-toggle-no-caret.btn-hi.btn-square::before {
  display: block !important;
}

.btn-hi,
.dropdown-btn {
  border: 0;
  min-width: 44px;
  z-index: 1;
  &::before {
    content: "";
    position: absolute;
    display: block !important;
    left: 6px;
    right: 6px;
    top: 6px;
    bottom: 6px;
    border-radius: 3px;
    background: transparent;
    z-index: -1;
    transition: background 0.2s ease-in-out;
  }
  &:hover:not(:disabled) {
    &::before {
      background: #ddd;
    }
  }
  &:active:not(:disabled) {
    &::before {
      background: #aaa;
    }
  }
  &.btn-square {
    position: relative;
    &::before {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      aspect-ratio: 1;
    }
  }
}
</style>

<style lang="less" scoped>
@import "./assets/less/breakpoints";
#main-wrapper {
  position: relative;
  @media (min-width: @breakpoint-xs-max) {
    padding-left: var(--global-side-nav-collapsed-width);
  }
  max-height: 100svh;
  &.has-git-info-bar {
    max-height: calc(100vh - 24px);
  }
}

#main-content {
  background-color: var(--app-bg-color);
  width: 100%;
  overflow-y: auto;
  transition: margin-left 0.2s;
  &.offset-content {
    margin-left: calc(
      var(--global-side-nav-expanded-width) -
        var(--global-side-nav-collapsed-width)
    );
  }
}
main {
  flex: auto;
  flex-wrap: nowrap;
}
.account-setup {
  @media (min-width: 768px) {
    background: var(--app-bg-color);
  }
}
.logged-out {
  background: var(--app-bg-color);
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
<style lang="css">
@import url("@vueform/multiselect/themes/default.css");
</style>
