<script setup lang="ts">
import { pinSideNav } from "@models/LoggedInUser";
import type { SelectedProject } from "@models/LoggedInUser";
import { useRoute } from "vue-router";
import { computed, inject } from "vue";
import type { Ref } from "vue";
import { currentSelectedProject } from "@models/provides";
import {MaterialSymbol} from "@dbetka/vue-material-symbols";
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
    <h4 class="section-header__group-name h5 text-uppercase text-body-tertiary my-0 m-sm-0 mb-sm-2 mx-3 overflow-hidden text-nowrap text-truncate" v-if="showProjectName">
      <span>{{ currentProjectName }}</span>
    </h4>
    <span v-else></span>
    <div class="d-flex align-items-center m-sm-0">
      <button
        type="button"
        class="btn toggle-nav d-sm-none d-flex align-items-center "
        @click.stop.prevent="pinSideNav = !pinSideNav"
      >
        <MaterialSymbol name="menu"/>
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
@import "../assets/less/breakpoints";
@import "../assets/less/spacing";
@import "../assets/less/elevation";
.section-header {
  @media (max-width: @breakpoint-xs-max) {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    z-index: 1001;
    background: var(--bs-white);
    height: calc(var(--grid--base) * 12);
    .header-shadow();
  }
}
</style>
