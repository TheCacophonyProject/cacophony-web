<template>
  <layered-dropdown
    :options="options"
    :disabled="disabled || false"
    :disabled-tags="disabledTags"
    :can-be-pinned="canBePinned || false"
    :pinned-items="pinnedItems || []"
    :placeholder="placeholder || 'Search tags'"
    :multiselect="multiselect || false"
    :with-audio-context="withAudioContext || false"
    :selected-items="modelValue || []"
    :open-on-mount="openOnMount"
    @change="updateModel"
    @deselected="() => emit('deselected')"
    ref="layeredDropdown"
  />
</template>
<script setup lang="ts">
import { getClassifications } from "@api/classificationsUtils.ts";
import LayeredDropdown from "./LayeredDropdown.vue";
import { onMounted, ref } from "vue";
import type { Classification } from "@typedefs/api/trackTag";

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    exclude?: string[];
    include?: string[];
    placeholder?: string;
    multiselect?: boolean;
    canBePinned?: boolean;
    withAudioContext?: boolean;
    pinnedItems?: string[];
    openOnMount?: boolean;
    openOnClick?: boolean;
    disabledTags?: string[];
    modelValue?: string[];
  }>(),
  {
    disabled: false,
    exclude: () => [],
    include: () => [],
    placeholder: "Search tags",
    multiselect: false,
    withAudioContext: false,
    canBePinned: false,
    pinnedItems: () => [],
    openOnMount: true,
    openOnClick: true,
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
  if (props.include.length !== 0) {
    if (classifications.children) {
      const filterInclude = (node: Classification): boolean => {
        const matches = props.include.includes(node.label);
        if (node.children && node.children.length) {
          node.children = node.children.filter(filterInclude);
          if (node.children.length === 0) {
            // TODO: Should we delete children, or should we include, assuming that if a user doesn't want to see
            //  stoat, they might want to pick that rather than `mustelid`?
            delete node.children;
          }
        }

        // keep node if it matches or it still has kept descendants
        return matches || (!!node.children && node.children.length > 0);
      };
      classifications.children = classifications.children.filter(filterInclude);
    }
  } else if (props.exclude.length !== 0) {
    if (classifications.children) {
      const filterExclude = (node: Classification): boolean => {
        if (props.exclude.includes(node.label)) {
          return false;
        }
        if (node.children) {
          node.children = node.children.filter(filterExclude);
        }
        return true;
      };
      classifications.children = classifications.children.filter(filterExclude);
    }
  }
  options.value = classifications;
};
onMounted(async () => {
  console.log("Mounted", props);
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
