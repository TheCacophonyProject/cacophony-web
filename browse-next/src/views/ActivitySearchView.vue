<script setup lang="ts">
import SectionHeader from "@/components/SectionHeader.vue";
import type { ComputedRef, Ref } from "vue";
import { computed, inject, nextTick, onMounted, ref, watch } from "vue";
import type { NamedPoint } from "@models/mapUtils";
import MapWithPoints from "@/components/MapWithPoints.vue";
import Multiselect from "@vueform/multiselect";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import Datepicker from "@vuepic/vue-datepicker";
import { getLocationsForProject } from "@api/Project";
import {
  currentSelectedProject as currentActiveProject,
  userProjects,
} from "@models/provides";
import type { SelectedProject } from "@models/LoggedInUser";
import type { LoadedResource } from "@api/types";
import { RecordingLabels } from "@/consts";
import HierarchicalTagSelect from "@/components/HierarchicalTagSelect.vue";
import type { ApiVisitResponse } from "@typedefs/api/monitoring";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import { longRunningQuery, queryRecordingsInProject } from "@api/Recording";
import { RecordingType, TagMode } from "@typedefs/api/consts.ts";
import type { ApiGroupResponse as ApiProjectResponse } from "@typedefs/api/group";
import type { RecordingId } from "@typedefs/api/common";
import {
  useElementBounding,
  useElementSize,
  useResizeObserver,
  useWindowSize,
} from "@vueuse/core";
import { Browser } from "leaflet";
import win = Browser.win;

const mapBuffer = ref<HTMLDivElement>();
const searchContainer = ref<HTMLDivElement>();

const { right: searchContainerRight, top: searchContainerTop } =
  useElementBounding(searchContainer);
const { height: windowHeight } = useWindowSize();
const setMapBufferWidth = (parentElRight: number) => {
  if (mapBuffer.value) {
    const right = window.innerWidth - parentElRight;
    mapBuffer.value.style.width = `${Math.max(0, 500 - right)}px`;
  }
};
const setSearchContainerHeight = (winHeight: number) => {
  if (searchContainer.value) {
    //searchContainer.value.style.height = `${windowHeight.value - searchContainerTop.value}px`;
  }
};
watch(searchContainerRight, setMapBufferWidth);
watch(windowHeight, setSearchContainerHeight);

const currentProject = inject(currentActiveProject) as ComputedRef<
  SelectedProject | false
>;
const availableProjects = inject(userProjects) as Ref<
  LoadedResource<ApiProjectResponse[]>
>;
const currentSelectedProject = computed<ApiProjectResponse | null>(() => {
  if (currentProject.value && availableProjects.value) {
    const project = availableProjects.value.find(
      ({ id }) => id === (currentProject.value as SelectedProject).id
    );
    return project || null;
  }
  return null;
});

const projectHasAudio = computed<boolean>(() => {
  return (
    !!currentSelectedProject.value &&
    !!currentSelectedProject.value.lastAudioRecordingTime
  );
});

const projectHasCameras = computed<boolean>(() => {
  return (
    !!currentSelectedProject.value &&
    !!currentSelectedProject.value.lastThermalRecordingTime
  );
});

const projectHasAudioAndThermal = computed<boolean>(() => {
  return projectHasAudio.value && projectHasCameras.value;
});

const locations = ref<LoadedResource<ApiLocationResponse[]>>(null);
const availableLabels = RecordingLabels.slice(2).map(
  ({ text, description, value }) => ({
    label: text,
    value: (value || text).toLowerCase(),
  })
);

const selectedLabels = ref<string[]>([]);

const now = new Date();
const oneDayAgo = new Date(new Date().setDate(now.getDate() - 1));
//oneDayAgo.setHours(0, 0, 0, 0);
const threeDaysAgo = new Date(new Date().setDate(now.getDate() - 3));
//threeDaysAgo.setHours()
const oneWeekAgo = new Date(new Date().setDate(now.getDate() - 7));
const oneMonthAgo = new Date(new Date().setMonth(now.getMonth() - 1));
const threeMonthsAgo = new Date(new Date().setMonth(now.getMonth() - 3));
const oneYearAgo = new Date(new Date().setFullYear(now.getFullYear() - 1));
const lastTwentyFourHours: [Date, Date] = [oneDayAgo, now];

