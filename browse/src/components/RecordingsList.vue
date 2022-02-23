<template>
  <div
    :class="['results', { 'display-rows': !showCards }]"
    ref="list-container"
  >
    <div v-if="showCards">
      <div class="filtered-recordings">
        <span v-b-tooltip.hover :title="filteredToolTip">
          <input type="checkbox" id="cbFiltered" v-model="showFiltered" />
          <label for="cbFiltered"
            >Show Filtered ( {{ filteredCount }} Recording<span
              v-if="filteredCount != 1"
              >s</span
            >
            )</label
          >
        </span>
      </div>
      <div v-for="(itemsByDay, index_a) in recordingsChunked" :key="index_a">
        <h4 class="recordings-day">{{ relativeDay(itemsByDay) }}</h4>
        <div v-for="(itemsByHour, index_b) in itemsByDay" :key="index_b">
          <h5 class="recordings-hour">{{ hour(itemsByHour) }}</h5>
          <RecordingSummary
            v-for="(item, index) in itemsByHour"
            :item="item"
            :key="`${index}_card`"
            :ref="item.id"
            :futureSearchQuery="viewRecordingQuery"
            display-style="card"
          />
        </div>
      </div>
      <div v-if="queryPending" class="results loading">
        <div
          v-for="i in 10"
          :style="{
            background: `rgba(240, 240, 240, ${1 / i}`,
          }"
          :key="i"
          class="recording-placeholder"
        />
      </div>
    </div>
    <div v-else-if="tableItems">
      <div class="filtered-recordings rows">
        <span v-b-tooltip.hover :title="filteredToolTip">
          <input type="checkbox" id="cbFiltered" v-model="showFiltered" />
          <label for="cbFiltered"
            >Show Filtered ( {{ filteredCount }} Recording<span
              v-if="filteredCount != 1"
              >s</span
            >
            )</label
          >
        </span>
      </div>
      <div class="all-rows" v-if="tableItems.length !== 0">
        <div class="results-header">
          <div>
            <span> ID</span>
            <span>Type</span>
            <span>Device</span>
            <span>Date</span>
            <span>Time</span>
            <span>Duration</span>
            <span>Tags</span>
            <span>Group</span>
            <span>Station</span>
            <span>Location</span>
            <span>Battery</span>
          </div>
        </div>
        <div class="results-rows">
          <RecordingSummary
            v-for="(item, index) in filteredItems"
            :item="item"
            :ref="item.id"
            :index="index"
            :is-even-row="index % 2 === 1"
            :key="`${index}_row`"
            display-style="row"
            :futureSearchQuery="viewRecordingQuery"
          />

          <div
            v-for="i in queryPending ? 10 : 0"
            :key="i"
            class="recording-summary-row"
            :style="{
              background: `rgba(240, 240, 240, ${1 / i}`,
            }"
          >
            <span>&nbsp;</span>
            <span>&nbsp;</span>
            <span>&nbsp;</span>
            <span>&nbsp;</span>
            <span>&nbsp;</span>
            <span>&nbsp;</span>
            <span>&nbsp;</span>
            <span>&nbsp;</span>
            <span>&nbsp;</span>
            <span>&nbsp;</span>
          </div>
        </div>
      </div>
    </div>
    <div v-if="recordings.length && (allLoaded || atEnd)" class="all-loaded">
      <span>That's all! No more recordings to load for the current query.</span>
    </div>
    <div v-else-if="loadButton" class="all-loaded">
      <div>
        All {{ this.recordings.length }} recording<span
          v-if="this.recordings.length > 1"
          >s</span
        >
        are filtered
      </div>

      <b-button class="load-more" @click="$emit('load-more')"
        >Load More</b-button
      >
    </div>
  </div>
</template>

<script lang="ts">
import RecordingSummary from "@/components/RecordingSummary.vue";
import {
  toNZDateString,
  startOfDay,
  startOfHour,
  toStringTodayYesterdayOrDate,
} from "@/helpers/datetime";
import { RecordingType } from "@typedefs/api/consts";
import {
  ApiAudioRecordingResponse,
  ApiThermalRecordingResponse,
} from "@typedefs/api/recording";
import { LatLng } from "@typedefs/api/common";
import { ApiRecordingTagResponse } from "@typedefs/api/tag";
import {
  ApiAutomaticTrackTagResponse,
  ApiHumanTrackTagResponse,
} from "@typedefs/api/trackTag";
import { ApiTrackResponse } from "@typedefs/api/track";
import DefaultLabels, { FILTERED_TOOLTIP } from "../const";

