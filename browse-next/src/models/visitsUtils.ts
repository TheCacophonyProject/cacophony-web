import type { ApiVisitResponse } from "@typedefs/api/monitoring";
import type { LatLng } from "@typedefs/api/common";
import { DateTime } from "luxon";
import tzLookup from "tz-lookup-oss";
import type { ApiStationResponse } from "@typedefs/api/station";
import * as sunCalc from "suncalc";

export const MINUTES_BEFORE_DUSK_AND_AFTER_DAWN = 60;

const tagPrecedence = [
  "conflicting tags",
  "unidentified",
  "none",
  "mustelid",
  "cat",
  "possum",
  "hedgehog",
  "rodent",
  "leporidae",
];

export const visitsByStation = (
  visits: ApiVisitResponse[]
): Record<number, ApiVisitResponse[]> =>
  visits.reduce((acc, visit) => {
    acc[visit.stationId] = acc[visit.stationId] || [];
    acc[visit.stationId].push(visit);
    return acc;
  }, {} as Record<number, ApiVisitResponse[]>);

export const visitsBySpecies = (
  visits: ApiVisitResponse[]
): [string, ApiVisitResponse[]][] => {
  const summary = visits.reduce(
    (
      acc: Record<string, ApiVisitResponse[]>,
      currentValue: ApiVisitResponse
    ) => {
      if (currentValue.classification) {
        acc[currentValue.classification] =
          acc[currentValue.classification] || [];
        acc[currentValue.classification].push(currentValue);
      }
      return acc;
    },
    {}
  );
  // NOTE: Order by "badness" of predator
  return Object.entries(summary).sort(
    (a: [string, ApiVisitResponse[]], b: [string, ApiVisitResponse[]]) => {
      const aPriority = tagPrecedence.indexOf(a[0]);
      const bPriority = tagPrecedence.indexOf(b[0]);
      if (aPriority === -1 && bPriority > -1) {
        return 1;
      } else if (bPriority === -1 && aPriority > -1) {
        return -1;
      } else if (aPriority === -1 && bPriority === -1) {
        if (a[0] === b[0]) {
          return 0;
        }
        return a[0] > b[0] ? 1 : -1;
      }
      return aPriority - bPriority;
    }
  );
};

export const visitsCountBySpecies = (
  visits: ApiVisitResponse[]
): [string, number][] =>
  visitsBySpecies(visits).map(([classification, visits]) => [
    classification,
    visits.length,
  ]);

export const eventsAreNocturnalOnlyAtLocation = (
  eventDates: Date[],
  location: LatLng
): boolean => {
  const zone = timezoneForLocation(location);
  for (const eventDate of eventDates) {
    const visitDay = new Date(eventDate);
    const visitDateTime = DateTime.fromISO(eventDate.toISOString(), {
      zone,
    });
    const isBeforeMidday = visitDateTime.hour < 12;
    let visitDusk: Date;
    let visitDawn: Date;
    // If the visit is *after* midday in the local time on the day it is on, then we want to look at dusk and dawn + 1
    // If the visit is *before* midday in the local time on the day it is on, then we want to look at dawn and dusk - 1
    if (isBeforeMidday) {
      const { dawn } = sunCalc.getTimes(visitDay, location.lat, location.lng);
      const yesterday = new Date(visitDay);
      yesterday.setDate(yesterday.getDate() - 1);
      const { dusk } = sunCalc.getTimes(yesterday, location.lat, location.lng);
      visitDusk = dusk;
      visitDawn = dawn;
    } else {
      const { dusk } = sunCalc.getTimes(visitDay, location.lat, location.lng);
      const tomorrow = new Date(visitDay);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const { dawn } = sunCalc.getTimes(tomorrow, location.lat, location.lng);
      visitDusk = dusk;
      visitDawn = dawn;
    }
    // console.log("Dusk", DateTime.fromJSDate(visitDusk, {zone}).toString(), "Dawn", DateTime.fromJSDate(visitDawn, {zone}).toString());
    // Allow our standard window around dusk/dawn
    visitDawn.setMinutes(
      visitDawn.getMinutes() + MINUTES_BEFORE_DUSK_AND_AFTER_DAWN
    );
    visitDusk.setMinutes(
      visitDusk.getMinutes() - MINUTES_BEFORE_DUSK_AND_AFTER_DAWN
    );
    // Is the visit before the dawn for this day?
    // Is the visit after the dusk for this day?
    // TODO - Should we just make nights go from midday until midday?
    if (eventDate < visitDusk || eventDate > visitDawn) {
      console.log(
        "Dusk",
        DateTime.fromJSDate(visitDusk, { zone }).toString(),
        "Dawn",
        DateTime.fromJSDate(visitDawn, { zone }).toString(),
        "Event",
        DateTime.fromJSDate(eventDate, { zone }).toString(),
        "Before midday?",
        isBeforeMidday
      );
      return false;
    }
  }
  return true;
};

