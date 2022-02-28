<template>
  <b-container> </b-container>
</template>
<script lang="ts">
import { defineComponent, PropType } from "@vue/composition-api";

export default defineComponent({
  name: "LabelSearchList",
  props: {
    labels: {
      type: Array as PropType<string[]>,
      required: true,
    },
    addTagToSelectedTrack: {
      type: Function as PropType<(what: string) => Promise<void>>,
      required: true,
    },
    disabled: {
      type: Boolean,
      default: false,
    },
    selectedLabel: {
      type: String,
      default: "",
    },
  },
  setup(props) {
    return {};
  },
});
</script>
