<template>
  <table
    v-if="displayedItems.values.length"
    class="card-table bg-white my-2"
    :class="{ compact }"
  >
    <thead>
      <tr>
        <th
          class="py-2 px-3 text-nowrap"
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
          :class="[compact ? 'py-2 px-3' : 'p-3', ...(item.cellClasses || [])]"
          v-for="(item, index) in row"
          :key="index"
        >
          <slot :name="items.headings[index]" v-bind="{ item }">
            <span v-if="item.value" class="text-nowrap" v-html="item.value" />
          </slot>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CardTableItems } from "@/components/CardTableTypes";
type GenericCardTableValue = { cellClasses?: string[]; value: any };

const { items, compact = false } = defineProps<{
  breakPoint?: number;
  items: CardTableItems<any>;
  compact?: boolean;
}>();

const itemsMapped = computed<Record<string, GenericCardTableValue>[]>(() => {
  return items.values.map((values) => {
    const item: Record<string, GenericCardTableValue> = {};
    for (let i = 0; i < values.length; i++) {
      item[items.headings[i]] = values[i];
    }
    return item;
  });
});

const splitCamelCase = (str: string): string => {
  const splitPoints = str
    .split("")
    .map((char, index) => (char.charCodeAt(0) < 97 ? index : 0))
    .filter((i) => i !== 0);
  const words = [];
  let offset = 0;
  for (const splitPoint of splitPoints) {
    words.push(str.slice(offset, splitPoint));
    offset = splitPoint;
  }
  words.push(str.slice(offset, str.length));
  return words.join(" ");
};

const displayedItems = computed<{
  headings: string[];
  values: GenericCardTableValue[][];
}>(() => {
  // If the heading starts with _, it's value is displayed, but we just use "" for the heading.
  // If the heading starts with __, it's not displayed at all.
  // TODO: Do sorting if there is a __sort header.
  return {
    headings: items.headings
      .filter((heading) => !heading.startsWith("__"))
      .map((heading) =>
        heading.startsWith("_") ? "" : splitCamelCase(heading)
      ),
    values: itemsMapped.value.map((row) =>
      Object.entries(row)
        .filter(([heading, _value]) => !heading.startsWith("__"))
        .map(([_heading, value]) => value)
    ),
  };
});
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
