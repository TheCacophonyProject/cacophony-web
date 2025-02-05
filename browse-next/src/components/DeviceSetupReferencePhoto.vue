<script lang="ts" setup>
import { type Ref } from "vue";
import { computed, inject, ref, watch } from "vue";
import { updateReferenceImageForDeviceAtCurrentLocation } from "@api/Device";
import { selectedProjectDevices } from "@models/provides";
import type { ApiDeviceResponse } from "@typedefs/api/device";
import { useRoute } from "vue-router";
import CptvSingleFrame from "@/components/CptvSingleFrame.vue";
import type { DeviceId } from "@typedefs/api/common";
import { drawSkewedImage } from "@/components/skew-image";
import { useElementSize } from "@vueuse/core";
import { encode } from "@jsquash/webp";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import type { LoadedResource } from "@api/types.ts";

const emit = defineEmits<{
  (e: "updated-reference-image"): void;
}>();

const skewContainer = ref<HTMLDivElement>();
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
      devices.value.find((d: ApiDeviceResponse) => d.id === deviceId)) ||
    null
  );
});

const referenceImage = ref<ImageBitmap | null>(null);
const referenceImageSkew = ref<HTMLCanvasElement>();
const singleFrameCanvas = ref<HTMLDivElement>();
const latestStatusRecording = inject("latestStatusRecording") as Ref<
  LoadedResource<ApiRecordingResponse>
>;
const latestReferenceImageURL = inject("latestReferenceImageURL") as Ref<
  LoadedResource<string>
>;
const loading = computed<boolean>(() => {
  return (
    latestStatusRecording.value === null ||
    latestReferenceImageURL.value === null
  );
});

const { width: singleFrameCanvasWidth } = useElementSize(singleFrameCanvas);

// Used to replace (remove) the existing reference image
const replaceExistingReferenceImage = async () => {
  latestReferenceImageURL.value = null;
};

const editingReferenceImage = ref(false);

const editExistingReferenceImage = async () => {
  if (
    latestReferenceImageURL.value &&
    typeof latestReferenceImageURL.value === "string"
  ) {
    try {
      const resp = await fetch(latestReferenceImageURL.value);
      const blob = await resp.blob();
      referenceImage.value = await createImageBitmap(blob);
      editingReferenceImage.value = true;
    } catch (e) {
      console.error("Failed to load existing reference image to edit:", e);
    }
  }
};

const onSelectReferenceImage = async (event: Event) => {
  if (event && event.target && (event.target as HTMLInputElement).files) {
    const files = (event.target as HTMLInputElement).files as FileList;
    const file = files[0];
    referenceImage.value = await createImageBitmap(file);
    positionHandles();
    renderSkewedImage();
  }
};

// ----- Handle corner dragging logic -----
const handle0 = ref<HTMLDivElement>();
const handle1 = ref<HTMLDivElement>();
const handle2 = ref<HTMLDivElement>();
const handle3 = ref<HTMLDivElement>();

const selectedHandle = ref<HTMLDivElement | null>(null);
let grabOffsetX = 0;
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

const singleFrame = ref<HTMLCanvasElement>();

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
  if (clientX === undefined) clientX = handleX;
  if (clientY === undefined) clientY = handleY;

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
    // Logic to constrain each corner to the corners of the singleFrame
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

const buffer = 0; // extra offset in pixels to keep handles away from the exact corner

