<script setup lang="ts">
import type { ApiTrackResponse } from "@typedefs/api/track";
import type {
  ApiAutomaticTrackTagResponse,
  ApiHumanTrackTagResponse,
  ApiTrackTagResponse,
  Classification,
  TrackTagData,
} from "@typedefs/api/trackTag";
import type { Ref } from "vue";
import {
  computed,
  inject,
  nextTick,
  onMounted,
  ref,
  useTemplateRef,
  watch,
} from "vue";
import type { LoggedInUser, SelectedProject } from "@models/LoggedInUser";
import { persistUserProjectSettings } from "@models/LoggedInUser";
import HierarchicalTagSelect from "@/components/HierarchicalTagSelect.vue";
import type { TrackId, TrackTagId } from "@typedefs/api/common";
import type {
  CardTableRows,
  GenericCardTableValue,
} from "@/components/CardTableTypes";
import { useRoute } from "vue-router";
import type { ApiGroupUserSettings as ApiProjectUserSettings } from "@typedefs/api/group";
import CardTable from "@/components/CardTable.vue";
import { DEFAULT_AUDIO_TAGS, DEFAULT_CAMERA_TAGS } from "@/consts";
import { capitalize } from "@/utils";
import TagImage from "@/components/TagImage.vue";
import {
  currentSelectedProject as currentProject,
  currentUser,
} from "@models/provides";
import type { LoadedResource } from "@apiClient/types";
import { RecordingProcessingState } from "@typedefs/api/consts.ts";
import TwoStepActionButton from "@/components/TwoStepActionButton.vue";
import {
  classifications,
  displayLabelForClassificationLabel,
  flatClassifications,
  getClassificationForLabel,
  getClassifications,
} from "@api/classificationsUtils.ts";
import { BSpinner, BTooltip } from "bootstrap-vue-next";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";
import { useElementSize } from "@vueuse/core";

const props = defineProps<{
  track: ApiTrackResponse;
  index: number;
  color: { foreground: string; background: string };
  selected: boolean;
  processingState: RecordingProcessingState;
  isAudioRecording: boolean;
}>();

const emit = defineEmits<{
  (e: "removed-track", payload: { trackId: TrackId }): void;
  (e: "expanded-changed", trackId: TrackId, expanded: boolean): void;
  (e: "selected-track", trackId: TrackId, forceReplay?: boolean): void;
  (
    e: "remove-tag",
    payload: { trackId: TrackId; trackTagId: TrackTagId },
  ): void;
  (
    e: "add-or-remove-user-tag",
    payload: { trackId: TrackId; tag: string },
  ): void;
  (e: "text-edit-mode-change", enabled: boolean): void;
}>();

const expandedInternal = ref<boolean>(false);
const showClassificationSearch = ref<boolean>(false);
const showTaggerDetails = ref<boolean>(false);
const trackDetails = ref<HTMLDivElement>();

const { width: trackDetailWidth } = useElementSize(trackDetails);
watch(trackDetailWidth, () => {
  if (expandedInternal.value) {
    // Any time the width changes, if the accordion item is expanded, reevaluate the height.
    handleExpansion(expandedInternal.value);
  }
});

const currentSelectedProject = inject(currentProject) as Ref<SelectedProject>;
const CurrentUser = inject(currentUser) as Ref<LoadedResource<LoggedInUser>>;

const userIsGroupAdmin = computed<boolean>(() => {
  return (
    (currentSelectedProject.value &&
      (currentSelectedProject.value as SelectedProject).admin) ||
    false
  );
});

const mapConfidences = (confidence: number) => {
  if (confidence <= 1) {
    return Math.round(confidence * 100);
  }
  return confidence;
};

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
          displayLabelForClassificationLabel(
            tag.what,
            tag.automatic,
            props.isAudioRecording,
          ),
        ),
        tagger: (tag.automatic ? "Cacophony AI" : tag.userName || "").replace(
          " ",
          "&nbsp;",
        ),
        confidence: tag.automatic
          ? mapConfidences(tag.confidence).toString() + "%"
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
  },
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
    resizeElementToContents(trackDetails.value);
  } else {
    if (trackDetails.value) {
      (trackDetails.value as HTMLDivElement).style.height = "0";
    }
  }
  expandedInternal.value = isExpanding;
  setTimeout(onMount, 150);
};

