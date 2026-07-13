<template>
  <div ref="cardTableContainer">
    <table
      v-if="shouldRenderAsRows && hasItems"
      class="card-table card-table-table"
      :class="{ compact, 'rounded-3 shadow-sm bg-white': standalone }"
    >
      <thead>
        <tr>
          <th
            class="text-nowrap fw-medium"
            v-for="(heading, index) in displayedItems.headings"
            :key="`${heading}_${index}`"
            :class="[
              standalone ? 'px-3' : 'px-1',
              compact ? 'py-2' : 'py-3',
              { sortable: !!sorts[heading] },
              /*{ 'ct-vertical': [sorts[heading]]}*/
            ]"
            @click="toggleSorting(heading)"
          >
            {{ heading }}
            <button
              v-if="!!sorts[heading] && sorts[heading].direction !== 'none'"
              class="btn btn-sm p-0 ms-1"
            >
              <material-symbol
                :name="
                  sorts[heading].direction === 'desc'
                    ? 'arrow_downward'
                    : 'arrow_upward'
                "
                size="1.125rem"
              />
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, rowIndex) in displayedItems.values"
          :key="rowIndex"
          @click="
            (e) =>
              selectedItem(e, sortedItems[rowIndex] as CardTableRow<unknown>)
          "
          @mouseenter="
            () => enteredItem(sortedItems[rowIndex] as CardTableRow<unknown>)
          "
          @mouseleave="leftItem(sortedItems[rowIndex] as CardTableRow<unknown>)"
          :class="{ highlighted: eq(sortedItems[rowIndex], highlightedItem) }"
        >
          <td
            :class="[
              standalone ? 'px-3' : 'px-1',
              compact ? 'py-2' : 'py-3',
              ...cellClasses(cell),
            ]"
            v-for="(cell, index) in row"
            :key="index"
          >
            <slot
              :name="headings[index]"
              v-bind="{ cell, row: sortedItems[rowIndex] }"
            >
              <span
                v-if="
                  cell &&
                  typeof cell === 'object' &&
                  cell !== null &&
                  'value' in cell
                "
                v-html="cell.value"
              />
              <span v-else-if="cell" v-html="cell" />
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
    <div
      v-else-if="hasItems"
      class="card-table cards-wrapper d-flex flex-column"
      :class="{ standalone: standalone }"
    >
      <!--        TODO -->
      <!--      <div v-if="hasSorts">
      </div>-->
      <div
        v-for="(card, cardIndex) in sortedItems"
        :key="cardIndex"
        @mouseenter="enteredItem(card as CardTableRow<unknown>)"
        @mouseleave="leftItem(card as CardTableRow<unknown>)"
        @click="
          (e) => {
            enteredItem(card as CardTableRow<unknown>);
            selectedItem(e, sortedItems[cardIndex] as CardTableRow<unknown>);
          }
        "
        class="card-table-card"
        :class="{
          highlighted: eq(card, highlightedItem),
          'py-3 px-3 py-md-4 px-md-4': standalone,
          standalone: standalone,
        }"
      >
        <slot name="card" v-bind="{ card }">
          <div
            v-for="(value, index) in Object.values(
              card as CardTableRow<unknown>,
            )"
            :key="index"
          >
            <div
              v-if="displayedItems.headings[index]"
              class="d-flex justify-content-between"
            >
              <span class="text-capitalize"
                ><strong>{{ displayedItems.headings[index] }}:</strong></span
              >
              <span
                v-if="
                  typeof value === 'object' &&
                  value !== null &&
                  'value' in value
                "
                :class="{ 'text-nowrap': !hasLineBreaks(value.value) }"
                v-html="value.value"
              />
              <span
                v-else-if="value"
                :class="{ 'text-nowrap': !hasLineBreaks(value) }"
                v-html="value"
              />
            </div>
          </div>
        </slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, isProxy, onBeforeMount, reactive, ref, toRaw } from "vue";
import type {
  CardTableRow,
  CardTableRows,
  GenericCardTableValue,
} from "@/components/CardTableTypes";
import { useElementSize } from "@vueuse/core";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";

const props = withDefaults(
  defineProps<{
    maxCardWidth?: number;
    items: CardTableRows<any>;
    sortDimensions?: Record<string, ((a: never, b: never) => number) | boolean>;
    defaultSort?: string;
    highlightedItem?: CardTableRow<any> | null;
    compact?: boolean;
    standalone?: boolean;
  }>(),
  {
    maxCardWidth: 575,
    highlightedItem: null,
    sortDimensions: () => ({}),
    compact: false,
    standalone: false,
    items: () => [],
  },
);

