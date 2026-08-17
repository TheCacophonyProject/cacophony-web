<script setup lang="ts">
import type { ActivitySearchParams } from "@views/ActivitySearchView.vue";
import { computed } from "vue";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import {
  ActivitySearchDisplayMode,
  ActivitySearchRecordingMode,
  dateSuffix,
  fullMonthName,
  isSameDay,
  queryValueIsDate,
} from "@/components/activitySearchUtils.ts";
import { TagMode } from "@typedefs/api/consts.ts";
import {
  displayLabelForClassificationLabel,
  flatClassifications,
} from "@api/classificationsUtils.ts";
import type { ApiDeviceResponse } from "@typedefs/api/device";
import DeviceName from "@/components/DeviceName.vue";
import { BAlert } from "bootstrap-vue-next";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";

const COOL = "cool";
const FLAG = "requires review";
const props = defineProps<{
  searchParams: ActivitySearchParams;
  selectedLocations: ("any" | ApiLocationResponse)[];
  selectedDevices: "all" | ApiDeviceResponse[];
  locationsInSelectedTimespan: ApiLocationResponse[];
  availableDateRanges: { range: [Date, Date]; from: string; label: string }[];
  inline?: boolean;
  recordingCount?: number;
  estimatingCount?: boolean;
}>();

const upperFirst = (str: string): string => {
  const trim = str.trim();
  return trim.charAt(0).toUpperCase() + trim.slice(1);
};

const allTagsAreLeafNodes = (tags: string[]): boolean => {
  return !tags.some(
    (tag) => !!flatClassifications.value[tag]?.node.children?.length,
  );
};

const hasStarred = computed<boolean>(
  () => props.searchParams.labelledWith?.includes(COOL) || false,
);
const hasFlagged = computed<boolean>(
  () => props.searchParams.labelledWith?.includes(FLAG) || false,
);

const timespan = computed<string>(() => {
  const { searchParams, availableDateRanges } = props;
  let timespan: string;
  if (
    queryValueIsDate(searchParams.from) &&
    queryValueIsDate(searchParams.until)
  ) {
    const from = new Date(searchParams.from as string | Date);
    const until = new Date(searchParams.until as string | Date);
    let fromString: string;
    let untilString: string;
    if (
      from.getFullYear() === until.getFullYear() &&
      from.getFullYear() === new Date().getFullYear()
    ) {
      // If both dates are this year, omit the year.
      if (from.getMonth() === until.getMonth()) {
        fromString = `the ${dateSuffix(from.getDate())}`;
        untilString = `${dateSuffix(until.getDate())} of ${fullMonthName(
          until.getMonth(),
        )}`;
      } else {
        fromString = `${fullMonthName(from.getMonth())} ${dateSuffix(
          from.getDate(),
        )}`;
        untilString = `${fullMonthName(until.getMonth())} ${dateSuffix(
          until.getDate(),
        )}`;
      }
    } else {
      if (
        from.getMonth() === until.getMonth() &&
        from.getFullYear() === until.getFullYear()
      ) {
        fromString = `the ${dateSuffix(from.getDate())}`;
        untilString = `${dateSuffix(until.getDate())} of ${fullMonthName(
          until.getMonth(),
        )} ${until.getFullYear()}`;
      } else {
        fromString = `${fullMonthName(from.getMonth())} ${dateSuffix(
          from.getDate(),
        )} ${from.getFullYear()}`;
        untilString = `${fullMonthName(until.getMonth())} ${dateSuffix(
          until.getDate(),
        )} ${until.getFullYear()}`;
      }
    }
    if (isSameDay(from, until)) {
      timespan = `on the ${dateSuffix(from.getDate())} of ${fullMonthName(
        from.getMonth(),
      )}`;
      if (from.getFullYear() !== new Date().getFullYear()) {
        timespan += ` ${from.getFullYear()}`;
      }
    } else {
      timespan = `between ${fromString} and ${untilString}`;
    }
  } else {
    timespan = `${
      availableDateRanges.find(({ from }) => from === searchParams.from)?.label
    }`;
  }
  return timespan;
});
const otherLabels = computed<string[]>(
  () =>
    props.searchParams.labelledWith?.filter(
      (label) => label !== COOL && label !== FLAG,
    ) || [],
);
</script>

