<template>
  <b-container class="audio-recording-container">
    <b-row class="mb-4">
      <b-col class="p-0">
        <div id="spectrogram">
          <div v-if="finished" class="pause-screen-overlay" @click="replay">
            <font-awesome-icon :icon="['fa', 'redo-alt']" size="2x" />
          </div>
        </div>
        <div id="waveform"></div>
        <div class="player-bar">
          <div>
            <font-awesome-icon
              class="play-button"
              :icon="['fa', isPlaying ? 'pause' : 'play']"
              size="2x"
              style="cursor: pointer"
              @click="togglePlay"
            />
          </div>
          <div class="selected-track-container" v-if="selectedTrack">
            <SelectedTrack :track="selectedTrack" />
            <font-awesome-icon
              class="ml-2"
              :icon="['fa', 'times']"
              size="1x"
              style="cursor: pointer"
              @click="deselectTrack"
            />
          </div>
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
      <b-col lg="4">
        <TrackList
          :playTrack="playTrack"
          :tracks="tracks"
          :deleteTrack="deleteTrack"
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
        <b-form @submit="addTagToSelectedTrack">
          <b-row>
            <b-form-input
              required
              class="w-50"
              v-model="customTagValue"
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
import Vue from "vue";
import WaveSurfer from "wavesurfer.js";
import SpectrogramPlugin from "wavesurfer.js/src/plugin/spectrogram/index.js";
import api from "@api";
import BasicTags from "../Audio/BasicTags.vue";
import CustomTags from "../Audio/CustomTags.vue";
import TrackList from "../Audio/TrackList.vue";
import SelectedTrack from "../Audio/SelectedTrack.vue";
import CacophonyIndexGraph from "../Audio/CacophonyIndexGraph.vue";
import { TagColours } from "@/const";
import ColorMap from "colormap";
import { ApiTrackResponse, ApiTrackRequest } from "@typedefs/api/track";
import {
  ApiHumanTrackTagResponse,
  ApiTrackTagRequest,
  ApiTrackTagResponse,
} from "@typedefs/api/trackTag";

interface AudioTrack extends ApiTrackResponse {
  colour: string;
  selected: boolean;
}

