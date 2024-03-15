<script setup lang="ts">
import Datepicker from "@vuepic/vue-datepicker";
import HierarchicalTagSelect from "@/components/HierarchicalTagSelect.vue";
import Multiselect from "@vueform/multiselect";
import {
  computed,
  type ComputedRef,
  inject,
  nextTick,
  onBeforeMount,
  onBeforeUnmount,
  onMounted,
  ref,
  type Ref,
  watch,
  type WatchStopHandle,
} from "vue";
import {
  currentSelectedProject as currentActiveProject,
  userProjects,
} from "@models/provides.ts";
import type { SelectedProject } from "@models/LoggedInUser.ts";
import type { LoadedResource } from "@api/types.ts";
import type { ApiGroupResponse as ApiProjectResponse } from "@typedefs/api/group";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import { timezoneForLatLng } from "@models/visitsUtils.ts";
import { canonicalLatLngForLocations } from "@/helpers/Location.ts";
import { RecordingLabels } from "@/consts.ts";
import { TagMode } from "@typedefs/api/consts.ts";
import {
  ActivitySearchDisplayMode,
  ActivitySearchRecordingMode,
  getLatestDateForLocationInRecordingMode,
  queryValueIsDate,
} from "@/components/activitySearchUtils.ts";
import type { ActivitySearchParams } from "@views/ActivitySearchView.vue";
import { type LocationQuery, useRoute, useRouter } from "vue-router";

const props = defineProps<{
  locations: Ref<LoadedResource<ApiLocationResponse[]>>;
  params: ActivitySearchParams;
  searching: boolean;
  customSet: boolean;
}>();

const emit = defineEmits([
  "search-requested",
  "export-requested",
  "accepted-custom-set",
]);

const selectedLocations = ref<(ApiLocationResponse | "any")[]>(["any"]);

const currentProject = inject(currentActiveProject) as ComputedRef<
  SelectedProject | false
>;
const availableProjects = inject(userProjects) as Ref<
  LoadedResource<ApiProjectResponse[]>
>;
const availableLabels = computed(() => {
  const labels = RecordingLabels.slice(2).map(({ text, value }) => ({
    label: text,
    value: (value || text).toLowerCase(),
  }));
  if (selectedCoolLabel.value) {
    const label = RecordingLabels[0];
    labels.push({
      label: label.text,
      value: (label.value || label.text).toLowerCase(),
    });
  }
  if (selectedFlaggedLabel.value) {
    const label = RecordingLabels[1];
    labels.push({
      label: label.text,
      value: (label.value || label.text).toLowerCase(),
    });
  }
  return labels;
});
const currentSelectedProject = computed<ApiProjectResponse | null>(() => {
  if (currentProject.value && availableProjects.value) {
    const project = (availableProjects.value as ApiProjectResponse[]).find(
      ({ id }) => id === (currentProject.value as SelectedProject).id
    );
    return project || null;
  }
  return null;
});

const projectHasAudio = computed<boolean>(() => {
  return (
    !!currentSelectedProject.value &&
    "lastAudioRecordingTime" in currentSelectedProject.value
  );
});

const projectHasCameras = computed<boolean>(() => {
  return (
    !!currentSelectedProject.value &&
    "lastThermalRecordingTime" in currentSelectedProject.value
  );
});

const projectHasAudioAndThermal = computed<boolean>(() => {
  return projectHasAudio.value && projectHasCameras.value;
});
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
const dateRangePicker = ref<typeof Datepicker>();

// Initialise this to a zero range
const selectedDateRange = ref<[Date, Date] | "custom">([now, now]);
const customDateRange = ref<[Date, Date] | null>(null);
const combinedDateRange = computed<[Date, Date]>(() => {
  if (selectedDateRange.value === "custom") {
    if (customDateRange.value !== null) {
      // Make custom range be from beginning of start date til end of end date.
      // const start = DateTime.fromJSDate(new Date(customDateRange.value[0]), {
      //   zone: timezoneForProject.value,
      // })
      //   .set({
      //     hour: 0,
      //     minute: 0,
      //     second: 0,
      //     millisecond: 0,
      //   })
      //   .toJSDate();
      // const end = DateTime.fromJSDate(new Date(customDateRange.value[1]), {
      //   zone: timezoneForProject.value,
      // })
      //   .set({
      //     hour: 23,
      //     minute: 59,
      //     second: 59,
      //     millisecond: 999,
      //   })
      //   .toJSDate();
      const start = new Date(customDateRange.value[0]);
      const end = new Date(customDateRange.value[1]);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return [start, end];
    }
    return [new Date(), new Date()];
  } else {
    return selectedDateRange.value as [Date, Date];
  }
});

