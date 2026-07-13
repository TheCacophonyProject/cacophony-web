<script setup lang="ts">
import { computed, ref } from "vue";
import {
  BButton,
  BPopover,
  BTooltip,
  type PopoverPlacement,
} from "bootstrap-vue-next";
import { MaterialSymbol, type SymbolsProp } from "@dbetka/vue-material-symbols";

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
    confirmationExtra?: string | (() => string);
    tooltipLabel?: string | (() => string);
    confirmationLabel?: string | (() => string);
    disabled?: boolean;
    btnVariantClass?: string;
    confirmationBtnVariantClass?: string;
    classes?: string[];
    icon?: SymbolsProp | null;
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
    btnVariantClass: "btn-icon",
    confirmationBtnVariantClass: "btn-outline-danger",
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
          class="btn d-flex justify-content-center"
          :class="[...(classes || []), btnVariantClass]"
          @click.stop.prevent="() => {}"
          ref="actionBtn"
          :aria-label="computedTooltipLabel"
          :disabled="disabled"
        >
          <material-symbol
            :name="icon"
            size="1.25rem"
            v-if="icon"
            :color="color || 'inherit'"
            :rotation="rotate || null"
          />
          <span
            v-if="computedLabel"
            :class="{ 'ps-2': icon }"
            v-html="computedLabel"
          />
        </button>
        <b-tooltip
          v-if="actionBtn && computedTooltipLabel !== '' && !popoverIsShowing"
          :target="actionBtn as unknown as HTMLElement"
          :placement="placement"
        >
          <span v-html="computedTooltipLabel"></span>
        </b-tooltip>
      </template>
      <div
        v-if="confirmationExtra"
        v-html="confirmationExtra"
        class="mb-2"
      ></div>
      <button
        data-cy="confirm action"
        @click.stop.prevent="
          () => {
            action();
            shouldHideInternal = true;
            hide();
          }
        "
        class="btn d-flex align-items-center justify-content-center text-nowrap w-100"
        :class="[confirmationBtnVariantClass]"
      >
        <material-symbol
          v-if="confirmationBtnVariantClass === 'btn-outline-danger'"
          name="warning"
          size="1.25rem"
          class="me-2"
        />
        <span v-html="computedConfirmationLabel" />
      </button>
    </b-popover>
  </div>
</template>
<style lang="less">
@import "../assets/less/spacing";
.popover {
  --bs-popover-body-padding-x: var(--cp-spacing-xs);
  --bs-popover-body-padding-y: var(--cp-spacing-xs);
}
</style>
