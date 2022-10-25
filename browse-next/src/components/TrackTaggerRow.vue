<script setup lang="ts">
import type { ApiTrackResponse } from "@typedefs/api/track";
import type {
  ApiAutomaticTrackTagResponse,
  ApiHumanTrackTagResponse,
  ApiTrackTagResponse,
  Classification,
  TrackTagData,
} from "@typedefs/api/trackTag";
import { computed, onMounted, ref, watch } from "vue";
import { CurrentUser } from "@models/LoggedInUser";
import HierarchicalTagSelect from "@/components/HierarchicalTagSelect.vue";
import type { TrackId } from "@typedefs/api/common";
import {
  classifications,
  flatClassifications,
  getClassifications,
} from "@api/Classifications";
import CardTable from "@/components/CardTable.vue";
import type { CardTableItems } from "@/components/CardTableTypes";
// eslint-disable-next-line @typescript-eslint/no-unused-vars,vue/no-setup-props-destructure
const { track, index, color, selected, expandedId } = defineProps<{
  track: ApiTrackResponse;
  index: number;
  color: { foreground: string; background: string };
  selected: boolean;
  expandedId: TrackId;
}>();

const emit = defineEmits<{
  (e: "expanded-changed", trackId: TrackId): void;
  (e: "selected-track-at-index", trackId: TrackId): void;
  (
    e: "add-or-remove-user-tag",
    payload: { trackId: TrackId; tag: string }
  ): void;
}>();

const expandedInternal = ref<boolean>(false);
const collapsing = ref<boolean>(false);
const showClassificationSearch = ref<boolean>(false);
const showTaggerDetails = ref<boolean>(false);
const tagSelect = ref<typeof HierarchicalTagSelect>();

const taggerDetails = computed<CardTableItems>(() => {
  const tags: ApiTrackTagResponse[] = [...humanTags.value];
  if (masterTag.value) {
    tags.unshift(masterTag.value);
  }
  return {
    headings: ["tag", "tagger", "created"],
    values: tags.map(({ what, userName, automatic }) => [
      what,
      automatic ? "Cacophony AI" : userName || "",
      "",
    ]),
  };
});

const expanded = computed<boolean>(() => expandedId === track.id);
watch(expanded, (nextExpanded) => {
  if (!nextExpanded) {
    collapsing.value = true;
    setTimeout(() => {
      expandedInternal.value = false;
      collapsing.value = false;
    }, 200);
  }
});

const selectAndMaybeToggleExpanded = () => {
  if (hasUserTag.value || expandedInternal.value) {
    expandedInternal.value = !expandedInternal.value;
    emit("expanded-changed", expandedInternal.value ? track.id : -1);
  }
  emit("selected-track-at-index", track.id);
};

const hasUserTag = computed<boolean>(() => {
  return track.tags.some((tag) => !tag.automatic);
});

const uniqueUserTags = computed<string[]>(() => {
  return Object.keys(
    track.tags
      .filter((tag) => !tag.automatic)
      .reduce((acc: Record<string, boolean>, item: ApiTrackTagResponse) => {
        acc[item.what] = true;
        return acc;
      }, {})
  );
});

const consensusUserTag = computed<string | null>(() => {
  if (uniqueUserTags.value.length === 1) {
    return uniqueUserTags.value[0];
  }
  return null;
});

const masterTag = computed<ApiAutomaticTrackTagResponse | null>(() => {
  const tag = track.tags.find(
    (tag) =>
      tag.automatic && tag.data && (tag.data as TrackTagData).name === "Master"
  );
  if (tag) {
    return tag as ApiAutomaticTrackTagResponse;
  }
  return null;
});

const humanTags = computed<ApiHumanTrackTagResponse[]>(() => {
  return track.tags.filter(
    (tag) => !tag.automatic
  ) as ApiHumanTrackTagResponse[];
});

const thisUserTag = computed<ApiHumanTrackTagResponse | undefined>(() =>
  humanTags.value.find((tag) => tag.userId === CurrentUser.value?.id)
);

