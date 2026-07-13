<script setup lang="ts">
import { persistProjectSettings } from "@models/LoggedInUser";
import type { SelectedProject } from "@models/LoggedInUser";
import { computed, inject, onMounted, ref, useTemplateRef } from "vue";
import type { Ref } from "vue";
import CardTable from "@/components/CardTable.vue";
import type { CardTableRows } from "@/components/CardTableTypes";
import { DEFAULT_AUDIO_TAGS, DEFAULT_CAMERA_TAGS } from "@/consts";
import {
  displayLabelForClassificationLabel,
  getClassifications,
} from "@api/classificationsUtils.ts";
import HierarchicalTagSelect from "@/components/HierarchicalTagSelect.vue";
import { capitalize } from "@/utils";
import { currentSelectedProject } from "@models/provides";
import SectionCard from "@/components/SectionCard.vue";
import { BModal, BTooltip } from "bootstrap-vue-next";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";
import TwoStepActionButton from "@/components/TwoStepActionButton.vue";

const selectedProject = inject(currentSelectedProject) as Ref<SelectedProject>;
const customCameraTags = computed<string[]>(() => {
  if (selectedProject.value) {
    return (
      (localCameraTags.value.length && localCameraTags.value) ||
      selectedProject.value.settings?.tags ||
      DEFAULT_CAMERA_TAGS
    );
  }
  return DEFAULT_CAMERA_TAGS;
});

const localCameraTags = ref<string[]>([]);
localCameraTags.value = [...customCameraTags.value];

const customAudioTags = computed<string[]>(() => {
  if (selectedProject.value) {
    return (
      (localAudioTags.value.length && localAudioTags.value) ||
      selectedProject.value.settings?.audioTags ||
      DEFAULT_AUDIO_TAGS
    );
  }
  return DEFAULT_AUDIO_TAGS;
});
const localAudioTags = ref<string[]>([]);
localAudioTags.value = [...customAudioTags.value];

const currentProjectSettings = computed(() => {
  if (selectedProject.value) {
    return selectedProject.value.settings || {};
  }
  return {};
});
const persistGroupCameraTags = async () =>
  persistProjectSettings({
    ...currentProjectSettings.value,
    tags: localCameraTags.value,
  });

const removeCameraTag = async (tag: string) => {
  const currentTags = [...customCameraTags.value];
  const currentIndexOfTag = currentTags.indexOf(tag);
  currentTags.splice(currentIndexOfTag, 1);
  localCameraTags.value = currentTags;
  await persistGroupCameraTags();
};
const moveCameraTagUp = async (tag: string) => {
  const currentTags = [...customCameraTags.value];
  const currentIndexOfTag = currentTags.indexOf(tag);
  if (currentIndexOfTag > 0) {
    currentTags[currentIndexOfTag] = currentTags[currentIndexOfTag - 1];
    currentTags[currentIndexOfTag - 1] = tag;
  }
  localCameraTags.value = currentTags;
  await persistGroupCameraTags();
};
const moveCameraTagDown = async (tag: string) => {
  const currentTags = [...customCameraTags.value];
  const currentIndexOfTag = currentTags.indexOf(tag);
  if (currentIndexOfTag < currentTags.length - 1) {
    currentTags[currentIndexOfTag] = currentTags[currentIndexOfTag + 1];
    currentTags[currentIndexOfTag + 1] = tag;
  }
  localCameraTags.value = currentTags;
  await persistGroupCameraTags();
};
const addCameraTag = async (tag: string) => {
  if (!localCameraTags.value.includes(tag)) {
    localCameraTags.value.push(tag);
    await persistGroupCameraTags();
  }
};
const isFirstTagInCameraList = (tag: string) => {
  return customCameraTags.value.indexOf(tag) === 0;
};
const isLastTagInCameraList = (tag: string) => {
  return (
    customCameraTags.value.indexOf(tag) === customCameraTags.value.length - 1
  );
};

//
const persistGroupAudioTags = async () =>
  persistProjectSettings({
    ...currentProjectSettings.value,
    audioTags: localAudioTags.value,
  });

