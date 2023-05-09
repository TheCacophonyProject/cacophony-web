<script setup lang="ts">
import { computed, inject, onBeforeMount, onMounted, ref, watch } from "vue";
import type { ComputedRef } from "vue";
import { convertLatLngToNZTM, convertNZTMToLatLng } from "@/utils.ts";
import MapWithPoints from "@/components/MapWithPoints.vue";
import type { NamedPoint } from "@models/mapUtils.ts";
import { currentSelectedProject } from "@models/provides.ts";
import type { SelectedProject } from "@models/LoggedInUser.ts";
import { latLng, LatLngBounds, latLngBounds } from "leaflet";
import type { LatLng } from "@typedefs/api/common";
const format = ref<"latlng" | "nztm">("latlng");

const emit = defineEmits<{
  (e: "update:modelValue", value: { name: string; location: LatLng }): void;
}>();

const { modelValue, existingLocations } = defineProps<{
  modelValue: { name: string; location: LatLng };
  existingLocations: NamedPoint[];
}>();
//
// const existingNamedLocations = computed<NamedPoint[]>(() => {
//   return (existingLocations || [])
//     .filter((location) => location.location !== undefined)
//     .filter(
//       (location) => location.location?.lat !== 0 && location.location?.lng !== 0
//     )
//     .filter(
//       (location) =>
//         !!location.lastAudioRecordingTime || !!location.lastThermalRecordingTime
//     )
//     .map((location) => {
//       return {
//         name: location.name,
//         project: location.groupName,
//         location: location.location as LatLng,
//         id: location.id,
//         type: "station",
//       };
//     });
// });

// Automatic conversions
const latInternal = ref<number | undefined>();
const lngInternal = ref<number | undefined>();

const lat = computed<number, undefined>({
  get() {
    return latInternal.value;
  },
  set(val: number | undefined) {
    if (val !== undefined) {
      latInternal.value = Math.max(Math.min(val, -90), 90);
    } else {
      latInternal.value = val;
    }
  },
});

const lng = computed<number, undefined>({
  get() {
    return lngInternal.value;
  },
  set(val: number | undefined) {
    if (val !== undefined) {
      lngInternal.value = Math.max(Math.min(val, -180), 180);
    } else {
      lngInternal.value = val;
    }
  },
});

const easting = ref<number | undefined>();
const northing = ref<number | undefined>();
const currentProject = inject(
  currentSelectedProject
) as ComputedRef<SelectedProject>;

// Get NZ latlng bounds as range.
// FIXME - If coordinates outside of NZTM range are input, round-tripping these conversions can lead to the page hang
// FIXME - Maybe load stations for group here, and block showing map on that load.

watch(format, (next: "latlng" | "nztm") => {
  if (next === "latlng") {
    if (easting.value !== undefined && northing.value !== undefined) {
      const latLng = convertNZTMToLatLng(
        easting.value as number,
        northing.value as number
      );
      latInternal.value = latLng.lat;
      lngInternal.value = latLng.lng;
    }
  } else {
    if (latInternal.value !== undefined && lngInternal.value !== undefined) {
      const eastNorth = convertLatLngToNZTM(
        lngInternal.value as number,
        latInternal.value as number
      );
      easting.value = eastNorth.easting;
      northing.value = eastNorth.northing;
    }
  }
});

const updateModel = () => {
  if (latInternal.value !== undefined && lngInternal.value !== undefined) {
    emit("update:modelValue", {
      name: newLocationName.value,
      location: {
        lat: latInternal.value as number,
        lng: lngInternal.value as number,
      },
    });
  }
};
const newLocationName = ref<string>("");
watch(latInternal, updateModel);
watch(lngInternal, updateModel);
watch(newLocationName, updateModel);

// If the project already has locations, center the map at the center of its current locations' bounds
//const deviceLocations = inject("deviceLocations") as ComputedRef<NamedPoint[]>;
const setInitialMapCenter = (locations: NamedPoint[]) => {
  if (locations.length) {
    const bounds = latLngBounds(locations.map(({ location }) => location));
    const location = bounds.getCenter();
    defaultCenter.location = location;
    lngInternal.value = location.lng;
    latInternal.value = location.lat;
  }
};
watch(() => existingLocations, setInitialMapCenter);

const defaultCenter: NamedPoint = {
  location: {
    lat: -43.5375559,
    lng: 172.6117458,
  },
  name: "Selected location",
  project: currentProject.value?.groupName || "",
};
onBeforeMount(() => {
  latInternal.value = modelValue.location.lat;
  lngInternal.value = modelValue.location.lng;
  defaultCenter.location.lat = latInternal.value;
  defaultCenter.location.lng = lngInternal.value;
});
onMounted(() => {
  // if (existingLocations.length) {
  //   setInitialMapCenter(existingLocations);
  // } else {
  //   setInitialMapCenter([defaultCenter]);
  // }
});
const initMap = () => {
  console.log("INIT MAP");
  setInitialMapCenter([defaultCenter]);
};

const updateCenter = (latLng: LatLng) => {
  latInternal.value = latLng.lat;
  lngInternal.value = latLng.lng;
  const northingEasting = convertLatLngToNZTM(lng.value, lat.value);
  northing.value = northingEasting.northing;
  easting.value = northingEasting.easting;
};
</script>
<template>
  <div class="d-flex flex-row justify-content-between">
    <div class="w-50 me-3">
      <label class="fs-7">Location</label>
      <b-form-input
        v-model="newLocationName"
        placeholder="Give your new location a descriptive name"
        class="my-2"
      />
      <b-form-radio-group
        id="radio-group-1"
        v-model="format"
        name="radio-options"
      >
        <b-form-radio value="latlng">Latitude/Longitude</b-form-radio>
        <b-form-radio value="nztm">NZTM</b-form-radio>
      </b-form-radio-group>

      <div v-if="format === 'latlng'" class="d-flex justify-content-between">
        <div class="me-2 w-50">
          <label class="fs-7" for="latitude">Latitude (degrees)</label>
          <b-form-input
            type="number"
            v-model="lat"
            id="latitude"
            placeholder="Latitude"
            step="0.001"
            min="-90"
            max="90"
          />
        </div>
        <div class="w-50">
          <label class="fs-7" for="longitude">Longitude (degrees)</label>
          <b-form-input
            type="number"
            v-model="lng"
            id="longitude"
            placeholder="Longitude"
            step="0.001"
            min="-180"
            max="180"
          />
        </div>
      </div>
      <div v-else class="d-flex justify-content-between">
        <div class="me-2 w-50">
          <label class="fs-7" for="easting">Easting (m)</label>
          <b-form-input
            type="number"
            v-model="easting"
            id="easting"
            placeholder="Easting"
          />
        </div>
        <div class="w-50">
          <label class="fs-7" for="northing">Northing (m)</label>
          <b-form-input
            type="number"
            v-model="northing"
            placeholder="Northing"
            id="northing"
          />
        </div>
      </div>
    </div>
    <map-with-points
      :center="defaultCenter.location"
      :zoom-level="5"
      :points="existingLocations"
      show-cross-hairs
      @move-map="updateCenter"
      @init-map="initMap"
      class="map"
    />
  </div>
</template>

<style scoped lang="less">
.map {
  height: 400px;
  width: 50%;
}
</style>