const thisUsersTagAgreesWithAiClassification = computed<boolean>(
  () => thisUserTag.value?.what === masterTag.value?.what
);

const defaultTags = [
  "possum",
  "rodent",
  "hedgehog",
  "cat",
  "bird",
  "mustelid",
  "false-positive",
  "unknown",
];

// These are "pinned" tags.
const userDefinedTags = ref<Record<string, boolean>>({});
const userDefinedTagLabels = computed<string[]>(() =>
  Object.keys(userDefinedTags.value)
);

const uniqueUserTagsAndUserDefinedTags = computed<string[]>(() => {
  const tags: Record<string, boolean> = {};
  for (const tag of uniqueUserTags.value) {
    tags[tag] = true;
  }
  return Object.keys({ ...userDefinedTags.value, ...tags });
});

const availableTags = computed<{ label: string; display: string }[]>(() => {
  // TODO: These can be changed at a group preferences level my group admins,
  //  or at a user-group preferences level by users.
  // Map these tags to the display names in classifications json.
  const tags: Record<string, { label: string; display: string }> = {};
  for (const tag of [
    ...defaultTags,
    ...uniqueUserTagsAndUserDefinedTags.value,
  ].map(
    (tag) =>
      flatClassifications.value[tag] || {
        label: tag,
        display: `${tag}_not_found`,
      }
  )) {
    tags[tag.label] = tag;
  }
  return Object.values(tags);
});

// const specialCaseTags = computed<{ label: string; display: string }[]>(() => {
//   return ["false-positive", "unknown"]
//     .map(
//       (tag) =>
//         flatClassifications.value[tag] || {
//           label: tag,
//           display: `${tag}_not_found`,
//         }
//     )
//     .concat([{ label: "more-classifications", display: "..." }]);
// });

const toggleTag = (tag: string) => {
  if (tag === "more-classifications") {
    showClassificationSearch.value = !showClassificationSearch.value;
  } else {
    if (thisUserTag.value && tag === thisUserTag.value.what) {
      showClassificationSearch.value = false;
    } else if (
      !thisUserTag.value ||
      (thisUserTag.value && thisUserTag.value.what !== tag)
    ) {
      showClassificationSearch.value = !defaultTags.includes(tag);
    }
    emit("add-or-remove-user-tag", { trackId: track.id, tag });
  }
};

const confirmAiSuggestedTag = () => {
  if (masterTag.value) {
    emit("add-or-remove-user-tag", {
      trackId: track.id,
      tag: masterTag.value.what,
    });
  }
};

const rejectAiSuggestedTag = () => {
  expandedInternal.value = true;
  emit("expanded-changed", expandedInternal.value ? track.id : -1);
};

const pinCustomTag = (classification: Classification) => {
  if (thisUserTag.value && !defaultTags.includes(thisUserTag.value.what)) {
    if (userDefinedTags.value[classification.label]) {
      delete userDefinedTags.value[classification.label];
    } else {
      userDefinedTags.value[thisUserTag.value.what] = true;
    }
  }
};

const currentlySelectedTagIsPinnable = computed<boolean>(() => {
  if (!thisUserTag.value) {
    return false;
  }
  return !defaultTags.includes(thisUserTag.value.what);
});

const setCustomTag = async (classification: Classification | null) => {
  if (classification) {
    // Add the tag, remove the current one.
    emit("add-or-remove-user-tag", {
      trackId: track.id,
      tag: classification.label,
    });
  }
};

const addCustomTag = () => {
  showClassificationSearch.value = true;
  tagSelect.value && tagSelect.value.open();
};

