<template>
  <div class="dropdown">
    <!-- Button Slot -->
    <div class="dropdown-button" @click="toggleDropdown">
      <slot name="button-content"></slot>
    </div>

    <!-- Dropdown Content -->
    <div v-show="isOpen" class="dropdown-content">
      <!-- Default Slot for Items -->
      <slot></slot>
    </div>
  </div>
</template>

<script lang="ts">
import { ref, defineComponent } from "@vue/composition-api";

export default defineComponent({
  name: "DropdownMenu",
  setup() {
    // State to manage the open/closed state of the dropdown
    const isOpen = ref(false);

    // Function to toggle the dropdown open/closed
    const toggleDropdown = () => {
      isOpen.value = !isOpen.value;
    };

    return {
      isOpen,
      toggleDropdown,
    };
  },
});
</script>

<style lang="scss">
.dropdown {
  position: relative;
  display: inline-block;

  .dropdown-button {
    background-color: white;
    padding: 10px 20px;
    cursor: pointer;

    &:hover {
      filter: brightness(160%);
    }
  }

  .dropdown-content {
    position: absolute;
    background-color: white;
    min-width: 160px;
    box-shadow: 0px 4px 8px rgba(0, 0, 0, 0.1);
    z-index: 10;
    right: 0;
    overflow: visible;

    // Style for individual items
    & > * {
      padding: 12px 16px;
      text-decoration: none;
      display: block;
      z-index: 20;
    }
  }

  // Show the dropdown content when open
  &.open {
    .dropdown-content {
      display: block;
    }
  }
}
</style>
