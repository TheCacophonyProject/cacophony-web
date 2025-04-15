import type { ApiVisitResponse } from "@typedefs/api/monitoring";
import type { LatLng } from "@typedefs/api/common";
import { DateTime, Duration } from "luxon";
import tzLookup from "tz-lookup-oss";
import type { ApiStationResponse } from "@typedefs/api/station";
import * as sunCalc from "suncalc";
import {
  flatClassifications,
  getClassifications,
  getPathForLabel,
} from "@api/Classifications";
import type { Classification } from "@typedefs/api/trackTag";
import { RecordingProcessingState } from "@typedefs/api/consts.ts";

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

(async () => {
  await getClassifications();
  // Fill in tagPrecedence with any children of pre-set tags:
  if (flatClassifications.value) {
    for (let i = 0; i < tagPrecedence.length; i++) {
      const tag = tagPrecedence[i];
      const classification = flatClassifications.value[tag] as {
        label: string;
        display: string;
        path: string;
        node: Classification;
      };
      if (classification && classification.node.children) {
        for (const child of classification.node.children) {
          tagPrecedence.splice(i + 1, 0, child.label);
          i++;
        }
      }
    }
  }
})();

export const visitsByLocation = (
  visits: ApiVisitResponse[],
): Record<number, ApiVisitResponse[]> =>
  visits.reduce((acc, visit) => {
    acc[visit.stationId] = acc[visit.stationId] || [];
    acc[visit.stationId].push(visit);
    return acc;
  }, {} as Record<number, ApiVisitResponse[]>);

export const sortTagPrecedence = (a: string, b: string): number => {
  const aPriority = tagPrecedence.indexOf(a);
  const bPriority = tagPrecedence.indexOf(b);
  if (aPriority === -1 && bPriority > -1) {
    return 1;
  } else if (bPriority === -1 && aPriority > -1) {
    return -1;
  } else if (aPriority === -1 && bPriority === -1) {
    if (a === b) {
      return 0;
    }
    return a > b ? 1 : -1;
  }
  return aPriority - bPriority;
};
export const VisitProcessingStates = [
  RecordingProcessingState.Tracking,
  RecordingProcessingState.Analyse,
];
export const someRecordingStillProcessing = (
  visit: ApiVisitResponse,
): boolean => {
  // TODO: Poll to see if processing has finished
  return visit.recordings.some((rec) =>
    VisitProcessingStates.includes(rec.processingState),
  );
};
export const visitsBySpecies = (
  visits: ApiVisitResponse[],
): [string, ApiVisitResponse[]][] => {
  const summary = visits.reduce(
    (
      acc: Record<string, ApiVisitResponse[]>,
      currentValue: ApiVisitResponse,
    ) => {
      if (someRecordingStillProcessing(currentValue)) {
        acc["unclassified"] = acc["unclassified"] || [];
        acc["unclassified"].push(currentValue);
      } else if (currentValue.classification) {
        acc[currentValue.classification] =
          acc[currentValue.classification] || [];
        acc[currentValue.classification].push(currentValue);
      }
      return acc;
    },
    {},
  );
  // NOTE: Order by "badness" of predator
  return Object.entries(summary).sort(([a], [b]) => sortTagPrecedence(a, b));
};

export const visitsCountBySpecies = (
  visits: ApiVisitResponse[],
): [string, string, number][] =>
  (
    visitsBySpecies(visits).map(([classification, visits]) => [
      classification,
      getPathForLabel(classification) || "",
      visits.length,
    ]) as [string, string, number][]
  ).sort((a, b) => {
    // Sort by count and break ties by name alphabetically
    const order = b[2] - a[2];
    if (order === 0) {
      return a[0] > b[0] ? 1 : -1;
    }
    return order;
  });

export const eventsAreNocturnalOnlyAtLocation = (
  eventDates: Date[],
  location: LatLng,
): boolean => {
  for (const eventDate of eventDates) {
    const visitDay = new Date(eventDate);
    const { sunrise, sunset } = sunCalc.getTimes(
      visitDay,
      location.lat,
      location.lng,
    );
    sunrise.setMinutes(
      sunrise.getMinutes() + MINUTES_BEFORE_DUSK_AND_AFTER_DAWN,
    );
    sunset.setMinutes(sunset.getMinutes() - MINUTES_BEFORE_DUSK_AND_AFTER_DAWN);
    if (eventDate > sunrise && eventDate < sunset) {
      return false;
    }
  }
  return true;
};