const minDateForProject = computed<Date>(() => {
  // Earliest active location
  let earliest = new Date();
  if (props.locations.value) {
    for (const location of props.locations.value) {
      const activeAt = new Date(location.activeAt);
      if (activeAt < earliest) {
        earliest = activeAt;
      }
    }
  }
  return earliest;
});

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

interface DatePickerMethods {
  openMenu: () => void;
}

const showAdvanced = ref<boolean>(false);

const maxDateForProject = computed<Date>(() => {
  // Latest active location
  let latest = new Date();
  latest.setFullYear(2010);
  if (props.locations.value) {
    for (const location of props.locations.value) {
      const latestDateForLocation = getLatestDateForLocationInRecordingMode(
        location,
        props.params.recordingMode
      );
      if (latestDateForLocation && latestDateForLocation > latest) {
        latest = latestDateForLocation;
      }
    }
  }
  return latest;
});
const maybeSelectDatePicker = (value: [Date, Date] | string) => {
  if (value === "custom" && !props.customSet) {
    nextTick(() => {
      if (dateRangePicker.value) {
        (dateRangePicker.value as DatePickerMethods).openMenu();
      }
    });
  } else if (props.customSet) {
    emit("accepted-custom-set");
  }
};
const onChangeLocationsSelect = (
  value: (ApiLocationResponse | "any")[],
  _select: MultiSelectEl
) => {
  if (!optionsRemapping.value) {
    if (value.length > 1) {
      nextTick(() => {
        const hasAny = selectedLocations.value.indexOf("any");
        if (hasAny >= 0) {
          selectedLocations.value.splice(hasAny, 1);
          remapLocationOptions(locationsInSelectedTimespanOptions.value);
        }
      });
    } else if (value.length === 0) {
      nextTick(() => {
        selectedLocations.value = ["any"];
      });
    }
  }
};

const timezoneForProject = computed<string>(() => {
  return timezoneForLatLng(canonicalLatLngForActiveLocations.value);
});

const maxDateForProjectMinusTwoWeeks = computed<Date>(() => {
  const max = new Date(maxDateForProject.value);
  max.setDate(max.getDate() - 14);
  return new Date(max);
});

watch(
  () => props.params.recordingMode,
  () => {
    // If the selected date range no longer applies to the current mode, reset it.
    if (
      combinedDateRange.value[0] < minDateForProject.value ||
      combinedDateRange.value[1] > maxDateForProject.value
    ) {
      console.warn("Should adjust range");
      selectedDateRange.value = commonDateRanges.value[0].value;
      customDateRange.value = null;
    }
  }
);

const commonDateRanges = computed<
  { value: [Date, Date] | "custom"; label: string; urlLabel: string }[]
>(() => {
  const earliest = minDateForProject.value;
  const latest = maxDateForProject.value;
  const ranges = [];
  if (earliest < oneDayAgo && latest > oneDayAgo) {
    ranges.push({
      label: "Last 24 hours",
      urlLabel: "24-hours-ago",
      value: lastTwentyFourHours,
    });
  }
  if (earliest < threeDaysAgo && latest > threeDaysAgo) {
    ranges.push({
      label: "Last 3 days",
      urlLabel: "3-days-ago",
      value: [threeDaysAgo, now],
    });
  }
  if (earliest < oneWeekAgo && latest > oneWeekAgo) {
    ranges.push({
      label: "Last week",
      urlLabel: "1-week-ago",
      value: [oneWeekAgo, now],
    });
  }
  if (earliest < oneMonthAgo && latest > oneMonthAgo) {
    ranges.push({
      label: "Last month",
      urlLabel: "1-month-ago",
      value: [oneMonthAgo, now],
    });
  }
  if (earliest < threeMonthsAgo && latest > threeMonthsAgo) {
    ranges.push({
      label: "Last 3 months",
      urlLabel: "3-months-ago",
      value: [threeMonthsAgo, now],
    });
  }
  if (earliest < oneYearAgo && latest > oneYearAgo) {
    ranges.push({
      label: "Last year",
      urlLabel: "1-year-ago",
      value: [oneYearAgo, now],
    });
  }
  ranges.push(
    {
      label: "Any time",
      urlLabel: "any",
      value: [earliest, now],
    },
    {
      label: "Custom date range",
      value: "custom",
      urlLabel: "",
    }
  );
  return ranges as {
    value: [Date, Date] | "custom";
    label: string;
    urlLabel: string;
  }[];
});

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

