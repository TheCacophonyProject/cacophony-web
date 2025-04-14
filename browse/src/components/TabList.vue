<template>
  <div @click="toggleOpen">
    <b-tabs
      card
      class="device-tabs"
      nav-class="device-tabs-container container"
      v-if="showTabs"
      :value="value"
      @input="(index) => $emit('input', index)"
    >
      <slot></slot>
    </b-tabs>
    <select-tab-list
      v-else
      :value="value"
      :show-tabs="showTabs"
      :collapsed="collapsed"
      @selected="(e) => toggleOpen(e)"
    >
      <slot></slot>
    </select-tab-list>
  </div>
</template>

<script lang="ts">
let match;
import SelectTabList from "@/components/SelectTabList.vue";
export default {
  name: "TabList",
  components: { SelectTabList },
  mounted() {
    if (window.matchMedia) {
      match = window.matchMedia("screen and (min-width: 1100px)");
      match.addEventListener &&
        match.addEventListener("change", this.setShowTabs);
      this.showTabs = match.matches;
    }
  },
  beforeDestroy() {
    if (window.matchMedia) {
      // NOTE This is only needed for multi-monitor setups where the DPI can change if the window is moved
      //  between screens of differing DPIs.  iOS 12 and lower don't support this.
      match.removeEventListener &&
        match.removeEventListener("change", this.setShowTabs);
    }
  },
  methods: {
    toggleOpen(e) {
      if (!this.showTabs) {
        if (this.collapsed) {
          // Only open if a child of tab-list
          if (e.path) {
            if (
              e.path.find(
                (el) => el.classList && el.classList.contains("tab-list")
              )
            ) {
              this.collapsed = !this.collapsed;
            }
          } else {
            let el = e.target;
            let foundParent = false;
            while (el) {
              if (el.classList && el.classList.contains("tab-list")) {
                foundParent = true;
                break;
              }
              el = el.parentNode;
            }

            if (foundParent) {
              this.collapsed = !this.collapsed;
            }
          }
        } else {
          this.collapsed = true;
        }
      }
    },
    setShowTabs(e) {
      this.showTabs = e.matches;
    },
  },
  props: {
    value: {
      type: Number,
      default: 0,
    },
  },
  data() {
    return {
      collapsed: true,
      showTabs: false,
    };
  },
};
</script>

<style scoped></style>
