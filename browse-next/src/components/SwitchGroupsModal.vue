<script setup lang="ts">
import { BModal } from "bootstrap-vue-3";
import {
  UserGroups,
  currentSelectedGroup,
  showSwitchGroup,
} from "@models/LoggedInUser";
import { computed, onBeforeMount } from "vue";
import { useRoute } from "vue-router";
import { urlNormaliseGroupName } from "@/utils";

onBeforeMount(() => {
  showSwitchGroup.enabled = true;
});

const nextRoute = (groupName: string) => {
  const currentRoute = useRoute();
  if (currentRoute.params.groupName) {
    return {
      ...currentRoute,
      params: {
        ...currentRoute.params,
        groupName: urlNormaliseGroupName(groupName),
      },
    };
  } else {
    // On a non-group scoped route, so reset to dashboard view
    return {
      ...currentRoute,
      name: "dashboard",
      params: {
        ...currentRoute.params,
        groupName: urlNormaliseGroupName(groupName),
      },
    };
  }
};
const currentGroupName = computed<string>(() => {
  return (
    (currentSelectedGroup.value && currentSelectedGroup.value.groupName) || ""
  );
});
</script>
<template>
  <b-modal
    title="Switch group"
    v-model="showSwitchGroup.enabled"
    centered
    hide-footer
    @hidden="showSwitchGroup.visible = false"
  >
    <div class="list-group">
      <router-link
        :class="[
          'list-group-item',
          { 'list-group-item-action': groupName !== currentGroupName },
          { disabled: groupName === currentGroupName },
        ]"
        v-for="({ groupName, id }, index) in UserGroups"
        :key="id"
        :to="nextRoute(groupName)"
        :aria-disabled="groupName === currentGroupName"
        :tabindex="groupName === currentGroupName ? -1 : index"
        @click="showSwitchGroup.enabled = false"
      >
        {{ groupName }}
        <span v-if="groupName === currentGroupName">(selected)</span>
      </router-link>
    </div>
  </b-modal>
</template>
