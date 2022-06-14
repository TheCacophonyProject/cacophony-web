<script setup lang="ts">
import "leaflet/dist/leaflet.css";
import {
  LCircle,
  LCircleMarker,
  LMap,
  LTooltip,
  LControlLayers,
  LWmsTileLayer,
} from "@vue-leaflet/vue-leaflet";

import { computed } from "vue";
import { useRouter } from "vue-router";
import type { LatLng, LeafletEvent } from "leaflet";
import { latLngBounds, LatLngBounds } from "leaflet";

export interface NamedPoint {
  name: string;
  group: string;
  location: LatLng;
}

// eslint-disable-next-line vue/no-setup-props-destructure
const {
  points,
  radius = 0,
  navigateToPoint,
  zoom = true,
  highlightedPoint = null,
  canChangeBaseMap = true,
  isInteractive = true,
} = defineProps<{
  navigateToPoint?: (p: NamedPoint) => any;
  points: NamedPoint[];
  highlightedPoint?: NamedPoint | null;
  radius?: number;
  zoom?: boolean;
  canChangeBaseMap?: boolean;
  isInteractive?: boolean;
}>();

const mapLayers = [
  {
    name: "OpenTopoMap Basemap",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution:
      'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
    visible: true,
  },
  {
    name: "OpenStreetMap Basemap",
    visible: false,
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
  },
];

const mapBounds = computed<LatLngBounds | null>(() => {
  // Calculate the initial map bounds and zoom level from the set of lat/lng points
  return (
    (points.length &&
      latLngBounds(points.map(({ location }) => location)).pad(0.25)) ||
    null
  );
});

const mapLocationsForRadius = computed<NamedPoint[]>(() => {
  if (radius !== 0) {
    return points;
  }
  return [];
});

const hasPoints = computed<boolean>(() => {
  return points && points.length !== 0;
});

const navigateToLocation = (point: NamedPoint) => {
  if (navigateToPoint) {
    const router = useRouter();
    router.push(navigateToPoint(point));
  }
};

// IDEA: Hash the name of the point into a colour for that point?
const onReady = (e: LeafletEvent) => {
  e.setMaxZoom(17); // Max tile resolution
  e.fitBounds([
    mapBounds.value?.getNorthEast(),
    mapBounds.value?.getSouthWest(),
  ]);
};
const onZoomChange = (e: LeafletEvent) => {
  //console.log(e);
};

const emit = defineEmits(["hover-point", "leave-point"]);

const hoverPoint = (point: NamedPoint) => {
  emit("hover-point", point);
};

const leavePoint = (point: NamedPoint) => {
  emit("leave-point", point);
};
</script>
<template>
  <l-map
    class="map"
    :style="{
      // height: mapHeight,
      pointerEvents: isInteractive ? 'auto' : 'none',
    }"
    v-if="hasPoints"
    :options="{
      zoomControl: zoom,
      dragging: isInteractive,
      maxZoom: 17,
    }"
    @ready="onReady"
    @update:zoom="onZoomChange"
  >
    <l-control-layers v-if="canChangeBaseMap && mapLayers.length > 1" />
    <l-wms-tile-layer
      v-for="layer in mapLayers"
      :key="layer.name"
      :base-url="layer.url"
      :layers="layer.layers"
      :visible="layer.visible"
      :name="layer.name"
      :attribution="layer.attribution"
      layer-type="base"
    />
    <l-circle
      v-for="point in mapLocationsForRadius"
      :lat-lng="point.location"
      :radius="radius"
      :key="`r_${point.name}`"
      :fill-opacity="0.25"
      :fill="true"
      :fill-color="
        highlightedPoint && point.name === highlightedPoint.name
          ? '#6EA7FA'
          : ''
      "
      :stroke="false"
      :interative="false"
    />
    <l-circle-marker
      v-for="point in points"
      :lat-lng="point.location"
      :key="`${point.group}_${point.name}`"
      :radius="
        highlightedPoint && point.name === highlightedPoint.name ? 10 : 5
      "
      :fill="true"
      :fill-color="
        highlightedPoint && point.name === highlightedPoint.name
          ? '#6EA7FA'
          : ''
      "
      @mouseover="hoverPoint(point)"
      @mouseleave="leavePoint(point)"
      :stroke="false"
      :fill-opacity="1"
      @click="(e) => navigateToLocation(point)"
    >
      <l-tooltip
        >{{ point.name }}: {{ Number(point.location.lat).toFixed(5) }},
        {{ Number(point.location.lng).toFixed(5) }}</l-tooltip
      >
    </l-circle-marker>
  </l-map>
  <div v-else class="map loading">Leaflet map</div>
</template>
<style lang="less">
.map.loading {
  background: #e7bc0b;
  // color: #3388ff;
  // color: #6ea7fa;
}
.pulse {
  animation: pulsate 1s ease-out;
  -webkit-animation: pulsate 1s ease-out;
  -webkit-animation-iteration-count: infinite;
  opacity: 0;
}

@keyframes pulsate {
  0% {
    opacity: 0;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
</style>
