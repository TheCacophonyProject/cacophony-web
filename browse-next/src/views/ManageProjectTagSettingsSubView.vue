<script setup lang="ts">
import { persistProjectSettings } from "@models/LoggedInUser";
import type { SelectedProject } from "@models/LoggedInUser";
import { computed, inject, onMounted, ref } from "vue";
import type { Ref } from "vue";
import CardTable from "@/components/CardTable.vue";
import type { CardTableRows } from "@/components/CardTableTypes";
import { DEFAULT_TAGS } from "@/consts";
import {
  displayLabelForClassificationLabel,
  getClassifications,
} from "@api/Classifications";
import HierarchicalTagSelect from "@/components/HierarchicalTagSelect.vue";
import { capitalize } from "@/utils";
import { currentSelectedProject } from "@models/provides";

// TODO - Also have the ability to define audio tags.
const selectedProject = inject(currentSelectedProject) as Ref<SelectedProject>;
const customTags = computed<string[]>(() => {
  if (selectedProject.value) {
    return (
      (localTags.value.length && localTags.value) ||
      selectedProject.value.settings?.tags ||
      DEFAULT_TAGS
    );
  }
  return DEFAULT_TAGS;
});
const localTags = ref<string[]>([]);
localTags.value = [...customTags.value];

const currentProjectSettings = computed(() => {
  if (selectedProject.value) {
    return selectedProject.value.settings || {};
  }
  return {};
});
const persistGroupTags = async () =>
  persistProjectSettings({
    ...currentProjectSettings.value,
    tags: localTags.value,
  });

const removeTag = async (tag: string) => {
  const currentTags = [...customTags.value];
  const currentIndexOfTag = currentTags.indexOf(tag);
  currentTags.splice(currentIndexOfTag, 1);
  localTags.value = currentTags;
  await persistGroupTags();
};
const moveTagUp = async (tag: string) => {
  const currentTags = [...customTags.value];
  const currentIndexOfTag = currentTags.indexOf(tag);
  if (currentIndexOfTag > 0) {
    currentTags[currentIndexOfTag] = currentTags[currentIndexOfTag - 1];
    currentTags[currentIndexOfTag - 1] = tag;
  }
  localTags.value = currentTags;
  await persistGroupTags();
};
const moveTagDown = async (tag: string) => {
  const currentTags = [...customTags.value];
  const currentIndexOfTag = currentTags.indexOf(tag);
  if (currentIndexOfTag < currentTags.length - 1) {
    currentTags[currentIndexOfTag] = currentTags[currentIndexOfTag + 1];
    currentTags[currentIndexOfTag + 1] = tag;
  }
  localTags.value = currentTags;
  await persistGroupTags();
};
const addTag = async (tag: string) => {
  if (!localTags.value.includes(tag)) {
    localTags.value.push(tag);
    await persistGroupTags();
  }
};

onMounted(async () => {
  await getClassifications();
});

const isFirstTagInList = (tag: string) => {
  return customTags.value.indexOf(tag) === 0;
};
const isLastTagInList = (tag: string) => {
  return customTags.value.indexOf(tag) === customTags.value.length - 1;
};

const tableItems = computed<CardTableRows<string>>(() => {
  return customTags.value.map((tag: string) => ({
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

const resetTags = async () => {
  localTags.value = [...DEFAULT_TAGS];
  await persistGroupTags();
};

const showAddTagModal = ref<boolean>(false);
const pendingTag = ref<string[]>([]);

const addPendingTag = async () => {
  if (pendingTag.value.length) {
    await addTag(pendingTag.value[0]);
    pendingTag.value = [];
  }
};

// If there are no custom tags, display the defaultTags here in the default order.
// Add tag.  delete tag, move tag up, move tag down, reset to defaults
</script>
<template>
  <h1 class="h5 d-none d-md-block">Project tag settings</h1>
  <div class="d-flex flex-column flex-md-row justify-content-md-between mb-3">
    <p>
      Manage the set of default tags that users see for this project. Users can
      also add and pin their own most-used tags via the tagging interface.
    </p>
    <div class="d-flex align-items-end justify-content-end ms-md-5">
      <button
        type="button"
        class="btn btn-outline-secondary ms-2"
        @click.stop.prevent="showAddTagModal = true"
      >
        Add
      </button>
      <button
        type="button"
        class="btn btn-outline-danger ms-2"
        @click.stop.prevent="resetTags"
      >
        Reset
      </button>
    </div>
  </div>
  <card-table :items="tableItems" compact :max-card-width="0">
    <template #_moveUp="{ cell }">
      <button
        class="btn"
        @click.prevent="() => moveTagUp(cell.value)"
        :disabled="isFirstTagInList(cell.value)"
      >
        <font-awesome-icon icon="arrow-up" />
      </button>
    </template>
    <template #_moveDown="{ cell }">
      <button
        class="btn"
        @click.prevent="() => moveTagDown(cell.value)"
        :disabled="isLastTagInList(cell.value)"
      >
        <font-awesome-icon icon="arrow-up" rotation="180" />
      </button>
    </template>
    <template #_deleteAction="{ cell }">
      <button class="btn" @click.prevent="() => removeTag(cell.value)">
        <font-awesome-icon icon="trash-can" />
      </button>
    </template>
  </card-table>
  <b-modal
    v-model="showAddTagModal"
    title="Add group tag"
    @cancel="() => (pendingTag = [])"
    @ok="addPendingTag"
    ok-title="Add tag"
    ok-variant="secondary"
    cancel-variant="outline-secondary"
    centered
  >
    <hierarchical-tag-select
      class="flex-grow-1"
      v-model="pendingTag"
      :open-on-mount="false"
      :disabled-tags="customTags"
    />
  </b-modal>
</template>
