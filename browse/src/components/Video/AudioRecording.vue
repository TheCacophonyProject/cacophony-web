<template>
  <b-container>
    <b-row class="mb-4">
      <b-col cols="12" lg="8">
        <div id="spectrogram"></div>
        <div class="player-bar">
          <font-awesome-icon
            class="mx-2"
            :icon="['fa', playing ? 'pause' : 'play']"
            size="2x"
            style="cursor: pointer"
            @click="togglePlay"
          />
          <div id="waveform"></div>
        </div>
      </b-col>
    </b-row>
    <b-row>
      <b-col cols="6" lg="4"> </b-col>
      <b-col colclass="db m-0 no-gutters">
        <b-col offset="1" class="mt-0 ml-0 db" cols="12">
          <BasicTags @addAudioTag="addAudioTag($event)" />
          <CustomTags @addAudioTag="addAudioTag($event)" />
          <b-button class="float-right mt-3 mr-1" size="lg" @click="done()"
            >Done</b-button
          >
        </b-col>
        <b-col offset="9" md="3" class="mt-3">
          <b-button
            v-b-tooltip.hover.bottomleft="'Delete this recording'"
            :disabled="deleteDisabled"
            variant="danger"
            block
            @click="deleteRecording()"
          >
            <font-awesome-icon
              icon="exclamation-triangle"
              class="d-none d-md-inline"
            />
            Delete
          </b-button>
        </b-col>
      </b-col>
    </b-row>
  </b-container>
</template>

<script lang="ts">
import Vue from "vue";
import WaveSurfer from "wavesurfer.js";
import SpectrogramPlugin from "wavesurfer.js/src/plugin/spectrogram/index.js";
import api from "@api";
import BasicTags from "../Audio/BasicTags.vue";
import CustomTags from "../Audio/CustomTags.vue";
import TrackList from "../Audio/TrackList.vue";
import CacophonyIndexGraph from "../Audio/CacophonyIndexGraph.vue";
import { ApiAudioRecordingResponse } from "@typedefs/api/recording";
import {
  ApiRecordingTagRequest,
  ApiRecordingTagResponse,
} from "@typedefs/api/tag";
import { RecordingType } from "@typedefs/api/consts";
import { TagId } from "@typedefs/api/common";

export default Vue.extend({
  name: "AudioRecording",
  data() {
    return {
      deleteDisabled: false,
      playing: false,
      waveSurfer: null as WaveSurfer | null,
    };
  },
  components: {
    CustomTags,
    BasicTags,
    TrackList,
    CacophonyIndexGraph,
  },
  props: {
    recording: {
      type: Object,
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
  computed: {
    tagItems() {
      const tagItems = this.recording.tags.map((tag) => {
        const tagItem: any = {};
        if (tag.what) {
          tagItem.what = tag.what;
        }
        tagItem.detail = tag.detail;
        if (tag.confidence) {
          tagItem.confidence = tag.confidence.toFixed(2);
        }
        if (tag.automatic) {
          tagItem.who = "Cacophony AI";
          tagItem["_rowVariant"] = "warning";
        } else {
          tagItem.who = tag.taggerName || "-";
        }
        tagItem.when = new Date(tag.createdAt).toLocaleString();
        const startTime = tag.startTime || 0;
        tagItem.startTime = startTime;
        tagItem.tag = tag;
        return tagItem;
      });
      return this.recording.tracks
        .flatMap((track) => {
          return track.tags.map((tag) => ({
            what: tag.what,
            who: tag.data.name,
            when: new Date().toLocaleString(),
            startTime: track.start,
          }));
        })
        .concat(tagItems);
    },
    audioRecording(): ApiAudioRecordingResponse {
      return this.recording;
    },
  },
  mounted() {
    // initialize wavesurfer as spectrogram
    this.$nextTick(() => {
      this.waveSurfer = WaveSurfer.create({
        container: "#waveform",
        barWidth: 3,
        barHeight: 1,
        barGap: 1,
        height: 50,
        backgroundColor: "#2B333F",
        progressColor: "#FFF",
        cursorColor: "#FFF",
        waveColor: "#FFF",
        pixelRatio: 1,
        hideScrollbar: true,
        responsive: true,
        normalize: true,
        cursorWidth: 1,
        plugins: [
          SpectrogramPlugin.create({
            container: "#spectrogram",
            fftSamples: 512,
            labels: true,
          }),
        ],
      });
      this.waveSurfer.load(this.audioRawUrl);
    });
  },
  methods: {
    togglePlay() {
      this.playing = !this.playing;
      if (this.playing) {
        this.waveSurfer.play();
      } else {
        this.waveSurfer.pause();
      }
    },
    async getNextRecording(
      direction: "next" | "previous" | "either"
    ): Promise<boolean> {
      const params: any = {
        limit: 1,
        offset: 0,
        type: RecordingType.Audio,
      };
      let order;
      switch (direction) {
        case "next":
          params.to = null;
          params.from = this.recording.recordingDateTime;
          order = "ASC";
          break;
        case "previous":
          params.from = null;
          params.to = this.recording.recordingDateTime;
          order = "DESC";
          break;
        case "either":
          // First, we want to see if we have a previous recording.
          // If so, go prev, else go next
          if (await this.getNextRecording("previous")) {
            return true;
          } else if (await this.getNextRecording("next")) {
            return true;
          }
          return false;
        default:
          throw `invalid direction: '${direction}'`;
      }
      params.order = JSON.stringify([["recordingDateTime", order]]);
      // Check for recording"
      const queryResponse = await api.recording.query(params);
      if (queryResponse.success) {
        const {
          result: { rows },
        } = queryResponse;
        if (rows.length) {
          this.$emit("load-next-recording", params);
          return true;
        }
        return false;
      }
      return false;
    },
    async deleteRecording() {
      this.deleteDisabled = true;
      const { success } = await api.recording.del(this.$route.params.id);
      if (success) {
        await this.getNextRecording("either");
      }
      this.deleteDisabled = false;
    },
    addAudioTag: async function (tag: ApiRecordingTagRequest) {
      const id = Number(this.$route.params.id);
      if (this.$refs.player.currentTime == this.$refs.player.duration) {
        tag.startTime = 0;
      } else {
        tag.startTime = Number(this.$refs.player.currentTime.toFixed(2));
      }
      const addTagResult = await api.recording.addRecordingTag(tag, id);
      if (addTagResult.success) {
        const {
          result: { tagId },
        } = addTagResult;
        this.$nextTick(() => {
          this.$emit("tag-changed", tagId);
        });
      }
    },
    async deleteTag(tagId: TagId) {
      const id = Number(this.$route.params.id);
      await api.recording.deleteRecordingTag(tagId, id);
      this.$nextTick(() => {
        this.$emit("tag-changed", tagId);
      });
    },
    async done() {
      await this.getNextRecording("either");
    },
    replay(time: string) {
      this.$refs.player.currentTime = time;
      this.waveform.play();
    },
  },
});
</script>
<style lang="scss">
.player-bar {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem;
  border-radius: 0 0 0.25rem 0.25rem;
  background-color: #2b333f;
  color: #fff;
  width: 100%;
}
#waveform {
  width: 100%;
  height: 50px;
}
#spectrogram {
  width: 100%;
}
.spec-labels {
  position: relative !important;
  background-color: #152338;
}
</style>
