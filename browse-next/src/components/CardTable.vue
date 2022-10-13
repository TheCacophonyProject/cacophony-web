<template>
  <table
    v-if="shouldRenderAsRows && items.values.length"
    class="card-table bg-white"
  >
    <thead>
      <tr>
        <th
          class="py-2 px-3"
          v-for="(heading, index) in items.headings"
          :key="`${heading}_${index}`"
        >
          {{ heading }}
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(row, index) in items.values" :key="index">
        <td class="p-3" v-for="(value, index) in row" :key="index">
          {{ value }}
        </td>
      </tr>
    </tbody>
  </table>
  <div v-else-if="items.values.length">
    <div
      v-for="(item, index) in itemsMapped"
      :key="index"
      class="card-table bg-white py-2 px-3"
    >
      <slot name="item" v-bind="item" />
    </div>
  </div>
</template>
<script setup lang="ts">
import { useMediaQuery } from "@vueuse/core";
import type { CardTableItems } from "@/components/CardTableTypes";
import { computed } from "vue";
const { breakPoint = 576, items } = defineProps<{
  breakPoint?: number;
  items: CardTableItems;
}>();

const itemsMapped = computed(() => {
  return items.values.map((values) => {
    const item: Record<string, string | number> = {};
    for (let i = 0; i < values.length; i++) {
      item[items.headings[i]] = values[i];
    }
    return item;
  });
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
