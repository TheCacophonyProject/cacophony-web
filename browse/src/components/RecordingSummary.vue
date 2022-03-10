<template>
  <a
    v-if="displayStyle === 'card'"
    :href="getRecordingPath(item.id)"
    :class="['recording-summary', headerClass]"
    @click="(event) => navigateToRecording(event, item.id)"
  >
    <b-modal
      v-model="showingLocation"
      hide-footer
      :title="`${item.deviceName}: #${item.id}`"
      lazy
    >
      <MapWithPoints :points="itemLocation" />
    </b-modal>
    <div class="recording-type">
      <span v-if="item.type === 'audio'">
        <font-awesome-icon :icon="['far', 'file-audio']" size="2x" />
      </span>
      <span v-else-if="item.type === 'thermalRaw'">
        <font-awesome-icon :icon="['far', 'file-video']" size="2x" />
      </span>
    </div>
    <div class="recording-main">
      <div class="recording-details">
        <div>
          <GroupLink :group-name="item.groupName" context="recordings" />
          <StationLink
            v-if="item.stationName"
            :station-name="item.stationName"
            :station-id="item.stationId"
            :group-name="item.groupName"
            context="recordings"
          />
          <DeviceLink
            :group-name="item.groupName"
            :device-name="item.deviceName"
            context="recordings"
            :type="item.type"
          />
          <span class="recording-tracks">
            <b-spinner small v-if="queuedForProcessing || processing" />
            <font-awesome-icon
              icon="stream"
              size="xs"
              v-else-if="item.type === 'thermalRaw' && item.trackCount !== 0"
            />
            <span class="label" v-if="queuedForProcessing">Queued</span>
            <span class="label" v-else-if="processing">Processing</span>
            <span class="label" v-else-if="corruptedOrFailed">
              Processing failed
            </span>
            <span
              class="label"
              v-else-if="item.type === 'thermalRaw' && item.trackCount !== 0"
            >
              {{ item.trackCount }} track<span v-if="item.trackCount > 1"
                >s</span
              >
            </span>

            <span class="label" v-else-if="item.type === 'thermalRaw'"
              >No tracks</span
            >
            <span class="label sub-label" v-if="filteredCount > 0">
              ( {{ filteredCount }} filtered )
            </span>
          </span>
          <div v-if="item.location !== '(unknown)'" class="recording-location">
            <a
              @click.stop.prevent="showLocation"
              title="View location"
              class="location-link"
            >
              <font-awesome-icon icon="map-marker-alt" />
            </a>
          </div>
        </div>
        <div v-if="filteredTags.length !== 0" class="recording-tags">
          <TagBadge
            v-for="(tag, index) in filteredTags"
            :key="index"
            :tag="tag"
          />
        </div>
      </div>
      <div
        v-b-tooltip.hover
        title="Cacophony Index: Measures Richness of Audio"
        class="cacophony-container"
        :style="{
          marginRight:
            item.location !== '(unknown)' ? '0.5em' : 'calc(109px + 0.5em)',
        }"
        v-if="item.type === 'audio' && item.cacophonyIndex !== undefined"
      >
        <CacophonyIndexGraph
          :id="item.id"
          :cacophonyIndex="item.cacophonyIndex"
          :simplify="true"
        />
      </div>
      <div class="recording-time-duration">
        <div class="recording-time">
          <font-awesome-icon :icon="['far', 'calendar']" size="xs" />
          <span class="label"
            ><span class="item-date">{{ item.date }}</span>
            {{ item.time }}</span
          >
        </div>
        <div class="recording-duration">
          <font-awesome-icon :icon="['far', 'clock']" size="xs" />
          <span class="label">{{ Math.round(item.duration) }} seconds</span>
        </div>
        <div v-if="hasBattery" class="recording-battery">
          <BatteryLevel :battery-level="item.batteryLevel" />
        </div>
      </div>
    </div>
    <!--    <div class="recording-thumb">-->
    <!--      <img-->
    <!--        :src="thumbnailSrc"-->
    <!--        width="64"-->
    <!--        height="64"-->
    <!--        :alt="`thumbnail for #${item.id}`"-->
    <!--      />-->
    <!--    </div>-->

    <div
      v-if="item.location !== '(unknown)'"
      :class="['recording-location', headerClass]"
    >
      <a
        @click.stop.prevent="showLocation"
        title="View location"
        class="location-link"
      >
        <font-awesome-icon icon="map-marker-alt" size="3x" />
      </a>
    </div>
  </a>
  <div
    v-else-if="item && item.id"
    :class="['recording-summary-row', headerClass]"
  >
    <a :href="getRecordingPath(item.id)" target="_blank">
      {{ item.id }}
    </a>
    <DeviceLink
      :device-name="item.deviceName"
      :type="item.type"
      :group-name="item.groupName"
      context="recordings"
    />
    <span>{{ item.date }}</span>
    <span class="recording-time">{{ item.time }}</span>
    <span>{{ Math.round(item.duration) }}s</span>
    <span>
      <TagBadge v-for="(tag, index) in filteredTags" :key="index" :tag="tag" />
    </span>
    <GroupLink :group-name="item.groupName" context="recordings" />
    <StationLink
      v-if="item.stationName"
      :station-name="item.stationName"
      :station-id="item.stationId"
      :group-name="item.groupName"
      context="recordings"
    />
    <span v-else></span>
    <b-modal
      v-model="showingLocation"
      hide-footer
      :title="`${item.deviceName}: #${item.id}`"
      lazy
    >
      <MapWithPoints :points="itemLocation" />
    </b-modal>
    <span @click="showLocation">{{ item.location }}</span>
    <BatteryLevel v-if="item.batteryLevel" :battery-level="item.batteryLevel" />
    <span v-else />
  </div>
