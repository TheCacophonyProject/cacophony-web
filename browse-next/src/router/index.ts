import { createRouter, createWebHistory } from "vue-router";
import type { NavigationGuardNext, RouteLocationNormalized } from "vue-router";
import {
  forgetUserOnCurrentDevice,
  userIsLoggedIn,
} from "@/models/LoggedInUser";

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
    // {
    //   path: "/",
    //   redirect: "dashboard",
    // },
    {
      path: "/setup",
      name: "setup",
      alias: "/",
      meta: { title: "Group setup" },
      component: () => import("../views/NoGroupsView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/:groupName",
      name: "dashboard",
      //alias: "/",
      meta: { title: "Group :stationName :tabName" },
      component: () => import("../views/DashboardView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/groups",
      name: "select-active-group",
      component: () => import("../views/SelectActiveGroup.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/:groupName/stations",
      name: "stations",
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () => import("../views/StationsView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/:groupName/search",
      name: "search",
      component: () => import("../views/SearchView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/:groupName/devices",
      name: "devices",
      component: () => import("../views/DevicesView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/:groupName/report",
      name: "report",
      component: () => import("../views/ReportingView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/:groupName/my-settings",
      name: "user-group-settings",
      component: () => import("../views/UserGroupPreferencesView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/:groupName/settings",
      name: "group-settings",
      component: () => import("../views/ManageGroupView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/my-settings",
      name: "user-settings",
      component: () => import("../views/UserPreferencesView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/sign-out",
      name: "sign-out",
      component: () => import("../views/UserPreferencesView.vue"),
      beforeEnter: cancelPendingRequests,
    },

    {
      path: "/sign-in",
      name: "sign-in",
      component: () => import("../views/SignInView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/register",
      name: "register",
      component: () => import("../views/RegisterView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/add-email",
      name: "add-email",
      component: () => import("../views/AddEmailView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/end-user-agreement",
      name: "end-user-agreement",
      component: () => import("../views/UserPreferencesView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/forgot-password",
      name: "forgot-password",
      component: () => import("../views/ForgotPasswordView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/reset-password/:token",
      name: "validate-reset-password",
      component: () => import("../views/ResetPasswordView.vue"),
      beforeEnter: cancelPendingRequests,
    },
    {
      path: "/reset-password",
      name: "reset-password",
      component: () => import("../views/ResetPasswordView.vue"),
      beforeEnter: cancelPendingRequests,
    },
  ],
});

let lastDestination: string | null = null;

router.beforeEach(async (to, from, next) => {
  // Slight wait so that we can break infinite navigation loops while developing.
  if (lastDestination === to.name) {
    debugger;
  }
  lastDestination = (to.name as string) || "";
  //await delayMs(50);
  // NOTE: There are old, probably unused accounts that haven't accepted the current EUA, or added an email address.
  //  We'd like to force them to update their accounts should they ever decide to log in.  Or we could just delete these old
  //  stale accounts?
  if (userIsLoggedIn.value && to.name === "sign-out") {
    await forgetUserOnCurrentDevice();
    userIsLoggedIn.value = false;
    return next({
      name: "sign-in",
    });
  }

  const hasEmail = false;
  const acceptedEUA = false;
  const validatedEmail = false;
  const currentSelectedGroup = { groupName: "foo", id: 1 };

  // Urls that work without being logged in
  const intercepts = [
    "end-user-agreement",
    "add-email",
    "forgot-password",
    "register",
    "sign-in",
    "sign-out",
  ];
  /*
  if (isLoggedIn) {
    if (
      !hasEmail &&
      to.name &&
      to.name !== "add-email"
        //&& !intercepts.includes(to.name as string)
    ) {
      return next({ name: "add-email", params: { nextUrl: to.fullPath } });
    } else if (
      !acceptedEUA &&
      to.name &&
      to.name !== "end-user-agreement"
        //&& !intercepts.includes(to.name as string)
    ) {
      return next({
        name: "end-user-agreement",
        params: { nextUrl: to.fullPath },
      });
    } else {
      if (to.path === "/") {
        if (currentSelectedGroup) {
          return next({
            name: "dashboard",
            params: {
              groupName: currentSelectedGroup.groupName,
            },
          });
        } else {
          return next({
            name: "select-active-group",
          });
        }
      }
      // Go about your regular business.
      return next();
    }
  } else if (to.matched.some((record) => record.meta.noAuth)) {
    return next();
  } else {
    return next({
      name: "sign-in",
      params: {
        nextUrl: to.fullPath,
      },
    });
  }
  */
  /*
  const now = new Date().getTime();

  const euaUpdatedAt = new Date(store.getters["User/euaUpdatedAt"]).getTime();
  // Update latest User Agreement once an hour
  if (now - euaUpdatedAt > 1000 * 60 * 60) {
    await store.dispatch("User/GET_END_USER_AGREEMENT_VERSION");
  }
  const isLoggedIn = store.getters["User/isLoggedIn"];
  const hasEmail = store.getters["User/hasEmail"];
  const acceptedEUA = store.getters["User/acceptedEUA"];
  if (isLoggedIn && hasEmail && acceptedEUA) {
    if (
        ["login", "register", "addEmail", "endUserAgreement"].includes(to.name)
    ) {
      return next({
        name: "home",
      });
    } else {
      return next();
    }
  } else if (isLoggedIn && !hasEmail) {
    if (to.name !== "addEmail") {
      return next({
        name: "addEmail",
      });
    } else {
      return next();
    }
  } else if (isLoggedIn && !acceptedEUA) {
    // FIXME - nextUrl seems busted
    if (to.name !== "endUserAgreement") {
      return next({
        name: "endUserAgreement",
        query: {
          nextUrl: from.fullPath,
        },
      });
    } else {
      return next();
    }
  } else if (to.matched.some((record) => record.meta.noAuth)) {
    return next();
  }

   */

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
