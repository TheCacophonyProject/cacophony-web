declare module "*.json";

import {
  integer,
  float,
  Seconds,
  FloatZeroToOne,
  IsoFormattedDateString,
} from "./common";

type ClassificationClass =
  | "bird"
  | "cat"
  | "false-positive"
  | "hedgehog"
  | "human"
  | "leporidae"
  | "mustelid"
  | "possum"
  | "rodent"
  | "vehicle"
  | "wallaby"
  | "not";
// NOTE "not" is ignored..

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

interface TrackClassification {
  classify_time: Seconds;
  label: ClassificationClass;
  confidence: FloatZeroToOne;
  clarity: FloatZeroToOne;
  average_novelty: float;
  max_novelty: float;
  all_class_confidences: Record<ClassificationClass, FloatZeroToOne>;
  predictions: integer[][];
  model_id: integer;

  // Used in api when calculating good tags
  tag: string;
  message: string;
}

interface RawTrack {
  id: integer;
  tracker_version: string;
  start_s: Seconds;
  end_s: Seconds;
  num_frames: integer;
  frame_start: integer;
  frame_end: integer;
  positions: TrackFramePosition[];
  predictions: TrackClassification[];

  // Fields used in api when calculating good tracks/tags
  confidence?: FloatZeroToOne;
  message?: string;
  crap?: string;
}

export interface MinimalTrackRequestData {
  tracker_version?: string;
  start_s: Seconds;
  end_s: Seconds;
  trap_triggered?: boolean;
  trigger_frame?: integer;
  num_frames?: integer;
  frame_start?: integer;
  frame_end?: integer;
  positions?: TrackFramePosition[];
  predictions?: TrackClassification[];

  // Fields used in api when calculating good tracks/tags
  confidence?: FloatZeroToOne;
  message?: string;

  id?: number; // FIXME - Why is the processing backend including an id for a track that hasn't been created yet?
}

interface ClassifierModelDescription {
  id: integer;
  name: string;
  model_file: string;
  model_weights: string | null;
  wallaby: boolean;
  tag_scores: {
    default: integer;
    wallaby?: integer;
  };
  ignored_tags: string[]; // TODO - what can these be?
  thumbnail_model: boolean;
  classify_time: Seconds;
}

// Some comment

export interface ClassifierRawResult {
  source: string;
  camera_model: string;
  background_thresh: integer;
  start_time: IsoFormattedDateString;
  end_time: IsoFormattedDateString;
  tracking_time: Seconds;
  algorithm: {
    tracker_version: string;
    tracker_config: {
      background_calc: "preview";
      motion_config: {
        camera_thresholds: Record<string, CameraThresholdConfig>;
        dynamic_thresh: boolean;
      };
      ignore_frames: integer;
      threshold_percentile: float;
      static_background_threshold: float;
      max_mean_temperature_threshold: integer;
      max_temperature_range_threshold: integer;
      edge_pixels: integer;
      dilation_pixels: integer;
      frame_padding: integer;
      track_smoothing: boolean;
      remove_track_after_frames: integer;
      high_quality_optical_flow: boolean;
      min_threshold: integer;
      max_threshold: integer;
      flow_threshold: integer;
      max_tracks: integer;
      track_overlap_ratio: float;
      min_duration_secs: Seconds;
      track_min_offset: float;
      track_min_mass: float;
      aoi_min_mass: float;
      aoi_pixel_variance: float;
      cropped_regions_strategy: string;
      verbose: boolean;
      enable_track_output: boolean;
      min_tag_confidence: float;
      moving_vel_thresh: integer;
      min_moving_frames: integer;
      max_blank_percent: float;
      max_mass_std_percent: float;
      max_jitter: integer;
      // TODO - what can these be if they're not null?  We probably don't really care.
      stats: null;
      filters: null;
      areas_of_interest: null;
    };
  };
  tracks: RawTrack[];
  models: ClassifierModelDescription[];
  thumbnail_region?: TrackFramePosition;
}
