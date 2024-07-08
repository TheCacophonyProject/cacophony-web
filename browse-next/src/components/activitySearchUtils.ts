import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import type { LocationQueryValue } from "vue-router";

export enum ActivitySearchRecordingMode {
  Cameras = "cameras",
  Audio = "audio",
}
export enum ActivitySearchDisplayMode {
  Visits = "visits",
  Recordings = "recordings",
}
export const getLatestDateForLocationInRecordingMode = (
  location: ApiLocationResponse,
  recordingMode: ActivitySearchRecordingMode
): Date | null => {
  if (recordingMode === ActivitySearchRecordingMode.Cameras) {
    return (
      (location.lastThermalRecordingTime &&
        new Date(location.lastThermalRecordingTime)) ||
      null
    );
  } else if (recordingMode === ActivitySearchRecordingMode.Audio) {
    return (
      (location.lastAudioRecordingTime &&
        new Date(location.lastAudioRecordingTime)) ||
      null
    );
  }
  return null;
};
export type DateRange = [Date, Date];

export const validateLocations = (
  locations: LocationQueryValue | LocationQueryValue[] | undefined,
  availableLocations: ApiLocationResponse[]
): string => {
  if (!locations) {
    return "any";
  }
  let ids: number[] = [];
  const availableIds = availableLocations.map(({ id }) => id);
  if (Array.isArray(locations)) {
    ids = locations.map(Number).filter((x) => !Number.isNaN(x));
  } else {
    ids = locations
      .split(",")
      .map(Number)
      .filter((x) => !Number.isNaN(x));
  }
  if (ids.length === 0) {
    return "any";
  }
  return ids.filter((id) => availableIds.includes(id)).join(",");
};

export const queryValueIsDate = (
  value: LocationQueryValue | LocationQueryValue[] | undefined | Date
): boolean => {
  if (value instanceof Date) {
    return true;
  }
  if (value === null || value === undefined) {
    return false;
  }
  if (Array.isArray(value)) {
    value = value.join(",");
  }
  return value.trim().length !== 0 && !Number.isNaN(Date.parse(value));
};

export const dateSuffix = (date: number) => {
  switch (date) {
    case 1:
    case 21:
    case 31:
      return `${date}st`;
    case 2:
    case 22:
      return `${date}nd`;
    case 3:
    case 23:
      return `${date}rd`;
    default:
      return `${date}th`;
  }
};

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const fullMonthName = (month: number): string => {
  return monthNames[month];
};

export const isSameDay = (a: Date, b: Date): boolean => {
  const d1 = new Date(a);
  const d2 = new Date(b);
  d1.setHours(0, 0, 0, 0);
  d2.setHours(0, 0, 0, 0);
  return d1.getTime() === d2.getTime();
};
