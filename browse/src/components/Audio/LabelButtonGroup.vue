<template>
  <b-container>
    <b-row class="py-1" v-for="(row, rowIndex) in gridValues" :key="rowIndex">
      <b-col
        class="px-1"
        v-for="({ label, pinned }, colIndex) in row"
        :key="colIndex"
      >
        <div
          v-if="pinned"
          @mouseover="setHoveredPinned(label)"
          @mouseout="setHoveredPinned(null)"
          @click="
            () => {
              togglePinTag(label);
              setHoveredPinned(null);
            }
          "
          role="button"
        >
          <font-awesome-icon
            v-if="label === hoveredPinned"
            class="pinned-button pinned-button-cross"
            icon="times"
            size="1x"
            v-b-tooltip.hover
          />
          <font-awesome-icon
            v-else
            class="pinned-button"
            icon="thumbtack"
            size="1x"
            v-b-tooltip.hover
          />
        </div>
        <b-button
          class="label-button w-100 h-100"
          variant="outline"
          @click="
            selectedLabel.toLowerCase() === label.toLowerCase()
              ? deleteTagFromSelectedTrack()
              : addTagToSelectedTrack(label)
          "
          :disabled="disabled"
          :class="{
            highlight: selectedLabel.toLowerCase() === label.toLowerCase(),
          }"
        >
          {{ label }}
        </b-button>
      </b-col>
    </b-row>
  </b-container>
</template>
<script lang="ts">
import { defineComponent, PropType, watch } from "@vue/composition-api";
import { useState } from "@/utils";

export default defineComponent({
  name: "LabelButtonGroup",
  props: {
    labels: {
      type: Array as PropType<{ label: string; pinned: boolean }[]>,
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
    deleteTagFromSelectedTrack: {
      type: Function as PropType<() => Promise<void>>,
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
    togglePinTag: {
      type: Function as PropType<(label: string) => void>,
      required: true,
    },
  },
  setup(props) {
    // create 2d array of labels where each row has props.cols elements
    const createGridValues = (labels: { label: string; pinned: boolean }[]) =>
      labels.reduce((acc, label, index) => {
        const rowIndex = Math.floor(index / props.cols);
        const colIndex = index % props.cols;
        if (!acc[rowIndex]) {
          acc[rowIndex] = [];
        }
        acc[rowIndex][colIndex] = label;
        return acc;
      }, [] as { label: string; pinned: boolean }[][]);
    const [gridValues, setGridValues] = useState(
      createGridValues(props.labels)
    );
    const [hoveredPinned, setHoveredPinned] = useState(null);

    watch(
      () => props.labels,
      (newLabels) => {
        setGridValues(createGridValues(newLabels));
      }
    );
    return {
      gridValues,
      hoveredPinned,
      setHoveredPinned,
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
  text-transform: capitalize;
  &:hover:enabled {
    color: #7f8c8d;
  }
}
.pinned-button {
  position: absolute;
  z-index: 1;
  color: #3498db;
}
.pinned-button-cross {
  color: #e74c3c;
}
</style>
