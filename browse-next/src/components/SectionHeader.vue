<script setup lang="ts">
import { currentSelectedGroup, pinSideNav } from "@models/LoggedInUser";
import { useRoute } from "vue-router";
import { computed } from "vue";
const route = useRoute();
const showGroupName = computed<boolean>(() => !!route.params.groupName);
</script>
<template>
  <div
    class="section-header d-flex flex-row-reverse d-md-block align-items-center justify-content-between pt-md-3"
  >
    <h4 class="group-name my-0 m-md-0 mb-md-2 mx-3" v-if="showGroupName">
      <span>{{ currentSelectedGroup.groupName }}</span>
    </h4>
    <span v-else></span>
    <div class="d-flex align-items-center ms-2 m-md-0">
      <button
        type="button"
        class="btn toggle-nav d-md-none"
        @click.stop.prevent="pinSideNav = true"
      >
        <font-awesome-icon icon="bars" />
      </button>
      <h2 class="m-0 ms-1 mb-md-4 ms-md-0"><slot></slot></h2>
    </div>
  </div>
</template>
<style lang="less" scoped>
.section-header {
  background: white;
  height: 50px;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.1);
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  h2 {
    font-size: 18px;
  }
  .group-name {
    font-size: 12px;
  }
  @media (min-width: 768px) {
    position: unset;
    background: none;
    box-shadow: none;
    height: unset;
    h2 {
      font-size: 22px;
    }
    .group-name {
      font-size: 14px;
    }
  }
}

.group-name {
  text-transform: uppercase;
  color: #aaa;
  font-family: "Roboto Medium", "Roboto Regular", var(--bs-body-font-family);
  font-weight: 500;
}
h2 {
  font-family: "Roboto Bold", "Roboto Regular", var(--bs-body-font-family);
  font-weight: 700;
  color: #444;
}
</style>
