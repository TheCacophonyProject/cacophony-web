<template>
  <div class="ml-4">
    <h2 class="tags-header">Recording Tags</h2>
    <div v-if="items.length === 0" class="no-tags">
      There are no tags for this recording
    </div>
    <b-table
      v-if="items.length > 0"
      :items="items"
      :fields="fields"
      striped
      responsive
    >
      <template v-slot:cell(startTime)="row">
        <span>{{
          `${Math.floor(
            (row.item.startTime - (row.item.startTime % 60)) / 60
          )}:${Math.floor(row.item.startTime % 60)
            .toString()
            .padStart(2, "0")}`
        }}</span>
      </template>
      <template v-slot:cell(replayButton)="row">
        <font-awesome-icon
          v-b-tooltip.hover="'Replay'"
          :icon="['fa', 'play']"
          size="2x"
          style="cursor: pointer"
          @click="$emit('replay', row.item.startTime)"
        />
      </template>

      <template v-slot:cell(deleteButton)="row">
        <font-awesome-icon
          v-b-tooltip.hover="'Delete tag'"
          icon="trash"
          size="2x"
          style="cursor: pointer"
          @click="$emit('deleteTag', row.item.tag.id)"
        />
      </template>
    </b-table>
  </div>
</template>

<script>
export default {
  name: "TagList",
  props: {
    items: {
      type: Array,
      required: true,
    },
  },
  data() {
    return {
      fields: [
        { key: "what", label: "Tag Value" },
        { key: "startTime", label: "Start Time" },
        { key: "who", label: "By Who" },
        { key: "when", label: "When" },
        { key: "replayButton", label: "" },
        { key: "deleteButton", label: "" },
      ],
    };
  },
  methods: {},
};
</script>

<style scoped>
.tags-header {
  margin-top: 20px;
}
</style>
