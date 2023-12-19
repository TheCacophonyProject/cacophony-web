<script setup lang="ts">
import type { Ref } from "vue";
import { ref, onMounted, onBeforeUnmount, computed, inject, reactive, watch} from "vue";
import { useDevicePixelRatio } from "@vueuse/core";
import {
  getLatestStatusRecordingForDevice,
  getReferenceImageForDeviceAtCurrentLocation,
  updateReferenceImageForDeviceAtCurrentLocation,
  getMaskRegionsForDevice,
  updateMaskRegionsForDevice
} from "@api/Device";
import { useRoute } from "vue-router";
import type { ApiDeviceResponse } from "@typedefs/api/device";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import type { DeviceId } from "@typedefs/api/common";
import { selectedProjectDevices } from "@models/provides";
import CptvSingleFrame from "@/components/CptvSingleFrame.vue";

interface Point {
  x: number;
  y: number;
}

interface Region {
  regionData: Point[];
  regionLabel: string;
}

const isMobile = ref(false);
const mobileWidthThreshold = 768;
const canvas = ref<HTMLCanvasElement>(null);
const container = ref<HTMLCanvasElement | null>(null);
const singleFrameCanvas = ref<HTMLCanvasElement | null>(null);
const regionsArray = ref<Region[]>([]);
const points = ref<Point[]>([]);
const selectingArea = ref<boolean>(false);
const creatingRegion = ref<boolean>(false);
const maskEnabled = ref<boolean>(true);
const inclusionRegion = ref<boolean>(true);
const creatingRegionAborted = ref<boolean>(false);
const devicePixelRatio = useDevicePixelRatio();
const polygonClosedTolerance = ref(10);
const referenceImage = ref<ImageBitmap | null>(null);
const latestStatusRecording = ref<ApiRecordingResponse | null>(null);
const latestReferenceImageURL = ref<string | null>(null);
const route = useRoute();
const deviceId = Number(route.params.deviceId) as DeviceId;
const cptvFrameHeight = ref<number>(0);
const cptvFrameWidth = ref<number>(0);
const userInput = ref("");
const device = computed<ApiDeviceResponse | null>(() => {
  return (
    (devices.value &&
      devices.value.find(
        (device: ApiDeviceResponse) => device.id === deviceId
      )) ||
    null
  );
});

const getExistingMaskRegions = async () => {
  const mostRecentTime = new Date(new Date().setDate(new Date().getDate() + 100));
  if (device.value) {
    const existingMaskRegions = await getMaskRegionsForDevice(
      device.value.id,
      mostRecentTime
    );

    if (existingMaskRegions.success) {
      console.log("Gotttit: ", existingMaskRegions.result.maskRegions);
      const regionKeys = Object.keys(existingMaskRegions.result.maskRegions);
      console.log("region keys:", regionKeys);
      for (let i = 0; i < regionKeys.length; i++) {
        regionsArray.value.push({
          regionData: existingMaskRegions.result.maskRegions[i].regionData,
.maskRegions[i].regionLabel,
        });
      }
    }
  }
};

// const updateExistingMaskRegions = async () => {
//   const jsonStructure = {
//     maskRegions: regionsArray,
//   };
//   const data = JSON.parse(JSON.stringify(jsonStructure, null, 2));
//   console.log("Data is: ", JSON.stringify(data));
//   await updateMaskRegionsForDevice(device.value.id, data);
// };

const updateExistingMaskRegions = async () => {
  const formattedRegions = regionsArray.value.map(region => ({
    regionLabel: region.regionLabel,
    regionData: region.regionData,
  }));
  await updateMaskRegionsForDevice(device.value.id, {
    maskRegions: formattedRegions,
  });
};

const devices = inject(selectedProjectDevices) as Ref<
  ApiDeviceResponse[] | null
>;

const enableAddRegionsButton = computed(() => {
  return isPolygonClosed() && isInputNotEmpty.value;
});

const isFirstPoint = computed(() => {
  return points.value.length === 0;
});

const areExistingRegions = computed(() => {
  return regionsArray.value.length > 0;
});

const isInputNotEmpty = computed(() => {
  return userInput.value.trim().length > 0;
});

