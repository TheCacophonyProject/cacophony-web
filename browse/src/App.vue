<template>
  <div id="app" :class="{ 'viewing-as-admin': isViewingAsOtherUser() }">
    <global-messaging />
    <nav-bar v-if="isLoggedIn" />
    <router-view class="view" />
  </div>
</template>

<script lang="ts">
import store from "./stores";
import NavBar from "./components/NavBar.vue";
import GlobalMessaging from "./components/GlobalMessaging.vue";
import api from "./api";

export default {
  name: "App",
  components: {
    NavBar,
    GlobalMessaging,
  },
  computed: {
    isLoggedIn() {
      return store.getters["User/isLoggedIn"];
    },
  },
  methods: {
    superUserCreds() {
      let superUserCreds = localStorage.getItem("superUserCreds");
      if (superUserCreds) {
        try {
          superUserCreds = JSON.parse(superUserCreds);
          return superUserCreds;
        } catch (e) {
          return false;
        }
      }
      return false;
    },
    isViewingAsOtherUser() {
      const superUserCreds = this.superUserCreds();
      return !!(
        superUserCreds &&
        superUserCreds.token &&
        superUserCreds.token !== localStorage.getItem("JWT")
      );
    },
  },
  async mounted() {
    if (this.isLoggedIn) {
      // Refresh the user's details
      const res = await api.user.getUserDetails(localStorage.getItem("userId"));
      if (res.success) {
        api.user.persistFields({
          userName: res.result.userData.userName,
          email: res.result.userData.email,
        });
      }
    }
  },
};
</script>

<style lang="scss">
#app {
  display: flex;
  flex-direction: column;
  min-height: 100svh;
  --navbar-height: 65px;
  &.viewing-as-admin {
    --navbar-height: 99px;
  }

  text-rendering: optimizeLegibility;
  font-feature-settings: "kern" 1;
  -moz-font-feature-settings: "kern";
  -moz-font-feature-settings: "kern=1";
  font-kerning: normal;
}
.view {
  flex-grow: 1;
}
</style>
