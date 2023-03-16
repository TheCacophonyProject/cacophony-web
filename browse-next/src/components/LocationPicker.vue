<script setup lang="ts">
import { ref } from "vue";
const format = ref<"latlng" | "nztm">("latlng");
const yCoord = ref<number>();
const xCoord = ref<number>();
</script>
<template>
  <div>
    <b-form-radio-group
      id="radio-group-1"
      v-model="format"
      name="radio-options"
    >
      <b-form-radio value="latlng">Longitude/Latitude</b-form-radio>
      <b-form-radio value="nztm">NZTM</b-form-radio>
    </b-form-radio-group>
    <b-form-input
      type="number"
      v-model="xCoord"
      :placeholder="format === 'latlng' ? 'Longitude' : 'Easting'"
    />
    <b-form-input
      type="number"
      v-model="yCoord"
      :placeholder="format === 'latlng' ? 'Latitude' : 'Northing'"
    />
  </div>
</template>

<style scoped></style>
