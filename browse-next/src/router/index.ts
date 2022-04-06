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

export default router;
