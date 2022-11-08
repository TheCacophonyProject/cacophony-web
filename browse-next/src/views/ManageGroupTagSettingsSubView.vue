<script setup lang="ts">
import {
  currentSelectedGroup,
  persistGroupSettings,
} from "@models/LoggedInUser";
import { computed, onMounted, ref } from "vue";
import SimpleTable from "@/components/SimpleTable.vue";
import type { CardTableItems } from "@/components/CardTableTypes";
import { DEFAULT_TAGS } from "@/consts";
import type { CardTableValue } from "@/components/CardTableTypes";
import {
  displayLabelForClassificationLabel,
  getClassifications,
} from "@api/Classifications";
import HierarchicalTagSelect from "@/components/HierarchicalTagSelect.vue";
import { capitalize } from "@/utils";

// TODO - Also have the ability to define audio tags.

const customTags = computed<string[]>(() => {
  if (currentSelectedGroup.value) {
    return (
      (localTags.value.length && localTags.value) ||
      currentSelectedGroup.value.settings?.tags ||
      DEFAULT_TAGS
    );
  }
  return DEFAULT_TAGS;
});
const localTags = ref<string[]>([]);
localTags.value = [...customTags.value];

const currentGroupSettings = computed(() => {
  if (currentSelectedGroup.value) {
    return currentSelectedGroup.value.settings || {};
  }
  return {};
});
const persistGroupTags = async () =>
  persistGroupSettings({
    ...currentGroupSettings.value,
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

const tableItems = computed<CardTableItems>(() => {
  return customTags.value
    .map((tag: string, index: number) => ({
      tag: capitalize(displayLabelForClassificationLabel(tag)),
      _moveUp: {
        type: "button",
        icon: "arrow-up",
        color: "#444",
        disabled: () => index === 0,
        action: () => moveTagUp(tag),
      },
      _moveDown: {
        type: "button",
        icon: "arrow-up",
        rotate: 180,
        color: "#444",
        disabled: () => index === customTags.value.length - 1,
        action: () => moveTagDown(tag),
      },
      _deleteAction: {
        type: "button",
        icon: "trash-can",
        color: "#444",
        action: () => removeTag(tag),
      },
    }))
    .reduce(
      (acc: CardTableItems, item: Record<string, CardTableValue>) => {
        if (acc.headings.length === 0) {
          acc.headings = Object.keys(item);
        }
        acc.values.push(Object.values(item));
        return acc;
      },
      {
        headings: [],
        values: [],
      }
    );
});

const resetTags = async () => {
  localTags.value = [...DEFAULT_TAGS];
  await persistGroupTags();
};

const showAddTagModal = ref<boolean>(false);
const pendingTag = ref<string | null>(null);

const addPendingTag = async () => {
  if (pendingTag.value) {
    await addTag(pendingTag.value);
    pendingTag.value = null;
  }
};

// If there are no custom tags, display the defaultTags here in the default order.
// Add tag.  delete tag, move tag up, move tag down, reset to defaults
</script>
<template>
  <h1 class="h5 d-none d-md-block">Manage group tag settings</h1>
  <div class="d-flex flex-column flex-md-row justify-content-md-between mb-3">
    <p>
      Manage the set of default tags that users see for this group. Users can
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
  <simple-table :items="tableItems" compact />
  <b-modal
    v-model="showAddTagModal"
    title="Add group tag"
    @cancel="() => (pendingTag = null)"
    @ok="addPendingTag"
    ok-title="Add tag"
    ok-variant="secondary"
    cancel-variant="outline-secondary"
    centered
  >
    <hierarchical-tag-select
      class="flex-grow-1"
      @change="(tag) => (pendingTag = tag.label)"
      :open-on-mount="false"
      :disabled-tags="customTags"
      :selected-item="pendingTag"
    />
  </b-modal>
</template>
