<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { Classification } from "@typedefs/api/trackTag";
import { onClickOutside } from "@vueuse/core";

const {
  options,
  disabled = false,
  multiselect = false,
  canBePinned = false,
  pinnedItems = [],
  placeholder = "Search",
  selectedItem,
  openOnMount = true,
  disabledTags = [],
} = defineProps<{
  options: Classification;
  disabled: boolean;
  disabledTags?: string[];
  multiselect: boolean;
  placeholder: string;
  canBePinned: boolean;
  pinnedItems: string[];
  selectedItem?: string;
  openOnMount?: boolean;
}>();

// Elements
const optionsList = ref<HTMLDivElement>();
const optionsContainerRef = ref<HTMLDivElement>();
const inputRef = ref<HTMLInputElement>();

const singleSelection = ref<Classification | null>(null);
const multipleSelections = ref<Classification[]>([]);

const currPath = ref<string[]>([]);
// Search
const searchTerm = ref("");
const showOptions = ref<boolean>(false);

const emit = defineEmits<{
  (e: "change", value: Classification | Classification[] | null): void;
  (e: "pin", value: Classification | Classification[] | null): void;
  (e: "options-change"): void; // When the option changes, the height changes, and we may want to let the parent element know about this.
  (e: "deselected"): void;
}>();

const openSelect = () => {
  // TODO: Make sure when the select opens, it scrolls into view enough to see the bottom of it.

  showOptions.value = true;
  searchTerm.value = "";
  setToPath("all");
  if (!inputRef.value) {
    nextTick(() => {
      inputRef.value?.focus();
    });
  } else {
    inputRef.value?.focus();
  }
  emit("options-change");
};

const closeSelect = () => {
  showOptions.value = false;
  searchTerm.value = "";
  setToPath("all");
  emit("options-change");
};

watch(
  () => selectedItem,
  (nextLabel) => {
    if (nextLabel) {
      showOptions.value = false;
      searchTerm.value = (nextLabel as string) || "";
      addSearchTermOnSubmit();
      currPath.value =
        optionsMap.value.get((nextLabel as string).toLowerCase())?.path || [];
    } else {
      singleSelection.value = null;
    }
  }
);

watch(
  () => options,
  () => {
    if (selectedItem && pinnedItems.includes(selectedItem)) {
      showOptions.value = false;
      searchTerm.value = (selectedItem as string) || "";
      addSearchTermOnSubmit();
      currPath.value =
        optionsMap.value.get(selectedItem.toLowerCase())?.path || [];
    } else if (openOnMount) {
      openSelect();
    }
  }
);

// Breadth-first search for options matching the search term and "label" property, and "children" as nodes.
const searchOptions = (options: Classification[]) => {
  return options.reduce((acc: Classification[], option: Classification) => {
    if (
      option.label.toLowerCase().includes(searchTerm.value.toLowerCase()) ||
      (option.display &&
        option.display.toLowerCase().includes(searchTerm.value.toLowerCase()))
    ) {
      acc.push(option);
    }
    if (option.children) {
      acc.push(...searchOptions(option.children));
    }
    return acc;
  }, []);
};

interface PathOption {
  display: string;
  label: string;
  path: string[];
}

const optionsMap = computed<Map<string, PathOption>>(
  (): Map<string, PathOption> => {
    const map = new Map();
    const navigate = (node: Classification, path: string[]) => {
      map.set(node.label, {
        display: node.display ?? node.label,
        label: node.label,
        path: [...path, node.label],
      });
      if (node.children) {
        node.children.forEach((child) => {
          navigate(child, [...path, node.label]);
        });
      }
    };
    navigate(options, []);
    return map;
  }
);

const hasSelection = computed<boolean>(() => {
  return multipleSelections.value.length !== 0;
});

const addSelectedOption = (option: Classification) => {
  if (option.label === "No results") {
    return;
  }
  if (!multiselect && singleSelection.value !== option) {
    singleSelection.value = option;
    emit("change", singleSelection.value);
  } else if (!multipleSelections.value.includes(option)) {
    multipleSelections.value.push(option);
    emit("change", multipleSelections.value);
  }
  closeSelect();
};

