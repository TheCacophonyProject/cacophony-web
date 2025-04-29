<script setup lang="ts">
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import { computed, ref } from "vue";
import type { ApiRecordingTagResponse } from "@typedefs/api/tag";
import type { CardTableRows } from "@/components/CardTableTypes";
import { BModal } from "bootstrap-vue-next";
import { addRecordingLabel, removeRecordingLabel } from "@api/Recording";
import {
  CurrentUser,
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
        } as RecordingLabel),
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
    const removeLabelResponse = await removeRecordingLabel(
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
    const addLabelResponse = await addRecordingLabel(
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
  <div v-if="recording" class="recording-labels d-flex flex-column">
    <div class="d-flex align-items-center">
    <h2 class="recording-labels-title fs-6">Recording labels</h2>
      <div class="d-flex justify-content-end flex-grow-1 d-md-none">
        <button
          type="button"
          class="btn btn-outline-secondary align-self-end add-label-btn d-flex align-items-center"
          @click="addLabel"
        >
          <font-awesome-icon icon="plus" /><span> Add label</span>
        </button>
      </div>
    </div>
    <card-table :items="tableItems" compact>
      <template #_deleteAction="{ cell }">
        <button
          class="btn text-secondary"
          v-if="cell.value.id !== -1"
          @click.prevent="() => removeLabel(cell.value.id)"
        >
          <font-awesome-icon icon="trash-can" />
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
            class="btn text-secondary"
            @click.prevent="() => removeLabel(card._deleteAction.value.id)"
          >
            <font-awesome-icon icon="trash-can" />
          </button>
        </div>
      </template>
    </card-table>
    <div class="d-none d-md-flex justify-content-end flex-grow-1 my-2">
      <button
        type="button"
        class="btn btn-outline-secondary align-self-end add-label-btn d-flex align-items-center"
        @click="addLabel"
      >
        <font-awesome-icon icon="plus" /><span> Add label</span>
      </button>
    </div>
    <b-modal
      v-model="addingLabel"
      centered
      title="Label this recording"
      ok-title="Add label"
      :ok-disabled="labelToAdd === null"
      @cancel="reset"
      @close="reset"
      @esc="reset"
      @ok="doAddLabel"
    >
      <div
        :key="index"
        class="text-nowrap mb-2 me-2 d-inline-block"
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

      <div v-if="labelToAdd" class="alert alert-info mt-2 mb-0">
        {{ labelToAdd.description }}
      </div>
      <div v-if="userIsAdminForCurrentSelectedProject" class="mt-4">
        <router-link
          :to="{ name: 'project-label-settings' }"
          class="text-decoration-none"
          >Customise labels for this project</router-link
        >
      </div>
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
.recording-labels {
  height: 100%;
  @media screen and (min-width: 1041px) {
    padding: 0 0.5rem;
  }
}
.recording-labels-title {
  display: none;
  @media screen and (max-width: 1040px) {
    display: inline;
  }
}
.recording-label {
  background: white;
}
.delete-action {
  color: #bbb;
}
.add-label-btn {
  > span {
    transition: width 0.2s ease-in-out;
    width: 0;
    overflow: hidden;
    white-space: nowrap;
    display: inline-block;
    text-indent: 10px;
  }
  &:hover {
    > span {
      width: 80px;
    }
  }
}
</style>
