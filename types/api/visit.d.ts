import {
  IsoFormattedDateString,
  RecordingId,
  TrackId,
} from "@typedefs/api/common.js";

export interface ApiStaticVisitResponse {
  recordingIds: RecordingId[];
  startTime: IsoFormattedDateString;
  endTime: IsoFormattedDateString;
  classificationRecordingId: RecordingId | null;
  classificationTrackId: TrackId | null;
  aiClassification: string | null;
  humanClassification: string | null;
}
