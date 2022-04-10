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
      name: "my-settings",
      component: () => import("../views/UserPreferencesView.vue"),
    },
  ],
});

router.beforeEach(async (to, from, next) => {
  console.log(to, from, next);
  if (to.path === "/") {
    return next({
      name: "dashboard",
      params: {
        groupName: "foo",
      },
    });
  }
  return next();
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
