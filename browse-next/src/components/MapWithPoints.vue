<script setup lang="ts">
import "leaflet/dist/leaflet.css";

import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import type { RouteLocationRaw } from "vue-router";
import type { CircleMarkerOptions, LatLngTuple } from "leaflet";
import {
  DomEvent,
  latLng,
  Layer,
  Map as LeafletMap,
  Point,
  TileLayer,
} from "leaflet";
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
import { rafFps } from "@models/LoggedInUser";
import type { NamedPoint } from "@models/mapUtils";
import { BSpinner } from "bootstrap-vue-3";
import type { LatLng } from "@typedefs/api/common";

const attribution = control.attribution;

// FIXME - if there are only inactive points, and the points are very spread apart, the points are grey and small
//  and hard to see.  Maybe make them a minimum size, or give them an outline colour?

const {
  points = [],
  radius = 0,
  navigateToPoint,
  zoom = true,
  zoomLevel,
  center,
  minZoom = 5,
  highlightedPoint = null,
  canChangeBaseMap = true,
  isInteractive = true,
  markersAreInteractive = true,
  hasAttribution = true,
  showStationRadius = true,
  showOnlyActivePoints = true,
  activePoints = [],
  focusedPoint,
  showCrossHairs = false,
} = defineProps<{
  navigateToPoint?: (p: NamedPoint) => RouteLocationRaw;
  points?: NamedPoint[];
  highlightedPoint?: NamedPoint | null;
  activePoints?: NamedPoint[];
  focusedPoint?: NamedPoint | null;
  radius?: number;
  showStationRadius?: boolean;
  showOnlyActivePoints?: boolean;
  zoom?: boolean;
  zoomLevel?: number;
  minZoom?: number;
  center?: LatLng;
  canChangeBaseMap?: boolean;
  isInteractive?: boolean;
  markersAreInteractive?: boolean;
  hasAttribution?: boolean;
  showCrossHairs?: boolean;
}>();

interface LeafletInternalRawMarker {
  _radius: number;
  _point: Point;
  _path: SVGPathElement;
  _empty: () => boolean;
  _map: LeafletMap;
}

const loading = ref<boolean>(false);
const mapEl = ref<HTMLDivElement | null>(null);

const pointKey = (point: NamedPoint) => {
  if (!point.location) {
    debugger;
  }
  return `${point.project}|${point.name}|${point.location.lat}|${point.location.lng}`;
};

const lerp = (targetValue: number, progressZeroOne: number) => {
  return targetValue * progressZeroOne;
};
const iLerp = (targetValue: number, currentValue: number): number => {
  return currentValue / targetValue;
};

