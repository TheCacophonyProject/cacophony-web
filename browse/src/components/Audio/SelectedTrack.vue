<template>
  <b-container class="d-flex selected-class">
    <b-row class="justify-content-between">
      <b-col>
        <b-row class="align-items-center">
          <span
            class="track-colour"
            :style="{ background: `${track.colour}` }"
          ></span>
          <div>
            <h4 class="track-time">
              Time: {{ track.start }} - {{ track.end }} (Δ{{
                (track.end - track.start).toFixed(1)
              }}s)
            </h4>
            <b-row
              v-if="track.tags[0]"
              class="m-0 w-100 justify-content-between"
            >
              <h4>
                {{ track.tags[0].what ? track.tags[0].what : "Select Tag..." }}
              </h4>
              <h4 class="ml-2">
                By:
                {{
                  track.tags[0].data.name
                    ? track.tags[0].data.name
                    : track.tags[0].userName
                }}
              </h4>
            </b-row>
          </div>
        </b-row>
      </b-col>
    </b-row>
  </b-container>
</template>

<script lang="ts">
import Vue, { PropType } from "vue";
import { AudioTrack } from "../Video/AudioRecording.vue";

export default Vue.extend({
  name: "SelectedTrack",
  props: {
    track: {
      type: Object as PropType<AudioTrack>,
      required: true,
    },
  },
  methods: {
    selectTrack: function () {
      this.$emit("select", this.track);
    },
  },
});
</script>
<style lang="scss"></style>
