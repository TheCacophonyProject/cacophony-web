<template>
  <div ref="cardTableContainer">
    <table
      v-if="shouldRenderAsRows && hasItems"
      class="card-table card-table-table bg-white my-2"
      :class="{ compact }"
    >
      <thead>
        <tr>
          <th
            class="py-2 px-3 text-nowrap"
            v-for="(heading, index) in displayedItems.headings"
            :key="`${heading}_${index}`"
            :class="{ sortable: !!sorts[heading] }"
            @click="toggleSorting(heading)"
          >
            {{ heading }}
            <span
              v-if="!!sorts[heading] && sorts[heading].direction !== 'none'"
              class="sort-icon"
            >
              <font-awesome-icon
                :icon="'arrow-up'"
                :flip="sorts[heading].direction === 'desc' ? 'vertical' : null"
              />
            </span>
            <span v-else class="sort-icon"></span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, rowIndex) in displayedItems.values"
          :key="rowIndex"
          @click="(e) => selectedItem(e, sortedItems[rowIndex])"
          @mouseenter="() => enteredItem(sortedItems[rowIndex])"
          @mouseleave="leftItem(sortedItems[rowIndex])"
          :class="{ highlighted: eq(sortedItems[rowIndex], highlightedItem) }"
        >
          <td
            :class="[
              compact ? 'py-2 ps-3' : 'py-3 ps-3',
              { 'pe-3': index === row.length - 1 },
              ...((cell && cell.cellClasses) || []),
            ]"
            v-for="(cell, index) in row"
            :key="index"
          >
            <slot
              :name="headings[index]"
              v-bind="{ cell, row: sortedItems[rowIndex] }"
            >
              <span
                v-if="cell && cell.value"
                class="text-nowrap"
                v-html="cell.value"
              />
              <span v-else-if="cell" class="text-nowrap" v-html="cell" />
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-else-if="hasItems" class="card-table">
      <div v-if="hasSorts">
        <!--        TODO -->
      </div>
      <div
        v-for="(card, cardIndex) in sortedItems"
        :key="cardIndex"
        @mouseenter="enteredItem(card)"
        @mouseleave="leftItem(card)"
        @click="(e) => selectedItem(e, sortedItems[cardIndex])"
        class="card-table-card py-2 ps-3 pe-2 my-2"
        :class="{ highlighted: eq(card, highlightedItem) }"
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
              <span
                v-if="value.value"
                class="text-nowrap"
                v-html="value.value"
              />
              <span v-else-if="value" class="text-nowrap" v-html="value" />
            </div>
          </div>
        </slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  isProxy,
  onBeforeMount,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  toRaw,
} from "vue";
import type {
  CardTableRow,
  CardTableRows,
  GenericCardTableValue,
} from "@/components/CardTableTypes";
import { useElementSize } from "@vueuse/core";
/* eslint-disable @typescript-eslint/no-explicit-any */

const {
  items = [],
  compact = false,
  sortDimensions = {},
  maxCardWidth = 575,
  defaultSort,
  highlightedItem = null,
} = defineProps<{
  maxCardWidth?: number;
  items: CardTableRows<any>;
  sortDimensions?: Record<string, (<T>(a: T, b: T) => number) | boolean>;
  defaultSort?: string;
  highlightedItem?: CardTableRow<any> | null;
  compact?: boolean;
}>();

const eq = (a: GenericCardTableValue<any>, b: GenericCardTableValue<any>) => {
  const aa = isProxy(a) ? toRaw(a) : a;
  const bb = isProxy(b) ? toRaw(b) : b;
  return aa === bb;
};

const emit = defineEmits<{
  (e: "entered-item", payload: GenericCardTableValue<any>): void;
  (e: "left-item", payload: GenericCardTableValue<any>): void;
  (e: "select-item", payload: GenericCardTableValue<any>): void;
}>();

const cardTableContainer = ref<HTMLDivElement>();

const { width } = useElementSize(cardTableContainer);
const shouldRenderAsRows = computed(() => width.value >= maxCardWidth);

const hasItems = computed(() => items.length !== 0);
const headings = computed<string[]>(() => {
  if (items.length) {
    return Object.keys(items[0]);
  }
  return [];
});

const enteredItem = (item: CardTableRow<any>) => {
  emit("entered-item", item);
};

const leftItem = (item: CardTableRow<any>) => {
  emit("left-item", item);
};

const selectedItem = (e: MouseEvent, item: CardTableRow<any>) => {
  let target = e.target as HTMLElement;
  while (target !== e.currentTarget) {
    if (target.classList.contains("btn")) {
      return;
    }
    target = target.parentElement as HTMLElement;
  }
  emit("select-item", item);
};

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

type SortDimension = { fn: SortFn; direction: SortDirection };
const sorts = reactive<Record<string, SortDimension>>({});
type SortFn = <T>(a: T, b: T) => number;

const hasSorts = computed<boolean>(() => Object.values(sorts).length !== 0);

const defaultLexicalSort = (a: any, b: any): number => {
  if (typeof a === "string" && typeof b === "string") {
    const aa = a.toLowerCase();
    const bb = b.toLowerCase();
    return aa > bb ? 1 : aa === bb ? 0 : -1;
  }
  return a > b ? 1 : a === b ? 0 : -1;
};

enum SortDirection {
  None = "none",
  Down = "desc",
  Up = "asc",
}

onBeforeMount(() => {
  // Setup sorts
  for (const [columnName, sortDimension] of Object.entries(sortDimensions)) {
    sorts[splitCamelCase(columnName)] = {
      fn:
        sortDimension === true
          ? (a: any, b: any) => defaultLexicalSort(a[columnName], b[columnName])
          : (sortDimension as SortFn),
      direction:
        defaultSort && columnName === defaultSort
          ? SortDirection.Down
          : SortDirection.None,
    };
  }
});

const toggleSorting = (dimensionName: string) => {
  const dimension = sorts[dimensionName];
  if (dimension) {
    if (dimension.direction === SortDirection.None) {
      dimension.direction = SortDirection.Down;
    } else if (dimension.direction === SortDirection.Down) {
      dimension.direction = SortDirection.Up;
    } else if (dimension.direction === SortDirection.Up) {
      dimension.direction = SortDirection.Down;
    }
    // Reset other columns, we don't support multi-dimensional sort at this time.
    for (const [name, dimension] of Object.entries(sorts)) {
      if (name !== dimensionName) {
        dimension.direction = SortDirection.None;
      }
    }
  }
};

const sortedItems = computed<CardTableRows<any>>(() => {
  const activeSort = Object.values(sorts).find(
    (sort) => sort.direction !== SortDirection.None
  );

  const itemsCopied = [...items];
  if (activeSort) {
    if (activeSort && activeSort.direction !== SortDirection.None) {
      itemsCopied.sort(activeSort.fn);
      if (activeSort.direction === SortDirection.Up) {
        itemsCopied.reverse();
      }
    }
  }
  return itemsCopied;
});

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
    values: sortedItems.value.map((row) =>
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
  th {
    user-select: none;
    &.sortable {
      cursor: pointer;
    }
  }
  tr {
    user-select: none;
    &:nth-child(even) {
      background: #fafafa;
    }
    &.highlighted {
      background: #ddd;
    }
  }
  .card-table-card {
    background: white;
    transition: background-color 0.3s linear;
    &.highlighted {
      background: #ddd;
    }
    cursor: default;
  }

  .card-table-table,
  .card-table-card {
    .standard-shadow();
  }
  .sort-icon {
    margin-left: 10px;
    display: inline-block;
    min-width: 20px;
  }
}
</style>