const searchIsValid = computed<boolean>(() => {
  const hasValidDateRange =
    Array.isArray(selectedDateRange.value) ||
    Array.isArray(customDateRange.value);
  const hasAdvancedSettingsSelected = showAdvanced.value;
  if (!hasAdvancedSettingsSelected) {
    return hasValidDateRange && selectedLocations.value.length !== 0;
  }

  // Make sure we have a valid state
  return false;
});

const dateRangePicker = ref<typeof Datepicker>();
const selectedDateRange = ref<[Date, Date] | "custom">(lastTwentyFourHours);
const customDateRange = ref<[Date, Date] | null>(null);
const combinedDateRange = computed<[Date, Date]>(() => {
  if (selectedDateRange.value === "custom") {
    if (customDateRange.value) {
      // Make custom range be from beginning of start date til end of end date.
      const start = new Date(customDateRange.value[0]);
      const end = new Date(customDateRange.value[1]);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return [start, end];
    }
    return customDateRange.value || [new Date(), new Date()];
  } else {
    return selectedDateRange.value;
  }
});

const maybeSelectDatePicker = (value: [Date, Date] | string) => {
  if (value === "custom") {
    nextTick(() => {
      if (dateRangePicker.value) {
        dateRangePicker.value.openMenu();
      }
    });
  }
};

const mapLocationForMap = (location: ApiLocationResponse): NamedPoint => {
  return {
    location: location.location,
    type: "station",
    project: (currentProject.value as SelectedProject).groupName,
    name: location.name,
  };
};

const getLatestDateForLocation = (
  location: ApiLocationResponse
): Date | null => {
  if (recordingMode.value === "cameras") {
    return (
      (location.lastThermalRecordingTime &&
        new Date(location.lastThermalRecordingTime)) ||
      null
    );
  } else if (recordingMode.value === "audio") {
    return (
      (location.lastAudioRecordingTime &&
        new Date(location.lastAudioRecordingTime)) ||
      null
    );
  }
  return null;
};

const locationHasRecordings = (location: ApiLocationResponse) => {
  if (recordingMode.value === "audio") {
    return !!location.lastAudioRecordingTime;
  } else if (recordingMode.value === "cameras") {
    return !!location.lastThermalRecordingTime;
  }
  return !!(
    location.lastAudioRecordingTime || location.lastThermalRecordingTime
  );
};

const locationsForMap = computed<NamedPoint[]>(() => {
  if (locations.value) {
    return locations.value
      .filter(
        (location) =>
          locationHasRecordings(location) &&
          location.location &&
          (location.location.lat !== 0 || location.location.lng !== 0)
      )
      .map(mapLocationForMap);
  }
  return [];
});
const highlightedPoint = ref<NamedPoint | null>(null);
const recordingMode = ref<"cameras" | "audio">("cameras");

watch(recordingMode, (nextMode) => {
  // If the selected date range no longer applies to the current mode, reset it.
  if (
    combinedDateRange.value[0] < minDateForGroup.value ||
    combinedDateRange.value[1] > maxDateForGroup.value
  ) {
    console.warn("Should adjust range");
    selectedDateRange.value = commonDateRanges.value[0].value;
    customDateRange.value = null;
  }
});
const selectedLocations = ref<(ApiLocationResponse | "any")[]>(["any"]);

