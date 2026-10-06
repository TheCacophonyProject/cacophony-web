import { computed } from "vue";
import type { Ref, ComputedRef } from "vue";
import type { LatLng } from "@typedefs/api/common";
import type {
  ApiStationResponse,
  ApiStationResponse as ApiLocationResponse,
} from "@typedefs/api/station";
import type { LoadedResource } from "@apiClient/types";
import type { ApiDeviceResponse } from "@typedefs/api/device";
import { DeviceType as ConcreteDeviceType } from "@typedefs/api/consts.ts";

export const canonicalLatLngForLocations = (
  locations:
    | Ref<LoadedResource<ApiLocationResponse[]>>
    | ComputedRef<ApiLocationResponse[]>,
) =>
  computed<LatLng>(() => {
    if (locations.value && locations.value.length) {
      return locations.value[0].location;
    }
    return { lat: 0, lng: 0 };
  });

export const MIN_STATION_SEPARATION_METERS = 60;
// The radius of the station is half the max distance between stations: any recording inside the radius can
// be considered to belong to that station.
export const MAX_DISTANCE_FROM_STATION_FOR_RECORDING =
  MIN_STATION_SEPARATION_METERS / 2;
export const latestRecordingTimeForDeviceAtLocation = (
  device: ApiDeviceResponse,
  location: ApiLocationResponse,
): Date | null => {
  if (
    location &&
    (location.lastAudioRecordingTime || location.lastThermalRecordingTime)
  ) {
    if (location.lastAudioRecordingTime && location.lastThermalRecordingTime) {
      return new Date(
        Math.max(
          new Date(location.lastAudioRecordingTime).getTime(),
          new Date(location.lastThermalRecordingTime).getTime(),
        ),
      );
    } else if (location.lastAudioRecordingTime) {
      return new Date(location.lastAudioRecordingTime);
    } else if (location.lastThermalRecordingTime) {
      return new Date(location.lastThermalRecordingTime);
    }
  }

  return null;
};

export function latLngApproxDistance(a: LatLng, b: LatLng): number {
  if (a.lat === b.lat && a.lng === b.lng) {
    return 0;
  }
  const R = 6371e3;
  // Using 'spherical law of cosines' from https://www.movable-type.co.uk/scripts/latlong.html
  const lat1 = (a.lat * Math.PI) / 180;
  const costLat1 = Math.cos(lat1);
  const sinLat1 = Math.sin(lat1);
  const lat2 = (b.lat * Math.PI) / 180;
  const deltaLng = ((b.lng - a.lng) * Math.PI) / 180;
  const part1 = Math.acos(
    sinLat1 * Math.sin(lat2) + costLat1 * Math.cos(lat2) * Math.cos(deltaLng),
  );
  return part1 * R;
}

export const locationNameForDevice = (
  device: ApiDeviceResponse,
  locations: ApiStationResponse[],
): string => {
  if (device.location) {
    const stationDistances = [];
    for (const station of locations) {
      // See if any stations match: Looking at the location distance between this recording and the stations.
      const distanceToStation = latLngApproxDistance(
        station.location,
        device.location,
      );
      stationDistances.push({ distanceToStation, station });
    }
    const validStationDistances = stationDistances.filter(
      ({ distanceToStation }) =>
        distanceToStation <= MAX_DISTANCE_FROM_STATION_FOR_RECORDING,
    );

    // There shouldn't really ever be more than one station within our threshold distance,
    // since we check that stations aren't too close together when we add them.  However, on the off
    // chance we *do* get two or more valid stations for a recording, take the closest one.
    validStationDistances.sort((a, b) => {
      return b.distanceToStation - a.distanceToStation;
    });
    const closest = validStationDistances.pop();
    if (closest) {
      return closest.station.name;
    }
  }
  return "";
};
