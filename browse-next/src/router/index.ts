import { createRouter, createWebHistory } from "vue-router";
import type { NavigationGuardNext, RouteLocationNormalized } from "vue-router";
import {
  currentEUAVersion,
  currentSelectedGroup,
  DevicesForCurrentGroup,
  forgetUserOnCurrentDevice,
  isFetchingGroups,
  isLoggingInAutomatically,
  isResumingSession,
  pinSideNav,
  refreshUserGroups,
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
import { getDevicesForGroup, getGroups } from "@api/Group";
import { nextTick, reactive } from "vue";
import { decodeJWT, urlNormaliseName } from "@/utils";
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
      meta: {
        title: "Group setup",
        requiresLogin: true,
        nonMainView: true,
        justChangedEmailAddress: false,
      },
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
      meta: { title: ":groupName Dashboard", requiresLogin: true },
      component: () => import("@/views/DashboardView.vue"),
      beforeEnter: cancelPendingRequests,
      children: [
        {
          // RecordingView will be rendered inside Dashboards' <router-view>
          // when /:groupName/visit/:visitLabel/:currentRecordingId/:recordingIds is matched
          path: "visit/:visitLabel/:currentRecordingId/:recordingIds?",
          name: "dashboard-visit",
          redirect: { name: "dashboard-visit-tracks" }, // Make tracks the default tab
          meta: { title: ":visitLabel visit, #:currentRecordingId" },
          component: () => import("@/views/RecordingView.vue"),
          children: [
            {
              path: "labels/:trackId?/:detail?", // Labels also needs to maintain current trackId when we switch to it.
              name: "dashboard-visit-labels",
              component: () => import("@/components/RecordingViewLabels.vue"),
            },
            {
              path: "tracks/:trackId?/:detail?",
              name: "dashboard-visit-tracks",
              component: () => import("@/components/RecordingViewTracks.vue"),
            },
          ],
        },
        {
          // RecordingView will be rendered inside Dashboards' <router-view>
          // when /:groupName/recordings/:recordingIds is matched
          path: "recording/:currentRecordingId/:recordingIds?",
          meta: { title: "Recording #:currentRecordingId" },
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
      meta: { requiresLogin: true, title: "Stations for :groupName" },
      component: () => import("@/views/StationsView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/:groupName/activity",
      name: "activity",
      meta: { requiresLogin: true, title: "Activity in :groupName" },
      component: () => import("@/views/ActivitySearchView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/:groupName/devices",
      name: "devices",
      meta: { requiresLogin: true, title: "Devices belonging to :groupName" },
      component: () => import("@/views/DevicesView.vue"),
      beforeEnter: cancelPendingRequests,
      children: [
        {
          // DeviceView will be rendered inside DevicesViews' <router-view>
          // when /:groupName/devices/:deviceName is matched
          path: ":deviceId/:deviceName",
          name: "device",
          redirect: { name: "device-diagnostics" }, // Make diagnostics the default tab
          meta: { title: "Manage device :deviceName" },
          component: () => import("@/views/DeviceView.vue"),
          children: [
            {
              path: "diagnostics", // Labels also needs to maintain current trackId when we switch to it.
              name: "device-diagnostics",
              component: () => import("@/views/DeviceDiagnosticsSubView.vue"),
            },
            {
              path: "setup",
              name: "device-setup",
              component: () => import("@/views/DeviceSetupSubView.vue"),
            },
            {
              path: "schedules",
              name: "device-schedules",
              component: () => import("@/views/DeviceSchedulesSubView.vue"),
            },
            {
              path: "manual-uploads",
              name: "device-uploads",
              component: () => import("@/views/DeviceUploadsSubView.vue"),
            },
          ],
        },
      ],
    },
    {
      path: "/:groupName/report",
      name: "report",
      meta: { requiresLogin: true, title: "Reporting: :groupName" },
      component: () => import("@/views/ReportingView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/:groupName/my-settings",
      name: "user-group-settings",
      meta: { requiresLogin: true, title: "My settings for :groupName" },
      component: () => import("@/views/UserGroupPreferencesView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/:groupName/settings",
      name: "group-settings",
      meta: {
        requiresLogin: true,
        requiresGroupAdmin: true,
        title: "Settings for :groupName",
      },
      redirect: { name: "group-users" },
      component: () => import("@/views/ManageGroupView.vue"),
      beforeEnter: cancelPendingRequests,
      children: [
        {
          // ManageGroupUsersSubView will be rendered inside ManageGroupViews's <router-view>
          // when /:groupName/settings/users is matched
          name: "group-users",
          path: "users",
          meta: { title: "Users for :groupName" },
          component: () => import("@/views/ManageGroupUsersSubView.vue"),
        },
        {
          name: "group-tag-settings",
          path: "tag-settings",
          meta: { title: "Tag preferences for :groupName" },
          component: () => import("@/views/ManageGroupTagSettingsSubView.vue"),
        },
        {
          name: "fix-station-locations",
          path: "fix-station-locations",
          meta: { title: "Fixup station locations for :groupName" },
          component: () =>
            import("@/views/ManageGroupFixStationLocationsSubView.vue"),
        },
      ],
    },
    {
      path: "/my-settings",
      name: "user-settings",
      meta: { requiresLogin: true, title: "My settings" },
      component: () => import("@/views/UserPreferencesView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/sign-out",
      name: "sign-out",
      meta: { requiresLogin: true, nonMainView: true, title: "Signing out" },
      component: () => import("@/views/UserPreferencesView.vue"),
      beforeEnter: cancelPendingRequests,
    },

    {
      path: "/sign-in",
      name: "sign-in",
      meta: { requiresLogin: false, nonMainView: true, title: "Sign in" },
      component: () => import("@/views/SignInView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/register",
      name: "register",
      meta: {
        requiresLogin: false,
        nonMainView: true,
        title: "Create account",
      },
      component: () => import("@/views/RegisterView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/register/accept-invite/:token",
      name: "register-with-token",
      meta: {
        requiresLogin: false,
        nonMainView: true,
        title: "Accepting invitation",
      },
      component: () => import("@/views/RegisterView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/end-user-agreement",
      name: "end-user-agreement",
      meta: {
        requiresLogin: true,
        nonMainView: true,
        title: "End user agreement",
      },
      component: () => import("@/views/UserPreferencesView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/forgot-password",
      name: "forgot-password",
      meta: {
        requiresLogin: false,
        nonMainView: true,
        title: "Forgot password",
      },
      component: () => import("@/views/ForgotPasswordView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/reset-password/:token",
      name: "validate-reset-password",
      meta: {
        requiresLogin: false,
        nonMainView: true,
        title: "Resetting password",
      },
      component: () => import("@/views/ResetPasswordView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/reset-password",
      name: "reset-password",
      meta: {
        requiresLogin: false,
        nonMainView: true,
        title: "Reset password",
      },
      component: () => import("@/views/ResetPasswordView.vue"),
      beforeEnter: cancelPendingRequests,
    },
  ],
});

const DEFAULT_TITLE = "Cacophony Browse";

const interpolateTitle = (
  str: string,
  route: RouteLocationNormalized
): string => {
  const params = route.params;
  let foundMatch = true;
  let output = str;
  while (foundMatch) {
    foundMatch = false;
    const pieces = output.split(" ");
    for (let piece of pieces) {
      const startsWithHash = piece.startsWith("#");
      const endsWithComma = piece.endsWith(",");
      if (startsWithHash) {
        piece = piece.slice(1);
      }
      if (endsWithComma) {
        piece = piece.slice(0, piece.length - 1);
      }
      if (piece.startsWith(":") && params[piece.slice(1)]) {
        const replaceWith = params[piece.slice(1)];
        output = output.replace(
          piece,
          replaceWith[0].toUpperCase() + replaceWith.slice(1)
        );
        foundMatch = true;
        if (startsWithHash) {
          piece = `#${piece}`;
        }
        if (endsWithComma) {
          piece = `${piece},`;
        }
        break;
      }
    }
  }
  return output;
};

router.afterEach(async (to) => {
  // Use next tick to handle router history correctly
  // see: https://github.com/vuejs/vue-router/issues/914#issuecomment-384477609
  await nextTick(() => {
    document.title = ((to.meta?.title &&
      `${interpolateTitle(to.meta.title as string, to)} | ${DEFAULT_TITLE}`) ||
      DEFAULT_TITLE) as string;
  });
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

  if (userIsLoggedIn.value && to.query.nextUrl) {
    // Make sure we follow any nextUrl on login
    return next({
      path: to.query.nextUrl as string,
    });
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
      const groupsResponse = await refreshUserGroups();
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
      return next({ name: "sign-in", query: { nextUrl: to.fullPath } });
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
        //   JSON.stringify(UserGroups.value)
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
      potentialGroupName = urlNormaliseName(potentialGroupName);
      const matchedGroup = (UserGroups.value as ApiGroupResponse[]).find(
        ({ groupName }) => urlNormaliseName(groupName) === potentialGroupName
      );
      console.warn("Found match", matchedGroup);
      /*
      if (currentSelectedGroup.value) {
          getDevicesForGroup(
              currentSelectedGroup.value.id
          ).then((devicesResponse) => {
            if (devicesResponse.success) {
              console.log("Setting devices");
              DevicesForCurrentGroup.value = devicesResponse.result.devices;
            }
          });
        } else {
          DevicesForCurrentGroup.value = null;
        }
       */

      if (matchedGroup) {
        // Don't persist the admin property in user settings, since that could change
        switchCurrentGroup({
          groupName: matchedGroup.groupName,
          id: matchedGroup.id,
        });

        if (currentSelectedGroup.value) {
          // Get the devices for the current group.
          getDevicesForGroup(currentSelectedGroup.value.id, false, true).then(
            (devicesResponse) => {
              if (devicesResponse.success) {
                DevicesForCurrentGroup.value = devicesResponse.result.devices;
              }
            }
          );
        } else {
          DevicesForCurrentGroup.value = null;
        }
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
    console.warn("Navigating to ", to.fullPath, to.name);
    return next();
  }
});

export default router;
