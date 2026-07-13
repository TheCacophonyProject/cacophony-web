<script setup lang="ts">
import { persistProjectSettings } from "@models/LoggedInUser";
import type { SelectedProject } from "@models/LoggedInUser";
import { computed, inject, ref } from "vue";
import type { Ref } from "vue";
import CardTable from "@/components/CardTable.vue";
import type { CardTableItem, CardTableRows } from "@/components/CardTableTypes";
import {
  DEFAULT_AUDIO_RECORDING_LABELS,
  DEFAULT_CAMERA_RECORDING_LABELS,
  COMMON_RECORDING_LABELS,
} from "@/consts";
import { currentSelectedProject } from "@models/provides";
import type { RecordingLabel } from "@typedefs/api/group";
import SectionCard from "@/components/SectionCard.vue";
import { BFormInput, BModal } from "bootstrap-vue-next";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";
import TwoStepActionButton from "@/components/TwoStepActionButton.vue";

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

const cameraLabelTableItems = computed<CardTableRows<string | RecordingLabel>>(
  () => {
    return customCameraLabels.value.map((label: RecordingLabel) => ({
      label: {
        value: label.text || label.value || "",
        cellClasses: ["w-25"],
      },
      description: {
        value: label.description || "",
        cellClasses: ["mw-100"],
      },
      _deleteAction: {
        value: label,
        cellClasses: ["text-end"],
      },
    }));
  },
);

const audioLabelTableItems = computed<CardTableRows<string | RecordingLabel>>(
  () => {
    return customAudioLabels.value.map((label: RecordingLabel) => ({
      label: {
        value: label.text || label.value || "",
        cellClasses: ["w-25"],
      },
      description: {
        value: label.description || "",
        cellClasses: ["mw-100"],
      },
      _deleteAction: {
        value: label,
        cellClasses: ["text-end"],
      },
    }));
  },
);

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
  <div class="row mb-4 pb-2 pb-sm-0 mb-sm-4 mb-lg-5">
    <div class="col-lg-3">
      <h3 class="section-card-heading">Project label settings</h3>
      <p class="text-secondary pb-1">
        Manage the set of default labels that users can apply to thermal video
        recordings or audio recordings, and what those labels mean in the
        context of your project.
      </p>
    </div>
    <div class="col-lg-9">
      <section-card>
        <template #header-title> Thermal video labels </template>
        <template #header-action>
          <div class="d-inline-flex gap-2 ms-2">
            <two-step-action-button
              :action="resetCameraLabels"
              :btn-variant-class="`btn-outline-secondary`"
              :icon="null"
              :confirmation-label="`Reset thermal labels`"
              :label="`Reset`"
              :placement="`bottom`"
              :disabled="
                !canReset(localCameraLabels, DEFAULT_CAMERA_RECORDING_LABELS)
              "
            />
            <button
              type="button"
              class="btn btn-secondary"
              @click.stop.prevent="showAddCameraLabelModal = true"
            >
              Add
            </button>
          </div>
        </template>
        <card-table
          :items="cameraLabelTableItems"
          compact
          :max-card-width="575"
        >
          <template #_deleteAction="{ cell }">
            <two-step-action-button
              :action="() => removeCameraLabel(cell.value)"
              icon="delete"
              :confirmation-label="`Delete label`"
              tooltip-label="Delete"
            />
          </template>
          <template
            #card="{
              card,
            }: {
              card: {
                label: CardTableItem<any>;
                description: CardTableItem<any>;
              };
            }"
          >
            <div class="d-flex flex-row">
              <div class="d-flex flex-column flex-grow-1 me-3">
                <span
                  ><strong>{{ card.label.value }}</strong></span
                >
                <span>{{ card.description.value }}</span>
              </div>

              <div
                class="d-inline-flex align-items-center justify-content-center my-auto"
              >
                <two-step-action-button
                  :action="() => removeCameraLabel(card.label.value)"
                  icon="delete"
                  :confirmation-label="`Delete label`"
                  tooltip-label="Delete"
                />
              </div>
            </div>
          </template>
        </card-table>
      </section-card>
    </div>
  </div>

  <div class="row mb-3">
    <div class="col-lg-3"></div>
    <div class="col-lg-9">
      <section-card>
        <template #header-title> Audio labels </template>
        <template #header-action>
          <div class="d-inline-flex gap-2 ms-2">
            <two-step-action-button
              :action="resetAudioLabels"
              :btn-variant-class="`btn-outline-secondary`"
              :icon="null"
              :confirmation-label="`Reset audio labels`"
              :label="`Reset`"
              :placement="`bottom`"
              :disabled="
                !canReset(localAudioLabels, DEFAULT_AUDIO_RECORDING_LABELS)
              "
            />
            <button
              type="button"
              class="btn btn-secondary"
              @click.stop.prevent="showAddAudioLabelModal = true"
            >
              Add
            </button>
          </div>
        </template>
        <card-table :items="audioLabelTableItems" compact :max-card-width="575">
          <template #_deleteAction="{ cell }">
            <two-step-action-button
              :action="() => removeAudioLabel(cell.value)"
              icon="delete"
              :confirmation-label="`Delete label`"
              tooltip-label="Delete"
            />
          </template>
          <template
            #card="{
              card,
            }: {
              card: {
                label: CardTableItem<any>;
                description: CardTableItem<any>;
              };
            }"
          >
            <div class="d-flex flex-row">
              <div class="d-flex flex-column flex-grow-1 me-3">
                <span
                  ><strong>{{ card.label.value }}</strong></span
                >
                <span>{{ card.description.value }}</span>
              </div>
              <div
                class="d-inline-flex align-items-center justify-content-center my-auto"
              >
                <two-step-action-button
                  :action="() => removeAudioLabel(card.label.value)"
                  icon="delete"
                  :confirmation-label="`Delete label`"
                  tooltip-label="Delete"
                />
              </div>
            </div>
          </template>
        </card-table>
      </section-card>
    </div>
  </div>

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
      placeholder="Enter a new label"
      class="mb-3"
    />
    <label for="camera-description" class="form-label"
      >Description (optional)</label
    >
    <b-form-input
      id="camera-description"
      v-model="pendingDescription"
      placeholder="Describe the label usage in your project"
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
      placeholder="Enter a new label"
      class="mb-3"
    />
    <label for="audio-description" class="form-label"
      >Description (optional)</label
    >
    <b-form-input
      id="audio-description"
      v-model="pendingDescription"
      placeholder="Describe the label usage in your project"
    />
  </b-modal>
</template>