const includeSubSpeciesTags = ref<boolean>(true);
const selectedTags = ref<string[]>([]);
const selectedLabels = ref<string[]>([]);
watch(
  () => props.params.displayMode,
  () => {
    // Redo search when display mode changes
    //doSearch();
  }
);
const allPredatorLabels = ["mustelid", "possum", "cat", "rodent", "hedgehog"];
const allPredators = computed<boolean>({
  get: () => {
    for (const label of allPredatorLabels) {
      if (!selectedTags.value.includes(label)) {
        return false;
      }
    }
    return true;
  },
  set: (val: boolean) => {
    if (val) {
      const newTags = [];
      for (const label of allPredatorLabels) {
        if (!selectedTags.value.includes(label)) {
          newTags.push(label);
        }
      }
      if (newTags.length) {
        selectedTags.value = [...selectedTags.value, ...newTags];
      }
    } else {
      selectedTags.value = selectedTags.value.filter(
        (label) => !allPredatorLabels.includes(label)
      );
    }
  },
});

const showFilteredRecordings = ref<boolean>(false);
const FLAG = "requires review";
const COOL = "cool";

const somePredatorsSelected = computed<boolean>(() => {
  const onlyPredators = selectedTags.value.filter((label) =>
    allPredatorLabels.includes(label)
  );
  return (
    onlyPredators.length !== 0 &&
    onlyPredators.length !== allPredatorLabels.length
  );
});
const maybeUnselectedOtherLabels = (val: boolean) => {
  if (!val) {
    selectedLabels.value = selectedLabels.value.filter(
      (item) => item === COOL || item === FLAG
    );
  }
};
const selectedLabelGetterSetter = (label: string) => ({
  get: () => {
    return selectedLabels.value.includes(label);
  },
  set: (val: boolean) => {
    if (val && !selectedLabels.value.includes(label)) {
      selectedLabels.value.push(label);
    } else {
      selectedLabels.value.splice(selectedLabels.value.indexOf(label), 1);
    }
  },
});
const selectedFlaggedLabel = computed<boolean>(selectedLabelGetterSetter(FLAG));
const selectedCoolLabel = computed<boolean>(selectedLabelGetterSetter(COOL));

