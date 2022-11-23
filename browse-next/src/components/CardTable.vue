<template>
  <table
    v-if="shouldRenderAsRows && hasItems"
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
          :class="[
            compact ? 'py-2 ps-3' : 'py-3 ps-3',
            { 'pe-3': index === row.length - 1 },
            ...(cell.cellClasses || []),
          ]"
          v-for="(cell, index) in row"
          :key="index"
        >
          <slot :name="headings[index]" v-bind="{ cell }">
            <span v-if="cell.value" class="text-nowrap" v-html="cell.value" />
            <span v-else-if="cell" class="text-nowrap" v-html="cell" />
          </slot>
        </td>
      </tr>
    </tbody>
  </table>
  <div v-else-if="hasItems">
    <div
      v-for="(card, cardIndex) in items"
      :key="cardIndex"
      class="card-table bg-white py-2 ps-3 pe-2 my-2"
    >
      <slot name="card" v-bind="{ card }">
        <div v-for="(value, index) in Object.values(card)" :key="index">
          <div
            v-if="displayedItems.headings[index]"
            class="d-flex justify-content-between"
          >
            <span class="text-capitalize"
              ><strong>{{ displayedItems.headings[index] }}:</strong></span
            >
            <span v-if="value.value" class="text-nowrap" v-html="value.value" />
            <span v-else-if="value" class="text-nowrap" v-html="value" />
          </div>
        </div>
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type {
  CardTableRows,
  GenericCardTableValue,
} from "@/components/CardTableTypes";
import { useMediaQuery } from "@vueuse/core";

const {
  items = [],
  compact = false,
  breakPoint = 576,
} = defineProps<{
  breakPoint?: number;
  items: CardTableRows<any>;
  compact?: boolean;
}>();
const hasItems = computed(() => items.length !== 0);
const shouldRenderAsRows = useMediaQuery(`(min-width: ${breakPoint}px)`);
const headings = computed<string[]>(() => {
  if (items.length) {
    return Object.keys(items[0]);
  }
  return [];
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
  values: GenericCardTableValue<any>[][];
}>(() => {
  // If the heading starts with _, its value is displayed, but we just use "" for the heading.
  // If the heading starts with __, it's not displayed at all.
  return {
    headings: headings.value
      .filter((heading) => !heading.startsWith("__"))
      .map((heading) =>
        heading.startsWith("_") ? "" : splitCamelCase(heading)
      ),
    values: items.map((row) =>
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