const removeAudioTag = async (tag: string) => {
  const currentTags = [...customAudioTags.value];
  const currentIndexOfTag = currentTags.indexOf(tag);
  currentTags.splice(currentIndexOfTag, 1);
  localAudioTags.value = currentTags;
  await persistGroupAudioTags();
};
const moveAudioTagUp = async (tag: string) => {
  const currentTags = [...customAudioTags.value];
  const currentIndexOfTag = currentTags.indexOf(tag);
  if (currentIndexOfTag > 0) {
    currentTags[currentIndexOfTag] = currentTags[currentIndexOfTag - 1];
    currentTags[currentIndexOfTag - 1] = tag;
  }
  localAudioTags.value = currentTags;
  await persistGroupAudioTags();
};
const moveAudioTagDown = async (tag: string) => {
  const currentTags = [...customAudioTags.value];
  const currentIndexOfTag = currentTags.indexOf(tag);
  if (currentIndexOfTag < currentTags.length - 1) {
    currentTags[currentIndexOfTag] = currentTags[currentIndexOfTag + 1];
    currentTags[currentIndexOfTag + 1] = tag;
  }
  localAudioTags.value = currentTags;
  await persistGroupAudioTags();
};
const addAudioTag = async (tag: string) => {
  if (!localAudioTags.value.includes(tag)) {
    localAudioTags.value.push(tag);
    await persistGroupAudioTags();
  }
};
const isFirstTagInAudioList = (tag: string) => {
  return customAudioTags.value.indexOf(tag) === 0;
};
const isLastTagInAudioList = (tag: string) => {
  return (
    customAudioTags.value.indexOf(tag) === customAudioTags.value.length - 1
  );
};

onMounted(async () => {
  await getClassifications();
});

const cameraTagTableItems = computed<CardTableRows<string>>(() => {
  return customCameraTags.value.map((tag: string) => ({
    tag: {
      value: capitalize(displayLabelForClassificationLabel(tag)),
      cellClasses: ["w-100"],
    },
    _moveUp: {
      value: tag,
    },
    _moveDown: {
      value: tag,
    },
    _deleteAction: {
      value: tag,
    },
  }));
});

const audioTagTableItems = computed<CardTableRows<string>>(() => {
  return customAudioTags.value.map((tag: string) => ({
    tag: {
      value: capitalize(displayLabelForClassificationLabel(tag, false, true)),
      cellClasses: ["w-100"],
    },
    _moveUp: {
      value: tag,
    },
    _moveDown: {
      value: tag,
    },
    _deleteAction: {
      value: tag,
    },
  }));
});

const resetCameraTags = async () => {
  localCameraTags.value = [...DEFAULT_CAMERA_TAGS];
  await persistGroupCameraTags();
};

const resetAudioTags = async () => {
  localAudioTags.value = [...DEFAULT_AUDIO_TAGS];
  await persistGroupAudioTags();
};

const showAddCameraTagModal = ref<boolean>(false);
const showAddAudioTagModal = ref<boolean>(false);

const pendingTag = ref<string[]>([]);

const addPendingCameraTag = async () => {
  if (pendingTag.value.length) {
    await addCameraTag(pendingTag.value[0]);
    pendingTag.value = [];
  }
};

const addPendingAudioTag = async () => {
  if (pendingTag.value.length) {
    await addAudioTag(pendingTag.value[0]);
    pendingTag.value = [];
  }
};

const reset = () => {
  pendingTag.value = [];
};

const pendingTagIsValid = computed<boolean>(() => {
  return (
    pendingTag.value.length !== 0 && pendingTag.value[0].trim().length !== 0
  );
});

