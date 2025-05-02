<script setup lang="ts">
import { persistProjectSettings } from "@models/LoggedInUser";
import type { SelectedProject } from "@models/LoggedInUser";
import { computed, inject, ref } from "vue";
import type { Ref } from "vue";
import CardTable from "@/components/CardTable.vue";
import type { CardTableRows } from "@/components/CardTableTypes";
import {
  DEFAULT_AUDIO_RECORDING_LABELS,
  DEFAULT_CAMERA_RECORDING_LABELS,
  COMMON_RECORDING_LABELS,
} from "@/consts";
import { currentSelectedProject } from "@models/provides";
import type { RecordingLabel } from "@typedefs/api/group";

const selectedProject = inject(currentSelectedProject) as Ref<SelectedProject>;

const customCameraLabels = computed<RecordingLabel[]>(() => {
  if (selectedProject.value) {
    return (
      (localCameraLabels.value.length && localCameraLabels.value) ||
      selectedProject.value.settings?.cameraLabels ||
      DEFAULT_CAMERA_RECORDING_LABELS
    );
  }
  return COMMON_RECORDING_LABELS;
});

const localCameraLabels = ref<RecordingLabel[]>([]);
localCameraLabels.value = [...customCameraLabels.value];

const customAudioLabels = computed<RecordingLabel[]>(() => {
  if (selectedProject.value) {
    return (
      (localAudioLabels.value.length && localAudioLabels.value) ||
      selectedProject.value.settings?.audioLabels ||
      DEFAULT_AUDIO_RECORDING_LABELS
    );
  }
  return DEFAULT_AUDIO_RECORDING_LABELS;
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
  localCameraLabels.value = [...DEFAULT_CAMERA_RECORDING_LABELS];
  await persistGroupCameraLabels();
};

const resetAudioLabels = async () => {
  localAudioLabels.value = [...DEFAULT_AUDIO_RECORDING_LABELS];
  await persistGroupAudioLabels();
};

const showAddCameraLabelModal = ref<boolean>(false);
const showAddAudioLabelModal = ref<boolean>(false);

const pendingLabel = ref<string>("");
const pendingDescription = ref<string>("");

const addPendingCameraLabel = async () => {
  if (pendingLabel.value.length) {
    await addCameraLabel(pendingLabel.value, pendingDescription.value);
    reset();
  }
};

const addPendingAudioLabel = async () => {
  if (pendingLabel.value.length) {
    await addAudioLabel(pendingLabel.value, pendingDescription.value);
    reset();
  }
};

const canReset = (
  labels: RecordingLabel[],
  defaultLabels: RecordingLabel[],
) => {
  if (labels.length !== defaultLabels.length) {
    return true;
  }
  for (let i = 0; i < labels.length; i++) {
    if (labels[i].value !== defaultLabels[i].value) {
      return true;
    }
  }
  return false;
};

const reset = () => {
  pendingLabel.value = "";
  pendingDescription.value = "";
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
  <hr class="mt-4" />
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
        :disabled="
          !canReset(localCameraLabels, DEFAULT_CAMERA_RECORDING_LABELS)
        "
        @click.stop.prevent="resetCameraLabels"
      >
        Reset
      </button>
    </div>
  </div>
  <card-table :items="cameraLabelTableItems" compact :max-card-width="575">
    <template #_deleteAction="{ cell }">
      <button class="btn" @click.prevent="() => removeCameraLabel(cell.value)">
        <font-awesome-icon icon="trash-can" />
      </button>
    </template>
    <template #card="{ card }">
      <div class="d-flex flex-row">
        <div class="d-flex flex-column flex-grow-1 me-3">
          <span
            ><strong>{{ card.label.value }}</strong></span
          >
          <span>{{ card.description.value }}</span>
        </div>
        <button
          class="btn"
          @click.prevent="() => removeCameraLabel(card.label.value)"
        >
          <font-awesome-icon icon="trash-can" />
        </button>
      </div>
    </template>
  </card-table>
  <hr class="mt-4" />
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
        :disabled="!canReset(localAudioLabels, DEFAULT_AUDIO_RECORDING_LABELS)"
      >
        Reset
      </button>
    </div>
  </div>
  <card-table :items="audioLabelTableItems" compact :max-card-width="575">
    <template #_deleteAction="{ cell }">
      <button class="btn" @click.prevent="() => removeAudioLabel(cell.value)">
        <font-awesome-icon icon="trash-can" />
      </button>
    </template>
    <template #card="{ card }">
      <div class="d-flex flex-row">
        <div class="d-flex flex-column flex-grow-1 me-3">
          <span
            ><strong>{{ card.label.value }}</strong></span
          >
          <span>{{ card.description.value }}</span>
        </div>
        <button
          class="btn"
          @click.prevent="() => removeCameraLabel(card.label.value)"
        >
          <font-awesome-icon icon="trash-can" />
        </button>
      </div>
    </template>
  </card-table>
  <b-modal
    v-model="showAddCameraLabelModal"
    title="Add project camera label"
    @cancel="reset"
    @close="reset"
    @esc="reset"
    @ok="addPendingCameraLabel"
    ok-title="Add label"
    ok-variant="secondary"
    :ok-disabled="!pendingLabel.length"
    cancel-variant="outline-secondary"
    centered
  >
    <label for="camera-label" class="form-label">Label</label>
    <b-form-input
      id="camera-label"
      v-model="pendingLabel"
      placeholder="enter a new label"
      class="mb-3"
    />
    <label for="camera-description" class="form-label"
      >Description (optional)</label
    >
    <b-form-input
      id="camera-description"
      v-model="pendingDescription"
      placeholder="describe the label usage in your project"
    />
  </b-modal>
  <b-modal
    v-model="showAddAudioLabelModal"
    title="Add project audio label"
    @cancel="reset"
    @close="reset"
    @esc="reset"
    @ok="addPendingAudioLabel"
    ok-title="Add label"
    :ok-disabled="!pendingLabel.length"
    ok-variant="secondary"
    cancel-variant="outline-secondary"
    centered
  >
    <label for="audio-label" class="form-label">Label</label>
    <b-form-input
      id="audio-label"
      v-model="pendingLabel"
      placeholder="enter a new label"
      class="mb-3"
    />
    <label for="audio-description" class="form-label"
      >Description (optional)</label
    >
    <b-form-input
      id="audio-description"
      v-model="pendingDescription"
      placeholder="describe the label usage in your project"
    />
  </b-modal>
</template>