const parseLocation = (location: LatLng): string => {
  if (location && typeof location === "object") {
    const latitude = location.lat;
    const longitude = location.lng;
    return latitude.toFixed(5) + ", " + longitude.toFixed(5);
  } else {
    return "(unknown)";
  }
};

const parseProcessingState = (result: string): string => {
  if (!result) {
    return "";
  }
  const string = result.toLowerCase();
  return string.charAt(0).toUpperCase() + string.slice(1);
};

interface IntermediateDisplayTag {
  taggerIds: number[];
  automatic: boolean;
  human: boolean;
}

interface DisplayTag {
  taggerIds: number[];
  automatic: boolean;
  class: "human" | "automatic" | "automatic human";
  human: boolean;
  order: number;
}

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

const collateTags = (tags: ApiRecordingTagResponse[]): DisplayTag[] => {
  // Build a collection of tagItems - one per animal
  const tagItems: Record<string, DisplayTag> = {};
  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i];
    // FIXME - check if we needed animal here
    const tagName = tag.what || tag.detail; //tag.animal === null ? tag.event : tag.animal;
    const taggerId = tag.taggerId;
    addToListOfTags(tagItems, tagName, tag.automatic, taggerId);
  }

  // Use automatic and human status to create an ordered array of objects
  // suitable for parsing into coloured spans
  const result = [];
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
  return result;
};

const FILTERED_MAX = 100;
interface ItemData {
  kind: "dataRow" | "dataSeparator";
  id: number;
  type: RecordingType;
  deviceName: string;
  groupName: string;
  stationName?: string;
  stationId?: number;
  location: string;
  dateObj: Date;
  date: string;
  time: string;
  duration: number;
  recTags: DisplayTag[];
  batteryLevel: number | null;
  trackCount: number;
  processingState: string;
  processing: boolean;
  tracks: any[];
  filtered: boolean;
}

