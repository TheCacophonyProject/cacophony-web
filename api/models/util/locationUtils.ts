// How close is a station allowed to be to another station?
import type { LatLng } from "@typedefs/api/common.js";
import type { Station } from "@models/Station.js";
import type { GroupId } from "@typedefs/api/common.js";
import type { Recording } from "@models/Recording.js";
import { Op } from "sequelize";
import type { GroupStatic } from "@models/Group.js";
import type { ModelsDictionary } from "@models";

export const MIN_STATION_SEPARATION_METERS = 60;
// The radius of the station is half the max distance between stations: any recording inside the radius can
// be considered to belong to that station.
export const MAX_DISTANCE_FROM_STATION_FOR_RECORDING =
  MIN_STATION_SEPARATION_METERS / 2;

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
    sinLat1 * Math.sin(lat2) + costLat1 * Math.cos(lat2) * Math.cos(deltaLng)
  );
  return part1 * R;
}

export async function tryToMatchLocationToStationInGroup(
  models: ModelsDictionary,
  location: LatLng,
  groupId: GroupId,
  activeFromDate: Date,
  lookForwards: boolean = false
): Promise<Station | null> {
  // Match the recording to any stations that the group might have:
  let stations;
  if (lookForwards) {
    stations = await models.Station.activeInGroupDuringTimeRange(
      groupId,
      activeFromDate,
      new Date(),
      lookForwards
    );
  } else {
    stations = await models.Station.activeInGroupAtTime(
      groupId,
      activeFromDate
    );
  }
  const stationDistances = [];
  for (const station of stations) {
    // See if any stations match: Looking at the location distance between this recording and the stations.
    const distanceToStation = latLngApproxDistance(station.location, location);
    stationDistances.push({ distanceToStation, station });
  }
  const validStationDistances = stationDistances.filter(
    ({ distanceToStation }) =>
      distanceToStation <= MAX_DISTANCE_FROM_STATION_FOR_RECORDING
  );

  // There shouldn't really ever be more than one station within our threshold distance,
  // since we check that stations aren't too close together when we add them.  However, on the off
  // chance we *do* get two or more valid stations for a recording, take the closest one.
  validStationDistances.sort((a, b) => {
    return b.distanceToStation - a.distanceToStation;
  });
  const closest = validStationDistances.pop();
  if (closest) {
    return closest.station;
  }
  return null;
}

export async function tryToMatchRecordingToStation(
  staticGroup: GroupStatic,
  recording: Recording,
  stations?: Station[]
): Promise<Station | null> {
  // If the recording does not yet have a location, return
  if (!recording.location) {
    return null;
  }

  // Match the recording to any stations that the group might have:
  if (!stations) {
    const group = await staticGroup.getFromId(recording.GroupId);
    stations = await group.getStations({
      where: {
        activeAt: { [Op.lte]: recording.recordingDateTime },
        retiredAt: {
          [Op.or]: [
            { [Op.eq]: null },
            { [Op.gt]: recording.recordingDateTime },
          ],
        },
      },
    });
  }
  const stationDistances = [];
  for (const station of stations) {
    // See if any stations match: Looking at the location distance between this recording and the stations.
    const distanceToStation = latLngApproxDistance(
      station.location,
      recording.location
    );
    stationDistances.push({ distanceToStation, station });
  }
  const validStationDistances = stationDistances.filter(
    ({ distanceToStation }) =>
      // eslint-disable-next-line no-undef
      distanceToStation <= MAX_DISTANCE_FROM_STATION_FOR_RECORDING
  );

  // There shouldn't really ever be more than one station within our threshold distance,
  // since we check that stations aren't too close together when we add them.  However, on the off
  // chance we *do* get two or more valid stations for a recording, take the closest one.
  validStationDistances.sort((a, b) => {
    return b.distanceToStation - a.distanceToStation;
  });
  const closest = validStationDistances.pop();
  if (closest) {
    return closest.station;
  }
  return null;
}

const EPSILON = 0.000000000001;

export const canonicalLatLng = (
  location: LatLng | { coordinates: [number, number] } | [number, number]
): LatLng => {
  if (Array.isArray(location)) {
    return { lat: location[0], lng: location[1] };
  } else if (location.hasOwnProperty("coordinates")) {
    // Lat lng is stored in the database as lng/lat (X,Y).
    // If we get lat/lng in this format we are getting it from the DB.
    return {
      lat: (location as { coordinates: [number, number] }).coordinates[1],
      lng: (location as { coordinates: [number, number] }).coordinates[0],
    };
  }
  return location as LatLng;
};
const EARTH_RADIUS = 6371000; // Earth's radius in meters.
const toRadians = (deg: number): number => (deg * Math.PI) / 180;
/**
 * Computes the distance between two points on the Earth using the Haversine formula.
 *
 * @param a - The first location.
 * @param b - The second location.
 * @returns The distance between the two points in meters.
 */
export const haversineDistance = (a: LatLng, b: LatLng): number => {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const havA =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const havC = 2 * Math.atan2(Math.sqrt(havA), Math.sqrt(1 - havA));
  return EARTH_RADIUS * havC;
};

/**
 * Compares two locations, treating them as equal if they are within 5 meters of each other.
 *
 * @param a - The first location.
 * @param b - The second location.
 * @returns True if the locations are within 5 meters; otherwise, false.
 */
export const locationsAreEqual = (
  a: LatLng | { coordinates: [number, number] },
  b: LatLng | { coordinates: [number, number] }
): boolean => {
  const canonicalA = canonicalLatLng(a);
  const canonicalB = canonicalLatLng(b);
  const toleranceInMeters = 5; // 5 meters tolerance

  return haversineDistance(canonicalA, canonicalB) < toleranceInMeters;
};
