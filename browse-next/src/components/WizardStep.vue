<script setup lang="ts">
const _props = defineProps<{ visible?: boolean }>();
const emit = defineEmits<{
  (e: "validation-state-change", payload: boolean): void;
}>();

const emitValidChange = (isValid: boolean) => {
  emit("validation-state-change", isValid);
};
</script>

<template>
  <div v-if="visible">
    <slot v-bind="{ emitValidChange }"></slot>
  </div>
</template>

<style scoped lang="less"></style>
