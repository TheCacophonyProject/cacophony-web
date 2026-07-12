<script setup lang="ts">
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import { computed, type ComputedRef, inject, ref, watch } from "vue";
import { ClientApi } from "@/api";
import type { LoggedInUser, SelectedProject } from "@models/LoggedInUser";
import { showUnimplementedModal } from "@models/LoggedInUser";
import type { ApiRecordingTagResponse } from "@typedefs/api/tag";
import type { TagId } from "@typedefs/api/common";
import { RecordingType } from "@typedefs/api/consts.ts";
import { currentSelectedProject, currentUser } from "@models/provides.ts";
import type { ApiLoggedInUserResponse } from "@typedefs/api/user";
import type { LoadedResource } from "@apiClient/types.ts";
import TwoStepActionButton from "@/components/TwoStepActionButton.vue";
import {
  BButton,
  BDropdown,
  BDropdownDivider,
  BDropdownItemButton,
  BTooltip,
} from "bootstrap-vue-next";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";

const props = withDefaults(
  defineProps<{
    recording: LoadedResource<ApiRecordingResponse>;
    classes?: string[];
  }>(),
  { recording: null },
);

const currentProject = inject(currentSelectedProject) as ComputedRef<
  SelectedProject | false
>;
const CurrentUser = inject(currentUser) as ComputedRef<LoggedInUser | null>;

const currentRecordingType = computed<"cptv" | "audio">(() => {
  if (props.recording) {
    switch (props.recording.type) {
      case RecordingType.ThermalRaw:
        return "cptv";
      case RecordingType.Audio:
        return "audio";
    }
  }
  return "cptv";
});

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
  if (props.recording) {
    addingLabelInProgress.value = true;
    const addLabelResponse = await ClientApi.Recordings.addRecordingLabel(
      props.recording.id,
      label,
    );
    if (addLabelResponse.success) {
      // Emit tag change event, patch upstream recording.
      if (CurrentUser.value) {
        emit("added-recording-label", {
          id: addLabelResponse.result.tagId,
          detail: label,
          confidence: 0.9,
          taggerName: (CurrentUser.value as ApiLoggedInUserResponse).userName,
          taggerId: (CurrentUser.value as ApiLoggedInUserResponse).id,
          createdAt: new Date().toISOString(),
        });
      }
    }
    addingLabelInProgress.value = false;
  }
};

const removeLabel = async (label: string) => {
  if (props.recording) {
    const labelToRemove = props.recording.tags.find(
      (tag) => tag.detail === label,
    );
    if (labelToRemove) {
      removingLabelInProgress.value = true;
      const removeLabelResponse =
        await ClientApi.Recordings.removeRecordingLabel(
          props.recording.id,
          labelToRemove.id,
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
  return props.recording !== null;
});

const recordingIsStarred = computed<boolean>(() => {
  if (props.recording) {
    return !!props.recording.tags.find((tag) => tag.detail === STAR);
  }
  return false;
});

const recordingIsFlagged = computed<boolean>(() => {
  if (props.recording) {
    return !!props.recording.tags.find((tag) => tag.detail === FLAG);
  }
  return false;
});

const userIsGroupAdmin = computed<boolean>(() => {
  if (currentProject.value) {
    return (
      currentProject.value.hasOwnProperty("admin") &&
      currentProject.value.admin === true
    );
  }
  return false;
});

const notImplemented = () => {
  showUnimplementedModal.value = true;
};
</script>
<template>
  <div
    class="recording-icons d-flex align-items-center gap-2 mt-lg-2"
    :class="props.classes || []"
  >
    <button
      type="button"
      class="btn btn-icon d-flex align-items-center"
      id="flag"
      aria-label="Flag record"
      :disabled="
        !recordingReady || addingLabelInProgress || removingLabelInProgress
      "
      @click.prevent="() => flagRecording()"
    >
      <material-symbol
        name="flag"
        size="1.25rem"
        :style="recordingIsFlagged ? `color:#ad0707` : ''"
        :filled="recordingIsFlagged"
      />
    </button>
    <b-tooltip target="flag"> Flag </b-tooltip>
    <button
      type="button"
      class="btn btn-icon d-flex align-items-center"
      id="star"
      aria-label="Star record"
      :disabled="
        !recordingReady || addingLabelInProgress || removingLabelInProgress
      "
      @click.prevent="() => starRecording()"
    >
      <material-symbol
        name="star"
        size="1.25rem"
        :style="recordingIsStarred ? `color:goldenrod` : ''"
        :filled="recordingIsStarred"
      />
    </button>
    <b-tooltip target="star"> Star </b-tooltip>
    <b-dropdown
      dropup
      auto-close
      no-caret
      center
      variant="light"
      id="export"
      aria-label="Download recording"
      toggle-class="dropdown-btn btn-icon"
      v-if="currentRecordingType === 'cptv'"
      strategy="fixed"
    >
      <template #button-content>
        <material-symbol
          class="d-flex align-items-center justify-content-center"
          name="download"
          size="1.25rem"
        />
      </template>
      <b-dropdown-item-button @click="() => emit('requested-export')">
        Export Video
      </b-dropdown-item-button>
      <b-dropdown-item-button @click="() => emit('requested-advanced-export')">
        Export Video (Advanced)
      </b-dropdown-item-button>
      <b-dropdown-divider />
      <b-dropdown-item-button @click="() => emit('requested-download')">
        Download CPTV File
      </b-dropdown-item-button>
    </b-dropdown>
    <button
      v-else-if="currentRecordingType === 'audio'"
      type="button"
      class="btn btn-icon d-flex align-items-center"
      id="export"
      aria-label="Download recording"
      :disabled="!recordingReady"
      @click="() => emit('requested-download')"
    >
      <material-symbol name="download" size="1.25rem" />
    </button>
    <b-tooltip target="export"> Download </b-tooltip>
    <two-step-action-button
      icon="delete"
      tooltip-label="Delete"
      aria-label="Delete recording"
      data-cy="delete recording"
      confirmation-label="Delete recording"
      :action="() => emit('delete-recording')"
      placement="top"
      v-if="userIsGroupAdmin"
    >
    </two-step-action-button>
    <!--    <button-->
    <!--      type="button"-->
    <!--      class="btn btn-square btn-hi"-->
    <!--      :disabled="!recordingReady"-->
    <!--      @click="() => notImplemented()"-->
    <!--    >-->
    <!--      <font-awesome-icon icon="link" color="#666" />-->
    <!--    </button>-->
  </div>
</template>
<style scoped lang="less"></style>