const locationsInSelectedTimespan = computed<ApiLocationResponse[]>(() => {
  if (locations.value) {
    return locations.value.filter((location) => {
      if (location.location.lat === 0 && location.location.lng === 0) {
        return false;
      }
      const latestDateForLocation = getLatestDateForLocation(location);
      return (
        latestDateForLocation &&
        latestDateForLocation >= combinedDateRange.value[0] &&
        new Date(location.activeAt) <= combinedDateRange.value[1]
      );
    });
  }
  return [];
});
const onChangeLocationsSelect = (
  value: (ApiLocationResponse | "any")[],
  select: Multiselect
) => {
  if (!optionsRemapping.value) {
    if (value.length > 1) {
      nextTick(() => {
        const hasAny = selectedLocations.value.indexOf("any");
        if (hasAny >= 0) {
          selectedLocations.value.splice(hasAny, 1);
        }
      });
    } else if (value.length === 0) {
      nextTick(() => {
        selectedLocations.value = ["any"];
      });
    }
  }
};

const locationsInSelectedTimespanForMap = computed<NamedPoint[]>(() => {
  return locationsInSelectedTimespan.value
    .filter((location) => {
      // Locations filtered by selected locations.
      if (selectedLocations.value.length) {
        if (selectedLocations.value.includes("any")) {
          return true;
        } else {
          return !!selectedLocations.value.find(
            (selectedLocation: ApiLocationResponse | "any") => {
              return (
                (selectedLocation as ApiLocationResponse).id === location.id
              );
            }
          );
        }
      }
    })
    .map(mapLocationForMap);
});

const locationsInSelectedTimespanOptions = computed<
  { value: ApiLocationResponse | "any"; label: string }[]
>(() => {
  return [
    { value: "any", label: "Any location", disabled: true },
    ...locationsInSelectedTimespan.value.map((location) => ({
      value: location,
      label: location.name,
    })),
  ];
});

const selectedLocationsSelect = ref<Multiselect>();
const optionsInited = ref<boolean>(false);
const optionsRemapping = ref<boolean>(false);
watch(locationsInSelectedTimespanOptions, (nextOptions) => {
  // If this changed, we need to remap the selected locations to the existing
  // locations.
  const selected = [...selectedLocations.value];
  nextTick(() => {
    if (optionsInited.value) {
      optionsRemapping.value = true;
      if (selectedLocationsSelect.value) {
        (selectedLocationsSelect.value as any).clear();
        for (const item of selected) {
          if (item === "any") {
            (selectedLocationsSelect.value as any).select(nextOptions[0]);
          } else {
            const match = nextOptions.find(
              (option) =>
                (option.value as ApiLocationResponse).id &&
                (option.value as ApiLocationResponse).id === item.id
            );
            if (match) {
              (selectedLocationsSelect.value as any).select(match);
            }
          }
        }
      }
      if (selectedLocations.value.length === 0) {
        (selectedLocationsSelect.value as any).select(nextOptions[0]);
      }
      optionsRemapping.value = false;
    } else {
      optionsInited.value = true;
    }
  });
});

const minDateForGroup = computed<Date>(() => {
  // Earliest active location
  let earliest = new Date();
  if (locations.value) {
    for (const location of locations.value) {
      const activeAt = new Date(location.activeAt);
      if (activeAt < earliest) {
        earliest = activeAt;
      }
    }
  }
  return earliest;
});

const maxDateForGroup = computed<Date>(() => {
  // Earliest active location
  let latest = new Date();
  latest.setFullYear(2010);
  if (locations.value) {
    for (const location of locations.value) {
      const latestDateForLocation = getLatestDateForLocation(location);
      if (latestDateForLocation && latestDateForLocation > latest) {
        latest = latestDateForLocation;
      }
    }
  }
  return latest;
});
const maxDateForGroupMinusTwoWeeks = computed<Date>(() => {
  const max = new Date(maxDateForGroup.value);
  max.setDate(max.getDate() - 14);
  return new Date(max);
});
const highlightPoint = (point: NamedPoint) => {};

const timezoneForProject = computed<string>(() => {
  // TODO: This should be provided at the app level for each group?
  return "Pacific/Auckland";
});

const commonDateRanges = computed<
  { value: [Date, Date] | "custom"; label: string }[]
