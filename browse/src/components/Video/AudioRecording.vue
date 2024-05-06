<template>
  <b-row fluid class="audio-recording-container">
    <b-col>
      <b-row class="mb-4">
        <b-col>
          <AudioPlayer
            :key="`${url}-${sampleRate}-${colour}`"
            v-if="buffer !== null && !deleted && !recording.redacted"
            :colour="colour"
            :setColour="setColour"
            :tracks="tracks"
            :buffer="buffer"
            :url="url"
            :sampleRate="sampleRate"
            :setSampleRate="setSampleRate"
            :duration="recording.duration"
            :selectedTrack="selectedTrack"
            :setSelectedTrack="playTrack"
            :update-track="updateTrack"
          />
          <b-row
            v-else-if="deleted && !deletedStation"
            class="undo-delete w-100 justify-content-center align-items-center"
            @click="undoDeleteRecording"
            role="button"
          >
            <h1>Undo Delete Recording</h1>
            <font-awesome-icon class="mb-2" icon="undo" size="2x" />
          </b-row>
          <b-row
            v-else-if="recording.redacted"
            class="w-100 redacted justify-content-center align-items-center"
          >
            <font-awesome-icon
              class="mb-2 mr-4 text-primary"
              icon="shield-alt"
              size="4x"
            />
            <span class="d-flex position-relative">
              <h1 class="text-center">
                Human voice detected<br />
                Recording removed
              </h1>
              <Help class="redacted-help text-secondary">
                Privacy protection feature can be disabled by an admin in the
                group settings.
              </Help>
            </span>
          </b-row>
        </b-col>
      </b-row>
      <b-row class="bottom-container" v-show="!deleted">
        <b-col lg="4">
          <div class="basic-container">
            <TrackList
              :audio-tracks="tracks"
              :selected-track="selectedTrack"
              :play-track="playTrack"
              :delete-track="deleteTrack"
              :undo-delete-track="undoDeleteTrack"
              :add-tag-to-track="addTagToTrack"
              :redacted="recording.redacted"
              :filtered-tags="filteredAudioTags"
              :on-add-filter-tags="updateGroupFilterTags"
              :is-group-admin="isGroupAdmin"
              :set-filtered-noise="setFilteredNoise"
            />
          </div>
        </b-col>
        <b-col class="tag-container p-0">
          <div class="basic-container">
            <div class="mx-2 mb-2 d-flex align-items-center">
              <ClassificationsDropdown
                v-model="selectedLabel"
                @input="() => addTagToSelectedTrack(selectedLabel)"
                :disabled="!selectedTrack"
                :exclude="['part', 'interesting', 'poor tracking']"
              />
              <div class="button-selectors d-flex">
                <b-button
                  class="ml-2 tag-pin text-primary"
                  :disabled="!usersTag"
                  @click="togglePinTag(usersTag.what)"
                >
                  <font-awesome-icon
                    icon="thumbtack"
                    size="1x"
                    v-b-tooltip.hover
                    title="Pin current tag to buttons"
                  />
                </b-button>
                <b-button
                  class="ml-2 tag-cross text-danger"
                  :disabled="!usersTag"
                  @click="deleteTagFromSelectedTrack()"
                >
                  <font-awesome-icon
                    icon="times"
                    size="1x"
                    v-b-tooltip.hover
                    title="Remove Tag from Track"
                  />
                </b-button>
              </div>
            </div>
            <LabelButtonGroup
              :labels="labels"
              :add-tag-to-selected-track="addTagToSelectedTrack"
              :delete-tag-from-selected-track="deleteTagFromSelectedTrack"
              :disabled="!selectedTrack"
              :selected-label="selectedLabel"
              :toggle-pin-tag="togglePinTag"
            />
            <b-row
              class="
                d-flex
                mt-2
                mb-4
                flex-wrap
                justify-content-center
                button-selectors
              "
            >
              <h3 class="w-100 ml-4">Attributes</h3>
              <b-button-group class="mr-2">
                <b-button
                  :class="{
                    highlight:
                      usersTag &&
                      typeof usersTag.data === 'object' &&
                      usersTag.data.gender === 'male',
                  }"
                  @click="
                    toggleAttributeToTrackTag(
                      { gender: 'male' },
                      selectedTrack.id,
                      usersTag.id
                    )
                  "
                  :disabled="!usersTag"
                  >Male</b-button
                >
                <b-button
                  :class="{
                    highlight:
                      usersTag &&
                      typeof usersTag.data === 'object' &&
                      usersTag.data.gender === 'female',
                  }"
                  @click="
                    toggleAttributeToTrackTag(
                      { gender: 'female' },
                      selectedTrack.id,
                      usersTag.id
                    )
                  "
                  :disabled="!usersTag"
                  >Female</b-button
                >
              </b-button-group>
              <b-button-group class="ml-2">
                <b-button
                  :class="{
                    highlight:
                      usersTag &&
                      typeof usersTag.data === 'object' &&
                      usersTag.data.maturity === 'adult',
                  }"
                  @click="
                    toggleAttributeToTrackTag(
                      { maturity: 'adult' },
                      selectedTrack.id,
                      usersTag.id
                    )
                  "
                  :disabled="!usersTag"
                  >Adult</b-button
                >
                <b-button
                  :class="{
                    highlight:
                      usersTag &&
                      typeof usersTag.data === 'object' &&
                      usersTag.data.maturity === 'juvenile',
                  }"
                  @click="
                    toggleAttributeToTrackTag(
                      { maturity: 'juvenile' },
                      selectedTrack.id,
                      usersTag.id
                    )
                  "
                  :disabled="!usersTag"
                  >Juvenile</b-button
                >
              </b-button-group>
            </b-row>
          </div>
        </b-col>
        <b-col lg="4" class="mb-4">
          <Playlist
            :recording-date-time="recording.recordingDateTime"
            :url="url"
            :delete-recording="deleteRecording"
            :is-group-admin="isGroupAdmin"
          />
          <div class="basic-container mt-1">
            <div class="notes-header">
              <h3 for="notes-textarea">Notes</h3>
            </div>
            <div v-for="comment in comments" :key="comment.id">
              <div>
                <div class="d-flex justify-content-between">
                  <div class="d-flex">
                    <h4 class="mb-0">{{ comment.tagger }}</h4>
                    <h4 class="text-secondary ml-1 mb-0">{{ comment.date }}</h4>
                  </div>
                  <div class="d-flex justify-self-end">
                    <div
                      v-if="userId === comment.taggerId"
                      class="pointer text-secondary"
                      role="button"
                    >
                      <font-awesome-icon
                        icon="trash"
                        size="1x"
                        @click="() => deleteComment(comment.id)"
                      />
                    </div>
                  </div>
                </div>
                <div v-if="comment.tag !== 'note'" class="d-flex pb-1">
                  <h4 class="comment-tag mb-0 mr-3">
                    {{ comment.tag }}
                  </h4>
                </div>
              </div>
              <p>{{ comment.comment }}</p>
            </div>

            <b-form-textarea
              id="notes-textarea"
              rows="2"
              no-resize
              v-model="currComment"
            />
            <div class="d-flex justify-items-between pt-2">
              <div class="d-flex align-items-center">
                <label class="mb-0 pr-1">Label:</label>
                <b-form-select
                  v-model="currTag"
                  :options="tags"
                  placeholder="Label..."
                  data-cy="tag-select"
                />
                <div
                  class="pl-2 pr-2 pointer"
                  role="button"
                  v-if="currTag !== null"
                  @click="() => (currTag = null)"
                >
                  <font-awesome-icon icon="times" />
                </div>
              </div>
              <b-button
                class="ml-auto"
                variant="primary"
                @click="
                  () => {
                    if (!currComment && currTag === null) return;
                    addRecordingTag();
                  }
                "
              >
                Submit
              </b-button>
            </div>
          </div>
          <div class="basic-container mt-1">
            <div
              class="d-flex align-items-center"
              v-if="recording.processing || isQueued"
            >
              <h3>Status:</h3>
              <h4 class="ml-1" v-if="isQueued">Queued for Processing...</h4>
              <div
                class="d-flex align-items-center justify-content-center"
                v-else-if="recording.processing"
              >
                <b-spinner />
                <h4 class="mb-0 ml-2">Processing...</h4>
              </div>
            </div>
            <div v-if="recording.location" class="mt-2">
              <MapWithPoints
                :height="200"
                :points="[
                  {
                    name: recording.deviceName,
                    location: recording.location,
                  },
                ]"
              />
            </div>
            <div
              class="index-container pointer"
              v-if="cacophonyIndex"
              @click="() => (showCacophonyIndex = !showCacophonyIndex)"
            >
              <h3 class="pt-2">Cacophony Index</h3>
              <div class="d-flex align-items-center pointer" role="button">
                <font-awesome-icon
                  v-if="!showCacophonyIndex"
                  size="lg"
                  icon="angle-down"
                />
                <font-awesome-icon v-else size="lg" icon="angle-up" />
              </div>
            </div>
            <CacophonyIndexGraph
              v-if="cacophonyIndex && showCacophonyIndex"
              class="mt-2"
              :cacophony-index="cacophonyIndex"
              :id="recording.id"
            />
            <RecordingProperties :recording="recording" />
          </div>
        </b-col>
      </b-row>
    </b-col>
  </b-row>