const pinCurrentSelection = (_option: Classification) => {
  if (singleSelection.value) {
    emit("pin", singleSelection.value);
  }
};

const addSearchTermOnSubmit = () => {
  if (searchTerm.value && searchTerm.value.trim() !== "") {
    const option = optionsMap.value.get(searchTerm.value.toLowerCase());
    if (option) {
      addSelectedOption(option);
    } else if (displayedOptions.value.length === 1) {
      addSelectedOption(displayedOptions.value[0]);
    }
  }
};

const handleEscapeDismiss = () => {
  closeSelect();
  (inputRef.value as HTMLInputElement).blur();
  emit("deselected");
};

const removeSelectedOption = (option: Classification) => {
  if (!multiselect) {
    singleSelection.value = null;
  } else {
    multipleSelections.value = multipleSelections.value.filter(
      (o) => o !== option
    );
  }
};

const singleSelectionIsPinned = computed<boolean>(
  () =>
    singleSelection.value !== null &&
    pinnedItems.includes(singleSelection.value.label)
);

const setToPath = (label: string) => {
  searchTerm.value = "";
  currPath.value =
    (label && optionsMap.value.get(label.toLowerCase())?.path) || [] || [];
};

const displayedOptions = computed<Classification[]>(() => {
  if (searchTerm.value && searchTerm.value.trim()) {
    // Get all the options that relate to the search term.
    const searchResults = searchOptions(options.children as Classification[]);
    if (searchResults.length !== 0) {
      return searchResults;
    } else {
      return [{ label: "No results" }];
    }
  } else {
    let node = options;
    for (const pathComponent of currPath.value.slice(1)) {
      const foundNode = node.children?.find(
        ({ label }) => label === pathComponent
      );
      if (!foundNode) {
        break;
      } else {
        node = foundNode;
      }
    }
    return node.children || [];
  }
});

watch(
  () => displayedOptions.value.length,
  () => emit("options-change")
);

onClickOutside(optionsContainerRef, () => {
  closeSelect();
  emit("deselected");
});
defineExpose({
  open: openSelect,
});
</script>
<template>
  <div ref="optionsContainerRef" class="options-container">
    <div
      class="input-container d-flex flex-column fs-6"
      :class="{ open: showOptions }"
    >
      <input
        v-if="multiselect || showOptions || (!multiselect && !singleSelection)"
        @keyup.enter.stop.prevent="addSearchTermOnSubmit"
        @keydown.esc.stop.prevent="handleEscapeDismiss"
        @focus="openSelect"
        type="text"
        ref="inputRef"
        v-model="searchTerm"
        :placeholder="placeholder"
        :disabled="disabled"
      />
      <div
        v-if="!showOptions && singleSelection"
        class="d-flex single-selection align-items-center"
      >
        <button
          type="button"
          class="btn selected-option text-start text-capitalize flex-grow-1 px-0"
          @click="openSelect"
        >
          {{ singleSelection.display || singleSelection.label }}
        </button>
        <button
          type="button"
          class="btn btn-outline-secondary ms-2 pin-btn"
          :class="{ pinned: singleSelectionIsPinned }"
          v-if="canBePinned"
        >
          <font-awesome-icon
            icon="thumbtack"
            @click.prevent="pinCurrentSelection"
          />
        </button>
      </div>
      <div
        v-else-if="multiselect && hasSelection"
        class="selected-container d-flex flex-wrap px-2 pt-2"
      >
        <button
          type="button"
          class="selected-option btn text-capitalize ps-2 pe-0 py-0 mb-2 d-flex justify-content-center align-items-center"
          :key="option.label"
          v-for="option in multipleSelections"
        >
          {{ option.display || option.label }}
          <span
            class="selected-option-icon d-flex justify-content-center align-items-center ms-1 p-1"
            @click="() => removeSelectedOption(option)"
          >
            <font-awesome-icon icon="times" />
          </span>
        </button>
      </div>
    </div>
    <div v-show="showOptions" class="options-display-container fs-6">
      <div v-show="!searchTerm" class="options-path-container">
        <div
          class="options-path"
          :key="path"
          v-for="path in currPath"
          @click="() => setToPath(path)"
        >
          {{ path }}
        </div>
      </div>
      <div
        ref="optionsList"
        class="options-list-container d-flex justify-content-between flex-column"
      >
        <div
          class="options-list-item d-flex justify-content-between"
          :key="option.label"
          v-for="option in displayedOptions"
        >
          <button
            class="options-list-label btn text-start text-capitalize"
            v-if="option.label !== 'No results'"
            @click.prevent="addSelectedOption(option)"
            :disabled="disabledTags.includes(option.label)"
          >
            {{ option.display || option.label }}
          </button>
          <div v-else class="options-list-label no-results btn">
            {{ option.label }}
          </div>
          <button
            id="child-button"
            class="options-list-child align-items-center d-flex justify-content-center btn"
            v-if="option.children"
            @click="() => setToPath(option.label)"
          >
            <font-awesome-icon
              id="child-button-icon"
              icon="angle-double-right"
              class="fa-1x"
            />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
