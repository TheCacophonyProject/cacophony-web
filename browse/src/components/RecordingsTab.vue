<template>
  <div class="container" style="padding: 0">
    <h2>
      All recordings
      <help>
        All recordings ever made for this
        {{ `${deviceName ? "device" : stationName ? "station" : "group"}` }}
      </help>
    </h2>
    <RecordingsList
      :query-pending="loading"
      :recordings="recordings"
      :all-loaded="allLoaded"
      :view-recording-query="recordingsQuery"
      @load-more="queueRecordings"
    />
    <div v-if="!loading && recordings && recordings.length === 0">
      No recordings found for this
      {{ `${deviceName ? "device" : stationName ? "station" : "group"}` }}
    </div>
  </div>
</template>

<script lang="ts">
import Help from "@/components/Help.vue";
import RecordingsList from "@/components/RecordingsList.vue";
import api from "@/api";
const LOAD_PER_PAGE_CARDS = 10;
export default {
  name: "RecordingsTab",
  components: {
    RecordingsList,
    Help,
  },
  props: {
    groupName: { type: String, required: true },
    deviceName: { type: String, required: false, default: null },
    stationName: { type: String, required: false, default: null },
    recordingsQuery: { type: Object, required: true },
  },
  data() {
    return {
      recordings: [],
      totalRecordingCount: 0,
      loading: true,
      recordingsQueued: 0,
      allLoaded: false,
      currentPage: 1,
    };
  },
  async mounted() {
    await this.fetchRecordings();
  },
  methods: {
    async queueRecordings() {
      this.recordingsQueued++;
      if (!this.loading) {
        await this.requestRecordings();
      }
    },
    async requestRecordings() {
      // Keep track of the offset of the page.
      const nextQuery = { ...this.recordingsQuery };
      nextQuery.limit = LOAD_PER_PAGE_CARDS;
      nextQuery.offset = Math.max(0, this.currentPage * LOAD_PER_PAGE_CARDS);
      // Make sure the request wouldn't go past the count?
      const totalPages = Math.ceil(
        this.totalRecordingCount / LOAD_PER_PAGE_CARDS
      );
      if (this.currentPage < totalPages) {
        this.currentPage += 1;
        this.loading = true;
        const recordingsResponse = await api.recording.query(nextQuery);
        if (recordingsResponse.success) {
          // TODO: It's possible that more recordings have come in since we loaded the page,
          //  in which case our offsets are wrong. So check for duplicate recordings here.
          this.recordings.push(...recordingsResponse.result.rows);
        }
        this.loading = false;
        this.recordingsQueued--;
        this.recordingsQueued = Math.max(0, this.recordingsQueued);
        if (this.recordingsQueued !== 0) {
          await this.requestRecordings();
        }
      } else {
        // At end of search
        this.allLoaded = true;
      }
    },
    async fetchRecordings() {
      if (
        (this.recordingsQuery.group &&
          this.recordingsQuery.group.length &&
          this.recordingsQuery.group[0] !== null) ||
        (this.recordingsQuery.device &&
          this.recordingsQuery.device.length &&
          this.recordingsQuery.device[0] !== null) ||
        (this.recordingsQuery.station &&
          this.recordingsQuery.station.length &&
          this.recordingsQuery.station[0] !== null)
      ) {
        this.loading = true;
        this.recordingsQueued++;
        const recordingsResponse = await api.recording.query(
          this.recordingsQuery
        );
        if (recordingsResponse.success) {
          const {
            result: { rows, count },
          } = recordingsResponse;
          this.totalRecordingCount = count;
          this.recordings = rows;
        }
        this.loading = false;
        this.recordingsQueued--;
        if (this.recordingsQueued !== 0) {
          await this.requestRecordings();
        }
      }
    },
  },
  watch: {
    recordingsQuery() {
      this.fetchRecordings();
    },
  },
};
</script>

<style lang="scss">
.device-health {
  color: darkgray;
  &.healthy {
    color: #dc3545;
  }
}
.table-okay {
  border-left: 10px solid #cff1d7;
}
.table-warn {
  border-left: 10px solid #eecccf;
}
</style>
