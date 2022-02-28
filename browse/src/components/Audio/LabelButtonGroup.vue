<template>
  <b-container>
    <b-row class="py-1" v-for="(row, rowIndex) in gridValues" :key="rowIndex">
      <b-col class="px-1" v-for="(value, colIndex) in row" :key="colIndex">
        <b-button
          class="label-button w-100"
          variant="outline"
          @click="addTagToSelectedTrack(value)"
          :disabled="disabled"
          :class="{
            highlight: selectedLabel.toLowerCase() === value.toLowerCase(),
          }"
        >
          {{ value }}
        </b-button>
      </b-col>
    </b-row>
  </b-container>
</template>
<script lang="ts">
import { defineComponent, PropType } from "@vue/composition-api";

export default defineComponent({
  name: "LabelButtonGroup",
  props: {
    labels: {
      type: Array as PropType<string[]>,
      required: true,
    },
    cols: {
      type: Number,
      default: 3,
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
    // create 2d array of labels where each row has props.cols elements
    const gridValues = props.labels.reduce((acc, label, index) => {
      const rowIndex = Math.floor(index / props.cols);
      const colIndex = index % props.cols;
      if (!acc[rowIndex]) {
        acc[rowIndex] = [];
      }
      acc[rowIndex][colIndex] = label;
      return acc;
    }, [] as string[][]);
    return {
      gridValues,
    };
  },
});
</script>
<style lang="scss">
.label-button {
  background-color: white;
  color: #2b333f;
  border-radius: 0.5em;
  border: 1px #e8e8e8 solid;
  box-shadow: 0px 1px 2px 1px #ebebeb70;
}
</style>
