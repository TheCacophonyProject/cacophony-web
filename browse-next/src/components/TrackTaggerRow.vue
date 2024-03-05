<script setup lang="ts">
import type { ApiTrackResponse } from "@typedefs/api/track";
import type {
  ApiAutomaticTrackTagResponse,
  ApiHumanTrackTagResponse,
  ApiTrackTagResponse,
  Classification,
  TrackTagData,
} from "@typedefs/api/trackTag";
import { computed, inject, nextTick, onMounted, ref, watch } from "vue";
import type { Ref } from "vue";
import { persistUserGroupSettings } from "@models/LoggedInUser";
import type { SelectedProject, LoggedInUser } from "@models/LoggedInUser";
import HierarchicalTagSelect from "@/components/HierarchicalTagSelect.vue";
import type { TrackId, TrackTagId } from "@typedefs/api/common";
import {
  classifications,
  flatClassifications,
  getClassificationForLabel,
  getClassifications,
} from "@api/Classifications";
import type {
  CardTableRows,
  GenericCardTableValue,
} from "@/components/CardTableTypes";
import { useRoute } from "vue-router";
import type { ApiGroupUserSettings } from "@typedefs/api/group";
import { displayLabelForClassificationLabel } from "@api/Classifications";
import CardTable from "@/components/CardTable.vue";
import { DEFAULT_TAGS } from "@/consts";
import { capitalize } from "@/utils";
import TagImage from "@/components/TagImage.vue";
import {
  currentSelectedProject as currentProject,
  currentUser,
} from "@models/provides";
import type { LoadedResource } from "@api/types";
const props = defineProps<{
  track: ApiTrackResponse;
  index: number;
  color: { foreground: string; background: string };
  selected: boolean;
}>();

const emit = defineEmits<{
  (e: "expanded-changed", trackId: TrackId, expanded: boolean): void;
  (e: "selected-track", trackId: TrackId): void;
  (
    e: "add-or-remove-user-tag",
    payload: { trackId: TrackId; tag: string }
  ): void;
  (
    e: "remove-tag",
    payload: { trackId: TrackId; trackTagId: TrackTagId }
  ): void;
}>();

const expandedInternal = ref<boolean>(false);
const showClassificationSearch = ref<boolean>(false);
const showTaggerDetails = ref<boolean>(false);
const tagSelect = ref<typeof HierarchicalTagSelect>();
const trackDetails = ref<HTMLDivElement>();

const currentSelectedProject = inject(currentProject) as Ref<SelectedProject>;
const CurrentUser = inject(currentUser) as Ref<LoadedResource<LoggedInUser>>;

const userIsGroupAdmin = computed<boolean>(() => {
  return (
    (currentSelectedProject.value &&
      (currentSelectedProject.value as SelectedProject).admin) ||
    false
  );
});

const taggerDetails = computed<CardTableRows<string | ApiTrackTagResponse>>(
  () => {
    const tags: ApiTrackTagResponse[] = [...humanTags.value];
    if (masterTag.value) {
      tags.unshift(masterTag.value);
    }

    // NOTE: Delete button gives admins the ability to remove track tags created by other users,
    //  but not AI tags
    return tags.map((tag: ApiTrackTagResponse) => {
      const item: Record<
        string,
        GenericCardTableValue<string | ApiTrackTagResponse> | string
      > = {
        tag: capitalize(
          displayLabelForClassificationLabel(tag.what, tag.automatic)
        ),
        tagger: (tag.automatic ? "Cacophony AI" : tag.userName || "").replace(
          " ",
          "&nbsp;"
        ),
        confidence: tag.automatic
          ? Math.round(100 * tag.confidence).toString() + "%"
          : "",
      };
      if (userIsGroupAdmin.value) {
        item._deleteAction = {
          value: tag,
          cellClasses: ["d-flex", "justify-content-end"],
        };
      }
      return item;
    });
  }
);

const route = useRoute();
const mounting = ref<boolean>(true);
const expanded = computed<boolean>(() => {
  return (
    Number(route.params.trackId) === props.track.id &&
    route.params.detail !== "" &&
    typeof route.params.detail !== "undefined"
  );
});

