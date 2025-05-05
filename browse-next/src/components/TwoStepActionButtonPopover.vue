<template>
  <b-popover
    click
    :disabled="disabled"
    :placement="placement"
    no-fade
    :strategy="'fixed'"
    :delay="{ show: 0, hide: 0 }"
    :boundary-padding="{ top: 17, bottom: 17 }"
    :close-on-hide="hasBoundaryPadding"
    ref="popover"
    @hidden="didHide"
  >
    <template #target>
      <button class="btn" :class="[...classes]" @click.stop.prevent="() => {}">
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
      @click.stop.prevent="
        () => {
          action();
          shouldHideInternal = true;
        }
      "
      class="btn btn-outline-danger text-nowrap w-100"
    >
      <font-awesome-icon icon="exclamation-triangle" />
      <span class="ms-2" v-html="computedConfirmationLabel" />
    </button>
  </b-popover>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import { BPopover, type PopoverPlacement } from "bootstrap-vue-next";

const popover = ref<typeof BPopover>();

const hasBoundaryPadding = computed(() => {
  return shouldHideInternal.value || props.boundaryPadding;
});

const shouldHideInternal = ref(false);

const didHide = () => {
  shouldHideInternal.value = false;
};

const props = withDefaults(
  defineProps<{
    action: () => void;
    label?: string | (() => string);
    confirmationLabel?: string | (() => string);
    disabled?: boolean;
    classes?: string[];
    icon?: string | string[];
    color?: string;
    rotate?: 90 | 180 | 270 | null;
    placement?: PopoverPlacement;
    boundaryPadding: boolean;
  }>(),
  {
    label: "",
    confirmationLabel: "",
    disabled: false,
    classes: () => [],
    icon: "trash-can",
    color: "inherit",
    rotate: null,
    placement: "left",
    boundaryPadding: true,
  },
);

// :delay="{ show: 0, hide: 0 }"
// :boundary-padding="{ top: 17, bottom: 17 }"
// close-on-hide
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
