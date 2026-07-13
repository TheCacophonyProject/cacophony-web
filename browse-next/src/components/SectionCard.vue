<script setup lang="ts">
import { computed, getCurrentInstance } from "vue";

const instance = getCurrentInstance();
const hasHeader = computed<boolean>(() => {
  return instance?.slots["header-title"] !== undefined;
});
</script>

<template>
  <div class="section-card">
    <header
      v-if="hasHeader"
      class="section-card__header px-3 px-md-4 d-flex justify-content-between align-items-center"
    >
      <h4 class="h4 m-0">
        <slot name="header-title" />
      </h4>
      <slot name="header-action" />
    </header>
    <main class="section-card__content py-3 py-md-4 px-3 px-md-4">
      <slot></slot>
    </main>
  </div>
</template>

<style scoped lang="less">
@import "../assets/less/elevation.less";
.section-card {
  background-color: #fff;
  border-radius: var(--bs-border-radius-lg);
  .standard-shadow();
  &__header {
    border-bottom: 1px solid #eee;
    @media screen and (max-width: 575px) {
      height: 52px;
    }
    @media screen and (min-width: 576px) and (max-width: 767px) {
      height: 56px;
    }
    @media screen and (min-width: 768px) {
      height: 68px;
    }
  }
  &__content {
  }
}
</style>