const computeImageDimensions = () => {
  isMobile.value = window.innerWidth < mobileWidthThreshold;
  const img = document.querySelector(".image-container");
  if (img) {
    const viewportWidth = window.innerWidth;
    if (!isMobile.value) {
      cptvFrameWidth.value = 160 * (viewportWidth / 450);
      cptvFrameHeight.value = 120 * (viewportWidth / 450);
    } else {
      cptvFrameWidth.value = 160 * (viewportWidth / 225);
      cptvFrameHeight.value = 120 * (viewportWidth / 225);
    }
    const canvasElement = canvas.value;
    canvasElement.width =
      cptvFrameWidth.value * devicePixelRatio.pixelRatio.value;
    canvasElement.height =
      cptvFrameHeight.value * devicePixelRatio.pixelRatio.value;
  }
};

onMounted(async () => {
  getExistingMaskRegions();
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
  const canvasElement = canvas.value;
  canvasElement.width =
    cptvFrameWidth.value * devicePixelRatio.pixelRatio.value;
  canvasElement.height =
    cptvFrameHeight.value * devicePixelRatio.pixelRatio.value;
  computeImageDimensions();
  clearMask();
  generateMask();
  window.addEventListener("resize", () => {
    clearMask();
    computeImageDimensions();
    generateMask();
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

onBeforeUnmount(() => {
  window.removeEventListener("resize", computeImageDimensions);
  window.removeEventListener("resize", generateMask);
  window.removeEventListener("resize", clearMask);
});

function normalise(x: number, y: number): Point {
  const normalisedX = x / cptvFrameWidth.value;
  const normalisedY = y / cptvFrameHeight.value;

  return {
    x: normalisedX,
    y: normalisedY,
  };
}

function pointSelect(event: MouseEvent): void {
  if (creatingRegion.value && !enableAddRegionsButton.value) {
    const { left, top } = container.value.getBoundingClientRect();
    const clickedX = event.clientX - left;
    const clickedY = event.clientY - top;
    const values = normalise(clickedX, clickedY);
    points.value.push({ x: values.x, y: values.y });
    drawPolygon();
  }
}

function drawRegionIndices() {
  const canvasElement = canvas.value;
  const context = canvasElement.getContext("2d");
  const fontSize = 18 * devicePixelRatio.pixelRatio.value;
  context.font = `bold ${fontSize}px Arial`;
  for (let i = 0; i < regionsArray.value.length; i++) {
    const regionData = regionsArray.value[i].regionData;
    const firstPoint = regionData[0];
    const text = `${i + 1}`;
    const textMetrics = context.measureText(text);
    const textWidth = textMetrics.width;
    const circleRadius = devicePixelRatio.pixelRatio.value * 14; // Radius based on half of the text width

    const circleX = firstPoint.x * canvas.value.width;
    const circleY =
      firstPoint.y * canvas.value.height +
      2 * devicePixelRatio.pixelRatio.value;

    context.fillStyle = "rgba(13, 110, 253)";
    context.beginPath();
    context.arc(circleX, circleY, circleRadius, 0, Math.PI * 2);
    context.closePath();
    context.fill();

    context.fillStyle = "#ffffff";
    context.fillText(
      text,
      circleX - textMetrics.width / 2,
      circleY + fontSize / 2
    );
  }
}

function drawPolygon(): void {
  const canvasElement = canvas.value;
  const context = canvasElement.getContext("2d");
  context.lineWidth = 4 * devicePixelRatio.pixelRatio.value;
  context.strokeStyle = "rgba(13, 110, 253, 1)";
  context.beginPath();
  for (let i = 0; i < points.value.length; i++) {
    const x = points.value[i].x * canvas.value.width;
    const y = points.value[i].y * canvas.value.height;
    if (i === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }
  context.stroke();

  context.fillStyle = "rgba(13, 110, 253, 1)";
  for (let i = 0; i < points.value.length; i++) {
    const x = points.value[i].x * canvas.value.width;
    const y = points.value[i].y * canvas.value.height;
    context.beginPath();
    context.arc(x, y, 4 * devicePixelRatio.pixelRatio.value, 0, Math.PI * 2);
    context.closePath();
    context.fill();
  }
}

function isPolygonClosed(): boolean {
  if (points.value.length < 2) {
    return false;
  }
  const firstPoint = points.value[0];
  const lastPoint = points.value[points.value.length - 1];
  if (
    !firstPoint ||
    !lastPoint ||
    !("x" in firstPoint) ||
    !("x" in lastPoint)
  ) {
    return false;
  }

  const distance = Math.sqrt(
    Math.pow(
      firstPoint.x * canvas.value.width - lastPoint.x * canvas.value.width,
      2
    ) +
      Math.pow(
        firstPoint.y * canvas.value.height - lastPoint.y * canvas.value.height,
        2
      )
  );

  if (distance < polygonClosedTolerance.value) {
    points.value[points.value.length - 1] = points.value[0];
  }

  clearMask();
  generateMask();
  drawPolygon();
  return distance < polygonClosedTolerance.value;
}

const toggleAreaSelect = () => {
  updateExistingMaskRegions();
  selectingArea.value = !selectingArea.value;
  points.value = [];
  clearMask();
  generateMask();
};

watch(maskEnabled, (newValue) => {
  points.value = [];
  generateMask();
});

const toggleInclusionRegion = () => {
  inclusionRegion.value = !inclusionRegion.value;
  generateMask();
};

function removePoint(): void {
  if (points.value.length > 1) {
    points.value.pop();
  } else {
    points.value = [];
  }
  clearMask();
  generateMask();
  drawPolygon();
}

function addRegionSelection(): void {
  regionsArray.value.push({
    regionData: points.value,
    regionLabel: userInput.value,
  });

  console.log("Regions array is: ", regionsArray);
  points.value = [];
  toggleCreatingRegion();
  clearMask();
  generateMask();
}

function generateMask() {
  if (maskEnabled.value) {
    polygonClosedTolerance.value = devicePixelRatio.pixelRatio.value * 10;
    if (regionsArray.value.length === 0) {
      return;
    }
    const maskCanvas = canvas.value;
    const maskContext = maskCanvas.getContext("2d");
    maskCanvas.width = cptvFrameWidth.value * devicePixelRatio.pixelRatio.value;
    maskCanvas.height = cptvFrameHeight.value * devicePixelRatio.pixelRatio.value;

    if (inclusionRegion.value) {
      regionsArray.value.forEach(({ regionData }) => {
        maskContext.beginPath();
        maskContext.moveTo(
          regionData[0].x * maskCanvas.width,
          regionData[0].y * maskCanvas.height
        );
        for (let i = 1; i < regionData.length; i++) {
          maskContext.lineTo(
            regionData[i].x * maskCanvas.width,
            regionData[i].y * maskCanvas.height
          );
        }
        maskContext.closePath();
        maskContext.fillStyle = "rgba(0, 0, 0, 0.7)";
        maskContext.fill("evenodd");
      });
    } else {
      maskContext.beginPath();
      maskContext.moveTo(0, 0);
      maskContext.lineTo(maskCanvas.width, 0);
      maskContext.lineTo(maskCanvas.width, maskCanvas.height);
      maskContext.lineTo(0, maskCanvas.height);
      maskContext.lineTo(0, 0);

      regionsArray.value.forEach((region) => {
        const regionData = region.regionData;
        maskContext.moveTo(
          regionData[0].x * maskCanvas.width,
          regionData[0].y * maskCanvas.height
        );
        for (let i = 1; i < regionData.length; i++) {
          maskContext.lineTo(
            regionData[i].x * maskCanvas.width,
            regionData[i].y * maskCanvas.height
          );
        }
        maskContext.closePath();
      });

      maskContext.fillStyle = "rgba(0, 0, 0, 0.7)";
      maskContext.fill("evenodd");
    }
    drawRegionIndices();
  } else {
    clearMask();
  }
}

const clearMask = () => {
  const canvasElement = canvas.value;
  const context = canvasElement.getContext("2d");
  context.clearRect(0, 0, canvasElement.width, canvasElement.height);
};

function deleteRegion(index: number) {
  regionsArray.value.splice(index, 1);
  clearMask();
  generateMask();
}

function toggleCreatingRegion(): void {
  creatingRegion.value = !creatingRegion.value;
  if (creatingRegionAborted.value) {
    points.value = [];
  }
  creatingRegionAborted.value = false;
}

function cancelCreatingRegion(): void {
  creatingRegionAborted.value = true;
  toggleCreatingRegion();
  clearMask();
  generateMask();
}

// const cptvFrameWidth = computed<number>(() => {
//   if (isMobile.value) {
//     if (referenceImageIsLandscape.value) {
//       return 360 * parseFloat(cptvFrameScale.value);
//     }
//     return 240 * parseFloat(cptvFrameScale.value);
//   } else {
//     if (referenceImageIsLandscape.value) {
//       return 480 * parseFloat(cptvFrameScale.value);
//     }
//     return 320 * parseFloat(cptvFrameScale.value);
//   }
// });

// const cptvFrameHeight = computed<number>(() => {
//   if (isMobile.value) {
//     if (referenceImageIsLandscape.value) {
//       return 270 * parseFloat(cptvFrameScale.value);
//     }
//     return 280 * parseFloat(cptvFrameScale.value);
//   } else {
//     if (referenceImageIsLandscape.value) {
//       return 360 * parseFloat(cptvFrameScale.value);
//     }
//     return 240 * parseFloat(cptvFrameScale.value);
//   }
// });

// const referenceImageIsLandscape = computed<boolean>(() => {
//   if (referenceImage.value) {
//     return referenceImage.value?.width >= referenceImage.value?.height;
//   }
//   return true;
// });
</script>

<template>
  <div>
    <div class="d-flex justify-content-center align-items-center flex-column">
      <p>Select multiple points on the image to form a closed polygon</p>
    </div>
    <div class="content-container">
      <div class="left-side-container">
        <div class="dark-container">
          <div class="image-container" ref="container" @click="pointSelect">
            <cptv-single-frame
              :recording="latestStatusRecording"
              v-if="latestStatusRecording"
              :style="{
                width: cptvFrameWidth + 'px',
                height: cptvFrameHeight + 'px',
              }"
              :height="cptvFrameHeight"
              ref="singleFrameCanvas"
              @loaded="(el) => (singleFrame = el)"
            />
            <canvas
              :style="{
                width: cptvFrameWidth + 'px',
                height: cptvFrameHeight + 'px',
              }"
              @click="generateMask"
              ref="canvas"
            ></canvas>
          </div>
        </div>
        <div class="region-mask-switch">
          <div class="form-check form-switch">
            <label class="form-check-label" for="flexSwitchCheckChecked"
              >Region Mask</label
            >
            <input
              class="form-check-input"
              type="checkbox"
              role="switch"
              id="flexSwitchCheckChecked"
              :checked="maskEnabled"
              @change="maskEnabled = !maskEnabled"
            />
          </div>
        </div>
        <div class="inclusion-switch">
          <div class="form-check form-switch">
            <label class="form-check-label" for="flexSwitchCheckChecked"
              >Exclusion Region</label
            >
            <input
              class="form-check-input"
              type="checkbox"
              role="switch"
              id="flexSwitchCheckChecked"
              @click="toggleInclusionRegion"
              checked
            />
          </div>
        </div>
      </div>
      <div class="right-side-content">
        <div class="existing-regions">
          <h6 class="existing-regions-heading">Existing regions</h6>
          <div class="existing-regions-content">
            <div class="no-existing-regions-label" v-if="!areExistingRegions">
              <p>No existing regions</p>
            </div>
            <div class="regionsListContainer">
              <div
                v-for="(item, index) in regionsArray"
                :key="index"
                class="region-content"
              >
                <p class="region-label">Region {{ index + 1 }}</p>
                <b-button
                  class="delete-button"
                  v-if="selectingArea"
                  variant="danger"
                  @click="deleteRegion(index)"
                >
                  Delete
                </b-button>
              </div>
            </div>
          </div>
          <b-button
            class="select-area-button"
            :variant="selectingArea ? 'success' : 'primary'"
            @click="toggleAreaSelect"
          >
            {{ selectingArea ? "Save Regions" : "Edit Regions" }}</b-button
          >
        </div>
        <div v-if="selectingArea" class="region-creation-tools-container">
          <h6 class="region-creation-tools-heading">Region Creation Tools</h6>
          <b-button
            v-if="selectingArea && !creatingRegion"
            class="create-region-button"
            variant="danger"
            @click="toggleCreatingRegion"
          >
            Create Region
          </b-button>
          <b-button
            v-if="selectingArea && creatingRegion"
            :disabled="isFirstPoint"
            class="remove-point-button"
            variant="danger"
            @click="removePoint"
          >
            Undo Point
          </b-button>
          <input
            v-if="selectingArea && creatingRegion"
            class="label-input"
            type="text"
            v-model="userInput"
            placeholder="Region label"
          />
          <b-button
            v-if="selectingArea && creatingRegion"
            :disabled="!enableAddRegionsButton"
            class="add-region-button"
            variant="success"
            @click="addRegionSelection"
          >
            Add Region
          </b-button>
          <b-button
            v-if="selectingArea && creatingRegion"
            class="cancel-new-region-button"
            variant="primary"
            @click="cancelCreatingRegion"
          >
            Cancel
          </b-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@media screen and (max-width: 767px) {
  .content-container {
    justify-content: center;
    display: grid;
  }
  .right-side-content {
    position: relative;
    border-radius: 0.6em;
  }

  p {
    font-size: 0.9em;
  }

  .dark-container {
    background-color: rgba(58, 58, 58);
    padding: 0.6em;
    border-radius: 0.4em;
  }

  .existing-regions {
    display: grid;
    position: relative;
    background-color: rgba(58, 58, 58);
    padding: 0.8em;
    padding-bottom: 0;
    border-radius: 0.4em;
    color: white;
    margin-bottom: 0.5em;
  }

  .region-creation-tools-container {
    grid-area: create-region;
    display: grid;
    position: absolute;
    width: 100%;
    background-color: rgba(58, 58, 58);
    padding: 0.8em;
    padding-bottom: 0px;
    border-radius: 0.4em;
    color: white;
  }
}

@media screen and (min-width: 768px) and (max-width: 1023px) {
  .content-container {
    display: flex;
    justify-content: center;
  }

  h5 {
    font-size: 1.1em;
  }
  p {
    font-size: 0.9em;
  }

  .right-side-content {
    padding-left: 0.5em;
    padding-bottom: 0.4em;
    position: relative;
    border-radius: 0.4em;
  }

  .dark-container {
    background-color: rgba(58, 58, 58);
    padding: 0.6em;
    border-radius: 0.4em;
  }

  .existing-regions {
    display: grid;
    width: 14em;
    position: relative;
    background-color: rgba(58, 58, 58);
    padding: 0.8em;
    padding-bottom: 0;
    border-radius: 0.4em;
    color: white;
    margin-bottom: 0.5em;
  }

  .region-creation-tools-container {
    display: grid;
    width: 14em;
    position: absolute;
    background-color: rgba(58, 58, 58);
    padding: 0.8em;
    padding-bottom: 0px;
    border-radius: 0.4em;
    color: white;
  }
}

@media screen and (min-width: 1024px) {
  .content-container {
    display: flex;
    justify-content: center;
  }

  .right-side-content {
    position: relative;
    border-radius: 0.4em;
    /* background-color: green; */
    padding-left: 0.6em;
  }

  .dark-container {
    background-color: rgba(58, 58, 58);
    padding: 0.7em;
    border-radius: 0.4em;
  }

  .existing-regions {
    display: grid;
    width: 14em;
    position: relative;
    background-color: rgba(58, 58, 58);
    padding: 0.8em;
    padding-bottom: 0;
    border-radius: 0.4em;
    color: white;
    margin-bottom: 0.5em;
  }

  .region-creation-tools-container {
    display: grid;
    width: 14em;
    position: absolute;
    background-color: rgba(58, 58, 58);
    padding: 0.8em;
    padding-bottom: 0px;
    border-radius: 0.4em;
    color: white;
  }
}

.remove-point-button,
.add-region-button,
.create-region-button {
  margin-bottom: 0.6em;
}

.select-area-button,
.cancel-new-region-button {
  display: block;
  margin: 0 auto; /* Center horizontally */
  margin-bottom: 0.6em;
  text-align: center; /* Center text content */
}

.image-container {
  position: relative;
}

.left-side-container {
  position: relative;
  border-radius: 1em;
}
.no-existing-regions-label {
  margin: 0.2em;
  transform: translateY(20%);
  text-align: center;
}
.region-content {
  background-color: rgb(222, 221, 221);
  display: flex;
  margin: 0.2em;
  border-radius: 0.3em;
}

.region-label {
  position: relative;
  transform: translateY(30%);
  text-align: center;
  flex: 10;
}

.delete-button {
  flex: 1;
}

.select-area-button {
  width: 8em;
}

canvas {
  position: absolute;
  top: 0;
  left: 0;
}

.existing-regions-content {
  background-color: white;
  color: black;
  border-radius: 0.3em;
  margin-bottom: 0.6em;
}

.region-creation-tools-heading,
.existing-regions-heading {
  margin-bottom: 0.6em;
}

.region-mask-switch {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 10px;
  /* background-color: green; */
}

.inclusion-switch {
  display: flex; 
  justify-content: center;
  align-items: center;
}

.existing-region-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}

.area-of-interest-heading {
  padding-bottom: 0.6em;
}

.label-input {
  display: block;
  width: 100%; /* Adjust width as needed */
  padding: 0.375rem 0.75rem;
  font-size: 1rem;
  font-weight: 400;
  line-height: 1.5;
  color: #495057;
  background-color: #fff;
  background-clip: padding-box;
  border: 1px solid #ced4da;
  border-radius: 0.25rem;
  transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
  margin-bottom: 0.6em; /* Adjust margin as needed */
}
</style>