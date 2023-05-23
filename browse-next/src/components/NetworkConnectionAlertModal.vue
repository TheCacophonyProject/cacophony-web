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
// TODO: We could maybe log this to a 3rd party tool like grafana?
// TODO: Listen for window.navigator.onLine changes, and stick a banner at the top showing no connectivity.

// TODO: Can we look at deleting inactive accounts?  People who haven't agreed to the EUA, but who have added an email?

//

const retryNow = async () => {
  isManuallyRetrying.value = true;

  // "If the problem persists, please try again later, or contact support."

  // countDown.value = 0;
  networkConnectionError.control = true;
  await delayMsThen(1500, () => (isManuallyRetrying.value = false));
};

watch(
  [
    () => networkConnectionError.retryInterval,
    () => networkConnectionError.control,
  ],
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
      }, 1000) as unknown as number;
    }
  },
  { immediate: true }
);
</script>

<template>
  <b-modal
    body-class="p-0 d-flex align-items-stretch flex-column flex-md-row"
    content-class="overflow-hidden"
    class="text-dark"
    centered
    v-model="networkConnectionError.hasConnectionError"
    cancel-disabled
    busy
    no-close-on-backdrop
    hide-footer
    hide-header
  >
    <div
      class="
        bg-danger
        align-items-center
        justify-content-center
        d-flex
        text-light
      "
    >
      <font-awesome-icon icon="triangle-exclamation" size="lg" class="m-3" />
      <span class="d-md-none">Network Connection Error</span>
    </div>
    <div class="p-3">
      <h1 class="h6">Currently unable to reach Cacophony API.</h1>
      <p class="mb-4">
        This can occur due to an outage on our servers, or network connectivity
        issues with your device.
      </p>
      <div
        class="
          d-flex
          flex-md-row flex-column
          justify-content-between
          align-items-center
        "
      >
        <span v-if="!isManuallyRetrying" style="height: 1rem"
          >Retrying in <strong>{{ countDown }}</strong> seconds...</span
        >
        <span v-else class="spinner-border-sm spinner-border text-dark" />
        <button
          aria-label="Retry connection"
          class="btn btn-outline-secondary mt-3 mt-md-0"
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
<style></style>
