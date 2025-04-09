<template>
  <div :class="['card', trackClass]">
    <div :class="['card-header', headerClass]">
      <button
        v-if="index !== 0"
        title="Previous track"
        class="prev-track button btn"
        @click="trackSelected(-1)"
      >
        <font-awesome-icon icon="angle-left" />
      </button>
      <h5 class="track-title" @click="trackSelected(0)">
        <span :style="iconStyle" class="track-image border" />
        Track {{ index + 1 }}
        <span class="out-of-tracks">/ {{ numTracks }}</span>
      </h5>
      <div class="track-time" @click="trackSelected(0)">
        <span class="title">Time:</span>
        {{ Math.max(0, track.start - adjustTimespans).toFixed(1) }} -
        {{ (track.end - adjustTimespans).toFixed(1) }}s <br />
        <span class="delta">
          (&#916;
          {{ (track.end - track.start).toFixed(1) }}s)
        </span>
      </div>
      <button
        v-if="index < numTracks - 1 && show"
        title="Next track"
        class="next-track button btn"
        @click="trackSelected(1)"
      >
        <font-awesome-icon icon="angle-right" />
      </button>
      {{ message }}
    </div>
    <div v-if="show" class="card-body">
      <AIClassification
        :tags="localTags"
        :is-wallaby-project="isWallabyProject"
        :needs-confirmation="!hasUserTags"
        :userTags="userTags"
        @confirm-ai-guess="({ what }) => addTag({ what, confidence: 0.85 })"
        @reject-ai-guess="promptUserToAddTag"
      />
      <b-alert
        class="user-tagging-hint"
        fade
        :show="showUserTaggingHintCountDown"
        variant="warning"
        dismissible
        @dismissed="showUserTaggingHintCountDown = false"
      >
        Click a classification button below to help teach the AI what this
        <em>really</em> is.
      </b-alert>
      <QuickTagTrack
        :tags="localTags"
        :is-wallaby-project="isWallabyProject"
        @addTag="addTag($event)"
        @deleteTag="deleteTag($event)"
        @openDropdown="trackSelected(0, false, true)"
      />
      <AddCustomTrackTag @addTag="addTag($event)" :allow-comment="false" />
      <div>
        <TrackTags
          :device-id="deviceId"
          :items="localTags"
          @addTag="addTag($event)"
          @deleteTag="deleteTag($event)"
        />
        <TrackData
          :track-tag="masterTag"
          :recording-id="recordingId"
          v-if="isSuperUserAndViewingAsSuperUser"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import TrackData from "./TrackData.vue";
import QuickTagTrack from "./QuickTagTrack.vue";
import TrackTags from "./TrackTags.vue";
import AddCustomTrackTag from "./AddCustomTrackTag.vue";
import AIClassification from "./AIClassification.vue";
import api from "@api";
import { ApiTrackResponse } from "@typedefs/api/track";
import {
  ApiHumanTrackTagResponse,
  ApiTrackTagRequest,
  ApiTrackTagResponse,
} from "@typedefs/api/trackTag";
import { shouldViewAsSuperUser } from "@/utils";

interface TrackInternalData {
  localTags: ApiTrackTagResponse[];
  show_details: boolean;
  showFullAddTag: boolean;
  message: string;
  showUserTaggingHintCountDown: boolean;
}

