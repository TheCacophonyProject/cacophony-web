<script setup lang="ts">
import {
  Comment,
  computed,
  Fragment,
  onBeforeMount,
  ref,
  useSlots,
  type VNode,
  watch,
} from "vue";
import { useElementSize } from "@vueuse/core";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";
import { BDropdown, BDropdownItem } from "bootstrap-vue-next";

const navList = ref<HTMLUListElement>();
const slots = useSlots();
const items = ref<VNode[]>([]);

onBeforeMount(() => {
  items.value = ((slots.default && slots.default()) || []).filter(
    (node) => node.type !== Comment && node.type !== Fragment,
  );
  visibleItems.value = items.value.length;
  findSelectedItemName();
});

const { width: listWidth, height: listHeight } = useElementSize(navList);
const visibleItems = ref<number>(-1);

const nonOverflowingItems = computed(() => {
  return items.value.slice(0, visibleItems.value);
});
const overFlowingItems = computed(() => {
  return items.value.slice(visibleItems.value);
});

watch(
  () => slots.default && slots.default(),
  (newItems) => {
    items.value = (newItems as VNode[]).filter(
      (node) => node.type !== Comment && node.type !== Fragment,
    );
    findSelectedItemName();
  },
);
watch(listWidth, (newWidth) => {
  // Measure the children.
  calculateListOverflow(newWidth);
});

const calculateListOverflow = (availableWidth: number) => {
  const children = navList.value?.children;
  if (children) {
    let totalWidth = 0;
    const widths = [];
    const extraWidth = 48;
    const gap = 16; // gap between items
    let safeNum = 0;
    let overflows = false;

    for (const child of Array.from(children)) {
      if (!child.classList.contains("btn-group")) {
        const text = child.querySelector(".text");
        if (text) {
          const width = text.getBoundingClientRect().width + gap;
          totalWidth += width;

          if (Math.floor(totalWidth) + extraWidth >= availableWidth) {
            safeNum = widths.length;
            overflows = true;
            break;
          }
          widths.push(width);
        }
      }
    }
    if (overflows) {
      visibleItems.value = safeNum;
    } else {
      visibleItems.value = items.value.length;
    }
  }
};

watch(listHeight, (newHeight, oldHeight) => {
  if (newHeight > (oldHeight || 0) && oldHeight !== 0) {
    if (Math.abs(newHeight - oldHeight) > 1) {
      calculateListOverflow(listWidth.value);
    }
  }
});
const findSelectedItemName = () => {
  const name = items.value.find(
    (item) => item.props && item.props.class.includes("active"),
  );
  if (name && name.props) {
    activeItemTitle.value = name.props.title;
  }
};

const activeItemTitle = ref<string>("");

// TODO: If overflowing items are selected, move the ellipsis around and have the selected item showing?
</script>

<template>
  <ul
    class="overflow-tab-list nav nav-underline nav-justified justify-content-center justify-content-evenly mb-lg-2"
    ref="navList"
  >
    <component
      v-for="(item, index) in nonOverflowingItems"
      :is="item"
      :key="index"
    />
    <b-dropdown
      v-if="overFlowingItems.length"
      no-caret
      variant="light"
      class="more-btn"
    >
      <template #button-content>
        <material-symbol name="more_horiz" />
      </template>
      <b-dropdown-item v-for="(item, index) in overFlowingItems" :key="index">
        <component :is="item" />
      </b-dropdown-item>
    </b-dropdown>
  </ul>
  <h6 class="mt-3" v-if="overFlowingItems.length && activeItemTitle">
    {{ activeItemTitle }}
  </h6>
</template>

<style lang="less">
@import "../assets/less/breakpoints";
@import "../assets/less/bootstrap-custom";
.overflow-tab-list {
  &.nav-underline {
    border-bottom: 1px solid var(--bs-border-color);
    .nav-link {
      color: color-mix(
        in oklch,
        var(--cp-color-green-600),
        var(--bs-gray-700) 50%
      );
      //color: var(--cp-color-green-700);
      min-height: calc(var(--cp-grid-base) * 11); // 44px
      @media (min-width: @breakpoint-sm) {
        padding-top: var(--cp-spacing-md);
        padding-bottom: var(--cp-spacing-md);
      }
      @media (min-width: @breakpoint-md) {
        font-size: var(--cp-font-size-h4);
      }
      &.active {
        font-weight: var(--cp-font-weight-medium);
        border-bottom-color: var(--cp-color-primary);
        color: var(--cp-color-green-800);
      }
      &:hover {
        color: var(--cp-color-green-700);
      }
    }
    .dropdown-item {
      .nav-link {
        border-bottom: none;
      }
    }
  }

  .more-btn .btn.btn-light {
    .btn-icon();
  }
  .more-btn {
    &:has(a.active) {
      box-sizing: border-box;
      border-bottom: 2px solid var(--cp-color-primary);
    }
  }
}
</style>
