import {
  createRouter,
  createWebHistory,
  type RouteLocationRaw,
} from "vue-router";
import type { NavigationGuardNext, RouteLocationNormalized } from "vue-router";
import {
  currentEUAVersion,
  currentSelectedProject,
  DevicesForCurrentProject,
  forgetUserOnCurrentDevice,
  isFetchingProjects,
  isLoggingInAutomatically,
  isResumingSession,
  pinSideNav,
  refreshUserProjects,
  switchCurrentProject,
  tryLoggingInRememberedUser,
  urlNormalisedCurrentProjectName,
  UserProjects,
  userHasConfirmedEmailAddress,
  userHasProjects,
  userIsAdminForCurrentSelectedProject,
  userIsLoggedIn,
  LocationsForCurrentProject,
  currentUserIsSuperUser,
  NonUserProjects,
  isViewingAsSuperUser,
} from "@/models/LoggedInUser";
import { getEUAVersion } from "@api/User";
import { getDevicesForProject, getLocationsForProject } from "@api/Project";
import { nextTick } from "vue";
import { decodeJWT, urlNormaliseName } from "@/utils";
import type { ApiGroupResponse } from "@typedefs/api/group";
import type { ApiDeviceResponse } from "@typedefs/api/device";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import { DeviceType } from "@typedefs/api/consts.ts";
import type { LoadedResource } from "@api/types.ts";

