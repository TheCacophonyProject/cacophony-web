<script lang="ts" setup>
import { computed, inject, onMounted, ref, watch } from "vue";
import type { Ref } from "vue";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
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
import type { LoadedResource } from "@apiClient/types";
import type { ApiTrackResponse } from "@typedefs/api/track";
import { DateTime } from "luxon";
import { ClientApi } from "@/api";
import { DeviceType } from "@typedefs/api/consts.ts";
import SectionCard from "@/components/SectionCard.vue";
import CardTable from "@/components/CardTable.vue";
import {
  BAlert,
  BFormGroup,
  BFormInput,
  BFormSelect,
  BSpinner,
} from "bootstrap-vue-next";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";

const devices = inject(selectedProjectDevices) as Ref<
  ApiDeviceResponse[] | null
>;
const project = inject(currentSelectedProject) as Ref<SelectedProject>;
const latestStatusRecording = inject("latestStatusRecording") as Ref<
  LoadedResource<ApiRecordingResponse>
>;
const route = useRoute();
const deviceId = computed<number>(
  () => Number(route.params.deviceId) as DeviceId,
);
const device = computed<ApiDeviceResponse | null>(() => {
  return (
    (devices.value &&
      devices.value.find(
        (device: ApiDeviceResponse) => device.id === deviceId.value,
      )) ||
    null
  );
});

// TODO: Flow analysis would also be cool, showing the predominant motion vectors through the scene.
const animalsAndBirds = ({ path }: { path: string }) => {
  return path && (path.startsWith("all.mammal") || path.startsWith("all.bird"));
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
  },
);
const locationStartTime = ref<Date | null>(null);
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
    // How long has the device been in its current location?  That's the timespan we care about by default.
    const locationHistory = await ClientApi.Devices.getLocationHistory(
      deviceId.value,
    );
    if (locationHistory && locationHistory.length) {
      locationStartTime.value = new Date(locationHistory[0].fromDateTime);
      trackTags.value =
        await ClientApi.Devices.getUniqueTrackTagsForDeviceInProject(
          deviceId.value,
          locationStartTime.value,
        );
    }
  }
});

const getTracksForTag = async (tag: string | null) => {
  if (device.value && tag && locationStartTime.value) {
    computingHeatmap.value = true;
    // Maybe restrict to one month ago max?
    tracksForSelectedTag.value =
      await ClientApi.Devices.getTracksWithTagForDeviceInProject(
        deviceId.value,
        tag,
        locationStartTime.value,
      );
    const tracksHeatmapData = await (new Promise((resolve) => {
      if (tracksForSelectedTag.value) {
        const worker = new Worker(
          new URL("../components/Heatmap.worker.ts", import.meta.url),
          {
            type: "module",
          },
        );
        let inited = false;
        worker.onmessage = (message) => {
          if (!inited) {
            inited = true;
            const tracks = JSON.parse(
              JSON.stringify(tracksForSelectedTag.value),
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

watch(selectedTag, (newTag) => {
  const _ = getTracksForTag(newTag);
});
const helpInfo = ref<boolean>(true);
</script>
<template>
  <div class="row mb-4 pb-2 pb-sm-0 mb-sm-4 mb-lg-5 mt-3">
    <div class="col-lg-3">
      <h3 class="section-card-heading">Thermal camera insights</h3>
      <div class="text-secondary pb-1">
        <p>
          Use this tool to select from species seen during this period and
          visualise where in the scene this species moves. The insights can be
          used to inform decisions about where to position traps.
        </p>
        <p>
          Insights works best when the device has been in the same place for a
          while. The data may be invalid if the camera viewpoint has shifted
          (e.g. rotated in a tree trunk) but the gps location has not been
          updated.
        </p>
      </div>
    </div>
    <div class="col-lg-9">
      <section-card>
        <template #header-title> Insights </template>

        <div class="row">
          <div
            class="col order-2 order-md-1 col-12 col-md-8 position-relative text-white"
          >
            <cptv-single-frame
              :recording="latestStatusRecording"
              :overlay="overlayData"
              :overlay-opacity="overlayOpacity"
              palette="Greyscale"
              class="cptv-player"
            />
            <b-spinner v-if="computingHeatmap" class="loading-heatmap" />
          </div>
          <div class="col order-1 order-md-2 col-12 col-md-4">
            <b-form-group label="Species" label-for="species" class="mb-3">
              <b-form-select
                :options="trackTagOptions"
                v-model="selectedTag"
                id="species"
              />
            </b-form-group>

            <b-form-group
              label="Heatmap opacity"
              label-for="opacity"
              class="mb-3"
            >
              <b-form-input
                :disabled="!selectedTag"
                id="opacity"
                type="range"
                min="0"
                max="1"
                step="0.01"
                v-model="overlayOpacity"
              />
            </b-form-group>

            <b-alert
              v-if="locationStartTime"
              :model-value="true"
              variant="light"
              :no-animation="true"
              class="mb-3"
            >
              <div class="d-flex">
                <material-symbol name="info" class="me-2" size="1.25rem" />
                <span
                  >This camera has been at its current location for
                  <strong
                    >{{
                      DateTime.fromJSDate(locationStartTime as Date)
                        .toRelative()!
                        .replace(" ago", "")
                    }}.</strong
                  >
                </span>
              </div>
            </b-alert>
            <p v-else><b-spinner small /></p>
          </div>
        </div>
      </section-card>
    </div>
  </div>
</template>

<style scoped lang="less">
.loading-heatmap {
  position: absolute;
  left: calc(50% - 10px);
  top: calc(50% - 10px);
}
.cptv-player {
  width: 100%;
  min-width: auto;
  aspect-ratio: auto 4/3;
}
</style>