const selectedOtherLabels = ref<boolean>(false);
const locationsInSelectedTimespan = computed<ApiLocationResponse[]>(() => {
  if (props.locations.value) {
    return (props.locations.value as ApiLocationResponse[]).filter(
      (location) => {
        if (location.location.lat === 0 && location.location.lng === 0) {
          return false;
        }
        const latestDateForLocation = getLatestDateForLocationInRecordingMode(
          location,
          props.params.recordingMode
        );
        return (
          latestDateForLocation &&
          latestDateForLocation >= combinedDateRange.value[0] &&
          new Date(location.activeAt) <= combinedDateRange.value[1]
        );
      }
    );
  }
  return [];
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
interface LocationOption {
  value: "any" | ApiLocationResponse;
  label: string;
  disabled?: boolean;
}

interface MultiSelectEl extends Multiselect {
  clear: () => void;
  select: (option: LocationOption) => void;
}

const selectedLocationsSelect = ref<MultiSelectEl>();
const optionsInited = ref<boolean>(false);
const optionsRemapping = ref<boolean>(false);
const canonicalLatLngForActiveLocations = canonicalLatLngForLocations(
  locationsInSelectedTimespan
);
const remapLocationOptions = (nextOptions: LocationOption[]) => {
  // If this changed, we need to remap the selected locations to the existing
  // locations.
  const selected = [...selectedLocations.value];
  nextTick(() => {
    if (optionsInited.value) {
      optionsRemapping.value = true;
      if (selectedLocationsSelect.value) {
        const multiselectEl = selectedLocationsSelect.value as MultiSelectEl;
        multiselectEl.clear();
        for (const item of selected) {
          if (item === "any") {
            multiselectEl.select(nextOptions[0]);
          } else {
            const match = nextOptions.find(
              (option) =>
                (option.value as ApiLocationResponse).id &&
                (option.value as ApiLocationResponse).id === item.id
            );
            if (match) {
              multiselectEl.select(match);
            }
          }
        }
        if (selectedLocations.value.length === 0) {
          multiselectEl.select(nextOptions[0]);
        }
      }
      optionsRemapping.value = false;
    } else {
      optionsInited.value = true;
    }
  });
};
watch(locationsInSelectedTimespanOptions, remapLocationOptions);

const recordingMode = ref<ActivitySearchRecordingMode>(
  ActivitySearchRecordingMode.Cameras
);
const displayMode = ref<ActivitySearchDisplayMode>(
  ActivitySearchDisplayMode.Visits
);
const router = useRouter();
const route = useRoute();
const updateRoute = async (
  next: string | [Date, Date] | ApiLocationResponse[],
  prev: string | [Date, Date] | ApiLocationResponse[] | undefined
) => {
  const isDates =
    Array.isArray(next) &&
    Array.isArray(prev) &&
    next.length !== 0 &&
    next.every((item) => item instanceof Date);
  const fromChanged =
    isDates && next[0].toISOString() !== prev[0].toISOString();
  const untilChanged =
    isDates && next[1].toISOString() !== prev[1].toISOString();
  const datesChanged = isDates && (fromChanged || untilChanged);
  if ((!isDates && prev !== next) || datesChanged) {
    const hasAny = selectedLocations.value.indexOf("any") !== -1;
    const selectedLocationsValue = hasAny
      ? "any"
      : (selectedLocations.value as ApiLocationResponse[])
          .map(({ id }) => id)
          .join(",");
    const query: LocationQuery = {
      ...route.query,
      "display-mode": displayMode.value,
      "recording-mode": recordingMode.value,
      locations: selectedLocationsValue,
    };
    const commonDateRange = commonDateRanges.value.find(
      ({ value }) =>
        value[0] === combinedDateRange.value[0] &&
        value[1] === combinedDateRange.value[1]
    );
    if (commonDateRange) {
      query.from = commonDateRange.urlLabel;
      if ("until" in query) {
        delete query.until;
      }
    } else {
      query.from = combinedDateRange.value[0].toISOString();
      query.until = combinedDateRange.value[1].toISOString();
    }
    await router.replace({
      query,
    });
  }
};
const syncParams = (
  next: ActivitySearchParams,
  prev: ActivitySearchParams | undefined
) => {
  displayMode.value = next.displayMode;
  recordingMode.value = next.recordingMode;
  if (Array.isArray(next.locations) && next.locations.length) {
    if (next.locations[0] === "any") {
      selectedLocations.value = ["any"];
    } else {
      selectedLocations.value = next.locations
        .map((id) => props.locations.value.find((item) => item.id === id))
        .filter((x) => x !== undefined);
    }
  }
  let foundRange;
  if (next.from) {
    foundRange = commonDateRanges.value.find(
      ({ urlLabel }) => next.from === urlLabel
    );
  }
  if (foundRange) {
    selectedDateRange.value = foundRange.value;
  } else if (next.from && !next.until) {
    // Try to match to the common date ranges and pick an option.
    selectedDateRange.value = commonDateRanges.value[0].value;
    updateRoute(combinedDateRange.value, [now, now]);
  } else if (next.from && next.until) {
    selectedDateRange.value = "custom";
    // Validate the custom range being passed, constrain it to the min/max
    const areValidDates =
      queryValueIsDate(next.from) && queryValueIsDate(next.until);
    if (areValidDates) {
      const from = new Date(next.from).getTime();
      const until = new Date(next.until).getTime();
      const min = minDateForProject.value.getTime();
      const max = maxDateForProject.value.getTime();
      const constrainedFrom = Math.min(Math.max(from, min), max);
      const constrainedUntil = Math.min(Math.max(until, min), max);
      const constrainedRange =
        from !== constrainedFrom || until !== constrainedUntil;
      const fromDate = new Date(constrainedFrom);
      const untilDate = new Date(constrainedUntil);
      if (!customDateRange.value) {
        customDateRange.value = [fromDate, untilDate];
      } else {
        customDateRange.value[0] = fromDate;
        customDateRange.value[1] = untilDate;
      }
      if (constrainedRange) {
        updateRoute(combinedDateRange.value, [now, now]);
      }
    } else {
      selectedDateRange.value = commonDateRanges.value[0].value;
    }
  }
};

const watchRecordingMode = ref<WatchStopHandle | null>(null);
const watchDisplayMode = ref<WatchStopHandle | null>(null);
const watchCombinedDateRange = ref<WatchStopHandle | null>(null);
const watchSelectedLocations = ref<WatchStopHandle | null>(null);
const watchProps = ref<WatchStopHandle | null>(null);
onBeforeMount(() => {
  watchProps.value = watch(props.params, syncParams, {
    deep: true,
    immediate: true,
  });
  watchRecordingMode.value = watch(recordingMode, updateRoute);
  watchDisplayMode.value = watch(displayMode, updateRoute);
  watchCombinedDateRange.value = watch(combinedDateRange, updateRoute);
  watchSelectedLocations.value = watch(selectedLocations, updateRoute);
  emit("search-requested");
});
onBeforeUnmount(() => {
  watchProps.value && watchProps.value();
  watchDisplayMode.value && watchDisplayMode.value();
  watchRecordingMode.value && watchRecordingMode.value();
  watchCombinedDateRange.value && watchCombinedDateRange.value();
  watchSelectedLocations.value && watchSelectedLocations.value();
});
</script>

<template>
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
      <label class="btn btn-outline-secondary w-50" for="recording-mode-cameras"
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
      <label class="btn btn-outline-secondary w-50" for="recording-mode-audio"
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
      <label class="btn btn-outline-secondary w-50" for="display-mode-visits"
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
      :can-deselect="false"
      class="ms-bootstrap"
      @change="maybeSelectDatePicker"
    />
    <!--  TODO: Should this be using min/maxDateForSelectedLocations?    -->
    <datepicker
      v-if="selectedDateRange === 'custom'"
      ref="dateRangePicker"
      class="mt-2"
      range
      :timezone="timezoneForProject"
      v-model="customDateRange"
      :min-date="minDateForProject"
      :max-date="maxDateForProject"
      :start-date="maxDateForProjectMinusTwoWeeks"
      :year-range="[
        minDateForProject.getFullYear(),
        maxDateForProject.getFullYear(),
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
      <label class="fs-7">Tagged by</label>
      <div>
        <b-form-checkbox-group v-model="taggedBy" :options="taggedByOptions" />
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
        <b-form-checkbox
          v-model="allPredators"
          :indeterminate="somePredatorsSelected"
          >All predators</b-form-checkbox
        >
        <b-form-checkbox v-model="includeSubSpeciesTags"
          >Include sub-species tags</b-form-checkbox
        >
      </div>
    </div>

    <div class="mt-2">
      <label class="fs-7">Filtering</label>
      <b-form-checkbox v-model="showFilteredRecordings"
        >Include recordings that have no tracks or only false
        positives.</b-form-checkbox
      >
    </div>

    <div class="mt-2">
      <label class="fs-7">Labeled with</label>
      <b-form-checkbox-group>
        <b-form-checkbox v-model="selectedCoolLabel">Cool</b-form-checkbox>
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
  </div>
  <button
    type="button"
    class="btn btn-primary w-100 mt-2"
    :disabled="!searchIsValid || searching"
    @click="emit('search-requested')"
  >
    <b-spinner v-if="searching" small />
    Search
  </button>
  <button
    type="button"
    class="btn btn-outline-secondary w-100 mt-2"
    :disabled="!searchIsValid"
    @click="emit('export-requested')"
  >
    Export search results
  </button>
</template>

<style lang="less" scoped>
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
