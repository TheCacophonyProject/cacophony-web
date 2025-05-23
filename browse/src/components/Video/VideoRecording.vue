<template>
  <b-container
    :class="['video-elements-wrapper', { 'loading-next': loadingNext }]"
  >
    <b-row class="no-gutters">
      <b-col cols="12" lg="8">
        <div v-if="isMP4">
          <MPEGPlayer
            ref="player"
            :video-url="videoRawUrl"
            :tracks="tracks"
            @trackSelected="trackSelected"
            :current-track="selectedTrack"
            @request-next-recording="nextRecording"
            @player-ready="playerReady"
            :frame-rate="frameRate"
          />
        </div>
        <div v-else>
          <CptvPlayer
            ref="player"
            :cptv-url="videoRawUrl"
            :cptv-size="videoRawSize"
            :tracks="tracks"
            :user-files="false"
            :recording-id="recording.id"
            :known-duration="recording.duration"
            :current-track="selectedTrack"
            :colours="colours"
            :recently-added-tag="recentlyAddedTrackTag"
            :can-go-backwards="canGoBackwardInSearch"
            :can-go-forwards="canGoForwardInSearch"
            :export-requested="requestedExport"
            @track-selected="trackSelected"
            @ready-to-play="playerReady"
            @request-next-recording="nextRecording"
            @request-prev-recording="prevRecording"
            @export-complete="requestedExport = false"
          />
        </div>
      </b-col>
      <b-col cols="12" lg="4">
        <div v-if="tracks && tracks.length > 0" class="accordion">
          <TrackInfo
            v-for="(track, index) in tracks"
            :key="index"
            :track="track"
            :index="index"
            :tracks="tracks"
            :device-id="deviceId"
            :num-tracks="tracks.length"
            :recording-id="recordingId"
            :is-wallaby-project="isWallabyProject()"
            :show="
              (!selectedTrack && index === 0) ||
              (selectedTrack && track.id === selectedTrack.trackId)
            "
            :colour="colours[index % colours.length]"
            :adjust-timespans="timespanAdjustment"
            @track-selected="trackSelected"
            @change-tag="changedTrackTag"
          />
        </div>
        <div class="filtered-tracks" v-b-tooltip.hover :title="filteredToolTip">
          <input type="checkbox" id="cbFiltered" v-model="showFiltered" />
          <label for="cbFiltered">
            Show Filtered ({{ filteredTracks.length }})</label
          >
        </div>
        <div v-if="processingQueued" class="processing">
          <b-spinner small />
          <span>Queued for processing</span>
        </div>
        <div v-else-if="processingFailedOrCorrupt" class="processing">
          <span>Processing recording encountered errors.</span>
          <b-btn v-if="processingFailed" @click="reprocess">Retry?</b-btn>
        </div>
        <div v-else-if="!processingCompleted" class="processing">
          <b-spinner small />
          <span>Recording still processing.</span>
        </div>
      </b-col>
    </b-row>
    <b-row>
      <b-col cols="12" lg="8">
        <div class="img-buttons">
          <span id="disabled-wrapper-prev" class="d-inline-block" tabindex="0">
            <b-button
              @click="gotoNextRecording('previous')"
              tabindex="0"
              :disabled="loadingNext || !canGoBackwardInSearch"
            >
              <font-awesome-icon icon="angle-left" class="fa-3x" />
            </b-button>
          </span>
          <b-tooltip target="disabled-wrapper-prev" placement="bottomleft"
            >Earlier in search</b-tooltip
          >
          <span id="disabled-wrapper-next" class="d-inline-block" tabindex="0">
            <b-button
              tabindex="0"
              @click="gotoNextRecording('next')"
              :disabled="loadingNext || !canGoForwardInSearch"
            >
              <font-awesome-icon icon="angle-right" class="fa-3x" />
            </b-button>
          </span>
          <b-tooltip target="disabled-wrapper-next" placement="bottomleft"
            >Later in search</b-tooltip
          >
        </div>

        <RecordingControls
          :items="tagItems"
          :comment="recording.comment"
          :groupId="recording.groupId.toString()"
          :stationId="recording.stationId.toString()"
          :download-raw-url="videoRawUrl"
          :download-file-url="''"
          :processing-completed="processingCompleted"
          @deleteTag="deleteTag($event)"
          @addTag="addTag($event)"
          @updateComment="updateComment($event)"
          @requested-export="requestedMp4Export"
          @deleted-recording="deletedRecording"
        />
      </b-col>
      <b-col cols="12" lg="4">
        <RecordingProperties :recording="recording" />
      </b-col>
    </b-row>
  </b-container>
