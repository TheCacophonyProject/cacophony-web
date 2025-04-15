<script setup lang="ts">
import { reactive, type Ref } from "vue";
import { ref, onMounted, computed, inject, watch } from "vue";
import { useDevicePixelRatio, useElementSize } from "@vueuse/core";
import { updateMaskRegionsForDevice } from "@api/Device";
import { useRoute } from "vue-router";
import type {
  ApiDeviceResponse,
  ApiMaskRegionsData,
  MaskRegion,
} from "@typedefs/api/device";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import type { DeviceId } from "@typedefs/api/common";
import { selectedProjectDevices } from "@models/provides";
import CptvSingleFrame from "@/components/CptvSingleFrame.vue";
import { formFieldInputText, type FormInputValidationState } from "@/utils.ts";
import TwoStepActionButton from "@/components/TwoStepActionButton.vue";
import CardTable from "@/components/CardTable.vue";
import type { LoadedResource } from "@api/types.ts";
interface Point {
  x: number;
  y: number;
  temp?: boolean;
  invalid?: boolean;
}

type Region = Point[];
const canvasContainer = ref<HTMLDivElement>();
const editMode = ref(false);
const helpInfo = ref(true);
const canvas = ref<HTMLCanvasElement>();
const singleFrameCanvas = ref<HTMLCanvasElement | null>(null);
const regionsProvided = inject(
  "latestMaskRegions",
  ref<ApiMaskRegionsData | (() => ApiMaskRegionsData)>(
    () => ({} as unknown as ApiMaskRegionsData),
  ),
  true,
);

const regions = ref<
  Record<string, { regionData: Region; alertOnEnter?: boolean }>
>({});
const points = reactive<Point[]>([]);
const { pixelRatio: devicePixelRatio } = useDevicePixelRatio();
const latestStatusRecording = inject("latestStatusRecording") as Ref<
  LoadedResource<ApiRecordingResponse>
>;
const route = useRoute();
const deviceId = Number(route.params.deviceId) as DeviceId;
const submittingNewRegionRequest = ref<boolean>(false);
const newRegionName = formFieldInputText();
const newRegionHasAlerts = ref<boolean>(false);
const selfIntersectingError = ref<boolean>(false);
const device = computed<ApiDeviceResponse | null>(() => {
  return (
    (devices.value &&
      devices.value.find(
        (device: ApiDeviceResponse) => device.id === deviceId,
      )) ||
    null
  );
});
const emit = defineEmits<{
  (e: "updated-regions", payload: ApiMaskRegionsData): void;
}>();

const regionsTable = computed(() => {
  return Object.entries(regions.value).map(([name, { alertOnEnter }]) => ({
    maskRegion: name,
    alertOnEnter,
    _deleteAction: { value: name },
  }));
});

const { width: canvasWidth, height: canvasHeight } =
  useElementSize(canvasContainer);
const updateExistingMaskRegions = async () => {
  if (device.value) {
    const maskRegions: Record<string, MaskRegion> = {};
    for (const [region, data] of Object.entries(regions.value)) {
      maskRegions[region] = {
        regionData: data.regionData.map(({ x, y }) => ({ x, y })),
      };
      if (data.hasOwnProperty("alertOnEnter")) {
        maskRegions[region].alertOnEnter = data.alertOnEnter;
      }
    }
    const regionsPayload: ApiMaskRegionsData = { maskRegions };
    emit("updated-regions", regionsPayload);
    await updateMaskRegionsForDevice(device.value.id, regionsPayload);
  }
};

const devices = inject(selectedProjectDevices) as Ref<
  ApiDeviceResponse[] | null
>;

const copyRegionsFromProvider = () => {
  if ((regionsProvided.value as ApiMaskRegionsData).maskRegions) {
    regions.value = JSON.parse(
      JSON.stringify((regionsProvided.value as ApiMaskRegionsData).maskRegions),
    );
  }
};

watch(regionsProvided, copyRegionsFromProvider);