</template>

<script lang="ts">
import { PropType } from "vue";
import { produce } from "immer";
import {
  defineComponent,
  watch,
  computed,
  ref,
  onMounted,
} from "@vue/composition-api";

import api from "@api";
import store from "@/stores";
import { useState, UUIDv4 } from "@/utils";
import { TagColours } from "@/const";

import AudioPlayer from "../Audio/AudioPlayer.vue";
import TrackList from "../Audio/TrackList.vue";
import Playlist from "../Audio/Playlist.vue";
import LabelButtonGroup from "../Audio/LabelButtonGroup.vue";
import CacophonyIndexGraph from "../Audio/CacophonyIndexGraph.vue";
import RecordingProperties from "../Video/RecordingProperties.vue";
import MapWithPoints from "@/components/MapWithPoints.vue";
import Help from "@/components/Help.vue";

import { ApiTrackResponse, ApiTrackDataRequest } from "@typedefs/api/track";
import { ApiTrackTag, ApiTrackTagAttributes } from "@typedefs/api/trackTag";
import {
  ApiTrackTagRequest,
  ApiTrackTagResponse,
} from "@typedefs/api/trackTag";
import { ApiAudioRecordingResponse } from "@typedefs/api/recording";
import { TrackId } from "@typedefs/api/common";
import { RecordingProcessingState } from "@typedefs/api/consts";
import { ApiGroupResponse } from "@typedefs/api/group";
import { ApiRecordingTagRequest } from "@typedefs/api/tag";
import { getClassifications } from "../ClassificationsDropdown.vue";
import ClassificationsDropdown from "../ClassificationsDropdown.vue";

