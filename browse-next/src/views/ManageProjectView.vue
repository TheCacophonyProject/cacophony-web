<script setup lang="ts">
import SectionHeader from "@/components/SectionHeader.vue";
import { computed } from "vue";
import { useRoute } from "vue-router";
import OverflowingTabList from "@/components/OverflowingTabList.vue";

const route = useRoute();
const activeTabName = computed(() => {
  return route.name;
});

const navLinkClasses = ["nav-item", "nav-link", "border-0"];
</script>
<template>
  <section-header>Manage project</section-header>
  <div class="px-3 p-md-0">
    <p>
      Add or remove users who have access to this project, change the default
      tags that users of this project see when tagging tracks.
    </p>
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
      >Users</router-link
    >
    <router-link
      :class="[
        ...navLinkClasses,
        { active: activeTabName === 'project-tag-settings' },
      ]"
      title="Tag settings"
      :to="{
        name: 'project-tag-settings',
      }"
      >Tags</router-link
    >
    <router-link
      :class="[
        ...navLinkClasses,
        { active: activeTabName === 'project-label-settings' },
      ]"
      title="Label settings"
      :to="{
        name: 'project-label-settings',
      }"
      >Labels</router-link
    >
    <router-link
      :class="[
        ...navLinkClasses,
        { active: activeTabName === 'project-misc-settings' },
      ]"
      title="Other settings"
      :to="{
        name: 'project-misc-settings',
      }"
      >Other settings</router-link
    >
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
  <div class="py-3">
    <router-view />
  </div>
</template>
<style lang="less" scoped>
.group-name {
  text-transform: uppercase;
  color: #aaa;
  font-family: "Roboto Medium", "Roboto Regular", Roboto, sans-serif;
  font-weight: 500;
  // font-size: var(--bs-body-font-size);
  // FIXME - Use modified bs-body-font-size?
  font-size: 14px;
}
h1 {
  font-family: "Roboto Bold", "Roboto Regular", "Roboto", sans-serif;
  font-size: 22px;
  font-weight: 700;
  color: #444;
}
h2 {
  font-family: "Roboto Medium", "Roboto Regular", "Roboto", sans-serif;
  font-weight: 500;
  color: #444;
  font-size: 17px;
}

.nav-item.active {
  background: unset;
  border-bottom: 3px solid #6dbd4b !important;
}
</style>