export const visitsAreNocturnalOnlyAtLocation = (
  visits: ApiVisitResponse[],
  location: LatLng,
) =>
  eventsAreNocturnalOnlyAtLocation(
    visits.map(({ timeStart }) => new Date(timeStart)),
    location,
  );

export const visitsByNightAtLocation = (
  visits: ApiVisitResponse[],
  location: LatLng,
): [DateTime, ApiVisitResponse[]][] => {
  const zone = timezoneForLatLng(location);
  const visitsChunked: [DateTime, ApiVisitResponse[]][] = [];
  for (const visit of visits) {
    // If the visit is after sunset, and before sunrise, it goes to the current day
    // otherwise, it goes to the previous day?
    const visitDay = new Date(visit.timeStart);
    const { sunset } = sunCalc.getTimes(visitDay, location.lat, location.lng);
    let visitSunset = new Date(sunset);
    visitSunset.setMinutes(
      visitSunset.getMinutes() - MINUTES_BEFORE_DUSK_AND_AFTER_DAWN,
    );
    if (visitDay < visitSunset) {
      // Attribute the visit to the previous day
      const yesterday = new Date(visitDay);
      yesterday.setDate(yesterday.getDate() - 1);
      const { sunset } = sunCalc.getTimes(
        yesterday,
        location.lat,
        location.lng,
      );
      visitSunset = sunset;
    } else {
      visitSunset = sunset;
    }
    visitSunset.setMinutes(
      visitSunset.getMinutes() - MINUTES_BEFORE_DUSK_AND_AFTER_DAWN,
    );
    let lastDateTime: DateTime;
    if (visitsChunked.length) {
      lastDateTime = visitsChunked[visitsChunked.length - 1][0];
    } else {
      lastDateTime = DateTime.fromJSDate(visitSunset, { zone });
    }
    const visitSunsetDateTime = DateTime.fromJSDate(visitSunset);
    if (visitsChunked.length && visitSunsetDateTime.equals(lastDateTime)) {
      visitsChunked[visitsChunked.length - 1][1].push(visit);
    } else {
      visitsChunked.push([visitSunsetDateTime, [visit]]);
    }
  }
  return visitsChunked;
};

export const visitsByDayAtLocation = (
  visits: ApiVisitResponse[],
  location: LatLng,
): [DateTime, ApiVisitResponse[]][] => {
  // Chunk visits from midnight to midnight at the given location.
  // Visits are ordered from oldest to most recent in each day.

  // Note that we count visits as being on the day that they started:  A visit that straddles midnight
  // will only be counted on the previous day.
  const zone = timezoneForLatLng(location);
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

export const timezoneForLatLng = (location: LatLng) =>
  tzLookup(location.lat, location.lng);
export const timezoneForLocation = (station: ApiStationResponse) =>
  timezoneForLatLng(station.location);

export const formatDuration = (
  milliseconds: number,
  longForm = false,
): string => {
  const minsSecs = Duration.fromMillis(milliseconds).shiftTo(
    "minutes",
    "seconds",
  );
  if (minsSecs.minutes > 0) {
    if (Math.floor(minsSecs.seconds) > 0) {
      return longForm
        ? minsSecs.toFormat("m 'minutes''&nbsp;'s 'seconds'")
        : minsSecs.toFormat("m'm''&nbsp;'ss's'");
    }
    return longForm
      ? minsSecs.toFormat("m 'minutes'")
      : minsSecs.toFormat("m'm'");
  }
  return longForm
    ? minsSecs.toFormat("s 'seconds'")
    : minsSecs.toFormat("ss's'");
};
export const visitDuration = (
  visit: ApiVisitResponse,
  longForm = false,
): string => {
  const millis =
    new Date(visit.timeEnd).getTime() - new Date(visit.timeStart).getTime();
  return formatDuration(millis, longForm);
};
export const timeAtLocation = (
  timeIsoString: string,
  location: LatLng,
): string => {
  const zone = timezoneForLatLng(location);
  const localTime = DateTime.fromISO(timeIsoString, { zone });
  return localTime
    .toLocaleString({
      hour: "numeric",
      minute: "2-digit",
      hourCycle: "h12",
    })
    .replace(/ /g, "");
};

export const dayAndTimeAtLocation = (
  timeIsoString: string,
  location: LatLng,
): string => {
  const zone = timezoneForLatLng(location);
  const localTime = DateTime.fromISO(timeIsoString, { zone });
  return localTime.toLocaleString({
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
  });
};

export const intlFormatForLocation = (location: LatLng) => {
  return new Intl.DateTimeFormat("en-NZ", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hour12: true,
    timeZone: timezoneForLatLng(location),
  });
};
