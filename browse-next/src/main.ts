import "bootstrap/dist/css/bootstrap.css";
import "bootstrap-vue-3/dist/bootstrap-vue-3.css";
import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import BootstrapVue3 from "bootstrap-vue-3";
import FontAwesomeIcon from "./font-awesome-icons";
import { BToastPlugin } from "bootstrap-vue-3";

const app = createApp(App);
app.component("font-awesome-icon", FontAwesomeIcon);
app.use(router);
app.use(BootstrapVue3);
app.use(BToastPlugin);

app.mount("#app");
