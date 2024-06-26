<template>
  <div ref="container" class="video-container">
    <MotionPathsOverlay
      v-if="showMotionPaths && hasTracks && playerIsReady"
      :current-track="currentTrack ? currentTrack.trackIndex : null"
      :show-only-for-current-track="showOverlaysForCurrentTrackOnly"
      :canvas-width="canvasWidth"
      :canvas-height="canvasHeight"
      :ended-playback="ended"
      :tracks="tracks"
      :scale="scale"
    />
    <canvas
      ref="canvas"
      :key="'boxes'"
      :width="canvasWidth"
      :height="canvasHeight"
      class="canvas"
      :class="{ 'ended-playback': ended }"
    />
    <video-player
      ref="player"
      :key="videoUrl"
      :options="playerOptions"
      class="video vjs-custom-skin"
      :class="{ 'ended-playback': ended }"
      @seeking="seeking"
      @play="draw"
      @ended="showEndedOverlay"
      @canplay="canPlay"
      @ready="playerReady"
      @error="videoError"
    />
    <transition name="fade">
      <div class="load-overlay" v-if="loading">
        <Spinner />
      </div>
    </transition>
    <transition name="fade">
      <div class="end-overlay" v-if="ended">
        <b-button @click="replay">Play again?</b-button>
        <b-button @click="requestNextVideo">Next video?</b-button>
      </div>
    </transition>
    <VideoTracksScrubber
      :class="{ 'ended-playback': ended }"
      ref="scrubber"
      :duration="duration"
      :tracks="tracks"
      :current-video-time="currentVideoTime"
      :current-track="currentTrack ? currentTrack.trackIndex : 0"
      :canvas-width="canvasWidth"
      :side-padding="vjsButtonWidth"
      @start-scrub="startScrub"
      @end-scrub="endScrub"
      @set-playback-time="setTimeAndRedraw"
    />
  </div>
</template>

<script lang="ts">
import { videoPlayer } from "vue-video-player";
import VideoTracksScrubber from "./VideoTracksScrubber.vue";
import Spinner from "../Spinner.vue";
import MotionPathsOverlay from "./MotionPathsOverlay.vue";
import { Player } from "videojs";
import { TagColours } from "../../const";