const onMount = () => {
  if (expandedInternal.value) {
    resizeElementToContents(trackDetails.value);
  }
};

watch(expanded, handleExpansion);
watch(
  () => props.selected,
  (next) => {
    if (next) {
      show();
    }
  },
);
const resizeElementToContents = (el?: HTMLElement) => {
  if (el && el.childNodes.length && expandedInternal.value) {
    const firstEl = el.childNodes[0] as HTMLElement;
    const lastEl = el.childNodes[el.childNodes.length - 1] as HTMLElement;
    const top = firstEl.getBoundingClientRect().top;
    const bottom = lastEl.getBoundingClientRect().bottom;
    el.style.height = `${bottom - top}px`;
  }
};

const resizeDetails = () => {
  nextTick(() => {
    trackDetails.value && resizeElementToContents(trackDetails.value);
  });
};

watch(showTaggerDetails, resizeDetails);
const selectAndMaybeToggleExpanded = (e: MouseEvent) => {
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
      }, {}),
  );
});

const consensusUserTag = computed<string | null>(() => {
  if (uniqueUserTags.value.length !== 1) {
    return null;
  }
  return (
    displayLabelForClassificationLabel(
      uniqueUserTags.value[0] || "",
      false,
      props.isAudioRecording,
    ) || null
  );
});

const getAuthoritativeTagsForTrack = (
  trackTags: ApiTrackTagResponse[],
): string[] => {
  const userTags = trackTags.filter((tag) => !tag.automatic);
  const authTags = [];
  if (userTags.length) {
    authTags.push((userTags[0] as ApiTrackTagResponse).what);
  } else {
    // NOTE: For audio, there can be multiple authoritative tags for a single track, until a user confirms one.
    const masterTags = trackTags.filter(
      (tag) => tag.automatic && tag.model === "Master",
    );
    const isNoise = (tag: ApiTrackTagResponse) =>
      tag.what === "noise" || tag.what === "false-positive";
    const nonNoiseMaster = masterTags.some((tag) => !isNoise(tag));

    for (const tag of masterTags) {
      if ((nonNoiseMaster && !isNoise(tag)) || !nonNoiseMaster) {
        authTags.push(tag.what);
      }
    }
  }
  return authTags;
};

const masterTag = computed<ApiAutomaticTrackTagResponse | null>(() => {
  // If there are multiple AI master tags, as there seem to be for audio, find the most specific one.
  const masterTags = props.track.tags.filter(
    (tag) => tag.automatic && tag.model === "Master",
  );
  let tag;
  if (masterTags.length === 1) {
    tag = masterTags[0];
  } else {
    // Find the best/most specific tag.
    const isNoise = (tag: ApiTrackTagResponse) =>
      tag.what === "noise" || tag.what === "false-positive";
    const nonNoiseMasters = masterTags.filter((tag) => !isNoise(tag));
    if (nonNoiseMasters.length === 1) {
      tag = nonNoiseMasters[0];
    } else {
      let mostSpecific = null;
      for (const tag of nonNoiseMasters) {
        if (mostSpecific === null) {
          mostSpecific = tag;
        } else if (
          mostSpecific &&
          tag.path.length > mostSpecific.path.length &&
          tag.path.startsWith(mostSpecific.path)
        ) {
          mostSpecific = tag;
        }
      }
      tag = mostSpecific;
    }
  }
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
        (tag) => tag.userId === (CurrentUser.value as LoggedInUser).id,
      )) ||
    undefined,
);

