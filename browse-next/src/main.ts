import "bootstrap/dist/css/bootstrap.css";
import "bootstrap-vue-next/dist/bootstrap-vue-next.css";
import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import { createBootstrap } from "bootstrap-vue-next";
import FontAwesomeIcon from "./font-awesome-icons";
import materialSymbolsPlugin from "@dbetka/vue-material-symbols";
import "material-symbols/index.css";
import {
  currentSelectedProject,
  currentUser,
  selectedProjectDevices,
  urlNormalisedCurrentSelectedProjectName,
  userIsLoggedIn,
  userIsProjectAdmin,
  userProjects,
  userHasProjects,
  allHistoricLocations,
} from "@models/provides";
import {
  currentSelectedProject as fallibleCurrentSelectedProject,
  DevicesForCurrentProject,
  urlNormalisedCurrentProjectName,
  userIsAdminForCurrentSelectedProject,
  userIsLoggedIn as hasLoggedInUser,
  userHasProjects as hasProjects,
  UserProjects,
  LocationsForCurrentProject,
} from "@models/LoggedInUser";
import { CurrentUser } from "@/api";

const app = createApp(App);
app.component("font-awesome-icon", FontAwesomeIcon);
app.use(router);
app.use(createBootstrap());
app.use(materialSymbolsPlugin);

app.provide(selectedProjectDevices, DevicesForCurrentProject);
app.provide(allHistoricLocations, LocationsForCurrentProject);
app.provide(currentSelectedProject, fallibleCurrentSelectedProject);
app.provide(
  urlNormalisedCurrentSelectedProjectName,
  urlNormalisedCurrentProjectName,
);
app.provide(currentUser, CurrentUser);
app.provide(userIsProjectAdmin, userIsAdminForCurrentSelectedProject);
app.provide(userIsLoggedIn, hasLoggedInUser);
app.provide(userProjects, UserProjects);
app.provide(userHasProjects, hasProjects);

app.mount("#app");