const updateMarkerRadius = (marker: CircleMarkerGroup, radius: number) => {
  // Leaflet only allows setting integer radius values, which makes animation stuttery, so we'll just
  // draw it ourselves.
  const rawMarker =
    marker.foregroundMarker as unknown as LeafletInternalRawMarker;
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

const markerAnimationFrames: Record<string, number> = {};
const highlightMarker = (marker: CircleMarkerGroup, key: string) => {
  const currentRadius = marker.foregroundMarker.getRadius();
  const numFrames = Math.ceil(rafFps.value * 0.3);
  const initialRadius = 5;
  const enlargeBy = 5;
  if (currentRadius < initialRadius + enlargeBy) {
    const progress = iLerp(enlargeBy, currentRadius - initialRadius);
    const newRadius =
      initialRadius + lerp(enlargeBy, Math.min(1, progress + 1 / numFrames));
    cancelAnimationFrame(markerAnimationFrames[key]);
    markerAnimationFrames[key] = requestAnimationFrame(() => {
      const rawMarker =
        marker.foregroundMarker as unknown as LeafletInternalRawMarker;
      if (!rawMarker._path.classList.contains("pulse")) {
        rawMarker._path.classList.add("pulse");
      }
      updateMarkerRadius(marker, newRadius);
      highlightMarker(marker, key);
    });
  }
};

const unhighlightImmediately = (marker: CircleMarkerGroup) => {
  const rawMarker =
    marker.foregroundMarker as unknown as LeafletInternalRawMarker;
  if (rawMarker._path.classList.contains("pulse")) {
    (rawMarker._path as SVGPathElement).classList.remove("pulse");
  }
  marker.foregroundMarker.setRadius(5);
};

const unHighlightMarker = (marker: CircleMarkerGroup, key: string) => {
  const currentRadius = marker.foregroundMarker.getRadius();
  if (currentRadius > 5) {
    cancelAnimationFrame(markerAnimationFrames[key]);
    markerAnimationFrames[key] = requestAnimationFrame(() => {
      const rawMarker =
        marker.foregroundMarker as unknown as LeafletInternalRawMarker;
      if (rawMarker._path.classList.contains("pulse")) {
        (rawMarker._path as SVGPathElement).classList.remove("pulse");
      }
      marker.foregroundMarker.setRadius(currentRadius - 1);
      unHighlightMarker(marker, key);
    });
  }
};

watch(
  () => highlightedPoint,
  (newP: NamedPoint | null) => {
    const key = (newP && pointKey(newP)) || "";
    for (const [markerKey, pointMarker] of Object.entries(markers)) {
      if (key === markerKey) {
        // If the highlighted point is outside the current map bounds, pan to it and center it, or fit the bounds.
        pointMarker.foregroundMarker.bringToFront();
        highlightMarker(pointMarker, markerKey);
        pointMarker.foregroundMarker.openTooltip();
        (
          (pointMarker.foregroundMarker as unknown as LeafletInternalRawMarker)
            ._map as LeafletMap
        ).panInside(pointMarker.foregroundMarker.getLatLng(), {
          padding: [100, 30],
        });
      } else {
        cancelAnimationFrame(markerAnimationFrames[markerKey]);
        unhighlightImmediately(pointMarker);
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
  const boundsPaddingInMeters = 300;
  if (
    !(
      !activePoints ||
      (activePoints && activePoints.length === 0) ||
      !showOnlyActivePoints
    )
  ) {
    if (focusedPoint) {
      // Give the bounds 300m around the focused location.
      // TODO: Make focused point be more centered, so that its tooltip doesn't get cut off
      return latLng(focusedPoint.location).toBounds(boundsPaddingInMeters);
    } else if (activePoints && activePoints.length === 1) {
      // Give the bounds 300m around the location.
      return latLng(activePoints[0].location).toBounds(boundsPaddingInMeters);
    } else if (activePoints && activePoints.length > 1) {
      return latLngBounds(
        activePoints.flatMap(({ location }) => {
          const pBounds = latLng(location).toBounds(boundsPaddingInMeters);
          return [pBounds.getNorthWest(), pBounds.getSouthEast()];
        })
      );
    }
  }
  // Calculate the initial map bounds and zoom level from the set of lat/lng points
  return (
    (points &&
      points.length &&
      latLngBounds(
        points.flatMap(({ location }) => {
          const pBounds = latLng(location).toBounds(boundsPaddingInMeters);
          return [pBounds.getNorthWest(), pBounds.getSouthEast()];
        })
      )) ||
    null
  );
});

const _mapLocationsForRadius = computed<NamedPoint[]>(() => {
  if (radius !== 0) {
    return points;
  }
  return [];
});

const _hasPoints = computed<boolean>(() => {
  return points && points.length !== 0;
});

const computedLoading = computed<boolean>(() => loading.value);

const _navigateToLocation = (point: NamedPoint) => {
  if (navigateToPoint) {
    const router = useRouter();
    router.push(navigateToPoint(point));
  }
};

interface CircleMarkerGroup {
  backgroundRadius?: Circle;
  foregroundMarker: CircleMarker;
}

watch(computedLoading, (nextLoadingState: boolean) => {
  if (nextLoadingState) {
    // TODO - Add a loading overlay to the current map?
    clearCurrentMarkers();
  }
});

const markers: Record<string, CircleMarkerGroup> = {};
// IDEA: Hash the name of the point into a colour for that point?
const _onReady = (_map: LeafletMap) => {
  //map.setMaxZoom(17); // Max tile resolution
};
const _onZoomChange = (_zoomLevel: number) => {
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

const clearCurrentMarkers = () => {
  if (map) {
    for (const [key, marker] of Object.entries(markers)) {
      if (marker.backgroundRadius) {
        map.removeLayer(marker.backgroundRadius);
      }
      map.removeLayer(marker.foregroundMarker);
      delete markers[key];
    }
  }
};

const addPoints = () => {
  if (map) {
    clearCurrentMarkers();
    // NOTE: If there's a focused point specified, then we want to only colour
    //  that point - all the other points should be grey.

    // Add the points as markers.
    for (const point of points) {
      const colour: CircleMarkerOptions = {};
      const thisPointKey = pointKey(point);
      const isAnActivePoint =
        activePoints && activePoints.find((p) => pointKey(p) === thisPointKey);
      const isFocusedPoint =
        focusedPoint && pointKey(focusedPoint) === thisPointKey;
      if (!point.color && !isAnActivePoint) {
        colour.fillColor = "#666";
      } else if (point.color) {
        colour.fillColor = point.color;
      }
      let fillOpacityMultiplier = 1;
      let pointScaleMultiplier = 1;
      if (!isAnActivePoint) {
        pointScaleMultiplier = 1;
        fillOpacityMultiplier = 0.85;
      }
      if (isAnActivePoint && focusedPoint && !isFocusedPoint) {
        fillOpacityMultiplier = 0.5;
      }
      if (isFocusedPoint) {
        pointScaleMultiplier = 1.25;
      }

      const marker: CircleMarkerGroup = {
        foregroundMarker: circleMarker(point.location, {
          radius: 5 * pointScaleMultiplier,
          stroke: false,
          fillOpacity: fillOpacityMultiplier,
          interactive: isAnActivePoint && markersAreInteractive,
          ...colour,
        }),
      };
      if (!point.type || point.type === "station") {
        marker.backgroundRadius = circle(point.location, {
          radius: 30,
          interactive: false,
          fillOpacity: 0.25 * fillOpacityMultiplier,
          fillColor: "",
          fill: true,
          stroke: false,
          ...colour,
        });
      }
      markers[pointKey(point)] = marker;

      if (markersAreInteractive && isAnActivePoint) {
        const tooltipText = `${point.name}`;
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
        marker.foregroundMarker.on("mouseout", () => leavePoint());
        marker.foregroundMarker.on("click", (e) => {
          const namedPoint = points.find(
            (p) =>
              p.location.lat === e.latlng.lat && p.location.lng === e.latlng.lng
          );
          namedPoint && selectPoint(namedPoint);
        });
      }
      if (marker.backgroundRadius) {
        map.addLayer(marker.backgroundRadius);
      }
      map.addLayer(marker.foregroundMarker);
    }
    // Bring active markers to foreground:
    if (activePoints) {
      for (const point of activePoints) {
        const marker = markers[pointKey(point)];
        if (marker && marker.foregroundMarker.getElement()?.parentNode) {
          if (marker.backgroundRadius) {
            marker.backgroundRadius.bringToFront();
          }
          marker.foregroundMarker.bringToFront();
        }
      }

      // TODO: Try and get the contrast with the markers looking better
      map.eachLayer((layer) => {
        if ((layer as TileLayer).options.attribution) {
          (layer as TileLayer).setOpacity(0.15);
        }
      });
    }
    if (focusedPoint) {
      const marker = markers[pointKey(focusedPoint)];
      if (marker && marker.foregroundMarker.getElement()?.parentNode) {
        if (marker.backgroundRadius) {
          marker.backgroundRadius.bringToFront();
        }
        marker.foregroundMarker.bringToFront();
      }
    }
    fitMapBounds();
  }
};

watch(() => activePoints, addPoints);
watch(() => points, addPoints);
watch(() => focusedPoint, addPoints);

const fitMapBounds = () => {
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

onMounted(() => {
  loading.value = true;
  const mapElement = mapEl.value;

  for (const layer of mapLayers) {
    tileLayers[layer.name] = tileLayer.wms(layer.url, {
      attribution: layer.attribution,
      detectRetina: true,
    });
    if (layer.visible) {
      tileLayers[layer.name].on("load", (e) => {
        if (loading.value) {
          (tileLayers[layer.name] as TileLayer).setOpacity(0.25);
          loading.value = false;
          addPoints();
        }
      });
    }
  }
  // TODO: Add a "Fit to bounds" button.
  map = mapConstructor(mapElement as HTMLElement, {
    zoomControl: zoom,
    dragging: isInteractive,
    scrollWheelZoom: isInteractive,
    keyboard: isInteractive,
    tap: isInteractive,
    maxZoom: 16,
    minZoom,
    attributionControl: false,
    center: center || mapBounds.value?.getCenter(),
    zoom: zoomLevel || 14,
    layers: [tileLayers[currentLayer]], // The default layer
  });

  map.on("move", (event) => {
    if ("originalEvent" in event) {
      emit("move-map", map?.getCenter());
    }
  });
  map.on("load", () => {
    emit("init-map");
  });
  if (center) {
    // map load event won't fire if we manually set center on init.
    emit("init-map");
  }
  map.invalidateSize();
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
    attributionToggle.onAdd = (_map: LeafletMap): HTMLElement => {
      const el = document.createElement("div");
      el.classList.add("leaflet-control");
      el.classList.add("leaflet-control-container");
      el.classList.add("leaflet-bar");
      el.classList.add("leaflet-attribution-toggle");
      el.innerHTML = `<a class="leaflet-control-zoom-in" href="#" title="Toggle attribution" role="button" aria-label="Toggle attribution" aria-disabled="false"><span aria-hidden="true">i</span></a>`;
      DomEvent.addListener(el, "click", DomEvent.stopPropagation)
        .addListener(el, "click", DomEvent.preventDefault)
        .addListener(el, "click", () => {
          showAttribution = !showAttribution;
          maybeShowAttributionForCurrentLayer();
        });
      DomEvent.addListener(
        el,
        "dblclick",
        DomEvent.stopPropagation
      ).addListener(el, "dblclick", DomEvent.preventDefault);
      return el;
    };
    map.addControl(attributionToggle);
  }
  if (!center) {
    map.invalidateSize();
      console.log("Fit map bounds", mapBounds.value);
    fitMapBounds();
  }
  addPoints();
});

watch(
  () => center,
  () => {
    if (center && map) {
      map.invalidateSize();
      map.setView(center, zoomLevel);
    }
  }
);
//  TODO: On point highlight, animate the size/colour of the point.
//  Suggests that maybe we don't want to use vue-leaflet to manage the lifecycle of the points.
//  Would also be cool to have the ability to show "group regions" where there is a bubble or shape around a cluster of
//  points.  Showing points that are currently active in a different colour (retired stations, or stations that
//  haven't had a recording in a while.  Maybe filter stations by what kind of recordings we've seen there too,
//  so we can show either thermal or audio stations, or both.  Show stations that are more active than others?

const emit = defineEmits<{
  (e: "hover-point", val: NamedPoint): void;
  (e: "leave-point", val: NamedPoint | null): void;
  (e: "select-point", val: NamedPoint): void;
  (e: "move-map", val: LatLng): void;
  (e: "init-map"): void;
}>();

const hoverPoint = (point: NamedPoint) => {
  emit("hover-point", point);
};

const selectPoint = (point: NamedPoint) => {
  emit("select-point", point);
};

const leavePoint = () => {
  emit("leave-point", null);
};
</script>
<template>
  <div
    :class="['map', { loading }]"
    :style="{
      pointerEvents: isInteractive ? 'auto' : 'none',
    }"
    ref="mapEl"
  >
    <div
      v-if="loading"
      class="d-flex justify-content-center align-items-center loading-overlay"
    >
      <b-spinner />
    </div>
    <div
      v-else-if="showCrossHairs"
      class="d-flex justify-content-center align-items-center loading-overlay"
    >
      <svg
        fill="#000000"
        xmlns="http://www.w3.org/2000/svg"
        width="32px"
        height="32px"
        viewBox="0 0 97 97"
        xml:space="preserve"
      >
        <path
          fill="darkred"
          d="M95,44.312h-7.518C85.54,26.094,70.906,11.46,52.688,9.517V2c0-1.104-0.896-2-2-2h-4.376c-1.104,0-2,0.896-2,2v7.517l0,0
		C26.094,11.46,11.46,26.094,9.517,44.312H2c-1.104,0-2,0.896-2,2v4.377c0,1.104,0.896,2,2,2h7.517
		C11.46,70.906,26.094,85.54,44.312,87.482V95c0,1.104,0.896,2,2,2h4.377c1.104,0,2-0.896,2-2v-7.518l0,0
		C70.906,85.54,85.54,70.906,87.482,52.688H95c1.104,0,2-0.896,2-2v-4.376C97,45.207,96.104,44.312,95,44.312z M24.896,52.688
		c1.104,0,2-0.896,2-2v-4.376c0-1.104-0.896-2-2-2h-6.492c1.856-13.397,12.51-24.052,25.907-25.908v6.492c0,1.104,0.896,2,2,2h4.376
		c1.104,0,2-0.896,2-2v-6.492C66.086,20.26,76.74,30.914,78.596,44.312h-6.492c-1.104,0-2,0.896-2,2v4.377c0,1.104,0.896,2,2,2
		h6.492C76.74,66.086,66.086,76.74,52.689,78.598v-6.492c0-1.104-0.896-2-2-2h-4.377c-1.104,0-2,0.896-2,2v6.492
		C30.914,76.74,20.26,66.086,18.404,52.688H24.896z"
        />
      </svg>
    </div>
  </div>
</template>
<style lang="less">
// TODO: Set a min-height for the map from props.
.map {
  position: relative;
  overflow: hidden;
  background: radial-gradient(
    circle,
    rgba(230, 230, 230, 1) 0%,
    rgba(188, 188, 188, 1) 100%
  );
}
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  color: #666;
}
.map.loading {
  background: rgba(140, 140, 140, 0.5);
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
  font-size: var(--bs-body-font-size);
  line-height: 25px !important;
}
.leaflet-bottom.leaflet-right {
  z-index: 999;
  padding-left: 40px;
}
.leaflet-attribution-toggle {
  position: relative;
  z-index: 1001;
  user-select: none;
}
</style>
