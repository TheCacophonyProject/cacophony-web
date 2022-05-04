<script setup lang="ts">
import { BModal } from "bootstrap-vue-3";
import { ref, watch } from "vue";
import { MAX_RETRY_COUNT, networkConnectionError } from "@api/fetch";
import { delayMs, delayMsThen } from "@/utils";
const countDownInterval = ref(0);
const countDown = ref(networkConnectionError.retryInterval / 1000);
const show = ref(true);
const isManuallyRetrying = ref(false);

// TODO: Figure out what to do when we've reached max-retries.
// TODO: 'Retry now' link (When retry now is clicked, pause and show a spinner, like we're doing something)
// TODO: Possibly when we recover from a network error, we should just refresh the page?

const retryNow = async () => {
  isManuallyRetrying.value = true;
  //countDown.value = 0;
  networkConnectionError.control = true;
  await delayMsThen(1500, () => (isManuallyRetrying.value = false));
};

watch(
  [
    () => networkConnectionError.retryInterval,
    () => networkConnectionError.control,
  ],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async ([count, cancel]) => {
    if (cancel) {
      await delayMs(1500);
    }
    clearInterval(countDownInterval.value);
    if (networkConnectionError.retryCount === MAX_RETRY_COUNT) {
      show.value = false;
    } else {
      countDown.value = count / 1000;
      countDownInterval.value = setInterval(() => {
        countDown.value--;
      }, 1000);
    }
  },
  { immediate: true }
);
</script>

<template>
  <b-modal
    body-class="p-0 rounded d-flex align-items-stretch"
    class="text-dark"
    centered
    v-model="show"
    cancel-disabled
    busy
    no-close-on-backdrop
    hide-footer
    hide-header
  >
    <div class="bg-danger align-items-center d-flex rounded-start text-light">
      <font-awesome-icon icon="triangle-exclamation" size="lg" class="m-3" />
    </div>
    <div class="p-3">
      <h1 class="h6">Currently unable to reach Cacophony API.</h1>
      <p class="mb-4">
        This can occur due to an outage on our servers, or network connectivity
        issues with your device.
      </p>
      <div class="d-flex flex-row justify-content-between align-items-center">
        <span v-if="!isManuallyRetrying"
          >Retrying in <strong>{{ countDown }}</strong> seconds...</span
        >
        <span v-else class="spinner-border-sm spinner-border text-dark" />
        <button
          class="btn btn-outline-secondary"
          @click="retryNow"
          :disabled="isManuallyRetrying"
        >
          <span v-if="isManuallyRetrying"> Retrying </span>
          <span v-else>Retry now</span>
        </button>
      </div>
    </div>
  </b-modal>
</template>
