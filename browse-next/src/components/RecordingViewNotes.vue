<script setup lang="ts">
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import { computed, inject, type Ref, ref } from "vue";
import type { ApiRecordingTagResponse } from "@typedefs/api/tag";
import type { CardTableRows } from "@/components/CardTableTypes";
import { BFormTextarea, BModal, BSpinner } from "bootstrap-vue-next";
import { ClientApi } from "@/api";
import { currentUser } from "@models/provides.ts";
import type { TagId } from "@typedefs/api/common";
import CardTable from "@/components/CardTable.vue";
import { DateTime } from "luxon";
import type { LoggedInUser } from "@models/LoggedInUser.ts";
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
  (e: "text-edit-mode-change", enabled: boolean): void;
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
  emit("text-edit-mode-change", true);
};
const reset = () => {
  note.value = "";
  touchedNoteField.value = false;
  addingNote.value = false;
  emit("text-edit-mode-change", false);
};

const removeNote = async (id: TagId) => {
  if (props.recording) {
    removingNoteInProgress.value = true;
    const removeNoteResponse = await ClientApi.Recordings.removeRecordingLabel(
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
    const addLabelResponse = await ClientApi.Recordings.addRecordingNoteLabel(
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
  <div
    v-if="recording"
    class="recording-notes position-relative flex-fill d-flex flex-column p-2 p-md-3"
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
          @click.prevent="() => removeNote(cell.value.id)"
        >
          <material-symbol name="delete" size="1.25rem" />
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
            class="btn btn-icon"
            @click.prevent="() => removeNote(card._deleteAction.value.id)"
          >
            <material-symbol name="delete" size="1.25rem" />
          </button>
        </div>
      </template>
    </card-table>
    <button
      type="button"
      class="add-note-btn btn btn-outline-secondary position-sticky align-self-end d-flex align-items-center"
      @click="addNote"
    >
      <material-symbol name="add" size="1.125rem" class="me-2" /><span>
        Add note</span
      >
    </button>
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
@import "../assets/less/breakpoints.less";

.add-note-btn {
  @media (max-width: @breakpoint-sm-max) {
    bottom: var(--cp-spacing-sm);
  }
  @media (min-width: @breakpoint-md) {
    bottom: var(--cp-spacing-md);
  }
}

.recording-notes {
  min-height: 100%;
}
</style>
