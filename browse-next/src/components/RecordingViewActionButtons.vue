<script setup lang="ts">
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import { computed, ref } from "vue";
import { addRecordingLabel, removeRecordingLabel } from "@api/Recording";
import {
  currentSelectedGroup,
  CurrentUser,
  showUnimplementedModal,
} from "@models/LoggedInUser";
import type { SelectedGroup } from "@models/LoggedInUser";
import type { ApiRecordingTagResponse } from "@typedefs/api/tag";
import type { TagId } from "@typedefs/api/common";
import TwoStepActionButton from "@/components/TwoStepActionButton.vue";

const { recording } = defineProps<{
  recording?: ApiRecordingResponse | null;
}>();

const emit = defineEmits<{
  (e: "added-recording-label", label: ApiRecordingTagResponse): void;
  (e: "removed-recording-label", label: TagId): void;
  (e: "requested-download"): void;
  (e: "requested-export"): void;
  (e: "delete-recording"): void;
  (e: "requested-advanced-export"): void;
}>();

const addingLabelInProgress = ref<boolean>(false);
const removingLabelInProgress = ref<boolean>(false);

const addLabel = async (label: string) => {
  if (recording) {
    addingLabelInProgress.value = true;
    const addLabelResponse = await addRecordingLabel(recording.id, label);
    if (addLabelResponse.success) {
      // Emit tag change event, patch upstream recording.
      emit("added-recording-label", {
        id: addLabelResponse.result.tagId,
        detail: label,
        confidence: 0.9,
        taggerName: CurrentUser.value?.userName,
        taggerId: CurrentUser.value?.id,
        createdAt: new Date().toISOString(),
      });
    }
    addingLabelInProgress.value = false;
  }
};

const removeLabel = async (label: string) => {
  if (recording) {
    const labelToRemove = recording.tags.find((tag) => tag.detail === label);
    if (labelToRemove) {
      removingLabelInProgress.value = true;
      const removeLabelResponse = await removeRecordingLabel(
        recording.id,
        labelToRemove.id
      );
      if (removeLabelResponse.success) {
        emit("removed-recording-label", labelToRemove.id);
      }
      removingLabelInProgress.value = false;
    }
  }
};

const FLAG = "requires review";
const STAR = "cool";
const flagRecording = async () => {
  if (!recordingIsFlagged.value) {
    await addLabel(FLAG);
  } else {
    await removeLabel(FLAG);
  }
};

const starRecording = async () => {
  if (!recordingIsStarred.value) {
    await addLabel(STAR);
  } else {
    await removeLabel(STAR);
  }
};

const recordingReady = computed<boolean>(() => {
  return recording !== null;
});

const recordingIsStarred = computed<boolean>(() => {
  if (recording) {
    return !!recording.tags.find((tag) => tag.detail === STAR);
  }
  return false;
});

const recordingIsFlagged = computed<boolean>(() => {
  if (recording) {
    return !!recording.tags.find((tag) => tag.detail === FLAG);
  }
  return false;
});

const userIsGroupAdmin = (currentSelectedGroup.value as SelectedGroup).admin;

const notImplemented = () => {
  showUnimplementedModal.value = true;
};
</script>
<template>
  <div class="recording-icons d-flex justify-content-between px-sm-2">
    <button
      type="button"
      class="btn btn-square btn-hi"
      :disabled="
        !recordingReady || addingLabelInProgress || removingLabelInProgress
      "
      @click.prevent="() => flagRecording()"
    >
      <font-awesome-icon
        :icon="recordingIsFlagged ? ['fas', 'flag'] : ['far', 'flag']"
        :color="recordingIsFlagged ? '#ad0707' : '#666'"
      />
    </button>
    <button
      type="button"
      class="btn btn-square btn-hi"
      :disabled="
        !recordingReady || addingLabelInProgress || removingLabelInProgress
      "
      @click.prevent="() => starRecording()"
    >
      <font-awesome-icon
        :icon="recordingIsStarred ? ['fas', 'star'] : ['far', 'star']"
        :color="recordingIsStarred ? 'goldenrod' : '#666'"
      />
    </button>
    <b-dropdown
      no-flip
      dropup
      auto-close
      offset="-92, 7"
      variant="link"
      toggle-class="dropdown-btn"
      menu-class="dropdown-indicator"
    >
      <template #button-content>
        <font-awesome-icon icon="download" color="#666" />
      </template>
      <b-dropdown-item-button @click="() => emit('requested-export')">
        <font-awesome-icon :icon="['far', 'file-video']" />
        Export Video
      </b-dropdown-item-button>
      <b-dropdown-item-button @click="() => emit('requested-advanced-export')">
        <font-awesome-icon :icon="['far', 'file-video']" />
        Export Video (Advanced)
      </b-dropdown-item-button>
      <b-dropdown-divider />
      <b-dropdown-item-button @click="() => emit('requested-download')">
        <font-awesome-icon :icon="['far', 'file']" />
        Download CPTV
      </b-dropdown-item-button>
    </b-dropdown>
    <two-step-action-button
      :action="() => emit('delete-recording')"
      icon="trash-can"
      confirmation-label="Delete Recording"
      v-if="userIsGroupAdmin"
    >
      <template #button-content>
        <font-awesome-icon icon="trash-can" color="#666" />
      </template>
    </two-step-action-button>
    <button
      type="button"
      class="btn btn-square btn-hi"
      :disabled="!recordingReady"
      @click="() => notImplemented()"
    >
      <font-awesome-icon icon="link" color="#666" />
    </button>
  </div>
</template>
<style lang="less">
.dropdown-indicator {
  position: relative;
  &::after {
    content: "";
    position: absolute;
    width: 0;
    height: 0;
    display: block;
    bottom: -9px;
    border-left: 10px solid transparent;
    border-right: 10px solid transparent;
    border-top: 10px solid white;
    left: calc(50% - 10px);
  }
  &::before {
    content: "";
    position: absolute;
    width: 0;
    height: 0;
    display: block;
    bottom: -10.5px;
    border-left: 10.5px solid transparent;
    border-right: 10.5px solid transparent;
    border-top: 10.5px solid var(--bs-dropdown-border-color);
    left: calc(50% - 10.25px);
  }
}
</style>
<style scoped lang="less">
.recording-icons {
  color: #666;
}

@media screen and (max-width: 320px) {
  .optional-button {
    display: none;
  }
}
@media screen and (min-width: 1041px) {
  .recording-icons {
    margin-top: 0.5rem;
  }
}
</style>
