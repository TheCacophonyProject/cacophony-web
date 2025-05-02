<template>
  <div class="scrubber" ref="scrubber" style="user-select: none">
    <slot :progressZeroToOne="progressZeroToOne" :width="scrubberWidth"></slot>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useElementBounding, useElementSize } from "@vueuse/core";

const getXOffsetForPointerEvent = (
  e: MouseEvent | PointerEvent | TouchEvent,
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

const getYOffsetForPointerEvent = (
  e: MouseEvent | PointerEvent | TouchEvent,
): number => {
  if ((e as PointerEvent).clientY !== undefined) {
    return (e as PointerEvent).clientY;
  } else if (
    (e as TouchEvent).touches !== undefined &&
    (e as TouchEvent).touches.length
  ) {
    return (e as TouchEvent).touches[0].clientY;
  }
  return 0;
};

let xOffset = 0;
let scrubberLeftOffset = 0;
let scrubberTopOffset = 0;
let scrubberStartLeftOffset = 0;
let scrubberStartTopOffset = 0;

const progressZeroToOne = ref(0);
const scrubberWidth = ref(0);
const scrubber = ref<HTMLDivElement | null>(null);
const { width } = useElementSize(scrubber);
const { left, top } = useElementBounding(scrubber);
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
watch(top, (newTop) => {
  scrubberTopOffset = newTop;
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
  const xPos = getXOffsetForPointerEvent(e);
  const yPos = getYOffsetForPointerEvent(e);
  const newXOffset = xPos - scrubberLeftOffset;
  const newYOffset = yPos - scrubberTopOffset;
  // If the scrub just started, and the y offset is much greater than the x offset,
  // assume we're actually in the middle of a scroll gesture, and don't prevent default.

  // If the x offset is with 44px of the edge of the screen, prevent default to prevent
  // horizontal scrubbing triggering the browser back/forward gestures.
  // Also if we detect significant horizontal motion from the start of the scrub, we want to prevent scrolling.
  const viewportWidth = window.innerWidth;
  if (
    xPos < 44 ||
    xPos > viewportWidth - 44 ||
    Math.abs(newXOffset - scrubberStartLeftOffset) > 44
  ) {
    e.preventDefault();
  }

  if (xOffset !== newXOffset) {
    xOffset = newXOffset;
    if (Math.abs(newYOffset - scrubberStartTopOffset) < 44) {
      progressZeroToOne.value = Math.min(
        1,
        Math.max(0, xOffset / scrubberWidth.value),
      );
      emit("change", progressZeroToOne.value);
    } else {
      // scrolling, so don't process horizontal scrubbing, which is mostly accidental.
    }
  }
};

const onScrubStart = (e: MouseEvent | TouchEvent): EventTarget | null => {
  const xPos = getXOffsetForPointerEvent(e);
  const yPos = getYOffsetForPointerEvent(e);
  scrubberStartLeftOffset = xPos - scrubberLeftOffset;
  scrubberStartTopOffset = yPos - scrubberTopOffset;
  emit("scrub-start", e.target);
  return e.target;
};

const isTouchOrLeftMouse = (e: MouseEvent | TouchEvent): boolean => {
  return !("button" in e) || (e as MouseEvent).button === 0;
};

const beginScrub = (e: MouseEvent | TouchEvent) => {
  if (isTouchOrLeftMouse(e)) {
    const scrubberBounds = scrubber.value?.getBoundingClientRect();
    if (scrubberBounds) {
      if (scrubberWidth.value !== scrubberBounds.width) {
        scrubberWidth.value = scrubberBounds.width;
        emit("width-change", scrubberWidth.value);
      }
      scrubberLeftOffset = scrubberBounds.left;
      scrubberTopOffset = scrubberBounds.top;
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
