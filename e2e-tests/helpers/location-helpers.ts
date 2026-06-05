import { LatLng } from "@shared/api/common";

export const testLocation = (lat: number, lng: number, fudgeFactor = 1.0): LatLng => {
  return {
    lat: lat + (Math.random() - 0.5) * fudgeFactor,
    lng: lng + (Math.random() - 0.5) * fudgeFactor,
  };
};

// Flipped Lat/long
export const invalidTestLocation = () => testLocation(170, 45);
export const validTestLocation = () => testLocation(-45, 170);
export const nullTestLocation = () => testLocation(0, 0, 0);

export const spreadLocations = (
  startLocation: LatLng,
  numLocations: number,
  distance = 0.1,
): LatLng[] => {
  const locations = [];
  for (let i = 0; i < numLocations; i++) {
    locations.push({
      lat: startLocation.lat - i * distance,
      lng: startLocation.lng,
    });
  }
  return locations;
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
