<template>
  <b-dropdown
    no-flip
    dropup
    auto-close
    boundary="window"
    :offset="offset"
    no-caret
    variant="link"
    :menu-class="['dropdown-indicator', alignment]"
    toggle-class="p-0"
    :disabled="disabled"
  >
    <template #button-content>
      <button type="button" class="btn" ref="iconButton" :class="classes">
        <font-awesome-icon
          :icon="icon"
          v-if="icon"
          :color="color || 'inherit'"
          :rotation="rotate || null"
        />
        <span v-if="computedLabel" class="ps-2" v-html="computedLabel" />
      </button>
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

const {
  action,
  label = "",
  confirmationLabel = "",
  disabled = false,
  alignment = "centered",
  classes = [],
  icon = "trash-can",
  color = "inherit",
  rotate = null,
} = defineProps<{
  action: () => void;
  label?: string | (() => string);
  confirmationLabel?: string | (() => string);
  disabled?: boolean;
  classes?: string[] | string;
  icon?: string;
  color?: string;
  alignment?: "right" | "centered" | "left";
  rotate?: 90 | 180 | 270 | null;
}>();

// Ideally we want to center the button and the triangle, but if we're too close to the edge of the viewport,
// we want to move it to one side.
const offset = computed<string>(() => {
  if (alignment === "right") {
    return "-5, 7";
  } else if (alignment === "centered") {
    return "-75, 7";
  }
  return "-5, 7";
});

const computedLabel = computed<string>(() => {
  if (typeof label === "string") {
    return label;
  }
  return label();
});

const computedConfirmationLabel = computed<string>(() => {
  if (typeof confirmationLabel === "string") {
    return confirmationLabel;
  }
  return confirmationLabel();
});
</script>
<style lang="less">
.dropdown-indicator {
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