const selectedUserTagLabel = computed<string[]>({
  get: () => {
    const label =
      CurrentUser.value &&
      humanTags.value.find(
        (tag) => tag.userId === (CurrentUser.value as LoggedInUser).id,
      );
    if (label) {
      return [label.what];
    }
    return [];
  },
  set: (val: string[]) => {
    if (val.length) {
      // Why is this giving an error?  Because we're doing side-effects in a setter?
      emit("add-or-remove-user-tag", {
        trackId: props.track.id,
        tag: val[0] as string,
      });
    }
  },
});

const permanentlyDeleteTrack = (trackId: TrackId) => {
  emit("removed-track", { trackId });
};

const trackWasCreatedByUser = (track: ApiTrackResponse): boolean => {
  if (CurrentUser.value) {
    return track.tags.every(
      (tag) =>
        !tag.automatic && tag.userId === (CurrentUser.value as LoggedInUser).id,
    );
  }
  return false;
};

const otherUserTags = computed<string[]>(
  () =>
    (CurrentUser.value &&
      humanTags.value
        .filter((tag) => tag.userId !== (CurrentUser.value as LoggedInUser).id)
        .map(({ what }) => what)) ||
    [],
);

const thisUsersTagAgreesWithAiClassification = computed<boolean>(
  () => thisUserTag.value?.what === masterTag.value?.what,
);

// Default tags is computed from a default list, with overrides coming from the group admin level, and the user group level.
const defaultTags = computed<string[]>(() => {
  const tags = [];
  if (currentSelectedProject.value) {
    const groupSettings = currentSelectedProject.value.settings;
    if (!props.isAudioRecording) {
      if (groupSettings && groupSettings.tags) {
        tags.push(...groupSettings.tags);
      } else {
        // Default base tags if admin hasn't edited them
        tags.push(...DEFAULT_CAMERA_TAGS);
      }
    } else {
      if (groupSettings && groupSettings.audioTags) {
        tags.push(...groupSettings.audioTags);
      } else {
        // Default base tags if admin hasn't edited them
        tags.push(...DEFAULT_AUDIO_TAGS);
      }
    }
  }
  return tags;
});

// These are "pinned" tags.
const userDefinedTags = computed<Record<string, boolean>>(() => {
  const tags: Record<string, boolean> = {};
  if (currentSelectedProject.value) {
    const userSettings = currentSelectedProject.value.userSettings;
    if (userSettings) {
      // These are any user-defined "pinned" tags for this group.
      if (props.isAudioRecording && userSettings.audioTags) {
        for (const tag of userSettings.audioTags) {
          tags[tag] = true;
        }
      } else if (!props.isAudioRecording && userSettings.tags) {
        for (const tag of userSettings.tags) {
          tags[tag] = true;
        }
      }
    }
  }
  return tags;
});
const userDefinedTagLabels = computed<string[]>(() =>
  Object.keys(userDefinedTags.value),
);

const availableTags = computed<
  { label: string; display: string; displayAudio: string }[]
