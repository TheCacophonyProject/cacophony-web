<template>
  <span class="link">
    <font-awesome-icon icon="map-marker-alt" size="xs" />
    <span class="label">
      <b-link
        :disabled="!shouldLink"
        :to="{
          name: 'station',
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
        this.$route.name === "station" &&
        this.$route.params.groupName &&
        this.$route.params.groupName === this.groupName &&
        this.$route.params.stationName &&
        this.$route.params.stationName === this.stationName
      ) {
        return false;
      }
      return this.useLink;
    },
    params() {
      if (typeof this.context !== "undefined" && this.context !== "") {
        return {
          groupName: this.groupName,
          stationName: this.stationName,
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
