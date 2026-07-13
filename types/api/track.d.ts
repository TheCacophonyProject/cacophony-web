import type { FloatZeroToOne, Seconds, TrackId } from "./common.ts";
import type { ApiTrackTag } from "./trackTag.ts";
import type { TrackFramePosition } from "./fileProcessing.ts";

export interface ApiTrackPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  order?: number;
  pixel_variance?: number;
  frame_number?: number;
  frameTime?: number;
  mass?: number;
  blank?: boolean;
}

export interface ApiTrackResponse {
  id: TrackId;
  start: Seconds;
  end: Seconds;
  positions?: ApiTrackPosition[];
  tags: ApiTrackTag[];
  filtered?: boolean;
  minFreq?: number;
  maxFreq?: number;
  tracking_score?: number;
}

export type AlgorithmRequest = object | number[];

export interface ApiTrackRequest {
  data: ApiTrackDataRequest;
  algorithm?: AlgorithmRequest;
}

export interface ApiTrackDataRequest {
  start_s: Seconds;
  end_s: Seconds;

  // FIXME - Make more of these fields mandatory once we know who calls this with what.
  minFreq?: number;
  maxFreq?: number;
  automatic?: boolean;
  userId?: number;
  label?: string;
  clarity?: number;
  positions?: ([number, [number, number, number, number]] | ApiTrackPosition)[];
  message?: string;
  tag?: string;
  tracker_version?: number | string;
  tracking_score?: number;

  predictions?: {
    all_class_confidences?: unknown;
    confident_tag?: string;
    clarity?: FloatZeroToOne;
    raw_tag?: string;
    label?: string;
    model_id: number;
    tag?: string;
    confidence?: number;
    confident?: boolean;
  }[];

  thumbnail?: {
    region?: TrackFramePosition;
    palette?: string;
  };
}
