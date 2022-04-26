<template>
  <div id="releases">Releases info bar</div>
  <div>{{ userIsLoggedIn }}</div>
</template>

<script setup>
import { userIsLoggedIn } from "@/router";
</script>

<style lang="less">
#releases {
  background: lightgray;
}
</style>