onMounted(async () => {
  copyRegionsFromProvider();
});
type GenericArray<T> = T[];
const last = (arr: GenericArray<Point>) => {
  return arr[arr.length - 1];
};
const distance = (
  a: Point,
  b: Point,
  width: number,
  height: number,
): number => {
  const x = a.x * width - b.x * width;
  const y = a.y * height - b.y * height;
  return Math.sqrt(x * x + y * y);
};

const POLYGON_CLOSE_TOLERANCE = 20;
const addPoint = (event: MouseEvent) => {
  if (editMode.value) {
    const { left, top, width, height } = (
      canvas.value as HTMLCanvasElement
    ).getBoundingClientRect();
    const point = mapPoint(
      event.clientX,
      event.clientY,
      left,
      top,
      width,
      height,
    );

    // If point is within tolerance, snap point to start and close polygon
    if (
      points.length >= 2 &&
      distance(point, points[0], width, height) < POLYGON_CLOSE_TOLERANCE
    ) {
      point.x = points[0].x;
      point.y = points[0].y;
    }

    if (points.length && last(points).temp) {
      points[points.length - 1] = point;
    } else {
      points.push(point);
    }

    if (points.length > 3) {
      // Check for self-intersections.
      let selfIntersects = false;
      const newLine: [Point, Point] = [last(points), points[points.length - 2]];
      for (let i = 0; i < points.length - 3; i++) {
        const line: [Point, Point] = [points[i], points[i + 1]];
        if (lineSegmentsIntersect(newLine, line)) {
          selfIntersects = true;
          break;
        }
      }
      last(points).invalid = selfIntersects;
      if (selfIntersects) {
        selfIntersectingError.value = true;
      }
    }
  }
};

const mapRange = (
  x: number,
  sMin: number,
  sMax: number,
  tMin: number,
  tMax: number,
): number => {
  return ((x - sMin) / (sMax - sMin)) * (tMax - tMin) + tMin;
};
const mapPoint = (
  cX: number,
  cY: number,
  left: number,
  top: number,
  width: number,
  height: number,
): Point => {
  // We have a 5% apron to allow us to define points outside the frame.
  const x = Math.max(
    -0.05,
    Math.min(1.05, mapRange(cX - left, 0, width, -0.05, 1.05)),
  );
  const y = Math.max(
    -0.05,
    Math.min(1.05, mapRange(cY - top, 0, height, -0.05, 1.05)),
  );
  return {
    x,
    y,
  };
};
const speculativePoint = (event: PointerEvent) => {
  if (editMode.value) {
    const { left, top, width, height } = (
      canvas.value as HTMLCanvasElement
    ).getBoundingClientRect();
    const point = mapPoint(
      event.clientX,
      event.clientY,
      left,
      top,
      width,
      height,
    );
    point.temp = true;
    if (points.length > 0) {
      // If point is within tolerance, snap point to start and close polygon
      if (
        points.length >= 2 &&
        distance(point, points[0], width, height) < POLYGON_CLOSE_TOLERANCE
      ) {
        point.x = points[0].x;
        point.y = points[0].y;
      }
      if (last(points).temp) {
        points[points.length - 1] = point;
      } else {
        points.push(point);
      }
    }

    if (points.length > 3) {
      // Check for self-intersections.
      let selfIntersects = false;
      const newLine: [Point, Point] = [last(points), points[points.length - 2]];
      for (let i = 0; i < points.length - 3; i++) {
        const line: [Point, Point] = [points[i], points[i + 1]];
        if (lineSegmentsIntersect(newLine, line)) {
          selfIntersects = true;
          break;
        }
      }
      last(points).invalid = selfIntersects;
    }
  }
};

