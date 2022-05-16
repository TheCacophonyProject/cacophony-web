<template>
  <aside class="playlist-container">
    <font-awesome-icon
      @click="navigateToNextRecording(QueryDirection.Previous)"
      :disable="nextRecordings.prev === null"
      :class="{ disabled: nextRecordings.prev === null }"
      role="button"
      icon="step-backward"
      size="lg"
      class="mr-1"
    />
    <a download="audio_recording.mp3" :href="url">
      <font-awesome-icon icon="download" size="lg" />
    </a>
    <div @click="deleteRecording" class="text-danger pl-4" role="button">
      <font-awesome-icon icon="trash" />
    </div>
    <font-awesome-icon
      @click="navigateToNextRecording(QueryDirection.Next)"
      :disable="nextRecordings.next === null"
      :class="{ disabled: nextRecordings.next === null }"
      role="button"
      icon="step-forward"
      size="lg"
    />
  </aside>
</template>
<script lang="ts">
import { PropType } from "vue";
import { defineComponent, onMounted, watch } from "@vue/composition-api";

import api from "@/api";
import { useRoute, useRouter, useState } from "@/utils";

import { RecordingType } from "@typedefs/api/consts";
import type { Dictionary } from "vue-router/types/router";
import { ApiRecordingResponse } from "@typedefs/api/recording";

enum QueryDirection {
  Next = "next",
  Previous = "previous",
}
type Query = Dictionary<string | (string | null)[]>;

export default defineComponent({
  name: "Playlist",
  props: {
    recordingDateTime: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    deleteRecording: {
      type: Function as PropType<() => Promise<void>>,
      required: true,
    },
  },
  setup(props) {
    const route = useRoute();
    const router = useRouter();
    const [nextRecordings, setNextRecordings] = useState<{
      next: { id: number; query: Query } | null;
      prev: { id: number; query: Query } | null;
    }>({ next: null, prev: null });
    const stripQuery = (
      query: Query,
      remove = ["to", "from", "order", "type", "limit", "offset"]
    ) => {
      const newQuery: Query = {};
      for (const key in query) {
        if (remove.includes(key)) {
          continue;
        }
        newQuery[key] = query[key];
      }
      return newQuery;
    };

    const queryNextRecording = async (
      query: Query
    ): Promise<ApiRecordingResponse[]> => {
      try {
        const response = await api.recording.query(query);
        if (response.success) {
          const { result } = response;
          return result.rows;
        } else {
          throw response.result.messages;
        }
      } catch (error) {
        console.error(error);
        return null;
      }
    };

    const getNextRecordingQuery = (
      direction: QueryDirection,
      limit = 1
    ): Query => {
      const currentQuery = route.value.query;
      const orderBy = (o: string) => JSON.stringify([["recordingDateTime", o]]);
      const [to, from, order] =
        direction === QueryDirection.Next
          ? [null, props.recordingDateTime, orderBy("ASC")]
          : [props.recordingDateTime, null, orderBy("DESC")];
      const query = {
        to,
        from,
        order,
        limit: limit.toString(),
        type: RecordingType.Audio,
      };
      return { ...currentQuery, ...query };
    };

    const pushNextRecording = async (id: number, query: Query) => {
      if (route.value.params.id !== id.toString()) {
        router.push({
          path: `/recording/${id}`,
          query: stripQuery(query),
        });
      }
    };

    const navigateToNextRecording = async (direction: QueryDirection) => {
      const recording =
        direction === QueryDirection.Next
          ? nextRecordings.value.next
          : nextRecordings.value.prev;

      if (recording) {
        pushNextRecording(recording.id, recording.query);
      }
    };
    const initNextRecordings = async () => {
      const prevQuery = getNextRecordingQuery(QueryDirection.Previous);
      const nextQuery = getNextRecordingQuery(QueryDirection.Next);
      const prevRecs = await queryNextRecording(prevQuery);
      const nextRecs = await queryNextRecording(nextQuery);

      setNextRecordings({
        next:
          nextRecs.length > 0 ? { id: nextRecs[0].id, query: nextQuery } : null,
        prev:
          prevRecs.length > 0 ? { id: prevRecs[0].id, query: prevQuery } : null,
      });
    };
    onMounted(() => {
      initNextRecordings();
    });
    watch(() => props.url, initNextRecordings);

    return {
      navigateToNextRecording,
      QueryDirection,
      nextRecordings,
    };
  },
});
</script>
<style lang="scss" scoped>
@import "~bootstrap/scss/functions";
@import "~bootstrap/scss/variables";
@import "~bootstrap/scss/mixins";

.playlist-container {
  display: flex;
  width: 100%;
  padding: 0.5em 1em 0.5em 1em;

  justify-content: space-between;
  background: white;
  border: solid #e8e8e8 1px;
  border-radius: 6px;
  box-shadow: 0px 0px 4px 0px rgba(190, 189, 189, 0.25);
  color: #353746;
}
.disabled {
  cursor: not-allowed;
  color: #d0d0d0;
}
@include media-breakpoint-down(md) {
  .playlist-container {
    position: fixed;
    bottom: 0;
    left: 0;
    z-index: 100;
  }
}
</style>