onMounted(async () => {
  if (!classifications.value) {
    await getClassifications();
  }
});
</script>
<template>
  <div
    class="track p-2 fs-8 d-flex align-items-center justify-content-between"
    :class="{ selected }"
    @click="selectAndMaybeToggleExpanded"
  >
    <div class="d-flex align-items-center">
      <span
        class="track-number me-3 fw-bold text-center d-inline-block"
        :style="{
          background: color.background,
          color: color.foreground === 'dark' ? '#333' : '#fff',
        }"
        >{{ index + 1 }}</span
      >
      <div v-if="!hasUserTag && masterTag" class="d-flex flex-column">
        <span class="text-uppercase fs-9 fw-bold">AI Classification</span>
        <span
          class="classification text-capitalize d-inline-block fw-bold"
          v-if="masterTag"
          >{{ masterTag.what }}</span
        >
      </div>
      <span v-else-if="hasUserTag" class="d-flex flex-column">
        <span class="text-uppercase fs-9 fw-bold">Manual ID</span>
        <span
          class="classification text-capitalize d-inline-block fw-bold"
          v-if="
            consensusUserTag && masterTag && masterTag.what === consensusUserTag
          "
          >{{ consensusUserTag }}
          <font-awesome-icon icon="check-circle" class="icon"
        /></span>
        <span
          class="classification text-capitalize d-inline-block fw-bold"
          v-else-if="
            consensusUserTag && masterTag && masterTag.what !== consensusUserTag
          "
          >{{ consensusUserTag }}
          <span class="strikethrough">{{ masterTag?.what }}</span></span
        >
        <!-- Controversial tag, should be automatically flagged for review. -->
        <span
          class="classification text-capitalize d-inline-block fw-bold"
          v-else-if="
            !consensusUserTag &&
            masterTag &&
            !uniqueUserTags.includes(masterTag.what)
          "
          >{{ uniqueUserTags.join(", ") }}
          <span class="strikethrough">{{ masterTag?.what }}</span></span
        >
        <span
          class="classification text-capitalize d-inline-block fw-bold conflicting-tags"
          v-else-if="!consensusUserTag && masterTag"
          >{{ uniqueUserTags.join(", ") }}</span
        >
      </span>
    </div>
    <div v-if="!thisUserTag && !expanded">
      <button
        type="button"
        class="btn fs-7 confirm-button"
        @click.stop.prevent="confirmAiSuggestedTag"
      >
        <span class="label">Confirm</span>
        <span class="fs-6 icon">
          <font-awesome-icon
            :icon="
              thisUsersTagAgreesWithAiClassification
                ? ['fas', 'thumbs-up']
                : ['far', 'thumbs-up']
            "
          />
        </span>
      </button>
      <button
        type="button"
        class="btn fs-7 reject-button"
        aria-label="Reject AI classification"
        @click.stop.prevent="rejectAiSuggestedTag"
      >
        <span class="visually-hidden">Reject</span>
        <span class="fs-6 icon">
          <font-awesome-icon :icon="['far', 'thumbs-down']" />
        </span>
      </button>
    </div>
    <div v-else>
      <button type="button" aria-label="Expand track" class="btn">
        <span class="visually-hidden">Expand track</span>
        <font-awesome-icon
          icon="chevron-right"
          :rotation="expanded ? 270 : 90"
        />
      </button>
    </div>
  </div>
  <div
    :class="['collapse', { show: expanded }, { collapsing }]"
    class="track-details px-2 pe-2"
  >
    <div class="classification-btns">
      <button
        type="button"
        class="btn classification-btn fs-8 text-capitalize d-flex flex-column align-items-center justify-content-evenly"
        :class="[
          tag.label,
          { selected: thisUserTag && tag.label === thisUserTag.what },
          { pinned: !!userDefinedTags[tag.label] },
        ]"
        :key="index"
        v-for="(tag, index) in availableTags"
        @click="(e) => toggleTag(tag.label)"
      >
        <span v-if="!!userDefinedTags[tag.label]" class="pinned-tag"
          ><font-awesome-icon icon="thumbtack" />
        </span>
        <img src="" width="24" height="24" />
        <span>{{ tag.display }}</span>
      </button>
      <button
        type="button"
        class="add-classification-btn btn fs-2"
        @click="addCustomTag"
      >
        <font-awesome-icon icon="plus" />
      </button>
    </div>
    <div v-if="showClassificationSearch" class="mt-2 d-flex">
      <hierarchical-tag-select
        v-if="currentlySelectedTagIsPinnable || showClassificationSearch"
        class="flex-grow-1"
        @change="setCustomTag"
        @pin="pinCustomTag"
        ref="tagSelect"
        :selected-item="thisUserTag && thisUserTag.what"
        :pinnable="currentlySelectedTagIsPinnable"
        :pinned-items="userDefinedTagLabels"
      />
    </div>
    <div class="tagger-details mt-2 d-flex justify-content-center flex-column">
      <button
        class="fs-8 btn details-toggle-btn"
        @click="showTaggerDetails = !showTaggerDetails"
      >
        <span v-if="!showTaggerDetails">View details</span>
        <span v-else>Hide details</span>
        <font-awesome-icon
          icon="chevron-right"
          :rotation="showTaggerDetails ? 270 : 90"
          class="ms-2"
        />
      </button>
      <card-table v-if="showTaggerDetails" :items="taggerDetails"></card-table>
    </div>
  </div>