const drawPolygon = () => {
  const ctx = (canvas.value as HTMLCanvasElement).getContext("2d");
  if (ctx) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    drawRegions();
    ctx.restore();
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    if (points.length) {
      ctx.save();
      ctx.lineWidth = 4 * devicePixelRatio.value;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(13, 110, 253, 1)";
      ctx.beginPath();
      const pts = points.map((p) => ({
        ...p,
        x: mapRange(p.x, -0.05, 1.05, 0, width),
        y: mapRange(p.y, -0.05, 1.05, 0, height),
      }));
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 0; i < pts.length - 1; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      const lastPoint = last(pts);
      if (lastPoint.temp || lastPoint.invalid) {
        ctx.stroke();
        ctx.beginPath();
        const prevPoint = pts[pts.length - 2];
        ctx.moveTo(prevPoint.x, prevPoint.y);
        ctx.lineWidth = 3 * devicePixelRatio.value;
        ctx.setLineDash([5, 5]);
        if (lastPoint.invalid) {
          ctx.strokeStyle = "red";
        }
      }
      ctx.lineTo(lastPoint.x, lastPoint.y);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        ctx.beginPath();
        if (i == points.length - 1 && lastPoint.invalid) {
          ctx.fillStyle = "red";
        } else {
          ctx.fillStyle = "rgba(13, 110, 253, 1)";
        }
        ctx.arc(p.x, p.y, 4 * devicePixelRatio.value, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }
};

const pointsAreEqual = (a: Point, b: Point): boolean => {
  return a.x === b.x && a.y === b.y;
};
const polygonIsClosed = (points: Point[]): boolean => {
  const lastPoint = last(points);
  if (lastPoint.temp) {
    return false;
  }
  return points.length > 2 && pointsAreEqual(points[0], lastPoint);
};

const createShapeEnded = computed((): boolean => {
  if (points.length) {
    return polygonIsClosed(points);
  }
  return false;
});
const removePoint = () => {
  if (points.length > 0) {
    points.pop();
  }
};

const polygonCentroid = (pts: Point[]) => {
  const first = pts[0],
    last = pts[pts.length - 1];
  if (first.x != last.x || first.y != last.y) {
    pts.push(first);
  }
  let twiceArea = 0,
    x = 0,
    y = 0,
    p1,
    p2,
    f;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    p1 = pts[i];
    p2 = pts[j];
    f = p1.x * p2.y - p2.x * p1.y;
    twiceArea += f;
    x += (p1.x + p2.x) * f;
    y += (p1.y + p2.y) * f;
  }
  f = twiceArea * 3;
  return { x: x / f, y: y / f };
};

const drawRegions = () => {
  const ctx = (canvas.value as HTMLCanvasElement).getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    for (const region of Object.values(regions.value)) {
      const pts = region.regionData.map((p) => ({
        ...p,
        x: mapRange(p.x, -0.05, 1.05, 0, ctx.canvas.width),
        y: mapRange(p.y, -0.05, 1.05, 0, ctx.canvas.height),
      }));
      if (pts.length) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < region.regionData.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();

    // Draw labels
    const fontSize = 18 * devicePixelRatio.value;
    ctx.font = `bold ${fontSize}px Arial`;
    for (const [label, region] of Object.entries(regions.value)) {
      const centroid = polygonCentroid(region.regionData);
      const centerX = centroid.x * ctx.canvas.width;
      const centerY = centroid.y * ctx.canvas.height;
      const text = `${label}`;
      const textMetrics = ctx.measureText(text);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(
        text,
        centerX - textMetrics.width / 2,
        centerY + fontSize / 2,
      );
    }
  }
};
const deleteRegion = (regionLabel: string) => {
  delete regions.value[regionLabel];
  const _ = updateExistingMaskRegions();
};

const isValidRegionName = computed<boolean>(() => {
  const trimmedName = newRegionName.value.trim();
  return (
    trimmedName.length >= 3 && !Object.keys(regions.value).includes(trimmedName)
  );
});
const needsValidationAndIsValidRegionName = computed<FormInputValidationState>(
  () => {
    if (!newRegionName.touched) {
      if (isValidRegionName.value) {
        return true;
      } else {
        return undefined;
      }
    } else {
      return newRegionName.touched ? isValidRegionName.value : undefined;
    }
  },
);