export default Vue.extend({
  name: "AudioRecording",
  data: function () {
    return {
      tracks: [],
      player: null as WaveSurfer | null,
      spectrogram: null as HTMLCanvasElement | null,
      overlay: null as SVGElement | null,
      deleteDisabled: false,
      trackPointer: {
        scale: 1,
        pointerDown: false,
        time: 0,
        pos: { start: { x: 0, y: 0 }, current: { x: 0, y: 0 } },
      },
      customTagValue: "",
      isPlaying: false,
      loop: false,
      volume: 1,
      muted: false,
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
  mounted() {
    this.tracks = this.recording.tracks.map(
      (track: ApiTrackResponse, index: number) => {
        return {
          ...track,
          colour: TagColours[index],
          selected: false,
        };
      }
    );

    // initialize wavesurfer as spectrogram
    this.$nextTick(() => {
      this.player = WaveSurfer.create({
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

      this.player.load(this.audioRawUrl);
      this.player.on("finish", () => {
        this.isPlaying = false;
      });
      this.player.on("pause", () => {
        this.isPlaying = false;
      });
      this.player.on("play", () => {
        this.isPlaying = true;
      });
      this.player.on("ready", () => {
        this.spectrogram = document.querySelector(
          "spectrogram canvas"
        ) as HTMLCanvasElement;
        this.spectrogram.style.zIndex = "0";
        const overlay = {
          style: {
            position: "absolute",
            zIndex: 1,
            top: 0,
            left: 0,
            cursor: "pointer",
            width: "100%",
            height: "100%",
          },
          attributes: {
            width: this.spectrogram.width.toString(),
            height: this.spectrogram.height.toString(),
            xmlns: "http://www.w3.org/2000/svg",
          },
        };
        this.overlay = this.createSVGElement(overlay, "svg");
        this.spectrogram.parentElement.appendChild(this.overlay);

        const img = new Image();
        img.src = this.spectrogram.toDataURL("image/png");
        const svgImg = this.createSVGElement(
          {
            attributes: {
              width: this.spectrogram.width.toString(),
              height: this.spectrogram.height.toString(),
              xmlns: "http://www.w3.org/2000/svg",
            },
          },
          "image"
        );
        svgImg.setAttributeNS("http://www.w3.org/1999/xlink", "href", img.src);
        this.overlay.appendChild(svgImg);

        this.spectrogram.parentElement.removeChild(this.spectrogram);
        this.tracks.forEach(this.addTrackToOverlay);

        // Adding Track Functionality
        this.overlay.addEventListener("mousedown", (e: DragEvent) => {
          e.preventDefault();
          const colour = TagColours[this.tracks.length];
          const x = e.offsetX;
          const y = e.offsetY;

          this.trackPointer.pointerDown = true;
          this.trackPointer.time = Date.now();
          this.trackPointer.pos.start = { x, y };
          // create or get svg rect in overlay with id new_track
          const currRect = document.getElementById(
            "new_track"
          ) as unknown as SVGRectElement;
          const rect = this.createSVGElement(
            {
              attributes: {
                id: "new_track",
                x: x.toString(),
                y: y.toString(),
                width: "0",
                height: "0",
                stroke: colour,
                strokeWidth: "3",
                fill: "none",
              },
            },
            "rect"
          );
          if (currRect) {
            this.overlay.removeChild(currRect);
          }
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
              if (rect) {
                rect.setAttribute("x", rectX.toString());
                rect.setAttribute("y", rectY.toString());
                rect.setAttribute("width", width.toString());
                rect.setAttribute("height", height.toString());
              }
            });
          }
        });
        this.overlay.addEventListener("mouseleave", (e) => {
          e.preventDefault();
        });
        this.overlay.addEventListener("pointerup", (e: DragEvent) => {
          e.preventDefault();
          //draw circle on drag
          const startX = this.trackPointer.pos.start.x;
          const startY = this.trackPointer.pos.start.y;
          const x = e.offsetX;
          const y = e.offsetY;
          const normalizedX = this.round(startX / this.spectrogram.width);
          const normalizedY = this.round(startY / this.spectrogram.height);
          const normalizedWidth = this.round(
            (x - startX) / this.spectrogram.width
          );
          const normalizedHeight = this.round(
            (y - startY) / this.spectrogram.height
          );
          const time = Date.now();
          if (time - this.trackPointer.time > 300) {
            console.log(this.trackPointer);
            let start = this.round(normalizedX * this.player.getDuration());
            let end = this.round(
              (normalizedX + normalizedWidth) * this.player.getDuration()
            );
            const emptyTag = {
              what: "",
              id: -1,
              trackId: -1,
              confidence: 1,
              automatic: false,
              data: {},
              userId: this.userId,
              userName: this.userName,
            };
            const track: AudioTrack = {
              id: -1,
              start,
              end,
              tags: [emptyTag],
              automatic: false,
              colour: TagColours[this.tracks.length],
              positions: [
                {
                  x: normalizedX,
                  y: normalizedY,
                  width: normalizedWidth,
                  height: normalizedHeight,
                  order: 0,
                },
              ],
            };
            this.playTrack(track);
            this.tracks.push(track);
            this.addTrackToOverlay(track);
          } else {
            this.player.seekTo(normalizedX);
            this.play();
          }
          this.overlay.removeChild(document.getElementById("new_track"));
          this.trackPointer.pointerDown = false;
        });
      });
    });
  },
  computed: {
    selectedTrack: function () {
      return this.tracks.find((track: AudioTrack) => track.selected);
    },
    finished: function () {
      if (this.isPlaying || !this.player) {
        return false;
      }
      const finishTime = this.selectedTrack
        ? this.selectedTrack.end
        : this.player.getDuration();
      return this.player.getCurrentTime() >= finishTime;
    },
    userName() {
      return this.$store.state.User.userData.userName;
    },
    userId() {
      return this.$store.state.User.userData.id;
    },
  },
  methods: {
    togglePlay() {
      if (this.selectedTrack) {
        if (this.isPlaying) {
          this.player.pause();
        } else {
          this.player.play(
            this.player.getCurrentTime(),
            this.selectedTrack.end
          );
        }
      } else {
        this.player.playPause();
      }
    },
    play() {
      if (!this.isPlaying) {
        this.togglePlay();
      }
    },
    playAt(start: number, end: number = this.recording.duration) {
      this.player.play(start, end);
    },
    normaliseTime(time: number): number {
      return time / this.recording.duration;
    },
    setVolume() {
      this.player.setVolume(this.volume);
    },
    toggleMute() {
      this.muted = !this.muted;
      if (this.muted) {
        this.player.setVolume(0);
      } else {
        this.player.setVolume(this.volume);
      }
    },
    async deleteTrack(track: AudioTrack) {
      this.tracks = this.tracks.filter((t) => t.id !== track.id);
      this.overlay.removeChild(document.getElementById(`track_${track.id}`));
      const response = await api.recording.removeTrack(
        track.id,
        this.recording.id
      );
      if (response.status !== 200) {
        console.log(response, track);
      }
      return response;
    },
    async confirmNewTrack() {
      const trackRequest: ApiTrackRequest = {
        data: {
          start_s: this.selectedTrack.start,
          end_s: this.selectedTrack.end,
          positions: this.selectedTrack.positions,
          userId: this.userId,
          automatic: false,
        },
      };
      const response = await api.recording.addTrack(
        trackRequest,
        this.recording.id
      );
      if (response.success) {
        const trackRes = await api.recording.getTrack(
          response.result.trackId,
          this.recording.id
        );
        if (trackRes.success) {
          this.tracks = this.tracks.map((track: AudioTrack) => {
            track.selected = false;
            return track;
          });
          const track: AudioTrack = {
            ...trackRes.result.track,
            colour: TagColours[this.tracks.length],
            selected: true,
          };
          this.tracks.push(track);
          this.tracks = this.tracks.filter(
            (t: AudioTrack) => t.id !== this.selectedTrack.id
          );
        }
      }
    },
    async addTagToSelectedTrack(tag: string) {
      console.log(tag);
      if (this.selectedTrack) {
        if (this.selectedTrack.id === -1) {
          await this.confirmNewTrack();
        }
        const response = await this.addTagToTrack(this.selectedTrack, tag);
        return response;
      }
    },
    async addTagToTrack(track: AudioTrack, what: string) {
      const tag: ApiTrackTagRequest = {
        what,
        confidence: 1,
        automatic: false,
      };
      console.log(track, what, this.recording);
      const response = await api.recording.replaceTrackTag(
        tag,
        this.recording.id,
        Number(track.id)
      );
      if (response.success) {
        const newTag: ApiHumanTrackTagResponse = {
          ...tag,
          id: response.result.trackTagId ?? 0,
          trackId: track.id,
          data: {},
          userId: this.userId,
          automatic: false,
          userName: this.userName,
        };
        this.tracks = this.tracks.map((t: AudioTrack) => {
          if (t.id === track.id) {
            return {
              ...t,
              tags: t.tags.map((t: ApiHumanTrackTagResponse) => {
                if (t.userName === this.userName) {
                  return newTag;
                } else {
                  return t;
                }
              }),
            };
          }
          return t;
        });
      }
      return response;
    },
    addTrackToOverlay(track: AudioTrack) {
      const position = track.positions.find(({ order }) => order === 0);
      if (!position) {
        return;
      }
      let { x, y, width, height } = position;
      x = x * this.spectrogram.width;
      y = y * this.spectrogram.height;
      width = width * this.spectrogram.width;
      height = height * this.spectrogram.height;

      const rect = this.createSVGElement(
        {
          attributes: {
            id: "track_" + track.id,
            x,
            y,
            width,
            height,
            fill: "none",
            stroke: track.colour,
            "stroke-width": 3,
          },
        },
        "rect"
      );
      this.overlay.appendChild(rect);
    },
    playTrack(track: AudioTrack) {
      if (!this.selectedTrack || this.selectedTrack.id !== track.id) {
        this.tracks = this.tracks.map((track: AudioTrack) => {
          track.selected = false;
          return track;
        });
        track.selected = true;
      }
      this.playAt(Number(track.start), Number(track.end));
    },
    deselectTrack() {
      if (
        this.selectedTrack.id === -1 &&
        !this.selectedTrack.tags.some((tag: ApiTrackTagResponse) => tag.what)
      ) {
        this.tracks = this.tracks.filter(
          (track: AudioTrack) => track.id !== this.selectedTrack.id
        );
        document.getElementById("track_" + this.selectedTrack.id).remove();
      }
      this.tracks = this.tracks.map((track: AudioTrack) => {
        track.selected = false;
        return track;
      });
      if (this.isPlaying) {
        this.player.play();
      }
    },
    replay() {
      if (this.selectedTrack) {
        this.playTrack(this.selectedTrack);
      } else {
        this.playAt(0);
      }
    },
    createSVGElement(
      element: {
        attributes?: Object;
        style?: Object;
      },
      elementType: string
    ): SVGElement {
      const svgns = "http://www.w3.org/2000/svg";
      const svgElement = document.createElementNS(svgns, elementType);
      if (element.attributes) {
        Object.keys(element.attributes).forEach((key) => {
          svgElement.setAttribute(key, element.attributes[key]);
        });
      }
      if (element.style) {
        Object.keys(element.style).forEach((key) => {
          svgElement.style.setProperty(key, element.style[key]);
        });
      }
      return svgElement;
    },
    round(value: number, decimals = 2): number {
      return Number(
        Math.round(Number(`${value}e${decimals}`)) + "e-" + decimals
      );
    },
  },
});
</script>
<style lang="scss">
@import "~bootstrap/scss/functions";
@import "~bootstrap/scss/variables";
@import "~bootstrap/scss/mixins";

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
  min-height: 67px;
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
.pause-screen-overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 70%;
  z-index: 100;
  background-color: rgba(0, 0, 0, 0.2);
  color: white;
  cursor: pointer;
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
.selected-track-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

@include media-breakpoint-down(lg) {
  .select-track-container {
    width: 100%;
    order: -1;
  }
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
  }
}
</style>
