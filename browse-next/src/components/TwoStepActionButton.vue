<!--
boundary="window"
    :offset="offset"-->
<template>
  <b-dropdown
    no-flip
    dropup
    auto-close
    no-caret
    :offset="offset"
    :variant="variant"
    :end="alignment === 'right'"
    :center="alignment === 'centered'"
    :menu-class="['dropdown-indicator', alignment]"
    :toggle-class="[...classes]"
    :disabled="disabled"
  >
    <template #button-content>
      <font-awesome-icon
        :icon="icon"
        v-if="icon"
        :color="color || 'inherit'"
        :rotation="rotate || null"
      />
      <span v-if="computedLabel" class="ps-2" v-html="computedLabel" />
    </template>

    <b-dropdown-group class="px-2" header-class="d-none">
      <button
        @click="() => action()"
        class="btn btn-outline-danger text-nowrap w-100"
      >
        <font-awesome-icon icon="exclamation-triangle" />
        <span class="ms-2" v-html="computedConfirmationLabel" />
      </button>
    </b-dropdown-group>
  </b-dropdown>
</template>
<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    action: () => void;
    label?: string | (() => string);
    confirmationLabel?: string | (() => string);
    disabled?: boolean;
    classes?: string[];
    icon?: string;
    color?: string;
    alignment?: "right" | "centered" | "left";
    rotate?: 90 | 180 | 270 | null;
    variant?: string;
  }>(),
  {
    label: "",
    confirmationLabel: "",
    disabled: false,
    alignment: "centered",
    classes: () => [],
    icon: "trash-can",
    color: "inherit",
    rotate: null,
    variant: "link",
  }
);
// Ideally we want to center the button and the triangle, but if we're too close to the edge of the viewport,
// we want to move it to one side.
const offset = computed<
  string | { alignmentAxis: number; crossAxis: number; mainAxis: number }
>(() => {
  if (props.alignment === "right") {
    return { alignmentAxis: -5, crossAxis: 0, mainAxis: 7 };
  } else if (props.alignment === "centered") {
    return { alignmentAxis: -5, crossAxis: 0, mainAxis: 14 };
  }
  return { alignmentAxis: 50, crossAxis: 60, mainAxis: 7 };
});

const computedLabel = computed<string>(() => {
  if (typeof props.label === "string") {
    return props.label;
  }
  return props.label();
});

const computedConfirmationLabel = computed<string>(() => {
  if (typeof props.confirmationLabel === "string") {
    return props.confirmationLabel;
  }
  return props.confirmationLabel();
});
</script>
<style lang="less">
.dropdown-indicator {
  overflow: visible !important;
  position: relative;
  &::after {
    content: "";
    position: absolute;
    width: 0;
    height: 0;
    display: block;
    bottom: -9px;
    border-left: 10px solid transparent;
    border-right: 10px solid transparent;
    border-top: 10px solid white;
    left: calc(50% - 10px);
  }
  &::before {
    content: "";
    position: absolute;
    width: 0;
    height: 0;
    display: block;
    bottom: -10.5px;
    border-left: 10.5px solid transparent;
    border-right: 10.5px solid transparent;
    border-top: 10.5px solid var(--bs-dropdown-border-color);
    left: calc(50% - 10.25px);
  }
  &.right {
    &::after {
      left: unset;
      right: 15px;
    }
    &::before {
      left: unset;
      right: 15.25px;
    }
  }
  &.left {
    &::after {
      left: 15px;
    }
    &::before {
      left: 15.25px;
    }
  }
}
</style>
