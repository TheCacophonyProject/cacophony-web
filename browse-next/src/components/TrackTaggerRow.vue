<script setup lang="ts">
import type { ApiTrackResponse } from "@typedefs/api/track";
import type {
  ApiAutomaticTrackTagResponse,
  ApiHumanTrackTagResponse,
  ApiTrackTagResponse,
  TrackTagData,
} from "@typedefs/api/trackTag";
import { computed } from "vue";
import { CurrentUser } from "@models/LoggedInUser";
// eslint-disable-next-line @typescript-eslint/no-unused-vars,vue/no-setup-props-destructure
const { track, index, color, selected } = defineProps<{
  track: ApiTrackResponse;
  index: number;
  color: { foreground: string; background: string };
  selected: boolean;
}>();

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
</script>
<template>
  <div
    class="track p-2 fs-8 d-flex align-items-center justify-content-between"
    :class="{ selected }"
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
    <div v-if="!thisUserTag">
      <button type="button" class="btn fs-7 confirm-button">
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
        <font-awesome-icon icon="chevron-right" rotation="90" />
      </button>
    </div>
  </div>
</template>
<style scoped lang="less">
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
