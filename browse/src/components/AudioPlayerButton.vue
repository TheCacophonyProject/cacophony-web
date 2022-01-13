<template>
  <div @click="toggleSound" class="audio-player-button">
    <audio ref="audioPlayer" />
    <b-spinner v-if="loading" small />
    <font-awesome-icon v-else :icon="playing ? 'stop' : 'play'" />
  </div>
</template>

<script lang="ts">
export default {
  name: "AudioPlayerButton",
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
      duration: 0,
    };
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
    },
    async playSound() {
      if (this.playing) {
        this.loading = true;
        if (!this.src) {
          this.src = await this.srcGetter();
        }
        this.audio.src = this.src;
        this.audio.currentTime = 0;
        this.loading = false;
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

<style scoped lang="scss">
@import "~bootstrap/scss/functions";
@import "~bootstrap/scss/variables";

.audio-player-button {
  display: inline-block;
  margin: 0 0.25rem;
  color: $gray-600;
}
</style>