import { Option } from "./LayeredDropdown.vue";

export enum TagClass {
  Automatic = "automatic",
  Human = "human",
  Confirmed = "confirmed",
  Denied = "denied",
}

export interface DisplayTag extends ApiTrackTagResponse {
  class: TagClass;
}

export interface AudioTrack extends ApiTrackResponse {
  colour: string;
  displayTags: DisplayTag[];
  confirming: boolean;
  deleted: boolean;
  playEventId?: string;
}
export type AudioTracks = Map<TrackId, AudioTrack>;

const fetchAudioBuffer = async (url: string) => {
  const response = await fetch(url);
  const arrayBuffer = await response.blob();
  return arrayBuffer;
};

export default defineComponent({
  name: "AudioRecording",
  props: {
    recording: {
      type: Object as PropType<ApiAudioRecordingResponse>,
      required: true,
    },
    audioUrl: {
      type: String,
      required: true,
    },
    audioRawUrl: {
      type: String,
      required: true,
    },
  },
  components: {
    MapWithPoints,
    AudioPlayer,
    Playlist,
    TrackList,
    CacophonyIndexGraph,
    RecordingProperties,
    LabelButtonGroup,
    ClassificationsDropdown,
    Help,
  },
  setup(props, context) {
    const options = ref<Option>({ label: "", children: [] });

    const userName = store.state.User.userData.userName;
    const userId = store.state.User.userData.id;
    const [url, setUrl] = useState(
      // props.audioUrl ? props.audioUrl : props.audioRawUrl
      props.audioRawUrl ? props.audioRawUrl : props.audioUrl
    );
    const buffer = ref<Blob>(null);
    const [sampleRate, setSampleRate] = useState<number>(
      localStorage.getItem("audio-sample-rate")
        ? parseInt(localStorage.getItem("audio-sample-rate"))
        : 24000
    );
    watch(sampleRate, (currSampleRate) => {
      localStorage.setItem("audio-sample-rate", currSampleRate.toString());
    });

    const savedColour = localStorage.getItem("audio-colour");
    const [colour, setColour] = useState(savedColour ? savedColour : "cool");
    watch(colour, () => {
      // store the colour in local storage
      localStorage.setItem("audio-colour", colour.value);
    });

    const [deleted, setDeleted] = useState(false);
    watch(
      () => [props.audioUrl, props.audioRawUrl],
      async ([newUrl, newRawUrl]) => {
        setDeleted(false);
        // const url = newUrl ? newUrl : newRawUrl;
        const url = newRawUrl ? newRawUrl : newUrl;
        buffer.value = await fetchAudioBuffer(url);
        setUrl(url);
      }
    );

    const deletedStation = ref(false);
    const deleteRecording = async () => {
      const response = await api.recording.del(props.recording.id);
      if (response.success) {
        setDeleted(true);
        // check if station is now empty and delete if it is
        const response = await api.station.getStationById(
          props.recording.stationId
        );
        if (response.success) {
          const { station } = response.result;
          const res = await api.station.getStationRecordingsCount(station.id);
          if (res.success && res.result.count === 0) {
            //Prompt user to delete station

            const shouldDelete = await context.root.$bvModal.msgBoxConfirm(
              "This was the last recording on this station. Do you want to delete the station? This action cannot be undone.",
              {
                title: "Delete Station",
                okVariant: "danger",
                okTitle: "Delete",
                cancelTitle: "Cancel",
                footerClass: "p-2",
                hideHeaderClose: false,
                centered: true,
              }
            );
            if (shouldDelete) {
              await api.station.deleteStationById(station.id);
              deletedStation.value = true;
            }
          }
        }
      }
    };

    const undoDeleteRecording = async () => {
      const response = await api.recording.undelete(props.recording.id);
      if (response.success) {
        setDeleted(false);
      }
    };

    const isGroupAdmin = ref(false);
    const filterHuman = ref(false);
    // const ignored_parents = ["bird","mammal"]

    const flattenNodes = (
      acc: Record<
        string,
        { label: string; display: string; parents: string[] }
      >,
      node: Option,
      parents: string[]
    ) => {
      for (const child of node.children || []) {
        acc[child.label] = {
          label: child.label,
          display: child.display || child.label,
          parents: [...parents],
        };
        flattenNodes(acc, child, [...acc[child.label].parents, child.label]);
      }
      return acc;
    };

    const getDisplayTags = (track: ApiTrackResponse): DisplayTag[] => {
      const labelToParent = {};
      const classifications = flattenNodes(labelToParent, options.value, []);
      let automaticTags = track.tags.filter(
        (tag) => tag.automatic && tag.data.name === "Master"
      );
      const humanTags = track.tags.filter((tag) => !tag.automatic);
      const humanTag =
        humanTags.length === 1
          ? humanTags[0]
          : humanTags.length === 0
          ? null
          : humanTags.reduce((acc, curr) => {
              if (acc.what === curr.what) {
                return curr;
              } else {
                return { ...humanTags[0], what: "Multiple" };
              }
            });

      if (automaticTags && automaticTags.length > 0) {
        if (automaticTags.length > 1 && humanTags.length == 0) {
          // filter common ancestors and only leave more specific ai tags
          // for(let i=0; i < automaticTags.length; i++){
          //   console.log("Checking ",automaticTags[i].what);
          //   for(let j=0; j < automaticTags.length; j++){
          //     if (j== i){
          //       continue
          //     }
          //     console.log("Checking parents of ",automaticTags[j].what,labelToParent[automaticTags[j].what].parents);
          //     let moreSpecific = labelToParent[automaticTags[j].what].parents.find((parent)=> parent === automaticTags[i].what);
          //     console.log("more specific exists",moreSpecific);

          //   }
          // }

          automaticTags = automaticTags.filter(
            (tag) =>
              !automaticTags.find(
                (others) =>
                  others != tag &&
                  others.what in labelToParent &&
                  labelToParent[others.what].parents.find(
                    (parent) => parent === tag.what
                  )
              )
          );
        }
        automaticTags.sort((a, b) => {
          if (a.what === "bird") {
            return 2;
          } else if (b.what === "bird") {
            return -2;
          }
          return a.what <= b.what ? -1 : 1;
        });

        if (humanTags.length > 0) {
          //tags which match or, matches an ai tag which is a parent of this tag but not a top level tag
          const confirmedTags = humanTags.filter(
            (tag) =>
              automaticTags.filter(
                (autoTag) =>
                  autoTag.what === tag.what ||
                  (tag.what !== "bird" &&
                    tag.what in labelToParent &&
                    automaticTags.find(
                      (autoTag) =>
                        autoTag.what in labelToParent &&
                        labelToParent[autoTag.what].parents.length > 0 &&
                        tag.what in labelToParent &&
                        labelToParent[tag.what].parents.find(
                          (parent) => parent === autoTag.what
                        )
                    ))
              ).length > 0
          );

          const confirmedTag =
            confirmedTags.length === 1
              ? confirmedTags[0]
              : confirmedTags.length === 0
              ? null
              : confirmedTags.reduce((acc, curr) => {
                  if (acc.what === curr.what) {
                    return curr;
                  } else {
                    return { ...confirmedTags[0], what: "Multiple" };
                  }
                });

          if (confirmedTag) {
            return [
              {
                ...confirmedTag,
                class: TagClass.Confirmed,
              },
            ];
          } else {
            //filter any that aren't more specific of the human tag
            automaticTags = automaticTags.filter(
              (autoTag) =>
                autoTag.what in labelToParent &&
                labelToParent[autoTag.what].parents.find(
                  (parent) => parent === humanTag.what
                )
            );

            // check if all human tags are the same
            return [
              {
                ...humanTag,
                class: TagClass.Human,
              },
              ...automaticTags.map((automaticTag) => ({
                ...automaticTag,
                class: TagClass.Denied,
              })),
            ];
          }
        } else {
          return automaticTags.map((automaticTag) => ({
            ...automaticTag,
            class: TagClass.Automatic,
          }));
        }
      } else if (humanTags.length > 0) {
        return [
          {
            ...humanTag,
            class: TagClass.Human,
          },
        ];
      } else {
        return [];
      }
    };

    const createAudioTrack = (
      track: ApiTrackResponse,
      index: number
    ): AudioTrack => {
      const displayTags = getDisplayTags(track);

      return {
        deleted: false,
        colour: TagColours[index % TagColours.length],
        displayTags,
        confirming: false,
        ...track,
        ...{ start: track.start ? track.start : 0 },
        ...{ end: track.end ? track.end : 0 },
      };
    };
    const showFilteredNoise = ref(false);
    const setFilteredNoise = (val: boolean) => {
      showFilteredNoise.value = val;
    };

    const mappedTracks = (tracks: ApiTrackResponse[]) =>
      new Map(
        tracks.map((track, index) => {
          const audioTrack = createAudioTrack(track, index);
          return [track.id, audioTrack];
        })
      );
    const filterTracks = (tracks: (ApiTrackResponse | AudioTrack)[]) => {
      const tags = filteredAudioTags.value ?? [];
      const filtered = tracks
        .filter(
          (track) =>
            !track.tags.some((tag) => {
              if (tag.automatic) {
                return tag.data.name === "Master"
                  ? tags.includes(tag.what)
                  : false;
              } else {
                tags.includes(tag.what);
              }
            }) || track.tags.some((tag) => !tag.automatic)
        )
        .filter((track) => showFilteredNoise.value || !track.filtered);
      return filtered;
    };

    const [tracks, setTracks] = useState<AudioTracks>(new Map());
    const displayTracks = computed(() => {
      return mappedTracks(filterTracks([...tracks.value.values()]));
    });
    const [selectedTrack, setSelectedTrack] = useState<AudioTrack>(null);

    const playTrack = (track?: AudioTrack) => {
      if (track) {
        const currTrack = tracks.value.get(track.id);
        setSelectedTrack(() => ({
          ...(currTrack ?? track),
          playEventId: UUIDv4(),
        }));
      } else {
        setSelectedTrack(null);
      }
    };

    const addTrack = async (track: AudioTrack): Promise<AudioTrack> => {
      try {
        const trackRequest: ApiTrackRequest = {
          data: {
            start_s: track.start,
            end_s: track.end,
            maxFreq: track.maxFreq,
            minFreq: track.minFreq,
            positions: [track.positions[1]],
            userId: userId,
            automatic: false,
          },
        };
        const response = await api.recording.addTrack(
          trackRequest,
          props.recording.id
        );

        if (response.success) {
          const id = response.result.trackId;
          const colour =
            track.colour && track.id !== -1
              ? track.colour
              : TagColours[tracks.value.size % TagColours.length];
          const newTrack = {
            ...track,
            id,
            colour,
            deleted: false,
          };
          setTracks((tracks) => {
            const track = tracks.get(id);
            tracks.set(
              id,
              produce(track, () => newTrack)
            );
          });
          return newTrack;
        } else {
          throw response.result;
        }
      } catch (error) {
        // console.error(error);
      }
    };
    const modifyTrack = (
      trackId: TrackId,
      trackChanges: Partial<AudioTrack>
    ): AudioTrack => {
      setTracks((draftTracks) => {
        const track = draftTracks.get(trackId);
        draftTracks.set(
          trackId,
          produce(track, () => ({
            ...track,
            ...trackChanges,
          }))
        );
      });
      return tracks.value.get(trackId) as AudioTrack;
    };

    const addTagToTrack = async (
      trackId: TrackId,
      what: string,
      automatic = false,
      confidence = 1,
      data: any = {},
      username = userName
    ): Promise<AudioTrack> => {
      const track = tracks.value.get(trackId);
      const tag: ApiTrackTagRequest = {
        what: what.toLowerCase(),
        automatic,
        confidence,
        ...(data && { data: JSON.stringify(data) }),
      };
      let shouldDelete = false;

      if (filterHuman.value && tag.what === "human") {
        shouldDelete = await context.root.$bvModal.msgBoxConfirm(
          "The group has privacy protection, adding this human tag will delete the recording. Are you sure you want to continue?",
          {
            title: "Privacy Protection",
            okVariant: "danger",
            okTitle: "Delete",
            cancelTitle: "Cancel",
            footerClass: "p-2",
            hideHeaderClose: false,
            centered: true,
          }
        );
      }
      const response = await api.recording.replaceTrackTag(
        tag,
        props.recording.id,
        Number(trackId),
        tag.automatic
      );
      if (response.success) {
        const newTag = {
          ...tag,
          id: response.result.trackTagId ?? 0,
          trackId,
          data,
          userId,
          automatic,
          userName: username,
        } as ApiTrackTag;
        const currTags = track.tags.filter((tag) => tag.userId !== userId);
        const newTags = [...currTags, newTag];
        const taggedTrack = modifyTrack(trackId, {
          confirming: false,
          tags: newTags,
        });
        const displayTags = getDisplayTags(taggedTrack);
        const currTrack = modifyTrack(trackId, {
          displayTags,
          confirming: false,
        });
        if (selectedTrack.value && selectedTrack.value.id === trackId) {
          setSelectedTrack(() => currTrack);
        }
        storeCommonTag(what);
        setButtonLabels(createButtonLabels());
        if (shouldDelete) {
          await deleteRecording();
        }
        return currTrack;
      } else {
        return modifyTrack(trackId, {
          confirming: false,
        });
      }
    };

    const toggleAttributeToTrackTag = async (
      newAttr: Partial<ApiTrackTagAttributes>,
      trackId: TrackId,
      tagId: number
    ) => {
      try {
        const tag = tracks.value.get(trackId).tags.find((tag) => {
          if (tag.id === tagId) {
            return true;
          }
          return false;
        });
        if (!tag) {
          return;
        }
        const newAttrKeys = Object.keys(newAttr);
        const newAttrs = newAttrKeys.reduce((acc, key) => {
          if (tag.data[key] === newAttr[key]) {
            acc[key] = null;
          }
          return acc;
        }, newAttr);

        const response = await api.recording.updateTrackTag(
          newAttrs,
          props.recording.id,
          trackId,
          tagId
        );
        if (response.success) {
          setTracks((tracks) => {
            tracks.get(trackId).tags.forEach((tag) => {
              if (tag.id === tagId && typeof tag.data === "object") {
                tag.data = {
                  ...tag.data,
                  ...newAttrs,
                };
              }
            });
          });
        }
      } catch (error) {
        // console.error(error);
      }
    };

    const deleteTrackTag = async (
      trackId: TrackId,
      tagId: number
    ): Promise<AudioTrack> => {
      const track = tracks.value.get(trackId);
      if (track) {
        modifyTrack(trackId, {
          confirming: true,
        });
      }
      const response = await api.recording.deleteTrackTag(
        props.recording.id,
        trackId,
        tagId
      );
      if (response.success) {
        const currTags = track.tags.filter((tag) => tag.id !== tagId);
        const taggedTrack = modifyTrack(trackId, {
          tags: currTags,
        });
        const displayTags = getDisplayTags(taggedTrack);
        const currTrack = modifyTrack(trackId, {
          displayTags,
          confirming: false,
        });

        return currTrack;
      } else {
        return modifyTrack(trackId, {
          confirming: false,
        });
      }
    };

    const addTagToSelectedTrack = async (tag: string) => {
      if (selectedTrack.value) {
        let track = selectedTrack.value;
        if (selectedTrack.value.id === -1) {
          track = await addTrack(selectedTrack.value);
        }
        const newTrack = await addTagToTrack(track.id, tag);
        setSelectedTrack(newTrack);
      }
    };

    const deleteTagFromSelectedTrack = async () => {
      if (selectedTrack.value) {
        const userTag = selectedTrack.value.tags.find(
          (tag) => tag.userId === userId
        );
        if (userTag) {
          const newTrack = await deleteTrackTag(
            selectedTrack.value.id,
            userTag.id
          );
          // check if the track is now empty
          if (newTrack.tags.length === 0) {
            deleteTrack(newTrack.id, true);
          } else {
            setSelectedTrack(newTrack);
          }
        }
      }
    };

    const updateTrack = async (
      trackId: TrackId,
      trackData: ApiTrackDataRequest
    ) => {
      const response = await api.recording.updateTrack(
        trackId,
        props.recording.id,
        trackData
      );
      if (response.success) {
        // update local state
        setTracks((draftTracks) => {
          const track = draftTracks.get(trackId);

          draftTracks.set(
            trackId,
            produce(track, () => ({
              ...track,
              ...trackData,
              start: trackData.start_s,
              end: trackData.end_s,
            }))
          );
        });
        return { success: true };
      } else {
        return { success: false };
      }
    };

    const deleteTrack = async (trackId: TrackId, permanent = false) => {
      try {
        const response = await api.recording.deleteTrack(
          trackId,
          props.recording.id,
          true
        );
        if (response.success) {
          if (permanent) {
            setTracks((tracks) => {
              const newTracks = produce(tracks, (draftTracks) => {
                draftTracks.delete(trackId);
              });
              return newTracks;
            });
          } else {
            modifyTrack(trackId, {
              deleted: true,
            });
          }
          if (selectedTrack.value?.id === trackId) {
            setSelectedTrack(null);
          }
        } else {
          throw response.result;
        }
      } catch (error) {
        // console.error(error);
      }
    };

    const undoDeleteTrack = async (trackId: TrackId) => {
      try {
        const response = await api.recording.undeleteTrack(
          trackId,
          props.recording.id
        );
        if (response.success) {
          modifyTrack(trackId, {
            deleted: false,
          });
        } else {
          throw response.result;
        }
      } catch (error) {
        // console.error(error);
      }
    };

    const [cacophonyIndex, setCacophonyIndex] = useState(
      props.recording.cacophonyIndex
    );
    const showCacophonyIndex = ref(false);
    const group = ref<ApiGroupResponse>(null);
    const filteredAudioTags = ref<string[]>([]);

    watch(tracks, () => {
      if (selectedTrack.value) {
        setSelectedTrack(tracks.value.get(selectedTrack.value.id));
      }
    });

    const createButtonLabels = () => {
      const maxBirdButtons = 6;
      const fixedLabels = ["Bird", "Human", "Unknown"];
      const otherLabels = fixedLabels.map((label: string) => ({
        label,
        pinned: false,
      }));

      const storedCommonTags: { label: string; pinned: boolean }[] =
        Object.values(JSON.parse(localStorage.getItem("commonTags")) ?? {})
          .filter(
            (tag: { what: string }) =>
              !fixedLabels.some((label) => {
                return label.toLowerCase() === tag.what.toLowerCase();
              })
          )
          .sort((a: { freq: number }, b: { freq: number }) => b.freq - a.freq)
          // sort those that are pinned first
          .sort((a: { pinned: boolean }, b: { pinned: boolean }) => {
            if (a.pinned && !b.pinned) {
              return -1;
            } else if (!a.pinned && b.pinned) {
              return 1;
            } else {
              return 0;
            }
          })
          .map((bird: { what: string; pinned: boolean }) => ({
            label: bird.what.toLowerCase(),
            pinned: bird.pinned,
          }));

      const pinnedBirdLabels = storedCommonTags.filter((bird) => bird.pinned);
      const unpinnedBirdLabels = storedCommonTags.filter(
        (bird) => !bird.pinned
      );
      const commonBirdLabels = [
        "Morepork",
        "Kiwi",
        "Kereru",
        "Tui",
        "Kea",
        "Bellbird",
      ]
        .filter(
          (val: string) =>
            !storedCommonTags.find(
              (bird) => bird.label.toLowerCase() === val.toLowerCase()
            )
        )
        .map((label: string) => ({ label, pinned: false }));

      const amountToRemove = Math.min(maxBirdButtons, storedCommonTags.length);
      const diffToMax = maxBirdButtons - amountToRemove;
      const commonTags = [
        ...pinnedBirdLabels,
        ...unpinnedBirdLabels.splice(0, amountToRemove),
        ...commonBirdLabels.splice(0, diffToMax),
      ];

      const labels = [...commonTags, ...otherLabels];
      return labels;
    };
    const [buttonLabels, setButtonLabels] = useState(createButtonLabels());
    const [selectedLabel, setSelectedLabel] = useState<string>("");
    const usersTag = computed(() => {
      if (selectedTrack.value) {
        return selectedTrack.value.tags.find((tag) => tag.userId === userId);
      } else {
        return null;
      }
    });
    watch(selectedTrack, () => {
      if (selectedTrack.value) {
        const tag = selectedTrack.value.tags.find((tag) => {
          if (tag.userId === userId) {
            return true;
          }
          return false;
        });
        if (tag) {
          const capitalizedTag =
            tag.what.charAt(0).toUpperCase() + tag.what.slice(1);
          setSelectedLabel(capitalizedTag);
        } else {
          setSelectedLabel("");
        }
      } else {
        setSelectedLabel("");
      }
    });

    const storeCommonTag = (bird: string, togglePin = false, freq = 1) => {
      bird = bird.toLowerCase();
      const commonTags = JSON.parse(localStorage.getItem("commonTags")) ?? {};
      const newBird = commonTags[bird]
        ? commonTags[bird]
        : { what: bird, freq: 0, pinned: false };
      newBird.freq += freq;
      if (togglePin) {
        newBird.pinned = !newBird.pinned;
      }
      commonTags[bird] = newBird;
      localStorage.setItem("commonTags", JSON.stringify(commonTags));
    };

    const togglePinTag = (label: string) => {
      storeCommonTag(label, true, 0);
      setButtonLabels(createButtonLabels());
    };

    onMounted(async () => {
      options.value = (await getClassifications()) as Option;

      buffer.value = await fetchAudioBuffer(url.value);
      const response = await api.groups.getGroupById(props.recording.groupId);
      if (response.success) {
        group.value = response.result.group;
        const settings = response.result.group.settings;
        if (settings) {
          filterHuman.value = settings.filterHuman ?? false;
          filteredAudioTags.value = settings.filteredAudioTags ?? [];
        }
        isGroupAdmin.value = response.result.group.admin;
      }
      watch(filteredAudioTags, () => {
        const currTrack = selectedTrack.value;
        if (currTrack && !tracks.value.has(currTrack.id)) {
          setSelectedTrack(null);
        }
      });
      watch(
        () => [props.recording],
        () => {
          setTracks(mappedTracks(props.recording.tracks));
          setSelectedTrack(null);
          setCacophonyIndex(props.recording.cacophonyIndex);
        },
        {
          immediate: true,
        }
      );
    });

    const isQueued = computed(() => {
      const state = props.recording.processingState.toLowerCase();
      return (
        (state === RecordingProcessingState.Analyse ||
          state === RecordingProcessingState.AnalyseThermal ||
          state === RecordingProcessingState.Tracking ||
          state === RecordingProcessingState.Reprocess) &&
        !props.recording.processing
      );
    });

    const updateGroupFilterTags = async (tags: string[]) => {
      if (group.value && isGroupAdmin.value) {
        const res = await api.groups.updateGroupSettings(group.value.id, {
          filteredAudioTags: tags,
        });
        if (res.success) {
          filteredAudioTags.value = tags;
        }
      }
    };

    const formatDateStr = (date: string) => {
      const dateObj = new Date(date);
      const day = dateObj.getDate();
      const month = dateObj.getMonth() + 1;
      const year = dateObj.getFullYear();
      const hour = dateObj.getHours();
      const min = dateObj.getMinutes();
      return `${day}/${month}/${year} ${hour}:${min
        .toString()
        .padStart(2, "0")}`;
    };

    const tags = ["cool", "requires review"];
    const currComment = ref("");
    const currTag = ref(null);
    const comments = ref<
      {
        id: string;
        taggerId: number;
        tag: string;
        comment?: string;
        tagger: string;
        date: string;
      }[]
    >([]);
    watch(
      () => props.recording,
      (recording) => {
        comments.value = recording.tags.map((tag) => ({
          id: tag.id.toString(),
          taggerId: tag.taggerId,
          tag: tag.detail,
          comment: tag.comment,
          tagger: tag.automatic ? "Automatic" : tag.taggerName,
          date: formatDateStr(tag.createdAt),
        }));
      },
      { immediate: true }
    );
    const addRecordingTag = async () => {
      const detail = currTag.value ?? "note";
      const comment = currComment.value ?? undefined;
      const tagReq: ApiRecordingTagRequest = {
        detail,
        confidence: 1,
        comment,
        automatic: false,
      };

      const res = await api.recording.addRecordingTag(
        tagReq,
        props.recording.id
      );

      if (res.success) {
        const newComment = {
          id: res.result.tagId.toString(),
          tag: detail,
          comment,
          tagger: userName,
          taggerId: userId,
          date: formatDateStr(new Date().toISOString()),
        };
        comments.value = [...comments.value, newComment];
        currComment.value = "";
        currTag.value = null;
      }
    };

    const deleteComment = async (id: string) => {
      const res = await api.recording.deleteRecordingTag(
        Number(id),
        props.recording.id
      );

      if (res.success) {
        comments.value = comments.value.filter((comment) => comment.id !== id);
      }
    };

    return {
      url,
      buffer,
      labels: buttonLabels,
      cacophonyIndex,
      showCacophonyIndex,
      deleted,
      tracks: displayTracks,
      isGroupAdmin,
      isQueued,
      selectedTrack,
      selectedLabel,
      showFilteredNoise,
      usersTag,
      deletedStation,
      sampleRate,
      setSampleRate,
      colour,
      setColour,
      playTrack,
      togglePinTag,
      toggleAttributeToTrackTag,
      tags,
      comments,
      currTag,
      currComment,
      deleteComment,
      addRecordingTag,
      addTagToSelectedTrack,
      addTagToTrack,
      setFilteredNoise,
      addTrack,
      deleteTrack,
      updateTrack,
      deleteTrackTag,
      deleteTagFromSelectedTrack,
      deleteRecording,
      undoDeleteRecording,
      undoDeleteTrack,
      updateGroupFilterTags,
      group,
      userId,
      filteredAudioTags,
    };
  },
});
</script>
<style lang="scss">
@import "~bootstrap/scss/functions";
@import "~bootstrap/scss/variables";
@import "~bootstrap/scss/mixins";

