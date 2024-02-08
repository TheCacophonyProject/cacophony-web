<script setup lang="ts">
import {
  showTooltips,
  refreshUserProjects,
  UserProjects,
} from "@models/LoggedInUser";
import { computed, onMounted, ref } from "vue";

const currentTipIndex = ref(0);
const currentTip = computed(() => tips.value[currentTipIndex.value]);
const tips = ref([
  { text: "Information about tip 1" },
  { text: "Information about tip 2" },
  { text: "Information about tip 3" },
  { text: "Information about tip 4" },
]);

onMounted(() => {
  showTooltips.visible = true;
});

const nextTip = () => {
  if (currentTipIndex.value < tips.value.length - 1) {
    currentTipIndex.value++;
  }
};

const resetModalValues = () => {
  showTooltips.enabled = false;
};

const closeModal = () => {
  showTooltips.visible = false;
};
</script>
<template>
  <b-modal
    v-model="showTooltips.visible"
    title="Welcome to Cacophony Browser!"
    centered
    @hidden="resetModalValues"
    hide-footer
  >
    <p>
      {{ currentTip.text }}
    </p>
    <div class="justify-content-end d-flex">
      <button
        v-if="currentTipIndex < tips.length - 1"
        class="btn btn-primary"
        data-cy="cycle through tips button"
        @click.stop.prevent="nextTip"
      >
        Next
      </button>
      <button
        v-else
        class="btn btn-secondary"
        data-cy="cycle through tips button"
        @click.stop.prevent="closeModal"
      >
        Close
      </button>
    </div>
  </b-modal>
</template>
