import "bootstrap/dist/css/bootstrap.css";
import "bootstrap-vue-3/dist/bootstrap-vue-3.css";
import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import BootstrapVue3 from "bootstrap-vue-3";
import FontAwesomeIcon from "./font-awesome-icons";
import { BToastPlugin } from "bootstrap-vue-3";
import {
  currentSelectedProject,
  currentUser,
  currentUserCreds,
  selectedProjectDevices,
  urlNormalisedCurrentSelectedProjectName,
  userIsLoggedIn,
  userIsProjectAdmin,
  userProjects,
  userHasProjects,
} from "@models/provides";
import {
  currentSelectedProject as fallibleCurrentSelectedProject,
  CurrentUser,
  CurrentUserCreds,
  DevicesForCurrentProject,
  urlNormalisedCurrentProjectName,
  userIsAdminForCurrentSelectedProject,
  userIsLoggedIn as hasLoggedInUser,
  userHasProjects as hasProjects,
  UserProjects,
} from "@models/LoggedInUser";

const app = createApp(App);
app.component("font-awesome-icon", FontAwesomeIcon);
app.use(router);
app.use(BootstrapVue3);
app.use(BToastPlugin);

app.provide(selectedProjectDevices, DevicesForCurrentProject);
app.provide(currentSelectedProject, fallibleCurrentSelectedProject);
app.provide(
  urlNormalisedCurrentSelectedProjectName,
  urlNormalisedCurrentProjectName
);
app.provide(currentUser, CurrentUser);
app.provide(currentUserCreds, CurrentUserCreds);
app.provide(userIsProjectAdmin, userIsAdminForCurrentSelectedProject);
app.provide(userIsLoggedIn, hasLoggedInUser);
app.provide(userProjects, UserProjects);
app.provide(userHasProjects, hasProjects);

app.mount("#app");
