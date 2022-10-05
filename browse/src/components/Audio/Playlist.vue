<template>
  <aside class="playlist-container">
    <font-awesome-icon
      @click="navigateToNextRecording(QueryDirection.Previous)"
      :disable="nextRecordings.prev === null && isLoading"
      :class="{ disabled: nextRecordings.prev === null }"
      role="button"
      icon="step-backward"
      size="lg"
      class="mr-1"
    />
    <a download="audio_recording.mp3" :href="url">
      <font-awesome-icon icon="download" size="lg" />
    </a>
    <button
      :disabled="!isGroupAdmin"
      @click="deleteRecording"
      class="delete-button ml-4"
      :class="{
        ...(isGroupAdmin ? { 'text-danger': true } : { disabled: true }),
      }"
      v-b-tooltip.hover
      :title="!isGroupAdmin ? 'Deleting recording requires group admin' : ''"
    >
      <font-awesome-icon icon="trash" />
    </button>
    <font-awesome-icon
      @click="navigateToNextRecording(QueryDirection.Next)"
      :disabled="nextRecordings.next === null && isLoading"
      :class="{ disabled: nextRecordings.next === null }"
      role="button"
      icon="step-forward"
      size="lg"
    />
  </aside>
</template>
<script lang="ts">
import { PropType } from "vue";
import { defineComponent, onMounted, ref, watch } from "@vue/composition-api";

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
    isGroupAdmin: {
      type: Boolean,
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
        // console.error(error);
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
        countAll: "false",
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
    const isLoading = ref(true);
    const initNextRecordings = async () => {
      isLoading.value = true;
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
      isLoading.value = false;
    };
    onMounted(() => {
      initNextRecordings();
    });
    watch(() => props.url, initNextRecordings);

    return {
      navigateToNextRecording,
      isLoading,
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
    z-index: 1001;
  }
}
.delete-button {
  // remove the default button styling
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  outline: inherit;
}
</style>
