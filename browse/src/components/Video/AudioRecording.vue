<template>
  <b-container>
    <b-row class="mb-4">
      <b-col cols="12" lg="8">
        <div id="spectrogram"></div>
        <div id="waveform"></div>
        <div class="player-bar">
          <font-awesome-icon
            class="play-button"
            :icon="['fa', playing ? 'pause' : 'play']"
            size="2x"
            style="cursor: pointer"
            @click="togglePlay"
          />
          <div>
            <font-awesome-icon
              class="volume-button"
              :icon="['fa', 'volume-up']"
              size="2x"
              style="cursor: pointer"
              @click="toggleMute"
            />
            <input
              class="volume-slider"
              type="range"
              min="0"
              max="1"
              step="0.01"
              v-model="volume"
              @change="setVolume"
            />
          </div>
        </div>
      </b-col>
    </b-row>
    <b-row>
      <b-col cols="8" lg="4">
        <TrackList :selectTrack="selectTrack" :tracks="recording.tracks" />
      </b-col>
      <b-col colclass="db m-0 no-gutters">
        <b-row class="h-5">
          <div v-if="selectedTrack">
            <SelectedTrack :track="selectedTrack" />
          </div>
        </b-row>
        <b-row>
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
        </b-row>
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
import SelectedTrack from "../Audio/SelectedTrack.vue";
import CacophonyIndexGraph from "../Audio/CacophonyIndexGraph.vue";
import { ApiAudioRecordingResponse } from "@typedefs/api/recording";
import { ApiRecordingTagRequest } from "@typedefs/api/tag";
import { RecordingType } from "@typedefs/api/consts";
import { TagId } from "@typedefs/api/common";
import { TagColours } from "@/const";
import ColorMap from "colormap";
import { ApiTrackResponse } from "@typedefs/api/track";

export interface AudioTrack {
  id: number;
  start: number;
  end: number;
  tag: { what: string; confidence: number; who: string };
}

