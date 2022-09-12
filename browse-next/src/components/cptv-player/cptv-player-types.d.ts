import { TrackId } from "@typedefs/api/common";

export type Rectangle = [number, number, number, number];
export interface TrackBox {
  what: string | null;
  rect: Rectangle;
}
export type FrameNum = number;

// Adjusted for background frame offsets
export interface IntermediateTrack {
  what: string | null;
  positions: [FrameNum, Rectangle][];
  id: TrackId;
}

export interface TrackExportOption {
  includeInExportTime: boolean;
  displayInExport: boolean;
  trackId: number;
}
