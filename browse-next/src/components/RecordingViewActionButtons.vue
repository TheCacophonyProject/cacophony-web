<script setup lang="ts">
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import { computed, ref } from "vue";
import { addRecordingLabel, removeRecordingLabel } from "@api/Recording";
import { CurrentUser } from "@models/LoggedInUser";
import type { ApiRecordingTagResponse } from "@typedefs/api/tag";
import type { TagId } from "@typedefs/api/common";

const { recording } = defineProps<{
  recording?: ApiRecordingResponse | null;
}>();

const emit = defineEmits<{
  (e: "added-recording-label", label: ApiRecordingTagResponse): void;
  (e: "removed-recording-label", label: TagId): void;
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
</script>
<template>
  <div class="recording-icons d-flex justify-content-between ps-sm-2">
    <button
      type="button"
      class="btn"
      :disabled="
        !recordingReady || addingLabelInProgress || removingLabelInProgress
      "
      @click.stop.prevent="() => flagRecording()"
    >
      <font-awesome-icon
        :icon="recordingIsFlagged ? ['fas', 'flag'] : ['far', 'flag']"
        :color="recordingIsFlagged ? '#ad0707' : '#666'"
      />
    </button>
    <button
      type="button"
      class="btn"
      :disabled="
        !recordingReady || addingLabelInProgress || removingLabelInProgress
      "
      @click.stop.prevent="() => starRecording()"
    >
      <font-awesome-icon
        :icon="recordingIsStarred ? ['fas', 'star'] : ['far', 'star']"
        :color="recordingIsStarred ? 'goldenrod' : '#666'"
      />
    </button>
    <button type="button" class="btn" :disabled="!recordingReady">
      <font-awesome-icon icon="download" color="#666" />
    </button>
    <button type="button" class="btn" :disabled="!recordingReady">
      <font-awesome-icon icon="trash-can" color="#666" />
    </button>
    <button type="button" class="btn" :disabled="!recordingReady">
      <font-awesome-icon icon="link" color="#666" />
    </button>
  </div>
</template>

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
