import type { integer, float, Seconds, FloatZeroToOne } from "./common.ts";

interface CameraThresholdConfig {
  camera_model: string;
  temp_thresh: integer;
  background_thresh: integer;
  default: boolean;
  min_temp_thresh: null | integer;
  max_temp_thresh: null | integer;
  track_min_delta: float;
  track_max_delta: float;
}

export interface TrackFramePosition {
  x: float;
  y: float;
  width: float;
  height: float;
  mass?: integer;
  frame_number?: integer;
  pixel_variance?: float;
  blank?: boolean;
  in_trap?: boolean;
}

export interface RecordingDataSuppliedMetadata {
  tracks?: RawTrack[];
  metadata_source?: string;
  algorithm: object;
  models?: { name: string; id: number }[];
}

export interface RawTrack {
  id?: integer;
  tracker_version?: integer | string;
  start_s: Seconds;
  end_s: Seconds;
  num_frames: integer;
  frame_start: integer;
  frame_end: integer;
  positions: TrackFramePosition[];
  predictions: TrackClassification[];
  tracking_score?: float;
  // Fields used in api when calculating good tracks/tags
  confidence?: FloatZeroToOne;
  message?: string;
  thumbnail?: ThumbnailInfo | null;
  minFreq?: number;
  maxFreq?: number;
}

export interface ThumbnailInfo {
  region: TrackFramePosition;
  contours: number;
  median_diff: number;
  score: number;
}

export interface TrackClassification {
  all_class_confidences?: null | Record<string, number>;
  confidence: number;
  confident: boolean;
  clarity?: number;
  classify_time?: Seconds;
  tag: string;
  message?: string;
  model_id?: integer;
  model_used?: string;
  rat_thresh_version?: number;
  threshold_used?: FloatZeroToOne;

  // Used in api when calculating good tags
  name?: string;
  // just used for metadata uploaded in the field will become deprecated once all pi classifiers are updated
  label?: string;
  confident_tag?: string;
}

export type TrackClassifications = TrackClassification[];

export interface MinimalTrack {
  AlgorithmId: number;
  startSeconds?: number;
  endSeconds?: number;
  minFreqHz?: number;
  maxFreqHz?: number;
  RecordingId: number;
  filtered?: boolean;
  thumbnailScore?: number;
}

export type MinimalTracksRequestData = MinimalTrackRequestData[];

export interface MinimalTrackRequestData {
  tracker_version?: integer | string;
  start_s: Seconds;
  end_s: Seconds;
  minFreq?: integer;
  maxFreq?: integer;
  scale?: string;
  tracking_score?: float;
  num_frames?: integer;
  frame_start?: integer;
  frame_end?: integer;
  positions?: TrackFramePosition[];
  predictions?: TrackClassification[];

  // Fields used in api when calculating good tracks/tags
  confidence?: number;
  message?: string;
  thumbnail?: ThumbnailInfo | null;

  id?: number; // FIXME - Why is the processing backend including an id for a track that hasn't been created yet?
}