// If there are no custom tags, display the defaultTags here in the default order.
// Add tag.  delete tag, move tag up, move tag down, reset to defaults
</script>
<template>
  <div class="row mb-4 pb-2 pb-sm-0 mb-sm-4 mb-lg-5">
    <div class="col-lg-3">
      <h3 class="section-card-heading">Project tagging settings</h3>
      <p class="text-secondary">
        Manage the set of default tags that users see for this project when
        tagging either thermal video recordings or audio recordings.
      </p>
      <p class="text-secondary pb-1">
        Users can also add and pin their own most-used tags via each tagging
        interface.
      </p>
    </div>
    <div class="col-lg-9">
      <section-card>
        <template #header-title> Thermal video tags </template>
        <template #header-action>
          <div class="d-inline-flex gap-2 ms-2">
            <two-step-action-button
              :action="resetCameraTags"
              :btn-variant-class="`btn-outline-secondary`"
              :icon="null"
              :confirmation-label="`Reset thermal tags`"
              :label="`Reset`"
              :placement="`bottom`"
            />
            <button
              type="button"
              class="btn btn-secondary"
              @click.stop.prevent="showAddCameraTagModal = true"
            >
              Add
            </button>
          </div>
        </template>
        <card-table :items="cameraTagTableItems" compact :max-card-width="0">
          <template #_moveUp="{ cell }">
            <b-tooltip placement="left">
              <template #target>
                <button
                  class="btn btn-icon d-inline-flex justify-content-center"
                  @click.prevent="() => moveCameraTagUp(cell.value)"
                  :disabled="isFirstTagInCameraList(cell.value)"
                >
                  <material-symbol name="arrow_upward" size="1.25rem" />
                </button>
              </template>
              Move up
            </b-tooltip>
          </template>
          <template #_moveDown="{ cell }">
            <b-tooltip placement="left">
              <template #target>
                <button
                  class="btn btn-icon d-inline-flex justify-content-center"
                  @click.prevent="() => moveCameraTagDown(cell.value)"
                  :disabled="isLastTagInCameraList(cell.value)"
                  id="move-up"
                >
                  <material-symbol name="arrow_downward" size="1.25rem" />
                </button>
              </template>
              Move down
            </b-tooltip>
          </template>
          <template #_deleteAction="{ cell }">
            <two-step-action-button
              :action="() => removeCameraTag(cell.value)"
              icon="delete"
              :confirmation-label="`Delete tag`"
              tooltip-label="Delete"
            />
          </template>
        </card-table>
      </section-card>
    </div>
  </div>

  <div class="row mb-3">
    <div class="col-lg-3"></div>
    <div class="col-lg-9">
      <section-card>
        <template #header-title> Audio tags </template>
        <template #header-action>
          <div class="d-inline-flex gap-2 ms-2">
            <two-step-action-button
              :action="resetAudioTags"
              :btn-variant-class="`btn-outline-secondary`"
              :icon="null"
              :confirmation-label="`Reset audio tags`"
              :label="`Reset`"
              :placement="`bottom`"
            />
            <button
              type="button"
              class="btn btn-secondary"
              @click.stop.prevent="showAddAudioTagModal = true"
            >
              Add
            </button>
          </div>
        </template>
        <card-table :items="audioTagTableItems" compact :max-card-width="0">
          <template #_moveUp="{ cell }">
            <b-tooltip placement="left">
              <template #target>
                <button
                  class="btn btn-icon d-inline-flex justify-content-center"
                  @click.prevent="() => moveAudioTagUp(cell.value)"
                  :disabled="isFirstTagInAudioList(cell.value)"
                >
                  <material-symbol name="arrow_upward" size="1.25rem" />
                </button>
              </template>
              Move up
            </b-tooltip>
          </template>
          <template #_moveDown="{ cell }">
            <b-tooltip placement="left">
              <template #target>
                <button
                  class="btn btn-icon d-inline-flex justify-content-center"
                  @click.prevent="() => moveAudioTagDown(cell.value)"
                  :disabled="isLastTagInAudioList(cell.value)"
                >
                  <material-symbol name="arrow_downward" size="1.25rem" />
                </button>
              </template>
              Move down
            </b-tooltip>
          </template>
          <template #_deleteAction="{ cell }">
            <two-step-action-button
              :action="() => removeAudioTag(cell.value)"
              icon="delete"
              :confirmation-label="`Delete tag`"
              tooltip-label="Delete"
            />
          </template>
        </card-table>
      </section-card>
    </div>
  </div>

  <b-modal
    v-model="showAddCameraTagModal"
    title="Add project camera tag"
    @cancel="reset"
    @close="reset"
    @esc="reset"
    @ok="addPendingCameraTag"
    :ok-disabled="!pendingTagIsValid"
    ok-title="Add tag"
    ok-variant="secondary"
    cancel-variant="outline-secondary"
    centered
  >
    <hierarchical-tag-select
      class="flex-grow-1"
      v-model="pendingTag"
      :open-on-mount="false"
      :disabled-tags="customCameraTags"
    />
  </b-modal>
  <b-modal
    v-model="showAddAudioTagModal"
    title="Add project audio tag"
    @cancel="reset"
    @close="reset"
    @esc="reset"
    @ok="addPendingAudioTag"
    :ok-disabled="!pendingTagIsValid"
    ok-title="Add tag"
    ok-variant="secondary"
    cancel-variant="outline-secondary"
    centered
  >
    <hierarchical-tag-select
      class="flex-grow-1"
      v-model="pendingTag"
      :open-on-mount="false"
      :disabled-tags="customAudioTags"
    />
  </b-modal>
</template>
