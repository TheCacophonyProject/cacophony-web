<script setup lang="ts">
import { persistProjectSettings } from "@models/LoggedInUser";
import type { SelectedProject } from "@models/LoggedInUser";
import { computed, inject, ref } from "vue";
import type { Ref } from "vue";
import CardTable from "@/components/CardTable.vue";
import type { CardTableRows } from "@/components/CardTableTypes";
import {
  AudioRecordingLabels,
  CameraRecordingLabels,
  CommonRecordingLabels,
} from "@/consts";
import { currentSelectedProject } from "@models/provides";
import type { RecordingLabel } from "@typedefs/api/group";

const selectedProject = inject(currentSelectedProject) as Ref<SelectedProject>;

const customCameraLabels = computed<RecordingLabel[]>(() => {
  if (selectedProject.value) {
    return (
      (localCameraLabels.value.length && localCameraLabels.value) ||
      selectedProject.value.settings?.cameraLabels ||
      CameraRecordingLabels
    );
  }
  return CommonRecordingLabels;
});

const localCameraLabels = ref<RecordingLabel[]>([]);
localCameraLabels.value = [...customCameraLabels.value];

const customAudioLabels = computed<RecordingLabel[]>(() => {
  if (selectedProject.value) {
    return (
      (localAudioLabels.value.length && localAudioLabels.value) ||
      selectedProject.value.settings?.audioLabels ||
      AudioRecordingLabels
    );
  }
  return AudioRecordingLabels;
});
const localAudioLabels = ref<RecordingLabel[]>([]);
localAudioLabels.value = [...customAudioLabels.value];

const currentProjectSettings = computed(() => {
  if (selectedProject.value) {
    return selectedProject.value.settings || {};
  }
  return {};
});
const persistGroupCameraLabels = async () =>
  persistProjectSettings({
    ...currentProjectSettings.value,
    cameraLabels: localCameraLabels.value,
  });

const removeCameraLabel = async (label: RecordingLabel) => {
  const currentLabels = [...customCameraLabels.value];
  const currentIndexOfLabel = currentLabels.indexOf(label);
  currentLabels.splice(currentIndexOfLabel, 1);
  localCameraLabels.value = currentLabels;
  await persistGroupCameraLabels();
};
const addCameraLabel = async (label: string, description: string) => {
  if (
    !localCameraLabels.value
      .map((label) => label.value || label.text)
      .includes(label)
  ) {
    localCameraLabels.value.push({
      text: label,
      value: label,
      description,
    });
    await persistGroupCameraLabels();
  }
};

//
const persistGroupAudioLabels = async () =>
  persistProjectSettings({
    ...currentProjectSettings.value,
    audioLabels: localAudioLabels.value,
  });

const removeAudioLabel = async (label: RecordingLabel) => {
  const currentLabels = [...customAudioLabels.value];
  const currentIndexOfLabel = currentLabels.indexOf(label);
  currentLabels.splice(currentIndexOfLabel, 1);
  localAudioLabels.value = currentLabels;
  await persistGroupAudioLabels();
};

const addAudioLabel = async (label: string, description: string) => {
  if (
    !localAudioLabels.value
      .map((label) => label.value || label.text)
      .includes(label)
  ) {
    localAudioLabels.value.push({
      text: label,
      value: label,
      description,
    });
    await persistGroupAudioLabels();
  }
};

const cameraLabelTableItems = computed<CardTableRows<string>>(() => {
  return customCameraLabels.value.map((label: RecordingLabel) => ({
    label: {
      value: label.text || label.value,
    },
    description: {
      value: label.description || "",
      cellClasses: ["w-100"],
    },
    _deleteAction: {
      value: label,
    },
  }));
});

const audioLabelTableItems = computed<CardTableRows<string>>(() => {
  return customAudioLabels.value.map((label: RecordingLabel) => ({
    label: {
      value: label.text || label.value,
    },
    description: {
      value: label.description || "",
      cellClasses: ["w-100"],
    },
    _deleteAction: {
      value: label,
    },
  }));
});

