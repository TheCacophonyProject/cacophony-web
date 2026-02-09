import { IsoFormattedDateString, RecordingId } from "@typedefs/api/common.js";

export interface ApiStaticVisitResponse {
  recordingIds: RecordingId[];
  startTime: IsoFormattedDateString;
  endTime: IsoFormattedDateString;
  classification: {
    path: string;
    source: "ai" | "human" | "none";
  };
}
