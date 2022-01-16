<template>
  <b-btn
    @click="toggleSound"
    class="audio-player-button bg-transparent border-0"
  >
    <audio ref="audioPlayer" />
    <progress-ring v-if="loading" :progress="20" spin />
    <progress-ring
      v-else-if="inited"
      :resetting="reset"
      :progress="localProgressZeroToOne * 100"
    />
    <font-awesome-icon
      :icon="playing ? 'stop' : 'play'"
      class="audio-player-icon fa-fw"
      size="xs"
    />
  </b-btn>
</template>

<script lang="ts">
import ProgressRing from "@/components/ProgressRing.vue";
export default {
  name: "AudioPlayerButton",
  components: { ProgressRing },
  props: {
    srcGetter: {
      type: Function,
      required: true,
    },
  },
  data() {
    return {
      playing: false,
      inited: false,
      loading: false,
      src: null,
      reset: null,
      duration: 0,
      localProgressZeroToOne: 0,
    };
  },
  beforeDestroy() {
    this.audio.removeEventListener("loadedmetadata", this.setDuration);
    this.audio.removeEventListener("timeupdate", this.updateProgress);
  },
  methods: {
    setDuration(): void {
      this.duration = this.audio.duration;
    },
    initPlayer(): void {
      this.audio.addEventListener("loadedmetadata", this.setDuration);
      if (this.audio.readyState > 0) {
        this.setDuration();
      }
      this.audio.addEventListener("timeupdate", this.updateProgress);
    },
    updateProgress(): void {
      // Set progress
      if (!this.duration) {
        this.setDuration();
      }
      if (this.duration) {
        this.currentTime = this.audio.currentTime;
        this.localProgressZeroToOne = this.currentTime / this.duration;
        if (this.currentTime === this.duration) {
          this.playing = false;
          this.stopSound();
        }
      }
    },
    toggleSound() {
      if (!this.inited) {
        this.initPlayer();
      }
      this.playing = !this.playing;
      if (this.playing) {
        this.playSound();
      } else {
        this.stopSound();
      }
    },
    async stopSound() {
      await this.audio.pause();
      this.audio.currentTime = 0;
      this.reset = setTimeout(() => {
        this.inited = false;
      }, 1000);
    },
    async playSound() {
      if (this.playing) {
        clearTimeout(this.reset);
        this.reset = null;
        this.loading = true;
        if (!this.src) {
          this.src = await this.srcGetter();
        }
        this.audio.src = this.src;
        this.audio.currentTime = 0;
        this.loading = false;
        this.inited = true;
        await this.audio.play();
      }
    },
  },
  computed: {
    audio(): HTMLAudioElement | undefined {
      return this.$refs.audioPlayer;
    },
  },
};
</script>

<style lang="scss">
@import "~bootstrap/scss/functions";
@import "~bootstrap/scss/variables";

.audio-player-button.btn-secondary {
  position: relative;
  width: 34px;
  height: 34px;
  display: inline-block;
  margin: 0 0.25rem;
  color: $gray-600;
  padding: 0;
  text-align: center;

  &:focus,
  &.active,
  &:hover {
    border: 0;
    box-shadow: unset !important;
    color: inherit !important;
  }
  .audio-player-icon {
    display: inline-block;
    width: 100%;
    vertical-align: baseline !important;
  }
}
</style>