<style lang="less" scoped>
.options-path:hover {
  transition: color 0.1s ease-in-out;
  color: rgb(46, 46, 46);
}

.options-path-container {
  display: flex;
  width: 100%;
  height: 1.5em;
  padding-left: 0.4em;
  color: rgb(128, 128, 128);
  background: rgb(248, 248, 248);
  border: 1px solid #ccc;
  border-top: 0;
  border-bottom: 0;

  :last-child {
    color: rgb(91, 199, 97);
  }
}

.options-path {
  margin-right: 5px;
  font-weight: 600;
  cursor: pointer;
}

.input-container {
  width: 100%;
  min-height: 2.5rem;
  // TODO: Get consistent focus rings + keyboard navigation happening on this component.
  background: white;
  border: 1px solid #ccc;
  border-radius: 5px;
  &.open {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }
  > input {
    width: 100%;
    border: none;
    outline: none;
    background: transparent;
    font-size: 1em;
    line-height: 2.5rem;
    text-indent: 0.5rem;
    color: rgb(128, 128, 128);
    //&:focus {
    //  color: rgb(46, 46, 46);
    //  box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25);
    //  border-radius: 0.375rem;
    //  border-color: #86b7fe;
    //}
  }
}

.selected-container {
  border-top: 1px solid rgb(241, 241, 241);
  gap: 0.3em;
  > .selected-option {
    user-select: none;
    align-items: center;
    background: #10b981;
    border-radius: 4px;
    display: flex;
    font-size: 14px;
    color: white;
    font-weight: 600;
    line-height: 1.25rem;
    white-space: nowrap;

    > .selected-option-icon {
      border-radius: 4px;
      aspect-ratio: 1;
      opacity: 0.8;
      color: white;
      margin: 0 2px;
      font-size: 13px;
      &:hover {
        background-color: rgba(0, 0, 0, 0.063);
        transition: background-color 0.1s ease-in-out;
      }
    }
  }
}
.single-selection {
  height: 100%;
  > .selected-option {
    text-indent: 0.5rem;
    line-height: 100%;
  }
}

.selected-option {
  min-height: 26px;
  cursor: pointer;
}

.options-display-container {
  width: 100%;
  background-color: white;
}

.options-list-container {
  width: 100%;
  background-color: white;
  border: 1px solid #ccc;
  max-height: 10em;
  overflow-y: auto;
}

.options-list-label {
  width: 100%;
  &.no-results {
    color: #666;
  }
}

.options-list-child {
  padding: 0.5em;
  min-width: 40px;
  min-height: 40px;
  border-radius: 100%;
  svg {
    color: rgb(85, 85, 85);
  }
}

.options-list-child:hover {
  background-color: #dfdfdf;
  svg {
    color: rgb(46, 46, 46);
  }
}

.options-list-item:hover {
  background-color: #f1f1f1;
  transition: background-color 0.2s ease-in-out;
}

.pin-btn {
  outline: none;
  border: 0;
  &:hover,
  &:active,
  &:focus {
    background: transparent;
    color: #444;
  }
  &.pinned {
    &:hover,
    &:active,
    &:focus {
      color: blue;
    }
    color: blue;
  }
}
</style>