export const visitsAreNocturnalOnlyAtLocation = (
  visits: ApiVisitResponse[],
  location: LatLng
) =>
  eventsAreNocturnalOnlyAtLocation(
    visits.map(({ timeStart }) => new Date(timeStart)),
    location
  );

export const visitsByNightAtLocation = (
  visits: ApiVisitResponse[],
  location: LatLng
): [DateTime, ApiVisitResponse[]][] => {
  const zone = timezoneForLocation(location);
  const visitsChunked: [DateTime, ApiVisitResponse[]][] = [];
  for (const visit of visits) {
    const visitDay = new Date(visit.timeStart);
    const visitDateTime = DateTime.fromISO(visit.timeStart, {
      zone,
    });
    const isBeforeMidday = visitDateTime.hour < 12;
    let visitDusk: Date;
    // If the visit is *after* midday in the local time on the day it is on, then we want to look at dusk and dawn + 1
    // If the visit is *before* midday in the local time on the day it is on, then we want to look at dawn and dusk - 1
    if (isBeforeMidday) {
      const yesterday = new Date(visitDay);
      yesterday.setDate(yesterday.getDate() - 1);
      const { dusk } = sunCalc.getTimes(yesterday, location.lat, location.lng);
      visitDusk = dusk;
    } else {
      const { dusk } = sunCalc.getTimes(visitDay, location.lat, location.lng);
      const tomorrow = new Date(visitDay);
      tomorrow.setDate(tomorrow.getDate() - 1);
      visitDusk = dusk;
    }
    // Allow our standard window around dusk/dawn
    visitDusk.setMinutes(
      visitDusk.getMinutes() - MINUTES_BEFORE_DUSK_AND_AFTER_DAWN
    );

    let lastDateTime: DateTime;
    if (visitsChunked.length) {
      lastDateTime = visitsChunked[visitsChunked.length - 1][0];
    } else {
      lastDateTime = DateTime.fromJSDate(visitDusk, { zone });
    }
    if (visitsChunked.length && visitDateTime.equals(lastDateTime)) {
      visitsChunked[visitsChunked.length - 1][1].push(visit);
    } else {
      visitsChunked.push([visitDateTime, [visit]]);
    }
  }
  return visitsChunked;
};

export const visitsByDayAtLocation = (
  visits: ApiVisitResponse[],
  location: LatLng
): [DateTime, ApiVisitResponse[]][] => {
  // Chunk visits from midnight to midnight at the given location.
  // Visits are ordered from oldest to most recent in each day.

  // Note that we count visits as being on the day that they started:  A visit that straddles midnight
  // will only be counted on the previous day.
  const zone = timezoneForLocation(location);
  const visitsChunked: [DateTime, ApiVisitResponse[]][] = [];

  // FIXME - the first chunk will not be a full day at the moment, since we're not going back to the beginning of the
  //  day when we request the visits.  Should we always do that, and then crop events when we display timeline etc?

  for (const visit of visits) {
    const visitDay = DateTime.fromISO(visit.timeStart, { zone });
    const visitDayStart = visitDay.set({
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    });
    let lastDateTime: DateTime;
    if (visitsChunked.length) {
      lastDateTime = visitsChunked[visitsChunked.length - 1][0];
    } else {
      lastDateTime = visitDayStart;
    }
    if (visitsChunked.length && visitDayStart.equals(lastDateTime)) {
      visitsChunked[visitsChunked.length - 1][1].push(visit);
    } else {
      visitsChunked.push([visitDayStart, [visit]]);
    }
  }
  return visitsChunked;
};

export const timezoneForLocation = (location: LatLng) =>
  tzLookup(location.lat, location.lng);
export const timezoneForStation = (station: ApiStationResponse) =>
  timezoneForLocation(station.location);
