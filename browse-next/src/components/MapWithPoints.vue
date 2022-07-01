<script setup lang="ts">
import "leaflet/dist/leaflet.css";

import { computed, nextTick, onMounted, onUpdated, ref, watch } from "vue";
import type { Ref } from "vue";
import { useRouter } from "vue-router";
import type { LatLng, LatLngTuple, Layer, Map as LeafletMap } from "leaflet";
import {
  tileLayer,
  latLngBounds,
  LatLngBounds,
  circle,
  circleMarker,
  map as mapConstructor,
  control,
  Control,
  Circle,
  CircleMarker,
} from "leaflet";
import attribution = control.attribution;
import { rafFps } from "@models/LoggedInUser";

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
  highlightedPoint,
  canChangeBaseMap = true,
  isInteractive = true,
  markersAreInteractive = true,
  hasAttribution = true,
} = defineProps<{
  navigateToPoint?: (p: NamedPoint) => any;
  points: NamedPoint[];
  highlightedPoint: Ref<NamedPoint | null>;
  radius?: number;
  zoom?: boolean;
  canChangeBaseMap?: boolean;
  isInteractive?: boolean;
  markersAreInteractive?: boolean;
  hasAttribution?: boolean;
}>();

const mapEl = ref<HTMLDivElement | null>(null);

const pointKey = (point: NamedPoint) =>
  `${point.group}|${point.name}|${point.location.lat}|${point.location.lng}`;

const lerp = (targetValue: number, progressZeroOne: number) => {
  return targetValue * progressZeroOne;
};
const iLerp = (targetValue: number, currentValue: number): number => {
  return currentValue / targetValue;
};

const updateMarkerRadius = (marker: CircleMarkerGroup, radius: number) => {
  // Leaflet only allows setting integer radius values, which makes animation stuttery, so we'll just
  // draw it ourselves.
  const rawMarker = marker.foregroundMarker as any;
  {
    rawMarker._radius = radius;
    const p = rawMarker._point,
      r = Math.max(rawMarker._radius, 1),
      arc = "a" + r + "," + r + " 0 1,0 ";

    // drawing a circle with two half-arcs
    const d = rawMarker._empty()
      ? "M0 0"
      : "M" +
        (p.x - r) +
        "," +
        p.y +
        arc +
        r * 2 +
        ",0 " +
        arc +
        -r * 2 +
        ",0 ";

    rawMarker._path.setAttribute("d", d);
  }
};

const highlightMarker = (marker: CircleMarkerGroup) => {
  const currentRadius = marker.foregroundMarker.getRadius();
  const numFrames = Math.ceil(rafFps.value * 0.3);
  const initialRadius = 5;
  const enlargeBy = 5;

  if (currentRadius < initialRadius + enlargeBy) {
    const progress = iLerp(enlargeBy, currentRadius - initialRadius);
    const newRadius =
      initialRadius + lerp(enlargeBy, Math.min(1, progress + 1 / numFrames));
    requestAnimationFrame(() => {
      const rawMarker = marker.foregroundMarker as any;
      if (!rawMarker._path.classList.contains("pulse")) {
        rawMarker._path.classList.add("pulse");
      }
      updateMarkerRadius(marker, newRadius);
      highlightMarker(marker);
    });
  }
};

const unHighlightMarker = (marker: CircleMarkerGroup) => {
  const currentRadius = marker.foregroundMarker.getRadius();
  if (currentRadius > 5) {
    requestAnimationFrame(() => {
      const rawMarker = marker.foregroundMarker as any;
      if (rawMarker._path.classList.contains("pulse")) {
        (rawMarker._path as SVGPathElement).classList.remove("pulse");
      }
      // TODO - Lerp this number properly.
      marker.foregroundMarker.setRadius(currentRadius - 1);
      unHighlightMarker(marker);
    });
  }
};

watch(
  highlightedPoint,
  (newPoint: NamedPoint | null, oldPoint: NamedPoint | null) => {
    if (newPoint) {
      const pointMarker = markers[pointKey(newPoint)];
      if (pointMarker) {
        // If the highlighted point is outside the current map bounds, pan to it and center it, or fit the bounds.
        pointMarker.foregroundMarker.bringToFront();
        highlightMarker(pointMarker);
        pointMarker.foregroundMarker.openTooltip();
        ((pointMarker.foregroundMarker as any)._map as LeafletMap).panInside(
          pointMarker.foregroundMarker.getLatLng(),
          {
            padding: [100, 30],
          }
        );
      }
    }
    if (oldPoint) {
      const pointMarker = markers[pointKey(oldPoint)];
      if (pointMarker) {
        unHighlightMarker(pointMarker);
        pointMarker.foregroundMarker.closeTooltip();
      }
    }
  }
);

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

const computedPoints = computed<NamedPoint[]>(() => points);

const navigateToLocation = (point: NamedPoint) => {
  if (navigateToPoint) {
    const router = useRouter();
    router.push(navigateToPoint(point));
  }
};

interface CircleMarkerGroup {
  backgroundRadius: Circle;
  foregroundMarker: CircleMarker;
}

const markers: Record<string, CircleMarkerGroup> = {};
// IDEA: Hash the name of the point into a colour for that point?
const onReady = (map: LeafletMap) => {
  //map.setMaxZoom(17); // Max tile resolution
};
const onZoomChange = (zoomLevel: number) => {
  //console.log(e);
};
const tileLayers: Record<string, Layer> = {};
let showAttribution = false;
let map: null | LeafletMap = null;
let currentLayer = "OpenTopoMap Basemap";
const maybeShowAttributionForCurrentLayer = () => {
  // Should be current layer
  const tileLayer = tileLayers[currentLayer];
  const existingAttributionControl = (map as LeafletMap).attributionControl;
  if (existingAttributionControl) {
    (map as LeafletMap).removeControl(existingAttributionControl);
  }
  if (showAttribution) {
    const attributionForLayer = attribution().addAttribution(
      (tileLayer.getAttribution && tileLayer.getAttribution()) || ""
    );
    (map as LeafletMap).addControl(attributionForLayer);
  }
};

