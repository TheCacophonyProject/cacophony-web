<template>
  <div
    @click="$emit('click', $event)"
    ref="optionsContainerRef"
    class="options-container"
    id="options-container"
  >
    <div v-show="showOptions" class="options-display-container">
      <div ref="optionsList" class="options-list-container">
        <div
          class="options-list-item"
          :key="option.label"
          v-for="option in displayedOptions"
        >
          <button
            class="options-list-label"
            @click="() => addSelectedOption(option)"
          >
            {{ option.display ? option.display : option.label }}
          </button>
          <button
            id="child-button"
            class="options-list-child"
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
    <div class="input-container">
      <div class="search-container">
        <input
          v-if="
            typeof selectedOptions !== 'string' ||
            showOptions ||
            !selectedOptions
          "
          @focusout="leaveInput"
          type="text"
          ref="inputRef"
          v-model="searchTerm"
          placeholder="Search"
          @keyup="addSearchTermOnSubmit"
          :disabled="disabled"
        />
        <div
          v-if="
            typeof selectedOptions === 'string' &&
            !showOptions &&
            selectedOptions &&
            optionsMap.has(selectedOptions.toLowerCase())
          "
        >
          <div class="selected-option">
            {{ optionsMap.get(selectedOptions.toLowerCase()).display }}
          </div>
        </div>
        <div
          v-else-if="
            typeof selectedOptions !== 'string' && selectedOptions.length !== 0
          "
          class="selected-container"
        >
          <div
            class="selected-option"
            :key="option"
            v-for="option in selectedOptions"
            @click="() => removeSelectedOption(option)"
          >
            {{ optionsMap.get(option.toLowerCase()).display }}
            <font-awesome-icon class="selected-option-icon" icon="times" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script lang="ts">
import {
  computed,
  defineComponent,
  onMounted,
  PropType,
  ref,
  watch,
} from "@vue/composition-api";

export type Option = {
  label: string;
  display?: string;
  children?: Option[];
};