>(() => {
  // TODO: These should be different for audio and camera

  // TODO: These can be changed at a group preferences level by group admins,
  //  or at a user-group preferences level by users.
  // Map these tags to the display names in classifications json.
  const tags: Record<
    string,
    { label: string; display: string; displayAudio: string }
  > = {};
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
        displayAudio: `${tag}_not_found`,
      },
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
      if (!showTaggerDetails.value) {
        resizeDetails();
      }
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

const replaySelectedTrack = () => {
  emit("selected-track", props.track.id, true);
};

const rejectAiSuggestedTag = () => {
  expandedInternal.value = true;
  emit("expanded-changed", props.track.id, expandedInternal.value);
};

const pinCustomTag = async (classification: Classification) => {
  await pinCustomTagByLabel(classification.label);
};

const pinCustomTagByLabel = async (label: string) => {
  if (currentSelectedProject.value) {
    const currentDisplayMode =
      route.query["display-mode"] === "recordings" ? "recordings" : "visits";
    const userProjectSettings: ApiProjectUserSettings = currentSelectedProject
      .value.userSettings || {
      displayMode: currentDisplayMode, // Current display mode
      tags: [],
      audioTags: [],
    };
    if (props.isAudioRecording) {
      const tags = userProjectSettings.audioTags || [];
      if (tags.includes(label)) {
        userProjectSettings.audioTags = tags.filter((tag) => tag !== label);
      } else {
        userProjectSettings.audioTags = userProjectSettings.audioTags || [];
        userProjectSettings.audioTags.push(label);
      }
    } else {
      const tags = userProjectSettings.tags || [];
      if (tags.includes(label)) {
        userProjectSettings.tags = tags.filter((tag) => tag !== label);
      } else {
        userProjectSettings.tags = userProjectSettings.tags || [];
        userProjectSettings.tags.push(label);
      }
    }
    await persistUserProjectSettings(userProjectSettings);
  }
};

const currentlySelectedTagCanBePinned = computed<boolean>(() => {
  if (!thisUserTag.value) {
    return false;
  }
  return !defaultTags.value.includes(
    (thisUserTag.value as ApiHumanTrackTagResponse).what,
  );
});
const addCustomTag = () => {
  showCustomTagSelection.value = true;
  emit("text-edit-mode-change", true);
};

const processingIsAnalysing = computed<boolean>(
  () =>
    props.processingState === RecordingProcessingState.Analyse ||
    props.processingState === RecordingProcessingState.TrackAndAnalyse,
);

const row = ref<HTMLDivElement>();
const show = () => {
  setTimeout(() => {
    if (row.value) {
      if (trackDetails.value) {
        // Check if everything is in scroll view.
        const navBottom = document
          .querySelector(".player-and-tagging .nav")
          ?.getBoundingClientRect().bottom;
        const footerTop = document
          .querySelector(".recording-view-footer")
          ?.getBoundingClientRect().top;
        const bounds = trackDetails.value.getBoundingClientRect();
        if (
          navBottom &&
          footerTop &&
          (bounds.top < navBottom || bounds.bottom > footerTop)
        ) {
          const lastEl =
            trackDetails.value.children[row.value.children.length - 1];
          lastEl.scrollIntoView({
            block: "end",
            inline: "end",
            behavior: "smooth",
          });
        } else {
          // Already in view
        }
      } else {
        row.value.scrollIntoView({
          block: "end",
          inline: "end",
          behavior: "smooth",
        });
      }
    }
  }, 200);
};

onMounted(async () => {
  if (!classifications.value) {
    await getClassifications();
  }
  handleExpansion(expanded.value);
});

const showCustomTagSelection = ref<boolean>(false);
const selectionPopover = useTemplateRef<HTMLDivElement>("selectionPopover");
const cancelledCustomTagSelection = async () => {
  selectionPopover.value?.classList.add("removed");
  showCustomTagSelection.value = false;
  emit("text-edit-mode-change", false);
  setTimeout(async () => {
    showCustomTagSelection.value = false;
  }, 300);
};
const confirmTagSelection = (e: unknown[]) => {
  if (e.length) {
    showClassificationSearch.value = true;
  }
  cancelledCustomTagSelection();
};

const singleSelectionIsPinned = computed<boolean>(
  () =>
    selectedUserTagLabel.value.length === 1 &&
    userDefinedTagLabels.value.includes(selectedUserTagLabel.value[0]),
);
</script>
<template>
  <div class="track-item" :class="{ selected, expanded }">
    <div
      class="class-selection-popover-background"
      @click.prevent.stop="() => {}"
      v-if="showCustomTagSelection"
    ></div>
    <div
      class="class-selection-popover main"
      v-if="showCustomTagSelection"
      ref="selectionPopover"
    >
      <hierarchical-tag-select
        @deselected="cancelledCustomTagSelection"
        @change="confirmTagSelection"
        @options-change="resizeDetails"
        v-model="selectedUserTagLabel"
      />
    </div>
    <div
      class="track p-1 ps-2 p-sm-2 d-flex align-items-center justify-content-between"
      ref="row"
      :class="{ selected }"
      @click="selectAndMaybeToggleExpanded"
    >
      <div class="d-flex align-items-center">
        <span
          class="track-number flex-shrink-0 me-3 fw-medium text-center d-inline-block rounded-1"
          :style="{
            background: color.background,
            color: color.foreground === 'dark' ? '#333' : '#fff',
          }"
          >{{ index + 1 }}</span
        >
        <div v-if="!hasUserTag && masterTag" class="d-flex flex-column">
          <span class="fs-6" data-cy="classification type"
            >AI Classification</span
          >
          <span
            data-cy="classification"
            class="classification text-capitalize d-inline-block fw-semibold"
            v-if="masterTag"
            >{{
              displayLabelForClassificationLabel(
                masterTag.what,
                true,
                isAudioRecording,
              )
            }}</span
          >
        </div>
        <span v-else-if="hasUserTag" class="d-flex flex-column">
          <span class="fs-6" data-cy="classification type">Manual ID</span>
          <span
            data-cy="classification"
            class="classification text-capitalize d-inline-flex fw-semibold gap-1"
            v-if="
              consensusUserTag &&
              masterTag &&
              displayLabelForClassificationLabel(
                masterTag.what,
                false,
                isAudioRecording,
              ) === consensusUserTag
            "
            >{{ consensusUserTag }}
            <material-symbol
              name="check_circle"
              class="text-success"
              size="1.125rem"
              filled
            />
          </span>
          <span
            class="classification text-capitalize d-inline-block fw-semibold"
            data-cy="classification"
            v-else-if="
              consensusUserTag &&
              masterTag &&
              displayLabelForClassificationLabel(
                masterTag.what,
                false,
                isAudioRecording,
              ) !== consensusUserTag
            "
            >{{ consensusUserTag }}
            <span class="strikethrough">{{
              displayLabelForClassificationLabel(
                masterTag.what,
                false,
                isAudioRecording,
              )
            }}</span></span
          >
          <!-- Controversial tag, should be automatically flagged for review. -->
          <span
            class="classification text-capitalize d-inline-block fw-semibold conflicting-tags"
            data-cy="classification"
            v-else-if="
              !consensusUserTag &&
              masterTag &&
              !uniqueUserTags.includes(masterTag.what)
            "
            >{{
              uniqueUserTags
                .map((tag) =>
                  displayLabelForClassificationLabel(
                    tag,
                    false,
                    isAudioRecording,
                  ),
                )
                .join(", ")
            }}
            <span class="strikethrough conflicting-tags">{{
              displayLabelForClassificationLabel(
                masterTag.what,
                false,
                isAudioRecording,
              )
            }}</span></span
          >
          <span
            class="classification text-capitalize d-inline-block fw-semibold conflicting-tags"
            v-else-if="!consensusUserTag && masterTag"
            >{{
              uniqueUserTags
                .map((tag) =>
                  displayLabelForClassificationLabel(
                    tag,
                    false,
                    isAudioRecording,
                  ),
                )
                .join(", ")
            }}</span
          >
          <span
            class="text-capitalize d-inline-block fw-semibold"
            v-else-if="consensusUserTag && !hasAiTag"
            >{{
              uniqueUserTags
                .map((tag) =>
                  displayLabelForClassificationLabel(
                    tag,
                    false,
                    isAudioRecording,
                  ),
                )
                .join(", ")
            }}</span
          >
        </span>
        <!-- No tag, maybe this is a dummy track?   -->
        <div v-else class="d-flex flex-column classification">
          <span class="text-uppercase fw-semibold">
            <span v-if="processingIsAnalysing" class="d-flex align-items-center"
              ><b-spinner variant="secondary" small class="me-2" /><span
                >AI classifying</span
              ></span
            >
            <span v-else>Unclassified</span>
          </span>
          <span v-if="!processingIsAnalysing">&mdash;</span>
        </div>
      </div>
      <div v-if="!hasUserTag && hasAiTag && !expanded" class="d-flex">
        <button
          type="button"
          class="btn confirm-button"
          :class="{ 'btn-outline-secondary': selected, 'btn-icon': !selected }"
          @click.stop.prevent="confirmAiSuggestedTag"
        >
          <span class="d-flex align-items-center">
            <span class="me-2" :class="{ 'visually-hidden': !selected }"
              >Confirm</span
            >
            <material-symbol
              :name="
                thisUsersTagAgreesWithAiClassification ? 'thumb_up' : 'thumb_up'
              "
              size="1.125rem"
              class="icon"
            />
          </span>
        </button>
        <button
          type="button"
          class="btn btn-icon reject-button"
          aria-label="Reject AI classification"
          @click.stop.prevent="rejectAiSuggestedTag"
        >
          <span class="d-flex align-items-center">
            <span class="visually-hidden">Reject</span>
            <material-symbol name="thumb_down" size="1.125rem" class="icon" />
          </span>
        </button>
        <button
          v-if="expanded"
          type="button"
          aria-label="Replay track"
          class="btn btn-icon"
          @click.stop.prevent="replaySelectedTrack"
        >
          <span class="visually-hidden">Replay track</span>
          <material-symbol name="replay" size="1.125rem" class="icon" />
        </button>
        <two-step-action-button
          v-if="isAudioRecording"
          :action="() => permanentlyDeleteTrack(track.id)"
          icon="delete"
          tooltip-label="Delete"
          confirmation-label="Delete track"
          :boundary-padding="true"
        />
      </div>
      <div v-else class="d-flex">
        <button
          v-if="!hasUserTag && hasAiTag"
          type="button"
          class="btn btn-outline-secondary confirm-button d-flex align-items-center"
          @click.stop.prevent="confirmAiSuggestedTag"
        >
          <span class="label">Confirm</span>
          <material-symbol
            :name="
              thisUsersTagAgreesWithAiClassification ? 'thumb_up' : 'thumb_up'
            "
            size="1.125rem"
            class="icon ms-2"
          />
        </button>
        <button
          v-if="expanded"
          type="button"
          aria-label="Replay track"
          class="btn btn-icon d-flex align-items-center justify-content-center"
          @click.stop.prevent="replaySelectedTrack"
        >
          <span class="visually-hidden">Replay track</span>
          <material-symbol name="replay" size="1.25rem" class="icon" />
        </button>
        <two-step-action-button
          v-if="
            isAudioRecording &&
            (userIsGroupAdmin || trackWasCreatedByUser(track))
          "
          :action="() => permanentlyDeleteTrack(track.id)"
          icon="delete"
          tooltip-label="Delete"
          confirmation-label="Delete track"
          :boundary-padding="true"
        />
        <button
          type="button"
          aria-label="Expand track"
          class="btn btn-icon d-flex align-items-center justify-content-center px-2"
        >
          <span class="visually-hidden">Expand track</span>
          <material-symbol
            :name="expanded ? 'keyboard_arrow_up' : 'keyboard_arrow_down'"
            size="1.5rem"
          />
        </button>
      </div>
    </div>
    <div :class="[{ expanded }]" class="track-details px-2" ref="trackDetails">
      <div class="classification-btns">
        <button
          type="button"
          :data-cy="`classification button ${isAudioRecording ? tag.displayAudio : tag.display}`"
          class="btn btn-classification text-capitalize d-flex flex-column gap-1 align-items-center justify-content-evenly"
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
          :key="tag.label"
          v-for="(tag, _index) in availableTags"
          @click="(e) => toggleTag(tag.label)"
        >
          <span v-if="!!userDefinedTags[tag.label]" class="pinned-tag">
            <material-symbol name="keep" size="1.25rem" />
          </span>
          <tag-image
            :tag="tag.label"
            width="24"
            height="24"
            :class="{ selected: thisUserTag && tag.label === thisUserTag.what }"
          />
          <span v-if="isAudioRecording" class="fs-6">{{
            tag.displayAudio
          }}</span>
          <span v-else class="fs-6">{{ tag.display }}</span>
        </button>
        <button
          type="button"
          class="btn btn-classification add d-flex flex-column gap-1 align-items-center justify-content-evenly"
          @click="addCustomTag"
        >
          <material-symbol name="add" size="2rem" />
          <span class="fs-6">Add tag</span>
        </button>
      </div>
      <div
        v-if="showClassificationSearch || currentlySelectedTagCanBePinned"
        class="mt-2"
      >
        <button
          type="button"
          class="btn d-flex align-items-center justify-content-center btn-outline-secondary gap-2 w-100"
          :class="{ pinned: singleSelectionIsPinned }"
          v-if="currentlySelectedTagCanBePinned"
          id="pin-btn"
          @click.prevent="pinCustomTagByLabel(selectedUserTagLabel[0])"
          :aria-label="singleSelectionIsPinned ? 'Unpin tag' : 'Pin tag'"
        >
          <span v-if="singleSelectionIsPinned">Unpin selected tag</span
          ><span v-else>Pin selected tag</span>
          <material-symbol
            :name="singleSelectionIsPinned ? 'keep_off' : 'keep'"
            size="1.25rem"
          />
        </button>
      </div>
      <div class="tagger-details mt-2">
        <button
          class="btn link-secondary fs-6 d-block mx-auto d-flex align-items-center justify-content-center"
          @click="showTaggerDetails = !showTaggerDetails"
        >
          <span v-if="!showTaggerDetails">View details</span>
          <span v-else>Hide details</span>
          <material-symbol
            :name="
              showTaggerDetails ? 'keyboard_arrow_up' : 'keyboard_arrow_down'
            "
            size="1.25rem"
            class="ms-1"
          />
        </button>
        <div
          class="px-sm-1 pb-1"
          v-if="showTaggerDetails && taggerDetails.length !== 0"
        >
          <card-table :items="taggerDetails" compact :max-card-width="0">
            <template
              #_deleteAction="{ cell }: { cell: Ref<ApiTrackTagResponse> }"
            >
              <button
                v-if="userIsGroupAdmin && !cell.value.automatic"
                class="btn btn-icon btn-sm d-flex align-items-center"
                @click.prevent="
                  () =>
                    emit('remove-tag', {
                      trackId: track.id,
                      trackTagId: cell.value.id,
                    })
                "
              >
                <material-symbol name="delete" size="1.125rem" />
              </button>
              <span v-else></span>
            </template>
          </card-table>
        </div>
        <div
          v-else-if="showTaggerDetails && taggerDetails.length === 0"
          class="p-2 text-center text-muted fs-6"
        >
          No tags have been added yet.
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped lang="less">
@import "../assets/less/breakpoints.less";
@import "../assets/less/typography.less";
@import "../assets/less/elevation.less";

