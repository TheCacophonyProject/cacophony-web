<template>
  <b-tab
    :title-item-class="showTab"
    :title="title"
    :lazy="lazy"
    v-if="showTabs"
  >
    <template #title>
      <slot name="title"></slot>
    </template>
    <template>
      <slot></slot>
    </template>
  </b-tab>
  <select-tab-list-item
    v-else
    :title="title"
    :selected="selected"
    @selected="select"
  >
    <template #title>
      <slot name="title"></slot>
    </template>
  </select-tab-list-item>
</template>

<script lang="ts">
import SelectTabListItem from "@/components/SelectTabListItem.vue";
export default {
  name: "TabListItem",
  components: { SelectTabListItem },
  props: {
    title: {
      type: String,
      required: false,
    },
    selected: {
      type: Boolean,
      default: false,
    },
    index: {
      type: Number,
      default: 0,
    },
    lazy: {
      type: Boolean,
      default: false,
    },
    showTabs: {
      type: Boolean,
      default: true,
    },
    show: {
      type: Boolean,
      default: true,
    },
  },
  methods: {
    select() {
      this.$parent.$emit("selected");
      this.$parent.$emit("input", this.index);
    },
  },

  computed: {
    showTab() {
      return this.show ? "" : "d-none";
    },
  },
};
</script>

<style scoped></style>
