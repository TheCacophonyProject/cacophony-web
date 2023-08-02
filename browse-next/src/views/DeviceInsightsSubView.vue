<script lang="ts" setup>
import { computed, inject, onMounted, ref, watch } from "vue";
import type { Ref } from "vue";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import {
  getLatestStatusRecordingForDevice,
  getLocationHistory,
  getTracksWithTagForDeviceInProject,
  getUniqueTrackTagsForDeviceInProject,
} from "@api/Device";
import { projectDevicesLoaded } from "@models/LoggedInUser";
import type { SelectedProject } from "@models/LoggedInUser";
import { useRoute } from "vue-router";
import type { DeviceId } from "@typedefs/api/common";
import type { ApiDeviceResponse } from "@typedefs/api/device";
import {
  currentSelectedProject,
  selectedProjectDevices,
} from "@models/provides";
import CptvSingleFrame from "@/components/CptvSingleFrame.vue";
import type { LoadedResource } from "@api/types";
import type { ApiTrackResponse } from "@typedefs/api/track";
import { DateTime } from "luxon";

const devices = inject(selectedProjectDevices) as Ref<
  ApiDeviceResponse[] | null
>;
const project = inject(currentSelectedProject) as Ref<SelectedProject>;
const latestStatusRecording = ref<ApiRecordingResponse | null>(null);
const route = useRoute();
const deviceId = computed<number>(
  () => Number(route.params.deviceId) as DeviceId
);
const device = computed<ApiDeviceResponse | null>(() => {
  return (
    (devices.value &&
      devices.value.find(
        (device: ApiDeviceResponse) => device.id === deviceId.value
      )) ||
    null
  );
});

// TODO: Flow analysis would also be cool, showing the predominant motion vectors through the scene.

const animalsAndBirds = ({ path }: { path: string }) => {
  return path.startsWith("all.mammal") || path.startsWith("all.bird");
};

const selectedTag = ref<string | null>(null);
const trackTags =
  ref<LoadedResource<{ path: string; what: string; count: number }[]>>(null);
const trackTagOptions = computed<{ value: string | null; text: string }[]>(
  () => {
    if (trackTags.value) {
      // NOTE: We require at least 5 tracks for a tag before analysis is possible,
      //  otherwise it's too hard to establish a trend.
      const tagOptions = trackTags.value
        .filter(animalsAndBirds)
        .filter(({ count }) => count > 5)
        .map(({ what, count }) => ({
          value: what,
          text: `${
            what.charAt(0).toUpperCase() + what.slice(1)
          } (${count} tracks)`,
        }));
      return [
        { value: null, text: "Select a species", disabled: true },
        ...tagOptions,
      ];
    }
    return [{ value: null, text: "Loading...", disabled: true }];
  }
);
const locationStartTime = ref<Date>(new Date());
const tracksForSelectedTag = ref<LoadedResource<ApiTrackResponse[]>>(null);

const trackHeatmap = ref<Uint32Array>(new Uint32Array());

const computingHeatmap = ref<boolean>(false);
const overlayData = ref<Uint8ClampedArray>();
const overlayOpacity = ref<string>("1.0");

watch(trackHeatmap, (next: Uint32Array) => {
  const computedHeatmap = next;
  const max = Math.max(...computedHeatmap);
  const scale = max / 255;
  const data = new Uint8ClampedArray(160 * 120);
  for (let i = 0; i < data.length; i++) {
    data[i] = (computedHeatmap[i] / scale) | 0;
  }
  overlayData.value = data;
});

onMounted(async () => {
  if (!devices.value) {
    await projectDevicesLoaded();
  }
  if (device.value) {
    if (device.value.type === "thermal") {
      const latestStatus = await getLatestStatusRecordingForDevice(
        device.value.id,
        device.value.groupId
      );
      if (latestStatus) {
        latestStatusRecording.value = latestStatus;
      }
    }
    // How long has the device been in its current location?  That's the timespan we care about by default.
    const locationHistory = await getLocationHistory(deviceId.value);
    if (locationHistory && locationHistory.length) {
      locationStartTime.value = new Date(locationHistory[0].fromDateTime);
      trackTags.value = await getUniqueTrackTagsForDeviceInProject(
        deviceId.value,
        locationStartTime.value
      );
    }
  }
});

const getTracksForTag = async (tag: string) => {
  if (device.value) {
    computingHeatmap.value = true;
    // Maybe restrict to one month ago max?
    tracksForSelectedTag.value = await getTracksWithTagForDeviceInProject(
      deviceId.value,
      tag,
      locationStartTime.value
    );
    const tracksHeatmapData = await (new Promise((resolve) => {
      if (tracksForSelectedTag.value) {
        const worker = new Worker(
          new URL("../components/Heatmap.worker.ts", import.meta.url),
          {
            type: "module",
          }
        );
        let inited = false;
        worker.onmessage = (message) => {
          if (!inited) {
            inited = true;
            const tracks = JSON.parse(
              JSON.stringify(tracksForSelectedTag.value)
            );
            worker.postMessage({ tracks });
          } else {
            resolve(message.data);
          }
        };
      }
    }) as Promise<Uint32Array>);
    trackHeatmap.value = tracksHeatmapData;
    computingHeatmap.value = false;
  }
};
</script>
<template>
  <div class="d-flex justify-content-center flex-column align-items-center p-3">
    <div>
      <p>
        This camera has been at its current location for
        {{
          DateTime.fromJSDate(locationStartTime)
            .toRelative()
            .replace(" ago", "")
        }}.
      </p>
      <ol>
        <li>Select from species seen during this period.</li>
        <li>Visualise the where in the scene this species moves.</li>
        <li>
          Use this information to inform decisions about where to position
          traps.
        </li>
      </ol>
      <h6>Note:</h6>
      <ul>
        <li>
          This works best when the camera has been in the same place for a
          while.
        </li>
        <li>
          This data may be invalid if the camera viewpoint has shifted but the
          location has not been updated.
        </li>
      </ul>
    </div>
    <div class="position-relative text-white">
      <cptv-single-frame
        :recording="latestStatusRecording"
        :width="640"
        :height="480"
        :overlay="overlayData"
        :overlay-opacity="overlayOpacity"
        palette="Greyscale"
      />
      <b-spinner v-if="computingHeatmap" class="loading-heatmap" />
    </div>
    <div class="d-flex controls justify-content-between mt-3">
      <b-form-select
        :options="trackTagOptions"
        v-model="selectedTag"
        @change="getTracksForTag"
      />
      <div class="w-50 mx-3">
        <label for="opacity">Heatmap opacity</label>
        <b-form-input
          id="opacity"
          type="range"
          min="0"
          max="1"
          step="0.01"
          v-model="overlayOpacity"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.heatmap {
  position: absolute;
  top: 0;
  left: 0;
  width: 640px;
  height: 480px;
}
.loading-heatmap {
  position: absolute;
  left: calc(50% - 10px);
  top: calc(50% - 10px);
}
.controls {
  width: 640px;
}
</style>
