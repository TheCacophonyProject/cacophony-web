<script setup lang="ts">
import { computed, inject, ref } from "vue";
import type { Ref } from "vue";
import type { ErrorResult } from "@api/types";
import { BModal } from "bootstrap-vue-next";
import { formFieldInputText } from "@/utils";
import type { FormInputValidationState } from "@/utils";
import { useRouter } from "vue-router";
import { createProxyDevice } from "@api/Device";
import type { SelectedProject } from "@models/LoggedInUser";
import type { DeviceId } from "@typedefs/api/common";
import { currentSelectedProject } from "@models/provides";

const selectedProject = inject(currentSelectedProject) as Ref<SelectedProject>;
const newDeviceName = formFieldInputText();
const isValidDeviceName = computed<boolean>(
  () => newDeviceName.value.trim().length >= 3,
);
const needsValidationAndIsValidDeviceName = computed<FormInputValidationState>(
  () => {
    if (!newDeviceName.touched) {
      if (isValidDeviceName.value) {
        return true;
      } else {
        return undefined;
      }
    } else {
      return newDeviceName.touched ? isValidDeviceName.value : undefined;
    }
  },
);

const emit = defineEmits<{
  (e: "proxy-device-created", val: DeviceId): void;
}>();

const submittingCreateRequest = ref(false);
const resetFormValues = () => {
  newDeviceName.value = "";
  newDeviceName.touched = false;
};

const createNewDeviceError = ref<ErrorResult | null>(null);
const createNewProxyDevice = async () => {
  submittingCreateRequest.value = true;
  const deviceName = newDeviceName.value.trim();
  const projectName = selectedProject.value.groupName;
  const createProxyDeviceResponse = await createProxyDevice(
    projectName,
    deviceName,
  );
  if (createProxyDeviceResponse.success) {
    emit("proxy-device-created", createProxyDeviceResponse.result.id);
  } else {
    // Allow latin unicode characters with accents in names, normalise them to ascii for urls.
    createNewDeviceError.value = createProxyDeviceResponse.result;
  }
  submittingCreateRequest.value = false;
};

const hasError = computed<boolean>(() => {
  return createNewDeviceError.value !== null;
});
</script>
<template>
  <b-modal title="Register a new trailcam" centered @hidden="resetFormValues">
    <b-form @submit.stop.prevent="createNewProxyDevice">
      <b-form-input
        type="text"
        placeholder="Give the trailcam a name"
        data-cy="new device name"
        v-model="newDeviceName.value"
        @blur="newDeviceName.touched = true"
        :state="needsValidationAndIsValidDeviceName"
        :disabled="submittingCreateRequest"
      />
      <b-form-invalid-feedback :state="needsValidationAndIsValidDeviceName">
        <span v-if="newDeviceName.value.trim().length === 0">
          Trailcam name cannot be blank
        </span>
        <span v-else-if="newDeviceName.value.trim().length < 3">
          Trailcam name must be at least 3 characters
        </span>
      </b-form-invalid-feedback>
    </b-form>
    <template #footer>
      <button
        class="btn btn-primary"
        type="submit"
        data-cy="create device button"
        @click.stop.prevent="createNewProxyDevice"
        :disabled="
          !needsValidationAndIsValidDeviceName || submittingCreateRequest
        "
      >
        <span
          v-if="submittingCreateRequest"
          class="spinner-border spinner-border-sm"
        ></span>
        {{
          submittingCreateRequest ? "Registering trailcam" : "Register trailcam"
        }}
      </button>
    </template>
  </b-modal>
</template>
