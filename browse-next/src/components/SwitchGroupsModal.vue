<script setup lang="ts">
import { BModal } from "bootstrap-vue-3";
import { UserGroups, currentSelectedGroup } from "@models/LoggedInUser";
import { computed, ref } from "vue";
import { useRoute } from "vue-router";

const showSwitchGroups = ref(true);
const nextRoute = (groupName: string) => {
  const currentRoute = useRoute();
  return {
    ...currentRoute,
    params: {
      ...currentRoute.params,
      groupName,
    },
  };
};
const currentGroupName = computed<string>(() => {
  return (
    (currentSelectedGroup.value && currentSelectedGroup.value.groupName) || ""
  );
});
</script>
<template>
  <b-modal title="Switch group" v-model="showSwitchGroups" centered hide-footer>
    <div class="list-group">
      <router-link
        :class="[
          'list-group-item',
          { 'list-group-item-action': groupName !== currentGroupName },
          { disabled: groupName === currentGroupName }
        ]"
        v-for="({ groupName, id }, index) in UserGroups"
        :key="id"
        :to="nextRoute(groupName)"
        :aria-disabled="groupName === currentGroupName"
        :tabindex="groupName === currentGroupName ? -1 : index"
      >
        {{ groupName }}
        <span v-if="groupName === currentGroupName">(selected)</span>
      </router-link>
    </div>
  </b-modal>
</template>