<template>
  <b-alert
    :model-value="true"
    variant="light"
    :class="{
      'border-0': inline,
      'mb-2': !inline,
      'mb-sm-3': !inline,
      'mb-0': inline,
      'p-0': inline,
    }"
  >
    <div class="description d-flex">
      <material-symbol name="info" class="me-2" size="1.25rem" v-if="!inline" />
      <div>
        <slot name="pretext"></slot>
        <strong v-if="hasStarred"> Starred</strong
        ><span v-if="hasStarred && hasFlagged"> or </span
        ><strong v-if="hasFlagged">{{
          hasStarred ? "flagged" : "Flagged"
        }}</strong>
        <strong>{{
          !hasFlagged && !hasStarred && !inline
            ? upperFirst(searchParams.displayMode)
            : ` ${searchParams.displayMode}`
        }}</strong>
        <span
          v-if="
            selectedLocations.length === 0 || selectedLocations.includes('any')
          "
        >
          <span v-if="locationsInSelectedTimespan.length === 1">
            at
            <strong>{{ locationsInSelectedTimespan[0].name }}</strong>
          </span>
          <span v-else> across all locations</span>
        </span>
        <span v-else>
          <span v-if="selectedLocations.length === 1">
            at
            <strong>{{
              (selectedLocations as ApiLocationResponse[])[0].name
            }}</strong>
          </span>
          <span v-else>
            across
            <span
              :key="index"
              v-for="(loc, index) in selectedLocations as ApiLocationResponse[]"
            >
              <strong>{{ loc.name }}</strong
              ><span v-if="index === selectedLocations.length - 2"> and </span
              ><span v-else-if="index < selectedLocations.length - 1"
                >,
              </span></span
            >
          </span>
        </span>
        <span
          v-if="
            selectedDevices &&
            selectedDevices !== 'all' &&
            searchParams.displayMode === ActivitySearchDisplayMode.Recordings
          "
        >
          for
          <strong v-for="(device, index) in selectedDevices" :key="index">
            <device-name
              :name="device.deviceName"
              :type="device.type"
              hide-icon
              no-margin
            />
            <span
              v-if="
                selectedDevices.length > 1 && index < selectedDevices.length - 1
              "
              >,
            </span>
          </strong>
        </span>
        <span>&nbsp;</span>
        <span>{{ timespan }}</span>
        <span
          v-if="
            searchParams.displayMode === ActivitySearchDisplayMode.Recordings
          "
        >
          <span v-if="searchParams.tagMode === TagMode.UnTagged">
            that don't have any tag</span
          >
          <span
            v-else-if="
              [TagMode.NoHuman, TagMode.Tagged].includes(searchParams.tagMode)
            "
          >
            <span v-if="searchParams.tagMode === TagMode.NoHuman">
              that are untagged by humans<span
                v-if="
                  searchParams.taggedWith.length !== 0 &&
                  searchParams.taggedWith[0] !== 'any'
                "
              >
                and tagged by AI with
              </span>
            </span>
            <span v-else> tagged with </span>
            <span
              v-if="
                searchParams.subClassTags &&
                !allTagsAreLeafNodes(searchParams.taggedWith)
              "
            >
              or inheriting from
            </span>
            <span
              :key="index"
              v-for="(tag, index) in searchParams.taggedWith.filter(
                (t) => t !== 'any',
              )"
            >
              <strong
                ><span class="text-capitalize">{{
                  displayLabelForClassificationLabel(
                    tag,
                    searchParams.tagMode === TagMode.NoHuman,
                    searchParams.recordingMode ===
                      ActivitySearchRecordingMode.Audio,
                  )
                }}</span></strong
              ><span v-if="index === searchParams.taggedWith.length - 2">
                or </span
              ><span
                v-else-if="
                  index < searchParams.taggedWith.length - 1 &&
                  searchParams.taggedWith.length > 1
                "
                >,
              </span></span
            >
          </span>
          <span
            v-if="
              !searchParams.includeFalsePositives &&
              (searchParams.tagMode == TagMode.Any ||
                searchParams.tagMode == TagMode.NoHuman)
            "
            >, excluding those with no tracks, or that are only tagged as
            <strong class="text-capitalize">false trigger</strong>
          </span>
          <span v-if="otherLabels.length"
            >, labelled with
            <span :key="index" v-for="(label, index) in otherLabels">
              <strong
                ><span class="text-capitalize">{{ label }}</span></strong
              ><span v-if="index === otherLabels.length - 2"> or </span
              ><span
                v-else-if="
                  index < otherLabels.length - 1 && otherLabels.length > 1
                "
                >,
              </span></span
            >
          </span>
        </span>
        <span>.</span>
        <slot name="posttext"></slot>
      </div>
    </div>
  </b-alert>
</template>

<style scoped lang="less">
@import "../assets/less/breakpoints";
.description {
  @media (max-width: @breakpoint-xs-max) {
    font-size: var(--cp-font-size-sm);
  }
}
</style>
