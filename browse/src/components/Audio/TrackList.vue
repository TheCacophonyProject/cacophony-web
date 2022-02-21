<template>
  <b-col>
    <b-row>
      <h2 class="classification-header">Classification</h2>
    </b-row>
    <b-row v-for="track in tracks" :key="track.id">
      <b-col>
        <b-row>
          <b-col
            lg="10"
            sm="4"
            v-on:click="setSelectedTrack(track)"
            class="track-container"
          >
            <b-row>
              <span
                :class="{
                  highlight: selectedTrack && selectedTrack.id === track.id,
                  'track-colour': true,
                }"
                :style="{ background: `${track.colour}` }"
              ></span>
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
                          (tag) => tag.class === 'automatic'
                        )
                      "
                      variant="outline-success"
                      size="sm"
                      @click="confirmTrack(track)"
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
                <b-row class="mt-1 mb-1">
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
                      ['bg-warning']: tag.class === 'automatic',
                      ['bg-danger']: tag.class === 'denied',
                      ['bg-success']: tag.class === 'confirmed',
                      ['bg-info']: tag.class === 'human',
                    }"
                    v-b-tooltip.hover
                    :title="`${
                      tag.class === 'human' ? 'Human' : 'AI'
                    } classified`"
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
            class="track-container-side d-flex justify-content-end p-0"
          >
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
                @click="deleteTrack(track.id)"
              >
                <font-awesome-icon icon="trash" />
                delete
              </b-dropdown-item>
            </b-dropdown>
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
    <h4 class="select-track-message" v-if="tracks.length === 0">
      Select section of Audio by pressing and dragging...
    </h4>
  </b-col>
</template>

<script lang="ts">
import { PropType } from "vue";
import { defineComponent, ref, watch } from "@vue/composition-api";
import { Immutable } from "immer";

import { AudioTrack } from "../Video/AudioRecording.vue";

import { TrackId } from "@typedefs/api/common";

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
      type: Map as PropType<Map<number, AudioTrack>>,
      required: true,
    },
    selectedTrack: {
      type: Object as PropType<Immutable<AudioTrack> | null>,
    },
    deleteTrack: {
      type: Function as PropType<(track: TrackId) => void>,
      required: true,
    },
    addTagToTrack: {
      type: Function as PropType<
        (trackId: TrackId, what: string) => Promise<AudioTrack>
      >,
      required: true,
    },
    setSelectedTrack: {
      type: Function as PropType<(track: Immutable<AudioTrack>) => void>,
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
    const filter = ref<TrackListFilter>(TrackListFilter.All);
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
    const tracks = ref<AudioTrack[]>(
      [...props.audioTracks.values()].filter(filterTracks).sort(sortTracks)
    );
    watch(
      () => props.audioTracks,
      (newTracks) => {
        tracks.value = [...newTracks.values()]
          .filter(filterTracks)
          .sort(sortTracks);
      }
    );

    return {
      tracks,
      confirmTrack,
      filter,
      filterTracks,
      sortTracks,
    };
  },
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
.confirmed-text {
  display: flex;
  align-items: center;
  color: #28a745;
  font-size: 0.875rem;
}
.capitalize {
  text-transform: capitalize;
}
</style>
