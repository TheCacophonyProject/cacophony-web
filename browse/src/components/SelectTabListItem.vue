<template>
  <b-btn
    :class="[{ selected }, 'select-tab-list-btn', 'bg-transparent', 'border-0']"
    @click="select"
  >
    <slot name="title"></slot>
  </b-btn>
</template>
<script lang="ts">
export default {
  name: "SelectTabListItem",
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
      type: Boolean,
      default: false,
    },
  },
  methods: {
    select() {
      this.$emit("selected");
    },
  },
};
</script>

<style lang="scss">
.btn.select-tab-list-btn {
  color: inherit;
  border-top: 1px solid #eee !important;
  box-shadow: none;
  border-radius: 0;
  text-align: left;
  &:focus,
  &:target,
  &:hover,
  &:active {
    color: inherit;
    outline: none;
    box-shadow: unset;
  }
  &.selected {
    background: #aaa !important;
    color: white;
  }
}
.collapsed {
  .btn.select-tab-list-btn.selected {
    background: unset !important;
    color: inherit;
    position: relative;
    &::after {
      position: absolute;
      right: 12px;
      top: 12px;
      content: " ";
      width: 0;
      height: 0;
      border-style: solid;
      border-width: 10px 6px 0 6px;
      border-color: #777 transparent transparent transparent;
    }
  }
}
</style>
