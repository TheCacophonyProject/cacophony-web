<script setup lang="ts">
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import { computed, ref } from "vue";
import type { ApiRecordingTagResponse } from "@typedefs/api/tag";
import type { CardTableRows } from "@/components/CardTableTypes";
import { BModal } from "bootstrap-vue-3";
import { addRecordingLabel, removeRecordingLabel } from "@api/Recording";
import { CurrentUser } from "@models/LoggedInUser";
import type { TagId } from "@typedefs/api/common";
import CardTable from "@/components/CardTable.vue";
import { DateTime } from "luxon";

const { recording } = defineProps<{
  recording?: ApiRecordingResponse | null;
}>();

const emit = defineEmits<{
  (e: "added-recording-label", label: ApiRecordingTagResponse): void;
  (e: "removed-recording-label", label: TagId): void;
}>();

const tableItems = computed<CardTableRows<ApiRecordingTagResponse | string>>(
  () => {
    return (recording?.tags || []).map((tag: ApiRecordingTagResponse) => ({
      label:
        labels.find((label) => label.value === tag.detail)?.text || tag.detail,
      by: tag.taggerName || (tag.automatic ? "Cacophony AI" : "-"),
      when: DateTime.fromJSDate(new Date(tag.createdAt)).toRelative({
        style: "short",
      }) as string,
      _deleteAction: { value: tag, cellClasses: ["text-end"] },
      __sort: { value: new Date(tag.createdAt).getTime().toString() },
    }));
  }
);

interface Label {
  text: string;
  value: string;
  description: string;
}

// TODO - Group-level defined labels created by group admin.
const labels: Label[] = [
  { text: "Cool", description: "Mark this as a cool or interesting recording" },
  {
    text: "Flag for review",
    value: "requires review",
    description:
      "Flag this recording for review due to low confidence IDing track(s)",
  },
  {
    text: "Animal in trap",
    value: "trapped in trap",
    description: "An animal is in a trap in this recording",
  },
  {
    text: "Animal interacted with trap",
    value: "interaction with trap",
    description: "An animal interacted with a trap in this recording",
  },
  {
    text: "Missed recording",
    description:
      "Missing an earlier recording that explains how the animal got to where it is now",
  },
  {
    text: "Missed track",
    description:
      "One or more animals do not have a corresponding track in this recording",
  },
  {
    text: "Multiple animals",
    description: "There is more than one animal in this recording",
  },
].map(({ text, description, value }) => ({
  text,
  description,
  value: (value || text).toLowerCase(),
}));

const unusedLabels = computed(() => {
  // Filter out labels that have already been added
  return labels.filter(
    (label) => !recording?.tags.some((tag) => tag.detail === label.value)
  );
});

const selectedLabel = ref<string>("");
const labelToAdd = computed<Label | null>(() => {
  return (
    (selectedLabel.value !== "" &&
      labels.find((label) => label.value === selectedLabel.value)) ||
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
  if (recording) {
    removingLabelInProgress.value = true;
    const removeLabelResponse = await removeRecordingLabel(recording.id, id);
    if (removeLabelResponse.success) {
      emit("removed-recording-label", id);
    }
    removingLabelInProgress.value = false;
  }
};

const doAddLabel = async () => {
  if (recording && selectedLabel.value) {
    addingLabelInProgress.value = true;
    const addLabelResponse = await addRecordingLabel(
      recording.id,
      selectedLabel.value
    );
    if (addLabelResponse.success) {
      // Emit tag change event, patch upstream recording.
      emit("added-recording-label", {
        id: addLabelResponse.result.tagId,
        detail: selectedLabel.value,
        confidence: 0.9,
        taggerName: CurrentUser.value?.userName,
        taggerId: CurrentUser.value?.id,
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
    <h2 class="recording-labels-title fs-6">Recording labels</h2>
    <card-table :items="tableItems" compact>
      <template #_deleteAction="{ cell }">
        <button
          class="btn text-secondary"
          @click.prevent="() => removeLabel(cell.value.id)"
        >
          <font-awesome-icon icon="trash-can" />
        </button>
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
            class="btn text-secondary"
            @click.prevent="() => removeLabel(card._deleteAction.value.id)"
          >
            <font-awesome-icon icon="trash-can" />
          </button>
        </div>
      </template>
    </card-table>
    <div class="d-flex justify-content-end flex-grow-1">
      <button
        type="button"
        class="btn btn-outline-secondary my-2 align-self-end add-label-btn d-flex align-items-center"
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
      @cancel="selectedLabel = ''"
      @ok="doAddLabel"
    >
      <b-form-radio
        v-for="(label, index) in unusedLabels"
        v-model="selectedLabel"
        :value="label.value"
        :key="index"
        name="add-label-radios"
        button
        class="text-nowrap mb-2 me-2 d-inline-block"
        button-variant="outline-secondary"
        >{{ label.text }}</b-form-radio
      >
      <div v-if="labelToAdd" class="alert alert-info mt-2 mb-0">
        {{ labelToAdd.description }}
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
    display: block;
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