const lineSegmentsIntersect = (
  a: [Point, Point],
  b: [Point, Point],
): boolean => {
  const dx0 = a[1].x - a[0].x;
  const dx1 = b[1].x - b[0].x;
  const dy0 = a[1].y - a[0].y;
  const dy1 = b[1].y - b[0].y;
  const p0 = dy1 * (b[1].x - a[0].x) - dx1 * (b[1].y - a[0].y);
  const p1 = dy1 * (b[1].x - a[1].x) - dx1 * (b[1].y - a[1].y);
  const p2 = dy0 * (a[1].x - b[0].x) - dx0 * (a[1].y - b[0].y);
  const p3 = dy0 * (a[1].x - b[1].x) - dx0 * (a[1].y - b[1].y);
  return p0 * p1 < 0 && p2 * p3 < 0;
};

const addCurrentRegion = () => {
  const label = newRegionName.value;
  editMode.value = false;
  regions.value[label] = { regionData: [...points] };
  if (newRegionHasAlerts.value) {
    regions.value[label].alertOnEnter = newRegionHasAlerts.value;
  }
  while (points.length) {
    points.pop();
  }
  const _ = updateExistingMaskRegions();
};
const resetModal = () => {
  newRegionName.value = "";
  newRegionName.touched = false;
  newRegionHasAlerts.value = false;
  removePoint();
};

