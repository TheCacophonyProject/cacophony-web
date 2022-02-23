<template>
  <b-container class="p-0 audio-recording-container">
    <b-row class="mb-4">
      <AudioPlayer
        :tracks="tracks"
        :url="url"
        :selectedTrack="selectedTrack"
        :setSelectedTrack="setSelectedTrack"
      />
    </b-row>
    <b-row>
      <b-col lg="4">
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
        <b-button @click="addTagToSelectedTrack('bird')">Bird</b-button>
        <b-button @click="addTagToSelectedTrack('human')">Human</b-button>
        <b-button @click="addTagToSelectedTrack('unidentified')">
          Unidentifiable
        </b-button>
        <b-button @click="addTagToSelectedTrack('false-positive')">
          False Positive
        </b-button>
        <b-form @submit="handleCustomTagSubmit">
          <b-row>
            <b-form-input
              required
              class="w-50"
              @change="setCustomTag"
              placeholder="Morepork, Kia, Bellbird..."
            />
            <b-button type="submit" variant="primary">Submit</b-button>
          </b-row>
        </b-form>
      </b-col>
    </b-row>
  </b-container>
</template>

<script lang="ts">
import { PropType } from "vue";
import { produce } from "immer";
import { defineComponent } from "@vue/composition-api";

import api from "@api";
import { useState } from "@/utils";
import { TagColours } from "@/const";

import AudioPlayer from "../Audio/AudioPlayer.vue";
import TrackList from "../Audio/TrackList.vue";

import { ApiTrackResponse, ApiTrackRequest } from "@typedefs/api/track";
import {
  ApiHumanTrackTagResponse,
  ApiTrackTagRequest,
  ApiTrackTagResponse,
} from "@typedefs/api/trackTag";
import { ApiAudioRecordingResponse } from "@typedefs/api/recording";
import { TrackId } from "@typedefs/api/common";
import store from "@/stores";

export enum TagClass {
  Automatic = "automatic",
  Human = "human",
  Confirmed = "confirmed",
  Denied = "denied",
}

interface DisplayTag extends ApiTrackTagResponse {
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
    TrackList,
    AudioPlayer,
  },
  setup(props) {
    const recording = props.recording;
    const userName = store.state.User.userData.userName;
    const userId = store.state.User.userData.id;

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
          const isConfirmed = humanTags.some(
            (tag) => automaticTag.what === tag.what
          );
          if (isConfirmed) {
            return [
              {
                ...automaticTag,
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

    const mappedTracks = new Map(
      recording.tracks.map((track, index) => {
        const audioTrack = createAudioTrack(track, index);
        return [track.id, audioTrack];
      })
    );
    const [tracks, setTracks] = useState<AudioTracks>(mappedTracks);
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
          recording.id
        );

        if (response.success) {
          const id = response.result.trackId;
          const colour = TagColours[tracks.value.size % TagColours.length];
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
        what,
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
        const response = await api.recording.removeTrack(trackId, recording.id);
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
        debugger;
        if (track) {
          const renewTrack = await addTrack(track);
          const newTrack = await track.tags.reduce(
            async (promisedTrack, tag) => {
              const resolvedTrack = await promisedTrack;
              debugger;
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
            tracks.set(newTrack.id, newTrack);
          });
        }
      } catch (error) {
        console.error(error);
      }
    };

    const [customTag, setCustomTag] = useState<String>("");
    const handleCustomTagSubmit = (e: SubmitEvent) => {
      e.preventDefault();
      if (customTag) {
        const tag = customTag.value
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .replace(/\s/g, "_");
        addTagToSelectedTrack(tag);
      }
    };

    const url = props.audioUrl ? props.audioUrl : props.audioRawUrl;
    return {
      url,
      tracks,
      selectedTrack,
      setSelectedTrack,
      handleCustomTagSubmit,
      setCustomTag,
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
    border: 2px solid #9acd32;
    border-radius: 4px;
  }
}
</style>
