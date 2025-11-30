<script setup lang="ts">
import { computed, ref } from "vue";
import {BButton, BPopover, BTooltip, type PopoverPlacement} from "bootstrap-vue-next";
import {MaterialSymbol, type SymbolsProp} from "@dbetka/vue-material-symbols";

const popover = ref<typeof BPopover>();
const actionBtn = ref<typeof BButton | null>(null);
const popoverIsShowing = ref(false);

const hasBoundaryPadding = computed(() => {
  return shouldHideInternal.value || props.boundaryPadding;
});

const shouldHideInternal = ref(false);

const didHide = () => {
  shouldHideInternal.value = false;
};

const hide = () => {
  setTimeout(() => {
    popover.value && popover.value.toggle();
  }, 100);
};

const props = withDefaults(
  defineProps<{
    action: () => void;
    label?: string | (() => string);
    tooltipLabel?: string | (() => string);
    confirmationLabel?: string | (() => string);
    disabled?: boolean;
    classes?: string[];
    icon?: SymbolsProp;
    color?: string;
    rotate?: 90 | 180 | 270 | null;
    placement?: PopoverPlacement;
    boundaryPadding?: boolean;
  }>(),
  {
    label: "",
    confirmationLabel: "",
    tooltipLabel: "",
    disabled: false,
    classes: () => [],
    icon: "delete",
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

const computedTooltipLabel = computed<string>(() => {
  if (typeof props.tooltipLabel === "string") {
    return props.tooltipLabel;
  }
  return props.tooltipLabel();
});

const computedConfirmationLabel = computed<string>(() => {
  if (typeof props.confirmationLabel === "string") {
    return props.confirmationLabel;
  }
  return props.confirmationLabel();
});
</script>
<template>
  <div>
    <b-popover
      click
      :disabled="disabled"
      :placement="placement"
      no-fade
      :strategy="'absolute'"
      :delay="{ show: 0, hide: 0 }"
      :boundary-padding="{ top: 16, bottom: 16 }"
      :close-on-hide="hasBoundaryPadding"
      ref="popover"
      @hidden="didHide"
      @show="popoverIsShowing = true"
      @hide="popoverIsShowing = false"
    >
      <template #target>
        <button
          class="btn btn-icon d-flex justify-content-center"
          :class="[...classes]"
          @click.stop.prevent="() => {}"
          ref="actionBtn"
          :aria-label="computedTooltipLabel"
        >
          <material-symbol
            :name="icon"
            size="1.25rem"
            v-if="icon"
            :color="color || 'inherit'"
            :rotation="rotate || null"
          />
          <span v-if="computedLabel" class="ps-2" v-html="computedLabel" />
        </button>
        <b-tooltip
          v-if="computedTooltipLabel !== '' && !popoverIsShowing"
          :target="actionBtn"
          :placement="placement"
        >
          <span v-html="computedTooltipLabel"></span>
        </b-tooltip>
      </template>

      <button
        @click.stop.prevent="
          () => {
            action();
            shouldHideInternal = true;
            hide();
          }
        "
        class="btn btn-outline-danger text-nowrap w-100"
      >
        <font-awesome-icon icon="exclamation-triangle" />
        <span class="ms-2" v-html="computedConfirmationLabel" />
      </button>
    </b-popover>
  </div>
</template>
<style lang="less">
@import "../assets/less/spacing";
.popover {
  --bs-popover-body-padding-x: var(--spacing--xs);
  --bs-popover-body-padding-y: var(--spacing--xs);
}
</style>
