<template>
  <b-container class="tracklist-container">
    <b-row>
      <h2 class="classification-header">Classification</h2>
    </b-row>
    <b-col class="p-0">
      <b-row
        class="classification-item p-0"
        v-for="track in tracks"
        :key="track.id"
      >
        <b-col class="p-0" v-if="!track.deleted">
          <b-row>
            <b-col
              cols="10"
              v-on:click="() => playTrack(track)"
              class="track-container"
            >
              <b-row>
                <b-col class="d-flex justify-content-center pr-0" cols="2">
                  <span
                    :class="{
                      highlight: selectedTrack && selectedTrack.id === track.id,
                      'track-colour': true,
                    }"
                    :style="{ background: `${track.colour}` }"
                  ></span>
                </b-col>
                <b-col>
                  <b-row class="align-items-center justify-content-between">
                    <h4 class="track-time m-0">
                      Time: {{ track.start.toFixed(1) }} -
                      {{ track.end.toFixed(1) }} (Δ{{
                        (track.end - track.start).toFixed(1)
                      }}s)
                    </h4>
                    <div class="d-flex align-items-center">
                      <b-button
                        v-if="
                          track.displayTags.some(
                            (tag) =>
                              tag.class === 'automatic' ||
                              (tag.class === 'confirmed' &&
                                !track.tags.some(
                                  (t) => t.userName === userName
                                ))
                          )
                        "
                        variant="outline-success"
                        size="sm"
                        @click.stop.prevent="() => confirmTrack(track)"
                      >
                        <b-spinner
                          v-if="track.confirming"
                          variant="success"
                          small
                        />
                        <font-awesome-icon v-else icon="thumbs-up" />
                        <span>Confirm</span>
                      </b-button>
                    </div>
                  </b-row>
                  <b-row class="tags-container">
                    <div
                      v-for="tag in track.displayTags"
                      :key="tag.id"
                      class="
                        capitalize
                        text-white
                        d-flex
                        align-items-center
                        p-0
                        pl-2
                        pr-2
                        mr-1
                        rounded
                      "
                      :class="{
                        ['ai-tag']:
                          tag.class === 'denied' || tag.class === 'automatic',
                        ['aihuman-tag']: tag.class === 'confirmed',
                        ['human-tag']: tag.class === 'human',
                      }"
                      v-b-tooltip.hover
                      :title="`${
                        tag.class === 'human'
                          ? 'Tagged by human'
                          : tag.class === 'automatic' || tag.class === 'denied'
                          ? 'Tagged by Cacophony AI'
                          : tag.class === 'confirmed'
                          ? 'Tagged by Cacophony AI and human'
                          : ''
                      }`"
                    >
                      <font-awesome-icon
                        v-if="['denied', 'automatic'].includes(tag.class)"
                        icon="cog"
                        size="xs"
                      />
                      <font-awesome-icon
                        v-else-if="tag.class === 'human'"
                        icon="user"
                        size="xs"
                      />
                      <font-awesome-icon
                        v-else-if="tag.class === 'confirmed'"
                        icon="user-cog"
                        size="xs"
                      />
                      <span class="pl-1">
                        {{ tag.what }}
                      </span>
                    </div>
                  </b-row>
                </b-col>
              </b-row>
            </b-col>
            <b-col
              cols="2"
              class="track-container-side d-flex justify-content-end"
            >
              <b-dropdown
                lazy
                class="track-settings-button"
                right
                toggle-class="text-decoration-none"
                no-caret
              >
                <template #button-content>
                  <font-awesome-icon icon="cog" />
                </template>
                <b-dropdown-item
                  @click.stop.prevent="() => deleteTrack(track.id)"
                >
                  <div class="text-danger">
                    <font-awesome-icon icon="trash" />
                    delete
                  </div>
                </b-dropdown-item>
              </b-dropdown>
            </b-col>
          </b-row>
          <b-row>
            <b-col>
              <div
                v-b-toggle="`tag-history-${track.id}`"
                class="tag-history-toggle"
                @click="
                  () => {
                    if (toggledTrackHistory.includes(track.id)) {
                      toggledTrackHistory = toggledTrackHistory.filter(
                        (id) => id !== track.id
                      );
                    } else {
                      toggledTrackHistory.push(track.id);
                    }
                  }
                "
              >
                <h4>Tag History</h4>
                <font-awesome-icon
                  icon="angle-up"
                  v-if="toggledTrackHistory.includes(track.id)"
                />
                <font-awesome-icon
                  icon="angle-down"
                  class="when-closed"
                  v-else
                />
              </div>
              <!-- Table using html -->
              <table
                v-if="toggledTrackHistory.includes(track.id)"
                class="tag-history-table"
              >
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Who</th>
                    <th>Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="tag in track.tags" :key="tag.id">
                    <td>{{ tag.what }}</td>
                    <td>
                      {{
                        tag.userName
                          ? tag.userName
                          : typeof tag.data === "object" && "AI"
                      }}
                    </td>
                    <td>{{ tag.confidence }}</td>
                  </tr>
                </tbody>
              </table>
            </b-col>
          </b-row>
        </b-col>
        <b-col class="d-flex align-items-center justify-content-center" v-else>
          <b-row
            @click="() => undoDeleteTrack(track.id)"
            class="undo-button justify-content-center align-items-center"
          >
            <h2 class="pr-2">Undo Deletion</h2>
            <font-awesome-icon class="mb-2" icon="undo" />
          </b-row>
        </b-col>
      </b-row>
    </b-col>
    <b-row class="w-100 d-flex justify-content-center m-0">
      <h4 class="select-track-message" v-if="tracks.length === 0">
        Select section of Audio by pressing and dragging...
      </h4>
    </b-row>
  </b-container>
</template>

<script lang="ts">
import { PropType } from "vue";
import { defineComponent, ref, watch } from "@vue/composition-api";

import { useState } from "@/utils";

import { AudioTrack, AudioTracks } from "../Video/AudioRecording.vue";

import { TrackId } from "@typedefs/api/common";

import store from "@/stores";

enum TrackListFilter {
  All = "all",
  Automatic = "automatic",
  Manual = "manual",
  Unconfirmed = "unconfirmed",
}

export default defineComponent({
  name: "TrackList",
  props: {
    audioTracks: {
      type: Map as PropType<AudioTracks>,
      required: true,
    },
    selectedTrack: {
      type: Object as PropType<AudioTrack | null>,
    },
    deleteTrack: {
      type: Function as PropType<(track: TrackId) => void>,
      required: true,
    },
    undoDeleteTrack: {
      type: Function as PropType<(track: TrackId) => void>,
      required: true,
    },
    addTagToTrack: {
      type: Function as PropType<
        (trackId: TrackId, what: string) => Promise<AudioTrack>
      >,
      required: true,
    },
    playTrack: {
      type: Function as PropType<(track: AudioTrack) => void>,
      required: true,
    },
  },
  setup(props) {
    const confirmTrack = async (track: AudioTrack) => {
      const tag = track.tags.find((t) => t.automatic);
      if (!tag) {
        return;
      }
      await props.addTagToTrack(track.id, tag.what);
    };
    const toggledTrackHistory = ref<TrackId[]>([]);
    //TODO: Add filtering tracks
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [filter] = useState<TrackListFilter>(TrackListFilter.All);
    const filterTracks = (track: AudioTrack) => {
      switch (filter.value) {
        case TrackListFilter.All:
          return true;
        case TrackListFilter.Automatic:
          return track.displayTags.some((tag) => tag.class === "automatic");
        case TrackListFilter.Manual:
          return track.displayTags.some((tag) => tag.class === "human");
        default:
          return false;
      }
    };
    const sortTracks = (trackA: AudioTrack, trackB: AudioTrack) => {
      return trackA.start - trackB.start;
    };
    const [tracks, setTracks] = useState<AudioTrack[]>(
      [...props.audioTracks.values()].filter(filterTracks).sort(sortTracks)
    );
    watch(
      () => props.audioTracks,
      (newTracks) => {
        setTracks(
          [...newTracks.values()].filter(filterTracks).sort(sortTracks)
        );
      }
    );

    return {
      userName: store.state.User.userData.userName,
      tracks,
      toggledTrackHistory,
      confirmTrack,
      filter,
      filterTracks,
      sortTracks,
    };
  },
});
</script>

<style lang="scss">
@import "src/styles/tag-colours";

.collapsed > .when-open,
.not-collapsed > .when-closed {
  display: none;
}

.classification-container {
  padding-left: 0px;
  padding-right: 0em;
}

.classification-item {
  min-height: 90px;
}

.tag-history-toggle {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid #f1f1f1;
  margin-bottom: 8px;
  width: 100%;
  cursor: pointer;
}

.tag-history-toggle > h4 {
  font-weight: 800;
  color: #272e39;
}

.track-container {
  cursor: pointer;
}

.select-track-message {
  color: #727272;
  font-size: 1rem;
  font-weight: 600;
  text-align: center;
  max-width: 16em;
  margin-top: 0.8em;
  margin-bottom: 1em;
}

.track-settings-button {
  button {
    background: none;
    border: none;
    color: #727272;
    &:hover {
      background: none;
      color: #95a5a6;
    }
  }
}
.confirmed-text {
  display: flex;
  align-items: center;
  color: $ai;
  font-size: 0.875rem;
}
.capitalize {
  text-transform: capitalize;
}
.human-tag {
  background-color: $human !important;
}
.ai-tag {
  background-color: $ai !important;
}
.aihuman-tag {
  background-color: $aihuman !important;
}
.tag-history-table {
  width: 100%;
  border-collapse: collapse;
  border-spacing: 0;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid #f1f1f1;
  margin-bottom: 1em;
}
.tags-container {
  display: flex;
  flex-wrap: wrap;
  margin-top: 0.5em;
  margin-bottom: 0.5em;
  gap: 0.3em;
}
</style>
