<template>
  <div>
    <h3>Your groups</h3>
    <p>
      Click on a group to view the last 24 hours of recordings in that group
    </p>

    <div id="group-list-container" style="max-height: 50vh; overflow-y: auto">
      <b-list-group>
        <HomeGroupItem
          v-for="(group, index) in orderedGroups"
          :key="index"
          :group="group"
        />
      </b-list-group>
    </div>
  </div>
</template>

<script lang="ts">
import { ApiGroupResponse } from "@typedefs/api/group";
import HomeGroupItem from "./HomeGroupItem.vue";

export default {
  name: "HomeGroups",
  components: { HomeGroupItem },
  props: {
    groups: {
      type: Array,
      required: true,
    },
  },
  computed: {
    orderedGroups: {
      get(): ApiGroupResponse[] {
        return [...this.groups].sort(
          (a: ApiGroupResponse, b: ApiGroupResponse) => {
            return a.groupName.toLowerCase() < b.groupName.toLowerCase()
              ? -1
              : 1;
          }
        );
      },
    },
  },
};
</script>

<style scoped></style>
