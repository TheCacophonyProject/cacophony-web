<template>
  <div class="scrubber" ref="scrubber" style="user-select: none">
    <slot :progressZeroToOne="progressZeroToOne" :width="scrubberWidth"></slot>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useElementBounding, useElementSize } from "@vueuse/core";

const getXOffsetForPointerEvent = (
  e: MouseEvent | PointerEvent | TouchEvent
): number => {
  if ((e as PointerEvent).clientX !== undefined) {
    return (e as PointerEvent).clientX;
  } else if (
    (e as TouchEvent).touches !== undefined &&
    (e as TouchEvent).touches.length
  ) {
    return (e as TouchEvent).touches[0].clientX;
  }
  return 0;
};

let xOffset = 0;
let scrubberLeftOffset = 0;

const progressZeroToOne = ref(0);
const scrubberWidth = ref(0);
const scrubber = ref<HTMLDivElement | null>(null);
const { width } = useElementSize(scrubber);
const { left } = useElementBounding(scrubber);
const emit = defineEmits<{
  (e: "width-change", width: number): void;
  (e: "change", scrubberValue: number): void;
  (e: "scrub-start", target: EventTarget | null): void;
  (e: "scrub-end"): void;
}>();

watch(width, (newWidth) => {
  scrubberWidth.value = newWidth;
  emit("width-change", scrubberWidth.value);
});

watch(left, (newLeft) => {
  scrubberLeftOffset = newLeft;
});

onMounted(() => {
  scrubber.value?.addEventListener("mousedown", beginScrub, {
    passive: false,
  });
  scrubber.value?.addEventListener("touchstart", beginScrub, {
    passive: false,
  });
});

const onScrubMove = (e: MouseEvent | TouchEvent) => {
  const newXOffset = getXOffsetForPointerEvent(e) - scrubberLeftOffset;
  if (xOffset !== newXOffset) {
    xOffset = newXOffset;
    progressZeroToOne.value = Math.min(
      1,
      Math.max(0, xOffset / scrubberWidth.value)
    );
    emit("change", progressZeroToOne.value);
  }
};

const onScrubStart = (e: MouseEvent | TouchEvent): EventTarget | null => {
  emit("scrub-start", e.target);
  return e.target;
};

const isTouchOrLeftMouse = (e: MouseEvent | TouchEvent): boolean => {
  return !("button" in e) || (e as MouseEvent).button === 0;
};

const beginScrub = (e: MouseEvent | TouchEvent) => {
  if (isTouchOrLeftMouse(e)) {
    e.preventDefault();
    const scrubberBounds = scrubber.value?.getBoundingClientRect();
    if (scrubberBounds) {
      if (scrubberWidth.value !== scrubberBounds.width) {
        scrubberWidth.value = scrubberBounds.width;
        emit("width-change", scrubberWidth.value);
      }
      scrubberLeftOffset = scrubberBounds.left;
      window.addEventListener("mousemove", onScrubMove, { passive: false });
      window.addEventListener("touchmove", onScrubMove, { passive: false });
      window.addEventListener("touchend", endScrub, { passive: false });
      window.addEventListener("mouseup", endScrub, { passive: false });
      onScrubStart(e);
      onScrubMove(e);
    }
  }
};

const endScrub = (e: MouseEvent | TouchEvent) => {
  if (isTouchOrLeftMouse(e)) {
    window.removeEventListener("mousemove", onScrubMove);
    window.removeEventListener("touchmove", onScrubMove);
    window.removeEventListener("touchend", endScrub);
    window.removeEventListener("mouseup", endScrub);
    emit("scrub-end");
  }
};
</script>
<style lang="less" scoped>
.scrubber {
  position: relative;
  width: 100%;
  left: 0;
  right: 0;
  min-height: 1px;
}
</style>