<template>
  <div ref="optionsContainerRef" class="options-container">
    <div v-show="showOptions" class="options-display-container">
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
    </div>
    <div class="input-container d-flex flex-column">
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
      <button
        type="button"
        class="btn selected-option text-start text-capitalize"
        @click="openSelect"
        v-if="!showOptions && singleSelection"
      >
        {{ singleSelection.display || singleSelection.label }}
      </button>
      <div
        v-else-if="multiselect && hasSelection"
        class="selected-container d-flex flex-wrap"
      >
        <button
          type="button"
          class="selected-option btn text-capitalize"
          :key="option"
          v-for="option in multipleSelections"
          @click="() => removeSelectedOption(option)"
        >
          {{ option.display || option.label }}
          <font-awesome-icon class="selected-option-icon" icon="times" />
        </button>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Classification } from "@typedefs/api/trackTag";
import { onClickOutside } from "@vueuse/core";
const emit = defineEmits<{
  (e: "input", value: string | string[]): void;
}>();

const {
  options,
  disabled = false,
  multiselect = false,
  placeholder = "Search",
} = defineProps<{
  options: Classification;
  disabled: boolean;
  multiselect: boolean;
  placeholder: string;
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

const openSelect = () => {
  showOptions.value = true;
  setToPath("all");
  inputRef.value?.focus();
};

const closeSelect = () => {
  showOptions.value = false;
  searchTerm.value = "";
  setToPath("all");
};

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
  if (!multiselect) {
    singleSelection.value = option;
  } else if (!multipleSelections.value.includes(option)) {
    // TODO - Might need find
    multipleSelections.value.push(option);
  }
  closeSelect();
};

const addSearchTermOnSubmit = (event: KeyboardEvent) => {
  if (searchTerm.value.trim() !== "") {
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

const setToPath = (label: string) => {
  searchTerm.value = "";
  currPath.value = optionsMap.value.get(label.toLowerCase())?.path || [];
};

const displayedOptions = computed<Classification[]>(() => {
  if (searchTerm.value.trim()) {
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
onClickOutside(optionsContainerRef, closeSelect);
</script>
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
  outline: 1px solid #ccc;

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
  min-height: 2.5em;
  padding: 0.4em;
  background: white;
  outline: 1px solid #ccc;
  border-radius: 0.2em;
  > input {
    width: 100%;
    border: none;
    outline: none;
    background: transparent;
    font-size: 1em;
    color: rgb(128, 128, 128);
    &:focus {
      color: rgb(46, 46, 46);
    }
  }
}

.selected-container {
  gap: 0.4em;
  margin-top: 0.2em;
  padding-top: 0.6em;
  border-top: 1px solid rgb(241, 241, 241);

  > .selected-option {
    user-select: none;
    padding: 0.2em 0.6em 0.2em 0.6em;
    background-color: white;
    border-radius: 0.4em;
    box-shadow: 0 0 3px rgba(214, 214, 214, 0.2),
      0 0 3px rgba(138, 138, 138, 0.2);
  }
}

.selected-option {
  min-height: 26px;
  cursor: pointer;
}
.selected-option:hover {
  .selected-option-icon {
    transition: color 0.1s ease-in-out;
    color: rgb(218, 58, 58);
  }
}

.selected-option-icon {
  margin-left: 0.3em;
  color: rgba(29, 29, 29, 0.2);
  width: auto;
}

.options-container {
  position: relative;
}

.options-display-container {
  position: absolute;
  bottom: 100%;
  width: 100%;
  background-color: white;
}

.options-list-container {
  width: 100%;
  background-color: white;
  outline: 1px solid #ccc;
  border-top-left-radius: 0.2em;
  border-top-right-radius: 0.2em;
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
  //add transition
  transition: all 0.2s ease-in-out;

  svg {
    color: rgb(46, 46, 46);
  }
}

.options-list-item:hover {
  background-color: #f1f1f1;
  //add transition
  transition: background-color 0.2s ease-in-out;
}
</style>