>(() => {
  const earliest = minDateForGroup.value;
  const latest = maxDateForGroup.value;
  const ranges = [];
  if (earliest < oneDayAgo && latest > oneDayAgo) {
    ranges.push({
      label: "Last 24 hours",
      value: lastTwentyFourHours,
    });
  }
  if (earliest < threeDaysAgo && latest > threeDaysAgo) {
    ranges.push({
      label: "Last 3 days",
      value: [threeDaysAgo, now],
    });
  }
  if (earliest < oneWeekAgo && latest > oneWeekAgo) {
    ranges.push({
      label: "Last week",
      value: [oneWeekAgo, now],
    });
  }
  if (earliest < oneMonthAgo && latest > oneMonthAgo) {
    ranges.push({
      label: "Last month",
      value: [oneMonthAgo, now],
    });
  }
  if (earliest < threeMonthsAgo && latest > threeMonthsAgo) {
    ranges.push({
      label: "Last 3 months",
      value: [threeMonthsAgo, now],
    });
  }
  if (earliest < oneYearAgo && latest > oneYearAgo) {
    ranges.push({
      label: "Last year",
      value: [oneYearAgo, now],
    });
  }
  ranges.push(
    {
      label: "Any time",
      value: [earliest, now],
    },
    {
      label: "Custom date range",
      value: "custom",
    }
  );
  return ranges as { value: [Date, Date] | "custom"; label: string }[];
});

const displayMode = ref<"visits" | "recordings">("recordings");

const taggedBy = ref<("AI" | "human")[]>([]);
const taggedByOptions = [
  {
    text: "Human",
    value: TagMode.HumanTagged,
  },
  {
    text: "A.I.",
    value: TagMode.AutomaticallyTagged,
  },
];

const exclusiveTagOptions = [
  {
    text: "Only A.I.",
    value: TagMode.AutomaticOnly,
  },
  {
    text: "Untagged", // Are there any actual untagged tracks?
    value: TagMode.UnTagged,
  },
  {
    text: "Only Human", // Are there any with only human tags?
    value: TagMode.HumanOnly,
  },
  {
    text: "Untagged by Humans",
    value: TagMode.NoHuman, // Untagged or ai tagged
  },
  {
    text: "Tagged by both",
    value: TagMode.AutomaticHuman,
  },
];

const exclusiveTagSearch = ref<boolean>(false);
const selectedTags = ref<string[]>([]);

const loadedRecordings = ref<ApiRecordingResponse[]>([]);

const format = (dates: Date[]) => {
  return dates
    .map((date) => {
      const day = date.getDate().toString().padStart(2, "0");
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const year = date.getFullYear();

      return `${day}/${month}/${year}`;
    })
    .join(" - ");
};

const loading = ref<boolean>(false);
const showAdvanced = ref<boolean>(false);

onMounted(async () => {
  setSearchContainerHeight(windowHeight.value);
  loading.value = true;
  if (currentProject.value) {
    // TODO: This could be provided for group at a higher level.
    locations.value = await getLocationsForProject(
      currentProject.value.id.toString(),
      true
    );
    selectedDateRange.value = commonDateRanges.value[0].value;
  }
  loading.value = false;
});

const visits = ref<ApiVisitResponse[]>();
const recordings = ref<ApiRecordingResponse[]>();

const getVisitsForCurrentQuery = async () => {
  // Fetch visits in time-range, optionally filtered on one or more animal tags.
};

interface RecordingQueryCursor {
  fromDateTime: Date;
  untilDateTime: Date;
  loaded: number;
}

const currentQueryHash = ref<string>("");
const currentQueryCursor = ref<RecordingQueryCursor>({
  fromDateTime: new Date(),
  untilDateTime: new Date(),
  loaded: 0,
});
const currentQueryCount = ref<LoadedResource<number>>(null);
const currentQueryLoaded = ref<number>(0);
const completedCurrentQuery = ref<boolean>(false);