@include media-breakpoint-down(lg) {
  .tag-container {
    order: -1;
  }
}
.audio-recording-container {
  .button-selectors {
    button {
      background-color: white;
      color: #2b333f;
      border-radius: 0.5em;
      border: 1px #e8e8e8 solid;
      box-shadow: 0px 1px 2px 1px #ebebeb70;
      text-transform: capitalize;
      &:hover:enabled {
        color: #7f8c8d;
      }
    }
  }
  .audio-selected-button {
    color: #c1f951;
    background-color: #2b333f;
  }
  .undo-button {
    cursor: pointer;
    color: #485460;
    transition: color 0.1s ease-in-out;
  }
  .undo-button:hover {
    color: #d2dae2;
  }

  .undo-delete {
    height: 373px;
    color: #2565c5;
    h1 {
      font-size: calc(1em + 0.5vw);
      padding-right: min(5vw, 1.5em);
    }
  }
  .redacted {
    height: 589px;
    display: flex;
    flex-direction: column;
  }

  .redacted-help {
    position: absolute;
    right: -1.2em;
    font-size: 1.2em;
  }

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

  .track-time {
    color: #999999;
  }

  .track-colour {
    display: inline-block;
    align-self: center;
    width: 20px;
    height: 20px;
    margin-right: 10px;
    border-radius: 4px;
    transition: border 0.1s cubic-bezier(1, 0, 0, 1);
  }
  .highlight {
    box-sizing: border-box;
    box-shadow: inset 0px 0px 0px 2px #9acd32 !important;
  }
  .multiselect--disabled {
    background: none;
  }
  .multiselect__select {
    height: 41px;
  }
  .multiselect__option {
    text-transform: capitalize;
  }
  .multiselect__tags {
    min-height: 43px;
  }
  .multiselect__single {
    padding-top: 4px;
  }
  .tag-pin:enabled {
    color: #3498db;
  }
  .tag-cross:enabled {
    color: #e74c3c;
  }
  .index-container {
    display: flex;
    align-items: center;
    cursor: pointer;
    justify-content: space-between;
    border-bottom: 1px solid #e8e8e8;
    padding-top: 1.5em;
    padding-bottom: 0.5em;
    margin-bottom: 0.5em;
    h3 {
      margin-bottom: 0;
    }
  }
  .basic-container {
    border: solid 1px #e8e8e8;
    padding: 1em;
    border-radius: 0.5em;
  }
  .comment-tag {
    padding: 0.2em 0.5em;
    background: #545454;
    border-radius: 0.5em;
    font-weight: bold;
    color: white;
  }
  .notes-header {
    border-bottom: solid 1px #e8e8e8;
    margin-bottom: 1em;
  }
}
</style>
