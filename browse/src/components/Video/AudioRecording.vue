<template>
  <b-row fluid class="audio-recording-container">
    <b-col lg="8">
      <b-row class="mb-4">
        <b-col>
          <AudioPlayer
            :key="url"
            v-if="!deleted"
            :tracks="tracks"
            :url="url"
            :duration="recording.duration"
            :selectedTrack="selectedTrack"
            :setSelectedTrack="playTrack"
          />
          <b-row
            v-else
            class="undo-delete w-100 justify-content-center align-items-center"
            @click="undoDeleteRecording"
            role="button"
          >
            <h1 class="pr-2">Undo Delete Recording</h1>
            <font-awesome-icon class="mb-2" icon="undo" size="2x" />
          </b-row>
        </b-col>
      </b-row>
      <b-row class="bottom-container" v-show="!deleted">
        <b-col lg="6">
          <TrackList
            :audio-tracks="tracks"
            :selected-track="selectedTrack"
            :play-track="playTrack"
            :delete-track="deleteTrack"
            :undo-delete-track="undoDeleteTrack"
            :add-tag-to-track="addTagToTrack"
          />
        </b-col>
        <b-col>
          <div class="mt-2 mb-2 d-flex align-items-center">
            <multiselect
              v-model="customTag"
              :options="BirdLabels"
              :disabled="!selectedTrack"
              :value="selectedLabel"
              :show-labels="false"
            />
            <font-awesome-icon
              role="button"
              class="mx-4 text-primary"
              icon="thumbtack"
              size="2x"
              v-b-tooltip.hover
              title="Pin current tag to buttons"
            />
          </div>
          <LabelButtonGroup
            :labels="labels"
            :add-tag-to-selected-track="addTagToSelectedTrack"
            :delete-tag-from-selected-track="deleteTagFromSelectedTrack"
            :disabled="!selectedTrack"
            :selectedLabel="selectedLabel"
          />
          <b-row
            v-if="usersTag"
            class="
              d-flex
              mt-2
              flex-wrap
              justify-content-center
              attribute-selectors
            "
          >
            <h3 class="w-100 ml-4">Attributes</h3>
            <b-button-group class="mr-2">
              <b-button
                :class="{
                  highlight: usersTag.data && usersTag.data.gender === 'male',
                }"
                @click="
                  addAttributeToTrackTag(
                    { gender: 'male' },
                    selectedTrack.id,
                    usersTag.id
                  )
                "
                :disabled="!selectedTrack"
                >Male</b-button
              >
              <b-button
                :class="{
                  highlight: usersTag.data && usersTag.data.gender === 'female',
                }"
                @click="
                  addAttributeToTrackTag(
                    { gender: 'female' },
                    selectedTrack.id,
                    usersTag.id
                  )
                "
                :disabled="!selectedTrack"
                >Female</b-button
              >
            </b-button-group>
            <b-button-group class="ml-2">
              <b-button
                :class="{
                  highlight:
                    usersTag.data && usersTag.data.maturity === 'adult',
                }"
                @click="
                  addAttributeToTrackTag(
                    { maturity: 'adult' },
                    selectedTrack.id,
                    usersTag.id
                  )
                "
                :disabled="!selectedTrack"
                >Adult</b-button
              >
              <b-button
                :class="{
                  highlight:
                    usersTag.data && usersTag.data.maturity === 'juvenile',
                }"
                @click="
                  addAttributeToTrackTag(
                    { maturity: 'juvenile' },
                    selectedTrack.id,
                    usersTag.id
                  )
                "
                :disabled="!selectedTrack"
                >Juvenile</b-button
              >
            </b-button-group>
          </b-row>
        </b-col>
      </b-row>
    </b-col>
    <b-col lg="4">
      <Playlist
        :recording-date-time="recording.recordingDateTime"
        :url="url"
        :delete-recording="deleteRecording"
      />
      <CacophonyIndexGraph
        v-if="cacophonyIndex"
        class="mt-2"
        :cacophony-index="cacophonyIndex"
        :id="recording.id"
      />
      <RecordingProperties :recording="recording" />
    </b-col>
  </b-row>
</template>

<script lang="ts">
import { PropType } from "vue";
import { produce } from "immer";
import { defineComponent, ref, watch, watchEffect } from "@vue/composition-api";
import Multiselect from "vue-multiselect";

import api from "@api";
import store from "@/stores";
import { useState, UUIDv4 } from "@/utils";
import { TagColours, BirdLabels } from "@/const";

import AudioPlayer from "../Audio/AudioPlayer.vue";
import TrackList from "../Audio/TrackList.vue";
import Playlist from "../Audio/Playlist.vue";
import LabelButtonGroup from "../Audio/LabelButtonGroup.vue";
import CacophonyIndexGraph from "../Audio/CacophonyIndexGraph.vue";
import RecordingProperties from "../Video/RecordingProperties.vue";