// NOTE: We try to load at most one month at a time.
const getRecordingsForCurrentQuery = async () => {
  if (currentProject.value) {
    const untilDateTime = combinedDateRange.value[1];
    // Keep track of the recordingState/cursor using a hash of the query,
    const locations =
      selectedLocations.value[0] === "any"
        ? locationsInSelectedTimespan.value.map((loc) => loc.id)
        : selectedLocations.value.map((loc) => (loc as ApiLocationResponse).id);
    // TODO: If locations are "any" we probably don't need to specify locations in the query.
    const query = {
      type:
        recordingMode.value === "cameras"
          ? RecordingType.ThermalRaw // TODO: Modify to include all camera types
          : RecordingType.Audio,
      locations,
    };
    const fromDateTime = combinedDateRange.value[0];
    const queryHash = JSON.stringify({
      ...query,
      fromDateTime,
      untilDateTime,
    });
    if (queryHash !== currentQueryHash.value) {
      currentQueryHash.value = queryHash;
      currentQueryLoaded.value = 0;
      completedCurrentQuery.value = false;
      // NOTE: If it's the first load for a given query, lazily get the count as a separate query.
      //  Also, make it abortable if we change queries.
      currentQueryCount.value = undefined;
      currentQueryCursor.value = {
        loaded: 0,
        fromDateTime,
        untilDateTime,
      };
      queryRecordingsInProject(currentProject.value.id, {
        ...query,
        limit: 1,
        countAll: true,
        fromDateTime,
        untilDateTime,
      }).then((response) => {
        if (response.success) {
          currentQueryCount.value = response.result.count;
        } else {
          currentQueryCount.value = null;
        }
      });
    }
    if (
      currentQueryCursor.value.fromDateTime <
      currentQueryCursor.value.untilDateTime
    ) {
      // console.log("current cursor", JSON.stringify(queryMap[key]));
      // console.log("Count all", queryMap[key].loaded === 0);
      // First time through, we want to count all for a given timespan query.
      const recordingsResponse = await queryRecordingsInProject(
        currentProject.value.id,
        {
          ...query,
          limit: 10,
          fromDateTime: currentQueryCursor.value.fromDateTime,
          untilDateTime: currentQueryCursor.value.untilDateTime,
        }
      );
      if (recordingsResponse.success) {
        const rows = recordingsResponse.result.rows;
        loadedRecordings.value.push(...rows);
        // Increment the cursor.
        currentQueryCursor.value.loaded += rows.length;
        currentQueryLoaded.value += rows.length;
        if (rows.length) {
          const gotUntilDate = new Date(
            rows[rows.length - 1].recordingDateTime
          );
          gotUntilDate.setMilliseconds(gotUntilDate.getMilliseconds() - 1);
          currentQueryCursor.value.untilDateTime = new Date(
            gotUntilDate.setMilliseconds(gotUntilDate.getMilliseconds() - 1)
          );
          if (
            recordingsResponse.result.count < recordingsResponse.result.limit
          ) {
            // We're at the end of the current time range
            currentQueryCursor.value.fromDateTime = new Date(
              currentQueryCursor.value.untilDateTime
            );
            completedCurrentQuery.value = true;
          }
        } else {
          currentQueryCursor.value.fromDateTime = new Date(
            currentQueryCursor.value.untilDateTime
          );
          completedCurrentQuery.value = true;
        }
      }
    }
  }
};

const searching = ref<boolean>(false);
const doSearch = async () => {
  searching.value = true;
  if (displayMode.value === "visits") {
    await getVisitsForCurrentQuery();
  } else if (displayMode.value === "recordings") {
    await getRecordingsForCurrentQuery();
  }
  searching.value = false;
};

