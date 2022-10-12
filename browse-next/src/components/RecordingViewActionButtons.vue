<script setup lang="ts">
const { recordingReady } = defineProps<{ recordingReady: boolean }>();
</script>
<template>
  <div class="recording-icons d-flex justify-content-between mt-sm-2 ps-sm-2">
    <button type="button" class="btn" :disabled="!recordingReady">
      <font-awesome-icon icon="tag" color="#666" />
    </button>
    <button type="button" class="btn" :disabled="!recordingReady">
      <font-awesome-icon :icon="['far', 'flag']" color="#666" />
    </button>
    <button type="button" class="btn" :disabled="!recordingReady">
      <font-awesome-icon :icon="['far', 'star']" color="#666" />
    </button>
    <button type="button" class="btn" :disabled="!recordingReady">
      <font-awesome-icon icon="download" color="#666" />
    </button>
    <button type="button" class="btn" :disabled="!recordingReady">
      <font-awesome-icon icon="trash-can" color="#666" />
    </button>
    <button
      type="button"
      class="btn optional-button"
      :disabled="!recordingReady"
    >
      <font-awesome-icon icon="link" color="#666" />
    </button>
  </div>
</template>

<style scoped lang="less">
.recording-icons {
  color: #666;
}
@media screen and (max-width: 320px) {
  .optional-button {
    display: none;
  }
}
</style>
