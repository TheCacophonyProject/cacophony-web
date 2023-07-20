<template>
  <img
    :src="src"
    :onerror="handleImageError"
    :onload="handleImageLoaded"
    :onloadstart="handleImageLoadStart"
    :width="width"
    :height="height"
    :alt="alt"
    :class="$attrs['class']"
  />
  <div
    class="d-flex align-items-center w-100 h-100 justify-content-center position-absolute top-0 left-0"
    :class="$attrs['class']"
    v-if="loading"
  >
    <b-spinner small />
  </div>
</template>
<script lang="ts">
// Allow user-defined classes to be properly passed through
export default {
  inheritAttrs: false,
};
</script>
<script lang="ts" setup>
import { ref } from "vue";

const {
  src,
  width,
  height,
  alt = "",
} = defineProps<{
  src: string;
  width: number | string;
  height: number | string;
  alt?: string;
}>();

const emit = defineEmits<{
  (e: "image-not-found"): void;
}>();

const loading = ref<boolean>(false);

const handleImageError = (e: ErrorEvent) => {
  loading.value = false;
  (e.target as HTMLImageElement).classList.remove("image-loading");
  (e.target as HTMLImageElement).classList.add("image-not-found");
  emit("image-not-found");
};

const handleImageLoaded = (e: Event) => {
  loading.value = false;
  (e.target as HTMLImageElement).classList.remove("image-loading");
};

const handleImageLoadStart = (e: Event) => {
  loading.value = true;
  (e.target as HTMLImageElement).classList.add("image-loading");
  (e.target as HTMLImageElement).classList.remove("image-not-found");
};
</script>

<style scoped lang="less">
img {
  background: transparent;
  position: relative;
  transition: opacity ease-in 0.3s;
  color: unset;
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