</template>

<script lang="ts">
import BatteryLevel from "./BatteryLevel.vue";
import TagBadge from "./TagBadge.vue";
import MapWithPoints from "@/components/MapWithPoints.vue";
import CacophonyIndexGraph from "@/components/Audio/CacophonyIndexGraph.vue";
import api from "@/api";
import DeviceLink from "@/components/DeviceLink.vue";
import StationLink from "@/components/StationLink.vue";
import GroupLink from "@/components/GroupLink.vue";
import DefaultLabels from "../const";
import { RecordingProcessingState } from "@typedefs/api/consts";
import {
  ApiAutomaticTrackTagResponse,
  ApiHumanTrackTagResponse,
} from "@typedefs/api/trackTag";

const addToListOfTags = (
  allTags: Record<string, IntermediateDisplayTag>,
  tagName: string,
  isAutomatic: boolean,
  taggerId: number | null
) => {
  const tag = allTags[tagName] || {
    taggerIds: [],
    automatic: false,
    human: false,
  };
  if (taggerId && !tag.taggerIds.includes(taggerId)) {
    tag.taggerIds.push(taggerId);
  }
  if (isAutomatic) {
    tag.automatic = true;
  } else {
    tag.human = true;
  }
  allTags[tagName] = tag;
};

const collateTags = (recTags: any[], tracks: any[]): DisplayTag[] => {
  // Build a collection of tagItems - one per animal
  const tagItems: Record<string, DisplayTag> = {};

  if (tracks) {
    for (let j = 0; j < tracks.length; j++) {
      const track = tracks[j];
      // For track tags, pick the best one, which is the "master AI" tag.
      const aiTag = track.tags.find(
        (tag: ApiAutomaticTrackTagResponse) =>
          tag.data &&
          (tag.data === "Master" ||
            (typeof tag.data === "object" && tag.data.name === "Master"))
      );
      const humanTags = track.tags.filter(
        (tag: ApiHumanTrackTagResponse) => !tag.automatic
      );

      let humansDisagree = false;
      if (aiTag && humanTags.length !== 0) {
        humansDisagree = humanTags.some(
          (tag: ApiHumanTrackTagResponse) => tag.what !== aiTag.what
        );
      }

      if (aiTag && !humansDisagree) {
        addToListOfTags(tagItems, aiTag.what, aiTag.automatic, null);
      }

      // Also add human tags:
      for (const tag of humanTags) {
        addToListOfTags(tagItems, tag.what, tag.automatic, tag.userId);
      }
    }
  }

  // Use automatic and human status to create an ordered array of objects
  // suitable for parsing into coloured spans
  const result = [];
  result.push(...recTags);
  for (let animal of Object.keys(tagItems).sort()) {
    const tagItem = tagItems[animal];
    let subOrder = 0;
    if (animal === "false positive") {
      subOrder = 3;
    } else if (animal === "multiple animals") {
      animal = "multiple";
      subOrder = 2;
    } else if (animal === "unidentified") {
      animal = "?";
      subOrder = 1;
    }

    if (tagItem.automatic && tagItem.human) {
      result.push({
        text: animal,
        class: "automatic human",
        taggerIds: tagItem.taggerIds,
        order: subOrder,
      });
    } else if (tagItem.human) {
      result.push({
        text: animal,
        class: "human",
        taggerIds: tagItem.taggerIds,
        order: 10 + subOrder,
      });
    } else if (tagItem.automatic) {
      result.push({
        text: animal,
        class: "automatic",
        order: 20 + subOrder,
      });
    }
  }
  // Sort the result array
  result.sort((a, b) => {
    return a.order - b.order;
  });
  return result;
};

