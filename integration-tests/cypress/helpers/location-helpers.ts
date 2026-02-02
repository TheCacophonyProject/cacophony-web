import { LatLng } from "@shared/api/common";

export const testLocation = (
  lat: number,
  lng: number,
  fudgeFactor = 1.0,
): LatLng => {
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
