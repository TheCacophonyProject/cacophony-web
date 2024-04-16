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

const navList = ref<HTMLUListElement>();
const slots = useSlots();
const items = ref<VNode[]>([]);

onBeforeMount(() => {
  items.value = (slots.default && slots.default()) || [];
  visibleItems.value = items.value.length;
  findSelectedItemName();
});

const { width: listWidth, height: listHeight } = useElementSize(navList);
const visibleItems = ref<number>(-1);

const nonOverflowingItems = computed(() => {
  return items.value.slice(0, visibleItems.value);
});
const overFlowingItems = computed(() => {
  return items.value
    .slice(visibleItems.value)
    .filter((node) => node.type !== Comment && node.type !== Fragment);
});

watch(
  () => slots.default && slots.default(),
  (newItems) => {
    items.value = newItems as VNode[];
    findSelectedItemName();
  }
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
    const extraWidth = 34;
    let safeNum = 0;
    let overflows = false;
    for (const child of Array.from(children)) {
      if (!child.classList.contains("btn-group")) {
        const width = child.getBoundingClientRect().width;
        totalWidth += width;
        if (totalWidth + extraWidth > availableWidth) {
          safeNum = widths.length;
          overflows = true;
          break;
        }
        widths.push(width);
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
    (item) => item.props && item.props.class.includes("active")
  );
  if (name && name.props) {
    activeItemTitle.value = name.props.title;
  }
};

const activeItemTitle = ref<string>("");
</script>

<template>
  <ul
    class="nav nav-tabs justify-content-center justify-content-evenly overflow-tab-list"
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
        <font-awesome-icon icon="ellipsis" color="#666" />
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
.overflow-tab-list {
  min-height: 42px;
}
.more-btn .btn.btn-light {
  background-color: unset;
  border: unset;
}
.more-btn {
  border-radius: 0;
  &:has(a.active) {
    box-sizing: border-box;
    border-bottom: 3px solid #6dbd4b;
  }
}
</style>