// Allows us to abort all pending fetch requests when switching between major views.
export const CurrentViewAbortController = {
  newView() {
    this.controller && this.controller.abort();
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
const recordingModalTabChildren = (grandParent: string, parent: string) => [
  {
    path: "labels/:trackId?/:detail?", // Labels also needs to maintain current trackId when we switch to it.
    name: `${grandParent}-${parent}-labels`,
    component: () => import("@/components/RecordingViewLabels.vue"),
  },
  {
    path: "tracks/:trackId?/:detail?",
    name: `${grandParent}-${parent}-tracks`,
    component: () => import("@/components/RecordingViewTracks.vue"),
  },
];

const recordingModalChildren = (parent: string) => [
  {
    // RecordingView will be rendered inside Dashboards' <router-view>
    // when /:projectName/visit/:visitLabel/:currentRecordingId/:recordingIds is matched
    path: "visit/:visitLabel/:currentRecordingId/:recordingIds?",
    name: `${parent}-visit`,
    redirect: {
      name: `${parent}-visit-tracks`,
    },
    meta: {
      title: ":visitLabel visit, #:currentRecordingId",
      context: `${parent}-visit`,
    },
    component: () => import("@/views/RecordingView.vue"),
    children: recordingModalTabChildren(parent, "visit"),
  },
  {
    // RecordingView will be rendered inside Dashboards' <router-view>
    // when /:projectName/recordings/:recordingIds is matched
    path: "recording/:currentRecordingId/:recordingIds?",
    meta: {
      title: "Recording #:currentRecordingId",
      context: `${parent}-recording`,
    }, // Make tracks the default tab
    redirect: (to: RouteLocationNormalized): RouteLocationRaw => {
      return {
        name: `${parent}-recording-tracks`,
        params: {
          ...to.params,
        },
      };
    },
    name: `${parent}-recording`,
    component: () => import("@/views/RecordingView.vue"),
    children: recordingModalTabChildren(parent, "recording"),
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/setup",
      name: "setup",
      meta: {
        title: "Project setup",
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
      name: "accept-project-invite",
      meta: {
        title: "Accept project invitation",
        requiresLogin: true,
        nonMainView: true,
      },
      component: () => import("@/views/AcceptProjectInvite.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/confirm-project-membership-request/:token",
      name: "confirm-project-membership-request",
      meta: {
        title: "Confirm project membership request",
        requiresLogin: true,
        nonMainView: true,
      },
      component: () => import("@/views/ConfirmAddToProjectRequest.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/:projectName",
      name: "dashboard",
      meta: { title: ":projectName Dashboard", requiresLogin: true },
      component: () => import("@/views/DashboardView.vue"),
      beforeEnter: cancelPendingRequests,
      children: recordingModalChildren("dashboard"),
    },
    {
      path: "/:projectName/locations",
      name: "locations",
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      meta: { requiresLogin: true, title: "Locations for :projectName" },
      component: () => import("@/views/LocationsView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/:projectName/activity",
      name: "activity",
      meta: { requiresLogin: true, title: "Activity in :projectName" },
      component: () => import("@/views/ActivitySearchView.vue"),
      beforeEnter: cancelPendingRequests,
      children: recordingModalChildren("activity"),
    },
    {
      path: "/:projectName/devices/:all?",
      name: "devices",
      meta: { requiresLogin: true, title: "Devices belonging to :projectName" },
      component: () => import("@/views/DevicesView.vue"),
      beforeEnter: cancelPendingRequests,
      children: [
        {
          // DeviceView will be rendered inside DevicesViews' <router-view>
          // when /:groupName/devices/:deviceName is matched
          path: ":deviceId/:deviceName/:type?",
          name: "device",
          redirect: (to): RouteLocationRaw => {
            // Redirect depends on deviceType:
            if (to.params.type === DeviceType.TrailCam) {
              return {
                name: "device-uploads",
                params: {
                  ...to.params,
                  // Remove type from destination route
                  type: null,
                },
              };
            } else {
              return {
                name: "device-diagnostics",
                params: {
                  ...to.params,
                  // Remove type from destination route
                  type: null,
                },
              };
            }
          }, // Make diagnostics the default tab
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
              redirect: { name: "recording-setup" }, // Open the first list item on load
              component: () => import("@/views/DeviceSetupSubView.vue"),
              children: [
                {
                  path: "recording-options",
                  name: "recording-setup",
                  component: () =>
                    import("@/components/DeviceRecordingSetup.vue"),
                },
                {
                  path: "reference",
                  name: "reference-photo",
                  component: () =>
                    import("@/components/DeviceSetupReferencePhoto.vue"),
                },
                {
                  path: "mask",
                  name: "define-masking",
                  component: () =>
                    import("@/components/DeviceSetupDefineMask.vue"),
                },
              ],
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
            {
              path: "events",
              name: "device-events",
              component: () => import("@/views/DeviceEventsSubView.vue"),
            },
            {
              path: "insights",
              name: "device-insights",
              component: () => import("@/views/DeviceInsightsSubView.vue"),
            },
          ],
        },
      ],
    },
    {
      path: "/:projectName/report",
      name: "report",
      meta: { requiresLogin: true, title: "Reporting: :projectName" },
      component: () => import("@/views/ReportingView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/:projectName/my-settings",
      name: "user-project-settings",
      meta: { requiresLogin: true, title: "My settings for :projectName" },
      component: () => import("@/views/UserGroupPreferencesView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/:projectName/settings",
      name: "project-settings",
      meta: {
        requiresLogin: true,
        requiresGroupAdmin: true,
        title: "Settings for :projectName",
      },
      redirect: { name: "project-users" },
      component: () => import("@/views/ManageProjectView.vue"),
      beforeEnter: cancelPendingRequests,
      children: [
        {
          // ManageGroupUsersSubView will be rendered inside ManageGroupViews's <router-view>
          // when /:groupName/settings/users is matched
          name: "project-users",
          path: "users",
          meta: { title: "Users for :projectName" },
          component: () => import("@/views/ManageProjectUsersSubView.vue"),
        },
        {
          name: "project-tag-settings",
          path: "tag-settings",
          meta: { title: "Tag preferences for :projectName" },
          component: () =>
            import("@/views/ManageProjectTagSettingsSubView.vue"),
        },
        {
          name: "fix-project-locations",
          path: "fix-project-locations",
          meta: { title: "Fixup locations for :projectName" },
          component: () =>
            import("@/views/ManageProjectFixLocationsSubView.vue"),
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
    forgetUserOnCurrentDevice();
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
  if (!userIsLoggedIn.value && (to.meta.requiresLogin || to.path === "/")) {
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
      !currentSelectedProject.value &&
      !isFetchingProjects.value
    ) {
      // console.log("User is logged in, refresh projects (2)");
      const projectsResponse = await refreshUserProjects();
      if (projectsResponse.status === 401) {
        return next({ name: "sign-in", query: { nextUrl: to.fullPath } });
      } else if (UserProjects.value && UserProjects.value?.length === 0) {
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
      console.warn(
        "Failed to resume session or no session to resume",
        to.fullPath
      );
      if (to.meta.requiresLogin || to.path === "/") {
        console.warn("Redirect to sign-in");
        return next({ name: "sign-in", query: { nextUrl: to.fullPath } });
      } else {
        isResumingSession.value = false;
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
        !userHasProjects.value
      ) {
        return next({ name: "setup" });
      } else {
        return next({
          name: "dashboard",
          params: {
            projectName: urlNormalisedCurrentProjectName.value,
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
    let potentialProjectName = to.path
      .split("/")
      .filter((item) => item !== "")
      .shift();
    if (userIsLoggedIn.value && !UserProjects.value) {
      // Grab the users' groups, and select the first one.
      // console.log(
      //   "User is logged in, refresh projects",
      //   userIsLoggedIn.value,
      //   CurrentUser.value
      // );
      const projectsResponse = await refreshUserProjects();
      if (projectsResponse.status === 401) {
        return next({ name: "sign-out" });
      } else if (
        UserProjects.value !== null &&
        (UserProjects.value || []).length === 0
      ) {
        if (to.name !== "setup" && to.name !== "confirm-email") {
          return next({ name: "setup" });
        } else {
          return next();
        }
      }
    }
    if (potentialProjectName) {
      potentialProjectName = urlNormaliseName(potentialProjectName);
      let matchedProject = (
        (UserProjects.value as ApiGroupResponse[]) || []
      ).find(
        ({ groupName }) => urlNormaliseName(groupName) === potentialProjectName
      );
      if (!matchedProject && currentUserIsSuperUser.value) {
        matchedProject = (
          (NonUserProjects.value as ApiGroupResponse[]) || []
        ).find(
          ({ groupName }) =>
            urlNormaliseName(groupName) === potentialProjectName
        );
      }

      // TODO: In super-user mode, match on a different set of groups.  I guess we should maybe store all those
      //  groups globally the first time they're requested?

      // console.warn("Found match", matchedGroup);
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

      if (matchedProject) {
        // Don't persist the admin property in user settings, since that could change
        const switchedProject = switchCurrentProject({
          groupName: matchedProject.groupName,
          id: matchedProject.id,
        });

        if (currentSelectedProject.value) {
          // Get the devices and locations for the current group.
          if (
            !DevicesForCurrentProject.value ||
            !LocationsForCurrentProject.value ||
            switchedProject
          ) {
            LocationsForCurrentProject.value = null;
            DevicesForCurrentProject.value = null;
            const [devices, locations] = await Promise.all([
              getDevicesForProject(
                currentSelectedProject.value.id,
                false,
                true
              ),
              getLocationsForProject(
                currentSelectedProject.value.id.toString(),
                true
              ),
            ]);
            DevicesForCurrentProject.value = devices as LoadedResource<
              ApiDeviceResponse[]
            >;
            LocationsForCurrentProject.value = locations as LoadedResource<
              ApiLocationResponse[]
            >;
          }
        } else {
          LocationsForCurrentProject.value = null;
          DevicesForCurrentProject.value = null;
        }
      } else {
        if (to.matched.length === 1 && to.matched[0].name === "dashboard") {
          // Group in url not found, redirect to our last selected group.
          return next({
            name: "dashboard",
            params: {
              projectName: urlNormalisedCurrentProjectName.value,
            },
          });
        }
      }
    }
  }

  if (
    to.meta.requiresGroupAdmin &&
    !userIsAdminForCurrentSelectedProject.value &&
    !isViewingAsSuperUser.value
  ) {
    console.error("Trying to access admin only route");
    return next({
      name: "dashboard",
      params: {
        projectName: urlNormalisedCurrentProjectName.value,
      },
    });
  }

  if (
    to.name === "setup" &&
    userIsLoggedIn.value &&
    userHasProjects.value &&
    userHasConfirmedEmailAddress.value
  ) {
    return next({
      name: "dashboard",
      params: {
        projectName: urlNormalisedCurrentProjectName.value,
      },
    });
  }

  // Slight wait so that we can break infinite navigation loops while developing.
  if (to.meta.requiresLogin && !userIsLoggedIn.value) {
    return next({ name: "sign-in", query: { nextUrl: to.fullPath } });
  }

  if (from.meta.requiresLogin && to.query.nextUrl && userIsLoggedIn.value) {
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
    console.warn(`Navigating to '${String(to.name)}'`, to.fullPath);
    return next();
  }
});

export default router;