</template>
<style scoped lang="less">
@import "../assets/font-sizes.less";

.details-toggle-btn,
.details-toggle-btn:active,
.details-toggle-btn:focus {
  color: #007086;
  font-weight: 500;
}

.track-details {
  background: white;
  transition: height 0.2s ease-in-out;
  &.collapsing {
    height: 0;
    overflow: hidden;
  }
  &.collapse {
    &:not(.show) {
      display: none;
    }
  }
}
.classification-btns {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr 1fr;
  //justify-items: center;
  column-gap: 7px;
  row-gap: 5px;
}
.add-classification-btn,
.add-classification-btn:focus {
  color: rgba(0, 112, 134, 0.5);
  border-radius: 8px;
  border: 4px dashed rgba(0, 112, 134, 0.2);
  &:active,
  &:hover {
    color: rgba(0, 112, 134, 0.8);
    border: 4px dashed rgba(0, 112, 134, 0.4);
  }
}
.classification-btn {
  border-radius: 4px;
  color: #444;
  gap: 3px;
  box-shadow: inset 0 -1px 2px 0 rgba(0, 0, 0, 0.2);
  background: #f2f2f2;
  min-height: 72px;
  &.selected {
    background: #888;
    color: white;
    text-shadow: 0 0.5px 2px rgba(0, 0, 0, 0.7);
    font-weight: 500;
    box-shadow: inset 0 1px 2px 0 rgba(0, 0, 0, 0.3);
  }
  > img {
    background: transparent;
    position: relative;
    &::before {
      border-radius: 4px;
      position: absolute;
      content: "";
      background: #666;
      width: 24px;
      height: 24px;
      display: inline-block;
    }
  }
  &.pinned {
    position: relative;
    .pinned-tag {
      position: absolute;
      top: 1px;
      right: 4px;
      transform: rotate(30deg);
    }
  }
}

.track-number {
  background-color: orange;
  color: white;
  line-height: 20px;
  padding: 0;
  width: 22px;
  border: 1px solid #ccc;
}
.track {
  height: 48px;
  transition: background-color ease-in-out 0.2s;
  background-color: #f6f6f6;
  border-top: 1px solid white;
  color: rgba(68, 68, 68, 0.8);
  &.selected {
    background-color: white;
    color: #444;

    .confirm-button {
      background-color: #f9f9f9;
      border: 1px solid #183153;
      color: #666;
      > .icon {
        margin-left: 10px;
      }
    }
    .confirm-button,
    .reject-button {
      > .icon {
        color: #444;
        opacity: 1;
      }
    }
  }
  &:not(.selected) {
    .confirm-button > .label {
      // "visibly-hidden"
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
  }
}
.confirm-button,
.reject-button {
  line-height: 1.2;
  > .icon {
    color: #666;
    opacity: 0.8;
  }
}

.strikethrough {
  text-decoration: line-through;
  color: rgba(126, 42, 42, 0.75);
}
.conflicting-tags {
  color: darkred;
}
.classification {
  > .icon {
    vertical-align: middle;
    color: #408f58;
  }
}
</style>
