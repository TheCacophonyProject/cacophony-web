import { computed, ref } from "vue";
import type { ApiVisitResponse } from "@typedefs/api/monitoring";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import type { DeviceId, StationId } from "@typedefs/api/common";

export const selectedVisit = ref<ApiVisitResponse | null>(null);

// TODO - This should come from user state per group.
const onlyShowPredators = ref<boolean>(true);

// TODO: Should this selection context be a single blob of state per group, and get wiped out when groups change?
//  Should we try to recontruct it from url state?

interface SelectedVisitsContext {
  visits: ApiVisitResponse[];
  stations: StationId[] | "all";
}

interface SelectedRecordingsContext {
  recordings: ApiRecordingResponse[];
  devices: DeviceId[] | "all";
}

// We can be viewing a list of visits, or a list of recordings
export const visitsContext = ref<ApiVisitResponse[] | null>(null);
export const recordingsContext = ref<ApiRecordingResponse[] | null>(null);

const ignored: string[] = [
  "unknown",
  "none",
  "unidentified",
  "false-positive",
  "bird",
  "vehicle",
  "human",
];

const visitorIsPredator = (visit: ApiVisitResponse) => {
  if (onlyShowPredators.value) {
    return (
      visit && visit.classification && !ignored.includes(visit.classification)
    );
  }
  return true;
};

export const maybeFilteredVisitsContext = computed<ApiVisitResponse[]>(() => {
  if (visitsContext.value) {
    return visitsContext.value.filter(visitorIsPredator);
  }
  return [];
});