export default {
  name: "RecordingsList",
  components: { RecordingSummary },
  props: {
    recordings: {
      type: Array,
      required: true,
    },
    showCards: {
      type: Boolean,
      default: true,
    },
    queryPending: {
      type: Boolean,
      required: true,
    },
    viewRecordingQuery: {
      type: Object,
      default: () => ({}),
    },
    allLoaded: {
      type: Boolean,
      default: false,
    },
  },
  watch: {
    showFiltered() {
      if (this.filteredCount == this.recordings.length) {
        if (this.recordings.length < FILTERED_MAX) {
          this.$emit("load-more");
        } else if (!this.showFiltered) {
          // not showing any recordings but tried the first 100
          // give the user a button to load more
          this.loadButton = true;
        }
      } else {
        this.loadButton = false;
      }
      if (this.filteredCount > 0) {
        const scroller =
          this.$refs["list-container"].parentElement.parentElement;
        scroller.scrollTop = 0;
      }
    },
    showCards() {
      this.$refs["list-container"].style.height = "auto";
    },
    recordings() {
      let prevDate = null;
      const recordings = this.recordings as (
        | ApiThermalRecordingResponse
        | ApiAudioRecordingResponse
      )[];
      if (recordings.length === 0) {
        this.tableItems = [];
        this.recordingsChunkedByDayAndHour = [];
        this.loadedRecordingsCount = 0;
        return;
      }
      // Slice from last recordings count, so we're only processing new recordings.
      const newRecordings = recordings.slice(this.loadedRecordingsCount);
      this.loadedRecordingsCount = this.recordings.length;
      const items = [];

      for (const recording of newRecordings) {
        const thisDate = new Date(recording.recordingDateTime);
        if (
          prevDate === null ||
          startOfDay(thisDate).getTime() !== startOfDay(prevDate).getTime()
        ) {
          items.push({
            kind: "dataSeparator",
            hour: thisDate,
            date: thisDate,
          });
        } else if (
          startOfHour(thisDate).getTime() !== startOfHour(prevDate).getTime()
        ) {
          items.push({
            kind: "dataSeparator",
            hour: thisDate,
          });
        }
        prevDate = thisDate;
        const itemData: ItemData = {
          kind: "dataRow",
          id: recording.id,
          type: recording.type,
          deviceName: recording.deviceName,
          groupName: recording.groupName,
          location: parseLocation(recording.location),
          dateObj: thisDate,
          date: toNZDateString(thisDate),
          time: thisDate.toLocaleTimeString(),
          duration: recording.duration,
          tracks: recording.tracks,
          recTags: collateTags(recording.tags, []),
          batteryLevel: (recording as ApiAudioRecordingResponse).batteryLevel,
          trackCount: recording.tracks.length,
          processingState: parseProcessingState(recording.processingState),
          processing: recording.processing === true,
          stationName: recording.stationName,
          stationId: recording.stationId,
        };

        if (itemData.type == "thermalRaw") {
          itemData.filtered = itemData.tracks.every((track) => track.filtered);
        }
        items.push(itemData);
      }
      this.tableItems.push(...items);
      // Now calculate chunks of days and hour groupings
      {
        const chunks = [];
        let current = chunks;
        for (const item of items) {
          if (item.kind === "dataSeparator") {
            if (item.hasOwnProperty("date")) {
              chunks.push([]);
              current = chunks[chunks.length - 1];
            }
            if (item.hasOwnProperty("hour")) {
              current.push([]);
            }
          } else {
            current[current.length - 1].push(item);
          }
        }
        // if (chunks.length === 0) {
        //   // We've reached the end of the recordings.
        //   //this.atEnd = true;
        //   // console.log("At end of recordings");
        // }
        if (
          this.recordingsChunkedByDayAndHour.length !== 0 &&
          chunks.length !== 0
        ) {
          // We need to be careful joining these here:
          const lastDay =
            this.recordingsChunkedByDayAndHour[
              this.recordingsChunkedByDayAndHour.length - 1
            ];
          const lastHour =
            lastDay[lastDay.length - 1][lastDay[lastDay.length - 1].length - 1];
          const firstDay = chunks[0];
          const firstHour = firstDay[0][0];
          if (lastHour.date === firstHour.date) {
            // We're going to push firstDay into lastDay
            if (lastHour.time.split(":")[0] === firstHour.time.split(":")[0]) {
              lastDay[lastDay.length - 1].push(...firstDay[0]);
              lastDay.push(...firstDay.slice(1));
            } else {
              lastDay.push(...firstDay);
            }
            this.recordingsChunkedByDayAndHour.push(...chunks.slice(1));
          } else {
            this.recordingsChunkedByDayAndHour.push(...chunks);
          }
        } else {
          // If lastDay/Hour is the same as previous, join them.
          this.recordingsChunkedByDayAndHour.push(...chunks);
        }
      }
      this.$emit("filtered-count", this.filteredCount);

      if (this.filteredCount == this.recordings.length) {
        if (this.recordings.length < FILTERED_MAX) {
          this.$emit("load-more");
        } else if (!this.showFiltered) {
          // not showing any recordings but tried the first 100
          // give the user a button to load more
          this.loadButton = true;
        }
      } else {
        this.loadButton = false;
      }
    },
  },
  beforeDestroy() {
    this.observer && this.observer.disconnect();
  },
  beforeUpdate() {
    this.observer && this.observer.disconnect();
  },
  updated() {
    // Setup next intersection observer to see the page has scrolled enough to load more items
    this.observer = new IntersectionObserver(this.intersectionChanged);
    // Observe intersections of cards
    const maxY = [];
    // Just observe the nth to last item, and when it comes into view, we load more, and disconnect the observer.
    const n = 3;
    for (const ref of Object.values(this.$refs)) {
      if ((ref as any[]).length !== 0 && ref != this.$refs["list-container"]) {
        if (ref[0] && ref[0].$el) {
          const bounds = ref[0].$el.getBoundingClientRect();
          maxY.push([bounds.y, ref[0].$el]);
          maxY.sort((a, b) => b[0] - a[0]);
          if (maxY.length > n) {
            maxY.pop();
          }
        }
      }
    }
    if (maxY.length) {
      const observerTrigger = maxY[maxY.length - 1][1];
      if (this.showCards) {
        let yHeight = maxY[0][0];
        if (yHeight < 0) {
          let currentHeight = this.$refs["list-container"].style.height;
          const index = currentHeight.search("px");
          if (index > 0) {
            currentHeight = Number(currentHeight.substring(0, index));
            yHeight = currentHeight + yHeight;
          }
        }
        this.$refs["list-container"].style.height = `${yHeight}px`;
      }
      this.observer && this.observer.observe(observerTrigger);
    } else {
      if (this.showCards) {
        this.$refs["list-container"].style.height = "auto";
      }
    }
  },
  methods: {
    intersectionChanged(entries: IntersectionObserverEntry[]) {
      for (const intersectionEvent of entries) {
        if (intersectionEvent.isIntersecting) {
          this.observer.unobserve(intersectionEvent.target);
          this.$emit("load-more");
        }
      }
    },
    relativeDay(itemDate) {
      itemDate = itemDate[0][0].dateObj;
      return toStringTodayYesterdayOrDate(itemDate);
    },
    hour(itemDate) {
      itemDate = itemDate.length && itemDate[0].dateObj;
      const hours = itemDate && itemDate.getHours();
      if (hours === 0) {
        return "12am";
      }
      return `${hours <= 12 ? hours : hours - 12}${hours < 12 ? "am" : "pm"}`;
    },
  },
  data() {
    return {
      recordingsChunkedByDayAndHour: [],
      tableItems: [],
      atEnd: false,
      loadedRecordingsCount: 0,
      loadButton: false,
      filteredToolTip: FILTERED_TOOLTIP,
    };
  },
  computed: {
    showFiltered: {
      set: function (val) {
        localStorage.setItem("showFiltered", val);
        this.$store.state.User.userData.showFiltered = val;
      },
      get: function () {
        return this.$store.state.User.userData.showFiltered;
      },
    },
    filteredCount() {
      return this.tableItems.filter((item) => item.filtered).length;
    },
    filteredItems() {
      if (this.showFiltered) {
        return this.tableItems;
      } else {
        return this.tableItems.filter((item) => !item.filtered);
      }
    },
    recordingsChunked() {
      if (this.showFiltered) {
        return this.recordingsChunkedByDayAndHour;
      } else {
        const filteredChunks = [];
        for (const chunk of this.recordingsChunkedByDayAndHour) {
          const hourChunks = [];
          for (const hourChunk of chunk) {
            const filteredHours = hourChunk.filter((item) => !item.filtered);
            if (filteredHours.length > 0) {
              hourChunks.push(filteredHours);
            }
          }
          if (hourChunks.length > 0) {
            filteredChunks.push(hourChunks);
          }
        }
        return filteredChunks;
      }
    },
  },
};
</script>