export default defineComponent({
  props: {
    options: {
      type: Object as PropType<Option>,
      required: true,
    },
    value: {
      type: [Array, String] as PropType<string | string[]>,
      default: () => [],
    },
    disabled: {
      type: Boolean as PropType<boolean>,
      default: false,
    },
  },
  setup(props, { emit }) {
    // Elements
    const optionsList = ref<HTMLDivElement>(null);
    const optionsContainerRef = ref<HTMLDivElement>(null);
    const inputRef = ref(null);

    // Options Reactive Variables
    const displayedOptions = ref<Option[]>([]);
    const currPath = ref<string[]>([]);
    const optionsMap = ref<
      Map<string, { display: string; label: string; path: string[] }>
    >(new Map([["all", { display: "all", label: "all", path: ["all"] }]]));
    const showOptions = ref(false);

    const selectedOptions = computed({
      get() {
        return props.value;
      },
      set(value) {
        emit("input", value);
      },
    });

    // Search
    const searchTerm = ref("");

    // Breadth-first search for options matching the search term and "label" property, and "children" as nodes.
    const searchOptions = (options: Option[]) => {
      return options.reduce((acc, option) => {
        if (
          option.label.toLowerCase().includes(searchTerm.value.toLowerCase())
        ) {
          acc.push(option);
        }
        if (option.children) {
          acc = acc.concat(searchOptions(option.children));
        }
        return acc;
      }, []);
    };

    const addSelectedOption = (option: Option) => {
      if (typeof selectedOptions.value === "string") {
        selectedOptions.value = option.label;
        return;
      }
      if (selectedOptions.value.find((o) => o === option.label)) {
        return;
      }
      selectedOptions.value = [...selectedOptions.value, option.label];
    };

    const addSearchTermOnSubmit = (event: KeyboardEvent | MouseEvent) => {
      if (event instanceof KeyboardEvent && event.key === "Enter") {
        if (searchTerm.value === "") {
          return;
        }
        const option = optionsMap.value.get(searchTerm.value.toLowerCase());
        if (option) {
          addSelectedOption(option);
          searchTerm.value = "";
        } else if (displayedOptions.value.length === 1) {
          addSelectedOption(displayedOptions.value[0]);
          searchTerm.value = "";
        }
      }
    };

    const removeSelectedOption = (option: string) => {
      if (typeof selectedOptions.value === "string") {
        selectedOptions.value = "";
      } else {
        selectedOptions.value = selectedOptions.value.filter(
          (o) => o !== option
        );
      }
    };

    const setToPath = (label: string) => {
      currPath.value = optionsMap.value.get(label.toLowerCase()).path;
    };

    const createOptionsPaths = (root: Option) => {
      const navigate = (node: Option, path: string[]) => {
        optionsMap.value.set(node.label, {
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
      navigate(root, []);
    };

    watch(
      () => props.options,
      () => {
        createOptionsPaths(props.options);
        setToPath("all");
      },
      {
        immediate: true,
      }
    );

    watch(searchTerm, () => {
      if (searchTerm.value === "") {
        showOptions.value = typeof selectedOptions.value !== "string";
        setToPath("all");
        return;
      }
      currPath.value = ["search"];
      displayedOptions.value = searchOptions(props.options.children);
    });

    watch(currPath, () => {
      if (currPath.value.includes("search")) {
        return;
      }
      displayedOptions.value = currPath.value.reduce((acc, path) => {
        if (path === "all") {
          return acc;
        }
        const children: Option = acc.children.find(
          ({ label }) => label === path
        );

        return children;
      }, props.options).children;
    });

    watch(inputRef, () => {
      if (showOptions.value && inputRef.value) {
        inputRef.value.focus();
      }
    });
    const leaveInput = (e) => {
      // if e was not triggered by clicking on an option, hide the options
      if (
        !e.relatedTarget ||
        !optionsContainerRef.value.contains(e.relatedTarget as Node)
      ) {
        showOptions.value = false;
        setToPath("all");
      }
    };

    onMounted(() => {
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          showOptions.value = false;
          searchTerm.value = "";
          setToPath("all");
        }
      });

      document.addEventListener("click", (e) => {
        const target = e.target as Element;
        const isDropdown = document
          .getElementById("options-container")
          ?.contains(target);
        const selectedItem =
          typeof target.className === "string" &&
          target.className.includes("options-list") &&
          typeof selectedOptions.value === "string";
        const switchedParent =
          target.id.includes("child-button") ||
          target.parentElement?.id.includes("child-button");

        if (!isDropdown || selectedItem) {
          if (switchedParent) {
            showOptions.value = true;
            searchTerm.value = "";
          } else {
            showOptions.value = false;
            setToPath("all");
            searchTerm.value = "";
          }
        } else {
          showOptions.value = !props.disabled;
        }
      });
    });

    return {
      optionsMap,
      optionsContainerRef,
      optionsList,
      currPath,
      displayedOptions,
      selectedOptions,
      showOptions,
      searchTerm,
      inputRef,
      leaveInput,
      addSelectedOption,
      removeSelectedOption,
      setToPath,
      addSearchTermOnSubmit,
    };
  },
});
</script>
<style lang="scss" scoped>
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

  > div {
    min-height: 2.5em;
    col-gap: 10px;
    padding: 0.4em;
    width: 100%;
    background: white;
    outline: 1px solid #ccc;
    border-radius: 0.2em;
  }
}

.search-container {
  display: flex;
  flex-direction: column;
  justify-items: center;
  width: 100%;
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
  display: flex;
  flex-wrap: wrap;
  gap: 0.4em;
  margin-top: 0.2em;
  padding-top: 0.6em;
  border-top: 1px solid rgb(241, 241, 241);

  div {
    user-select: none;
    padding: 0.2em 0.6em 0.2em 0.6em;
    background-color: white;
    border-radius: 0.4em;
    box-shadow: 0px 0px 3px rgba(214, 214, 214, 0.2),
      0px 0px 3px rgba(138, 138, 138, 0.2);
  }
}

.selected-option {
  text-transform: capitalize;
  display: flex;
  align-items: center;
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
  width: fit-content;
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
  display: flex;
  width: 100%;
  justify-content: space-between;
  flex-direction: column;
  background-color: white;
  outline: 0.1rem solid #ccc;
  border-top-left-radius: 0.2em;
  border-top-right-radius: 0.2em;
  max-height: 10em;
  overflow-y: auto;
}

.options-list-item {
  display: flex;
  z-index: 1;
  justify-content: space-between;

  button {
    //remove the default button styles
    appearance: none;
    background-color: transparent;
    border: 0;
    cursor: pointer;
    height: 40px;
    text-align: left;
    text-transform: capitalize;
  }
}

.options-list-label {
  width: 100%;
}

.options-list-child {
  display: flex;
  justify-content: center;
  align-items: center;
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