const cellClasses = (cell: unknown): string[] => {
  if (
    cell &&
    typeof cell === "object" &&
    "cellClasses" in cell &&
    Array.isArray(cell.cellClasses)
  ) {
    return cell.cellClasses as string[];
  }
  return [];
};
const eq = (a: GenericCardTableValue<any>, b: GenericCardTableValue<any>) => {
  const aa = isProxy(a) ? toRaw(a) : a;
  const bb = isProxy(b) ? toRaw(b) : b;
  return aa === bb;
};

const emit = defineEmits<{
  (e: "entered-item", payload: GenericCardTableValue<unknown>): void;
  (e: "left-item", payload: GenericCardTableValue<unknown> | null): void;
  (e: "select-item", payload: GenericCardTableValue<unknown>): void;
}>();

const cardTableContainer = ref<HTMLDivElement>();

const hasLineBreaks = (value: unknown) => {
  return (
    typeof value === "string" && (value.length > 50 || value.includes("\n"))
  );
};

const { width } = useElementSize(cardTableContainer);
const shouldRenderAsRows = computed(() => width.value >= props.maxCardWidth);

const hasItems = computed(() => props.items.length !== 0);
const headings = computed<string[]>(() => {
  if (props.items.length) {
    if (typeof props.items[0] === "object" && props.items[0] !== null) {
      return Object.keys(props.items[0]).filter((h) => !h.startsWith("__"));
    }
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

const defaultLexicalSort = (a: unknown, b: unknown): number => {
  if (typeof a === "string" && typeof b === "string") {
    const aa = a.toLowerCase();
    const bb = b.toLowerCase();
    return aa > bb ? 1 : aa === bb ? 0 : -1;
  }
  return (a as number) > (b as number) ? 1 : a === b ? 0 : -1;
};

enum SortDirection {
  None = "none",
  Down = "desc",
  Up = "asc",
}

onBeforeMount(() => {
  // Setup sorts
  for (const [columnName, sortDimension] of Object.entries(
    props.sortDimensions,
  )) {
    sorts[splitCamelCase(columnName)] = {
      fn:
        sortDimension === true
          ? (a, b) =>
              defaultLexicalSort(
                (a as Record<string, unknown>)[columnName],
                (b as Record<string, unknown>)[columnName],
              )
          : (sortDimension as SortFn),
      direction:
        props.defaultSort && columnName === props.defaultSort
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
    // Reset other columns, we don't support multidimensional sort at this time.
    for (const [name, dimension] of Object.entries(sorts)) {
      if (name !== dimensionName) {
        dimension.direction = SortDirection.None;
      }
    }
  }
};

const sortedItems = computed<CardTableRows<any>>(() => {
  const activeSort = Object.values(sorts).find(
    (sort) => sort.direction !== SortDirection.None,
  );

  const itemsCopied = [...props.items];
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
        heading.startsWith("_") ? "" : splitCamelCase(heading),
      ),
    values: sortedItems.value.map((row) =>
      Object.entries(row as object)
        .filter(([heading, _value]) => !heading.startsWith("__"))
        .map(([_heading, value]) => value),
    ),
  };
});
</script>

<style scoped lang="less">
@import "../assets/less/elevation.less";
@import "../assets/less/typography.less";

.card-table {
  width: 100%;
  thead {
    text-transform: capitalize;
    border-bottom: 1px solid var(--border-color-light);
    tr:hover {
      background: transparent;
    }
  }
  th {
    user-select: none;
    font-weight: var(--cp-font-weight-medium);
    &.sortable {
      cursor: pointer;
    }
  }
  tr {
    user-select: none;
    &:not(:last-of-type) {
      border-bottom: 1px solid var(--border-color-light);
    }
    &.highlighted {
      background: var(--bs-gray-200);
    }
    &:hover {
      background: var(--bs-gray-100);
    }
  }
  &.cards-wrapper {
    &:not(.standalone) {
      gap: var(--cp-spacing-xxl);
    }
    &.standalone {
      gap: var(--cp-spacing-md);
    }
  }
  .card-table-card {
    background: var(--bs-white);
    transition: background-color 0.3s linear;
    position: relative;
    &:not(.standalone) {
      // might be able to do this in a less hacky way in the future with row-rule
      // https://developer.chrome.com/blog/gap-decorations
      &:not(:last-child) {
        &:after {
          position: absolute;
          content: "";
          width: 100%;
          height: 1px;
          background: var(--border-color-light);
          bottom: calc(
            var(--cp-spacing-md) * -1
          ); // depends on gap set on parent
        }
      }
    }
    &.standalone {
      border-radius: var(--bs-border-radius);
      .standard-shadow();
    }
    &.highlighted {
      background: var(--bs-gray-200);
    }
    cursor: default;
  }
}
</style>
