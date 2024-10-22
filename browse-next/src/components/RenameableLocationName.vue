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
import { BFormInput } from "bootstrap-vue-next";
import type { StationId as LocationId } from "@typedefs/api/common";
import { changeLocationName } from "@api/Location.ts";
import { userIsProjectAdmin } from "@models/provides.ts";

const { location } = defineProps<{ location: ApiLocationResponse }>();

const editLocationField = useTemplateRef("input");
watch(editLocationField, (next) => {
  // Edit location field is mounted
  if (next) {
    (next as typeof BFormInput).focus();
  }
});
const clickedRename = () => {
  errorMessage.value = "";
  editingLocationName.value = true;
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
    payload: { newName: string; id: LocationId }
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
    const response = await changeLocationName(locationName.value, location.id);
    if (!response.success) {
      // Else show error
      errorMessage.value = response.result.messages[0];
    }
    savingLocation.value = false;
    emit("changed-location-name", {
      newName: locationName.value,
      id: location.id,
    });
  }
  locationName.value = "";
  editingLocationName.value = false;
};
const hasError = computed<boolean>(() => errorMessage.value !== "");
const exitEditMode = () => {
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
        ref="input"
        autofocus
        size="sm"
        placeholder="Enter the new name for this location"
        @blur="saveLocationName"
        @keyup.enter="saveLocationName"
        @keyup.esc="exitEditMode"
      />
      <strong
        v-else
        class="location-name"
        :class="{ 'needs-rename': !!location.needsRename }"
        >{{ location.name }}</strong
      >
      <b-spinner small v-if="savingLocation" class="ms-3" />
    </div>
    <div>
      <b-button
        variant="light"
        class="ms-2"
        size="sm"
        @click="clickedRename"
        v-if="isProjectAdmin"
      >
        <span
          class="rename-hint fs-7"
          @mouseover.stop.prevent="showRenameHint"
          @mouseout.stop.prevent="hideRenameHint"
          v-if="location.needsRename"
        >
          <font-awesome-icon
            icon="exclamation-triangle"
            size="sm"
            class="me-1"
            :color="'#e39768'"
          />
          <span class="me-2">Rename</span>
          <font-awesome-icon icon="pencil" size="sm" color="#666" />
        </span>
        <font-awesome-icon v-else icon="pencil" size="sm" color="#bbb" />
      </b-button>
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

<style scoped lang="less">
@media screen and (max-width: 575px) {
  .location-name.needs-rename {
    max-width: 230px;
  }
}
</style>