const handleExpansion = (isExpanding: boolean) => {
  if (isExpanding) {
    if (trackDetails.value) {
      (trackDetails.value as HTMLDivElement).style.height = `${
        (trackDetails.value as HTMLDivElement).scrollHeight
      }px`;
    }
  } else {
    if (trackDetails.value) {
      (trackDetails.value as HTMLDivElement).style.height = "0";
    }
  }
  expandedInternal.value = isExpanding;
  setTimeout(() => (mounting.value = false), 200);
};

watch(expanded, handleExpansion);

const resizeElementToContents = (el: HTMLElement) => {
  if (el.childNodes.length && expandedInternal.value) {
    const top = el.getBoundingClientRect().top;
    const bottom = (
      el.childNodes[el.childNodes.length - 1] as HTMLElement
    ).getBoundingClientRect().bottom;
    el.style.height = `${bottom - top}px`;
  }
};

const resizeDetails = () => {
  nextTick(() => {
    trackDetails.value && resizeElementToContents(trackDetails.value);
  });
};

watch(showTaggerDetails, resizeDetails);
watch(showClassificationSearch, resizeDetails);

const selectAndMaybeToggleExpanded = () => {
  expandedInternal.value = !expandedInternal.value;
  emit("expanded-changed", props.track.id, expandedInternal.value);
};

const hasUserTag = computed<boolean>(() => {
  return props.track.tags.some((tag) => !tag.automatic);
});

const uniqueUserTags = computed<string[]>(() => {
  return Object.keys(
    props.track.tags
      .filter((tag) => !tag.automatic)
      .reduce((acc: Record<string, boolean>, item: ApiTrackTagResponse) => {
        const mappedWhat =
          getClassificationForLabel(item.what)?.label || item.what;
        acc[mappedWhat] = true;
        return acc;
      }, {})
  );
});

const consensusUserTag = computed<string | null>(() => {
  if (uniqueUserTags.value.length !== 1) {
    return null;
  }
  return (
    displayLabelForClassificationLabel(uniqueUserTags.value[0] || "") || null
  );
});

const masterTag = computed<ApiAutomaticTrackTagResponse | null>(() => {
  const tag = props.track.tags.find(
    (tag) =>
      tag.automatic && tag.data && (tag.data as TrackTagData).name === "Master"
  );
  if (tag) {
    const mappedWhat = getClassificationForLabel(tag.what);
    return {
      ...tag,
      what: mappedWhat ? mappedWhat.label : tag.what,
    } as ApiAutomaticTrackTagResponse;
  }
  return null;
});

const hasAiTag = computed<boolean>(() => {
  return masterTag.value !== null;
});

const humanTags = computed<ApiHumanTrackTagResponse[]>(() => {
  return props.track.tags
    .filter((tag) => !tag.automatic)
    .map((tag) => ({
      ...tag,
      what: getClassificationForLabel(tag.what)?.label || tag.what,
    })) as ApiHumanTrackTagResponse[];
});

const thisUserTag = computed<ApiHumanTrackTagResponse | undefined>(
  () =>
    (CurrentUser.value &&
      humanTags.value.find(
        (tag) => tag.userId === (CurrentUser.value as LoggedInUser).id
      )) ||
    undefined
);

const selectedUserTagLabel = computed<string[]>({
  get: () => {
    const label =
      CurrentUser.value &&
      humanTags.value.find(
        (tag) => tag.userId === (CurrentUser.value as LoggedInUser).id
      );
    if (label) {
      return [label.what];
    }
    return [];
  },
  set: (val: string[]) => {
    if (val.length) {
      emit("add-or-remove-user-tag", {
        trackId: props.track.id,
        tag: val[0],
      });
    }
  },
});

const otherUserTags = computed<string[]>(
  () =>
    (CurrentUser.value &&
      humanTags.value
        .filter((tag) => tag.userId !== (CurrentUser.value as LoggedInUser).id)
        .map(({ what }) => what)) ||
    []
);

const thisUsersTagAgreesWithAiClassification = computed<boolean>(
  () => thisUserTag.value?.what === masterTag.value?.what
);

// Default tags is computed from a default list, with overrides coming from the group admin level, and the user group level.
const defaultTags = computed<string[]>(() => {
  const tags = [];
  if (currentSelectedProject.value) {
    const groupSettings = currentSelectedProject.value.settings;
    if (groupSettings && groupSettings.tags) {
      tags.push(...groupSettings.tags);
    } else {
      // Default base tags if admin hasn't edited them
      tags.push(...DEFAULT_TAGS);
    }
  }
  return tags;
});