<style scoped lang="scss">
@import "~bootstrap/scss/functions";
@import "~bootstrap/scss/variables";
@import "~bootstrap/scss/mixins";

.recordings-day {
  position: sticky;
  top: 0;
  z-index: 101;
  padding: 0.5rem 0;
  font-size: 1em;
  font-weight: 600;
}

.recordings-hour {
  font-size: 0.9em;
  font-weight: 600;
}

@include media-breakpoint-down(md) {
  .recordings-hour {
    position: sticky;
    top: 0;
    right: 0;
    text-align: right;
    margin-top: -1rem;
    margin-bottom: 0;
    padding: 0.7rem 0;
  }
  .recordings-day + div .recordings-hour {
    margin-top: -2.8rem;
    margin-bottom: 11px;
  }
}

@include media-breakpoint-up(md) {
  .recordings-hour {
    display: inline-block;
    position: sticky;
    float: left;
    top: 40px;
    margin-left: -60px;
    margin-top: 15px;
  }
}

.recording-placeholder {
  height: 110px;
  margin-bottom: 15px;
}

.results {
  max-width: 640px;
}

.results.display-rows {
  // overflow-x: auto;
  //overflow-y: unset;
  max-width: unset;

  .results-rows {
    display: table-row-group;
  }
  .all-rows {
    display: table;
    width: 100%;
    border-top: 1px solid $border-color;
    border-left: 1px solid $border-color;
  }

  .results-header {
    margin-bottom: 0;
    display: table-header-group;
    > div {
      display: table-row;
      > span {
        z-index: 1;
        position: sticky;
        top: 30px;
        background: white;
        // background: transparentize($white, 0.15);
        padding: 5px;
        font-weight: 700;
        vertical-align: middle;
        display: table-cell;
        border-right: 1px solid $border-color;
        border-bottom: 2px solid $border-color;
      }
    }
  }
}

.all-loaded {
  text-align: center;
  padding-top: 20px;
  padding-bottom: 30px;
  color: #aaa;
  > span {
    padding: 5px 10px;
    border-radius: 15px;
    background: $gray-100;
    font-weight: bold;
  }
}

.filtered-recordings {
  position: sticky;
  top: 0;
  text-align: right;
  z-index: 100;
  background: transparentize($white, 0.15);
  padding: 8px;
  &.rows {
    background: white;
    height: 30px;
  }
}
</style>