const selectedCoolLabel = ref<boolean>(false);
const selectedFlaggedLabel = ref<boolean>(false);
const selectedOtherLabels = ref<boolean>(false);
const maybeUnselectedOtherLabels = (val: boolean) => {
  if (!val) {
    selectedLabels.value = [];
  }
};
</script>
<template>
  <section-header>Activity</section-header>
  <!--  <h6>Things that need to appear here:</h6>-->
  <!--  <ul>-->
  <!--    <li>Ability to do arbitrary queries over the group</li>-->
  <!--    <li>List recordings for the current group query</li>-->
  <!--    <li>List visits for the current group query</li>-->
  <!--    <li>A list of pre-populated/saved queries (cool, flagged for review)</li>-->
  <!--    <li>Tagging stats (tagged vs not-tagged etc)</li>-->
  <!--  </ul>-->
  <div
    class="d-flex flex-md-row flex-column-reverse flex-fill search-container"
    ref="searchContainer"
  >
    <div class="search-controls-outer">
      <div class="search-controls">
        <div>
          <div
            class="btn-group d-flex mb-2"
            role="group"
            aria-label="Toggle between camera and bird monitor results"
            v-if="projectHasAudioAndThermal"
          >
            <input
              type="radio"
              class="btn-check"
              name="recording-mode"
              id="recording-mode-cameras"
              autocomplete="off"
              v-model="recordingMode"
              value="cameras"
            />
            <label
              class="btn btn-outline-secondary w-50"
              for="recording-mode-cameras"
              >Cameras</label
            >
            <input
              type="radio"
              class="btn-check"
              name="recording-mode"
              id="recording-mode-audio"
              autocomplete="off"
              v-model="recordingMode"
              value="audio"
            />
            <label
              class="btn btn-outline-secondary w-50"
              for="recording-mode-audio"
              >Bird Monitors</label
            >
          </div>
          <div
            class="btn-group d-flex"
            role="group"
            aria-label="Toggle between results groups as visits or as recordings"
          >
            <input
              type="radio"
              class="btn-check"
              name="display-mode"
              id="display-mode-visits"
              autocomplete="off"
              v-model="displayMode"
              :value="'visits'"
            />
            <label
              class="btn btn-outline-secondary w-50"
              for="display-mode-visits"
              >Visits</label
            >
            <input
              type="radio"
              class="btn-check"
              name="display-mode"
              id="display-mode-recordings"
              autocomplete="off"
              v-model="displayMode"
              :value="'recordings'"
            />
            <label
              class="btn btn-outline-secondary w-50"
              for="display-mode-recordings"
              >Recordings</label
            >
          </div>
        </div>
        <div class="mt-2">
          <label class="fs-7">Date range</label>
          <multiselect
            v-model="selectedDateRange"
            :options="commonDateRanges"
            value-prop="value"
            label="label"
            :searchable="false"
            :can-clear="false"
            class="ms-bootstrap"
            @change="maybeSelectDatePicker"
          />
          <datepicker
            v-if="selectedDateRange === 'custom'"
            ref="dateRangePicker"
            class="mt-2"
            range
            :timezone="timezoneForProject"
            v-model="customDateRange"
            :min-date="minDateForGroup"
            :max-date="maxDateForGroup"
            :start-date="maxDateForGroupMinusTwoWeeks"
            :year-range="[
              minDateForGroup.getFullYear(),
              maxDateForGroup.getFullYear(),
            ]"
            :text-input-options="{ format }"
            :preview-format="format"
            :enable-time-picker="false"
            :format="format"
            prevent-min-max-navigation
            auto-apply
          />
        </div>
        <div class="mt-2">
          <label class="fs-7">Locations</label>
          <multiselect
            mode="tags"
            ref="selectedLocationsSelect"
            v-model="selectedLocations"
            :options="locationsInSelectedTimespanOptions"
            :can-clear="false"
            class="ms-bootstrap"
            @change="onChangeLocationsSelect"
            searchable
          />
        </div>

        <button
          type="button"
          class="btn mt-2 fs-7 px-0 advanced-filtering-btn d-flex align-items-center w-100"
          @click="showAdvanced = !showAdvanced"
        >
          Advanced filtering
          <font-awesome-icon
            icon="chevron-right"
            :rotation="!showAdvanced ? 90 : 270"
            size="sm"
            class="ms-2"
          />
        </button>
        <div class="advanced-search" v-if="showAdvanced">
          <div class="mt-2">
            <label class="fs-7">Labeled with</label>
            <b-form-checkbox-group>
              <b-form-checkbox v-model="selectedCoolLabel"
                >Cool</b-form-checkbox
              >
              <b-form-checkbox v-model="selectedFlaggedLabel"
                >Flagged</b-form-checkbox
              >
              <b-form-checkbox
                v-model="selectedOtherLabels"
                @change="maybeUnselectedOtherLabels"
                >Other</b-form-checkbox
              >
            </b-form-checkbox-group>
            <multiselect
              v-if="selectedOtherLabels"
              v-model="selectedLabels"
              :options="availableLabels"
              mode="tags"
              :can-clear="false"
              class="ms-bootstrap"
              searchable
            />
          </div>

          <div class="mt-2">
            <label class="fs-7">Tagged by</label>
            <div>
              <b-form-checkbox-group
                v-model="taggedBy"
                :options="taggedByOptions"
              />
            </div>
            <div v-if="taggedBy.length !== 0">
              <label class="fs-7">Tagged as</label>
              <hierarchical-tag-select
                class="flex-grow-1"
                ref="tagSelect"
                :open-on-mount="false"
                v-model="selectedTags"
                multiselect
              />
            </div>
            <div v-if="taggedBy.length !== 0" class="mt-2">
              <b-form-checkbox v-model="exclusiveTagSearch"
                >Exclusive tag search</b-form-checkbox
              >
            </div>
          </div>
        </div>
        <button
          type="button"
          class="btn btn-primary w-100 mt-2"
          :disabled="!searchIsValid"
          @click="doSearch"
        >
          Search
        </button>
      </div>
    </div>
    <div class="search-results flex-grow-1 d-flex justify-content-center">
      <div class="search-results-inner">
        <div v-if="currentQueryCount === undefined">
          Loading totals...
          <b-spinner />
        </div>
        <div v-else-if="currentQueryCount || currentQueryCount === 0">
          Loaded {{ currentQueryLoaded }} / Total {{ currentQueryCount }}
        </div>
        <div v-if="completedCurrentQuery">No more results</div>
        <div class="box mb-3" v-for="(index, recording) in loadedRecordings" :key="recording.recordingDateTime" />
      </div>
    </div>
    <div class="map-buffer" ref="mapBuffer"></div>
  </div>
  <map-with-points
    :points="locationsForMap"
    :active-points="locationsInSelectedTimespanForMap"
    :highlighted-point="highlightedPoint"
    @hover-point="highlightPoint"
    @leave-point="highlightPoint"
    :radius="30"
  />
