<script lang="ts" setup>
import type { Ref } from "vue";
import { computed, inject, onMounted, ref, watch } from "vue";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import {
  getLatestStatusRecordingForDevice,
  getReferenceImageForDeviceAtCurrentLocation,
  updateReferenceImageForDeviceAtCurrentLocation
} from "@api/Device";
import { selectedProjectDevices } from "@models/provides";
import type { ApiDeviceResponse } from "@typedefs/api/device";
import { useRoute } from "vue-router";
import CptvSingleFrame from "@/components/CptvSingleFrame.vue";
import type { DeviceId } from "@typedefs/api/common";
import { drawSkewedImage } from "@/components/skew-image";
import { useElementSize } from "@vueuse/core";
import { encode } from "@jsquash/webp";
import { DeviceType } from "@typedefs/api/consts.ts";
import DeviceSetupReferencePhoto from "@/components/DeviceSetupReferencePhoto.vue";
import DeviceSetupDefineMask from "@/components/DeviceSetupDefineMask.vue";

const overlayOpacity = ref<string>("1.0");
const cptvFrameScale = ref<string>("1.0");
const isMobile = ref(false);
const mobileWidthThreshold = 768;
const devices = inject(selectedProjectDevices) as Ref<
  ApiDeviceResponse[] | null
>;
const route = useRoute();
const deviceId = Number(route.params.deviceId) as DeviceId;
const device = computed<ApiDeviceResponse | null>(() => {
  return (
    (devices.value &&
      devices.value.find(
        (device: ApiDeviceResponse) => device.id === deviceId
      )) ||
    null
  );
});
const latestReferenceImageURL = ref<string | null>(null);
const referenceImage = ref<ImageBitmap | null>(null);
const referenceImageSkew = ref<HTMLCanvasElement>();
const singleFrameCanvas = ref<HTMLDivElement>();
const latestStatusRecording = ref<ApiRecordingResponse | null>(null);
const { width: singleFrameCanvasWidth } = useElementSize(singleFrameCanvas);

onMounted(async () => {
  if (device.value && device.value.type === "thermal") {
    const [latestReferenceImage, _] = await Promise.allSettled([
      getReferenceImageForDeviceAtCurrentLocation(device.value.id),
      loadLatestStatusFrame(),
    ]);
    if (
      latestReferenceImage.status === "fulfilled" &&
      latestReferenceImage.value.success
    ) {
      latestReferenceImageURL.value = URL.createObjectURL(
        latestReferenceImage.value.result
      );
    }
  }
  isMobile.value = window.innerWidth < mobileWidthThreshold;

  // Add event listener to dynamically update isMobile value on window resize
  window.addEventListener('resize', () => {
    isMobile.value = window.innerWidth < mobileWidthThreshold;
  });
});

const loadLatestStatusFrame = async () => {
  if (device.value && device.value.type === "thermal") {
    const latestStatus = await getLatestStatusRecordingForDevice(
      device.value.id,
      device.value.groupId
    );
    if (latestStatus) {
      latestStatusRecording.value = latestStatus;
    }
  }
};

const hasReferencePhoto = computed<boolean>(() => {
  return !!latestReferenceImageURL.value;
});

const hasMaskRegionsDefined = computed<boolean>(() => {
  // TODO
  return false;
});

function navigateToReferencePhoto() {
  console.log("Navigating to reference-photo route");
}

</script>
<template>
  <div>
    <div v-if="isMobile">
      <div class="setupChecklistOptions">
        <div class="setupMenuButton">
          <b-button class="setupMenuButton" variant="outline-secondary" :to="{ name: 'reference-photo' }" @click="navigateToReferencePhoto">
          <font-awesome-icon
            :icon="
              hasReferencePhoto ? ['far', 'circle-check'] : ['far', 'circle']
            "
          />
          Set a reference photo</b-button
        >
        </div>
        <div class="setupMenuButton">
          <b-button class="setupMenuButton" variant="outline-secondary" :to="{ name: 'define-masking' }">
            <font-awesome-icon
              :icon="
                hasMaskRegionsDefined
                  ? ['far', 'circle-check']
                  : ['far', 'circle']
              "
            />
            Define mask regions</b-button
          >
        </div>
      </div>
      <div>
        <router-view></router-view>
      </div>
    </div>
    <div v-if="!isMobile" class="d-flex flex-row justify-content-between p-3">
      <div>
        <h6>Setup checklist</h6>
        <b-list-group>
          <b-button style="margin-bottom: 0.4em;" variant="outline-dark" :to="{ name: 'reference-photo' }" @click="navigateToReferencePhoto">
            <font-awesome-icon
              :icon="
                hasReferencePhoto ? ['far', 'circle-check'] : ['far', 'circle']
              "
            />
            Set a reference photo</b-button
          >
          <b-button variant="outline-dark" :to="{ name: 'define-masking' }">
            <font-awesome-icon
              :icon="
                hasMaskRegionsDefined
                  ? ['far', 'circle-check']
                  : ['far', 'circle']
              "
            />
            Define mask regions (optional)</b-button
          >
        </b-list-group>
      </div>
      <div>
        <router-view></router-view>
      </div>
    </div>
  </div>
</template>
<style scoped lang="less">

@media screen and (max-width: 767px) {
  .setupChecklistOptions {
    display: flex;
    padding-top: 0.4em;
    padding-bottom: 0.4em;
  }

  .setupMenuButton {
    flex: 1;
    text-align: center;
  }
}

.skew-container {
  width: 640px;
  height: 480px;
  //border: 3px dashed #cecece;
  background: #333;
  border-radius: 10px;
}
.skew-canvas {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  right: 0;
  width: 640px;
  height: 480px;
  border-radius: 10px;
}
.handle {
  border-radius: 12px;
  width: 24px;
  height: 24px;
  display: block;
  position: absolute;
  top: 0;
  left: 0;
  opacity: 0.25;
  background-color: rgba(255, 255, 255, 0.25);
  border: 1px solid white;
  cursor: grab;
  transition: opacity 0.2s;
  &:hover {
    opacity: 1;
  }
  &.selected {
    cursor: grabbing;
  }
}
.select-reference-image {
  position: absolute;
  opacity: 0.8;
  width: 60%;
}
.existing-reference-image {
  width: 640px;
  height: 480px;
  border-radius: 10px;
  overflow: hidden;
  img {
    pointer-events: none;
  }
}
.reveal-slider {
  width: 50%;
  overflow: hidden;
  user-select: none;
}
.reveal-handle {
  content: "";
  position: absolute;
  top: calc(50% - 20px);
  width: 40px;
  height: 40px;
  border-radius: 50%;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(0, 0, 0, 0.5);
  left: (calc(50% - 20px));
  font-size: 20px;
  cursor: grab;
  &.selected {
    cursor: grabbing;
  }
  opacity: 0.5;
  transition: opacity 0.2s;
  &:hover {
    opacity: 1;
  }
}

.setupCheckListMenu {
  background-color: white;
}
</style>
