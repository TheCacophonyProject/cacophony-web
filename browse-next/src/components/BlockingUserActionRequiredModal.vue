<script setup lang="ts">
import { BModal } from "bootstrap-vue-3";
import { ref } from "vue";
import {
  hasAcceptedSomeEUA,
  euaIsOutOfDate,
  currentEUAVersion,
  CurrentUser,
  setLoggedInUserData,
} from "@models/LoggedInUser";
import type { LoggedInUser } from "@models/LoggedInUser";
import { updateFields } from "@api/User";

const acceptedEUA = ref(false);
const submitting = ref(false);

const acceptEndUserAgreement = async () => {
  submitting.value = true;
  await updateFields({
    endUserAgreement: currentEUAVersion.value,
  });
  setLoggedInUserData({
    ...(CurrentUser.value as LoggedInUser),
    endUserAgreement: currentEUAVersion.value,
  });
  submitting.value = false;
};
</script>
<template>
  <b-modal
    :show="euaIsOutOfDate"
    dialog-class="accept-eua-form-wrapper"
    title="End User Agreement"
    centered
    no-close-on-backdrop
    no-close-on-esc
    hide-footer
    hide-header-close
  >
    <p v-if="!hasAcceptedSomeEUA">
      Welcome back! It looks like you haven't been here in a while.
    </p>
    <p>
      <span v-if="hasAcceptedSomeEUA && euaIsOutOfDate"
        >The 2040 End User Agreement has been updated.</span
      >
      Before continuing, you must read and agree to the latest
      End&nbsp;User&nbsp;Agreement
    </p>

    <b-form @submit.stop.prevent="acceptEndUserAgreement">
      <div class="input-group mb-3">
        <b-form-checkbox v-model="acceptedEUA" :disabled="submitting" required>
          <span class="small">
            I accept the terms of the
            <a
              target="_blank"
              href="https://www.2040.co.nz/pages/2040-end-user-agreement"
              >end user agreement</a
            >.
          </span>
        </b-form-checkbox>
      </div>
      <div class="d-flex justify-content-center">
        <button
          type="submit"
          class="btn btn-primary flex-fill"
          :disabled="!acceptedEUA || submitting"
        >
          <span v-if="submitting">
            <span
              class="spinner-border spinner-border-sm"
              role="status"
              aria-hidden="true"
            ></span>
            Updating...
          </span>
          <span v-else>Continue</span>
        </button>
      </div>
    </b-form>
  </b-modal>
</template>
<style lang="less">
.accept-eua-form-wrapper {
  max-width: 360px;
}
</style>
