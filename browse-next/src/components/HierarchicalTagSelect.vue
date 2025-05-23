<template>
  <layered-dropdown
    :options="options"
    :disabled="disabled"
    :disabled-tags="disabledTags"
    :can-be-pinned="canBePinned"
    :pinned-items="pinnedItems"
    :placeholder="placeholder"
    :multiselect="multiselect"
    :with-audio-context="withAudioContext"
    :selected-items="modelValue"
    :open-on-mount="openOnMount"
    @change="updateModel"
    @deselected="(deselected) => emit('deselected')"
    ref="layeredDropdown"
  />
</template>
<script setup lang="ts">
import { getClassifications } from "@api/Classifications";
import LayeredDropdown from "./LayeredDropdown.vue";
import { onMounted, ref } from "vue";
import type { Classification } from "@typedefs/api/trackTag";

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    exclude?: string[];
    placeholder?: string;
    multiselect?: boolean;
    canBePinned?: boolean;
    withAudioContext?: boolean;
    pinnedItems?: string[];
    openOnMount?: boolean;
    disabledTags?: string[];
    modelValue?: string[];
  }>(),
  {
    disabled: false,
    exclude: () => [],
    placeholder: "Search Tags...",
    multiselect: false,
    withAudioContext: false,
    canBePinned: false,
    pinnedItems: () => [],
    openOnMount: true,
    disabledTags: () => [],
    modelValue: () => [],
  },
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string[]): void;
  (e: "deselected"): void;
}>();

const updateModel = (val: Classification[]) => {
  emit(
    "update:modelValue",
    val.map(({ label }) => label),
  );
};

const layeredDropdown = ref<typeof LayeredDropdown>();
const options = ref<Classification>({ label: "", children: [] });

const setClassifications = (classifications: Classification) => {
  // classifications is a tree, we want to filter out excluded nodes
  const filter = (node: Classification) => {
    if (props.exclude.includes(node.label)) {
      return false;
    }
    if (node.children) {
      node.children = node.children.filter(filter);
    }
    return true;
  };
  if (classifications.children) {
    classifications.children = classifications.children.filter(filter);
  }
  options.value = classifications;
};
onMounted(async () => {
  // Get our own copy of classifications since we're going to mutate it.
  const classifications = (await getClassifications(
    setClassifications,
  )) as Classification;
  setClassifications(classifications);
});

defineExpose({
  open: () => {
    layeredDropdown.value &&
      (layeredDropdown.value as typeof LayeredDropdown).open();
  },
});
</script>
