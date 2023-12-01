<script setup lang="ts">
import type { Ref } from "vue";
import { ref, onMounted, onBeforeUnmount, computed, inject } from "vue";
import { useDevicePixelRatio } from "@vueuse/core";
import {
  getLatestStatusRecordingForDevice,
  getReferenceImageForDeviceAtCurrentLocation,
  updateReferenceImageForDeviceAtCurrentLocation,
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
  regionData: {
    x: number;
    y: number;
  }[];
}

const isMobile = ref(false);
const mobileWidthThreshold = 768;
const canvas = ref<HTMLCanvasElement | null>(null);
const container = ref<HTMLCanvasElement | null>(null);
const singleFrameCanvas = ref<HTMLCanvasElement | null>(null);
const regionsArray = ref<Region[]>([]);
const points = ref<Point[]>([]);
const selectingArea = ref<boolean>(false);
const creatingRegion = ref<boolean>(false);
const maskEnabled = ref<boolean>(true);
const creatingRegionAborted = ref<boolean>(false);
const devicePixelRatio = useDevicePixelRatio();
const polygonClosedTolerance = ref(10);
const referenceImage = ref<ImageBitmap | null>(null);
const latestStatusRecording = ref<ApiRecordingResponse | null>(null);
const latestReferenceImageURL = ref<string | null>(null);
const route = useRoute();
const cptvFrameScale = ref<string>("1.0");
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

const devices = inject(selectedProjectDevices) as Ref<
  ApiDeviceResponse[] | null
>;

const enableAddRegionsButton = computed(() => {
  return isPolygonClosed();
});

const isFirstPoint = computed(() => {
  return points.value.length === 0;
});

const areExistingRegions = computed(() => {
  return regionsArray.value.length > 0;
});

const computeImageDimensions = () => {
  isMobile.value = window.innerWidth < mobileWidthThreshold;
  console.log("dims: ", cptvFrameWidth, cptvFrameHeight);
  const img = document.querySelector(".imageContainer img");
  if (img) {
    // cptvFrameWidth.value = img.clientWidth;
    // cptvFrameHeight.value = img.clientHeight;
    const canvasElement = canvas.value;
    canvasElement.width = cptvFrameWidth.value * devicePixelRatio.pixelRatio.value;
    canvasElement.height =
      cptvFrameHeight.value * devicePixelRatio.pixelRatio.value;
  }
};

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
  const canvasElement = canvas.value;
  canvasElement.width = cptvFrameWidth.value * devicePixelRatio.pixelRatio.value;
  canvasElement.height = cptvFrameHeight.value * devicePixelRatio.pixelRatio.value;
  computeImageDimensions();
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
    let values = normalise(clickedX, clickedY);
    points.value.push({ x: values.x, y: values.y });
    drawPolygon();
  }
}

function drawRegionIndices() {
  const canvasElement = canvas.value;
  const context = canvasElement.getContext("2d");
  let fontSize = 18 * devicePixelRatio.pixelRatio.value;
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

  clearMask(); //causes them to snap as desired, however recursion error
  generateMask();
  drawPolygon();
  return distance < polygonClosedTolerance.value;
}

const toggleAreaSelect = () => {
  selectingArea.value = !selectingArea.value;
  points.value = [];
  clearMask();
  generateMask();
};

const toggleMaskEnabled = () => {
  maskEnabled.value = !maskEnabled.value;
  if (maskEnabled.value) {
    points.value = [];
    clearMask();
    generateMask();
  } else {
    clearMask();
  }
};

function removePoint(): void {
  if (points.value.length > 1) {
    points.value.pop();
    drawPolygon();
  } else {
    points.value = [];
  }
  clearMask();
  generateMask();
  drawPolygon();
}

function addRegionSelection(): void {
  regionsArray.value.push({ regionData: points.value });
  points.value = [];
  toggleCreatingRegion();
  const canvasElement = canvas.value;
  const context = canvasElement.getContext("2d");
  context.clearRect(0, 0, canvasElement.width, canvasElement.height);
  generateMask();
}

