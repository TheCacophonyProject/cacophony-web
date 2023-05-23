<template>
  <div
    class="
      single-frame-cptv-container
      d-flex
      align-items-center
      justify-content-center
    "
    :style="{ width: `${width}px`, height: `${height}px` }"
  >
    <canvas
      ref="canvas"
      width="160"
      height="120"
      class="single-frame-cptv"
      :class="{ loaded: !loading }"
    ></canvas>
    <b-spinner v-if="loading" />
  </div>
</template>

<script lang="ts" setup>
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import { computed, inject, onMounted, ref, watch } from "vue";
import type { Ref } from "vue";
import { CptvDecoder } from "@/components/cptv-player/cptv-decoder/decoder";
import type { LoggedInUserAuth } from "@models/LoggedInUser";
import { currentUserCreds } from "@models/provides";
import {
  renderFrameIntoFrameBuffer,
  ColourMaps,
} from "@/components/cptv-player/cptv-decoder/frameRenderUtils";

const creds = inject(currentUserCreds) as Ref<LoggedInUserAuth | null>;
const defaultPalette = computed(
  () =>
    ColourMaps.find(([name, val]) => name === palette) as [string, Uint32Array]
);
const defaultOverlayPalette = ColourMaps.find(
  ([name, val]) => name === "Default"
) as [string, Uint32Array];
const canvas = ref<HTMLCanvasElement>();
const {
  recording,
  width = 320,
  height = 240,
  overlay,
  overlayOpacity = "1.0",
  palette = "Viridis",
} = defineProps<{
  recording: ApiRecordingResponse | null;
  width?: number | string;
  height?: number | string;
  overlay?: Uint8ClampedArray;
  overlayOpacity?: string;
  palette?: string;
}>();

const emit = defineEmits<{ (e: "loaded", payload: HTMLCanvasElement): void }>();

const frameData = ref<ImageData>();
const loading = ref<boolean>(false);

// TODO: Could 'provide' the frame at a higher level component to avoid all child components having to reload it.
const loadRecording = async () => {
  if (creds.value && recording) {
    loading.value = true;
    const cptvDecoder = new CptvDecoder();
    const result = await cptvDecoder.initWithRecordingIdAndKnownSize(
      recording.id,
      0,
      creds.value.apiToken
    );
    if (result === true) {
      let frame = await cptvDecoder.getNextFrame();
      if (frame?.meta.isBackgroundFrame) {
        frame = await cptvDecoder.getNextFrame();
      }
      if (frame) {
        let max = Number.MIN_SAFE_INTEGER;
        let min = Number.MAX_SAFE_INTEGER;
        for (const px of frame.data) {
          max = Math.max(px, max);
          min = Math.min(px, min);
        }
        const buffer = new Uint8ClampedArray(160 * 120 * 4);
        renderFrameIntoFrameBuffer(
          buffer,
          frame.data,
          defaultPalette.value[1],
          min,
          max
        );
        const imageData = new ImageData(buffer, 160, 120);
        frameData.value = imageData;
        renderFrame();
      }
    }
    await cptvDecoder.close();
    loading.value = false;
  }
};

onMounted(async () => {
  await loadRecording();
  if (canvas.value) {
    emit("loaded", canvas.value);
  }
});

watch(() => recording, loadRecording);

const renderFrame = () => {
  if (frameData.value) {
    const ctx = canvas.value?.getContext("2d");
    if (ctx) {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.putImageData(frameData.value, 0, 0);
      if (overlay) {
        const buffer = new Uint8ClampedArray(160 * 120 * 4);
        const source = overlay;
        const imageData = new ImageData(160, 120);
        const frameBufferView = new Uint32Array(imageData.data.buffer);
        for (let i = 0; i < frameBufferView.length; i++) {
          frameBufferView[i] = defaultOverlayPalette[1][source[i]];
        }

        //renderFrameIntoFrameBuffer(buffer, overlay.data, viridis[1], 0, 255);

        const tmp = document.createElement("canvas");
        tmp.width = 160;
        tmp.height = 120;
        const tmpCtx = tmp.getContext("2d");
        if (tmpCtx) {
          tmpCtx.putImageData(imageData, 0, 0);
        }
        ctx.globalCompositeOperation = "lighten";
        ctx.globalAlpha = parseFloat(overlayOpacity);
        ctx.drawImage(tmp, 0, 0);
      }
    }
  }
};

watch(
  () => overlay,
  (overlayData) => {
    renderFrame();
  }
);

watch(
  () => overlayOpacity,
  (overlayData) => {
    renderFrame();
  }
);
</script>

<style scoped lang="less">
.single-frame-cptv-container {
  position: relative;
  background: #4c4c4c;
  color: white;
  border-radius: 3px;
  overflow: hidden;
}
.single-frame-cptv {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity 0.3s;
  &.loaded {
    opacity: 1;
  }
}
</style>
