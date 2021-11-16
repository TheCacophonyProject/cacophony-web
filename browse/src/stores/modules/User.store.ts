import api from "@api";
import { ApiLoggedInUserResponse } from "@typedefs/api/user";

function getUserFromLocalStorage() {
  return {
    id: Number(localStorage.getItem("userId")),
    userName: localStorage.getItem("userName"),
    email: localStorage.getItem("email"),
    globalPermission: getGlobalPermission(),
    isSuperUser: isSuperUser(),
    acceptedEUA: localStorage.getItem("acceptedEUA"),
  };
}

const state = {
  isLoggingIn: false,
  didInvalidate: false,
  JWT: localStorage.getItem("JWT"),
  userData: getUserFromLocalStorage(),
  latestEUA: localStorage.getItem("latestEUA"),
  euaUpdatedAt: localStorage.getItem("euaUpdatedAt"),
  errorMessage: undefined,
  recordingTypePref: localStorage.getItem("recordingTypePref") || "both",
  analysisDatePref: parseInt(localStorage.getItem("analysisDatePref")) || 7,
};

function getGlobalPermission() {
  const globalPermission = localStorage.getItem("globalPermission");
  if (["write", "read", "off"].includes(globalPermission)) {
    return globalPermission;
  }
  return "off";
}

function isSuperUser() {
  return getGlobalPermission() === "write";
}
// getters https://vuex.vuejs.org/guide/getters.html

const getters = {
  isLoggedIn: (state) => !!state.JWT,
  getToken: (state) => state.JWT,
  hasEmail: (state) => !!state.userData.email && state.userData.email != "null",
  acceptedEUA: (state) => state.userData.acceptedEUA >= state.latestEUA,
  euaUpdatedAt: (state) => state.euaUpdatedAt,
};

// actions https://vuex.vuejs.org/guide/actions.html
//Actions are similar to mutations, the differences being that:
//
//	Instead of mutating the state, actions commit mutations.
//	Actions can contain arbitrary asynchronous operations.

const actions = {
  async LOGIN({ commit }, payload) {
    commit("invalidateLogin");
    const loginResponse = await api.user.login(
      payload.username,
      payload.password
    );
    if (loginResponse.success) {
      const {
        result: { userData, token },
      } = loginResponse;
      // eslint-disable-next-line no-unused-vars,@typescript-eslint/no-unused-vars
      if (userData.globalPermission === "write") {
        // Persist super user settings so that we can switch user views.
        localStorage.setItem(
          "superUserCreds",
          JSON.stringify({ ...userData, token })
        );
      }
      api.user.persistUser(
        userData.userName,
        token,
        userData.email,
        userData.globalPermission,
        userData.id,
        userData.endUserAgreement
      );
      commit("receiveLogin", { userData, token });
    }
    return loginResponse;
  },
  async CHANGE_PASSWORD({ commit }, payload) {
    const changePasswordResponse = await api.user.changePassword(
      payload.token,
      payload.password
    );
    commit("invalidateLogin");
    if (changePasswordResponse.success) {
      const { result } = changePasswordResponse;
      api.user.persistUser(
        result.userData.userName,
        result.token,
        result.userData.email,
        result.userData.globalPermission,
        result.userData.id,
        result.userData.endUserAgreement
      );
      (result.userData as any).acceptedEUA = result.userData.endUserAgreement;
      commit("receiveLogin", result);
    }
    return changePasswordResponse;
  },
  async LOGIN_OTHER({ commit }, result) {
    api.user.persistUser(
      result.userData.userName,
      result.token,
      result.userData.email,
      result.userData.globalPermission,
      result.userData.id,
      result.userData.endUserAgreement
    );
    commit("receiveLogin", result);
  },
  LOGOUT(context) {
    context.commit("invalidateLogin");
    api.user.logout();
  },
  async REGISTER({ commit, state }, payload) {
    const { result, success } = await api.user.register(
      payload.username,
      payload.password,
      payload.email,
      state.latestEUA
    );
    if (success) {
      api.user.persistUser(
        result.userData.userName,
        result.token,
        result.userData.email,
        result.userData.globalPermission,
        result.userData.id,
        result.userData.endUserAgreement
      );
      result.userData.acceptedEUA = result.userData.endUserAgreement;
      commit("receiveLogin", result);
    }
  },
  async UPDATE({ commit }, payload) {
    const { result, success } = await api.user.updateFields(payload);
    if (success) {
      api.user.persistFields(payload);
      commit("updateFields", payload);
      return true;
    } else {
      commit("rejectUpdate", result);
      return false;
    }
  },
  async ACCEPT_END_USER_AGREEMENT({ commit, state }) {
    const { result, success } = await api.user.updateFields({
      endUserAgreement: state.latestEUA,
    });
    if (success) {
      const updateFields = { acceptedEUA: state.latestEUA };
      api.user.persistFields(updateFields);
      commit("updateFields", updateFields);
      return true;
    } else {
      commit("rejectUpdate", result);
      return false;
    }
  },
  async GET_END_USER_AGREEMENT_VERSION({ commit }) {
    const { result, success } = await api.user.getEUAVersion();
    if (success) {
      api.user.persistFields({ latestEUA: result.euaVersion });
      commit("updateLatestEUA", result.euaVersion);
      return true;
    } else {
      commit("rejectUpdate", result);
      return false;
    }
  },
};

// mutations https://vuex.vuejs.org/guide/mutations.html
const mutations = {
  invalidateLogin(state) {
    state.JWT = "";
    localStorage.removeItem("superUserCreds");
  },
  rejectLogin(state, data) {
    state.JWT = "";
    localStorage.removeItem("superUserCreds");
    state.errorMessage = data.messages || data.message;
  },
  receiveLogin(
    state,
    { userData, token }: { userData: ApiLoggedInUserResponse; token: string }
  ) {
    state.JWT = token;
    state.userData = getUserFromLocalStorage();
    state.userData.acceptedEUA = userData.endUserAgreement;
  },
  updateFields(state, data) {
    for (const key in data) {
      state.userData[key] = data[key];
    }
  },
  updateLatestEUA(state, latestEUA) {
    const now = new Date();
    state.euaUpdatedAt = now.toISOString();
    localStorage.setItem("euaUpdatedAt", now.toISOString());
    state.latestEUA = latestEUA;
    localStorage.setItem("latestEUA", latestEUA);
  },
  rejectUpdate(state, response) {
    state.errorMessage = response.message;
  },
  updateRecordingTypePref(state, data) {
    state.recordingTypePref = data;
    localStorage.setItem("recordingTypePref", data);
  },
  updateAnalysisDatePref(state, data) {
    state.analysisDatePref = data;
    localStorage.setItem("analysisDatePref", data);
  },
};

export default {
  namespaced: true, // If true access via this.$store.getters['User.isLoggedIn'] syntax
  state,
  getters,
  actions,
  mutations,
};
