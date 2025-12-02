<template>
  <div
    class="single-frame-cptv-container d-flex align-items-center justify-content-center"
    :style="widthStyle"
  >
    <canvas
      ref="canvas"
      width="160"
      height="120"
      class="single-frame-cptv"
      :class="{ loaded: !loading, smoothed: smoothing }"
    ></canvas>
    <b-spinner v-if="loading" />
  </div>
</template>

<script lang="ts" setup>
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import { computed, onMounted, ref, watch } from "vue";
import { CptvDecoder } from "@/components/cptv-player/cptv-decoder/decoder";
import {
  ColourMaps,
  renderFrameIntoFrameBuffer,
} from "@/components/cptv-player/cptv-decoder/frameRenderUtils";
import { ClientApi } from "@/api";
import { DEFAULT_AUTH_ID, type LoadedResource } from "@apiClient/types.ts";

const defaultPalette = computed(
  () =>
    ColourMaps.find(([name, _val]) => name === props.palette) as [
      string,
      Uint32Array
    ],
);
const defaultOverlayPalette = ColourMaps.find(
  ([name, _val]) => name === "Default",
) as [string, Uint32Array];
const canvas = ref<HTMLCanvasElement>();
const props = withDefaults(
  defineProps<{
    recording: LoadedResource<ApiRecordingResponse>;
    overlay?: Uint8ClampedArray;
    width?: string | number;
    apronPixels?: number;
    overlayOpacity?: string;
    palette?: string;
    smoothing?: boolean;
  }>(),
  {
    recording: null,
    overlayOpacity: "1.0",
    palette: "Viridis",
    width: "",
    apronPixels: 0,
    smoothing: true,
  },
);

const widthStyle = computed<string>(() => {
  if (props.width) {
    if (typeof props.width === "string" && props.width.endsWith("%")) {
      return `width: ${props.width}`;
    } else {
      return `width: ${props.width}px;min-width: unset;`;
    }
  }
  return "";
});

const emit = defineEmits<{ (e: "loaded", payload: HTMLCanvasElement): void }>();

const frameData = ref<ImageData>();
const loading = ref<boolean>(false);

// TODO: Could 'provide' the frame at a higher level component to avoid all child components having to reload it.
const loadRecording = async () => {
  if (props.recording) {
    loading.value = true;
    const token = await ClientApi.getCredentials(DEFAULT_AUTH_ID);
    if (!token) {
      loading.value = false;
      return;
    }
    const cptvDecoder = new CptvDecoder();
    const result = await cptvDecoder.initWithRecordingIdAndKnownSize(
      props.recording.id,
      0,
      token,
    );
    if (result === true) {
      let gotGoodFrame = false;
      let frame;

      while (!gotGoodFrame) {
        frame = await cptvDecoder.getNextFrame();
        if (frame?.isBackgroundFrame) {
          continue;
        }
        if (frame) {
          let max = Number.MIN_SAFE_INTEGER;
          let min = Number.MAX_SAFE_INTEGER;
          for (const px of frame.imageData) {
            max = Math.max(px, max);
            min = Math.min(px, min);
          }
          if (max - min > 0) {
            gotGoodFrame = true;
          }
          const buffer = new Uint8ClampedArray(160 * 120 * 4);
          renderFrameIntoFrameBuffer(
            buffer,
            frame.imageData,
            defaultPalette.value[1],
            min,
            max,
          );
          frameData.value = new ImageData(buffer, 160, 120);
          renderFrame();
        } else {
          break;
        }
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

watch(() => props.recording, loadRecording);

const renderFrame = () => {
  if (frameData.value) {
    const ctx = canvas.value?.getContext("2d");
    if (ctx) {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      if (props.apronPixels) {
        createImageBitmap(frameData.value).then((image) => {
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(
            image,
            props.apronPixels,
            props.apronPixels,
            160 - props.apronPixels * 2,
            120 - props.apronPixels * 2,
          );
        });
      } else {
        ctx.putImageData(frameData.value, 0, 0);
      }
      if (props.overlay) {
        const source = props.overlay;
        const imageData = new ImageData(160, 120);
        const frameBufferView = new Uint32Array(imageData.data.buffer);
        for (let i = 0; i < frameBufferView.length; i++) {
          frameBufferView[i] = defaultOverlayPalette[1][source[i]];
        }
        const tmp = document.createElement("canvas");
        tmp.width = 160;
        tmp.height = 120;
        const tmpCtx = tmp.getContext("2d");
        if (tmpCtx) {
          tmpCtx.putImageData(imageData, 0, 0);
        }
        ctx.globalCompositeOperation = "lighten";
        ctx.globalAlpha = parseFloat(props.overlayOpacity);
        ctx.drawImage(tmp, 0, 0);
      }
    }
  }
};

watch(
  () => props.overlay,
  (_overlayData) => {
    renderFrame();
  },
);

watch(
  () => props.overlayOpacity,
  (_overlayData) => {
    renderFrame();
  },
);
</script>

<style scoped lang="less">
@media screen and (min-width: 640px) {
  .single-frame-cptv-container {
    width: 100%;
    height: auto;
    min-width: 640px;
    aspect-ratio: auto 4/3;
  }
}

@media screen and (max-width: 639px) {
  .single-frame-cptv-container {
    width: 100svw;
    height: auto;
    aspect-ratio: auto 4/3;
  }
}

.single-frame-cptv-container {
  position: relative;
  background: #4c4c4c;
  color: white;
  border-radius: 3px;
  overflow: hidden;
}
.single-frame-cptv {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  &.smoothed {
    image-rendering: auto;
  }
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
.smoothed {
}
</style>
