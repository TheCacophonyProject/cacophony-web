<template>
  <b-dropdown
    no-flip
    dropup
    auto-close
    boundary="window"
    :offset="offset"
    no-caret
    variant="link"
    :menu-class="['dropdown-indicator', align]"
    :disabled="disabled"
  >
    <template #button-content>
      <div ref="iconButton">
        <font-awesome-icon icon="trash-can" color="#666" />
      </div>
    </template>
    <b-dropdown-item-button @click="() => action()" variant="danger">
      <font-awesome-icon icon="exclamation-triangle" />
      <span class="ms-2" v-html="computedLabel" />
    </b-dropdown-item-button>
  </b-dropdown>
</template>
<script setup lang="ts">
import { computed } from "vue";

const {
  action,
  label = "Delete",
  disabled = false,
  align = "centered",
} = defineProps<{
  action: () => void;
  label?: string | (() => string);
  disabled?: boolean;
  align?: "right" | "centered" | "left";
}>();

// Ideally we want to center the button and the triangle, but if we're too close to the edge of the viewport,
// we want to move it to one side.
const offset = computed<string>(() => {
  if (align === "right") {
    return "5, 7";
  } else if (align === "centered") {
    return "-67, 7";
  }
  return "-5, 7";
});

const computedLabel = computed<string>(() => {
  if (typeof label === "string") {
    return label;
  }
  return label();
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
