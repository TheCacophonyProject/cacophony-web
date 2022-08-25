<template>
  <div ref="optionsContainer" class="options-container">
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
          type="text"
          ref="inputRef"
          v-model="searchTerm"
          placeholder="Search"
          :disabled="disabled"
        />
        <div
          v-if="
            typeof selectedOptions === 'string' &&
            !showOptions &&
            selectedOptions
          "
        >
          <div class="selected-option">{{ selectedOptions }}</div>
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
            {{ option }}
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
    const optionsContainer = ref<HTMLDivElement>(null);
    const inputRef = ref(null);

    // Options Reactive Variables
    const options = ref<Option>(props.options);
    const displayedOptions = ref<Option[]>([]);
    const currPath = ref<string[]>([]);
    const optionsPaths = ref<Map<string, string[]>>(new Map());
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
      currPath.value = optionsPaths.value.get(label);
    };

    const createOptionsPaths = (root: Option) => {
      const navigate = (node: Option, path: string[]) => {
        optionsPaths.value.set(node.label, [...path, node.label]);
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
        options.value = props.options;
        createOptionsPaths(options.value);
        setToPath("all");
      }
    );

    watch(searchTerm, () => {
      if (searchTerm.value === "") {
        currPath.value = ["all"];
        return;
      }
      currPath.value = ["search"];
      displayedOptions.value = searchOptions(options.value.children);
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
      }, options.value).children;
    });

    watch(inputRef, () => {
      if (showOptions.value && inputRef.value) {
        inputRef.value.focus();
      }
    });

    onMounted(async () => {
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          showOptions.value = false;
        }
      });

      document.addEventListener("click", (e) => {
        const target = e.target as Element;
        if (
          optionsContainer.value?.contains(target) ||
          target.id.includes("child-button") ||
          target.parentElement?.id.includes("child-button")
        ) {
          showOptions.value = true && !props.disabled;
        } else {
          showOptions.value = false;
        }
      });
    });

    return {
      optionsContainer,
      optionsList,
      currPath,
      displayedOptions,
      selectedOptions,
      showOptions,
      searchTerm,
      inputRef,
      addSelectedOption,
      removeSelectedOption,
      setToPath,
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
    gap: 10px;
    padding: 0.6em 0.4em 0.6em 0.4em;
    width: 100%;
    background: white;
    outline: 1px solid #ccc;
    border-radius: 0.2em;
  }
}

.search-container {
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
  border-top: 1px solid #ccc;

  div {
    user-select: none;
    padding: 0.2em 0.6em 0.2em 0.6em;
    background-color: white;
    border-radius: 0.4em;
    box-shadow: 0px 0px 5px rgba(185, 185, 185, 0.2),
      0px 0px 10px rgba(112, 112, 112, 0.2);
  }
}

.selected-option {
  min-height: 26px;
  cursor: pointer;
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