export default {
  name: "RecordingSummary",
  components: {
    CacophonyIndexGraph,
    GroupLink,
    StationLink,
    DeviceLink,
    MapWithPoints,
    TagBadge,
    BatteryLevel,
  },
  props: {
    item: {
      type: Object,
      required: true,
    },
    displayStyle: {
      type: String,
      required: true,
      default: "cards",
    },
    futureSearchQuery: {
      type: Object,
    },
  },
  data() {
    return {
      showingLocation: false,
    };
  },
  computed: {
    headerClass() {
      if (this.item.filtered) {
        return "filtered-recording";
      }
      return "";
    },
    filteredCount() {
      return this.item.tracks.filter((track) => track.filtered).length;
    },
    filteredTags() {
      if (this.$store.state.User.userData.showFiltered) {
        return collateTags(this.item.recTags, this.item.tracks) ?? [];
      } else {
        const goodTracks = this.item.tracks.filter((track) => !track.filtered);
        return collateTags(this.item.recTags, goodTracks) ?? [];
      }
    },
    thumbnailSrc(): string {
      return api.recording.thumbnail(this.item.id);
    },
    hasBattery() {
      return this.item.batteryLevel;
    },
    window: {
      get() {
        return window;
      },
    },
    queuedForProcessing(): boolean {
      const state = this.item.processingState.toLowerCase();
      return (
        (state === RecordingProcessingState.Analyse ||
          state === RecordingProcessingState.AnalyseThermal ||
          state === RecordingProcessingState.Tracking ||
          state === RecordingProcessingState.Reprocess) &&
        !this.item.processing
      );
    },
    processing(): boolean {
      return this.item.processing;
    },
    corruptedOrFailed(): boolean {
      const state = this.item.processingState;
      return (
        state === RecordingProcessingState.Corrupt ||
        (state as string).endsWith(".failed")
      );
    },
    itemLocation(): { name: string; location: string }[] {
      return [
        {
          name: `${this.item.deviceName}, #${this.item.id}`,
          location: this.item.location,
        },
      ];
    },
  },
  methods: {
    showLocation() {
      this.showingLocation = true;
    },
    async navigateToRecording(event, recordingId) {
      if (event.target !== event.currentTarget && event.target.href) {
        // Clicking a link inside the outer card link
        return;
      }
      if (!(event.metaKey || event.ctrlKey || event.shiftKey)) {
        // Don't change the route if we're ctrl-clicking
        event.preventDefault();
        await this.$router.push({
          path: `/recording/${recordingId}`,
          query: this.futureSearchQuery,
        });
      }
    },
    getRecordingPath(recordingId) {
      return this.$router.resolve({
        path: `/recording/${recordingId}`,
        query: this.futureSearchQuery,
      }).href;
    },
  },
};
</script>

<style scoped lang="scss">
@import "~bootstrap/scss/functions";
@import "~bootstrap/scss/variables";
@import "~bootstrap/scss/mixins";

$recording-side-padding: 0.9rem;
$recording-side-padding-small: 0.5rem;

.svg-inline--fa,
.spinner-border-sm {
  color: $gray-600;
}

