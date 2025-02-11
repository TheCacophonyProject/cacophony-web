<script setup lang="ts">
import { persistProjectSettings } from "@models/LoggedInUser";
import type { SelectedProject } from "@models/LoggedInUser";
import { computed, inject, onMounted, ref } from "vue";
import type { Ref } from "vue";
import CardTable from "@/components/CardTable.vue";
import type { CardTableRows } from "@/components/CardTableTypes";
import { DEFAULT_AUDIO_TAGS, DEFAULT_CAMERA_TAGS } from "@/consts";
import {
  displayLabelForClassificationLabel,
  getClassifications,
} from "@api/Classifications";
import HierarchicalTagSelect from "@/components/HierarchicalTagSelect.vue";
import { capitalize } from "@/utils";
import { currentSelectedProject } from "@models/provides";

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

// If there are no custom tags, display the defaultTags here in the default order.
// Add tag.  delete tag, move tag up, move tag down, reset to defaults
</script>
<template>
  <h1 class="h5 d-none d-md-block">Project tagging settings</h1>
  <div>
    <p>
      Manage the set of default tags that users see for this project when
      tagging either camera recordings or bird recordings.<br />Users can also
      add and pin their own most-used tags via each tagging interface.
    </p>
  </div>
  <div
    class="d-flex flex-column flex-md-row justify-content-md-between mb-3 align-items-center"
  >
    <h2 class="h6">Camera tags</h2>
    <div class="d-flex align-items-end justify-content-end ms-md-5">
      <button
        type="button"
        class="btn btn-outline-secondary ms-2"
        @click.stop.prevent="showAddCameraTagModal = true"
      >
        Add
      </button>
      <button
        type="button"
        class="btn btn-outline-danger ms-2"
        @click.stop.prevent="resetCameraTags"
      >
        Reset
      </button>
    </div>
  </div>
  <card-table :items="cameraTagTableItems" compact :max-card-width="0">
    <template #_moveUp="{ cell }">
      <button
        class="btn"
        @click.prevent="() => moveCameraTagUp(cell.value)"
        :disabled="isFirstTagInCameraList(cell.value)"
      >
        <font-awesome-icon icon="arrow-up" />
      </button>
    </template>
    <template #_moveDown="{ cell }">
      <button
        class="btn"
        @click.prevent="() => moveCameraTagDown(cell.value)"
        :disabled="isLastTagInCameraList(cell.value)"
      >
        <font-awesome-icon icon="arrow-up" rotation="180" />
      </button>
    </template>
    <template #_deleteAction="{ cell }">
      <button class="btn" @click.prevent="() => removeCameraTag(cell.value)">
        <font-awesome-icon icon="trash-can" />
      </button>
    </template>
  </card-table>

  <div
    class="d-flex flex-column flex-md-row justify-content-md-between mb-3 align-items-center mt-5"
  >
    <h2 class="h6">Bird recording tags</h2>
    <div class="d-flex align-items-end justify-content-end ms-md-5">
      <button
        type="button"
        class="btn btn-outline-secondary ms-2"
        @click.stop.prevent="showAddAudioTagModal = true"
      >
        Add
      </button>
      <button
        type="button"
        class="btn btn-outline-danger ms-2"
        @click.stop.prevent="resetAudioTags"
      >
        Reset
      </button>
    </div>
  </div>
  <card-table :items="audioTagTableItems" compact :max-card-width="0">
    <template #_moveUp="{ cell }">
      <button
        class="btn"
        @click.prevent="() => moveAudioTagUp(cell.value)"
        :disabled="isFirstTagInAudioList(cell.value)"
      >
        <font-awesome-icon icon="arrow-up" />
      </button>
    </template>
    <template #_moveDown="{ cell }">
      <button
        class="btn"
        @click.prevent="() => moveAudioTagDown(cell.value)"
        :disabled="isLastTagInAudioList(cell.value)"
      >
        <font-awesome-icon icon="arrow-up" rotation="180" />
      </button>
    </template>
    <template #_deleteAction="{ cell }">
      <button class="btn" @click.prevent="() => removeAudioTag(cell.value)">
        <font-awesome-icon icon="trash-can" />
      </button>
    </template>
  </card-table>
  <b-modal
    v-model="showAddCameraTagModal"
    title="Add project camera tag"
    @cancel="reset"
    @close="reset"
    @esc="reset"
    @ok="addPendingCameraTag"
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
