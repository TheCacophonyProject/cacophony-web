<script lang="ts" setup>
import type { Ref } from "vue";
import { computed, inject, onMounted, ref, watch } from "vue";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import {
  getLatestStatusRecordingForDevice,
  getReferenceImageForDeviceAtCurrentLocation,
  updateReferenceImageForDeviceAtCurrentLocation,
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
const replaceExistingReferenceImage = async () => {
  latestReferenceImageURL.value = null;
};

const onSelectReferenceImage = async (event: Event) => {
  if (event && event.target && (event.target as HTMLInputElement).files) {
    const files = (event.target as HTMLInputElement).files as FileList;
    const file = files[0];
    const hasReferenceImage = referenceImage.value !== undefined;
    referenceImage.value = await createImageBitmap(file);
    if (hasReferenceImage) {
      positionHandles();
      renderSkewedImage();
    }
  }
};

const handle0 = ref<HTMLDivElement>();
const handle1 = ref<HTMLDivElement>();
const handle2 = ref<HTMLDivElement>();
const handle3 = ref<HTMLDivElement>();

const selectedHandle = ref<HTMLDivElement | null>(null);
let grabOffsetX = 0;
let revealGrabOffsetX = 0;
let grabOffsetY = 0;
const moveHandle = (event: PointerEvent) => {
  const handle = event.currentTarget as HTMLDivElement;
  if (selectedHandle.value === handle) {
    handle.setPointerCapture(event.pointerId);
    constrainHandle(handle, event.clientX, event.clientY);
    renderSkewedImage();
  } else {
    handle.releasePointerCapture(event.pointerId);
  }
};

const constrainHandle = (
  handle: HTMLDivElement,
  clientX?: number,
  clientY?: number
) => {
  const {
    width: handleW,
    left: handleX,
    top: handleY,
  } = handle.getBoundingClientRect();
  if (clientX === undefined) {
    clientX = handleX;
  }
  if (clientY === undefined) {
    clientY = handleY;
  }
  const {
    left: parentX,
    top: parentY,
    width,
    height,
  } = (handle.parentElement as HTMLDivElement).getBoundingClientRect();
  let x = Math.min(
    width - handleW,
    Math.max(0, clientX - parentX - grabOffsetX)
  );
  let y = Math.min(
    height - handleW,
    Math.max(0, clientY - parentY - grabOffsetY)
  );
  const dim = handleW / 2;
  if (singleFrame.value) {
    const singleFrameBounds = singleFrame.value.getBoundingClientRect();
    if (handle === handle0.value) {
      x = Math.min(singleFrameBounds.left - (parentX + dim), x);
      y = Math.min(singleFrameBounds.top - (parentY + dim), y);
    } else if (handle === handle1.value) {
      x = Math.max(singleFrameBounds.right - (parentX + dim), x);
      y = Math.min(singleFrameBounds.top - (parentY + dim), y);
    } else if (handle === handle2.value) {
      x = Math.max(singleFrameBounds.right - (parentX + dim), x);
      y = Math.max(singleFrameBounds.bottom - (parentY + dim), y);
    } else if (handle === handle3.value) {
      x = Math.min(singleFrameBounds.left - (parentX + dim), x);
      y = Math.max(singleFrameBounds.bottom - (parentY + dim), y);
    }
  }
  handle.style.left = `${x}px`;
  handle.style.top = `${y}px`;
};

const singleFrame = ref<HTMLDivElement>();
const positionHandles = () => {
  if (
    singleFrame.value &&
    handle0.value &&
    handle1.value &&
    handle2.value &&
    handle3.value &&
    referenceImage.value
  ) {
    const singleFrameBounds = singleFrame.value.getBoundingClientRect();
    const { left: parentX, top: parentY } = (
      handle0.value.parentElement as HTMLDivElement
    ).getBoundingClientRect();
    const handleBounds = (
      handle0.value as HTMLDivElement
    ).getBoundingClientRect();
    const dim = handleBounds.width / 2;
    handle0.value.style.left = `${singleFrameBounds.left - (parentX + dim)}px`;
    handle0.value.style.top = `${singleFrameBounds.top - (parentY + dim)}px`;

    handle1.value.style.left = `${singleFrameBounds.right - (parentX + dim)}px`;
    handle1.value.style.top = `${singleFrameBounds.top - (parentY + dim)}px`;

    handle2.value.style.left = `${singleFrameBounds.right - (parentX + dim)}px`;
    handle2.value.style.top = `${singleFrameBounds.bottom - (parentY + dim)}px`;

    handle3.value.style.left = `${singleFrameBounds.left - (parentX + dim)}px`;
    handle3.value.style.top = `${singleFrameBounds.bottom - (parentY + dim)}px`;
  }
  renderSkewedImage();
};
watch(referenceImageSkew, positionHandles);

const renderSkewedImage = () => {
  const ctx = referenceImageSkew.value?.getContext("2d");
  if (
    ctx &&
    handle0.value &&
    handle1.value &&
    handle2.value &&
    handle3.value &&
    referenceImage.value
  ) {
    ctx.save();
    ctx.globalAlpha = savingReferenceImage.value
      ? 1
      : parseFloat(overlayOpacity.value);
    drawSkewedImage(
      ctx,
      [handle0.value, handle1.value, handle2.value, handle3.value],
      referenceImage.value
    );
    ctx.restore();

    if (singleFrame.value && !savingReferenceImage.value) {
      ctx.save();
      const {
        width: canvasOnScreenWidth,
        left: parentX,
        top: parentY,
      } = ctx.canvas.getBoundingClientRect();
      const ratio = ctx.canvas.width / canvasOnScreenWidth;
      const singleFrameBounds = (
        singleFrame.value as HTMLDivElement
      ).getBoundingClientRect();
      // Now draw the outline of the underlying canvas on top:
      ctx.lineWidth = 1;
      ctx.strokeStyle = "white";
      ctx.globalCompositeOperation = "color-dodge";
      ctx.scale(ratio, ratio);
      ctx.strokeRect(
        singleFrameBounds.left - parentX,
        singleFrameBounds.top - parentY,
        singleFrameBounds.width,
        singleFrameBounds.height
      );
      ctx.restore();
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fillRect(
        0,
        0,
        ctx.canvas.width,
        (singleFrameBounds.top - parentY) * ratio
      );
      ctx.fillRect(
        0,
        (singleFrameBounds.top - parentY) * ratio,
        (singleFrameBounds.left - parentX) * ratio,
        singleFrameBounds.height * ratio
      );
      ctx.fillRect(
        ctx.canvas.width - (singleFrameBounds.left - parentX) * ratio,
        (singleFrameBounds.top - parentY) * ratio,
        ctx.canvas.width - (singleFrameBounds.left - parentX) * ratio,
        singleFrameBounds.height * ratio
      );
      ctx.fillRect(
        0,
        (singleFrameBounds.top - parentY + singleFrameBounds.height) * ratio,
        ctx.canvas.width,
        ctx.canvas.height - (singleFrameBounds.top - parentY) * ratio
      );
      ctx.restore();
    }
  }
};

watch(overlayOpacity, renderSkewedImage);
watch(singleFrameCanvasWidth, (w) => {
  // When the cptv single frame is scaled small, and the handle constraints are close around it,
  // if we scale it large again we need to re-evaluate the handle contraints.
  if (singleFrame.value && handle0.value) {
    const singleFrameBounds = singleFrame.value.getBoundingClientRect();
    const singleFrameParentBounds = (
      (singleFrame.value.parentElement as HTMLDivElement)
        .parentElement as HTMLDivElement
    ).getBoundingClientRect();
    const outerHeight = singleFrameParentBounds.height;
    const outerWidth = singleFrameParentBounds.width;
    const sfLeft = singleFrameBounds.left - singleFrameParentBounds.left;
    const sfTop = singleFrameBounds.top - singleFrameParentBounds.top;
    const sfRight = sfLeft + singleFrameBounds.width; //singleFrameBounds.right - singleFrameParentBounds.right;
    const sfBottom = sfTop + singleFrameBounds.height; //singleFrameBounds.bottom - singleFrameParentBounds.bottom;
    const parentBounds = (
      handle0.value.parentElement as HTMLDivElement
    ).getBoundingClientRect();
    for (const handle of [
      handle0.value,
      handle1.value,
      handle2.value,
      handle3.value,
    ]) {
      const h = handle as HTMLDivElement;
      const { left: handleX, top: handleY, width } = h.getBoundingClientRect();
      const dim = width / 2;
      let x = handleX - parentBounds.left;
      let y = handleY - parentBounds.top;
      if (h === handle0.value) {
        x = Math.min(x, sfLeft - dim);
        y = Math.min(y, sfTop - dim);
      } else if (h === handle1.value) {
        x = Math.max(x, sfRight - dim);
        y = Math.min(y, sfTop - dim);
      } else if (h === handle2.value) {
        x = Math.max(x, sfRight - dim);
        y = Math.max(y, sfBottom - dim);
      } else if (h === handle3.value) {
        x = Math.min(x, sfLeft - dim);
        y = Math.max(y, sfBottom - dim);
      }
      h.style.left = `${x}px`;
      h.style.top = `${y}px`;
    }
  }
  renderSkewedImage();
});
watch(cptvFrameScale, renderSkewedImage);

const grabHandle = (event: PointerEvent) => {
  // NOTE: Maintain the offset of the cursor on the pointer when it's selected.
  grabOffsetX = event.offsetX;
  grabOffsetY = event.offsetY;
  const target = event.currentTarget as HTMLDivElement;
  target.classList.add("selected");
  selectedHandle.value = target;
  target.setPointerCapture(event.pointerId);
};

const revealHandleSelected = ref<boolean>(false);
const grabRevealHandle = (event: PointerEvent) => {
  // NOTE: Maintain the offset of the cursor on the pointer when it's selected.
  revealGrabOffsetX = event.offsetX;
  const target = event.currentTarget as HTMLDivElement;
  target.classList.add("selected");
  revealHandleSelected.value = true;
  target.setPointerCapture(event.pointerId);
};

const releaseHandle = (event: PointerEvent) => {
  const target = event.currentTarget as HTMLDivElement;
  selectedHandle.value = null;
  target.classList.remove("selected");
  target.releasePointerCapture(event.pointerId);
};

const releaseRevealHandle = (event: PointerEvent) => {
  const target = event.currentTarget as HTMLDivElement;
  target.classList.remove("selected");
  revealHandleSelected.value = false;
  target.releasePointerCapture(event.pointerId);
};

const moveRevealHandle = (event: PointerEvent) => {
  if (revealHandleSelected.value) {
    const target = event.currentTarget as HTMLDivElement;
    const parentBounds = (
      target.parentElement as HTMLDivElement
    ).getBoundingClientRect();
    const handleBounds = target.getBoundingClientRect();
    const x = Math.min(
      Math.max(
        -(handleBounds.width / 2),
        event.clientX - parentBounds.left - revealGrabOffsetX
      ),
      parentBounds.width - handleBounds.width / 2
    );
    if (revealSlider.value) {
      revealSlider.value.style.width = `${x + handleBounds.width / 2}px`;
    }
    target.style.left = `${x}px`;
  }
};

const referenceImageIsLandscape = computed<boolean>(() => {
  if (referenceImage.value) {
    return referenceImage.value?.width >= referenceImage.value?.height;
  }
  return true;
});

const cptvFrameWidth = computed<number>(() => {
  if (referenceImageIsLandscape.value) {
    return 480 * parseFloat(cptvFrameScale.value);
  }
  return 320 * parseFloat(cptvFrameScale.value);
});

const cptvFrameHeight = computed<number>(() => {
  if (referenceImageIsLandscape.value) {
    return 360 * parseFloat(cptvFrameScale.value);
  }
  return 240 * parseFloat(cptvFrameScale.value);
});

const savingReferenceImage = ref<boolean>(false);
const saveReferenceImage = async () => {
  const ctx = referenceImageSkew.value?.getContext("2d");
  if (ctx) {
    savingReferenceImage.value = true;
    renderSkewedImage();
    ctx.save();
    const {
      width: canvasOnScreenWidth,
      left: parentX,
      top: parentY,
    } = ctx.canvas.getBoundingClientRect();
    const ratio = ctx.canvas.width / canvasOnScreenWidth;
    const singleFrameBounds = (
      singleFrame.value as HTMLDivElement
    ).getBoundingClientRect();
    // Now draw the outline of the underlying canvas on top:
    const imageData = ctx.getImageData(
      (singleFrameBounds.left - parentX) * ratio,
      (singleFrameBounds.top - parentY) * ratio,
      singleFrameBounds.width * ratio,
      singleFrameBounds.height * ratio
    );
    ctx.restore();

    savingReferenceImage.value = false;
    renderSkewedImage();

    const webp = await encode(imageData, { quality: 90 });
    const response = await updateReferenceImageForDeviceAtCurrentLocation(
      device.value!.id,
      webp
    );
    if (response.success) {
      const referenceImage = await getReferenceImageForDeviceAtCurrentLocation(
        device.value!.id
      );
      if (referenceImage.success) {
        latestReferenceImageURL.value = URL.createObjectURL(
          referenceImage.result
        );
      }
    }
  }
};

const revealSlider = ref<HTMLDivElement>();
const revealHandle = ref<HTMLDivElement>();

const hasLocation = computed<boolean>(() => {
  return (device.value && !!device.value.location) || false;
});

const hasReferencePhoto = computed<boolean>(() => {
  return !!latestReferenceImageURL.value;
});

const hasMaskRegionsDefined = computed<boolean>(() => {
  // TODO
  return false;
});

const deviceTypeIsKnown = computed<boolean>(() => {
  return (device.value && device.value.type !== DeviceType.Unknown) || false;
});
</script>
<template>
  <div>
    <div class="d-flex flex-row justify-content-between p-3">
      <div>
        <h6 class="ms-3">Setup checklist</h6>
        <b-list-group>
          <b-list-group-item :to="{ name: 'reference-photo' }" button>
            <font-awesome-icon
              :icon="
                hasReferencePhoto ? ['far', 'circle-check'] : ['far', 'circle']
              "
            />
            Set a reference photo</b-list-group-item
          >
          <b-list-group-item :to="{ name: 'define-masking' }" button>
            <font-awesome-icon
              :icon="
                hasMaskRegionsDefined
                  ? ['far', 'circle-check']
                  : ['far', 'circle']
              "
            />
            Define mask regions (optional)</b-list-group-item
          >
        </b-list-group>
      </div>
      <!-- <DeviceSetupReferencePhoto /> -->
      <DeviceSetupDefineMask />
    </div>
  </div>
</template>
<style scoped lang="less">
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
</style>