import { ApiTrackResponse, ApiTrackRequest } from "@typedefs/api/track";
import { ApiTrackTagAttributes } from "@typedefs/api/trackTag";
import {
  ApiTrackTagRequest,
  ApiTrackTagResponse,
} from "@typedefs/api/trackTag";
import { ApiAudioRecordingResponse } from "@typedefs/api/recording";
import { TrackId } from "@typedefs/api/common";

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
    AudioPlayer,
    Playlist,
    TrackList,
    CacophonyIndexGraph,
    RecordingProperties,
    LabelButtonGroup,
    Multiselect,
  },
  setup(props) {
    const userName = store.state.User.userData.userName;
    const userId = store.state.User.userData.id;
    const [url, setUrl] = useState(
      props.audioUrl ? props.audioUrl : props.audioRawUrl
    );
    const [deleted, setDeleted] = useState(false);
    watch(
      () => [props.audioUrl, props.audioRawUrl],
      () => {
        setUrl(props.audioUrl ? props.audioUrl : props.audioRawUrl);
        setDeleted(false);
      }
    );

    const deleteRecording = async () => {
      const response = await api.recording.del(props.recording.id);
      if (response.success) {
        setDeleted(true);
      }
    };

    const undoDeleteRecording = async () => {
      const response = await api.recording.undelete(props.recording.id);
      if (response.success) {
        setDeleted(false);
      }
    };

    const getDisplayTags = (track: ApiTrackResponse): DisplayTag[] => {
      const automaticTag = track.tags.find((tag) => tag.automatic);
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
      if (automaticTag) {
        if (humanTags.length > 0) {
          const confirmedTag = humanTags.find(
            (tag) => automaticTag.what === tag.what
          );
          if (confirmedTag) {
            return [
              {
                ...confirmedTag,
                class: TagClass.Confirmed,
              },
            ];
          } else {
            // check if all human tags are the same
            return [
              {
                ...humanTag,
                class: TagClass.Human,
              },
              {
                ...automaticTag,
                class: TagClass.Denied,
              },
            ];
          }
        } else {
          return [
            {
              ...automaticTag,
              class: TagClass.Automatic,
            },
          ];
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
        ...track,
        colour: TagColours[index % TagColours.length],
        displayTags,
        confirming: false,
        deleted: false,
      };
    };

    const mappedTracks = (tracks: ApiTrackResponse[]) =>
      new Map(
        tracks.map((track, index) => {
          const audioTrack = createAudioTrack(track, index);
          return [track.id, audioTrack];
        })
      );

    const [tracks, setTracks] = useState<AudioTracks>(
      mappedTracks(props.recording.tracks)
    );
    const [selectedTrack, setSelectedTrack] = useState<AudioTrack>(null);

    const playTrack = (track?: AudioTrack) => {
      if (track) {
        setSelectedTrack(() => ({
          ...track,
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
            positions: track.positions,
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
        console.error(error);
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
      data: any = null,
      username = userName
    ): Promise<AudioTrack> => {
      const track = tracks.value.get(trackId);
      if (track) {
        modifyTrack(trackId, {
          confirming: true,
        });
      }
      const tag: ApiTrackTagRequest = {
        what: what.toLowerCase(),
        automatic,
        confidence,
        ...(data && { data: JSON.stringify(data) }),
      };
      const response = await api.recording.replaceTrackTag(
        tag,
        props.recording.id,
        Number(trackId),
        tag.automatic
      );
      if (response.success) {
        const newTag: ApiTrackTagResponse = {
          ...tag,
          id: response.result.trackTagId ?? 0,
          trackId,
          data,
          userId,
          automatic,
          userName: username,
        };
        const currTags = track.tags.filter((tag) => tag.userId !== userId);
        const newTags = [...currTags, newTag];
        setUsersTag(newTag);
        const taggedTrack = modifyTrack(trackId, {
          confirming: false,
          tags: newTags,
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

    const addAttributeToTrackTag = async (
      attr: Partial<ApiTrackTagAttributes>,
      trackId: TrackId,
      tagId: number
    ) => {
      try {
        const response = await api.recording.updateTrackTag(
          attr,
          props.recording.id,
          trackId,
          tagId
        );
        if (response.success) {
          setTracks((tracks) => {
            tracks.get(trackId).tags.forEach((tag) => {
              if (tag.id === tagId) {
                tag.data = {
                  ...tag.data,
                  ...attr,
                };
              }
            });
          });
          const newTag = tracks.value
            .get(trackId)
            .tags.find((tag) => tag.id === tagId);
          setUsersTag(newTag);
        }
      } catch (error) {
        console.error(error);
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
        if (selectedTrack.value.id === -1) {
          const track = await addTrack(selectedTrack.value);
          setSelectedTrack(track);
        }
        const newTrack = await addTagToTrack(selectedTrack.value.id, tag);
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
          setSelectedTrack(newTrack);
        }
      }
    };

    const deleteTrack = async (trackId: TrackId, permanent = false) => {
      try {
        const response = await api.recording.deleteTrack(
          trackId,
          props.recording.id
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
        console.error(error);
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
        console.error(error);
      }
    };

    const [cacophonyIndex, setCacophonyIndex] = useState(
      props.recording.cacophonyIndex
    );

    watch(
      () => props.recording,
      () => {
        setTracks(mappedTracks(props.recording.tracks));
        setSelectedTrack(null);
        setCacophonyIndex(props.recording.cacophonyIndex);
      }
    );

    const createButtonLabels = (): string[] => {
      const maxBirdButtons = 6;
      const storedCommonBirds = Object.values(
        JSON.parse(localStorage.getItem("commonBirds")) ?? {}
      )
        .sort((a: { freq: number }, b: { freq: number }) => b.freq - a.freq)
        .map((bird: { what: string }) => bird.what.toLowerCase());
      const commonBirdLabels = [
        "Morepork",
        "Kiwi",
        "Kereru",
        "Tui",
        "Kea",
        "Bellbird",
      ].filter((val: string) => !storedCommonBirds.includes(val.toLowerCase()));
      const amountToRemove = Math.min(maxBirdButtons, storedCommonBirds.length);
      const diffToMax = maxBirdButtons - amountToRemove;
      const commonBirds = [
        ...storedCommonBirds.slice(0, amountToRemove),
        ...commonBirdLabels.splice(0, diffToMax),
      ];

      const otherLabels = ["Bird", "Human", "Unidentified"];

      const labels = [...commonBirds, ...otherLabels];
      return labels;
    };
    const [buttonLabels, setButtonLabels] = useState(createButtonLabels());
    const [selectedLabel, setSelectedLabel] = useState<string>("");
    const [usersTag, setUsersTag] = useState<ApiTrackTagResponse>(null);
    const customTag = ref<string>(selectedLabel.value);
    watch(
      selectedTrack,
      () => {
        if (selectedTrack.value) {
          const tag = selectedTrack.value.displayTags.find((tag) => {
            if (tag.userId === userId) {
              return true;
            }
            return false;
          });
          if (tag) {
            const capitalizedTag =
              tag.what.charAt(0).toUpperCase() + tag.what.slice(1);
            setSelectedLabel(capitalizedTag);
            customTag.value = capitalizedTag;
            setUsersTag(tag);
          } else {
            setSelectedLabel("");
            setUsersTag(null);
          }
        } else {
          setSelectedLabel("");
          setUsersTag(null);
          customTag.value = "";
        }
      },
      {
        deep: true,
      }
    );

    const storeCommonBird = (bird: string) => {
      const commonBirds = JSON.parse(localStorage.getItem("commonBirds")) ?? {};
      const newBird = commonBirds[bird]
        ? commonBirds[bird]
        : { what: bird, freq: 0 };
      newBird.freq += 1;
      commonBirds[bird] = newBird;
      localStorage.setItem("commonBirds", JSON.stringify(commonBirds));
    };

    watch(customTag, (value) => {
      if (value && value !== selectedLabel.value) {
        addTagToSelectedTrack(value);
        storeCommonBird(value);
        setButtonLabels(createButtonLabels());
      }
    });
    return {
      url,
      tracks,
      deleted,
      deleteRecording,
      undoDeleteRecording,
      selectedTrack,
      selectedLabel,
      usersTag,
      playTrack,
      customTag,
      cacophonyIndex,
      labels: buttonLabels,
      BirdLabels: BirdLabels.sort(),
      addTagToSelectedTrack,
      addTagToTrack,
      addAttributeToTrackTag,
      addTrack,
      deleteTrack,
      deleteTrackTag,
      deleteTagFromSelectedTrack,
      undoDeleteTrack,
    };
  },
});
</script>
<style lang="scss">
@import "~bootstrap/scss/functions";
@import "~bootstrap/scss/variables";
@import "~bootstrap/scss/mixins";

@include media-breakpoint-down(lg) {
  .bottom-container {
    flex-direction: column-reverse;
  }
}
.audio-recording-container {
  .attribute-selectors {
    button {
      padding: 0.5em 1em;
      background-color: white;
      color: #2b333f;
      border-radius: 0.5em;
      border: 1px #e8e8e8 solid;
      box-shadow: 0px 1px 2px 1px #ebebeb70;
      text-transform: capitalize;
      &:hover {
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
  .classification-header {
    font-weight: bold;
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
}
</style>
