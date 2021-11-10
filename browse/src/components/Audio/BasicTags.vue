<template>
  <div>
    <b-button class="basicTags" @click="basicTag('unknown')">Unknown</b-button>
    <b-button class="basicTags" @click="basicTag('nothing of interest')"
      >Nothing of interest</b-button
    >
    <b-button class="basicTags" @click="basicTag('bird')">Bird</b-button>
    <b-button class="basicTags" @click="basicTag('human')">Human</b-button>
  </div>
</template>

<script lang="ts">
/* eslint-disable no-console */
import { ApiRecordingTagRequest } from "@typedefs/api/tag";

export default {
  name: "BasicTag",
  methods: {
    basicTag(tagValue) {
      const tag: ApiRecordingTagRequest = {
        what: tagValue,
        confidence: 0.5,
        startTime: 0.5,
        duration: 0.5,
        automatic: false,
      };
      this.$emit("addAudioTag", tag);
    },
  },
};
</script>

<style scoped>
.basicTags {
  margin: 5px;
}
</style>
