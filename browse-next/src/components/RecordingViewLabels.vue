<script setup lang="ts">
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import { computed, inject, type Ref, ref } from "vue";
import type { ApiRecordingTagResponse } from "@typedefs/api/tag";
import type { CardTableRows } from "@/components/CardTableTypes";
import {
  BAlert,
  BButton,
  BFormRadio,
  BModal,
  BSpinner,
} from "bootstrap-vue-next";
import { ClientApi } from "@/api";
import {
  type LoggedInUser,
  userIsAdminForCurrentSelectedProject,
} from "@models/LoggedInUser";
import type { TagId } from "@typedefs/api/common";
import CardTable from "@/components/CardTable.vue";
import { DateTime } from "luxon";
import type { RecordingLabel } from "@typedefs/api/group";
import { RecordingType } from "@typedefs/api/consts.ts";
import {
  CurrentProjectAudioLabels,
  CurrentProjectCameraLabels,
} from "@/helpers/Project.ts";
import { currentUser } from "@models/provides.ts";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";
const CurrentUser = inject(currentUser) as Ref<LoggedInUser | null>;
const props = withDefaults(
  defineProps<{
    recording?: ApiRecordingResponse | null;
  }>(),
  { recording: null },
);

const emit = defineEmits<{
  (e: "added-recording-label", label: ApiRecordingTagResponse): void;
  (e: "removed-recording-label", label: TagId): void;
}>();

const tags = computed<ApiRecordingTagResponse[]>(() => {
  if (props.recording) {
    return props.recording.tags.filter((tag) => tag.detail !== "note");
  }
  return [];
});

const tableItems = computed<CardTableRows<ApiRecordingTagResponse | string>>(
  () => {
    return tags.value.map((tag: ApiRecordingTagResponse) => ({
      label:
        labels.value.find((label) => label.value === tag.detail)?.text ||
        tag.detail,
      by: tag.taggerName || (tag.automatic ? "Cacophony AI" : "-"),
      when: DateTime.fromJSDate(new Date(tag.createdAt)).toRelative({
        style: "short",
      }) as string,
      _deleteAction: { value: tag, cellClasses: ["text-end"] },
      __sort: { value: new Date(tag.createdAt).getTime().toString() },
    }));
  },
);

const cameraLabels = computed<RecordingLabel[]>(() => {
  return CurrentProjectCameraLabels.value
    .map(({ text, description, value }) => ({
      text: text,
      description,
      value: (value || text).toLowerCase(),
    }))
    .filter((tag) => tag.value !== "note");
});
const audioLabels = computed<RecordingLabel[]>(() => {
  return CurrentProjectAudioLabels.value
    .map(
      ({ text, description, value }) =>
        ({
          text: text,
          description,
          value: (value || text).toLowerCase(),
        }) as RecordingLabel,
    )
    .filter((tag) => tag.value !== "note");
});

const labels = computed<RecordingLabel[]>(() => {
  if (recordingTypeIsAudio.value) {
    return audioLabels.value;
  }
  return cameraLabels.value;
});

const recordingTypeIsAudio = computed<boolean>(() => {
  if (props.recording) {
    return props.recording.type === RecordingType.Audio;
  }
  return false;
});

const unusedLabels = computed(() => {
  // Filter out labels that have already been added
  return labels.value.filter(
    (label) => !props.recording?.tags.some((tag) => tag.detail === label.value),
  );
});

const selectedLabel = ref<string>("");
const reset = () => {
  selectedLabel.value = "";
};
const labelToAdd = computed<RecordingLabel | null>(() => {
  return (
    (selectedLabel.value !== "" &&
      labels.value.find((label) => label.value === selectedLabel.value)) ||
    null
  );
});
const addingLabel = ref<boolean>(false);
const addingLabelInProgress = ref<boolean>(false);
const removingLabelInProgress = ref<boolean>(false);
const addLabel = () => {
  addingLabel.value = true;
};

const removeLabel = async (id: TagId) => {
  if (props.recording) {
    removingLabelInProgress.value = true;
    const removeLabelResponse = await ClientApi.Recordings.removeRecordingLabel(
      props.recording.id,
      id,
    );
    if (removeLabelResponse.success) {
      emit("removed-recording-label", id);
    }
    removingLabelInProgress.value = false;
  }
};

