<script lang="ts">
// Allow user-defined classes to be properly passed through
export default {
  inheritAttrs: false,
};
</script>
<script lang="ts" setup>
import { onMounted, ref } from "vue";

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
  (e.target as HTMLImageElement).classList.remove("image-loading");
  (e.target as HTMLImageElement).classList.add("image-not-found");
  (e.target as HTMLImageElement).classList.remove("uncached");
  emit("image-not-found");
};

const handleImageLoaded = (e: Event) => {
  loading.value = false;
  (e.target as HTMLImageElement).classList.remove("image-loading");
  (e.target as HTMLImageElement).classList.remove("uncached");
};

const image = ref<HTMLImageElement>();
onMounted(() => {
  if (image.value) {
    setTimeout(() => {
      if (loading.value && image.value) {
        image.value.classList.add("image-loading");
        image.value.classList.add("uncached");
      }
    }, 100);
    image.value?.classList.remove("image-not-found");
    image.value?.addEventListener("load", handleImageLoaded);
    image.value?.addEventListener("error", handleImageError);
  }
});
</script>
<template>
  <div class="position-relative">
    <img
      :src="props.src"
      :width="props.width"
      :height="props.height"
      ref="image"
      :alt="props.alt"
      :class="$attrs['class']"
    />
    <div
      class="d-flex align-items-center w-100 h-100 justify-content-center position-absolute top-0 left-0"
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
