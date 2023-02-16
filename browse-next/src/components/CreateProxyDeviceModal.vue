<script setup lang="ts">
import { computed, inject, ref } from "vue";
import type { Ref } from "vue";
import type { ErrorResult } from "@api/types";
import { BModal } from "bootstrap-vue-3";
import { formFieldInputText } from "@/utils";
import type { FormInputValidationState } from "@/utils";
import { useRouter } from "vue-router";
import { createProxyDevice } from "@api/Device";
import type { SelectedGroup } from "@models/LoggedInUser";
import type { DeviceId } from "@typedefs/api/common";
import { currentSelectedGroup } from "@models/provides";

const selectedGroup = inject(currentSelectedGroup) as Ref<SelectedGroup>;
const newDeviceName = formFieldInputText();
const isValidDeviceName = computed<boolean>(
  () => newDeviceName.value.trim().length >= 3
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
  }
);

const emit = defineEmits<{
  (e: "proxy-device-created", val: DeviceId): void;
}>();

const submittingCreateRequest = ref(false);
const resetFormValues = () => {
  newDeviceName.value = "";
  newDeviceName.touched = false;
};

const router = useRouter();
const createNewDeviceError = ref<ErrorResult | null>(null);
const createNewProxyDevice = async () => {
  submittingCreateRequest.value = true;
  const deviceName = newDeviceName.value.trim();
  const groupName = selectedGroup.value.groupName;
  const createProxyDeviceResponse = await createProxyDevice(
    groupName,
    deviceName
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
  <b-modal title="Create a new proxy device" centered @hidden="resetFormValues">
    <b-form @submit.stop.prevent="createNewProxyDevice">
      <b-form-input
        type="text"
        placeholder="device name"
        data-cy="new device name"
        v-model="newDeviceName.value"
        @blur="newDeviceName.touched = true"
        :state="needsValidationAndIsValidDeviceName"
        :disabled="submittingCreateRequest"
      />
      <b-form-invalid-feedback :state="needsValidationAndIsValidDeviceName">
        <span v-if="newDeviceName.value.trim().length === 0">
          Device name cannot be blank
        </span>
        <span v-else-if="newDeviceName.value.trim().length < 3">
          Device name must be at least 3 characters // TODO - device name regex
          (include macrons)
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
        {{ submittingCreateRequest ? "Creating device" : "Create device" }}
      </button>
    </template>
  </b-modal>
</template>
