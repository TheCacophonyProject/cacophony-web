import Vue from "vue";
import Vuex from "vuex";
import User from "./modules/User.store";
import Video from "./modules/Video.store";
import Messaging from "./modules/Messaging.store";

Vue.use(Vuex);
const store = new Vuex.Store<{ User; Groups; Messaging; Video; Devices }>({
  modules: {
    User,
    Messaging,
    Video,
  },
});
export default store;
