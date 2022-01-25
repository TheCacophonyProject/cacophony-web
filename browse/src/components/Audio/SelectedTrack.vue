<template>
  <b-container>
    <b-col>
      <h2>Selected Classification</h2>
    </b-col>
    <b-col>
      <h4>{{ tag.what }}</h4>
      <h4>By: {{ who }}</h4>
    </b-col>
  </b-container>
</template>

<script lang="ts">
import Vue, { PropType } from "vue";
import { AudioTrack } from "../Video/AudioRecording.vue";
import { TagColours } from "@/const";

export default Vue.extend({
  name: "SelectedTrack",
  props: {
    track: {
      type: Object as PropType<AudioTrack>,
      required: true,
    },
  },
  computed: {
    tag() {
      const correctTag = this.track.tags.find(
        (tag) => tag.automatic && tag.data.name === "Master"
      );
      return correctTag;
    },
    who() {
      return this.tag.who ?? this.tag.data.name;
    },
  },
  methods: {
    selectTrack: function () {
      this.$emit("select", this.track);
    },
  },
});
</script>