export default Vue.extend({
  name: "AudioRecording",
  data: function () {
    return {
      deleteDisabled: false,
      playing: false,
      waveSurfer: null as WaveSurfer | null,
      spectrogram: null as HTMLCanvasElement | null,
      overlay: null as SVGElement | null,
      selectedTrack: null as AudioTrack | null,
      volume: 1,
      muted: false,
      trackPointer: {
        scale: 1,
        pointerDown: false,
        time: 0,
        pos: { start: { x: 0, y: 0 }, current: { x: 0, y: 0 } },
      },
    };
  },
  components: {
    CustomTags,
    BasicTags,
    TrackList,
    SelectedTrack,
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
            colorMap: ColorMap({
              colormap: "electric",
              nshades: 256,
              format: "float",
            }),
          }),
        ],
      });
      this.waveSurfer.load(this.audioRawUrl);
      this.waveSurfer.on("ready", () => {
        this.spectrogram = document.querySelector(
          "spectrogram canvas"
        ) as HTMLCanvasElement;
        const svgns = "http://www.w3.org/2000/svg";
        //get image from canvas
        //create svg element

        this.spectrogram.style.zIndex = "0";
        //create svg element for track overlay
        this.overlay = document.createElementNS(svgns, "svg");
        this.spectrogram.parentElement.appendChild(this.overlay);

        this.overlay.style.position = "absolute";
        this.overlay.style.zIndex = "1";
        this.overlay.style.top = "0";
        this.overlay.style.left = "0";
        this.overlay.style.cursor = "pointer";
        this.overlay.style.width = "100%";
        this.overlay.style.height = "100%";
        this.overlay.setAttribute(
          "width",
          this.spectrogram.width.toString() + "px"
        );
        this.overlay.setAttribute(
          "height",
          this.spectrogram.height.toString() + "px"
        );
        this.overlay.setAttribute(
          "viewBox",
          `0 0 ${this.spectrogram.width} ${this.spectrogram.height}`
        );
        this.overlay.setAttribute("xmlns", svgns);

        const img = new Image();
        img.src = this.spectrogram.toDataURL("image/png");
        const svgImg = document.createElementNS(svgns, "image");
        svgImg.setAttributeNS("http://www.w3.org/1999/xlink", "href", img.src);
        svgImg.setAttribute("width", this.spectrogram.width.toString());
        svgImg.setAttribute("height", this.spectrogram.height.toString());
        svgImg.setAttribute("x", "0");
        svgImg.setAttribute("y", "0");
        this.overlay.appendChild(svgImg);

        this.spectrogram.parentElement.removeChild(this.spectrogram);

        this.addTracksToOverlay();

        const color = TagColours[this.recording.tracks.length];
        this.overlay.addEventListener("mousedown", (e: DragEvent) => {
          e.preventDefault();
          console.log("test");
          const x = e.offsetX;
          const y = e.offsetY;

          this.trackPointer.pointerDown = true;
          this.trackPointer.time = Date.now();
          this.trackPointer.pos.start = { x, y };
          // create or get svg rect in overlay with id new_track
          let rect = document.getElementById(
            "new_track"
          ) as unknown as SVGRectElement;
          if (!rect) {
            rect = document.createElementNS(svgns, "rect");
          }

          rect.setAttribute("x", x.toString());
          rect.setAttribute("y", y.toString());
          rect.setAttribute("width", "0");
          rect.setAttribute("height", "0");
          rect.setAttribute("id", "new_track");
          rect.setAttribute("stroke", color);
          rect.setAttribute("stroke-width", "2");
          rect.setAttribute("fill", "none");
          this.overlay.appendChild(rect);
        });
        this.overlay.addEventListener("mousemove", (e: DragEvent) => {
          e.preventDefault();
          if (this.trackPointer.pointerDown) {
            const startX = this.trackPointer.pos.start.x;
            const startY = this.trackPointer.pos.start.y;
            const x = e.offsetX;
            const y = e.offsetY;
            const width = Math.abs(x - startX);
            const height = Math.abs(y - startY);
            const rectX = Math.min(startX, x);
            const rectY = Math.min(startY, y);

            requestAnimationFrame(() => {
              // Get the rect element from overlay
              const rect = document.getElementById("new_track");
              rect.setAttribute("x", rectX.toString());
              rect.setAttribute("y", rectY.toString());
              rect.setAttribute("width", width.toString());
              rect.setAttribute("height", height.toString());
            });
          }
        });
        this.overlay.addEventListener("mouseleave", (e) => {
          e.preventDefault();
          this.trackPointer.pointerDown = false;
        });
        this.overlay.addEventListener("pointerup", (e: DragEvent) => {
          e.preventDefault();
          //draw circle on drag
          const x = e.offsetX;
          const normalizedX = x / this.spectrogram.width;
          const time = Date.now();
          if (time - this.trackPointer.time > 500) {
            //TODO: Add track to recording
          } else {
            this.waveSurfer.seekTo(normalizedX);
            this.play();
          }
          this.trackPointer.pointerDown = false;
          console.log("dragEnd", x);
        });
      });
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
    play() {
      if (!this.playing) {
        this.togglePlay();
      }
    },
    playAt(time: number) {
      const normalizedTime = time / this.recording.duration;
      this.waveSurfer.seekTo(normalizedTime);
      this.play();
    },
    setVolume() {
      this.waveSurfer.setVolume(this.volume);
    },
    toggleMute() {
      this.muted = !this.muted;
      if (this.muted) {
        this.waveSurfer.setVolume(0);
      } else {
        this.waveSurfer.setVolume(this.volume);
      }
    },
    addTracksToOverlay() {
      this.recording.tracks.forEach(
        (track: ApiTrackResponse, index: number) => {
          const color = TagColours[0];
          const normalizedStart = track.start / this.recording.duration;
          const normalizedEnd = track.end / this.recording.duration;
          const x = normalizedStart * this.spectrogram.width;
          const width =
            (normalizedEnd - normalizedStart) * this.spectrogram.width;
          const rect = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "rect"
          );
          rect.setAttribute("x", x.toString());
          rect.setAttribute("y", "0");
          rect.setAttribute("width", width.toString());
          rect.setAttribute("height", "100%");
          rect.setAttribute("stroke", color);
          rect.setAttribute("stroke-width", "2");
          rect.setAttribute("fill", "none");
          rect.setAttribute("id", track.id.toString());
          this.overlay.appendChild(rect);
        }
      );
    },
    selectTrack(track: AudioTrack) {
      this.selectedTrack = track;
      this.playAt(track.start);
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
spectrogram {
  width: 100%;
  border-radius: 0.25rem 0.25rem 0 0;
}
.spec-labels {
  background-color: #152338;
}
.play-button {
  margin: 0 0.35em 0 0.35em;
}
.volume-slider {
  display: none;
  position: absolute;
  transform: rotate(-90deg);
  bottom: 100px;
  right: -25px;
  z-index: 2;
}
.volume-button {
  padding-top: 0.1em;
}
.volume-button:hover + .volume-slider {
  display: block;
}
.volume-slider:hover {
  display: block;
}
</style>
