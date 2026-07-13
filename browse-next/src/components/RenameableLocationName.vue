<script setup lang="ts">
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import {
  computed,
  type ComputedRef,
  inject,
  ref,
  useTemplateRef,
  watch,
} from "vue";
import {
  BAlert,
  BBadge,
  BButton,
  BInput,
  BSpinner,
  BTooltip,
} from "bootstrap-vue-next";
import type { StationId as LocationId } from "@typedefs/api/common";
import { userIsProjectAdmin } from "@models/provides.ts";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";
import { ClientApi } from "@/api";

const { location } = defineProps<{ location: ApiLocationResponse }>();
const editLocationField = ref<typeof BInput | null>(null);
watch(editLocationField, (next: typeof BInput | null) => {
  // Edit location field is mounted
  if (next) {
    next.focus();
    (next.$el as HTMLInputElement).select();
  }
});
const clickedRename = (e: MouseEvent) => {
  errorMessage.value = "";
  editingLocationName.value = true;
  locationName.value = location.name;
};
const editingLocationName = ref<boolean>(false);
const savingLocation = ref<boolean>(false);
const locationName = ref<string>("");
const errorMessage = ref<string>("");

const emit = defineEmits<{
  (e: "show-rename-hint", el: HTMLSpanElement): void;
  (e: "hide-rename-hint"): void;
  (
    e: "changed-location-name",
    payload: { newName: string; id: LocationId },
  ): void;
}>();
const showRenameHint = (e: MouseEvent) => {
  emit("show-rename-hint", e.target as HTMLSpanElement);
};
const hideRenameHint = () => {
  emit("hide-rename-hint");
};

const saveLocationName = async () => {
  if (
    locationName.value.trim().length !== 0 &&
    locationName.value !== location.name
  ) {
    savingLocation.value = true;
    const response = await ClientApi.Locations.changeLocationName(
      location.id,
      locationName.value,
    );
    savingLocation.value = false;
    if (!response.success) {
      // Else show error
      errorMessage.value = response.result.messages[0];
      locationName.value = "";
    } else {
      emit("changed-location-name", {
        newName: locationName.value,
        id: location.id,
      });
    }
  }
  locationName.value = "";
  editingLocationName.value = false;
};
const hasError = computed<boolean>(() => errorMessage.value !== "");
const exitEditMode = (event: MouseEvent) => {
  if (
    event.relatedTarget &&
    (event.relatedTarget as HTMLElement).tagName === "BUTTON"
  ) {
    return;
  }
  locationName.value = "";
  editingLocationName.value = false;
};
const isProjectAdmin = inject(userIsProjectAdmin) as ComputedRef<boolean>;
</script>

<template>
  <div class="d-flex align-items-start justify-content-between flex-fill">
    <div class="d-flex align-items-center flex-fill">
      <b-input
        v-if="editingLocationName"
        v-model="locationName"
        ref="editLocationField"
        autofocus
        size="sm"
        placeholder="Enter the new name for this location"
        class="me-1 me-sm-2 mb-2"
        @blur="exitEditMode"
        @keyup.enter="saveLocationName"
        @keyup.esc="exitEditMode"
      />
      <h4
        v-else
        class="location-name"
        :class="[
          'h4 me-2',
          { 'needs-rename text-break': !!location.needsRename },
        ]"
      >
        {{ location.name }}
      </h4>
      <b-spinner small v-if="savingLocation" class="ms-3" />
    </div>
    <div class="d-flex align-items-center" v-if="!editingLocationName">
      <span
        class="d-flex align-items-center"
        @mouseover.stop.prevent="showRenameHint"
        @mouseout.stop.prevent="hideRenameHint"
        v-if="location.needsRename"
      >
        <b-badge
          variant="warning"
          class="rename-hint d-flex flex-row align-items-center me-2"
        >
          <material-symbol name="warning" filled size="1rem" class="me-1" />
          Rename
        </b-badge>
      </span>
      <b-tooltip>
        <template #target>
          <b-button
            variant="light"
            class="btn-icon"
            size="sm"
            id="rename"
            aria-label="Rename location"
            @click="clickedRename"
            v-if="isProjectAdmin"
          >
            <material-symbol name="edit" size="1.125rem" />
          </b-button>
        </template>
        Rename location
      </b-tooltip>
    </div>
    <div v-else class="d-flex gap-1 gap-sm-2">
      <b-button
        variant="outline-secondary"
        size="sm"
        @click.stop.prevent="exitEditMode"
        class="d-flex"
      >
        <material-symbol name="close" size="1.25rem" class="d-sm-none" />
        <span class="d-none d-sm-inline">Cancel</span>
      </b-button>
      <b-button
        variant="outline-secondary"
        @click.stop.prevent="saveLocationName"
        size="sm"
        class="d-flex"
      >
        <material-symbol name="check" size="1.25rem" class="d-sm-none" />
        <span class="d-none d-sm-inline">Save</span></b-button
      >
    </div>
  </div>
  <b-alert
    variant="warning"
    v-model="hasError"
    dismissible
    @close="errorMessage = ''"
    class="mt-2"
    >{{ errorMessage }}</b-alert
  >
</template>

<style scoped lang="less"></style>
