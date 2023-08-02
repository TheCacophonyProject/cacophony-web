import type { ApiVisitResponse } from "@typedefs/api/monitoring";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import type { DeviceId, StationId } from "@typedefs/api/common";

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
