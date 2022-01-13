<template>
  <b-container>
    <b-row>
      <b-col cols="12" lg="8" class="mb-2">
        <audio
          ref="player"
          :src="audioUrl"
          volume="0.75"
          controls
          autoplay
          class="audio"
        />
      </b-col>
      <b-col
        cols="12"
        lg="6"
        v-if="
          recording.cacophonyIndex
        "
      >
        <CacophonyIndexGraph
          :id="recording.id"
          :cacophonyIndex="recording.cacophonyIndex"
        />
      </b-col>
    </b-row>
    <b-row>
      <b-col cols="2" class="db">
        <b-button-group class="pl-4" vertical>
          <b-button class="mt-1" @click="volumeLoudest">Loudest</b-button>
          <b-button class="mt-1" @click="volumeLouder">Louder</b-button>
          <b-button class="mt-1">Default</b-button>
          <b-button class="mt-1" @click="volumeQuieter">Quieter</b-button>
          <b-button class="mt-1" @click="volumeQuietest">Quietest</b-button>
        </b-button-group>
      </b-col>
      <b-row class="db m-0 no-gutters">
        <b-col offset="1" class="mt-0 ml-0 db" cols="12">
          <BasicTags @addAudioTag="addAudioTag($event)" />
          <CustomTags @addAudioTag="addAudioTag($event)" />
          <b-button class="float-right mt-3 mr-1" size="lg" @click="done()"
            >Done</b-button
          >
        </b-col>
        <b-col offset="9" md="3" class="mt-3">
          <b-button
            v-b-tooltip.hover.bottomleft="'Delete this recording'"
            :disabled="deleteDisabled"
            variant="danger"
            block
            @click="deleteRecording()"
          >
            <font-awesome-icon
              icon="exclamation-triangle"
              class="d-none d-md-inline"
            />
            Delete
          </b-button>
        </b-col>
      </b-row>
    </b-row>
    <b-row>
      <TagList
        :items="tagItems"
        @deleteTag="deleteTag($event)"
        @replay="replay($event)"
      />
    </b-row>
  </b-container>
</template>

<script lang="ts">
import api from "@api";
import BasicTags from "../Audio/BasicTags.vue";
import CustomTags from "../Audio/CustomTags.vue";
import TagList from "../Audio/TagList.vue";
import CacophonyIndexGraph from "../Audio/CacophonyIndexGraph.vue";
import { ApiAudioRecordingResponse } from "@typedefs/api/recording";
import {
  ApiRecordingTagRequest,
  ApiRecordingTagResponse,
} from "@typedefs/api/tag";
import { RecordingType } from "@typedefs/api/consts";
import { TagId } from "@typedefs/api/common";

export default {
  name: "AudioRecording",
  data() {
    return { deleteDisabled: false };
  },
  components: {
    CustomTags,
    BasicTags,
    TagList,
    CacophonyIndexGraph,
  },
  props: {
    recording: {
      type: Object,
      required: true,
    },
    audioUrl: {
      type: String,
      required: true,
    },
    audioRawUrl: {
      type: String,
      required: true,
    },
  },
  computed: {
    tagItems() {
      const tagItems = this.recording.tags.map((tag) => {
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
        const startTime = tag.startTime || 0;
        tagItem.startTime = startTime;
        tagItem.tag = tag;
        return tagItem;
      });
      return this.recording.tracks
        .flatMap((track) => {
          return track.tags.map((tag) => ({
            what: tag.what,
            who: tag.data.name,
            when: new Date().toLocaleString(),
            startTime: track.start,
          }));
        })
        .concat(tagItems);
    },
    audioRecording(): ApiAudioRecordingResponse {
      return this.recording;
    },
  },
  methods: {
    async getNextRecording(
      direction: "next" | "previous" | "either"
    ): Promise<boolean> {
      const params: any = {
        limit: 1,
        offset: 0,
        type: RecordingType.Audio,
      };
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
          // First, we want to see if we have a previous recording.
          // If so, go prev, else go next
          if (await this.getNextRecording("previous")) {
            return true;
          } else if (await this.getNextRecording("next")) {
            return true;
          }
          return false;
        default:
          throw `invalid direction: '${direction}'`;
      }
      params.order = JSON.stringify([["recordingDateTime", order]]);
      // Check for recording"
      const queryResponse = await api.recording.query(params);
      if (queryResponse.success) {
        const {
          result: { rows },
        } = queryResponse;
        if (rows.length) {
          this.$emit("load-next-recording", params);
          return true;
        }
        return false;
      }
      return false;
    },
    async deleteRecording() {
      this.deleteDisabled = true;
      const { success } = await api.recording.del(this.$route.params.id);
      if (success) {
        await this.getNextRecording("either");
      }
      this.deleteDisabled = false;
    },
    addAudioTag: async function (tag: ApiRecordingTagRequest) {
      const id = Number(this.$route.params.id);
      if (this.$refs.player.currentTime == this.$refs.player.duration) {
        tag.startTime = 0;
      } else {
        tag.startTime = Number(this.$refs.player.currentTime.toFixed(2));
      }
      const addTagResult = await api.recording.addRecordingTag(tag, id);
      if (addTagResult.success) {
        const {
          result: { tagId },
        } = addTagResult;
        this.$nextTick(() => {
          this.$emit("tag-changed", tagId);
        });
      }
    },
    async deleteTag(tagId: TagId) {
      const id = Number(this.$route.params.id);
      await api.recording.deleteRecordingTag(tagId, id);
      this.$nextTick(() => {
        this.$emit("tag-changed", tagId);
      });
    },
    async done() {
      await this.getNextRecording("either");
    },
    replay(time: string) {
      this.$refs.player.currentTime = time;
      this.$refs.player.play();
    },
    volumeLoudest() {
      this.$refs.player.volume = 1.0;
    },
    volumeLouder() {
      if (this.$refs.player.volume + 0.1 <= 1.0) {
        this.$refs.player.volume += 0.1;
      }
    },
    volumeDefault() {
      this.$refs.player.volume = 0.75;
    },
    volumeQuieter() {
      if (this.$refs.player.volume - 0.1 >= 0) {
        this.$refs.player.volume -= 0.1;
      }
    },
    volumeQuietest() {
      this.$refs.player.volume = 0.25;
    },
  },
};
</script>

<style scoped>
.tag-buttons,
.img-buttons {
  padding: 0 5px;
}
.db {
  border: 0px;
}
</style>
