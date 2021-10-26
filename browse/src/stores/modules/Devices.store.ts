import api from "@api";

const state = {
  devices: [],
  currentDevice: null,
  fetched: false,
};

const getters = {};

async function _getDevice(devicename, commit) {
  const response = await api.device.getDevices();
  if (response.success) {
    const device = response.result.devices.find(
      (device) => device.deviceName === devicename
    );
    commit("setCurrentDevice", device);
  } else {
    // FIXME
  }
}

const actions = {
  async GET_DEVICES({ commit }) {
    commit("fetching");
    const response = await api.device.getDevices();
    if (response.success) {
      commit("receiveDevices", response.result.devices);
    } else {
      // FIXME
    }
    commit("fetched");
  },

  async GET_DEVICE({ commit }, devicename) {
    commit("fetching");
    await _getDevice(devicename, commit);
    commit("fetched");
  },

  async ADD_USER({ commit }, { userName, device, admin }) {
    const { success } = await api.device.addUserToDevice(
      userName,
      device.id,
      admin
    );

    if (!success) {
      return false;
    } else {
      await _getDevice(device.deviceName, commit);
      // FIXME: A bunch of different components all rely on this fetched state.
      //  Modal to add user to device in admin area is only dismissed when fetching is true
      commit("fetching");
      setTimeout(() => {
        commit("fetched");
      }, 10);
    }
  },

  async REMOVE_USER({ commit }, { userName, device }) {
    commit("fetching");
    await api.device.removeUserFromDevice(userName, device.id);
    await _getDevice(device.devicename, commit);
    commit("fetched");
  },
};

const mutations = {
  receiveDevices(state, devices) {
    state.devices = devices;
  },
  setCurrentDevice(state, device) {
    state.currentDevice = device;
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
