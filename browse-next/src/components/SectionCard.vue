<script setup lang="ts">
import {computed, getCurrentInstance} from "vue";

const instance = getCurrentInstance();
const hasHeader = computed<boolean>(() => {
  return instance?.slots["header-title"] !== undefined;
});
</script>

<template>
<div class="section-card">
  <header v-if="hasHeader" class="section-card__header p-3 d-flex justify-content-between align-items-baseline">
    <h4 class="h6 m-0">
      <slot name="header-title" />
    </h4>
    <slot name="header-action" />
  </header>
  <main class="section-card__content p-3">
    <slot></slot>
  </main>
</div>
</template>

<style scoped lang="less">
@import "../assets/mixins.less";
.section-card {
  background-color: #fff;
  border-radius: 0.25rem;
  .standard-shadow();
  &__header {
    border-bottom: 1px solid #eee;
  }
  &__content {
  }
}
</style>