// These are "pinned" tags.
const userDefinedTags = computed<Record<string, boolean>>(() => {
  const tags: Record<string, boolean> = {};
  if (currentSelectedProject.value) {
    const userSettings = currentSelectedProject.value.userSettings;
    if (userSettings && userSettings.tags) {
      // These are any user-defined "pinned" tags for this group.
      for (const tag of userSettings.tags) {
        tags[tag] = true;
      }
    }
  }
  return tags;
});
const userDefinedTagLabels = computed<string[]>(() =>
  Object.keys(userDefinedTags.value)
);

const availableTags = computed<{ label: string; display: string }[]>(() => {
  // TODO: These can be changed at a group preferences level my group admins,
  //  or at a user-group preferences level by users.
  // Map these tags to the display names in classifications json.
  const tags: Record<string, { label: string; display: string }> = {};
  const allTags = [
    ...defaultTags.value,
    ...userDefinedTagLabels.value,
    ...Object.values(uniqueUserTags.value),
  ];
  if (
    thisUserTag.value &&
    !allTags.includes((thisUserTag.value as ApiHumanTrackTagResponse).what)
  ) {
    allTags.push((thisUserTag.value as ApiHumanTrackTagResponse).what);
  }
  for (const tag of allTags.map(
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

const toggleTag = (tag: string) => {
  if (tag === "more-classifications") {
    showClassificationSearch.value = !showClassificationSearch.value;
  } else {
    if (
      thisUserTag.value &&
      tag === (thisUserTag.value as ApiHumanTrackTagResponse).what
    ) {
      showClassificationSearch.value = false;
    } else if (
      !thisUserTag.value ||
      (thisUserTag.value &&
        (thisUserTag.value as ApiHumanTrackTagResponse).what !== tag)
    ) {
      showClassificationSearch.value = !defaultTags.value.includes(tag);
    }
    emit("add-or-remove-user-tag", { trackId: props.track.id, tag });
    if (showTaggerDetails.value) {
      resizeDetails();
    }
  }
};

const confirmAiSuggestedTag = () => {
  if (masterTag.value) {
    emit("add-or-remove-user-tag", {
      trackId: props.track.id,
      tag: (masterTag.value as ApiAutomaticTrackTagResponse).what,
    });
  }
};

const rejectAiSuggestedTag = () => {
  expandedInternal.value = true;
  emit("expanded-changed", props.track.id, expandedInternal.value);
};

const pinCustomTag = async (classification: Classification) => {
  if (currentSelectedProject.value) {
    const userGroupSettings: ApiGroupUserSettings = currentSelectedProject.value
      .userSettings || {
      displayMode: "visits",
      tags: [],
    };
    const tags = userGroupSettings.tags || [];
    if (tags.includes(classification.label)) {
      userGroupSettings.tags = tags.filter(
        (tag) => tag !== classification.label
      );
    } else {
      userGroupSettings.tags = userGroupSettings.tags || [];
      userGroupSettings.tags.push(classification.label);
    }
    await persistUserGroupSettings(userGroupSettings);
  }
};

const currentlySelectedTagCanBePinned = computed<boolean>(() => {
  if (!thisUserTag.value) {
    return false;
  }
  return !defaultTags.value.includes(
    (thisUserTag.value as ApiHumanTrackTagResponse).what
  );
});
const addCustomTag = () => {
  showClassificationSearch.value = true;
  tagSelect.value && (tagSelect.value as typeof HierarchicalTagSelect).open();
};

onMounted(async () => {
  if (!classifications.value) {
    await getClassifications();
  }
  handleExpansion(expanded.value);
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
            consensusUserTag &&
            masterTag &&
            displayLabelForClassificationLabel(masterTag.what) ===
              consensusUserTag
          "
          >{{ consensusUserTag }}
          <font-awesome-icon icon="check-circle" class="icon"
        /></span>
        <span
          class="classification text-capitalize d-inline-block fw-bold"
          v-else-if="
            consensusUserTag &&
            masterTag &&
            displayLabelForClassificationLabel(masterTag.what) !==
              consensusUserTag
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
          >{{
            uniqueUserTags
              .map((tag) => displayLabelForClassificationLabel(tag))
              .join(", ")
          }}
          <span class="strikethrough">{{ masterTag?.what }}</span></span
        >
        <span
          class="classification text-capitalize d-inline-block fw-bold conflicting-tags"
          v-else-if="!consensusUserTag && masterTag"
          >{{
            uniqueUserTags
              .map((tag) => displayLabelForClassificationLabel(tag))
              .join(", ")
          }}</span
        >
        <!-- No AI tag, maybe this is a dummy track for a trailcam image? -->
        <span
          class="classification text-capitalize d-inline-block fw-bold"
          v-else-if="consensusUserTag && !hasAiTag"
          >{{
            uniqueUserTags
              .map((tag) => displayLabelForClassificationLabel(tag))
              .join(", ")
          }}</span
        >
      </span>
    </div>
    <div v-if="!hasUserTag && hasAiTag && !expanded">
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
    :class="[{ expanded, mounting }]"
    class="track-details px-2 pe-2"
    ref="trackDetails"
  >
    <div class="classification-btns">
      <button
        type="button"
        class="btn classification-btn fs-8 text-capitalize d-flex flex-column align-items-center justify-content-evenly"
        :class="[
          tag.label,
          { selected: thisUserTag && tag.label === thisUserTag.what },
          {
            'selected-by-other-user':
              !(thisUserTag && tag.label === thisUserTag.what) &&
              otherUserTags.includes(tag.label),
          },
          { pinned: !!userDefinedTags[tag.label] },
        ]"
        :key="index"
        v-for="(tag, index) in availableTags"
        @click="(e) => toggleTag(tag.label)"
      >
        <span v-if="!!userDefinedTags[tag.label]" class="pinned-tag"
          ><font-awesome-icon icon="thumbtack" />
        </span>
        <tag-image
          :tag="tag.label"
          width="24"
          height="24"
          :class="{ selected: thisUserTag && tag.label === thisUserTag.what }"
        />
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
        v-if="currentlySelectedTagCanBePinned || showClassificationSearch"
        class="flex-grow-1"
        @pin="pinCustomTag"
        @options-change="resizeDetails"
        @deselected="showClassificationSearch = false"
        ref="tagSelect"
        v-model="selectedUserTagLabel"
        :can-be-pinned="currentlySelectedTagCanBePinned"
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
      <card-table
        v-if="showTaggerDetails && taggerDetails.length !== 0"
        :items="taggerDetails"
        class="mb-2"
        compact
        :max-card-width="0"
      >
        <template #_deleteAction="{ cell }: { cell: Ref<ApiTrackTagResponse> }">
          <button
            v-if="userIsGroupAdmin && !cell.value.automatic"
            class="btn text-secondary"
            @click.prevent="
              () =>
                emit('remove-tag', {
                  trackId: track.id,
                  trackTagId: cell.value.id,
                })
            "
          >
            <font-awesome-icon icon="trash-can" />
          </button>
          <span v-else></span>
        </template>
      </card-table>
      <div
        v-else-if="showTaggerDetails && taggerDetails.length === 0"
        class="fs-7 mb-2"
      >
        No tags have been added yet.
      </div>
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
  &:not(.mounting) {
    transition: height 0.2s ease-in-out;
  }
  height: 0;
  overflow: hidden;
}
.classification-btns {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  @media screen and (min-width: 430px) {
    grid-template-columns: 1fr 1fr 1fr 1fr 1fr;
  }
  @media screen and (min-width: 530px) {
    grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr;
  }
  @media screen and (min-width: 630px) {
    grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr 1fr;
  }
  @media screen and (min-width: 730px) {
    grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr;
  }
  @media screen and (min-width: 830px) {
    grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr;
  }
  @media screen and (min-width: 1041px) {
    grid-template-columns: 1fr 1fr 1fr 1fr 1fr;
  }
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
  &:active,
  &:focus {
    background: #f2f2f2;
  }
  min-height: 72px;
  &.selected {
    background: #888;
    color: white;
    text-shadow: 0 0.5px 2px rgba(0, 0, 0, 0.7);
    font-weight: 500;
    box-shadow: inset 0 1px 2px 0 rgba(0, 0, 0, 0.3);
  }
  &.selected-by-other-user {
    background: #eee;
    box-shadow: inset 0 1px 10px 3px rgba(144, 238, 144, 0.4),
      inset 0 -1px 2px 0 rgba(0, 0, 0, 0.2);
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
  user-select: none;
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
