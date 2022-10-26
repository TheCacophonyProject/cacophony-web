<template>
  <table
    v-if="shouldRenderAsRows && displayedItems.values.length"
    class="card-table bg-white my-2"
    :class="{ compact }"
  >
    <thead>
      <tr>
        <th
          class="py-2 px-3"
          v-for="(heading, index) in displayedItems.headings"
          :key="`${heading}_${index}`"
        >
          {{ heading }}
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(row, rowIndex) in displayedItems.values" :key="rowIndex">
        <td
          :class="[
            compact ? 'py-2 px-3' : 'p-3',
            { 'text-end': isComponent(value) },
          ]"
          v-for="(value, index) in row"
          :key="index"
        >
          <component
            class="text-end"
            v-if="isComponent(value)"
            :is="extractComponent(value)"
            @click.stop.prevent="extractAction(value)"
          />
          <span v-else>{{ value }}</span>
        </td>
      </tr>
    </tbody>
  </table>
  <div v-else-if="items.values.length">
    <div
      v-for="(item, index) in itemsMapped"
      :key="index"
      class="card-table bg-white py-2 px-3 my-2"
    >
      <slot name="item" v-bind="item" />
    </div>
  </div>
</template>
<script setup lang="ts">
// TODO: Pull out table component into simple table, once we know a bit more about how templated buttons get passed in.

import { useMediaQuery } from "@vueuse/core";
import type {
  CardTableItems,
  CardTableValue,
} from "@/components/CardTableTypes";
import {
  extractComponent,
  isComponent,
  extractAction,
} from "@/components/CardTableTypes";
import { computed } from "vue";
const {
  breakPoint = 576,
  items,
  compact = false,
} = defineProps<{
  breakPoint?: number;
  items: CardTableItems;
  compact?: boolean;
}>();

const itemsMapped = computed<Record<string, CardTableValue>[]>(() => {
  return items.values.map((values) => {
    const item: Record<string, CardTableValue> = {};
    for (let i = 0; i < values.length; i++) {
      item[items.headings[i]] = values[i];
    }
    return item;
  });
});

const displayedItems = computed<{
  headings: string[];
  values: CardTableValue[][];
}>(() => {
  // If the heading starts with _, it's value is displayed, but we just use "" for the heading.
  // If the heading starts with __, it's not displayed at all.
  // TODO: Do sorting if there is a __sort header.
  return {
    headings: items.headings
      .filter((heading) => !heading.startsWith("__"))
      .map((heading) => (heading.startsWith("_") ? "" : heading)),
    values: itemsMapped.value.map((row) =>
      Object.entries(row)
        .filter(([heading, _value]) => !heading.startsWith("__"))
        .map(([_heading, value]) => value)
    ),
  };
});

const shouldRenderAsRows = useMediaQuery(`(min-width: ${breakPoint}px)`);
</script>

<style scoped lang="less">
@import "../assets/mixins.less";
@import "../assets/font-sizes.less";
.card-table {
  width: 100%;
  .standard-shadow();
  thead {
    background: #fafafa;
    color: #888;
    text-transform: capitalize;
    border-top: 0.5px solid white;
    border-bottom: 1px solid #eee;
  }
  thead,
  tbody {
    font-weight: 500;
    .fs-7();
  }
  tr {
    &:nth-child(even) {
      background: #fafafa;
    }
  }
}
</style>
