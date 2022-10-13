<script setup lang="ts">
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import CardTable from "./CardTable.vue";
import { computed } from "vue";
import type { ApiRecordingTagResponse } from "@typedefs/api/tag";
import type { CardTableItems } from "@/components/CardTableTypes";

const { recording } = defineProps<{
  recording?: ApiRecordingResponse;
}>();

const tableItems = computed<CardTableItems>(() => {
  return (recording?.tags || [])
    .map((tag: ApiRecordingTagResponse) => ({
      label: tag.detail,
      by: tag.taggerName || tag.automatic ? "Cacophony AI" : "-",
      when: new Date(tag.createdAt).toLocaleString(),
      _remove: "remove",
      __id: tag.id,
    }))
    .reduce(
      (acc: CardTableItems, item: Record<string, string | number>) => {
        for (const heading of Object.keys(item)) {
          if (!acc.headings.includes(heading)) {
            if (heading.startsWith("_")) {
              acc.headings.push("");
            } else {
              acc.headings.push(heading);
            }
          }
        }
        acc.values.push(Object.values(item));
        return acc;
      },
      {
        headings: [],
        values: [],
      }
    );
});
</script>
<template>
  <div v-if="recording" class="recording-labels">
    <h2 class="recording-labels-title fs-6">Recording labels</h2>
    <card-table :items="tableItems">
      <template #item="{ label, by, dateTime, deleteAction }">
        <div class="d-flex flex-row justify-content-between">
          <div>
            <div>{{ label }}</div>
            <div>{{ by }}</div>
            <div>{{ dateTime }}</div>
          </div>
          <button @click="() => deleteAction" class="delete-action btn">
            <font-awesome-icon icon="trash-can" />
          </button>
        </div>
      </template>
      <!--  TODO: Work out the best way of passing in a button with an action -->
    </card-table>
    <span>+ Add</span>
  </div>
</template>
<style lang="less" scoped>
.recording-labels-title {
  display: none;
  @media screen and (max-width: 1040px) {
    display: block;
  }
}
.recording-label {
  background: white;
}
.delete-action {
  color: #bbb;
}
</style>
