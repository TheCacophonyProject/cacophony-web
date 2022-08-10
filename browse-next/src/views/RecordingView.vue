<script setup lang="ts">
// eslint-disable-next-line no-undef
import { useRoute } from "vue-router";
import { computed, inject } from "vue";
const route = useRoute();

const recordingIds = route.params.recordingIds;
const visitLabel = route.params.visitLabel;

const isInVisitContext = computed<boolean>(() => {
  return !!visitLabel;
});

const visitContext = inject("selectedVisit");

const isInGreaterVisitContext = computed<boolean>(() => {
  return visitContext !== null;
});
</script>
<template>
  <div>
    I am a recording {{ recordingIds }}
    <span v-if="isInVisitContext">In a visit {{ visitLabel }}</span>
    <span v-if="isInGreaterVisitContext">{{ visitContext }}</span>
  </div>
</template>

<style scoped lang="less"></style>
