<script setup lang="ts">
import { pinSideNav } from "@models/LoggedInUser";
import type { SelectedProject } from "@models/LoggedInUser";
import { useRoute } from "vue-router";
import { computed, inject } from "vue";
import type { Ref } from "vue";
import { currentSelectedProject } from "@models/provides";
const route = useRoute();
const currentProject = inject(
  currentSelectedProject,
) as Ref<SelectedProject | null>;
const showProjectName = computed<boolean>(() => !!route.params.projectName);
const currentProjectName = computed<string>(() => {
  return currentProject.value?.groupName || "";
});
</script>
<template>
  <div
    class="section-header d-flex flex-row-reverse d-sm-block align-items-center justify-content-between pt-sm-4"
  >
    <h4 class="section-header__group-name h5 text-uppercase text-body-tertiary my-0 m-sm-0 mb-sm-2 mx-3" v-if="showProjectName">
      <span>{{ currentProjectName }}</span>
    </h4>
    <span v-else></span>
    <div class="d-flex align-items-center ms-2 m-sm-0">
      <button
        type="button"
        class="btn toggle-nav d-sm-none"
        @click.stop.prevent="pinSideNav = !pinSideNav"
      >
        <font-awesome-icon icon="bars" />
      </button>
      <h1
        class="h1 m-0 ms-1 mb-sm-4 ms-sm-0 d-flex flex-row flex-fill justify-content-between"
      >
        <slot></slot>
      </h1>
    </div>
  </div>
</template>
<style lang="less" scoped>
.section-header {
  @media (max-width: 575px) {
    background: white;
    height: 48px;
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.1);
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    z-index: 1001;
  }
}
</style>
