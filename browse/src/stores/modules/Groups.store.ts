import api from "@api";
import { ApiGroupResponse } from "@typedefs/api/group";

const state: {
  groups: ApiGroupResponse[];
  currentGroup: ApiGroupResponse | null;
  fetched: boolean;
} = {
  groups: [],
  currentGroup: null,
  fetched: false,
};

const getters = {};

async function _getGroup(groupName, commit) {
  const response = await api.groups.getGroup(groupName);
  if (response.success) {
    const { result } = response;
    const group = result.group;
    commit("setCurrentGroup", group);

    // FIXME - Not sure this should be here
    commit("receiveGroups", result.group);
  } else {
    // FIXME
  }
}

const actions = {
  async GET_GROUPS({ commit }) {
    commit("fetching");
    const response = await api.groups.getGroups();
    if (response.success) {
      commit("receiveGroups", response.result.groups);
    } else {
      // FIXME
    }
    commit("fetched");
  },

  async GET_GROUP({ commit }, groupname) {
    commit("fetching");
    await _getGroup(groupname, commit);
    commit("fetched");
  },

  async ADD_GROUP_USER({ commit, state }, { groupName, userName, isAdmin }) {
    const { success } = await api.groups.addGroupUser(
      groupName,
      userName,
      isAdmin
    );
    if (!success) {
      return false;
    } else {
      await _getGroup(state.currentGroup.groupname, commit);
      // FIXME: A bunch of different components all rely on this fetched state.
      //  Modal to add user to group in admin area is only dismissed when fetching is true
      commit("fetching");
      setTimeout(() => {
        commit("fetched");
      }, 10);
    }
  },

  async REMOVE_GROUP_USER({ commit, state }, { groupName, userName }) {
    commit("fetching");
    await api.groups.removeGroupUser(groupName, userName);
    await _getGroup(state.currentGroup.groupname, commit);
    commit("fetched");
  },
};

const mutations = {
  receiveGroups(state, groups) {
    state.groups = groups;
  },
  setCurrentGroup(state, currentGroup) {
    state.currentGroup = currentGroup;
  },
  fetching(state) {
    state.fetched = false;
  },
  fetched(state) {
    state.fetched = true;
  },
};

export default {
  namespaced: true,
  state,
  getters,
  actions,
  mutations,
};
