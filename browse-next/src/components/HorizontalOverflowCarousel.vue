<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, onUpdated, ref } from "vue";
import { useElementSize } from "@vueuse/core";
const container = ref<HTMLDivElement | null>(null);
const innerScrollContainer = ref<HTMLDivElement | null>(null);

// TODO - Don't do horizontal scrolling of contents after a certain point -
//  stack items as per design?

const { width } = useElementSize(container);
const props = withDefaults(defineProps<{ minWidth?: number }>(), {
  minWidth: 360,
});

const shouldOverflow = computed<boolean>(() => {
  return width.value > props.minWidth;
});

const evaluateScrollOverflow = () => {
  const inner = innerScrollContainer.value;
  const outer = container.value;
  if (inner && outer) {
    const width = inner.getBoundingClientRect().width;
    const atEnd = inner.scrollWidth - inner.scrollLeft === width;
    const atStart = inner.scrollLeft === 0;
    const hasOverflow = inner.scrollWidth > width;

    if (hasOverflow) {
      if (!atEnd) {
        // Add end shadow
        outer.classList.add("end-overflow");
      } else {
        // remove end shadow
        outer.classList.remove("end-overflow");
      }

      if (!atStart) {
        // add start shadow
        outer.classList.add("start-overflow");
      } else {
        // remove start shadow
        outer.classList.remove("start-overflow");
      }
    } else {
      // remove both shadows
      outer.classList.remove("start-overflow");
      outer.classList.remove("end-overflow");
    }
  }
};
onUpdated(() => {
  if (innerScrollContainer.value) {
    // This will make the scrollbar flash as visible on browsers where it is usually hidden,
    // if the content is wide enough to need to overflow.
    innerScrollContainer.value.scrollTo(1, 0);
    innerScrollContainer.value.scrollTo(0, 0);
    evaluateScrollOverflow();
  }
});
onMounted(() => {
  window.addEventListener("resize", evaluateScrollOverflow);
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", evaluateScrollOverflow);
});
</script>
<template>
  <div ref="container" :class="{ outer: shouldOverflow }">
    <div
      :class="{ inner: shouldOverflow }"
      ref="innerScrollContainer"
      @scroll="evaluateScrollOverflow"
    >
      <slot></slot>
    </div>
  </div>
</template>
<style scoped lang="less">
.outer {
  overflow: hidden;
  position: relative;
  &::before,
  &::after {
    content: "";
    position: absolute;
    display: block;
    width: 10px;
    top: -2px;
    bottom: -2px;
    z-index: 1000;
    opacity: 0;
    transition: opacity 0.15s linear;
  }
  &::before {
    left: 0;
    box-shadow: 5px 0 5px 0 rgba(0, 0, 0, 0.1) inset;
  }
  &::after {
    right: 0;
    box-shadow: -5px 0 5px 0 rgba(0, 0, 0, 0.1) inset;
  }

  &.start-overflow {
    &::before {
      opacity: 1;
    }
  }
  &.end-overflow {
    &::after {
      opacity: 1;
    }
  }
}
.inner {
  overflow-x: auto;
  scrollbar-color: #999 transparent;
  &::-webkit-scrollbar {
    height: 0.5em;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.25);
    border-radius: 0.25em;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
    box-shadow: none;
    outline: none;
  }
}
</style>
