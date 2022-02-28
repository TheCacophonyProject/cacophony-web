<template>
  <b-row fluid class="audio-recording-container">
    <b-col lg="8">
      <b-row class="mb-4">
        <b-col>
          <AudioPlayer
            v-if="!deleted"
            :tracks="tracks"
            :url="url"
            :selectedTrack="selectedTrack"
            :setSelectedTrack="setSelectedTrack"
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
      <b-row v-show="!deleted">
        <b-col lg="6">
          <TrackList
            :audio-tracks="tracks"
            :selected-track="selectedTrack"
            :set-selected-track="setSelectedTrack"
            :delete-track="deleteTrack"
            :undo-delete-track="undoDeleteTrack"
            :add-tag-to-track="addTagToTrack"
          />
        </b-col>
        <b-col>
          <LabelButtonGroup
            :labels="labels"
            :add-tag-to-selected-track="addTagToSelectedTrack"
            :disabled="!selectedTrack"
            :selectedLabel="selectedLabel"
          />
          <div class="mt-2 mb-4">
            <multiselect
              v-model="customTag"
              :options="BirdLabels"
              :disabled="!selectedTrack"
              :allow-empty="false"
              :value="selectedLabel"
            />
          </div>
        </b-col>
      </b-row>
    </b-col>
    <b-col lg="3">
      <Playlist
        :recording-date-time="recording.recordingDateTime"
        :url="url"
        :delete-recording="deleteRecording"
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
import { useState } from "@/utils";
import { TagColours, BirdLabels } from "@/const";

import AudioPlayer from "../Audio/AudioPlayer.vue";
import TrackList from "../Audio/TrackList.vue";
import Playlist from "../Audio/Playlist.vue";
import LabelButtonGroup from "../Audio/LabelButtonGroup.vue";
import LabelSearchList from "../Audio/LabelSearchList.vue";
import RecordingProperties from "../Video/RecordingProperties.vue";

import { ApiTrackResponse, ApiTrackRequest } from "@typedefs/api/track";
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
      console.log(response);
      if (response.success) {
        setDeleted(true);
      }
    };

    const undoDeleteRecording = async () => {
      const response = await api.recording.undelete(props.recording.id);
      console.log(response);
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

    const addTrack = async (track: AudioTrack): Promise<AudioTrack> => {
      try {
        const trackRequest: ApiTrackRequest = {
          data: {
            start_s: track.start,
            end_s: track.end,
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
          const colour = TagColours[tracks.value.size % TagColours.length];
          console.log(colour, tracks.value.size);
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
      data: any = null
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
          userName,
        };
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

    const deleteTrack = async (trackId: TrackId) => {
      try {
        const response = await api.recording.removeTrack(
          trackId,
          props.recording.id
        );
        if (response.success) {
          modifyTrack(trackId, {
            deleted: true,
          });
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
        const track = tracks.value.get(trackId);
        if (track) {
          const renewTrack = await addTrack(track);
          const newTrack = await track.tags.reduce(
            async (promisedTrack, tag) => {
              const resolvedTrack = await promisedTrack;
              const requestTrack = await addTagToTrack(
                resolvedTrack.id,
                tag.what,
                tag.automatic,
                tag.confidence,
                tag.data
              );
              return requestTrack;
            },
            Promise.resolve(renewTrack)
          );
          setTracks((tracks) => {
            tracks.delete(trackId);
            tracks.set(newTrack.id, { ...newTrack, colour: track.colour });
          });
        }
      } catch (error) {
        console.error(error);
      }
    };
    const commonBirdLabels = [
      "Kiwi",
      "Kereru",
      "Tui",
      "Kea",
      "Morepork",
      "Bellbird",
    ];
    const otherLabels = ["Human", "Unidentified"];

    const labels = [...commonBirdLabels, ...otherLabels];
    const [selectedLabel, setSelectedLabel] = useState<string>("");
    const customTag = ref<string>(selectedLabel.value);
    watchEffect(() => {
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
        } else {
          setSelectedLabel("");
        }
      } else {
        setSelectedLabel("");
        customTag.value = "";
      }
    });
    const CapitalizedBirdLabels = BirdLabels.map(
      (label: string) => label.charAt(0).toUpperCase() + label.slice(1)
    );

    watch(customTag, (value) => {
      if (value && value !== selectedLabel.value) {
        addTagToSelectedTrack(value);
      }
    });
    watch(
      () => props.recording,
      () => {
        setTracks(mappedTracks(props.recording.tracks));
        setSelectedTrack(null);
      }
    );

    return {
      url,
      tracks,
      deleted,
      deleteRecording,
      undoDeleteRecording,
      selectedTrack,
      selectedLabel,
      setSelectedTrack,
      customTag,
      labels,
      BirdLabels: CapitalizedBirdLabels,
      addTagToSelectedTrack,
      addTagToTrack,
      addTrack,
      deleteTrack,
      undoDeleteTrack,
    };
  },
});
</script>
<style lang="scss">
@import "~bootstrap/scss/functions";
@import "~bootstrap/scss/variables";
@import "~bootstrap/scss/mixins";

#waveform {
  width: 100%;
  height: 50px;
}
.audio-recording-container {
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
    box-shadow: inset 0px 0px 0px 2px #9acd32;
  }
  .multiselect--disabled {
    background: none;
  }
  .multiselect__select {
    height: 41px;
  }
  .multiselect__tags {
    min-height: 43px;
  }
  .multiselect__single {
    padding-top: 4px;
  }
}
</style>
