<script setup lang="ts">
import SectionHeader from "@/components/SectionHeader.vue";
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();
const activeTabName = computed(() => {
  return route.name;
});

const navLinkClasses = ["nav-item", "nav-link", "border-0"];
</script>
<template>
  <section-header>Manage group</section-header>
  <div class="px-3 p-md-0">
    <p>
      Administrate group to add or remove users who have access to this group,
      change the default tags that users of this group see when tagging tracks.
    </p>
    <p>
      If I'm the only user, and there are no devices, and no recordings, then we
      should show the setup screen
    </p>
    <p>TODO: Would be nice to have the option of renaming the group here?</p>
  </div>
  <ul class="nav nav-tabs justify-content-md-center justify-content-evenly">
    <router-link
      :class="[...navLinkClasses, { active: activeTabName === 'group-users' }]"
      title="Users"
      :to="{
        name: 'group-users',
      }"
      >Users</router-link
    >
    <router-link
      :class="[
        ...navLinkClasses,
        { active: activeTabName === 'group-tag-settings' },
      ]"
      title="Tag settings"
      :to="{
        name: 'group-tag-settings',
      }"
      >Tag settings</router-link
    >
    <router-link
      :class="[
        ...navLinkClasses,
        { active: activeTabName === 'fix-station-locations' },
      ]"
      title="Fix locations"
      :to="{
        name: 'fix-station-locations',
      }"
      >Fix locations</router-link
    >
  </ul>
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