</template>
<style lang="less" scoped>
.search-results-inner {
  max-width: 700px;
  min-width: 550px;
}
.search-controls {
  width: 250px;
  position: sticky;
  top: 15px;
}
.box {
  background: #ccc;
  min-height: 100px;
}
.map {
  //width: 100vh;
  height: 400px !important;
  position: unset;
  @media screen and (min-width: 768px) {
    position: absolute !important;
    right: 0;
    top: 0;
    height: 100vh !important;
    width: 500px !important;
  }
}

.advanced-filtering-btn,
.advanced-filtering-btn:hover {
  color: #007086;
}
.advanced-filtering-btn:focus {
  box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25);
  border-radius: 0.375rem;
}

.ms-bootstrap {
  // Match focus colours to bootstrap?
  --ms-ring-width: 0.25rem;
  --ms-ring-color: rgb(13 110 253 / 25%);
  --ms-border-color-active: #86b7fe;
}
.dp__theme_light {
  --dp-border-color-hover: #86b7fe;
  --dp-border-radius: 0.375rem;
  //&:focus {
  //  box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25);
  //}
  border-radius: 0.375rem;
}
//.dp__input {
//  border-radius: 0.375rem;
//}
.dp__input_focus {
  //border-radius: 0.375rem;
  box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25);
}
</style>
<style lang="less">
.multiselect-tag {
  white-space: unset !important;
}
</style>
<style src="@vueform/multiselect/themes/default.css"></style>
<style src="@vuepic/vue-datepicker/dist/main.css"></style>