const doAddLabel = async () => {
  if (props.recording && selectedLabel.value) {
    addingLabelInProgress.value = true;
    const addLabelResponse = await ClientApi.Recordings.addRecordingLabel(
      props.recording.id,
      selectedLabel.value,
    );
    if (addLabelResponse.success && CurrentUser.value) {
      // Emit tag change event, patch upstream recording.
      emit("added-recording-label", {
        id: addLabelResponse.result.tagId,
        detail: selectedLabel.value,
        confidence: 0.9,
        taggerName: CurrentUser.value.userName,
        taggerId: CurrentUser.value.id,
        createdAt: new Date().toISOString(),
      });
      selectedLabel.value = "";
    }
    addingLabel.value = false;
    addingLabelInProgress.value = false;
  }
};
</script>
<template>
  <div
    v-if="recording"
    class="recording-labels position-relative flex-fill d-flex flex-column p-2 p-md-3"
  >
    <card-table
      :items="tableItems"
      compact
      class="flex-fill flex-grow-1"
      :class="{ 'p-1 p-md-0 mb-3': tableItems.length }"
    >
      <template #_deleteAction="{ cell }">
        <button
          class="btn btn-icon"
          v-if="cell.value.id !== -1"
          @click.prevent="() => removeLabel(cell.value.id)"
        >
          <material-symbol name="delete" size="1.25rem" />
        </button>
        <span v-else></span>
      </template>
      <template #card="{ card }">
        <div class="d-flex flex-row justify-content-between">
          <div>
            <div>
              <strong>{{ card.label }}</strong>
            </div>
            <div>{{ card.by }}</div>
            <div>{{ card.when }}</div>
          </div>
          <button
            v-if="
              card._deleteAction.value && card._deleteAction.value.id !== -1
            "
            class="btn btn-icon"
            @click.prevent="() => removeLabel(card._deleteAction.value.id)"
          >
            <material-symbol name="delete" size="1.25rem" />
          </button>
        </div>
      </template>
    </card-table>
    <button
      type="button"
      class="add-label-btn btn btn-outline-secondary position-sticky align-self-end d-flex align-items-center"
      @click="addLabel"
    >
      <material-symbol name="add" size="1.125rem" class="me-2" /><span>
        Add label</span
      >
    </button>
    <b-modal
      v-model="addingLabel"
      centered
      title="Label recording"
      @hide="reset"
    >
      <div class="d-flex flex-wrap gap-2">
        <div
          :key="index"
          class="text-nowrap"
          v-for="(label, index) in unusedLabels"
        >
          <b-form-radio
            v-model="selectedLabel"
            :value="label.value"
            name="add-label-radios"
            button
            button-variant="outline-secondary"
            >{{ label.text }}</b-form-radio
          >
        </div>
      </div>
      <b-alert
        :model-value="labelToAdd !== null"
        variant="light"
        class="mt-3 mb-0"
      >
        <div class="description d-flex">
          <material-symbol name="info" class="me-2" size="1.25rem" />
          <span v-if="labelToAdd && labelToAdd.description">
            {{ labelToAdd.description }}</span
          >
          <span v-else class="text-secondary">No description provided</span>
        </div>
      </b-alert>
      <template #footer>
        <b-button
          v-if="userIsAdminForCurrentSelectedProject"
          variant="link-primary"
          class="me-auto px-0"
        >
          <router-link
            :to="{ name: 'project-label-settings' }"
            class="text-decoration-none"
            >Manage labels</router-link
          >
        </b-button>
        <b-button variant="secondary" @click="addingLabel = false">
          Cancel
        </b-button>
        <b-button
          variant="primary"
          @click="doAddLabel"
          :disabled="labelToAdd === null"
        >
          Add label
        </b-button>
      </template>
    </b-modal>
  </div>
  <div
    v-else
    class="d-flex justify-content-center align-items-center loading p-5 h-100"
  >
    <b-spinner variant="secondary" />
  </div>
</template>
<style lang="less" scoped>
@import "../assets/less/breakpoints.less";

.add-label-btn {
  @media (max-width: @breakpoint-sm-max) {
    bottom: var(--cp-spacing-sm);
  }
  @media (min-width: @breakpoint-md) {
    bottom: var(--cp-spacing-md);
  }
}

.recording-labels {
  min-height: 100%;
}
</style>