// Watch data and do side effects for rendering
watch(points, () => drawPolygon());
watch(canvasWidth, () => {
  requestAnimationFrame(() => {
    if (editMode.value) {
      drawPolygon();
    } else {
      drawRegions();
    }
  });
});
watch(editMode, (next, _prev) => {
  if (!next) {
    requestAnimationFrame(drawRegions);
  }
});
watch(
  () => Object.values(regions.value).length,
  () => {
    if (!editMode.value) {
      requestAnimationFrame(drawRegions);
    }
  },
);
</script>
<template>
  <b-modal
    title="Self-intersecting shape"
    v-model="selfIntersectingError"
    @hidden="removePoint"
    ok-title="Remove last point"
    ok-variant="warning"
    ok-only
    centered
  >
    <p>Shapes are not allowed to intersect with themselves.</p>
  </b-modal>
  <b-modal
    v-model="createShapeEnded"
    title="Save mask region"
    centered
    @hidden="resetModal"
  >
    <b-form @submit.stop.prevent="addCurrentRegion">
      <b-form-input
        type="text"
        placeholder="Give the mask region a name"
        data-cy="new mask region name"
        v-model="newRegionName.value"
        @blur="newRegionName.touched = true"
        :state="needsValidationAndIsValidRegionName"
        :disabled="submittingNewRegionRequest"
      />
      <b-form-invalid-feedback :state="needsValidationAndIsValidRegionName">
        <span v-if="newRegionName.value.trim().length === 0">
          Region name cannot be blank
        </span>
        <span v-else-if="newRegionName.value.trim().length < 3">
          Region name must be at least 3 characters
        </span>
        <span
          v-else-if="Object.keys(regions).includes(newRegionName.value.trim())"
        >
          Region name must be unique
        </span>
      </b-form-invalid-feedback>
      <div class="mt-3">
        <b-form-checkbox v-model="newRegionHasAlerts">
          <span>Alert project members when an animal enters this region.</span>
        </b-form-checkbox>
      </div>
    </b-form>
    <template #footer>
      <button
        class="btn btn-primary"
        type="submit"
        data-cy="create device button"
        @click.stop.prevent="addCurrentRegion"
        :disabled="
          !needsValidationAndIsValidRegionName || submittingNewRegionRequest
        "
      >
        <span
          v-if="submittingNewRegionRequest"
          class="spinner-border spinner-border-sm"
        ></span>
        {{ submittingNewRegionRequest ? "Adding region" : "Add region" }}
      </button>
    </template>
  </b-modal>
  <div
    class="w-100 d-flex justify-content-center align-items-center justify-content-lg-start align-items-lg-start"
  >
    <div class="d-flex flex-column justify-content-center region-creator">
      <b-alert dismissible v-model="helpInfo"
        ><p>
          <strong
            >Select multiple points on the image to form a closed shape.</strong
          >
        </p>
        <p>
          The defined <strong>&ldquo;mask region&rdquo;</strong> will be ignored
          for motion-detection purposes while this device is recording.<br />This
          can be useful to help reduce false-positive recordings if you have
          (for example) moving warmer tree branches over a cold background such
          as the night sky.
        </p>
        <p class="mb-0">
          Optionally, you can receive an alert notification when an animal is
          detected <strong><em>entering</em></strong> a masked off region.<br />This
          is useful if you'd like to know when an animal enters a trap, but you
          don't want subsequent recordings to be made while the animal is
          caught.
        </p></b-alert
      >
      <div class="d-flex justify-content-between flex-column flex-md-row">
        <div
          class="position-relative canvas-container bg-dark rounded-2 d-flex justify-content-center align-items-center"
          ref="canvasContainer"
          @pointerup="addPoint"
          @pointermove="speculativePoint"
          @touchstart="(e) => e.preventDefault()"
        >
          <cptv-single-frame
            :width="'100%'"
            :recording="latestStatusRecording"
            :apron-pixels="8"
            ref="singleFrameCanvas"
            :smoothing="false"
          />
          <canvas
            ref="canvas"
            class="overlay-canvas position-absolute"
            :width="canvasWidth * devicePixelRatio"
            :height="canvasHeight * devicePixelRatio"
          />
          <div
            v-if="editMode && points.length === 0"
            class="click-prompt position-absolute bg-light p-1 rounded-1 opacity-75"
          >
            Click to begin adding points
          </div>
        </div>
      </div>

      <card-table :items="regionsTable" compact :break-point="0">
        <template #alertOnEnter="{ cell }">
          <font-awesome-icon v-if="cell" icon="check-circle" />
          <span v-else>-</span>
        </template>
        <template #_deleteAction="{ cell }">
          <div class="d-flex align-items-center justify-content-end">
            <two-step-action-button
              :action="() => deleteRegion(cell.value)"
              :classes="['btn-hi', 'btn', 'btn-square', 'p-0']"
              :confirmation-label="`Delete region '${cell.value}'`"
              color="#666"
              alignment="right"
            >
              <template #button-content>
                <font-awesome-icon icon="trash-can" color="#666" />
              </template>
            </two-step-action-button>
          </div>
        </template>
        <template #card="{ card: { maskRegion } }">
          <div class="d-flex justify-content-between align-items-center">
            <span class="h6 m-0">{{ maskRegion }}</span>
            <two-step-action-button
              :action="() => deleteRegion(maskRegion)"
              :classes="['btn-hi', 'btn', 'btn-square', 'p-0']"
              :confirmation-label="`Delete region '${maskRegion}'`"
              color="#666"
              alignment="right"
            >
              <template #button-content>
                <font-awesome-icon icon="trash-can" color="#666" />
              </template>
            </two-step-action-button>
          </div>
        </template>
      </card-table>
      <div class="d-flex flex-column flex-md-row my-2 justify-content-between">
        <b-button
          v-if="!editMode"
          variant="primary"
          @click="editMode = true"
          class="mb-2 mb-md-0"
        >
          <font-awesome-icon icon="plus" class="me-2" />
          <span>Add a new mask region</span>
        </b-button>
        <b-button
          v-if="editMode"
          :disabled="points.length === 0"
          variant="danger"
          @click="removePoint"
        >
          Undo last point
        </b-button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.overlay-canvas {
  width: 100%;
  aspect-ratio: auto 4/3;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
}
.region-creator {
  max-width: 640px;
}
</style>
