<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import type { Classification } from "@typedefs/api/trackTag";
import { onClickOutside } from "@vueuse/core";
import {
  displayLabelForClassificationLabel,
  getClassificationForLabel,
} from "@api/Classifications";

const props = withDefaults(
  defineProps<{
    options: Classification;
    disabled: boolean;
    disabledTags?: string[];
    multiselect: boolean;
    placeholder: string;
    canBePinned: boolean;
    pinnedItems: string[];
    selectedItems: string[];
    openOnMount?: boolean;
  }>(),
  {
    disabled: false,
    multiselect: false,
    canBePinned: false,
    pinnedItems: () => [],
    placeholder: "Search",
    selectedItems: () => [],
    openOnMount: true,
    disabledTags: () => [],
  },
);

// Elements
const optionsList = ref<HTMLDivElement>();
const optionsContainerRef = ref<HTMLDivElement>();
const inputRef = ref<HTMLInputElement>();

//const singleSelection = ref<Classification | null>(null);
const selections = ref<Classification[]>([]);

const currPath = ref<string[]>([]);
// Search
const searchTerm = ref("");
const showOptions = ref<boolean>(false);

const emit = defineEmits<{
  (e: "change", value: Classification[]): void;
  (e: "pin", value: Classification | Classification[] | null): void;
  (e: "options-change"): void; // When the option changes, the height changes, and we may want to let the parent element know about this.
  (e: "deselected"): void;
}>();

const openSelect = () => {
  showOptions.value = true;
  searchTerm.value = "";
  setToPath("all");
  if (!inputRef.value) {
    nextTick(() => {
      inputRef.value?.focus();
      optionsContainerRef.value?.scrollIntoView({
        block: "start",
        inline: "nearest",
      });
    });
  } else {
    inputRef.value?.focus();
    optionsContainerRef.value?.scrollIntoView({
      block: "start",
      inline: "nearest",
    });
  }
  emit("options-change");
};

const maybeOpenSelect = () => {
  if (!showOptions.value) {
    showOptions.value = true;
  }
};

const closeSelect = () => {
  showOptions.value = false;
  searchTerm.value = "";
  setToPath("all");
  emit("options-change");
};

const maybeCloseSelect = () => {
  // if (!showOptions.value) {
  //   showOptions.value = true;
  // }
};

watch(
  () => props.selectedItems,
  (nextSelected: string[]) => {
    if (!props.multiselect) {
      console.assert(nextSelected.length <= 1);
    }
    const nextSelections = [];
    for (const label of nextSelected) {
      const canonicalClassification = getClassificationForLabel(
        label.toLowerCase(),
      );
      nextSelections.push(canonicalClassification);
    }
    selections.value = nextSelections.filter((x) => !!x);
  },
);

onMounted(() => {
  const nextSelections = [];
  for (const label of props.selectedItems) {
    const canonicalClassification = getClassificationForLabel(
      label.toLowerCase(),
    );
    nextSelections.push(canonicalClassification);
  }
  selections.value = nextSelections.filter((x) => !!x);
});

watch(
  () => props.options,
  () => {
    if (
      props.selectedItems.length === 1 &&
      props.pinnedItems.includes(props.selectedItems[0])
    ) {
      showOptions.value = false;
      searchTerm.value = props.selectedItems[0];
      addSearchTermOnSubmit();
      currPath.value =
        optionsMap.value.get(props.selectedItems[0].toLowerCase())?.path || [];
    } else if (props.openOnMount) {
      openSelect();
    }
  },
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
    navigate(props.options, []);
    return map;
  },
);

const hasSelection = computed<boolean>(() => {
  return selections.value.length !== 0;
});

const addSelectedOption = (option: Classification) => {
  if (option.label === "No results") {
    return;
  }
  const canonicalOption = getClassificationForLabel(option.label.toLowerCase());

  if (!props.multiselect && selections.value[0] !== canonicalOption) {
    emit("change", [canonicalOption]);
    closeSelect();
  } else if (!selections.value.includes(canonicalOption)) {
    (inputRef.value as HTMLInputElement).focus();
    emit("change", [...selections.value, canonicalOption]);
  } else {
    closeSelect();
  }
};