export default {
  name: "Track",
  components: {
    TrackData,
    QuickTagTrack,
    TrackTags,
    AddCustomTrackTag,
    AIClassification,
  },
  props: {
    track: {
      type: Object,
      required: true,
    },
    deviceId: {
      type: Number,
      required: true,
    },
    tracks: {
      type: Array,
      required: true,
    },
    recordingId: {
      type: Number,
      required: true,
    },
    index: {
      type: Number,
      required: true,
    },
    numTracks: {
      type: Number,
      required: true,
    },
    show: {
      type: Boolean,
      default: false,
    },
    colour: {
      type: String,
      default: "yellow",
    },
    isWallabyProject: {
      type: Boolean,
      default: false,
    },
    adjustTimespans: {
      type: Number,
      default: 0,
    },
  },
  data() {
    return {
      showDetails: false,
      showFullAddTag: false,
      message: "",
      showUserTaggingHintCountDown: false,
      localTags: [],
    } as unknown as TrackInternalData;
  },
  computed: {
    masterTag(): ApiTrackTagResponse | undefined {
      return (this.track as ApiTrackResponse).tags.find(
        (tag) => tag.model === "Master",
      );
    },
    trackClass() {
      return "selected-" + this.show;
    },
    iconStyle() {
      return `background-color: ${this.colour}`;
    },
    hasUserTags(): boolean {
      return (
        (this.track as ApiTrackResponse).tags.find(
          ({ automatic }) => !automatic,
        ) !== undefined
      );
    },
    userTags(): string[] {
      return this.userTagItems.map(({ what }) => what);
    },
    userTagItems(): ApiHumanTrackTagResponse[] {
      return this.localTags.filter(({ automatic }) => !automatic);
    },
    isSuperUserAndViewingAsSuperUser() {
      return (
        this.$store.state.User.userData.isSuperUser && shouldViewAsSuperUser()
      );
    },
    headerClass() {
      if (this.track.filtered) {
        return "filtered-track";
      }
      return "";
    },
  },
  created() {
    this.localTags = [...this.track.tags];
  },
  watch: {
    "track.tags": function () {
      this.updateLocalTags();
    },
  },
  methods: {
    updateLocalTags() {
      this.localTags =
        (this.track && this.track.tags && [...this.track.tags]) || [];
    },
    async addTag(tag: ApiTrackTagRequest) {
      const recordingId = this.recordingId;
      const trackId = this.track.id;
      // Replace any tag by the current user:
      const tagByUser = this.userTagItems.find(
        (tag) => tag.userName === this.$store.state.User.userData.userName,
      );
      if (tagByUser) {
        this.localTags = this.localTags.filter((tag) => tag !== tagByUser);
      }
      // Add to local tags for fast UI update while we wait for the API
      this.localTags = [
        ...this.localTags,
        {
          ...tag,
          userName: this.$store.state.User.userData.userName,
          trackId,
          id: -1,
          createdAt: new Date().toISOString(),
        },
      ];
      const replaceTrackTagResponse = await api.recording.replaceTrackTag(
        tag,
        recordingId,
        trackId,
      );
      if (replaceTrackTagResponse.success) {
        const trackTagId = replaceTrackTagResponse.result.trackTagId;
        const newTag: ApiTrackTagResponse = {
          ...tag,
          id: trackTagId,
          trackId,
          automatic: false,
          createdAt: new Date().toDateString(),
          data: "",
        };
        this.$emit("change-tag", newTag);
      }
    },
    promptUserToAddTag() {
      this.showUserTaggingHintCountDown = true;
    },
    async deleteTag(tagToDelete: ApiTrackTagResponse) {
      const recordingId = this.recordingId;
      let removedTag;
      try {
        this.localTags = this.localTags.filter((tag) => tag !== tagToDelete);
        const result = await api.recording.deleteTrackTag(
          recordingId,
          tagToDelete.trackId,
          tagToDelete.id,
        );
        if (!result.success) {
          if (removedTag) {
            // Add it back to localTags
            this.localTags = [...this.localTags, removedTag];
          }
          return result;
        }
      } catch (e) {
        if (removedTag) {
          // Add it back to localTags
          this.localTags = [...this.localTags, removedTag];
        }
      }
      this.$emit("change-tag", tagToDelete);
    },
    trackSelected(increment, gotoStart = true, playToEnd = true) {
      const index = Math.min(
        this.numTracks - 1,
        Math.max(0, this.index + increment),
      );
      if (0 <= index && index < this.numTracks) {
        this.$emit("track-selected", {
          trackId: this.tracks[index].id,
          gotoStart,
          playToEnd,
        });
      }
    },
  },
};
</script>

<style lang="scss" scoped>
@import "~bootstrap/scss/functions";
@import "~bootstrap/scss/variables";
@import "~bootstrap/scss/mixins";

.card {
  &.selected-true {
    h5 {
      font-weight: 600;
    }
  }
  &.selected-false {
    h5 {
      color: $gray-700;
    }
  }
}

.card-header,
.card-body {
  padding-left: 1em;
  padding-right: 1em;
}
.filtered-track {
  opacity: 0.7;
  background: #ddd;
}
.card-header {
  display: flex;
  padding-top: 0.5em;
  padding-bottom: 0.5em;
}

.track-title {
  margin-bottom: 0;
  margin-top: 0.1em;
  flex: 1 1 auto;
  line-height: unset;
  cursor: pointer;
  user-select: none;
}

.track-time {
  margin-left: auto;
  font-size: 0.7em;
  text-align: right;
}

.track-title,
.track-time {
  cursor: pointer;
}

.track-image {
  display: inline-block;
  vertical-align: text-bottom;
  width: 20px;
  height: 20px;
}

.prev-track,
.next-track {
  color: grey;
}

.delta {
  color: gray;
}

.user-tagging-hint {
  margin: 10px auto;
}

/*.ignored {
    color: gray;
  }*/

@include media-breakpoint-down(md) {
  .accordion > .card:first-of-type,
  .accordion > .card:not(:first-of-type):not(:last-of-type) {
    @include border-bottom-left-radius($border-radius);
    @include border-bottom-right-radius($border-radius);
    border-bottom: 1px solid $border-color;
  }

  .selected-false {
    display: none;
  }

  .prev-track {
    margin-left: -0.5em;
  }

  .next-track {
    margin-right: -0.5em;
  }
}

@include media-breakpoint-up(lg) {
  .prev-track,
  .next-track,
  .out-of-tracks {
    display: none;
  }

  .accordion > .card:last-of-type {
    @include border-bottom-left-radius($border-radius);
    @include border-bottom-right-radius($border-radius);
    border-bottom: 1px solid $border-color;
  }
}

// Set a height for container of the track information.
// TODO: Leave for now, figure out a better way of doing it with JS

// not ideal
$videoPlayerHeightXl: 585px;
$videoPlayerHeightLg: 495px;

@include media-breakpoint-up(lg) {
  .card {
    max-height: $videoPlayerHeightLg;
    overflow: hidden;
  }

  .card-body {
    overflow: auto;
  }
}

@include media-breakpoint-up(xl) {
  .card {
    max-height: $videoPlayerHeightXl;
  }
}
</style>
