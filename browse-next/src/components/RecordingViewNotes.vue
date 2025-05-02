<script setup lang="ts">
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import { computed, ref } from "vue";
import type { ApiRecordingTagResponse } from "@typedefs/api/tag";
import type { CardTableRows } from "@/components/CardTableTypes";
import { BModal } from "bootstrap-vue-next";
import { addRecordingNoteLabel, removeRecordingLabel } from "@api/Recording";
import { CurrentUser } from "@models/LoggedInUser";
import type { TagId } from "@typedefs/api/common";
import CardTable from "@/components/CardTable.vue";
import { DateTime } from "luxon";

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

const notes = computed<ApiRecordingTagResponse[]>(() => {
  if (props.recording) {
    return props.recording.tags
      .filter((tag) => tag.detail === "note")
      .sort((a, b) => {
        return new Date(a.createdAt) < new Date(b.createdAt) ? 1 : -1;
      });
  }
  return [];
});

const touchedNoteField = ref<boolean>(false);
const noteFieldIsValid = computed<boolean | null>(() => {
  if (!touchedNoteField.value && note.value.trim().length === 0) {
    return null;
  }
  return note.value.trim().length > 0 && note.value.trim().length < 1000;
});

const tableItems = computed<CardTableRows<ApiRecordingTagResponse | string>>(
  () => {
    return notes.value.map((tag: ApiRecordingTagResponse) => ({
      note: tag.comment || "",
      by: tag.taggerName || (tag.automatic ? "Cacophony AI" : "-"),
      when: DateTime.fromJSDate(new Date(tag.createdAt)).toRelative({
        style: "short",
      }) as string,
      _deleteAction: { value: tag, cellClasses: ["text-end"] },
      __sort: { value: new Date(tag.createdAt).getTime().toString() },
    }));
  },
);

const note = ref<string>("");
const addingNote = ref<boolean>(false);
const addingNoteInProgress = ref<boolean>(false);
const removingNoteInProgress = ref<boolean>(false);
const addNote = () => {
  addingNote.value = true;
};
const reset = () => {
  note.value = "";
  touchedNoteField.value = false;
  addingNote.value = false;
};

const removeNote = async (id: TagId) => {
  if (props.recording) {
    removingNoteInProgress.value = true;
    const removeNoteResponse = await removeRecordingLabel(
      props.recording.id,
      id,
    );
    if (removeNoteResponse.success) {
      emit("removed-recording-label", id);
    }
    removingNoteInProgress.value = false;
  }
};

const doAddNote = async () => {
  if (props.recording && note.value) {
    addingNoteInProgress.value = true;
    const addLabelResponse = await addRecordingNoteLabel(
      props.recording.id,
      note.value,
    );
    if (addLabelResponse.success && CurrentUser.value) {
      // Emit tag change event, patch upstream recording.
      emit("added-recording-label", {
        id: addLabelResponse.result.tagId,
        detail: "note",
        comment: note.value,
        confidence: 0.9,
        taggerName: CurrentUser.value.userName,
        taggerId: CurrentUser.value.id,
        createdAt: new Date().toISOString(),
      });
      note.value = "";
    }
    addingNote.value = false;
    addingNoteInProgress.value = false;
  }
};
</script>
<template>
  <div v-if="recording" class="recording-labels d-flex flex-column">
    <div class="d-flex align-items-center mt-2">
    <h2 class="recording-labels-title fs-6">Notes</h2>
      <div class="d-md-none d-flex justify-content-end flex-grow-1">
        <button
          type="button"
          class="btn btn-outline-secondary align-self-end add-label-btn d-flex align-items-center"
          @click="addNote"
        >
          <font-awesome-icon icon="plus" /><span> Add note</span>
        </button>
      </div>
    </div>
    <card-table :items="tableItems" compact>
      <template #_deleteAction="{ cell }">
        <button
          class="btn text-secondary"
          v-if="cell.value.id !== -1"
          @click.prevent="() => removeNote(cell.value.id)"
        >
          <font-awesome-icon icon="trash-can" />
        </button>
        <span v-else></span>
      </template>
      <template #card="{ card }">
        <div class="d-flex flex-row justify-content-between">
          <div>
            <div>
              <strong>{{ card.note }}</strong>
            </div>
            <div>{{ card.by }}</div>
            <div>{{ card.when }}</div>
          </div>
          <button
            v-if="
              card._deleteAction.value && card._deleteAction.value.id !== -1
            "
            class="btn text-secondary"
            @click.prevent="() => removeNote(card._deleteAction.value.id)"
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
        @click="addNote"
      >
        <font-awesome-icon icon="plus" /><span> Add note</span>
      </button>
    </div>
    <b-modal
      v-model="addingNote"
      centered
      title="Add a note to this recording"
      ok-title="Add note"
      :ok-disabled="!noteFieldIsValid"
      @cancel="reset"
      @close="reset"
      @esc="reset"
      @ok="doAddNote"
    >
      <b-form-textarea
        v-model="note"
        @blur="touchedNoteField = true"
        @focus="touchedNoteField = false"
        placeholder="Enter your note"
        :state="noteFieldIsValid"
        rows="3"
      ></b-form-textarea>
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
