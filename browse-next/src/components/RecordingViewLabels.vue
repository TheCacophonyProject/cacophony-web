<script setup lang="ts">
import type { ApiRecordingResponse } from "@typedefs/api/recording";

const { recording } = defineProps<{
  recording?: ApiRecordingResponse;
}>();
</script>
<template>
  <div v-if="recording">
    <div v-for="(tag, index) in recording.tags" :key="index">
      {{ tag.detail }}
    </div>
  </div>
</template>

<style scoped></style>
