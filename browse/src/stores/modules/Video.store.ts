/* eslint-disable no-console */
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
  mutations,
};
