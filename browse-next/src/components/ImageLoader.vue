<script lang="ts">
// Allow user-defined classes to be properly passed through
export default {
  inheritAttrs: false,
};
</script>
<script lang="ts" setup>
import { onMounted, ref, watch, type WatchStopHandle } from "vue";
import { useIntersectionObserver } from "@vueuse/core";

const props = withDefaults(
  defineProps<{
    src: string;
    width: number | string;
    height: number | string;
    alt?: string;
  }>(),
  { alt: "" }
);

const emit = defineEmits<{
  (e: "image-not-found"): void;
}>();

const loading = ref<boolean>(true);

const handleImageError = (e: ErrorEvent) => {
  loading.value = false;
  image.value?.classList.remove("image-loading");
  image.value?.classList.add("image-not-found");
  image.value?.classList.remove("uncached");
  image.value?.removeEventListener("load", handleImageLoaded);
  image.value?.removeEventListener("error", handleImageError);
  emit("image-not-found");
};

const handleImageLoaded = (e: Event) => {
  loading.value = false;
  image.value?.classList.remove("image-loading");
  image.value?.classList.remove("uncached");
  image.value?.removeEventListener("load", handleImageLoaded);
  image.value?.removeEventListener("error", handleImageError);
};

const image = ref<HTMLImageElement>();
const elementIsVisible = ref(false);
const initImageLoadHandlers = () => {
  (image.value as HTMLImageElement).src = props.src;
  setTimeout(() => {
    if (loading.value && image.value) {
      image.value.classList.add("image-loading");
      image.value.classList.add("uncached");
    }
  }, 100);
  image.value?.classList.remove("image-not-found");
  image.value?.addEventListener("load", handleImageLoaded);
  image.value?.addEventListener("error", handleImageError);
};
const stopper = ref<(() => void) | null>(null);
const watcher = ref<WatchStopHandle>();

const elementBecameVisible = (next: boolean) => {
  watcher.value && watcher.value();
  initImageLoadHandlers();
};
onMounted(() => {
  if (image.value) {
    const isVisible =
      image.value?.getBoundingClientRect().top < window.innerHeight;
    if (isVisible) {
      initImageLoadHandlers();
    } else {
      const { stop } = useIntersectionObserver(
        image,
        (intersectionObserverEntries) => {
          let isIntersecting = elementIsVisible.value;

          // Get the latest value of isIntersecting based on the entry time
          let latestTime = 0;
          for (const entry of intersectionObserverEntries) {
            if (entry.time >= latestTime) {
              latestTime = entry.time;
              isIntersecting = entry.isIntersecting;
            }
          }
          elementIsVisible.value = isIntersecting;
        },
        {
          root: null,
          window,
          threshold: 0,
        }
      );
      watcher.value = watch(elementIsVisible, elementBecameVisible);
      stopper.value = stop;
    }
  }
});
</script>
<template>
  <div class="position-relative">
    <img
      :src="''"
      :width="props.width"
      :height="props.height"
      ref="image"
      :alt="props.alt"
      :class="$attrs['class']"
    />
    <div
      :style="{ width: `${props.width}px`, height: `${props.height}px` }"
      class="d-flex align-items-center justify-content-center position-absolute top-0 left-0"
      :class="$attrs['class']"
      v-if="loading"
    >
      <b-spinner small />
    </div>
  </div>
</template>
<style scoped lang="less">
img {
  background: transparent;
  position: relative;
  color: unset;
  &.uncached {
    transition: opacity ease-in 0.3s;
  }
  &.selected {
    filter: invert(1) drop-shadow(0 0.5px 2px rgba(0, 0, 0, 0.7));
  }
  &.image-loading {
    opacity: 0;
    color: transparent;
  }
  &::after {
    border-radius: 4px;
    position: absolute;
    content: "";
    background: #666;
    width: 100%;
    height: 100%;
    left: 0;
    top: 0;
    display: inline-block;
  }
  &.image-not-found {
    &::after {
      border-radius: 0;
    }
  }
}
</style>
