import { createRouter, createWebHistory } from "vue-router";
import type { NavigationGuardNext, RouteLocationNormalized } from "vue-router";
import {
  currentEUAVersion,
  currentSelectedGroup,
  forgetUserOnCurrentDevice,
  isFetchingGroups,
  isLoggingInAutomatically,
  isResumingSession,
  pinSideNav,
  switchCurrentGroup,
  tryLoggingInRememberedUser,
  urlNormalisedCurrentGroupName,
  UserGroups,
  userHasConfirmedEmailAddress,
  userHasGroups,
  userIsAdminForCurrentSelectedGroup,
  userIsLoggedIn,
} from "@/models/LoggedInUser";
import { getEUAVersion } from "@api/User";
import { getGroups } from "@api/Group";
import { reactive } from "vue";
import { decodeJWT, urlNormaliseGroupName } from "@/utils";
import type { ApiGroupResponse } from "@typedefs/api/group";

// Allows us to abort all pending fetch requests when switching between major views.
export const CurrentViewAbortController = {
  newView() {
    this.controller && this.controller.abort();
    this.controller = new AbortController();
    this.controller = new AbortController();
  },
  controller: new AbortController(),
};

const cancelPendingRequests = (
  to: RouteLocationNormalized,
  from: RouteLocationNormalized,
  next: NavigationGuardNext
) => {
  CurrentViewAbortController.newView();
  return next();
};

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/setup",
      name: "setup",
      meta: { title: "Group setup", requiresLogin: true, nonMainView: true },
      component: () => import("@/views/SetupView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/confirm-account-email/:token",
      name: "confirm-email",
      meta: {
        title: "Confirm email address",
        requiresLogin: true,
        nonMainView: true,
      },
      component: () => import("@/views/ConfirmEmailView.vue"),
      beforeEnter: cancelPendingRequests,
    },

    {
      path: "/accept-invite/:token",
      name: "accept-group-invite",
      meta: {
        title: "Accept group invitation",
        requiresLogin: true,
        nonMainView: true,
      },
      component: () => import("@/views/AcceptGroupInvite.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/confirm-group-membership-request/:token",
      name: "confirm-group-membership-request",
      meta: {
        title: "Confirm group membership request",
        requiresLogin: true,
        nonMainView: true,
      },
      component: () => import("@/views/ConfirmAddToGroupRequest.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/:groupName",
      name: "dashboard",
      meta: { title: "Group :stationName :tabName", requiresLogin: true },
      component: () => import("@/views/DashboardView.vue"),
      beforeEnter: cancelPendingRequests,
      children: [
        {
          // RecordingView will be rendered inside Dashboards' <router-view>
          // when /:groupName/visit/:visitLabel/:currentRecordingId/:recordingIds is matched
          path: "visit/:visitLabel/:currentRecordingId/:recordingIds?",
          name: "dashboard-visit",
          redirect: { name: "dashboard-visit-tracks" }, // Make tracks the default tab
          component: () => import("@/views/RecordingView.vue"),
          children: [
            {
              path: "labels",
              name: "dashboard-visit-labels",
              component: () => import("@/components/RecordingViewLabels.vue"),
            },
            {
              path: "tracks/:trackId?",
              name: "dashboard-visit-tracks",
              component: () => import("@/components/RecordingViewTracks.vue"),
            },
          ],
        },
        {
          // RecordingView will be rendered inside Dashboards' <router-view>
          // when /:groupName/recordings/:recordingIds is matched
          path: "recording/:currentRecordingId/:recordingIds?",
          name: "dashboard-recording",
          component: () => import("@/views/RecordingView.vue"),
        },
      ],
    },
    {
      path: "/:groupName/stations",
      name: "stations",
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      meta: { requiresLogin: true },
      component: () => import("@/views/StationsView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/:groupName/activity",
      name: "activity",
      meta: { requiresLogin: true },
      component: () => import("@/views/ActivitySearchView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/:groupName/devices",
      name: "devices",
      meta: { requiresLogin: true },
      component: () => import("@/views/DevicesView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/:groupName/report",
      name: "report",
      meta: { requiresLogin: true },
      component: () => import("@/views/ReportingView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/:groupName/my-settings",
      name: "user-group-settings",
      meta: { requiresLogin: true },
      component: () => import("@/views/UserGroupPreferencesView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/:groupName/settings",
      name: "group-settings",
      meta: { requiresLogin: true, requiresGroupAdmin: true },
      redirect: { name: "group-users" },
      component: () => import("@/views/ManageGroupView.vue"),
      beforeEnter: cancelPendingRequests,
      children: [
        {
          // ManageGroupUsersSubView will be rendered inside ManageGroupViews's <router-view>
          // when /:groupName/settings/users is matched
          name: "group-users",
          path: "users",
          component: () => import("@/views/ManageGroupUsersSubView.vue"),
        },
        {
          name: "group-tag-settings",
          path: "tag-settings",
          component: () => import("@/views/ManageGroupTagSettingsSubView.vue"),
        },
        {
          name: "fix-station-locations",
          path: "fix-station-locations",
          component: () =>
            import("@/views/ManageGroupFixStationLocationsSubView.vue"),
        },
      ],
    },
    // FIXME - add "user-settings", "sign-in" etc to list of forbidden group names.
    {
      path: "/my-settings",
      name: "user-settings",
      meta: { requiresLogin: true },
      component: () => import("@/views/UserPreferencesView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/sign-out",
      name: "sign-out",
      meta: { requiresLogin: true, nonMainView: true },
      component: () => import("@/views/UserPreferencesView.vue"),
      beforeEnter: cancelPendingRequests,
    },

    {
      path: "/sign-in",
      name: "sign-in",
      meta: { requiresLogin: false, nonMainView: true },
      component: () => import("@/views/SignInView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/register",
      name: "register",
      meta: { requiresLogin: false, nonMainView: true },
      component: () => import("@/views/RegisterView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/register/accept-invite/:token",
      name: "register-with-token",
      meta: { requiresLogin: false, nonMainView: true },
      component: () => import("@/views/RegisterView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/end-user-agreement",
      name: "end-user-agreement",
      meta: { requiresLogin: true, nonMainView: true },
      component: () => import("@/views/UserPreferencesView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/forgot-password",
      name: "forgot-password",
      meta: { requiresLogin: false, nonMainView: true },
      component: () => import("@/views/ForgotPasswordView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/reset-password/:token",
      name: "validate-reset-password",
      meta: { requiresLogin: false, nonMainView: true },
      component: () => import("@/views/ResetPasswordView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/reset-password",
      name: "reset-password",
      meta: { requiresLogin: false, nonMainView: true },
      component: () => import("@/views/ResetPasswordView.vue"),
      beforeEnter: cancelPendingRequests,
    },
  ],
});

router.beforeEach(async (to, from, next) => {
  if (to.name === "sign-out") {
    userIsLoggedIn.value = false;
    await forgetUserOnCurrentDevice();
    return next({
      name: "sign-in",
    });
  }

  if (to.name === "dashboard") {
    // debugger;
  }
  let jwtToken;
  if (to.params.token) {
    // Process a JWT token
    const token = (to.params.token as string).replace(/:/g, ".");
    jwtToken = decodeJWT(token);
    // If we're logged in, redirect to the appropriate place for the token type.

    // If we're not logged in, we need to
  }

  // TODO: Match groupName, and set currentSelectedGroup.
  // NOTE: Check for a logged in user here.
  if (!userIsLoggedIn.value) {
    isResumingSession.value = true;
    //console.log("--- Trying to resume saved session");
    const [_, euaResponse] = await Promise.all([
      tryLoggingInRememberedUser(isLoggingInAutomatically),
      getEUAVersion(),
    ]);
    if (euaResponse.success) {
      currentEUAVersion.value = euaResponse.result.euaVersion;
    }

    // FIXME If we've got a currentSelectedGroup we can continue, and load the rest of the groups
    //  in the background without blocking.
    if (
      userIsLoggedIn.value &&
      !currentSelectedGroup.value &&
      !isFetchingGroups.value
    ) {
      // Grab the users' groups, and select the first one.
      isFetchingGroups.value = true;
      console.warn("Fetching user groups");
      const NO_ABORT = false;
      const groupsResponse = await getGroups(NO_ABORT);
      if (groupsResponse.success) {
        UserGroups.value = reactive(groupsResponse.result.groups);
        // console.warn("Fetched user groups", currentSelectedGroup.value);
      }
      isFetchingGroups.value = false;
      if (groupsResponse.status === 401) {
        return next({ name: "sign-in", query: { nextUrl: to.fullPath } });
      } else if (UserGroups.value?.length === 0) {
        if (to.query.nextUrl) {
          return next({ path: to.query.nextUrl as string });
        } else if (jwtToken) {
          // Follow the path to process the token.
          return next();
        }
        return next({ name: "setup" });
      }
    }
    if (userIsLoggedIn.value) {
      console.warn("Resumed session");
    } else {
      console.warn("Failed to resume session or no session to resume");
      if (to.meta.requiresLogin || to.path === "/") {
        console.warn("Redirect to sign-in");
        return next({ name: "sign-in", query: { nextUrl: to.fullPath } });
      } else {
        return next();
      }
    }
    isResumingSession.value = false;
  }
  if (to.path === "/") {
    if (!userIsLoggedIn.value && to.name !== "sign-in") {
      return next({ name: "sign-in" });
    } else {
      if (
        (to.name !== "setup" &&
          to.name !== "confirm-email" &&
          !userHasConfirmedEmailAddress.value) ||
        !userHasGroups.value
      ) {
        return next({ name: "setup" });
      } else {
        return next({
          name: "dashboard",
          params: {
            groupName: urlNormalisedCurrentGroupName.value,
          },
        });
      }
    }
  } else {
    if (!userIsLoggedIn.value && to.meta.requiresLogin) {
      return next({ name: "sign-in", query: { nextUrl: to.fullPath } });
    }
    if (
      userIsLoggedIn.value &&
      to.name !== "setup" &&
      to.name !== "confirm-email" &&
      !userHasConfirmedEmailAddress.value
    ) {
      return next({ name: "setup" });
    }
    // Check to see if we match the first part of the path to any of our group names:
    let potentialGroupName = to.path
      .split("/")
      .filter((item) => item !== "")
      .shift();
    if (userIsLoggedIn.value && !UserGroups.value) {
      // Grab the users' groups, and select the first one.
      isFetchingGroups.value = true;
      // console.warn("Fetching user groups");
      const NO_ABORT = false;
      const groupsResponse = await getGroups(NO_ABORT);
      if (groupsResponse.success) {
        UserGroups.value = reactive(groupsResponse.result.groups);
        // console.warn(
        //   "Fetched user groups",
        //   currentSelectedGroup.value,
        //   UserGroups.value?.length
        // );
      }
      isFetchingGroups.value = false;
      if (groupsResponse.status === 401) {
        return next({ name: "sign-out" });
      } else if (UserGroups.value?.length === 0) {
        if (to.name !== "setup" && to.name !== "confirm-email") {
          return next({ name: "setup" });
        } else {
          return next();
        }
      }
    }
    if (potentialGroupName) {
      potentialGroupName = urlNormaliseGroupName(potentialGroupName);
      const matchedGroup = (UserGroups.value as ApiGroupResponse[]).find(
        ({ groupName }) =>
          urlNormaliseGroupName(groupName) === potentialGroupName
      );
      // console.warn("Found match", matchedGroup);
      if (matchedGroup) {
        // Don't persist the admin property in user settings, since that could change
        switchCurrentGroup({
          groupName: matchedGroup.groupName,
          id: matchedGroup.id,
        });
      } else {
        if (to.matched.length === 1 && to.matched[0].name === "dashboard") {
          // Group in url not found, redirect to our last selected group.
          return next({
            name: "dashboard",
            params: {
              groupName: urlNormalisedCurrentGroupName.value,
            },
          });
        }
      }
    }
  }

  if (to.meta.requiresGroupAdmin && !userIsAdminForCurrentSelectedGroup.value) {
    console.error("Trying to access admin only route");
    return next({
      name: "dashboard",
      params: {
        groupName: urlNormalisedCurrentGroupName.value,
      },
    });
  }

  if (
    to.name === "setup" &&
    userIsLoggedIn.value &&
    userHasGroups.value &&
    userHasConfirmedEmailAddress.value
  ) {
    return next({
      name: "dashboard",
      params: {
        groupName: urlNormalisedCurrentGroupName.value,
      },
    });
  }

  // Slight wait so that we can break infinite navigation loops while developing.
  if (to.meta.requiresLogin && !userIsLoggedIn.value) {
    return next({ name: "sign-in", query: { nextUrl: to.fullPath } });
  }

  if (!from.meta.requiresLogin && to.query.nextUrl) {
    // We just logged in.
    return next({
      path: to.query.nextUrl as string,
    });
  }

  // Finally, redirect to the sign-in page.
  if (!to.name && !userIsLoggedIn.value) {
    return next({
      name: "sign-in",
      query: {
        nextUrl: to.fullPath,
      },
    });
  } else {
    pinSideNav.value = false;
    return next();
  }
});

export default router;
