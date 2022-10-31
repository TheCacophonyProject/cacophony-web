import { computed, ref } from "vue";
import type { ApiVisitResponse } from "@typedefs/api/monitoring";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import type { DeviceId, StationId } from "@typedefs/api/common";

export const selectedVisit = ref<ApiVisitResponse | null>(null);

// TODO - This should come from user state per group.
const onlyShowPredators = ref<boolean>(true);

// TODO: Should this selection context be a single blob of state per group, and get wiped out when groups change?
//  Should we try to reconstruct it from url state?

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface SelectedVisitsContext {
  visits: ApiVisitResponse[];
  stations: StationId[] | "all";
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface SelectedRecordingsContext {
  recordings: ApiRecordingResponse[];
  devices: DeviceId[] | "all";
}

// We can be viewing a list of visits, or a list of recordings
export const visitsContext = ref<ApiVisitResponse[] | null>(null);
export const recordingsContext = ref<ApiRecordingResponse[] | null>(null);

const ignored: string[] = [
  //"unknown",
  //"none",
  //"unidentified",
  //"false-positive",
  "bird",
  "vehicle",
  "human",
];

export const visitorIsPredator = (visit: ApiVisitResponse): boolean => {
  if (onlyShowPredators.value) {
    return (visit &&
      visit.classification &&
      !ignored.includes(visit.classification)) as boolean;
  }
  return true;
};

export const visitHasClassification =
  (tag: string) =>
  (visit: ApiVisitResponse): boolean => {
    return (visit &&
      visit.classification &&
      visit.classification === tag) as boolean;
  };

export const currentVisitsFilter = ref<
  ((visit: ApiVisitResponse) => boolean) | null
>(null);

export const currentVisitsFilterComputed = computed<
  (visit: ApiVisitResponse) => boolean
>(() => {
  if (currentVisitsFilter.value === null) {
    return visitorIsPredator;
  } else {
    return currentVisitsFilter.value;
  }
});

export const maybeFilteredVisitsContext = computed<ApiVisitResponse[]>(() => {
  if (visitsContext.value) {
    return visitsContext.value.filter(currentVisitsFilterComputed.value);
  }
  return [];
});
