<template>
  <span class="link">
    <font-awesome-icon icon="map-marker-alt" size="xs" />
    <span class="label">
      <b-link
        :to="{
          name: 'station',
          params: {
            groupName: groupName,
            stationName: stationName,
            tabName: context,
          },
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
      required: true,
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
  margin-right: 0.5rem;
}
.svg-inline--fa {
  // set a fixed width on fontawesome icons so they align neatly when stacked
  width: 16px;
  color: $gray-600;
}
.label {
  vertical-align: middle;
}
</style>
