<template>
  <!--  <simple-table-->
  <!--    v-if="shouldRenderAsRows && items.values.length"-->
  <!--    :items="items"-->
  <!--    :compact="compact"-->
  <!--  />-->
  <!--  <div v-else-if="items.values.length">-->
  <!--    <div-->
  <!--      v-for="(item, index) in itemsMapped"-->
  <!--      :key="index"-->
  <!--      class="card-table bg-white py-2 px-3 my-2"-->
  <!--    >-->
  <!--      <slot name="item" v-bind="item" />-->
  <!--    </div>-->
  <!--  </div>-->
  <div></div>
</template>
<script setup lang="ts">
// import { useMediaQuery } from "@vueuse/core";
// import type {
//   CardTableItems,
//   CardTableValue,
// } from "@/components/CardTableTypes";
// import { computed } from "vue";
// import SimpleTable from "@/components/SimpleTable.vue";
// const {
//   breakPoint = 576,
//   items,
//   compact = false,
// } = defineProps<{
//   breakPoint?: number;
//   items: CardTableItems;
//   compact?: boolean;
// }>();
//
// const itemsMapped = computed<Record<string, CardTableValue>[]>(() => {
//   return items.values.map((values) => {
//     const item: Record<string, CardTableValue> = {};
//     for (let i = 0; i < values.length; i++) {
//       item[items.headings[i]] = values[i];
//     }
//     return item;
//   });
// });
//
// const shouldRenderAsRows = useMediaQuery(`(min-width: ${breakPoint}px)`);
</script>

<style scoped lang="less">
@import "../assets/mixins.less";
@import "../assets/font-sizes.less";
.card-table {
  width: 100%;
  .standard-shadow();
}
</style>