const pinCurrentSelection = (_option: Classification) => {
  if (selections.value.length === 1) {
    emit("pin", selections.value[0]);
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
  (inputRef.value as HTMLInputElement).blur();
  closeSelect();
  emit("deselected");
};

const removeSelectedOption = (option: Classification) => {
  selections.value = selections.value.filter((o) => o !== option);
  (inputRef.value as HTMLInputElement).focus();
  emit("change", selections.value);
};

const singleSelectionIsPinned = computed<boolean>(
  () =>
    selections.value.length === 1 &&
    props.pinnedItems.includes(selections.value[0].label),
);

const setToPath = (label: string) => {
  searchTerm.value = "";
  currPath.value =
    (label && optionsMap.value.get(label.toLowerCase())?.path) || [] || [];
};

const displayedOptions = computed<Classification[]>(() => {
  if (searchTerm.value && searchTerm.value.trim()) {
    // Get all the options that relate to the search term.
    const searchResults = searchOptions(
      (props.options.children as Classification[]).filter(
        (item) => item.label !== "animal",
      ),
    );
    if (searchResults.length !== 0) {
      return searchResults;
    } else {
      return [{ label: "No results" }];
    }
  } else {
    let node = props.options;
    for (const pathComponent of currPath.value.slice(1)) {
      const foundNode = node.children?.find(
        ({ label }) => label === pathComponent,
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
  () => emit("options-change"),
);

onClickOutside(optionsContainerRef, () => {
  closeSelect();
  emit("deselected");
});
defineExpose({
  open: openSelect,
});
//
</script>
<template>
  <div ref="optionsContainerRef" class="options-container">
    <div
      class="input-container d-flex flex-column fs-6"
      :class="{ open: showOptions }"
    >
      <input
        v-if="
          multiselect ||
          showOptions ||
          (!multiselect && selections.length === 0)
        "
        @keyup.enter.stop.prevent="addSearchTermOnSubmit"
        @keydown.esc.stop.prevent="handleEscapeDismiss"
        @focus="() => !showOptions && openSelect()"
        @blur="(e) => maybeCloseSelect"
        @input="maybeOpenSelect"
        type="text"
        ref="inputRef"
        v-model="searchTerm"
        :placeholder="placeholder"
        :disabled="disabled"
      />
      <div
        v-if="!showOptions && !multiselect && selections.length === 1"
        class="d-flex single-selection align-items-center"
      >
        <button
          type="button"
          tabindex="-1"
          class="btn selected-option text-start text-capitalize flex-grow-1 px-0"
          @click="openSelect"
        >
          {{
            (selections[0] && (selections[0].display || selections[0].label)) ||
            ""
          }}
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
        class="selected-container d-flex flex-wrap p-2"
      >
        <button
          type="button"
          class="selected-option-badge btn text-capitalize ps-2 pe-0 py-0 d-flex justify-content-center align-items-center"
          :key="option.label"
          v-for="option in selections"
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
          :key="index"
          v-for="(option, index) in displayedOptions"
        >
          <button
            class="options-list-label btn text-start text-capitalize"
            v-if="option.label !== 'No results'"
            @click.prevent="addSelectedOption(option)"
            :disabled="disabledTags.includes(option.label)"
          >
            <span style="vertical-align: middle">{{
              displayLabelForClassificationLabel(option.label)
            }}</span
            ><span
              v-if="
                option.display &&
                displayLabelForClassificationLabel(option.label) !==
                  option.label
              "
              class="fs-7 text-black-50"
              style="vertical-align: middle"
              >&nbsp;({{ option.label }})</span
            >
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
  border-bottom: 1px solid #ccc;

  :last-child {
    color: rgb(91, 199, 97);
  }
}

.options-path {
  margin-right: 5px;
  font-weight: 600;
  cursor: pointer;
}

.options-container:focus-within {
  color: rgb(46, 46, 46);
  box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25);
  border-radius: 0.375rem;
  border-color: #86b7fe;
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
  &:has(input:disabled) {
    opacity: 0.4;
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
  }
}

.selected-container {
  border-top: 1px solid rgb(241, 241, 241);
  gap: 0.3em;
  > .selected-option-badge {
    user-select: none;
    align-items: center;
    background: var(--ms-tag-bg);
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
  min-height: 40px;
  height: 100%;
  cursor: pointer;
}

.options-display-container {
  width: 100%;
  background-color: white;
  border-bottom-left-radius: 5px;
  border-bottom-right-radius: 5px;
  border: 1px solid #ccc;
  border-top-width: 0;
  overflow: hidden;
}

.options-list-container {
  width: 100%;
  background-color: white;
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

.options-list-child:hover,
.options-list-child:focus {
  background-color: #dfdfdf;
  svg {
    color: rgb(46, 46, 46);
  }
}

.options-list-item:hover,
.options-list-item:focus-within {
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
