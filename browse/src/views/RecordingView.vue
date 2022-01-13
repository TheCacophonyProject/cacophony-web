<template>
  <b-container v-if="recording">
    <b-row>
      <b-col cols="12" lg="8" class="recording-details">
        <h4 class="recording-title">
          <GroupLink
            :group-name="groupName"
            :context="userIsMemberOfGroup ? 'devices' : 'limited-devices'"
          />
          <span>
            <font-awesome-icon
              icon="chevron-right"
              size="xs"
              style="color: #666; font-size: 16px"
            />
          </span>
          <DeviceLink
            :group-name="groupName"
            :device-name="deviceName"
            context="recordings"
            :type="recording && recording.type"
          />
        </h4>

        <h5 class="text-muted" v-if="loadingNext">Loading recording...</h5>
        <h5 class="text-muted" v-else>{{ dateString }}, {{ timeString }}</h5>

        <b-alert
          :show="showAlert"
          :variant="alertVariant"
          dismissible
          @dismissed="showAlert = false"
          >{{ alertMessage }}</b-alert
        >
      </b-col>
    </b-row>
    <AudioRecording
      v-if="isAudio"
      :recording="recording"
      :audio-url="fileSource"
      :audio-raw-url="rawSource"
      @tag-changed="refreshRecordingTagData"
      @load-next-recording="loadNextRecording"
    />
    <VideoRecording
      v-else-if="isVideo"
      :recording="recording"
      :video-url="fileSource"
      :video-raw-url="rawSource"
      :video-raw-size="rawSize"
      @track-tag-changed="refreshTrackTagData"
      @tag-changed="refreshRecordingTagData"
      @load-next-recording="loadNextRecording"
      @recording-updated="fetchRecording"
    />
  </b-container>
  <b-container v-else class="message-container">
    <div>
      {{ errorMessage || "Loading..." }}
    </div>
    <div v-if="errorMessage">
      <button
        @click="$router.push({ path: '/recordings' })"
        class="btn btn-link"
      >
        Return to recordings
      </button>
    </div>
  </b-container>
</template>

<script lang="ts">
import config from "../config";
import * as SunCalc from "suncalc";
import {
  ApiAudioRecordingResponse,
  ApiRecordingResponse,
  ApiThermalRecordingResponse,
} from "@typedefs/api/recording";
import { RecordingType } from "@typedefs/api/consts";
import api from "@api";
import { RecordingId, TagId, TrackId } from "@typedefs/api/common";
import GroupLink from "@/components/GroupLink.vue";
import DeviceLink from "@/components/DeviceLink.vue";