.track-item {
  border-radius: var(--bs-border-radius);
  .track {
    min-height: calc(var(--cp-grid-base) * 12);
    user-select: none;
    transition: background-color ease-in-out 0.2s;
    border-radius: var(--bs-border-radius);
  }
  &.selected {
    &.expanded {
      background-color: var(--bs-white);
      box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.1);
      .track {
        background-color: var(--bs-white);
      }
    }
    &:not(.expanded) {
      .track {
        background-color: var(--cp-color-green-50);
      }
    }
  }
  &:not(.selected) {
    &:hover {
      &:not(.expanded) {
        .track {
          background-color: var(--bs-gray-200);
          transition: 0.1s linear;
        }
      }
    }
  }
  .track-details {
    background: var(--bs-white);
    border-bottom-left-radius: var(--bs-border-radius);
    border-bottom-right-radius: var(--bs-border-radius);
    height: 0;
    overflow-y: hidden;
    container-type: inline-size; // needed for container queries below
    //&:not(.mounting) {
    transition: height 0.2s ease-in-out;
    //}
  }
}

.track-item {
  &:not(.selected) {
    opacity: 0.6;
  }
}

.track-number {
  background-color: orange;
  color: white;
  line-height: var(--cp-line-height-md);
  width: calc(var(--cp-grid-base) * 5);
  height: calc(var(--cp-grid-base) * 5);
  border: 1px solid var(--bs-gray-300);
  font-size: var(--cp-font-size-sm);
}

