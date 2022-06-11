<template>
  <span class="link">
    <font-awesome-icon icon="users" size="xs" />
    <span class="label">
      <b-link
        :disabled="!shouldLink"
        :to="{
          name: 'group',
          params,
        }"
      >
        {{ groupName }}
      </b-link>
    </span>
  </span>
</template>

<script lang="ts">
export default {
  name: "GroupLink",
  props: {
    groupName: {
      type: String,
      required: true,
    },
    context: {
      type: String,
    },
    useLink: {
      type: Boolean,
      default: true,
    },
  },
  computed: {
    shouldLink() {
      if (this.useLink === false) {
        return this.useLink;
      }
      if (
        this.$route.name === "group" &&
        this.$route.params.groupName &&
        this.$route.params.groupName === this.groupName
      ) {
        return false;
      }
      return this.useLink;
    },
    params() {
      if (typeof this.context !== "undefined" && this.context !== "") {
        return {
          groupName: this.groupName,
        };
      }
      return {
        groupName: this.groupName,
        context: this.context,
      };
    },
  },
};
</script>

<style scoped lang="scss">
@import "~bootstrap/scss/functions";
@import "~bootstrap/scss/variables";

.link {
  display: inline-block;
  word-break: break-word;
  white-space: nowrap;
  margin: 0 0.25rem;
}
.svg-inline--fa {
  color: $gray-600;
  min-width: 1rem;
  vertical-align: baseline;
}
.label {
  vertical-align: baseline;
}
a.disabled {
  pointer-events: none;
  color: inherit;
}
</style>