export default {
  name: "MPEGPlayer",
  components: {
    Spinner,
    videoPlayer,
    VideoTracksScrubber,
    MotionPathsOverlay,
  },
  props: {
    videoUrl: {
      type: String,
      required: true,
    },
    tracks: {
      type: Array,
      required: true,
    },
    currentTrack: {
      type: Object,
      default: () => ({ trackIndex: 0 }),
    },
    canSelectTracks: {
      type: Boolean,
      default: true,
    },
    loopSelectedTrack: {
      type: Boolean,
      default: false,
    },
    showMotionPaths: {
      type: Boolean,
      default: false,
    },
    showOverlaysForCurrentTrackOnly: {
      type: Boolean,
      default: false,
    },
    frameRate: {
      type: Number,
      default: 10,
    },
  },
  data() {
    // Seems like we should wait until track data and video data has loaded to play video?
    return {
      lastDisplayedVideoTime: 0,
      currentVideoTime: 0,
      duration: 0,
      colours: TagColours,
      playerOptions: {
        bigPlayButton: false,
        autoplay: true,
        muted: true,
        width: "800px",
        playbackRates: [0.5, 1, 2, 4, 8],
        inactivityTimeout: 0,
        sources: [],
      },
      vjsButtonWidth: 50, //button width + duration margin
      canvasWidth: 800,
      canvasHeight: 600,
      scale: 5,
      wasPaused: false,
      isScrubbing: false,
      initedTrackHitRegions: false,
      ended: false,
      loading: true,
      playerIsReady: false,
    };
  },
  watch: {
    videoUrl() {
      this.playerIsReady = false;
      this.setVideoUrl();
    },
    currentTrack() {
      this.selectTrack();
    },
    tracks() {
      this.selectTrack();
    },
  },
  computed: {
    htmlPlayer(): HTMLVideoElement {
      return this.$refs.player.$refs.video;
    },
    hasTracks(): boolean {
      return this.tracks && this.tracks.length !== 0;
    },
  },
  mounted() {
    this.setVideoUrl();
    this.initOverlayCanvas();
    window.addEventListener("resize", this.onResize);
  },
  beforeDestroy() {
    // Unregister the event listener before destroying this Vue instance
    window.removeEventListener("resize", this.onResize);
  },
  methods: {
    canPlay() {
      this.loading = false;
      this.duration = document.getElementsByTagName("video")[0].duration;
      setTimeout(() => {
        this.$emit("ready-to-play");
      }, 200);
    },
    showEndedOverlay() {
      if (!this.loopSelectedTrack) {
        setTimeout(() => {
          this.ended = true;
        }, 150);
      }
    },
    bindRateChange() {
      const rate = localStorage.getItem("playbackrate");
      const htmlPlayer = this.$refs.player.$refs.video;

      if (rate) {
        htmlPlayer.playbackRate = rate;
      }
      htmlPlayer.onratechange = this.ratechange.bind(this);
    },
    startScrub() {
      this.wasPaused = this.htmlPlayer.paused;
      if (!this.wasPaused) {
        this.videoJsPlayer().pause();
      }
      this.isScrubbing = true;
    },
    endScrub() {
      if (!this.wasPaused) {
        this.videoJsPlayer().play();
      }
      this.isScrubbing = false;
    },
    setVideoUrl() {
      this.loading = true;
      this.ended = false;
      const htmlPlayer = this.$refs.player.$refs.video;
      if (htmlPlayer) {
        const rate = localStorage.getItem("playbackrate");
        if (rate) {
          htmlPlayer.playbackRate = rate;
          htmlPlayer.onratechange = null;
        }
      }
      // first must make sure the width to be loaded is also correct.
      this.playerOptions.width = this.canvasWidth + "px";
      this.playerOptions.height = this.canvasHeight + "px";
      if (this.videoUrl) {
        this.$data.playerOptions.sources = [
          {
            type: "video/mp4",
            src: this.videoUrl,
          },
        ];
        // // if tracks is loaded then select the first track
        if (this.currentTrack && this.currentTrack.trackIndex !== 0) {
          this.$emit("trackSelected", this.currentTrack);
        }
      }
    },
    replay() {
      this.videoJsPlayer().pause();
      this.videoJsPlayer().currentTime(0);
      this.videoJsPlayer().trigger("loadstart");
      this.videoJsPlayer().play();
      if (this.currentTrack && this.currentTrack.trackIndex !== 0) {
        this.$emit("trackSelected", this.currentTrack);
      }
      this.ended = false;
    },
    requestNextVideo() {
      this.ended = false;
      this.$emit("request-next-recording");
    },
    playerReady() {
      this.bindRateChange();
      this.selectTrack();

      // first must make sure the width to be loaded is also correct.
      this.playerOptions.width = this.canvasWidth + "px";
      this.playerOptions.height = this.canvasHeight + "px";
      this.playerIsReady = true;
      this.$emit("player-ready");
    },
    videoError() {
      this.requestNextVideo();
    },
    selectTrack() {
      this.lastDisplayedVideoTime = -1;
      if (this.tracks && this.currentTrack) {
        this.setTimeAndRedraw(this.currentTrack.start + 0.01);
      }
    },
    onResize() {
      const oldWidth = this.canvasWidth;
      this.initOverlayCanvas();
      if (oldWidth !== this.canvasWidth) {
        this.currentVideoTime += 10;
        this.draw();
      }
    },
    initOverlayCanvas() {
      const WIDTH = 640;
      const HEIGHT = 480;
      this.canvasWidth = this.$refs.container.clientWidth;
      this.scale = this.canvasWidth / WIDTH;
      this.canvasHeight = this.scale * HEIGHT + 30;
      this.videoJsPlayer().width(this.canvasWidth);
      this.videoJsPlayer().height(this.canvasHeight);
      this.$refs.container.style.minHeight = `${this.canvasHeight}px`;

      // Make canvas be sharp on retina displays:
      const canvas = this.$refs.canvas;
      const context = canvas.getContext("2d");
      const devicePixelRatio = window.devicePixelRatio;
      canvas.width = this.canvasWidth * devicePixelRatio;
      canvas.height = this.canvasHeight * devicePixelRatio;
      canvas.style.width = `${this.canvasWidth}px`;
      canvas.style.height = `${this.canvasHeight}px`;
      context.scale(devicePixelRatio, devicePixelRatio);

      if (this.$refs.scrubber && this.$refs.scrubber.$el) {
        this.$refs.scrubber.$el.style.width = canvas.style.width;
      }

      if (this.canSelectTracks && !this.initedTrackHitRegions) {
        this.initedTrackHitRegions = true;
        // Hit-testing of track rects, so they are clickable.
        const hitTestPos = (x, y) => {
          const allFrameData = this.getVideoFrameDataForAllTracksAtTime(
            this.currentVideoTime,
            this.showOverlaysForCurrentTrackOnly
          );
          for (const rect of allFrameData) {
            if (
              rect.x <= x &&
              rect.x + rect.rectWidth > x &&
              rect.y <= y &&
              rect.y + rect.rectHeight > y
            ) {
              return rect;
            }
          }
          return null;
        };

        canvas.addEventListener("click", (event) => {
          const canvasOffset = canvas.getBoundingClientRect();
          const x = event.x - canvasOffset.x;
          const y = event.y - canvasOffset.y;
          const hitRect = hitTestPos(x, y);
          if (hitRect) {
            const hitIndex = this.tracks[hitRect.trackIndex];

            if (this.currentTrack !== this.tracks[hitIndex]) {
              const newTrack = this.tracks[hitRect.trackIndex];
              newTrack.trackId = newTrack.id;
              this.$emit("trackSelected", newTrack);
            }
          }
        });

        canvas.addEventListener("mousemove", (event) => {
          const canvasOffset = canvas.getBoundingClientRect();
          const x = event.x - canvasOffset.x;
          const y = event.y - canvasOffset.y;
          const hitRect = hitTestPos(x, y);
          // set cursor
          canvas.style.cursor = hitRect !== null ? "pointer" : "default";
        });
      }
    },
    setTimeAndRedraw(time) {
      this.videoJsPlayer() && this.videoJsPlayer().currentTime(time);
      this.videoJsPlayer().play();
    },
    ratechange() {
      const htmlPlayer = this.$refs.player.$refs.video;

      if (htmlPlayer) {
        localStorage.setItem("playbackrate", htmlPlayer.playbackRate);
      }
    },
    seeking(event) {
      // If the user is moving the time slider on the video then update the canvas
      // as well so that it matches the underlying video frame.
      if (event.type === "seeking") {
        this.draw();
      }
    },
    videoJsPlayer(): Player {
      return this.$refs.player && this.$refs.player.player;
    },
    drawRectWithText(
      context,
      { trackIndex, trackId, rectWidth, rectHeight, x, y }
    ) {
      context.strokeStyle = this.colours[trackIndex % this.colours.length];
      const selected =
        this.currentTrack && this.currentTrack.trackId === trackId;

      const lineWidth = selected ? 3 : 1;
      const halfLineWidth = lineWidth / 2;
      context.lineWidth = lineWidth;
      context.strokeRect(
        x - halfLineWidth,
        y - halfLineWidth,
        rectWidth + halfLineWidth,
        rectHeight + halfLineWidth
      );
      if (selected) {
        context.font = "12px Verdana";
        context.fillStyle = "white";
        const text = `Track ${trackIndex + 1}`;
        const textHeight = 12;
        const textWidth = context.measureText(text).width;

        // TODO Determine if the box can be shown right at the bottom of the screen
        // if it can then we probably need to detect this and display the text above
        // or inside the box.
        const textX = x + (rectWidth - textWidth);
        const textY = y + (rectHeight + textHeight);
        context.fillText(text, textX, textY);
      }
    },
    getVideoFrameDataForAllTracksAtTime(currentTime, currentTrackOnly) {
      // First check if the last position we got is still the current position?
      // See if tracks are in range.
      let tracks;
      if (currentTrackOnly) {
        if (this.tracks.length && this.tracks[this.currentTrack.trackIndex]) {
          tracks = [this.tracks[this.currentTrack.trackIndex]];
        } else {
          tracks = [];
        }
      } else {
        tracks = this.tracks;
      }
      const frameTime = 1 / this.frameRate;
      const currentFrame = Math.floor(this.currentVideoTime / frameTime);
      const data = tracks
        .filter(
          (track) =>
            track.start <= currentTime &&
            track.end >= currentTime &&
            track.positions[currentFrame - track.positions[0].order]
        )
        .map((track) => {
          const pos = track.positions[currentFrame - track.positions[0].order];
          const index = tracks.indexOf(track);
          return {
            rectWidth: pos.width * this.scale,
            rectHeight: pos.height * this.scale,
            x: pos.x * this.scale,
            y: pos.y * this.scale,
            trackIndex: index,
            trackId: track.id,
          };
        });
      return data;
    },
    draw() {
      if (this.videoJsPlayer() && this.htmlPlayer) {
        // NOTE: Since our video is 9fps, we're don't need to update this at 60fps.
        const frameTime = 1 / this.frameRate;
        try {
          // NOTE: This is just to suppress a spurious type error inside videojs when it hasn't initialised properly yet.
          this.currentVideoTime = this.videoJsPlayer().currentTime();
        } catch (e) {
          this.currentVideoTime = 0;
        }

        if (this.loopSelectedTrack) {
          // If we want to loop the current track, check to see if we've gone past the end of it here.
          const trackEndTime =
            (this.tracks &&
              this.tracks[this.currentTrack.trackIndex] &&
              this.tracks[this.currentTrack.trackIndex].end) ||
            Number.POSITIVE_INFINITY;
          if (this.currentVideoTime > trackEndTime) {
            this.selectTrack();
          }
        }
        const currentFrame = Math.floor(this.currentVideoTime / frameTime);
        if (
          currentFrame !== this.lastDisplayedVideoTime &&
          this.currentTrack &&
          this.currentTrack.playToEnd &&
          Math.floor(this.currentTrack.end / frameTime) - 1 == currentFrame
        ) {
          this.videoJsPlayer().pause();
        }

        if (currentFrame !== this.lastDisplayedVideoTime || this.isScrubbing) {
          // Only update the canvas if the video time has changed as this means a new
          // video frame is being displayed.
          const allFrameData = this.getVideoFrameDataForAllTracksAtTime(
            this.currentVideoTime,
            this.showOverlaysForCurrentTrackOnly
          );
          const trackExists = allFrameData.find(
            (track) => track.trackId == this.currentTrack.trackId
          );
          if (!trackExists && allFrameData.length > 0) {
            this.$emit("trackSelected", allFrameData[0]);
          }
          const canvas = this.$refs.canvas;
          if (canvas) {
            const context = canvas.getContext("2d");
            const devicePixelRatio = window.devicePixelRatio;
            canvas.width = this.canvasWidth * devicePixelRatio;
            canvas.height = this.canvasHeight * devicePixelRatio;
            canvas.style.width = `${this.canvasWidth}px`;
            canvas.style.height = `${this.canvasHeight}px`;
            context.scale(devicePixelRatio, devicePixelRatio);
            // Clear the canvas before each new frame
            context.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
            if (allFrameData.length) {
              for (const rect of allFrameData) {
                this.drawRectWithText(context, rect);
              }
            }
          }
          this.lastDisplayedVideoTime = currentFrame;
        }
      }
      requestAnimationFrame(this.draw.bind(this));
    },
  },
};
</script>

<style lang="scss">
.video {
  min-width: 100%;
  max-width: 100%;
  height: auto;
}

.vjs-big-play-button,
.vjs-control-bar {
  z-index: 990;
}

.video .video-js .vjs-volume-panel,
.video .video-js .vjs-fullscreen-control {
  display: none;
}

.video .video-js .vjs-tech {
  margin-top: -15px;
}

.audio {
  display: block;
  min-width: 100%;
  max-width: 100%;
}

.canvas {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  z-index: 900;
}

.load-overlay {
  background-color: black;
  > * {
    position: relative;
  }
}

.end-overlay,
.load-overlay {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  z-index: 1000;
}

.end-overlay {
  background-color: rgba(255, 255, 255, 0.5);
  display: flex;
  flex-direction: row;
  justify-content: space-around;
  align-items: center;
  > button {
    max-height: 60px;
  }
}
.ended-playback {
  //opacity: 0.5;
}

.video-container {
  margin: 0 auto;
  position: relative;
  width: 100%;
  padding: 0;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter,
.fade-leave-to {
  opacity: 0;
}
</style>
<style scoped lang="scss">
@import "~video.js/dist/video-js.css";
</style>
<!-- <style src="video.js/dist/video-js.css"></style> -->
