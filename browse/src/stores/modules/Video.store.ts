/* eslint-disable no-console */
import api from "@api";
import store from "../index";
import { ApiTrackResponse } from "@typedefs/api/track";

const state = {
  downloadFileJWT: null,
  downloadRawJWT: null,
  fileSize: null,
  rawSize: null,
  recording: null,
  tracks: [],
};

// getters https://vuex.vuejs.org/guide/getters.html

const getters = {
  getTagItems(state) {
    const tags = (state.recording && state.recording.tags) || [];
    const tagItems = [];
    tags.map((tag) => {
      const tagItem: any = {};
      if (tag.what) {
        tagItem.what = tag.what;
      }
      tagItem.detail = tag.detail;
      if (tag.confidence) {
        tagItem.confidence = tag.confidence.toFixed(2);
      }
      if (tag.automatic) {
        tagItem.who = "Cacophony AI";
        tagItem["_rowVariant"] = "warning";
      } else {
        tagItem.who = tag.tagger ? tag.tagger.username : "-";
      }
      tagItem.when = new Date(tag.createdAt).toLocaleString();
      tagItem.tag = tag;
      tagItems.push(tagItem);
    });
    return tagItems;
  },
};

const actions = {
  async QUERY_RECORDING(_, { params, skipMessage }) {
    const { result, success } = await api.recording.query(params);
    if (!success || !result.rows || result.rows.length == 0) {
      if (!skipMessage) {
        store.dispatch("Messaging/WARN", `No more recordings for this search.`);
      }
      return false;
    }
    return store.dispatch("Video/GET_RECORDING", result.rows[0].id);
  },

  async GET_RECORDING({ commit }, recordingId) {
    const tracksPromise = api.recording.tracks(recordingId);
    const recordingPromise = api.recording.id(recordingId);
    const [{ result: recording }, { result: tracks }] = await Promise.all([
      recordingPromise,
      tracksPromise,
    ]);

    commit("receiveRecording", recording);
    commit("receiveTracks", tracks);
    return {
      recording,
      tracks: tracks.tracks,
    };
  },

  async DELETE_TAG({ commit }, tag) {
    const { success } = await api.tag.deleteTag(tag);
    if (success) {
      commit("deleteTag", tag);
    }
  },

  async UPDATE_COMMENT({ commit }, { comment, recordingId }) {
    const { success } = await api.recording.comment(comment, recordingId);
    if (success) {
      commit("updateComment", comment);
    }
  },

  async ADD_TAG({ commit }, { tag, id }) {
    const { success, result } = await api.tag.addTag(tag, id);
    if (!success) {
      return;
    }

    // Add an initial tag to update the UI more quickly.
    const newTag = Object.assign({}, tag);
    newTag.id = result.tagId;
    newTag.createdAt = new Date();
    commit("addTag", newTag);

    // Resync all recording tags from the API.
    const { success: syncSuccess, result: syncResult } = await api.recording.id(
      id
    );
    if (syncSuccess) {
      commit("setTags", syncResult.recording.tags);
    }
  },

  async ADD_TRACK_TAG({ commit }, { tag, recordingId, trackId }) {
    const { success, result } = await api.recording.replaceTrackTag(
      tag,
      recordingId,
      trackId
    );
    if (!success) {
      return;
    }

    // Add an initial tag to update the UI more quickly.
    const newTag = { ...tag };
    newTag.id = Number(result.trackTagId);
    newTag.TrackId = Number(trackId);
    newTag.createdAt = new Date();
    commit("addTrackTag", newTag);

    // Resync all tags for the track from the API.
    const { success: syncSuccess, result: syncResult } =
      await api.recording.tracks(recordingId);
    if (!syncSuccess) {
      return;
    }
    const track = syncResult.tracks.find((track) => track.id === trackId);
    commit("setTrackTags", track);
    return result;
  },

  async DELETE_TRACK_TAG({ commit }, { tag, recordingId }) {
    const result = await api.recording.deleteTrackTag(tag, recordingId);
    if (!result.success) {
      return result;
    }
    commit("deleteTrackTag", tag);
    return result;
  },
};

// mutations https://vuex.vuejs.org/guide/mutations.html
const mutations = {
  receiveRecording(
    state,
    { recording, downloadFileJWT, downloadRawJWT, fileSize, rawSize }
  ) {
    state.recording = recording;
    state.downloadFileJWT = downloadFileJWT;
    state.downloadRawJWT = downloadRawJWT;
    state.fileSize = fileSize;
    state.rawSize = rawSize;
  },

  receiveTracks(state, { tracks }: { tracks: ApiTrackResponse[] }) {
    // FIXME - We shouldn't need this
    tracks.sort((a, b) => a.start - b.start);
    for (let i = 0; i < tracks.length; i++) {
      (tracks[i] as any).trackIndex = i;
      //tracks[i] = Object.freeze(tracks[i].data);
    }
    state.tracks = tracks;
  },

  updateComment(state, comment) {
    state.recording.comment = comment;
  },

  addTag(state, tag) {
    state.recording.Tags.unshift(tag);
  },

  setTags(state, tags) {
    state.recording.Tags = tags;
  },

  deleteTag(state, tagId) {
    state.recording.Tags = state.recording.Tags.filter(
      (tag) => tag.id != tagId
    );
  },

  addTrackTag(state, tag) {
    const track = state.tracks.find((track) => track.id === tag.TrackId);
    if (track) {
      track.TrackTags.push(tag);
    }
  },

  setTrackTags(state, newTrack) {
    const track = state.tracks.find((track) => track.id === newTrack.id);
    if (track) {
      track.TrackTags = newTrack.TrackTags;
    }
  },

  deleteTrackTag(state, deletedTag) {
    const track = state.tracks.find((track) => track.id === deletedTag.TrackId);
    if (track) {
      track.TrackTags = track.TrackTags.filter(
        (tag) => tag.id != deletedTag.id
      );
    }
  },
};

export default {
  namespaced: true,
  state,
  getters,
  actions,
  mutations,
};