const positionHandles = () => {
  // Ensure that our essential elements exist
  if (
    !handle0.value ||
    !handle1.value ||
    !handle2.value ||
    !handle3.value ||
    !referenceImage.value
  ) {
    return;
  }

  const handleBounds = handle0.value.getBoundingClientRect();
  const dim = handleBounds.width / 2; // half the handle width

  if (
    singleFrameBounds.top ||
    singleFrameBounds.left ||
    singleFrameBounds.right ||
    singleFrameBounds.bottom
  ) {
    // When singleFrame is available, use its bounds to position handles with buffer adjustments.
    const { left: parentX, top: parentY } = (
      handle0.value.parentElement as HTMLDivElement
    ).getBoundingClientRect();

    // For the top-left handle: push the center inside by the buffer.
    handle0.value.style.left = `${
      singleFrameBounds.left - parentX - dim + buffer
    }px`;
    handle0.value.style.top = `${
      singleFrameBounds.top - parentY - dim + buffer
    }px`;

    // For the top-right handle: move it left by the buffer.
    handle1.value.style.left = `${
      singleFrameBounds.right - parentX - dim - buffer
    }px`;
    handle1.value.style.top = `${
      singleFrameBounds.top - parentY - dim + buffer
    }px`;

    // For the bottom-right handle: move it left and up by the buffer.
    handle2.value.style.left = `${
      singleFrameBounds.right - parentX - dim - buffer
    }px`;
    handle2.value.style.top = `${
      singleFrameBounds.bottom - parentY - dim - buffer
    }px`;

    // For the bottom-left handle: move it right by the buffer.
    handle3.value.style.left = `${
      singleFrameBounds.left - parentX - dim + buffer
    }px`;
    handle3.value.style.top = `${
      singleFrameBounds.bottom - parentY - dim - buffer
    }px`;
  } else {
    // Fallback: if there is no singleFrame, position the handles based on the container dimensions.
    const container = skewContainer.value;
    if (!container) return;
    const { width: cWidth, height: cHeight } =
      container.getBoundingClientRect();

    // Top-left handle inset by the buffer.
    handle0.value.style.left = `${0 - dim + buffer}px`;
    handle0.value.style.top = `${0 - dim + buffer}px`;

    // Top-right handle inset by the buffer.
    handle1.value.style.left = `${cWidth - dim - buffer}px`;
    handle1.value.style.top = `${0 - dim + buffer}px`;

    // Bottom-right handle inset by the buffer.
    handle2.value.style.left = `${cWidth - dim - buffer}px`;
    handle2.value.style.top = `${cHeight - dim - buffer}px`;

    // Bottom-left handle inset by the buffer.
    handle3.value.style.left = `${0 - dim + buffer}px`;
    handle3.value.style.top = `${cHeight - dim - buffer}px`;
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
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.save();
    ctx.globalAlpha = savingReferenceImage.value
      ? 1
      : parseFloat(overlayOpacity.value);

    // drawSkewedImage applies the 4-handle corners to the reference image
    drawSkewedImage(
      ctx,
      [handle0.value, handle1.value, handle2.value, handle3.value],
      referenceImage.value
    );
    ctx.restore();

    // If not saving, draw an outline of the thermal camera's single-frame region
    if (singleFrame.value && !savingReferenceImage.value) {
      ctx.save();
      const {
        width: canvasOnScreenWidth,
        left: parentX,
        top: parentY,
      } = ctx.canvas.getBoundingClientRect();
      const ratio = ctx.canvas.width / canvasOnScreenWidth;
      const singleFrameBounds = singleFrame.value.getBoundingClientRect();

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

      // Darken everything outside the singleFrame bounds
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
        (singleFrameBounds.right - parentX) * ratio,
        (singleFrameBounds.top - parentY) * ratio,
        ctx.canvas.width - (singleFrameBounds.right - parentX) * ratio,
        singleFrameBounds.height * ratio
      );
      ctx.fillRect(
        0,
        (singleFrameBounds.bottom - parentY) * ratio,
        ctx.canvas.width,
        ctx.canvas.height - (singleFrameBounds.bottom - parentY) * ratio
      );
      ctx.restore();
    }
  }
};