const addPoints = () => {
  if (map) {
    console.log("Adding POINTS", points.length);
    for (const [key, marker] of Object.entries(markers)) {
      map.removeLayer(marker.backgroundRadius);
      map.removeLayer(marker.foregroundMarker);
      delete markers[key];
    }

    // Add the points as markers.  Remember to unload them when we leave.
    for (const point of points) {
      const marker = {
        backgroundRadius: circle(point.location, {
          radius: 30,
          interactive: false,
          fillOpacity: 0.25,
          fillColor: "",
          fill: true,
          stroke: false,
        }),
        foregroundMarker: circleMarker(point.location, {
          radius: 5,
          stroke: false,
          fillOpacity: 1,
          interactive: markersAreInteractive
        }),
      };
      markers[pointKey(point)] = marker;
      const tooltipText = `${point.name}`; // : ${Number(point.location.lat).toFixed(5)}, ${Number(point.location.lng).toFixed(5)}
      if (markersAreInteractive) {
        marker.foregroundMarker
          .bindTooltip(tooltipText, {
            direction: "top",
            offset: [0, -5],
          })
          .openTooltip();

        marker.foregroundMarker.on("mouseover", (e) => {
          const namedPoint = points.find(
            (p) =>
              p.location.lat === e.latlng.lat && p.location.lng === e.latlng.lng
          );
          namedPoint && hoverPoint(namedPoint);
        });
        marker.foregroundMarker.on("mouseout", leavePoint);
      }
      map.addLayer(marker.backgroundRadius);
      map.addLayer(marker.foregroundMarker);
    }
  }
};

const fitMapBounds = () => {
  console.log("Fit map bounds", mapBounds.value);
  if (map && mapBounds.value) {
    (map as LeafletMap).fitBounds([
      (
        mapBounds.value as LatLngBounds
      ).getNorthEast() as unknown as LatLngTuple,
      (
        mapBounds.value as LatLngBounds
      ).getSouthWest() as unknown as LatLngTuple,
    ]);
  }
};

watch(mapBounds, fitMapBounds);
watch(computedPoints, addPoints);

onMounted(() => {
  const mapElement = mapEl.value;

  for (const layer of mapLayers) {
    tileLayers[layer.name] = tileLayer.wms(layer.url, {
      attribution: layer.attribution,
      detectRetina: true,
    });
  }

  // TODO: Add a "Fit to bounds" button.

  map = mapConstructor(mapElement as HTMLElement, {
    zoomControl: zoom,
    dragging: isInteractive,
    maxZoom: 17,
    attributionControl: false,
    layers: [tileLayers[currentLayer]], // The default layer
  });
  if (canChangeBaseMap && mapLayers.length > 1) {
    map.addControl(control.layers(tileLayers));
    map.on("baselayerchange", (e) => {
      currentLayer = e.name;
      maybeShowAttributionForCurrentLayer();
    });
  }
  if (hasAttribution) {
    const attributionToggle = new Control({
      position: "bottomleft",
    });
    attributionToggle.onAdd = (map: LeafletMap): HTMLElement => {
      const el = document.createElement("div");
      el.classList.add("leaflet-control");
      el.classList.add("leaflet-control-container");
      el.classList.add("leaflet-bar");
      el.classList.add("leaflet-attribution-toggle");
      el.innerHTML = `<a class="leaflet-control-zoom-in" href="#" title="Toggle attribution" role="button" aria-label="Toggle attribution" aria-disabled="false"><span aria-hidden="true">i</span></a>`;
      el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();
        showAttribution = !showAttribution;
        maybeShowAttributionForCurrentLayer();
      });
      return el;
    };
    map.addControl(attributionToggle);
  }

  fitMapBounds();
  addPoints();
});
//  TODO: On point highlight, animate the size/colour of the point.
//  Suggests that maybe we don't want to use vue-leaflet to manage the lifecycle of the points.
//  Would also be cool to have the ability to show "group regions" where there is a bubble or shape around a cluster of
//  points.  Showing points that are currently active in a different colour (retired stations, or stations that
//  haven't had a recording in a while.  Maybe filter stations by what kind of recordings we've seen there too,
//  so we can show either thermal or audio stations, or both.  Show stations that are more active than others?

const emit = defineEmits(["hover-point", "leave-point"]);

const hoverPoint = (point: NamedPoint) => {
  emit("hover-point", point);
};

const leavePoint = () => {
  emit("leave-point", null);
};
</script>
<template>
  <div
    class="map"
    :style="{
      pointerEvents: isInteractive ? 'auto' : 'none',
    }"
    ref="mapEl"
  ></div>
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
.leaflet-attribution-toggle {
  border-radius: 50% !important;
  margin-left: 5px !important;
  margin-bottom: 5px !important;
}
.leaflet-attribution-toggle > .leaflet-control-zoom-in {
  border-radius: 50% !important;
  width: 25px !important;
  height: 25px !important;
  font-size: 16px;
  line-height: 25px !important;
}
.leaflet-bottom.leaflet-right {
  z-index: 999;
  padding-left: 40px;
}
.leaflet-attribution-toggle {
  position: relative;
  z-index: 1001;
}
</style>
