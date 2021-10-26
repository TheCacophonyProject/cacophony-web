<template>
  <div class="db d-inline">
    <b-form-input
      v-model="customTagValue"
      class="w-50 mt-4 d-inline align-bottom"
      placeholder="Enter custom tag"
    />
    <b-button
      :disabled="isEmpty"
      class="mt-0 align-bottom"
      @click="addCustomTag()"
      >Add</b-button
    >
  </div>
</template>

<script lang="ts">
import { ApiRecordingTagRequest } from "@typedefs/api/tag";

export default {
  name: "CustomTag",
  data: function () {
    return {
      customTagValue: "",
    };
  },
  computed: {
    isEmpty() {
      return this.customTagValue.trim().length === 0;
    },
  },
  methods: {
    addCustomTag() {
      const tag: ApiRecordingTagRequest = {
        what: this.customTagValue,
        confidence: 0.5,
        startTime: 0.5,
        duration: 0.5,
        automatic: false,
      };
      this.$emit("addAudioTag", tag);
      this.customTagValue = "";
    },
  },
};
</script>

<style scoped></style>