</template>

<script lang="ts">
/* eslint-disable no-console */
import RecordingControls from "./RecordingControls.vue";
import TrackInfo from "./Track.vue";
import MPEGPlayer from "./MPEGPlayer.vue";
import CptvPlayer from "cptv-player-vue/src/CptvPlayer.vue";
import RecordingProperties from "./RecordingProperties.vue";
import { TagColours, WALLABY_GROUP } from "@/const";
import api from "@/api";
import { ApiThermalRecordingResponse } from "@typedefs/api/recording";
import { RecordingProcessingState, RecordingType } from "@typedefs/api/consts";
import { ApiTrackResponse } from "@typedefs/api/track";
import { ApiTrackTagResponse } from "@typedefs/api/trackTag";
import {
  ApiRecordingTagRequest,
  ApiRecordingTagResponse,
} from "@typedefs/api/tag";
import { TagId } from "@typedefs/api/common";
import { FILTERED_TOOLTIP } from "../../const";

export default {
  name: "VideoRecording",
  components: {
    MPEGPlayer,
    RecordingControls,
    RecordingProperties,
    TrackInfo,
    CptvPlayer,
  },
  props: {
    trackId: {
      type: Number,
      required: false,
    },
    recording: {
      type: Object,
      required: true,
    },
    videoRawUrl: {
      type: String,
      required: true,
    },
    videoRawSize: {
      type: Number,
      required: true,
    },
  },
  data() {
    return {
      showAddObservation: false,
      selectedTrack: null,
      recentlyAddedTrackTag: null,
      startVideoTime: 0,
      colours: TagColours,
      header: null,
      canGoForwardInSearch: false,
      canGoBackwardInSearch: false,
      requestedExport: false,
      localTags: [],
      loadingNext: false,
      filteredToolTip: FILTERED_TOOLTIP,
    };
  },
  computed: {
    frameRate: function () {
      // should get this from the actual files
      if (this.isMP4) {
        return 10;
      }
      return 9;
    },
    isMP4: function () {
      return this.recording.type == RecordingType.InfraredVideo;
    },
    tooltipTitle: function () {
      return FILTERED_TOOLTIP;
    },
    showFiltered: {
      set: function (val) {
        localStorage.setItem("showFiltered", val);
        this.$store.state.User.userData.showFiltered = val;
        if (!this.isMP4) {
          this.$refs["player"].renderCurrentFrame(true);
        }
        this.checkPreviousAndNextRecordings();
      },
      get: function () {
        return this.$store.state.User.userData.showFiltered;
      },
    },
    tagItems() {
      // TODO - Move to RecordingControls
      const tags: ApiRecordingTagResponse[] = this.localTags;
      const tagItems = [];
      tags.map((tag) => {
        const tagItem: any = {};
        if (tag.what) {
          tagItem.what = tag.what;
        }
        tagItem.detail = tag.detail;
        if (tag.confidence) {
          tagItem.confidence = tag.confidence.toFixed(2);
        }
        if (tag.automatic) {
          tagItem.who = "Cacophony AI";
          tagItem["_rowVariant"] = "warning";
        } else {
          tagItem.who = tag.taggerName || "-";
        }
        tagItem.when = new Date(tag.createdAt).toLocaleString();
        tagItem.tag = tag;
        tagItems.push(tagItem);
        // TODO - Sort tags by date newest to oldest
      });
      return tagItems;
    },
    deviceId(): number {
      return (this.recording && this.recording.deviceId) || -1;
    },
    recordingId() {
      return Number(this.$route.params.id);
    },
    timespanAdjustment() {
      if (this.header) {
        if (this.header.hasBackgroundFrame) {
          return 1 / this.header.fps;
        }
      }
      return 0;
    },
    filteredTracks() {
      if (!this.recording) {
        return null;
      }
      const tracks = (this.recording as ApiThermalRecordingResponse).tracks;
      return tracks.filter((track) => track.filtered);
    },
    tracks() {
      return (
        this.recording &&
        (this.recording as ApiThermalRecordingResponse).tracks
          .map((track) => ({
            ...track,
            tags: track.tags.map((tag) => ({ ...tag, data: tag.model })),
            positions: track.positions.map((position) => ({
              ...position,
              frameNumber: position.order,
            })),
          }))
          .filter((track) => this.showFiltered || !track.filtered)
      );
    },
    processingCompleted() {
      return (
        this.recording &&
        (this.recording as ApiThermalRecordingResponse).processingState ===
          RecordingProcessingState.Finished
      );
    },
    processingQueued() {
      return (
        !this.processingFailed &&
        !this.processingCompleted &&
        !this.recording.processing
      );
    },
    processingFailed() {
      return (
        this.recording &&
        (
          this.recording as ApiThermalRecordingResponse
        ).processingState.endsWith(".failed")
      );
    },
    processingFailedOrCorrupt() {
      return (
        this.processingFailed ||
        (this.recording &&
          (this.recording as ApiThermalRecordingResponse).processingState ===
            RecordingProcessingState.Corrupt)
      );
    },
  },
  async mounted() {
    this.updateLocalTags();
    await this.checkPreviousAndNextRecordings();
  },
  watch: {
    "recording.tags": function () {
      this.updateLocalTags();
    },
    async recording() {
      await this.checkPreviousAndNextRecordings();
      this.loadingNext = false;
    },
  },
  methods: {
    async reprocess() {
      const { success } = await api.recording.retryFailed(this.recordingId);
      if (success) {
        this.$emit("recording-updated", {
          id: this.recordingId,
          action: "updated",
        });
      } else {
        // TODO
      }
    },
    updateLocalTags() {
      const newTags: ApiRecordingTagResponse[] =
        (this.recording && this.recording.tags && [...this.recording.tags]) ||
        [];
      newTags.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      this.localTags = newTags;
    },
    requestedMp4Export(advanced?: boolean) {
      if (advanced === true) {
        this.requestedExport = "advanced";
      } else {
        this.requestedExport = true;
      }
    },
    async checkPreviousAndNextRecordings() {
      const list = this.getListOfRecordingsIds();
      if (list) {
        const listIndex = list.indexOf(this.recording.id.toString());
        this.canGoBackwardInSearch = list.length > 1 && listIndex > 0;
        this.canGoForwardInSearch =
          list.length > 1 && listIndex < list.length - 1;
      } else {
        const searchQueryCopy = JSON.parse(JSON.stringify(this.$route.query));
        const resolvedTagMode = searchQueryCopy.tagMode || false;
        const resolvedTags =
          searchQueryCopy.tags ||
          (searchQueryCopy.tag && [searchQueryCopy.tag]) ||
          false;

        const prevNext = await Promise.all([
          this.hasNextRecording(
            "previous",
            resolvedTagMode,
            resolvedTags,
            true
          ),
          this.hasNextRecording("next", resolvedTagMode, resolvedTags, true),
        ]);
        this.canGoBackwardInSearch = prevNext[0];
        this.canGoForwardInSearch = prevNext[1];
      }
    },
    getListOfRecordingsIds(): string[] | undefined {
      if (Array.isArray(this.$route.query.id)) {
        return this.$route.query.id;
      } else if (this.$route.query.id) {
        return [this.$route.query.id];
      }
      return;
    },
    async deletedRecording() {
      this.loadingNext = true;
      const recordingId = Number(this.$route.params.id);
      this.$emit("recording-updated", { id: recordingId, action: "deleted" });
      if (this.canGoBackwardInSearch || this.canGoForwardInSearch) {
        if (this.canGoForwardInSearch) {
          await this.gotoNextRecording("next");
        } else {
          await this.gotoNextRecording("previous");
        }
      }
    },
    async gotoNextRecording(
      direction: "next" | "previous" | "either",
      tagMode: false | string = false,
      tags: false | string[] = false,
      skipMessage = false
    ) {
      this.loadingNext = true;
      const idsList = this.getListOfRecordingsIds();
      if (idsList) {
        await this.goToNextRecordingInList(direction, idsList);
      } else {
        const searchQueryCopy = JSON.parse(JSON.stringify(this.$route.query));
        searchQueryCopy.type = this.recording.type;
        const resolvedTagMode = tagMode || searchQueryCopy.tagMode;
        const resolvedTags = tags || searchQueryCopy.tags;
        await this.getNextRecording(
          direction,
          resolvedTagMode,
          resolvedTags,
          skipMessage
        );
      }
      this.loadingNext = false;
    },
    async goToNextRecordingInList(direction, list: string[]) {
      const listIndex = list.indexOf(this.recording.id.toString());
      if (listIndex >= 0) {
        const nextIndex = direction === "next" ? listIndex + 1 : listIndex - 1;
        if (nextIndex >= 0 && nextIndex < list.length) {
          try {
            await this.$router.push({
              path: `/recording/${list[nextIndex]}`,
              query: { id: list },
            });
            this.canGoBackwardInSearch = nextIndex > 0;
            this.canGoForwardInSearch = nextIndex < list.length - 1;
            // eslint-disable-next-line no-empty
          } catch (e) {}
        }
      }
    },
    async hasNextRecording(direction, tagMode, tags, skipMessage) {
      return (
        (await this.getNextRecording(
          direction,
          tagMode,
          tags,
          skipMessage,
          true
        )) === true
      );
    },
    async getNextRecording(
      direction: "next" | "previous" | "either",
      tagMode: string | false,
      tags: string[] | false,
      skipMessage = false,
      noNavigate = false
    ): Promise<boolean | any> {
      const params = JSON.parse(JSON.stringify(this.$route.query));
      let order;
      switch (direction) {
        case "next":
          params.to = null;
          params.from = this.recording.recordingDateTime;
          order = "ASC";
          break;
        case "previous":
          params.from = null;
          params.to = this.recording.recordingDateTime;
          order = "DESC";
          break;
        case "either":
          if (await this.getNextRecording("next", tagMode, tags, true)) {
            return true;
          }
          return await this.getNextRecording(
            "previous",
            tagMode,
            tags,
            skipMessage
          );
        default:
          throw `invalid direction: '${direction}'`;
      }
      params.order = JSON.stringify([["recordingDateTime", order]]);
      params.limit = 1;
      params.type = this.recording.type;
      params.hideFiltered = !this.$store.state.User.userData.showFiltered;
      params.countAll = false;
      delete params.offset;
      try {
        if (!noNavigate) {
          this.$emit("load-next-recording", params);
          return true;
        } else {
          // Just return whether or not there is a next/prev recording.
          const recordingQuery = await api.recording.query(params);
          if (recordingQuery.success) {
            return recordingQuery.result.rows.length !== 0;
          }
          return false;
        }
      } catch (e) {
        return false;
      }
    },
    prevNext(event) {
      this.gotoNextRecording(event[0], event[1], event[2]);
    },
    async nextRecording() {
      await this.gotoNextRecording("next", false, false, true);
    },
    async prevRecording() {
      await this.gotoNextRecording("previous", false, false, true);
    },

    isWallabyProject() {
      return this.recording.groupId === WALLABY_GROUP;
    },
    async addTag(tag: ApiRecordingTagRequest) {
      // Add an initial tag to update the UI more quickly.
      const newTag: ApiRecordingTagResponse = {
        ...tag,
        id: -1,
        createdAt: new Date().toISOString(),
      };
      this.localTags.push(newTag);
      this.localTags.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      const addRecordingTagResponse = await api.recording.addRecordingTag(
        tag,
        this.recordingId
      );
      if (addRecordingTagResponse.success) {
        const {
          result: { tagId },
        } = addRecordingTagResponse;
        this.$nextTick(() => {
          this.$emit("tag-changed", tagId);
        });
      } else {
        // Roll back local change
        this.localTags.splice(this.localTags.indexOf(newTag), 1);
        return;
      }
    },
    async deleteTag(tagId: TagId) {
      // Remove tag from local tags to update UI quickly.
      const oldLocalTags = [...this.localTags];
      this.localTags.splice(
        this.localTags.findIndex(({ id }) => id === tagId),
        1
      );
      const { success } = await api.recording.deleteRecordingTag(
        tagId,
        this.recordingId
      );
      if (!success) {
        // Roll back local change
        this.localTags = oldLocalTags;
        return;
      }
      this.$nextTick(() => {
        this.$emit("tag-changed", tagId);
      });
    },
    changedTrackTag(trackTag: ApiTrackTagResponse) {
      this.recentlyAddedTrackTag = trackTag;
      setTimeout(() => {
        this.recentlyAddedTrackTag = null;
      }, 2000);
      this.$emit("track-tag-changed", trackTag.trackId);
    },
    async trackSelected(track) {
      const selectedTrack = {
        ...track,
      };
      const targetTrack: ApiTrackResponse = this.tracks.find(
        (track) => track.id === selectedTrack.trackId
      );
      if (track.gotoStart) {
        selectedTrack.start = Math.max(
          0,
          targetTrack.start - this.timespanAdjustment
        );
      }
      if (track.playToEnd) {
        selectedTrack.end = targetTrack.end - this.timespanAdjustment;
      }
      try {
        if (
          selectedTrack.trackId &&
          Number(this.$route.params.trackId) !== selectedTrack.trackId
        ) {
          await this.$router.replace({
            path: `/recording/${this.recording.id}/${selectedTrack.trackId}`,
            query: this.$route.query,
          });
        }
        // eslint-disable-next-line no-empty
      } catch (e) {}
      this.selectedTrack = selectedTrack;
    },
    async playerReady(header) {
      this.header = header;
      if (this.tracks && this.tracks.length) {
        const selectedTrack = this.tracks.find(
          (track) => track.id === Number(this.$route.params.trackId)
        );
        if (selectedTrack) {
          await this.trackSelected({
            trackId: selectedTrack.id,
            gotoStart: true,
          });
        } else {
          await this.trackSelected({
            trackId: this.tracks[0].id,
          });
        }
      }
    },
    async updateComment(comment: string) {
      const recordingId = Number(this.$route.params.id);
      await api.recording.comment(comment, recordingId);
      this.$emit("recording-updated", { id: recordingId, action: "updated" });
    },
  },
};
</script>

<style scoped lang="scss">
.video-elements-wrapper {
  padding: 0;
}
.processing {
  color: darkred;
  padding: 20px;
  text-align: center;
  > span {
    display: inline-block;
    vertical-align: middle;
    padding: 0 0 10px 0;
  }
  > span:last-child {
    font-weight: 600;
    font-size: 120%;
  }
}

// Prev-next buttons:
.img-buttons {
  padding: 0.5em;
  text-align: center;
  span:hover {
    opacity: 1;
  }
  > span > button {
    cursor: pointer;
    width: 4em;
    max-height: 4em;
    display: inline-block;
    opacity: 0.6;
    background: transparent;

    &:focus,
    &:active {
      outline: none;
    }

    color: inherit;
    border: 0;
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;

    &:disabled {
      opacity: 0.3;
    }
  }
}

@media only screen and (max-width: 575px) {
  .img-buttons {
    font-size: 80%;
  }
}

.loading-next {
  pointer-events: none;
  opacity: 0.1;
}

.filtered-tracks {
  margin-left: 20px;
}
</style>