export default {
  name: "RecordingView",
  components: {
    GroupLink,
    DeviceLink,
    // We only ever want one of these at a time, so lazy load the required component
    VideoRecording: () => import("@/components/Video/VideoRecording.vue"),
    AudioRecording: () => import("@/components/Video/AudioRecording.vue"),
  },
  data() {
    return {
      showAlert: false,
      alertMessage: "",
      alertVariant: "",
      errorMessage: "",
      recordingInternal: null,
      downloadFileJWT: null,
      downloadRawJWT: null,
      rawSize: 0,
      fileSize: 0,
      group: null,
      loadingNext: false,
      deletedRecordings: [],
    };
  },
  computed: {
    fileSource(): string {
      return (
        (this.downloadFileJWT &&
          `${config.api}/api/v1/signedUrl?jwt=${this.downloadFileJWT}`) ||
        ""
      );
    },
    userIsMemberOfGroup() {
      return this.group !== null;
    },
    rawSource(): string {
      return `${config.api}/api/v1/signedUrl?jwt=${this.downloadRawJWT}`;
    },
    recording():
      | ApiThermalRecordingResponse
      | ApiAudioRecordingResponse
      | undefined {
      if (this.recordingInternal) {
        if (
          (this.recordingInternal as ApiRecordingResponse).type ===
          RecordingType.ThermalRaw
        ) {
          return this.recordingInternal as ApiThermalRecordingResponse;
        } else {
          return this.recordingInternal as ApiAudioRecordingResponse;
        }
      }
      return undefined;
    },
    timeString(): string {
      if (this.date) {
        return this.date.toLocaleTimeString();
      }
      return "";
    },
    dateString(): string {
      if (this.date) {
        return this.date.toDateString();
      }
      return "";
    },
    sunTimes() {
      return SunCalc.getTimes(
        this.date,
        this.recording.location.lat,
        this.recording.location.lng
      );
    },
    timeUntilDawn(): string {
      // TODO: Let's show some UI around time relative to sunset, sunrise etc.

      // Maybe this is only interesting if we're close to dawn or dusk, or if the moon is up, and full?
      // useful for audio recordings/birds too.
      const hoursUntilDawn = (this.date - this.sunTimes.dawn) / 1000 / 60 / 60;
      if (hoursUntilDawn < 0) {
        return `${-hoursUntilDawn.toFixed(1)} hours before dawn`;
      } else {
        return `${hoursUntilDawn} hours after dawn`;
      }
    },
    isVideo(): boolean {
      return this.recording.type === RecordingType.ThermalRaw;
    },
    isAudio(): boolean {
      return this.recording.type === RecordingType.Audio;
    },
    date(): Date | null {
      return (
        (this.recording.recordingDateTime &&
          new Date(this.recording.recordingDateTime)) ||
        null
      );
    },
    deviceName(): string {
      return (this.recording as ApiRecordingResponse).deviceName;
    },
    groupName(): string {
      return (this.recording as ApiRecordingResponse).groupName;
    },
  },
  watch: {
    async $route(to) {
      if (Number(to.params.id) !== this.recording.id) {
        await this.fetchRecording({ id: to.params.id, action: "updated" });
        this.loadingNext = false;
      }
    },
  },
  methods: {
    async fetchRecording({
      id,
      action,
    }: {
      id: RecordingId;
      action: "deleted" | "updated";
    }): Promise<void> {
      if (action === "deleted") {
        this.deletedRecordings.push(id);

        // Use a shorter name for `this.$createElement`
        // Create the custom close button
        const undoButton = this.$createElement(
          "b-button",
          {
            on: {
              click: async () => {
                await api.recording.undelete(id);
                this.$bvToast.hide(id.toString());
              },
            },
          },
          "Undo"
        );
        this.$bvToast.toast([undoButton], {
          id: id.toString(),
          title: `Deleted recording #${id}`,
          autoHideDelay: 15000,
          appendToast: true,
        });
      } else {
        try {
          const recordingResponse = await api.recording.id(id);
          if (recordingResponse.success) {
            const {
              result: {
                recording,
                downloadRawJWT,
                downloadFileJWT,
                rawSize,
                fileSize,
              },
            } = recordingResponse;
            this.recordingInternal = recording;
            this.downloadFileJWT = downloadFileJWT;
            this.downloadRawJWT = downloadRawJWT;
            this.rawSize = rawSize;
            this.fileSize = fileSize;
          } else {
            this.errorMessage =
              "We couldn't find the recording you're looking for.";
            this.recordingInternal = null;
          }
        } catch (err) {
          this.errorMessage =
            "We couldn't find the recording you're looking for.";
          this.recordingInternal = null;
        }
      }
    },
    async loadNextRecording(params: any): Promise<void> {
      this.loadingNext = true;
      const recordingQueryResponse = await api.recording.query(params);
      if (recordingQueryResponse.success) {
        const {
          result: { rows },
        } = recordingQueryResponse;
        if (rows.length) {
          delete params.from;
          delete params.to;
          delete params.order;
          delete params.type;
          delete params.limit;
          delete params.offset;
          await this.$router.push({
            path: `/recording/${rows[0].id}`,
            query: params,
          });
        }
      }
    },
    async refreshTrackTagData(trackId: TrackId): Promise<void> {
      // Resync all tags for the track from the API.
      const tracksResponse = await api.recording.tracks(this.recording.id);
      if (!tracksResponse.success) {
        return;
      } else {
        const {
          result: { tracks },
        } = tracksResponse;
        const track = tracks.find((track) => track.id === trackId);
        this.recording.tracks.find((track) => track.id === trackId).tags =
          track.tags;
      }
    },
    // eslint-disable-next-line no-unused-vars,@typescript-eslint/no-unused-vars
    async refreshRecordingTagData(tagId: TagId): Promise<void> {
      // Resync all recording tags from the API.
      const tagsResponse = await api.recording.id(this.recording.id);
      if (tagsResponse.success) {
        this.recording.tags = tagsResponse.result.recording.tags;
      }
    },
  },
  mounted: async function () {
    await this.fetchRecording({ id: this.$route.params.id, action: "updated" });
  },
};
</script>

<style lang="scss" scoped>
@import "~bootstrap/scss/functions";
@import "~bootstrap/scss/variables";
@import "~bootstrap/scss/mixins";

.recording-title > svg {
  vertical-align: text-bottom;
}

.recording-details {
  h4,
  h5 {
    display: inline-block;
  }
  h4 {
    margin-right: 0.2em;
  }
}

@include media-breakpoint-down(md) {
  .recording-details {
    padding-top: 0.6rem;
    padding-bottom: 0.6rem;
  }
}

@include media-breakpoint-down(sm) {
  .recording-details {
    h4 {
      font-size: 110%;
    }
    h5 {
      font-size: 90%;
    }
  }
}

@media only screen and (max-width: 321px) {
  .recording-details {
    h4 {
      font-size: 85%;
    }
    h5 {
      font-size: 65%;
      margin-bottom: 0;
    }
  }
}

@include media-breakpoint-up(md) {
  .recording-details {
    padding-top: 1rem;
    padding-bottom: 0.9rem;
    h4,
    h5 {
      display: inline-block;
    }
  }
}

.ambience {
  background: #2b333f;
  color: whitesmoke;
  border-top-left-radius: 5px;
  border-top-right-radius: 5px;
  padding: 0 5px;
  border-bottom: 1px solid darken(#2b333f, 10%);
  height: 20px;
}

.message-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding-bottom: 20%;

  div {
    display: flex;
    justify-content: center;
    text-align: center;
  }
}
</style>