watch(overlayOpacity, renderSkewedImage);
watch(singleFrameCanvasWidth, () => {
  // Re-check handle constraints if the singleFrame has changed in size
  if (singleFrame.value && handle0.value) {
    const singleFrameBounds = singleFrame.value.getBoundingClientRect();
    const singleFrameParentBounds = (
      (singleFrame.value.parentElement as HTMLDivElement)
        .parentElement as HTMLDivElement
    ).getBoundingClientRect();

    const sfLeft = singleFrameBounds.left - singleFrameParentBounds.left;
    const sfTop = singleFrameBounds.top - singleFrameParentBounds.top;
    const sfRight = sfLeft + singleFrameBounds.width;
    const sfBottom = sfTop + singleFrameBounds.height;

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

const referenceImageIsLandscape = computed<boolean>(() => {
  if (referenceImage.value) {
    return referenceImage.value.width >= referenceImage.value.height;
  }
  return true;
});

const { width: frameWidth } = useElementSize(skewContainer);

const cptvFrameWidth = computed<number>(() => {
  if (referenceImageIsLandscape.value) {
    return (frameWidth.value / (4 / 3)) * parseFloat(cptvFrameScale.value);
  }
  return frameWidth.value * 0.5 * parseFloat(cptvFrameScale.value);
});

const cptvFrameHeight = computed<number>(() => {
  if (referenceImageIsLandscape.value) {
    return (frameWidth.value / (3 / 4)) * parseFloat(cptvFrameScale.value);
  }
  return frameWidth.value * 0.75 * 0.5 * parseFloat(cptvFrameScale.value);
});

const grabHandle = (event: PointerEvent) => {
  grabOffsetX = event.offsetX;
  grabOffsetY = event.offsetY;
  const target = event.currentTarget as HTMLDivElement;
  target.classList.add("selected");
  selectedHandle.value = target;
  target.setPointerCapture(event.pointerId);
};

const releaseHandle = (event: PointerEvent) => {
  const target = event.currentTarget as HTMLDivElement;
  selectedHandle.value = null;
  target.classList.remove("selected");
  target.releasePointerCapture(event.pointerId);
};

// ----- Reveal slider logic -----
const revealSlider = ref<HTMLDivElement>();
const revealHandle = ref<HTMLDivElement>();
const revealHandleSelected = ref<boolean>(false);
let revealGrabOffsetX = 0;

const grabRevealHandle = (event: PointerEvent) => {
  window.addEventListener("pointermove", moveRevealHandle);
  window.addEventListener("pointerup", releaseRevealHandle);
  revealGrabOffsetX = event.offsetX;
  const target = event.currentTarget as HTMLDivElement;
  target.classList.add("selected");
  revealHandleSelected.value = true;
  target.setPointerCapture(event.pointerId);
};

const moveRevealHandle = (event: PointerEvent) => {
  if (revealHandleSelected.value && revealHandle.value) {
    event.preventDefault();
    const target = revealHandle.value;
    const parentBounds = target.parentElement!.getBoundingClientRect();
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

const releaseRevealHandle = (event: PointerEvent) => {
  if (revealHandleSelected.value && revealHandle.value) {
    window.removeEventListener("pointermove", moveRevealHandle);
    window.removeEventListener("pointerup", releaseRevealHandle);
    const target = revealHandle.value;
    target.classList.remove("selected");
    revealHandleSelected.value = false;
    target.releasePointerCapture(event.pointerId);
  }
};

// ----- Saving reference image -----
const savingReferenceImage = ref<boolean>(false);

const saveReferenceImage = async () => {
  const ctx = referenceImageSkew.value?.getContext("2d");
  if (!ctx) return;

  savingReferenceImage.value = true;
  renderSkewedImage(); // do one final draw at full opacity

  ctx.save();
  const {
    width: canvasOnScreenWidth,
    left: parentX,
    top: parentY,
  } = ctx.canvas.getBoundingClientRect();
  const ratio = ctx.canvas.width / canvasOnScreenWidth;
  const singleFrameBounds = singleFrame.value?.getBoundingClientRect();
  if (!singleFrameBounds) {
    savingReferenceImage.value = false;
    return;
  }

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
    // Refresh or notify success
    emit("updated-reference-image");
    // Optionally switch out of editing mode if editing an existing image
    editingReferenceImage.value = false;
  }
};

const helpInfo = ref(true);
</script>

<template>
  <div class="d-flex flex-row justify-content-between">
    <div class="w-100 d-flex justify-content-center align-items-center">
      <!-- LOADING SPINNER -->
      <div
        v-if="loading"
        class="d-flex justify-content-center align-items-center"
        style="min-width: 640px; min-height: 400px"
      >
        <b-spinner />
      </div>

      <!-- NO REFERENCE IMAGE YET -->
      <div
        class="d-flex justify-content-center align-items-center align-items-lg-start justify-content-lg-start flex-column reference-image"
        v-else-if="!latestReferenceImageURL"
      >
        <b-alert dismissible v-model="helpInfo">
          <p>
            Sometimes it can be difficult to figure out what's going on in a
            thermal camera recording scene.
          </p>
          <p>
            Choose a <strong>'reference photo'</strong>, then adjust it to make
            it match what the thermal camera sees as closely as possible.
            <br /><br />
            This can help you to remember where those bushes or trees were when
            an animal magically emerges from them!
          </p>
        </b-alert>

        <div
          class="d-flex justify-content-center align-items-center position-relative skew-container mt-3"
          ref="skewContainer"
        >
          <cptv-single-frame
            :recording="latestStatusRecording"
            v-if="latestStatusRecording"
            :width="cptvFrameWidth"
            :height="cptvFrameHeight"
            ref="singleFrameCanvas"
            @loaded="(el) => (singleFrame = el)"
          />
          <input
            type="file"
            class="form-control select-reference-image"
            @change="onSelectReferenceImage"
            v-if="!referenceImage"
            accept="image/png, image/jpeg, image/heif"
          />
          <div class="skew-canvas" v-if="referenceImage">
            <canvas
              ref="referenceImageSkew"
              width="1280"
              height="960"
              class="skew-canvas"
            />
            <div
              class="handle"
              ref="handle0"
              @touchstart="(e) => e.preventDefault()"
              @pointerdown="grabHandle"
              @pointerup="releaseHandle"
              @pointermove="moveHandle"
            />
            <div
              class="handle"
              ref="handle1"
              @touchstart="(e) => e.preventDefault()"
              @pointerdown="grabHandle"
              @pointerup="releaseHandle"
              @pointermove="moveHandle"
            />
            <div
              class="handle"
              ref="handle2"
              @touchstart="(e) => e.preventDefault()"
              @pointerdown="grabHandle"
              @pointerup="releaseHandle"
              @pointermove="moveHandle"
            />
            <div
              class="handle"
              ref="handle3"
              @touchstart="(e) => e.preventDefault()"
              @pointerdown="grabHandle"
              @pointerup="releaseHandle"
              @pointermove="moveHandle"
            />
          </div>
        </div>

        <div class="d-flex align-items-center mt-3">
          <div
            v-if="referenceImage"
            class="d-flex justify-content-between align-items-center"
          >
            <div class="me-5">
              <div>
                <label for="opacity">Reference image opacity</label>
                <b-form-input
                  id="opacity"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  v-model="overlayOpacity"
                />
              </div>
              <div>
                <label for="opacity">Location view scale</label>
                <b-form-input
                  id="opacity"
                  type="range"
                  min="0.75"
                  max="1"
                  step="0.01"
                  v-model="cptvFrameScale"
                />
              </div>
            </div>
            <div class="d-flex flex-column">
              <button
                type="button"
                class="btn btn-outline-warning"
                @click="() => (referenceImage = null)"
              >
                Cancel
              </button>
              <button
                type="button"
                class="btn btn-secondary mt-2"
                @click="saveReferenceImage"
              >
                Save reference image
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- REFERENCE IMAGE EXISTS -->
      <div v-else>
        <!-- EDIT MODE for existing reference image -->
        <div
          v-if="editingReferenceImage"
          class="d-flex justify-content-center align-items-center align-items-lg-start justify-content-lg-start flex-column reference-image"
        >
          <div
            class="d-flex justify-content-center align-items-center position-relative skew-container mt-3"
            ref="skewContainer"
          >
            <cptv-single-frame
              :recording="latestStatusRecording"
              v-if="latestStatusRecording"
              :width="cptvFrameWidth"
              :height="cptvFrameHeight"
              ref="singleFrameCanvas"
              @loaded="(el) => (singleFrame = el)"
            />

            <!-- Same canvas + handles as above -->
            <div class="skew-canvas" v-if="referenceImage">
              <canvas
                ref="referenceImageSkew"
                width="1280"
                height="960"
                class="skew-canvas"
              />
              <div
                class="handle"
                ref="handle0"
                @touchstart="(e) => e.preventDefault()"
                @pointerdown="grabHandle"
                @pointerup="releaseHandle"
                @pointermove="moveHandle"
              />
              <div
                class="handle"
                ref="handle1"
                @touchstart="(e) => e.preventDefault()"
                @pointerdown="grabHandle"
                @pointerup="releaseHandle"
                @pointermove="moveHandle"
              />
              <div
                class="handle"
                ref="handle2"
                @touchstart="(e) => e.preventDefault()"
                @pointerdown="grabHandle"
                @pointerup="releaseHandle"
                @pointermove="moveHandle"
              />
              <div
                class="handle"
                ref="handle3"
                @touchstart="(e) => e.preventDefault()"
                @pointerdown="grabHandle"
                @pointerup="releaseHandle"
                @pointermove="moveHandle"
              />
            </div>
          </div>
          <div class="d-flex align-items-center mt-3">
            <div class="d-flex justify-content-between align-items-center">
              <div class="me-5">
                <div>
                  <label for="opacity">Reference image opacity</label>
                  <b-form-input
                    id="opacity"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    v-model="overlayOpacity"
                  />
                </div>
                <div>
                  <label for="opacity">Location view scale</label>
                  <b-form-input
                    id="opacity"
                    type="range"
                    min="0.75"
                    max="1"
                    step="0.01"
                    v-model="cptvFrameScale"
                  />
                </div>
              </div>
              <div class="d-flex flex-column">
                <button
                  type="button"
                  class="btn btn-outline-warning"
                  @click="() => (editingReferenceImage = false)"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class="btn btn-secondary mt-2"
                  @click="saveReferenceImage"
                >
                  Save reference image
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- REVEAL SLIDER MODE (default) -->
        <div
          v-else
          class="d-flex justify-content-center align-items-center flex-column mt-2 mt-lg-0"
        >
          <div class="position-relative">
            <div class="existing-reference-image position-relative">
              <cptv-single-frame
                :recording="latestStatusRecording"
                v-if="latestStatusRecording"
                ref="singleFrameCanvas"
                class="position-absolute"
                @loaded="(el) => (singleFrame = el)"
              />
              <div class="reveal-slider position-absolute" ref="revealSlider">
                <img
                  alt="Current device point-of-view reference photo"
                  :src="latestReferenceImageURL"
                />
              </div>
            </div>
            <div
              class="reveal-handle d-flex align-items-center justify-content-center user-select-none"
              ref="revealHandle"
              @pointerdown="grabRevealHandle"
              @touchstart="(e) => e.preventDefault()"
            >
              <font-awesome-icon icon="left-right" />
            </div>
          </div>
        </div>

        <div class="d-flex flex-column align-items-md-center mt-3">
          <div class="d-flex flex-wrap gap-2">
            <button
              type="button"
              class="btn btn-primary"
              @click="replaceExistingReferenceImage"
            >
              Choose a new reference image
            </button>
            <button
              type="button"
              class="btn btn-secondary"
              @click="editExistingReferenceImage"
            >
              Edit reference image POV
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.reference-image {
  max-width: 640px;
}

@media screen and (min-width: 640px) {
  .existing-reference-image {
    width: 640px;
    height: 480px;
    img {
      width: 640px;
      height: 480px;
      aspect-ratio: auto 4/3;
    }
  }
}

@media screen and (max-width: 639px) {
  .existing-reference-image {
    width: 100svw;
    aspect-ratio: auto 4/3;
    img {
      width: 100svw;
      aspect-ratio: auto 4/3;
    }
  }
}

.skew-container {
  width: 640px;
  aspect-ratio: auto 4/3;
  background: #333;
  border-radius: 10px;
}

.skew-canvas {
  position: absolute;
  left: 0;
  top: 0;
  width: 640px;
  aspect-ratio: auto 4/3;
  border-radius: 10px;
  z-index: 1;
}
@media screen and (max-width: 639px) {
  .skew-container,
  .skew-canvas {
    width: 100svw;
  }
}

.handle {
  border-radius: 12px;
  width: 24px;
  height: 24px;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
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
  border-radius: 10px;
  overflow: hidden;
}

.reveal-slider {
  width: 50%;
  overflow: hidden;
  user-select: none;
}

.reveal-handle {
  position: absolute;
  top: calc(50% - 20px);
  width: 40px;
  height: 40px;
  border-radius: 50%;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(0, 0, 0, 0.5);
  left: calc(50% - 20px);
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
