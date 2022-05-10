import { createRouter, createWebHistory } from "vue-router";
import type { NavigationGuardNext, RouteLocationNormalized } from "vue-router";
import {
  currentEUAVersion,
  currentSelectedGroup,
  forgetUserOnCurrentDevice,
  isFetchingGroups,
  isLoggingInAutomatically,
  isResumingSession,
  tryLoggingInRememberedUser,
  UserGroups,
  userIsLoggedIn,
} from "@/models/LoggedInUser";
import { getEUAVersion } from "@api/User";
import { getGroups } from "@api/Group";
import { reactive } from "vue";

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

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/setup",
      name: "setup",
      meta: { title: "Group setup", requiresLogin: true },
      component: () => import("../views/SetupView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/confirm-account-email/:token",
      name: "confirm-email",
      meta: { title: "Confirm email address", requiresLogin: false },
      component: () => import("../views/ConfirmEmailView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/:groupName",
      name: "dashboard",
      meta: { title: "Group :stationName :tabName", requiresLogin: true },
      component: () => import("../views/DashboardView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/groups",
      name: "select-active-group",
      meta: { requiresLogin: true },
      component: () => import("../views/SelectActiveGroup.vue"), // FIXME - Not sure if this is needed.
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/:groupName/stations",
      name: "stations",
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      meta: { requiresLogin: true },
      component: () => import("../views/StationsView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/:groupName/search",
      name: "search",
      meta: { requiresLogin: true },
      component: () => import("../views/SearchView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/:groupName/devices",
      name: "devices",
      meta: { requiresLogin: true },
      component: () => import("../views/DevicesView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/:groupName/report",
      name: "report",
      meta: { requiresLogin: true },
      component: () => import("../views/ReportingView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/:groupName/my-settings",
      name: "user-group-settings",
      meta: { requiresLogin: true },
      component: () => import("../views/UserGroupPreferencesView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/:groupName/settings",
      name: "group-settings",
      meta: { requiresLogin: true },
      component: () => import("../views/ManageGroupView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/my-settings",
      name: "user-settings",
      meta: { requiresLogin: true },
      component: () => import("../views/UserPreferencesView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/sign-out",
      name: "sign-out",
      meta: { requiresLogin: true },
      component: () => import("../views/UserPreferencesView.vue"),
      beforeEnter: cancelPendingRequests,
    },

    {
      path: "/sign-in",
      name: "sign-in",
      meta: { requiresLogin: false },
      component: () => import("../views/SignInView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/register",
      name: "register",
      meta: { requiresLogin: true },
      component: () => import("../views/RegisterView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/end-user-agreement",
      name: "end-user-agreement",
      meta: { requiresLogin: true },
      component: () => import("../views/UserPreferencesView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/forgot-password",
      name: "forgot-password",
      meta: { requiresLogin: false },
      component: () => import("../views/ForgotPasswordView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/reset-password/:token",
      name: "validate-reset-password",
      meta: { requiresLogin: false },
      component: () => import("../views/ResetPasswordView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/reset-password",
      name: "reset-password",
      meta: { requiresLogin: false },
      component: () => import("../views/ResetPasswordView.vue"),
      beforeEnter: cancelPendingRequests,
    },
  ],
});

let lastDestination: string | null = null;

router.beforeEach(async (to, from, next) => {
  // NOTE: Check for a logged in user here.
  if (!userIsLoggedIn.value) {
    isResumingSession.value = true;
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
      const NO_ABORT = false;
      const groupsResponse = await getGroups(NO_ABORT);
      if (groupsResponse.success) {
        UserGroups.value = reactive(groupsResponse.result.groups);
      }
      isFetchingGroups.value = false;
    }
    isResumingSession.value = false;
  }

  // Slight wait so that we can break infinite navigation loops while developing.
  if (to.meta.requiresLogin && !userIsLoggedIn.value) {
    return next({ name: "sign-in" });
  }

  if (lastDestination === to.name) {
    debugger;
  }
  lastDestination = (to.name as string) || "";
  //await delayMs(50);
  if (userIsLoggedIn.value && to.name === "sign-out") {
    await forgetUserOnCurrentDevice();
    userIsLoggedIn.value = false;
    return next({
      name: "sign-in",
    });
  }
  // Finally, redirect to the sign-in page.
  if (!to.name) {
    return next({
      name: "sign-in",
      query: {
        nextUrl: to.fullPath,
      },
    });
  } else {
    return next();
  }
});

export default router;
