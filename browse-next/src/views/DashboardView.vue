<script setup>
import { currentSelectedGroup } from "../models/LoggedInUser";
</script>
<template>
  <h4 class="group-name mb-2">{{ currentSelectedGroup.groupName }}</h4>
  <h1 class="mb-4">Dashboard</h1>

  <h2>Species summary</h2>
  <div style="background: #ccc; height: 93px" class="mb-5"></div>

  <h2>Visits summary</h2>
  <div style="background: #ccc; height: 500px" class="mb-5"></div>

  <h2>Stations summary</h2>
  <div style="background: #ccc; height: 500px"></div>
</template>
<style lang="less" scoped>
.group-name {
  text-transform: uppercase;
  color: #aaa;
  font-family: "Roboto Medium", "Roboto Regular", Roboto, sans-serif;
  font-weight: 500;
  // font-size: var(--bs-body-font-size);
  // FIXME - Use modified bs-body-font-size?
  font-size: 14px;
}
h1 {
  font-family: "Roboto Bold", "Roboto Regular", "Roboto", sans-serif;
  font-size: 22px;
  font-weight: 700;
  color: #444;
}
h2 {
  font-family: "Roboto Medium", "Roboto Regular", "Roboto", sans-serif;
  font-weight: 500;
  color: #444;
  font-size: 17px;
}
</style>
