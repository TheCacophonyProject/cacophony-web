<template>
  <l-map
    class="map"
    :style="{
      height: mapHeight,
      pointerEvents: isInteractive ? 'auto' : 'none',
    }"
    v-if="mapBounds"
    :bounds="mapBounds"
    :options="{ zoomControl: zoom, dragging: isInteractive, maxZoom: 16 }"
    @ready="onReady"
  >
    <l-control-layers v-if="canChangeBaseMap && mapLayers.length > 1" />
    <l-w-m-s-tile-layer
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
      :radius="60"
      :key="`r_${point.name}`"
      :fill-opacity="0.25"
      :weight="1"
      :stroke="false"
      :interative="false"
    />
    <l-circle-marker
      v-for="point in mapLocations"
      :lat-lng="point.location"
      :key="`${point.group}_${point.name}`"
      :radius="5"
      color="black"
      :weight="0.5"
      :fill-opacity="1"
      @click="(e) => navigateToLocation(point)"
    >
      <l-tooltip
        >{{ point.name }}: {{ Number(point.location.lat).toFixed(5) }},
        {{ Number(point.location.lng).toFixed(5) }}</l-tooltip
      >
    </l-circle-marker>
  </l-map>
</template>

<script lang="ts">
import { linzBasemapApiKey } from "@/config";
import { latLng, LatLng, latLngBounds } from "leaflet";
import {
  LCircle,
  LCircleMarker,
  LMap,
  LTooltip,
  LWMSTileLayer,
  LControlLayers,
} from "vue2-leaflet";

interface Point {
  name: string;
  group: string;
  location: LatLng;
}

export default {
  name: "MapWithPoints",
  components: {
    LMap,
    LTooltip,
    LCircle,
    LCircleMarker,
    LWMSTileLayer,
    LControlLayers,
  },
  props: {
    points: {
      type: Array,
      required: true,
    },
    radius: {
      type: Number,
      default: 0,
    },
    height: {
      type: Number,
      default: 400,
    },
    zoom: {
      type: Boolean,
      default: true,
    },
    canChangeBaseMap: {
      type: Boolean,
      default: true,
    },
    isInteractive: {
      type: Boolean,
      default: true,
    },
    navigateToPoint: {
      type: Function,
      required: false,
    },
  },
  computed: {
    mapLayers() {
      const OpenTopoMapFallbackLayer = {
        name: "OpenTopoMap Basemap",
        visible: false,
        url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
        maxZoom: 17,
        attribution:
          'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
      };
      const OpenStreetMapFallbackLayer = {
        name: "OpenStreetMap Basemap",
        visible: false,
        url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution:
          '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
      };
      if (linzBasemapApiKey && linzBasemapApiKey !== "YOUR_API_KEY_HERE") {
        return [
          {
            name: "LINZ Basemap",
            visible: true, // Make the LINZ basemap the default one
            attribution:
              '<a href="//www.linz.govt.nz/data/linz-data/linz-basemaps/data-attribution">LINZ CC BY 4.0 © Imagery Basemap contributors</a>',
            url: `https://basemaps.linz.govt.nz/v1/tiles/aerial/3857/{z}/{x}/{y}.webp?api=${linzBasemapApiKey}`,
          },
          {
            name: "LINZ Topo",
            visible: false, // Make the LINZ basemap the default one
            attribution:
              '<a href="//www.linz.govt.nz/data/linz-data/linz-basemaps/data-attribution">LINZ CC BY 4.0 © Imagery Basemap contributors</a>',
            url: `http://tiles-a.data-cdn.linz.govt.nz/services;key=${linzBasemapApiKey}/tiles/v4/layer=767/EPSG:3857/{z}/{x}/{y}.png`,
          },
          OpenTopoMapFallbackLayer,
          OpenStreetMapFallbackLayer,
        ];
      }
      return [
        { ...OpenTopoMapFallbackLayer, visible: true },
        { ...OpenStreetMapFallbackLayer },
      ];
    },
    mapBounds() {
      // Calculate the initial map bounds and zoom level from the set of lat/lng points
      return (
        this.mapLocations.length &&
        latLngBounds([this.mapLocations.map(({ location }) => location)]).pad(
          0.25,
        )
      );
    },
    mapLocations(): Point[] {
      return this.points.map(({ location, ...rest }) => ({
        location:
          typeof location === "string"
            ? latLng(
                location.split(", ").map(Number) as [number, number, number],
              )
            : location,
        ...rest,
      }));
    },
    mapLocationsForRadius(): Point[] {
      if (this.radius !== 0) {
        return this.mapLocations;
      }
      return [];
    },
    mapHeight(): string {
      return `${this.height}px`;
    },
  },
  methods: {
    navigateToLocation(point: Point) {
      if (this.navigateToPoint) {
        this.$router.push(this.navigateToPoint(point));
      }
    },
    onReady(e) {
      // Stupid hack to get the map to render in the correct position on load.
      e._onResize();
    },
  },
};
</script>

<style scoped lang="scss"></style>
