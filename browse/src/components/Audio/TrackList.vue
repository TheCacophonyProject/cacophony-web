<template>
  <b-container class="p-0">
    <h2 class="classification-header">Classification List:</h2>
    <h3 class="track-header">Automatic Tracks:</h3>
    <b-row v-for="track in automaticTracks" :key="track.id">
      <b-col>
        <b-row v-on:click="selectTrack(track)" class="track-container">
          <span
            class="track-colour"
            :style="{ background: `${track.colour}` }"
          ></span>
          <b-col>
            <b-row>
              <h4 class="track-time">
                Time: {{ track.start }} - {{ track.end }} (Δ{{
                  track.end - track.start
                }}s)
              </h4>
            </b-row>
            <b-row class="d-flex justify-content-between align-items-center">
              <h3>
                {{ track.correctTag.what }}
              </h3>
              <h4>By: AI Master</h4>
            </b-row>
          </b-col>
        </b-row>
        <b-row>
          <div
            v-b-toggle="`tag-history-${track.id}`"
            class="tag-history-toggle"
          >
            <h4>Tag History</h4>
            <font-awesome-icon icon="angle-up" class="when-open" />
            <font-awesome-icon icon="angle-down" class="when-closed" />
          </div>
          <b-collapse class="w-100" :id="`tag-history-${track.id}`">
            <b-table
              :items="track.tags"
              :fields="['what', 'who', 'confidence']"
            ></b-table>
          </b-collapse>
        </b-row>
      </b-col>
    </b-row>
  </b-container>
</template>

<script lang="ts">
import Vue, { PropType } from "vue";
import { ApiTrackResponse } from "@typedefs/api/track";
import { TagColours } from "@/const";
export default Vue.extend({
  name: "TrackList",
  props: {
    tracks: {
      type: Array as PropType<ApiTrackResponse[]>,
      required: true,
    },
    selectTrack: {
      type: Function as PropType<(id: number) => void>,
      required: true,
    },
  },
  computed: {
    modifiedTracks() {
      return this.tracks.map((track: ApiTrackResponse, index: number) => {
        const correctTag = track.tags.find(
          (tag) => tag.automatic && tag.data.name === "Master"
        );
        return {
          ...track,
          start: track.start.toFixed(1),
          end: track.end.toFixed(1),
          correctTag,
          colour: TagColours[index],
        };
      });
    },
    automaticTracks() {
      return this.modifiedTracks.filter(
        (track: { automatic: boolean }) =>
          track.automatic === undefined || track.automatic
      );
    },
  },
  methods: {},
});
</script>

<style scoped lang="scss">
h2 {
  font-size: 1.3em;
}
h3 {
  font-size: 1.1em;
  text-transform: capitalize;
}
h4 {
  font-size: 0.9em;
}
.classification-header {
  font-weight: bold;
}

.track-header {
}

.track-time {
  color: #999999;
}
.track-colour {
  display: inline-block;
  align-self: center;
  width: 20px;
  height: 20px;
  margin-right: 10px;
}
.collapsed > .when-open,
.not-collapsed > .when-closed {
  display: none;
}
.tag-history-toggle {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid #f1f1f1;
  margin-bottom: 8px;
  padding: 0 0.2em 0 0.2em;
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
</style>
