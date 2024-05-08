<template>
  <div class="tracklist-container">
    <div class="classification-header">
      <h3 class="mb-0">Classifications</h3>
      <Dropdown>
        <template #button-content>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 20 20"
          >
            <path
              fill="currentColor"
              d="M11 20q-.425 0-.713-.288T10 19v-6L4.2 5.6q-.375-.5-.113-1.05T5 4h14q.65 0 .913.55T19.8 5.6L14 13v6q0 .425-.288.713T13 20h-2Z"
            />
          </svg>
        </template>
        <div class="classification-filter-container" v-show="isGroupAdmin">
          <div class="d-flex">
            <h3>
              Group Tag Filter

              <Help class="text-secondary"
                >Admins can filter automatically created tags for the
                group</Help
              >
            </h3>
          </div>
          <ClassificationsDropdown
            key="track-list"
            v-bind:value="filteredTags"
            @input="onAddFilterTags($event)"
          />
        </div>
        <div>
          <input type="checkbox" v-model="showFilteredNoise" />
          <Label
            role="button"
            @click="() => (showFilteredNoise = !showFilteredNoise)"
            >Show Filtered Noise</Label
          >
        </div>
      </Dropdown>
    </div>
    <div v-if="tracks.length > 0" id="classification-list">
      <div
        v-for="track in tracks"
        :key="track.id"
        class="classification-item"
        :class="{
          'selected-track': selectedTrack && track.id === selectedTrack.id,
        }"
        :id="`tag-item-${track.id}`"
      >
        <div
          v-if="track.deleted"
          class="d-flex align-items-center justify-content-center"
        >
          <div
            @click="() => undoDeleteTrack(track.id)"
            class="undo-button justify-content-center align-items-center"
          >
            <h2 class="pr-2">Undo Deletion</h2>
            <font-awesome-icon class="mb-2" icon="undo" />
          </div>
        </div>
        <div
          v-else
          :class="{
            'classification-item-inner': true,
          }"
        >
          <div v-on:click="() => playTrack(track)" class="track-container">
            <div class="track-info">
              <div
                class="track-colour"
                :style="{
                  background: `${track.colour}`,
                }"
              />
              <h4 class="track-time m-0">
                Time: {{ track.start.toFixed(1) }} -
                {{ track.end.toFixed(1) }} (Δ{{
                  (track.end - track.start).toFixed(1)
                }}s)
              </h4>
            </div>
            <div class="tags-container">
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
                v-b-tooltip.hover.top="{ customClass: 'tooltip-below' }"
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
                <b-button
                  v-if="track.displayTags.length > 1 && tag.automatic"
                  @click.prevent="() => confirmTrack(track, tag)"
                  variant="outline-light"
                  class="p-1 no-border"
                  size="sm"
                >
                  <font-awesome-icon
                    v-if="['denied', 'automatic'].includes(tag.class)"
                    icon=""
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

                  <b-spinner v-if="track.confirming" variant="success" small />
                  <font-awesome-icon v-else icon="thumbs-up" />
                </b-button>
                <span class="pl-1">
                  {{ tag.what }}
                </span>
              </div>
            </div>
          </div>
          <div class="track-container-side d-flex justify-content-end">
            <div class="d-flex align-items-center">
              <b-button
                v-if="
                  track.displayTags.filter(
                    (tag) =>
                      tag.class === 'automatic' ||
                      (tag.class === 'confirmed' &&
                        !track.tags.some((t) => t.userName === userName))
                  ).length == 1 && !redacted
                "
                variant="outline-success"
                class="p-1"
                size="sm"
                @click.prevent="
                  () =>
                    confirmTrack(
                      track,
                      track.displayTags.find(
                        (tag) =>
                          tag.class === 'automatic' ||
                          (tag.class === 'confirmed' &&
                            !track.tags.some((t) => t.userName === userName))
                      )
                    )
                "
              >
                <b-spinner v-if="track.confirming" variant="success" small />
                <font-awesome-icon v-else icon="thumbs-up" />
                <span>Confirm</span>
              </b-button>
            </div>
            <Dropdown class="track-settings-button">
              <template #button-content>
                <font-awesome-icon icon="cog" />
              </template>
              <button @click.prevent="() => deleteTrack(track.id)">
                <div class="text-danger">
                  <font-awesome-icon icon="trash" />
                  delete
                </div>
              </button>
            </Dropdown>
          </div>
        </div>
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
          <font-awesome-icon icon="angle-down" class="when-closed" v-else />
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
            <tr v-for="tag in tags(track)" :key="tag.id">
              <td>{{ tag.what }}</td>
              <td>
                <span v-if="tag.userName">
                  {{ tag.userName }}
                </span>
                <span v-else>
                  {{ aiName(tag) }}
                </span>
              </td>
              <td>{{ tag.confidence }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <b-row
      v-if="tracks.length === 0"
      class="w-100 d-flex justify-content-center m-0"
    >
      <h4 class="select-track-message">
        Select section of Audio by pressing and dragging...
      </h4>
    </b-row>
  </div>
</template>

<script lang="ts">
import { PropType } from "vue";
import { defineComponent, onMounted, ref, watch } from "@vue/composition-api";
import Help from "@/components/Help.vue";

import { useState } from "@/utils";

import {
  AudioTrack,
  AudioTracks,
  DisplayTag,
} from "../Video/AudioRecording.vue";
import Dropdown from "../Dropdown.vue";
import ClassificationsDropdown from "../ClassificationsDropdown.vue";

import { TrackId } from "@typedefs/api/common";

import store from "@/stores";
import { shouldViewAsSuperUser } from "@/utils";
import { ApiTrackTag } from "@typedefs/api/trackTag";
enum TrackListFilter {
  All = "all",
  Automatic = "automatic",
  Manual = "manual",
  Unconfirmed = "unconfirmed",
}

export default defineComponent({
  name: "TrackList",
  components: {
    Dropdown,
    ClassificationsDropdown,
    Help,
  },
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
    redacted: {
      type: Boolean,
      default: false,
    },
    filteredTags: {
      type: Array as PropType<string[]>,
      default: () => [],
    },
    onAddFilterTags: {
      type: Function as PropType<(tags: string[]) => void>,
      default: () => {},
    },
    isGroupAdmin: {
      type: Boolean,
      default: false,
    },
    setFilteredNoise: {
      type: Function as PropType<(show: boolean) => void>,
      default: () => {},
    },
  },
  computed: {
    isSuperUserAndViewingAsSuperUser(): boolean {
      return (
        this.$store.state.User.userData.isSuperUser && shouldViewAsSuperUser()
      );
    },
  },
  methods: {
    tags(track) {
      let items = track.tags;
      if (!this.isSuperUserAndViewingAsSuperUser) {
        // Remove AI tags other than master, as they'll just be confusing
        items = items.filter(
          (item: ApiTrackTag) => !item.automatic || item.data.name === "Master"
        );
      }
      return items;
    },
    aiName: function (trackTag: ApiTrackTag) {
      if (
        this.isSuperUserAndViewingAsSuperUser &&
        trackTag.automatic &&
        trackTag.data.name
      ) {
        return "AI " + trackTag.data.name;
      } else {
        return "Cacophony AI";
      }
    },
  },
  setup(props) {
    const confirmTrack = async (track: AudioTrack, tag: DisplayTag) => {
      if (!tag) {
        return;
      }
      await props.addTagToTrack(track.id, tag.what);
    };
    const toggledTrackHistory = ref<TrackId[]>([]);
    const showFilteredNoise = ref(false);
    watch(showFilteredNoise, (val) => {
      props.setFilteredNoise(val);
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const filter = ref(TrackListFilter.All);
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

    const setFilter = (newFilter: TrackListFilter) => {
      filter.value = newFilter;
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
    onMounted(() => {
      watch(
        tracks,
        (newTracks) => {
          // temp style fix for sizing #classification-id
          const list = document.getElementById("classification-list");
          if (list) {
            const pxPerItem = 110;
            const cssHeight = pxPerItem * newTracks.length;
            list.style.height = `${cssHeight}px`;
          }
        },
        { immediate: true }
      );
    });

    watch(
      () => props.selectedTrack,
      (track) => {
        if (track) {
          const list = document.getElementById("classification-list");
          const element = document.getElementById(`tag-item-${track.id}`);
          if (list && element) {
            const scrollPosition = element.offsetTop - list.offsetTop;

            // Step 4: Scroll
            list.scrollTop = scrollPosition;
          }
        }
      }
    );

    watch(
      () => [props.audioTracks, props.selectedTrack] as const,
      (curr, prev) => {
        const [tracks, selectedTrack] = curr;
        const [prevTracks, prevSelectedTrack] = prev;
        if (
          selectedTrack?.id === prevSelectedTrack?.id ||
          tracks === prevTracks
        ) {
          return;
        }
        const list = document.getElementById("classification-list");
        if (list) {
          list.scrollTop = 0;
        }
      }
    );

    return {
      userName: store.state.User.userData.userName,
      tracks,
      setFilter,
      toggledTrackHistory,
      confirmTrack,
      showFilteredNoise,
      filter,
      filterTracks,
      sortTracks,
      TrackListFilter,
    };
  },
});
</script>

<style lang="scss">
@import "src/styles/tag-colours";

.track-container {
  overflow-y: auto;
}

.track-container-side {
  display: flex;
  align-items: flex-end;
  flex-direction: column;
  gap: 0.5em;
  padding-right: 1em;
  padding-bottom: 0.4em;
}

.collapsed > .when-open,
.not-collapsed > .when-closed {
  display: none;
}

.classification-item {
  margin-left: 5px;
  padding-left: 0.5em;
  padding-top: 1em;
}

#classification-list {
  max-height: 33vh;
  overflow-y: auto;
  position: relative;
  margin: 0 -0.9em 0 -1em;

  &::-webkit-scrollbar {
    width: 5px;
    position: absolute;
  }

  &::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: #999; /* Color of the scrollbar thumb */
    border-radius: 4px; /* Rounded corners */
  }
  &::-webkit-scrollbar-thumb:hover {
    background-color: #777;
  }
}

.tag-history-toggle {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid #f1f1f1;
  cursor: pointer;
}

.tag-history-toggle > h4 {
  font-weight: 800;
  color: #272e39;
  user-select: none;
}

.tag-history-toggle > svg {
  margin-right: 1em;
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
  padding-top: 0.8em;
  padding-bottom: 1em;
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
  padding-bottom: 1em;
}
.tags-container {
  display: flex;
  flex-wrap: wrap;
  padding-top: 0.5em;
  padding-bottom: 0.5em;
  gap: 0.3em;
}
.classification-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 0.4em;
  border-bottom: solid #e8e8e8 1px;
}
.classification-filter-container {
  width: 20em;
}
.selected-track {
  box-shadow: -5px 0px 0px 0px #9acd32;
}
.tracklist-container {
}
.track-info {
  display: flex;
  column-gap: 0.5em;
}
.classification-item-inner {
  display: flex;
  justify-content: space-between;
}
.undo-button {
  display: flex;
  min-height: 90px;
}
.no-border {
  border: none;
}
.tooltip-below {
  top: 40px !important;
}
</style>
