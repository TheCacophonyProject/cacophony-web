<template>
  <b-container v-if="recording">
    <b-row>
      <b-col cols="12" lg="8" class="recording-details">
        <h4 class="recording-title">
          <router-link
            :to="{
              name: 'device',
              params: {
                deviceName,
                groupName,
                tabName: 'recordings',
              },
            }"
          >
            <font-awesome-icon
              icon="microchip"
              size="xs"
              style="color: #666; font-size: 16px"
            />
            {{ deviceName }}
          </router-link>
        </h4>

        <h5 class="text-muted">{{ dateString }}, {{ timeString }}</h5>

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

export default {
  name: "RecordingView",
  components: {
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
        await this.fetchRecording(to.params.id);
      }
    },
  },
  methods: {
    async fetchRecording(id: RecordingId): Promise<void> {
      try {
        const {
          success,
          result: {
            recording,
            downloadRawJWT,
            downloadFileJWT,
            rawSize,
            fileSize,
          },
        } = await api.recording.id(id);
        if (!success) {
          this.errorMessage =
            "We couldn't find the recording you're looking for.";
          this.recordingInternal = null;
        } else {
          this.recordingInternal = recording;
          this.downloadFileJWT = downloadFileJWT;
          this.downloadRawJWT = downloadRawJWT;
          this.rawSize = rawSize;
          this.fileSize = fileSize;
        }
      } catch (err) {
        this.errorMessage =
          "We couldn't find the recording you're looking for.";
        this.recordingInternal = null;
      }
    },
    async loadNextRecording(params: any): Promise<void> {
      console.log("Loading next recording", params);
      const {
        result: { rows },
        success,
      } = await api.recording.query(params);
      if (!success || !rows || rows.length == 0) {
        //  store.dispatch("Messaging/WARN", `No more recordings for this search.`);
      } else {
        await this.$router.push(`/recording/${rows[0].id}`);
      }
    },
    async refreshTrackTagData(trackId: TrackId): Promise<void> {
      // Resync all tags for the track from the API.
      const {
        success,
        result: { tracks },
      } = await api.recording.tracks(this.recording.id);
      if (!success) {
        return;
      }
      const track = tracks.find((track) => track.id === trackId);
      this.recording.tracks.find((track) => track.id === trackId).tags =
        track.tags;
    },
    async refreshRecordingTagData(tagId: TagId): Promise<void> {
      // Resync all recording tags from the API.
      const {
        success,
        result: {
          recording: { tags },
        },
      } = await api.recording.id(this.recording.id);
      if (success) {
        this.recording.tags = tags;
      } else {
        // FIXME - can this ever really happen in a recoverable way?
      }
    },
  },
  mounted: async function () {
    await this.fetchRecording(this.$route.params.id);
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
