<template>
  <b-list-group-item
    :to="{ path: 'recordings', query: recordingsPageQuery }"
    class="d-flex justify-content-between align-items-center"
  >
    <span>
      <font-awesome-icon
        v-if="group.lastThermalRecordingTime"
        icon="video"
        class="icon"
        size="xs"
      />
      <font-awesome-icon
        v-if="group.lastAudioRecordingTime"
        icon="music"
        class="icon"
        size="xs"
      />
      <font-awesome-icon
        v-if="!group.lastAudioRecordingTime && !group.lastThermalRecordingTime"
        icon="question"
        class="icon"
        size="xs"
      />
      {{ group.groupName }}
    </span>
    <b-badge
      v-if="thermalCount > 0 || audioCount > 0"
      pill
      variant="primary"
      class="ml-auto"
    >
      <span v-if="audioCount > 0">
        <font-awesome-icon icon="music" class="icon" size="xs" />
        {{ audioCount }}
      </span>
      <span v-if="audioCount > 0 && thermalCount > 0"> / </span>
      <span v-if="thermalCount > 0">
        <font-awesome-icon icon="video" class="icon" size="xs" />
        {{ thermalCount }}
      </span>
    </b-badge>
  </b-list-group-item>
</template>

<script lang="ts">
import recordingsApi from "../api/Recording.api";
import { ApiGroupResponse } from "@typedefs/api/group";

export default {
  name: "HomeGroupItem",
  props: {
    group: {
      type: Object,
      required: true,
    },
  },
  data: function () {
    return {
      audioCount: 0,
      thermalCount: 0,
    };
  },
  computed: {
    recordingsPageQuery() {
      return {
        group: this.group.id,
        days: 30,
      };
    },
  },
  async mounted() {
    const group: ApiGroupResponse = this.group;
    const now = new Date();
    now.setDate(now.getDate() - 1);
    const oneDayAgo = new Date(now);

    const latestThermal =
      group.lastThermalRecordingTime &&
      new Date(group.lastThermalRecordingTime);
    const latestAudio =
      group.lastAudioRecordingTime && new Date(group.lastAudioRecordingTime);

    if (latestThermal && latestThermal > oneDayAgo) {
      const params = {
        days: 1,
        group: [this.group.id],
        type: "video",
      };
      const countResponse = await recordingsApi.queryCount(params);
      if (countResponse.success) {
        const {
          result: { count },
        } = countResponse;
        this.thermalCount = count;
        // eslint-disable-next-line no-unused-vars,@typescript-eslint/no-unused-vars
        const hoursAgo =
          (latestThermal.getTime() - oneDayAgo.getTime()) / 1000 / 60 / 60;
        // console.log("COUNT", this.count, hoursAgo);

        // FIXME - count shouldn't be zero.
        // FIXME - 1 day ago doesn't seem to get recordings that are 23.7xx hours old
        //  Could it be because those recordings are corrupt under testing?
      }
    }
    if (latestAudio && latestAudio > oneDayAgo) {
      const params = {
        days: 1,
        group: [this.group.id],
        type: "audio",
      };
      const countResponse = await recordingsApi.queryCount(params);
      if (countResponse.success) {
        const {
          result: { count },
        } = countResponse;
        this.audioCount = count;
        // eslint-disable-next-line no-unused-vars,@typescript-eslint/no-unused-vars
        const hoursAgo =
          (latestAudio.getTime() - oneDayAgo.getTime()) / 1000 / 60 / 60;
        // console.log("COUNT", this.count, hoursAgo);

        // FIXME - count shouldn't be zero.
        // FIXME - 1 day ago doesn't seem to get recordings that are 23.7xx hours old
        //  Could it be because those recordings are corrupt under testing?
      }
    }
  },
};
</script>

<style scoped></style>
