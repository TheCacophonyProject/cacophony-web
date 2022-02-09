<template>
  <span v-b-tooltip="tagTitle" :class="['tag', 'badge', tag.class, tag.text]">
    <span class="tag-icon">
      <font-awesome-icon
        v-if="tag.class === 'automatic'"
        icon="cog"
        size="xs"
      />
      <font-awesome-icon
        v-else-if="tag.class === 'human'"
        icon="user"
        size="xs"
      />
      <font-awesome-icon
        v-else-if="tag.class === 'automatic human'"
        icon="user-cog"
        size="xs"
      />
    </span>
    <span class="tag-label">{{ tagLabel }}</span>
  </span>
</template>

<script lang="ts">
type TagClass = "automatic" | "human" | "automatic human";
interface Tag {
  text: string;
  class: TagClass;
  order: number;
}

export default {
  name: "TagBadge",
  props: {
    tag: {
      type: Object,
      required: true,
    },
  },
  mounted() {
    debugger;
  },
  computed: {
    tagLabel(): string {
      if (this.tag.text === "unknown" && this.tag.class.includes("human")) {
        return "not identifiable";
      }
      return this.tag.text.replace(/-/g, " ");
    },
    tagTitle(): string {
      switch (this.tag.class) {
        case "automatic":
          return "Tagged by Cacophony AI";
        case "human":
          return "Tagged by human";
        case "automatic human":
          return "Tagged by Cacophony AI and human";
        default:
          return "";
      }
    },
  },
};
</script>

<style scoped lang="scss">
@import "~bootstrap/scss/functions";
@import "~bootstrap/scss/variables";
@import "src/styles/tag-colours";

.tag {
  &.badge {
    font-weight: initial;
    font-size: 90%;
    color: $white;
    background: $secondary;
    margin-right: 0.3rem;
    vertical-align: middle;
    line-height: 0.7;
  }
  &.automatic {
    background: $ai;
  }
  &.human {
    background: $human;
  }
  &.automatic.human {
    background: $aihuman;
  }
  &.false-positive {
    background: #999;
  }
  .svg-inline--fa {
    color: $white;
  }
  .tag-icon,
  .tag-label {
    vertical-align: middle;
  }
}
</style>
