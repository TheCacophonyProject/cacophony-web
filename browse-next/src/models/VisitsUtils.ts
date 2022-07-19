import type { ApiVisitResponse } from "@typedefs/api/monitoring";

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