function generateMask() {
  polygonClosedTolerance.value = devicePixelRatio.pixelRatio.value * 10;
  if (regionsArray.value.length === 0) {
    return;
  }

  const maskCanvas = canvas.value;
  const maskContext = maskCanvas.getContext("2d");
  maskCanvas.width = cptvFrameWidth.value * devicePixelRatio.pixelRatio.value;
  maskCanvas.height = cptvFrameHeight.value * devicePixelRatio.pixelRatio.value;

  regionsArray.value.forEach((region) => {
    maskContext.beginPath();
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
    maskContext.fillStyle = "rgba(0, 0, 0, 0.7)";
    maskContext.fill("evenodd");
  });
  drawRegionIndices();
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

const cptvFrameWidth = computed<number>(() => {
  if (isMobile.value) {
    if (referenceImageIsLandscape.value) {
      return 360 * parseFloat(cptvFrameScale.value);
    }
    return 240 * parseFloat(cptvFrameScale.value);
  } else {
    if (referenceImageIsLandscape.value) {
      return 480 * parseFloat(cptvFrameScale.value);
    }
    return 320 * parseFloat(cptvFrameScale.value);
  }
});

const cptvFrameHeight = computed<number>(() => {
  if (isMobile.value) {
    if (referenceImageIsLandscape.value) {
      return 270 * parseFloat(cptvFrameScale.value);
    }
    return 280 * parseFloat(cptvFrameScale.value);
  } else {
    if (referenceImageIsLandscape.value) {
      return 360 * parseFloat(cptvFrameScale.value);
    }
    return 240 * parseFloat(cptvFrameScale.value);
  }
});

const referenceImageIsLandscape = computed<boolean>(() => {
  if (referenceImage.value) {
    return referenceImage.value?.width >= referenceImage.value?.height;
  }
  return true;
});
</script>

<template>
  <div>
    <div class=" d-flex justify-content-center align-items-center flex-column">
      <p>Select multiple points on the image to form a closed polygon</p>
    </div>
    <div class="contentContainer">
      <div class="leftSideContent">
        <div class="darkContainer">
          <div class="imageContainer" ref="container" @click="pointSelect">
            <cptv-single-frame
              :recording="latestStatusRecording"
              v-if="latestStatusRecording"
              :width="cptvFrameWidth"
              :height="cptvFrameHeight"
              ref="singleFrameCanvas"
              @loaded="(el) => (singleFrame = el)"
            />
            <canvas
              :style="{
                width: '480px',
                height: '360px',
              }"
              @click="generateMask"
              ref="canvas"
            ></canvas>
          </div>
        </div>
        <div class="regionMaskSwitch">
          <div class="form-check form-switch">
            <label class="form-check-label" for="flexSwitchCheckChecked"
              >Region Mask</label
            >
            <input
              class="form-check-input"
              type="checkbox"
              role="switch"
              id="flexSwitchCheckChecked"
              @click="toggleMaskEnabled"
              checked
            />
          </div>
        </div>
      </div>
      <div class="rightSideContent">
        <div class="existingRegions">
          <h6 class="existingRegionsHeading">Existing regions</h6>
          <div class="existingRegionsContent">
            <div class="noExistingRegionsLabel" v-if="!areExistingRegions">
              <p>No existing regions</p>
            </div>
            <div class="regionsListContainer">
              <div v-for="(item, index) in regionsArray" :key="index" class="regionContent">
                <p class="regionLabel">Region {{ index + 1 }}</p>
                <b-button
                  class="deleteButton"
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
            class="selectAreaButton"
            :variant="selectingArea ? 'success' : 'primary'"
            @click="toggleAreaSelect"
          >
            {{ selectingArea ? "Save Regions" : "Edit Regions" }}</b-button
          >
        </div>
        <div v-if="selectingArea" class="regionCreationToolsContainer">
          <h6 class="regionCreationToolsHeading">Region Creation Tools</h6>
          <b-button
            v-if="selectingArea && !creatingRegion"
            class="createRegionButton"
            variant="danger"
            @click="toggleCreatingRegion"
          >
            Create Region
          </b-button>
          <b-button
            v-if="selectingArea && creatingRegion"
            :disabled="isFirstPoint"
            class="removePointButton"
            variant="danger"
            @click="removePoint"
          >
            Undo Point
          </b-button>
          <b-button
            v-if="selectingArea && creatingRegion"
            :disabled="!enableAddRegionsButton"
            class="addRegionButton"
            variant="success"
            @click="addRegionSelection"
          >
            Add Region
          </b-button>
          <b-button
            v-if="selectingArea && creatingRegion"
            class="cancelNewRegionButton"
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
  .contentContainer {
    justify-content: center;
    display: grid;
  }
  .rightSideContent {
    position: relative;
    border-radius: 0.6em;;
  }

  p {
    font-size: 0.9em;
  }

  .darkContainer {
    background-color: rgba(58, 58, 58);
    padding: 0.6em;
    border-radius: 0.4em;
  }

  .existingRegions {
    display: grid;
    position: relative;
    background-color: rgba(58, 58, 58);
    padding: 0.8em;
    padding-bottom: 0;
    border-radius: 0.4em;
    color: white;
    margin-bottom: 0.5em;
  }

  .regionCreationToolsContainer {
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
  .contentContainer {
    display: flex;
    justify-content: center;
  }

  h5 {
    font-size: 1.1em;
  }
  p {
    font-size: 0.9em;
  }

  .rightSideContent {
    padding-left: 0.5em;
    padding-bottom: 0.4em;
    position: relative;
    border-radius: 0.4em;
  }

  .darkContainer {
    background-color: rgba(58, 58, 58);
    padding: 0.6em;
    border-radius: 0.4em;
  }

  .existingRegions {
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

  .regionCreationToolsContainer {
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
  .contentContainer {
    display: flex;
    justify-content: center;
  }

  .rightSideContent {
    position: relative;
    border-radius: 0.4em;
    /* background-color: green; */
    padding-left: 0.6em;
  }

  .darkContainer {
    background-color: rgba(58, 58, 58);
    padding: 0.7em;
    border-radius: 0.4em;
  }

  .existingRegions {
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

  .regionCreationToolsContainer {
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

.removePointButton,
.addRegionButton,
.createRegionButton {
  margin-bottom: 0.6em;
}

.selectAreaButton, .cancelNewRegionButton{
  display: block;
  margin: 0 auto; /* Center horizontally */
  margin-bottom: 0.6em;
  text-align: center; /* Center text content */

}

.imageContainer {
  position: relative;
}

.leftSideContent {
  position: relative;
  border-radius: 1em;
}
.noExistingRegionsLabel {
  margin: 0.2em;
  transform: translateY(20%);
  text-align: center;
}
.regionContent {
  background-color: rgb(222, 221, 221);
  display: flex;
  margin: 0.2em;
  border-radius: 0.3em;
}

.regionLabel {
  position: relative;
  transform: translateY(30%);
  text-align: center;
  flex: 10;
}

.deleteButton {
  flex: 1;
}

.selectAreaButton {
  width: 8em;
}

canvas {
  position: absolute;
  top: 0;
  left: 0;
}

.existingRegionsContent {
  background-color: white;
  color: black;
  border-radius: 0.3em;
  margin-bottom: 0.6em;
}

.regionCreationToolsHeading,
.existingRegionsHeading {
  margin-bottom: 0.6em;
}

.regionMaskSwitch {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 10px;
}

.existingRegionContainer {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}

.areaOfInterestHeading {
  padding-bottom: 0.6em;
}
</style>
