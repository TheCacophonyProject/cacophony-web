<template>
  <span class="link">
    <font-awesome-icon icon="map-marker-alt" size="xs" />
    <span class="label">
      <b-link
        :disabled="!shouldLink"
        exact
        :to="{
          name,
          params,
        }"
      >
        {{ stationName }}
      </b-link>
    </span>
  </span>
</template>

<script lang="ts">
export default {
  name: "StationLink",
  props: {
    groupName: {
      type: String,
      required: true,
    },
    stationName: {
      type: String,
      required: true,
    },
    stationId: {
      type: Number,
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
        (this.$route.name === "station" &&
          this.$route.params.groupName &&
          this.$route.params.groupName === this.groupName &&
          this.$route.params.stationName &&
          this.$route.params.stationName === this.stationName) ||
        (this.$route.params.stationId &&
          Number(this.$route.params.stationId) === this.stationId)
      ) {
        return false;
      }
      return this.useLink;
    },
    name() {
      if (this.stationId) {
        return "station-id";
      }
      return "station";
    },
    params() {
      if (typeof this.context !== "undefined" && this.context.trim() !== "") {
        if (this.stationId) {
          return {
            groupName: this.groupName,
            stationName: this.stationName,
            stationId: this.stationId,
            tabName: this.context,
          };
        }
        return {
          groupName: this.groupName,
          stationName: this.stationName,
          tabName: this.context,
        };
      }
      if (this.stationId) {
        return {
          groupName: this.groupName,
          stationName: this.stationName,
          stationId: this.stationId,
          tabName: this.context,
        };
      }
      return {
        groupName: this.groupName,
        stationName: this.stationName,
        tabName: this.context,
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