.classification {
  line-height: var(--cp-line-height-sm);
  @media (max-width: @breakpoint-xs-max) {
    margin: var(--cp-spacing-xxxs) 0 var(--cp-spacing-xxs);
  }
  @media (min-width: @breakpoint-sm) {
    margin: var(--cp-spacing-xxs) 0 var(--cp-spacing-xxxs);
  }
}

.strikethrough {
  text-decoration: line-through;
  font-weight: var(--cp-font-weight-regular);
  color: color-mix(in srgb, var(--bs-red), black 25%);
  &.conflicting-tags {
    color: var(--bs-secondary);
  }
}
.conflicting-tags {
  color: color-mix(in srgb, var(--bs-red), black 25%);
}

.classification-btns {
  display: grid;
  //grid-template-columns: repeat(4, minmax(0, 1fr));
  column-gap: var(--cp-spacing-xxs);
  row-gap: var(--cp-spacing-xxs);
  @container (width <= 480px) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  @container (width > 480px) and (width <= 575px) {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
  @container (width > 575px) and (width <= 640px) {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
  @container (width > 640px) and (width <= 768px) {
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }
  @container (width > 768px) and (width <= 832px) {
    grid-template-columns: repeat(8, minmax(0, 1fr));
  }
  @container (width > 832px) and (width <= 992px) {
    grid-template-columns: repeat(9, minmax(0, 1fr));
  }
  @container (width > 992px) and (width <= 1200px) {
    grid-template-columns: repeat(10, minmax(0, 1fr));
  }
  @container (width > 1200px) and (width <= 1400px) {
    grid-template-columns: repeat(11, minmax(0, 1fr));
  }
  @container (width > 1400px) {
    grid-template-columns: repeat(12, minmax(0, 1fr));
  }
}

.btn-classification {
  //--bs-btn-font-weight: 500;
  //--bs-btn-color: var(--bs-primary);
  --bs-btn-bg: transparent;
  --bs-btn-border-color: var(--bs-gray-200);
  //--bs-btn-hover-color: var(--bs-white);
  --bs-btn-hover-bg: var(--bs-gray-100);
  --bs-btn-hover-border-color: transparent;
  --bs-btn-focus-shadow-rgb: 49, 132, 253;
  --bs-btn-active-color: var(--bs-btn-hover-color);
  --bs-btn-active-bg: var(--bs-gray-200);
  --bs-btn-active-border-color: transparent;
  --bs-btn-line-height: var(--cp-line-height-md);
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.2);
  padding: var(--cp-spacing-sm) var(--cp-spacing-xxxs) var(--cp-spacing-xs);
  &.selected {
    background: var(--bs-gray-600);
    color: var(--bs-white);
    .standard-shadow-inset(0.8);
  }
  &.selected-by-other-user {
    background: var(--bs-gray-200);
    .standard-shadow-inset();
  }
  &.add {
    box-shadow: none;
    border-style: dashed;
    border-color: var(--bs-gray-400);
  }
  &.pinned {
    position: relative;
    .pinned-tag {
      position: absolute;
      top: var(--cp-spacing-xxxs);
      right: var(--cp-spacing-xxs);
      transform: rotate(30deg);
    }
  }
  > span {
    word-break: break-word;
    letter-spacing: -0.01rem;
  }
}
</style>
