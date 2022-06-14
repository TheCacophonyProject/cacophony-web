<script setup lang="ts">
import SectionHeader from "@/components/SectionHeader.vue";

// TODO - load stations for group.
//  Display in table and on map.

</script>
<template>
  <div class="d-flex flex-md-row flex-column-reverse justify-content-between">
    <div class="cn">
      <section-header>Stations</section-header>
      <div class="px-3 p-md-0">stations list table</div>
    </div>
    <div class="map"></div>
  </div>
</template>
<style lang="less">
.map {
  background: #2b333f;
  height: 100vh;
  width: 300px;
}
.cn {

}
</style>
