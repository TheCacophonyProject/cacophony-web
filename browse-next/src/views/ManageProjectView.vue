<script setup lang="ts">
import SectionHeader from "@/components/SectionHeader.vue";
import { computed } from "vue";
import { useRoute } from "vue-router";
import OverflowingTabList from "@/components/OverflowingTabList.vue";

const route = useRoute();
const activeTabName = computed(() => {
  return route.name;
});

const navLinkClasses = ["nav-item", "nav-link"];
</script>
<template>
  <section-header :shrink-bottom-spacing="true">Manage project</section-header>
  <div class="px-3 p-md-0">
    <!--    <b-alert :model-value="true" variant="light" class="mb-3">
      Add or remove users who have access to this project, change the default
      tags and labels that users of this project see when tagging recordings.
      <br />Customise which tags you'd like your users to see on your project
      dashboard.
    </b-alert>-->
    <!--    <p>-->
    <!--      If I'm the only user, and there are no devices, and no recordings, then we-->
    <!--      should show the setup screen-->
    <!--    </p>-->
    <!--    <p>TODO: Would be nice to have the option of renaming the project here?</p>-->
  </div>
  <overflowing-tab-list>
    <router-link
      :class="[
        ...navLinkClasses,
        { active: activeTabName === 'project-users' },
      ]"
      title="Users"
      :to="{
        name: 'project-users',
      }"
    >
      <span class="text"> Users </span>
    </router-link>
    <router-link
      :class="[
        ...navLinkClasses,
        { active: activeTabName === 'project-tagging-settings' },
      ]"
      title="Tagging settings"
      :to="{
        name: 'project-tagging-settings',
      }"
    >
      <span class="text">
        Tag<span class="d-none d-sm-inline-block">ging</span>
        <span class="d-sm-none">s</span>
      </span>
    </router-link>
    <router-link
      :class="[
        ...navLinkClasses,
        { active: activeTabName === 'project-label-settings' },
      ]"
      title="Label settings"
      :to="{
        name: 'project-label-settings',
      }"
    >
      <span class="text"> Labels </span>
    </router-link>
    <router-link
      :class="[
        ...navLinkClasses,
        { active: activeTabName === 'project-misc-settings' },
      ]"
      title="Other settings"
      :to="{
        name: 'project-misc-settings',
      }"
    >
      <span class="text">
        <span
          >Other<span class="d-none d-sm-inline-block"
            >&nbsp;settings</span
          ></span
        >
      </span>
    </router-link>
    <!--    <router-link-->
    <!--      :class="[-->
    <!--        ...navLinkClasses,-->
    <!--        { active: activeTabName === 'fix-project-locations' },-->
    <!--      ]"-->
    <!--      title="Fix locations"-->
    <!--      :to="{-->
    <!--        name: 'fix-project-locations',-->
    <!--      }"-->
    <!--      >Fix locations</router-link-->
    <!--    >-->
  </overflowing-tab-list>
  <div class="py-3 d-flex flex-fill flex-column">
    <router-view />
  </div>
</template>

<style scoped lang="less">
@import "../assets/less/breakpoints";
.tabs {
  @media (min-width: @breakpoint-md) {
    margin-top: -1rem;
  }
}
</style>
