<template>
  <b-container class="video-elements-wrapper">
    <b-row class="no-gutters">
      <b-col cols="12" lg="8">
        <CptvPlayer
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
      </b-col>
      <b-col cols="12" lg="4">
        <div v-if="tracks && tracks.length > 0" class="accordion">
          <TrackInfo
            v-for="(track, index) in tracks"
            :key="index"
            :track="track"
            :index="index"
            :tracks="tracks"
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
        <div v-if="!processingCompleted" class="processing">
          <b-spinner small />
          <span>Recording still processing.</span>
        </div>
      </b-col>
    </b-row>
    <b-row>
      <b-col cols="12" lg="8">
        <PrevNext
          :recording="recording"
          :can-go-backwards="canGoBackwardInSearch"
          :can-go-forwards="canGoForwardInSearch"
          @nextOrPreviousRecording="prevNext"
        />
        <RecordingControls
          :items="tagItems"
          :comment="recording.comment"
          :download-raw-url="videoRawUrl"
          :download-file-url="''"
          :processing-completed="processingCompleted"
          @deleteTag="deleteTag($event)"
          @addTag="addTag($event)"
          @updateComment="updateComment($event)"
          @nextOrPreviousRecording="
            gotoNextRecording('either', 'any', false, false)
          "
          @requested-export="requestedMp4Export"
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
import PrevNext from "./PrevNext.vue";
import RecordingControls from "./RecordingControls.vue";
import TrackInfo from "./Track.vue";
import CptvPlayer from "cptv-player-vue/src/CptvPlayer.vue";
import RecordingProperties from "./RecordingProperties.vue";
import { TagColours, WALLABY_GROUP } from "@/const";
import api from "@/api";
import { ApiThermalRecordingResponse } from "@typedefs/api/recording";
import { RecordingProcessingState } from "@typedefs/api/consts";
import { ApiTrackResponse } from "@typedefs/api/track";
import {
  ApiTrackTagRequest,
  ApiTrackTagResponse,
} from "@typedefs/api/trackTag";
import {
  ApiRecordingTagRequest,
  ApiRecordingTagResponse,
} from "@typedefs/api/tag";
import { TagId } from "@typedefs/api/common";
import { RecordingType } from "@typedefs/api/consts";

export default {
  name: "VideoRecording",
  components: {
    PrevNext,
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
    };
  },
  computed: {
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
    tracks() {
      return (
        this.recording && (this.recording as ApiThermalRecordingResponse).tracks
      );
    },
    processingCompleted() {
      return (
        this.recording &&
        (this.recording as ApiThermalRecordingResponse).processingState ===
          RecordingProcessingState.Finished
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
  },
  methods: {
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
        this.canGoBackwardInSearch = listIndex > 0;
        this.canGoForwardInSearch = listIndex < list.length - 1;
      } else {
        const prevNext = await Promise.all([
          this.hasNextRecording("previous", "any", false, true),
          this.hasNextRecording("next", "any", false, true),
        ]);
        this.canGoBackwardInSearch = prevNext[0];
        this.canGoForwardInSearch = prevNext[1];
      }
    },
    getListOfRecordingsIds(): string[] {
      return this.$route.query.id;
    },
    async gotoNextRecording(direction, tagMode, tags, skipMessage = false) {
      const idsList = this.getListOfRecordingsIds();
      if (idsList) {
        await this.goToNextRecordingInList(direction, idsList);
      } else {
        const searchQueryCopy = JSON.parse(JSON.stringify(this.$route.query));
        try {
          if (
            await this.getNextRecording(direction, tagMode, tags, skipMessage)
          ) {
            await this.$router.push({
              path: `/recording/${this.recording.id}`,
              query: searchQueryCopy,
            });
            if (direction === "next") {
              this.canGoBackwardInSearch = true;
              this.canGoForwardInSearch = await this.hasNextRecording(
                "next",
                tagMode,
                tags,
                true
              );
            } else if (direction === "previous") {
              this.canGoForwardInSearch = true;
              this.canGoBackwardInSearch = await this.hasNextRecording(
                "previous",
                tagMode,
                tags,
                true
              );
            }
          }
          // eslint-disable-next-line no-empty
        } catch (e) {}
      }
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
            return await this.$store.dispatch(
              "Video/GET_RECORDING",
              list[nextIndex]
            );
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
      skipMessage: boolean = false,
      noNavigate: boolean = false
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
      params.type = RecordingType.ThermalRaw;
      delete params.offset;
      try {
        if (!noNavigate) {
          this.$emit("load-next-recording", { params });
        } else {
          // Just return whether or not there is a next/prev recording.
          const { result, success } = await api.recording.query(params);
          return success && result.rows.length !== 0;
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

      const {
        success,
        result: { tagId },
      } = await api.recording.addRecordingTag(tag, this.recordingId);
      if (!success) {
        // Roll back local change
        this.localTags.splice(this.localTags.indexOf(newTag), 1);
        return;
      }
      this.$nextTick(() => {
        this.$emit("tag-changed", tagId);
      });
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
  padding: 0 20px;
  text-align: center;
  > span {
    vertical-align: middle;
  }
  > span:last-child {
    font-weight: 600;
    font-size: 120%;
  }
}
</style>
