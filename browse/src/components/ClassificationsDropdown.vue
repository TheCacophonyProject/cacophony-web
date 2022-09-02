<template>
  <div @click="$emit('click', $event)" class="classification-container">
    <LayeredDropdown
      :options="options"
      @input="$emit('input', $event)"
      v-bind:value="value"
      :disabled="disabled"
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
  },
  components: {
    LayeredDropdown,
  },
  setup() {
    const options = ref<Option>({ label: "", children: [] });

    const getClassifications = async () => {
      const cached = localStorage.getItem("classifications");
      if (cached) {
        const parsed = JSON.parse(cached);
        const res = await api.classifications.getClassifications(
          parsed.version
        );
        if (res.success && res.result.version !== parsed.version) {
          localStorage.setItem("classifications", JSON.stringify(res.result));
          return res.result;
        }
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
    onMounted(async () => {
      options.value = (await getClassifications()) as Option;
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
