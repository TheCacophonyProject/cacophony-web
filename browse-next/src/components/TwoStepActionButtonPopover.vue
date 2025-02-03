<template>
  <b-popover
    click
    :disabled="disabled"
    placement="left"
    no-fade
    :delay="{ show: 0, hide: 0 }"
    :boundary-padding="{ top: 17, bottom: 17 }"
    close-on-hide
  >
    <template #target>
      <button class="btn" @click.stop.prevent="() => {}">
        <font-awesome-icon
          :icon="icon"
          v-if="icon"
          :color="color || 'inherit'"
          :rotation="rotate || null"
        />
        <span v-if="computedLabel" class="ps-2" v-html="computedLabel" />
      </button>
    </template>

    <button
      @click.stop.prevent="() => action()"
      class="btn btn-outline-danger text-nowrap w-100"
    >
      <font-awesome-icon icon="exclamation-triangle" />
      <span class="ms-2" v-html="computedConfirmationLabel" />
    </button>
  </b-popover>
</template>
<script setup lang="ts">
import { computed, watch } from "vue";

const props = withDefaults(
  defineProps<{
    action: () => void;
    label?: string | (() => string);
    confirmationLabel?: string | (() => string);
    disabled?: boolean;
    icon?: string | string[];
    color?: string;
    rotate?: 90 | 180 | 270 | null;
  }>(),
  {
    label: "",
    confirmationLabel: "",
    disabled: false,
    icon: "trash-can",
    color: "inherit",
    rotate: null,
  }
);

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
.popover {
  --bs-popover-body-padding-x: 7px;
  --bs-popover-body-padding-y: 7px;
}
</style>
