<template>
  <b-list-group-item
    :to="{ path: 'recordings', query: recordingsPageQuery }"
    class="d-flex justify-content-between align-items-center"
  >
    {{ group.groupName }}
    <b-badge v-if="count > 0" pill variant="primary" class="ml-auto">
      {{ count }}
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
      count: 0,
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
    if (
      group.lastRecordingTime &&
      new Date(group.lastRecordingTime) > oneDayAgo
    ) {
      const params = {
        days: 1,
        group: [this.group.id],
      };
      const countResponse = await recordingsApi.queryCount(params);
      if (countResponse.success) {
        const {
          result: { count },
        } = countResponse;
        this.count = count;
        // eslint-disable-next-line no-unused-vars,@typescript-eslint/no-unused-vars
        const hoursAgo =
          (new Date(group.lastRecordingTime).getTime() - oneDayAgo.getTime()) /
          1000 /
          60 /
          60;
        // console.log("COUNT", this.count, hoursAgo);

        // FIXME - count shouldn't be zero.
        // FIXME - 1 day ago doesn't seem to get recordings that are 23.7xx hours old
        //  Could it be because those recordings are corrupt under testing?
      }
    } else if (group.lastRecordingTime) {
      //console.log(group.lastRecordingTime);
    }
  },
};
</script>

<style scoped></style>
