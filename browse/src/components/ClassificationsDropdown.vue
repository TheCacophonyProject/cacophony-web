<template>
  <div @click="$emit('click', $event)" class="classification-container">
    <layered-dropdown
      :options="options"
      @input="$emit('input', $event)"
      v-bind:value="value"
      :disabled="disabled"
      :placeholder="placeholder"
    />
  </div>
</template>
<script lang="ts">
import api from "@/api";
import {
  defineComponent,
  onMounted,
  PropType,
  ref,
} from "@vue/composition-api";
import LayeredDropdown, { Option } from "./LayeredDropdown.vue";

export const getClassifications = async () => {
  const cached = localStorage.getItem("classifications");
  if (cached) {
    const parsed = JSON.parse(cached);
    api.classifications.getClassifications(parsed.version).then((res) => {
      if (res.success && res.result.version !== parsed.version) {
        localStorage.setItem("classifications", JSON.stringify(res.result));
      }
    });
    return parsed;
  } else {
    const res = await api.classifications.getClassifications();
    if (res.success) {
      localStorage.setItem("classifications", JSON.stringify(res.result));
      return res.result;
    }
    throw new Error("Could not get classifications");
  }
};
export default defineComponent({
  props: {
    value: {
      type: [Array, String] as PropType<string | string[]>,
      default: () => [],
    },
    disabled: {
      type: Boolean as PropType<boolean>,
      default: false,
    },
    exclude: {
      type: Array as PropType<string[]>,
      default: () => [],
    },
    placeholder: {
      type: String as PropType<string>,
      default: () => "Search Tags...",
    },
  },
  components: {
    LayeredDropdown,
  },
  setup(props) {
    const options = ref<Option>({ label: "", children: [] });

    onMounted(async () => {
      options.value = (await getClassifications()) as Option;
      // classifications is a tree, we want to filter out excluded nodes
      const filter = (node: Option) => {
        if (props.exclude.includes(node.label)) {
          return false;
        }
        if (node.children) {
          node.children = node.children.filter(filter);
        }
        return true;
      };

      options.value = {
        ...options.value,
        children: options.value.children.filter(filter),
      };
    });
    return { options };
  },
});
</script>

<style lang="scss" scoped>
.classification-container {
  width: 100%;
}
</style>
