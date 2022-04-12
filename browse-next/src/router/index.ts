import { createRouter, createWebHistory } from "vue-router";
import DashBoardView from "../views/DashboardView.vue";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/:groupName",
      name: "dashboard",
      meta: { title: "Group :stationName :tabName" },
      component: DashBoardView,
    },
    {
      path: "/groups",
      name: "select-active-group",
      component: () => import("../views/SelectActiveGroup.vue"),
    },
    {
      path: "/:groupName/stations",
      name: "stations",
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () => import("../views/StationsView.vue"),
    },
    {
      path: "/:groupName/search",
      name: "search",
      component: () => import("../views/SearchView.vue"),
    },
    {
      path: "/:groupName/devices",
      name: "devices",
      component: () => import("../views/DevicesView.vue"),
    },
    {
      path: "/:groupName/report",
      name: "report",
      component: () => import("../views/ReportingView.vue"),
    },
    {
      path: "/:groupName/my-settings",
      name: "user-group-settings",
      component: () => import("../views/UserGroupPreferencesView.vue"),
    },
    {
      path: "/:groupName/settings",
      name: "group-settings",
      component: () => import("../views/ManageGroupView.vue"),
    },
    {
      path: "/my-settings",
      name: "user-settings",
      component: () => import("../views/UserPreferencesView.vue"),
    },
    {
      path: "/sign-out",
      name: "sign-out",
      component: () => import("../views/UserPreferencesView.vue"),
    },

    {
      path: "/sign-in",
      name: "sign-in",
      component: () => import("../views/UserPreferencesView.vue"),
    },
    {
      path: "/register",
      name: "register",
      component: () => import("../views/UserPreferencesView.vue"),
    },
    {
      path: "/add-email",
      name: "add-email",
      component: () => import("../views/UserPreferencesView.vue"),
    },
    {
      path: "/end-user-agreement",
      name: "end-user-agreement",
      component: () => import("../views/UserPreferencesView.vue"),
    },
  ],
});

router.beforeEach(async (to, from, next) => {
  const isLoggedIn = true;

  // NOTE: There are old, probably unused accounts that haven't accepted the current EUA, or added an email address.
  //  We'd like to force them to update their accounts should they ever decide to log in.  Or we could just delete these old
  //  stale accounts?

  const hasEmail = true;
  const acceptedEUA = false;
  const validatedEmail = false;
  const currentSelectedGroup = { groupName: "foo", id: 1 };
  const intercepts = ["end-user-agreement", "add-email"];
  console.log(to, from, next);

  /*
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
  next({
    path: "/login",
    query: {
      nextUrl: to.fullPath,
    },
  });
   */
});

export default router;