.recording-summary {
  display: flex;
  flex-flow: row nowrap;
  border: 1px solid $border-color;
  margin-bottom: 1rem;
  @include media-breakpoint-up(xs) {
    margin-bottom: 0.5rem;
  }
  @include media-breakpoint-down(xs) {
    font-size: 90%;
  }
  cursor: pointer;
  transition: box-shadow 0.2s;
  color: unset;
  a:visited {
    color: purple;
  }
  div {
    color: inherit;
  }
  &:hover {
    box-shadow: 0 1px 3px $gray-400;
    text-decoration: unset;
  }
  &:visited {
    border: 1px solid rgb(245, 245, 245);
    a:visited {
      color: #b314b3;
    }
  }
  &.filtered-recording {
    opacity: 0.7;
    background: #ddd;
  }
}

.recording-summary-row {
  width: 100%;

  &:nth-child(odd) {
    background-color: #eee;
  }
  &.filtered-recording {
    opacity: 0.7;
    background: #ddd;
  }
  border-top: 1px solid $border-color;
  display: table-row;
  a:visited {
    color: purple;
  }
  > * {
    display: table-cell;
    vertical-align: middle;
    padding: 5px;
    border-right: 1px solid $border-color;
    &:last-child {
      padding-right: 5px;
    }
  }
  .svg-inline--fa.fa-2x {
    font-size: 1.2em;
  }
  .recording-time {
    white-space: nowrap;
  }
}

.recording-type {
  padding: 0.8rem $recording-side-padding;
  background: $gray-100;
  @include media-breakpoint-up(sm) {
    padding: 1rem 1.1rem;
  }
  @include media-breakpoint-up(xs) {
    display: none;
  }
  flex: 0 1 auto;
  .fa-2x {
    font-size: 1.5em;
  }
}

.recording-main {
  flex: 1 1 auto;
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  min-height: 110px;
  @include media-breakpoint-up(xs) {
    min-height: unset;
  }
  .svg-inline--fa {
    width: 16px;
  }
  .recording-details {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 0.7rem $recording-side-padding;

    @include media-breakpoint-down(xs) {
      padding: 0.25rem $recording-side-padding-small;
    }
    .recording-station,
    .recording-group,
    .recording-device,
    .recording-location {
      display: inline-block;
      word-break: break-word;
      margin-right: 0.5rem;
    }

    .recording-location {
      color: $gray-600;
      .svg-inline--fa {
        //color: inherit;
        vertical-align: baseline;
      }
      @include media-breakpoint-up(md) {
        display: none;
      }
    }
  }
  .label {
    vertical-align: middle;
  }
  .sub-label {
    font-size: 0.8em;
  }
  .recording-time-duration {
    display: flex;
    flex-flow: row wrap;
    width: 100%;
    border-top: 1px solid $border-color;
    > div {
      padding: 0.5rem $recording-side-padding;
      font-size: 85%;
      @include media-breakpoint-down(xs) {
        padding: 0.25rem $recording-side-padding-small;
      }
    }
    .recording-duration,
    .recording-battery {
      border-left: 1px solid $border-color;
    }
    .recording-duration {
      margin-right: auto;
    }
  }
}

.recording-tags {
  max-width: 23em;
}

.recording-summary > .recording-location {
  display: flex;
  flex: 0 1 110px;
  min-width: 109px;
  text-align: center;
  align-items: center;
  justify-content: center;
  background: $gray-100;
  .svg-inline--fa {
    color: #bbb;
  }
  @include media-breakpoint-between(xs, sm) {
    display: none;
  }
  &.filtered-recording {
    opacity: 0.7;
    background: #ddd;
  }
}
.recording-tracks {
  display: inline-block;
  .label,
  .svg-inline--fa {
    vertical-align: baseline;
  }
}
.location-link {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cacophony-container {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 50px;
  margin-top: 0.5em;
  margin-bottom: 0.5em;
  border-radius: 0.5em;
  padding: 0.1em;
  border: 2px solid $gray-300;
  @include media-breakpoint-up(sm) {
    width: 90px;
    margin-top: 0.75em;
    margin-bottom: 0.75em;
  }
  @include media-breakpoint-between(xs, sm) {
    margin-right: 0.5em !important;
  }
}
</style>