const resetCameraLabels = async () => {
  localCameraLabels.value = [...CameraRecordingLabels];
  await persistGroupCameraLabels();
};

const resetAudioLabels = async () => {
  localAudioLabels.value = [...AudioRecordingLabels];
  await persistGroupAudioLabels();
};

const showAddCameraLabelModal = ref<boolean>(false);
const showAddAudioLabelModal = ref<boolean>(false);

const pendingLabel = ref<string>("");
const pendingDescription = ref<string>("");

const addPendingCameraLabel = async () => {
  if (pendingLabel.value.length) {
    await addCameraLabel(pendingLabel.value, pendingDescription.value);
    pendingLabel.value = "";
    pendingDescription.value = "";
  }
};

const addPendingAudioLabel = async () => {
  if (pendingLabel.value.length) {
    await addAudioLabel(pendingLabel.value, pendingDescription.value);
    pendingLabel.value = "";
    pendingDescription.value = "";
  }
};

// If there are no custom tags, display the defaultTags here in the default order.
// Add tag.  delete tag, move tag up, move tag down, reset to defaults
</script>
<template>
  <h1 class="h5 d-none d-md-block">Project label settings</h1>
  <div>
    <p>
      Manage the set of default labels that users can apply to camera recordings
      or bird recordings, and what those labels mean in the context of your
      project.
    </p>
  </div>
  <div
    class="d-flex flex-column flex-md-row justify-content-md-between mb-3 align-items-center"
  >
    <h2 class="h6">Camera labels</h2>
    <div class="d-flex align-items-end justify-content-end ms-md-5">
      <button
        type="button"
        class="btn btn-outline-secondary ms-2"
        @click.stop.prevent="showAddCameraLabelModal = true"
      >
        Add
      </button>
      <button
        type="button"
        class="btn btn-outline-danger ms-2"
        @click.stop.prevent="resetCameraLabels"
      >
        Reset
      </button>
    </div>
  </div>
  <card-table :items="cameraLabelTableItems" compact :max-card-width="0">
    <template #_deleteAction="{ cell }">
      <button class="btn" @click.prevent="() => removeCameraLabel(cell.value)">
        <font-awesome-icon icon="trash-can" />
      </button>
    </template>
  </card-table>

  <div
    class="d-flex flex-column flex-md-row justify-content-md-between my-3 align-items-center"
  >
    <h2 class="h6">Bird recording labels</h2>
    <div class="d-flex align-items-end justify-content-end ms-md-5">
      <button
        type="button"
        class="btn btn-outline-secondary ms-2"
        @click.stop.prevent="showAddAudioLabelModal = true"
      >
        Add
      </button>
      <button
        type="button"
        class="btn btn-outline-danger ms-2"
        @click.stop.prevent="resetAudioLabels"
      >
        Reset
      </button>
    </div>
  </div>
  <card-table :items="audioLabelTableItems" compact :max-card-width="0">
    <template #_deleteAction="{ cell }">
      <button class="btn" @click.prevent="() => removeAudioLabel(cell.value)">
        <font-awesome-icon icon="trash-can" />
      </button>
    </template>
  </card-table>
  <b-modal
    v-model="showAddCameraLabelModal"
    title="Add group camera tag"
    @cancel="
      () => {
        pendingLabel = '';
        pendingDescription = '';
      }
    "
    @ok="addPendingCameraLabel"
    ok-title="Add tag"
    ok-variant="secondary"
    cancel-variant="outline-secondary"
    centered
  >
    <input type="text" v-model="pendingLabel" placeholder="label" />
    <input type="text" v-model="pendingDescription" placeholder="description" />
  </b-modal>
  <b-modal
    v-model="showAddAudioLabelModal"
    title="Add group audio tag"
    @cancel="
      () => {
        pendingLabel = '';
        pendingDescription = '';
      }
    "
    @ok="addPendingAudioLabel"
    ok-title="Add tag"
    ok-variant="secondary"
    cancel-variant="outline-secondary"
    centered
  >
    <input type="text" v-model="pendingLabel" placeholder="label" />
    <input type="text" v-model="pendingDescription" placeholder="description" />
  </b-modal>
</template>
