<template>
  <b-container>
    <b-col>
      <b-row>
        <h2 class="classification-header">Classification List:</h2>
      </b-row>
      <b-row>
        <h3 class="track-header">Automatic Tracks:</h3>
      </b-row>
      <b-row v-for="track in automaticTracks" :key="track.id">
        <b-col>
          <b-row v-on:click="playTrack(track)" class="track-container">
            <span
              class="track-colour"
              :style="{ background: `${track.colour}` }"
            ></span>
            <b-col>
              <b-row class="align-items-center justify-content-between">
                <h4 class="track-time m-0">
                  Time: {{ track.start }} - {{ track.end }} (Δ{{
                    (track.end - track.start).toFixed(1)
                  }}s)
                </h4>
                <div>
                  <b-dropdown
                    class="track-settings-button"
                    toggle-class="text-decoration-none"
                    no-caret
                  >
                    <template #button-content>
                      <font-awesome-icon icon="cog" />
                    </template>
                    <b-dropdown-item
                      class="track-delete-button"
                      @click="deleteTrack(track)"
                    >
                      <font-awesome-icon icon="trash" />
                      delete
                    </b-dropdown-item>
                  </b-dropdown>
                </div>
              </b-row>
              <b-row
                v-if="track.tags && track.tags[0]"
                class="d-flex justify-content-between align-items-center"
              >
                <h3>
                  {{ track.tags[0] ? track.tags[0].what : "..." }}
                </h3>
                <h4>
                  By:
                  {{
                    track.tags[0].data.name
                      ? track.tags[0].data.name
                      : track.tags[0].userName
                  }}
                </h4>
              </b-row>
            </b-col>
          </b-row>
          <b-row>
            <b-container
              v-b-toggle="`tag-history-${track.id}`"
              class="tag-history-toggle"
            >
              <h4>Tag History</h4>
              <font-awesome-icon icon="angle-up" class="when-open" />
              <font-awesome-icon icon="angle-down" class="when-closed" />
            </b-container>
            <b-collapse :id="`tag-history-${track.id}`">
              <b-table
                class="text-center"
                :items="track.tags"
                :fields="['what', 'who', 'confidence']"
              >
                <template #cell(who)="data">{{
                  data.item.data.name ? data.item.data.name : data.item.userName
                }}</template>
              </b-table>
            </b-collapse>
          </b-row>
        </b-col>
      </b-row>
      <b-row class="mt-2">
        <h3 class="track-header">Manual Tracks:</h3>
      </b-row>
      <h4 class="select-track-message" v-if="manualTracks.length === 0">
        Select section of Audio by pressing and dragging...
      </h4>
      <b-row v-for="track in manualTracks" :key="track.id">
        <b-col>
          <b-row v-on:click="playTrack(track)" class="track-container">
            <span
              class="track-colour"
              :style="{ background: `${track.colour}` }"
            ></span>
            <b-col>
              <b-row class="align-items-center justify-content-between">
                <h4 class="track-time">
                  Time: {{ track.start }} - {{ track.end }} (Δ{{
                    (track.end - track.start).toFixed(1)
                  }}s)
                </h4>
                <div>
                  <b-dropdown
                    class="track-settings-button"
                    toggle-class="text-decoration-none"
                    no-caret
                  >
                    <template #button-content>
                      <font-awesome-icon icon="cog" />
                    </template>
                    <b-dropdown-item
                      class="track-delete-button"
                      @click="deleteTrack(track)"
                    >
                      <font-awesome-icon icon="trash" />
                      delete
                    </b-dropdown-item>
                  </b-dropdown>
                </div>
              </b-row>
              <b-row
                v-if="track.tags && track.tags[0]"
                class="d-flex justify-content-between align-items-center"
              >
                <h3>
                  {{
                    track.tags[0].what ? track.tags[0].what : "Select Tag..."
                  }}
                </h3>
                <h4>
                  By:
                  {{
                    track.tags[0].data.name
                      ? track.tags[0].data.name
                      : track.tags[0].userName
                  }}
                </h4>
              </b-row>
              <b-row v-else>
                <h3>No Tag...</h3>
              </b-row>
            </b-col>
          </b-row>
          <b-row>
            <b-container
              v-b-toggle="`tag-history-${track.id}`"
              class="tag-history-toggle"
            >
              <h4>Tag History</h4>
              <font-awesome-icon icon="angle-up" class="when-open" />
              <font-awesome-icon icon="angle-down" class="when-closed" />
            </b-container>
            <b-collapse :id="`tag-history-${track.id}`">
              <b-table
                class="text-center"
                :items="track.tags"
                :fields="['what', 'who', 'confidence']"
              >
                <template #cell(who)="data">{{
                  data.item.userName ? data.item.userName : "Unknown"
                }}</template>
              </b-table>
            </b-collapse>
          </b-row>
        </b-col>
      </b-row>
    </b-col>
  </b-container>
</template>

<script lang="ts">
import Vue, { PropType } from "vue";
import { AudioTrack } from "../Video/AudioRecording.vue";
export default Vue.extend({
  name: "TrackList",
  props: {
    tracks: {
      type: Array as PropType<AudioTrack[]>,
      required: true,
    },
    playTrack: {
      type: Function as PropType<(track: AudioTrack) => void>,
      required: true,
    },
    deleteTrack: {
      type: Function as PropType<(track: AudioTrack) => void>,
      required: true,
    },
  },
  computed: {
    automaticTracks() {
      return this.tracks.filter(
        (track: { automatic: boolean }) => track.automatic
      );
    },
    manualTracks() {
      return this.tracks.filter(
        (track: { automatic: boolean }) => !track.automatic
      );
    },
  },
  methods: {},
});
</script>

<style lang="scss">
.collapsed > .when-open,
.not-collapsed > .when-closed {
  display: none;
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
}

.track-settings-button {
  z-index: 10;
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
.track-delete-button {
  ul {
    color: #e74c3c;
  }
}
</style>
