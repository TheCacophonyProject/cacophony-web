import {
  IsoFormattedDateString,
  type LocationId,
  RecordingId,
  TrackId,
} from "@typedefs/api/common.js";

export interface ApiStaticVisitResponse {
  recordingIds: RecordingId[];
  startTime: IsoFormattedDateString;
  endTime: IsoFormattedDateString;
  aiClassificationRecordingId: RecordingId | null;
  aiClassificationTrackId: TrackId | null;
  humanClassificationRecordingId: RecordingId | null;
  humanClassificationTrackId: TrackId | null;
  aiClassification: string | null;
  humanClassification: string | null;

  locationId: LocationId;
  locationName: string;
}
