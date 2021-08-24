type IsoFormattedDateString = string;
type Integer = number;
type Float = number;
type FloatZeroToOne = number;
type Seconds = number;

type ClassificationClass = "bird" | "cat" | "false-positive" | "hedgehog" | "human"
  | "leporidae" | "mustelid" | "possum" | "rodent" | "vehicle" | "wallaby";

interface CameraThresholdConfig {
  camera_model: string;
  temp_thresh: Integer;
  background_thresh: Integer;
  default: boolean;
  min_temp_thresh: null | Integer;
  max_temp_thresh: null | Integer;
  track_min_delta: Float;
  track_max_delta: Float;
}

interface TrackFramePosition {
  x: Integer;
  y: Integer;
  width: Integer;
  height: Integer;
  mass: Integer;
  frame_number: Integer;
  pixel_variance: Float;
  blank: boolean;
}

interface TrackClassification {
  classify_time: Seconds;
  label: ClassificationClass;
  confidence: FloatZeroToOne;
  clarity: FloatZeroToOne;
  average_novelty: Float;
  max_novelty: Float;
  all_class_confidences: Record<ClassificationClass, FloatZeroToOne>;
  predictions: Integer[][];
  model_id: Integer;
}

interface RawTrack {
  id: Integer;
  tracker_version: Integer;
  start_s: Seconds;
  end_s: Seconds;
  num_frames: Integer;
  frame_start: Integer;
  frame_end: Integer;
  positions: TrackFramePosition[];
  predictions: TrackClassification[];
}

interface ClassifierModelDescription {
  id: Integer;
  name: string;
  model_file: string;
  model_weights: string;
  wallaby: boolean;
  tag_scores: {
    default: Integer;
  };
  ignored_tags: string[], // TODO - what can these be?
  thumbnail_model: boolean;
  classify_time: Seconds;
}

export interface ClassifierRawResult {
  source: string;
  camera_model: string;
  background_thresh: Integer;
  start_time: IsoFormattedDateString;
  end_time: IsoFormattedDateString;
  tracking_time: Seconds;
  algorithm: {
    tracker_version: Integer;
    tracker_config: {
      background_calc: "preview";
      motion_config: {
        camera_thresholds: Record<string, CameraThresholdConfig>,
        dynamic_thresh: boolean;
      };
      ignore_frames: Integer;
      threshold_percentile: Float;
      static_background_threshold: Float;
      max_mean_temperature_threshold: Integer;
      max_temperature_range_threshold: Integer;
      edge_pixels: Integer;
      dilation_pixels: Integer;
      frame_padding: Integer;
      track_smoothing: boolean;
      remove_track_after_frames: Integer;
      high_quality_optical_flow: boolean;
      min_threshold: Integer;
      max_threshold: Integer;
      flow_threshold: Integer;
      max_tracks: Integer;
      track_overlap_ratio: Float;
      min_duration_secs: Seconds;
      track_min_offset: Float;
      track_min_mass: Float;
      aoi_min_mass: Float;
      aoi_pixel_variance: Float;
      cropped_regions_strategy: string;
      verbose: boolean;
      enable_track_output: boolean;
      min_tag_confidence: Float;
      moving_vel_thresh: Integer;
      min_moving_frames: Integer;
      max_blank_percent: Float;
      max_mass_std_percent: Float;
      max_jitter: Integer;
      // TODO - what can these be if they're not null?  We probably don't really care.
      stats: null;
      filters: null;
      areas_of_interest: null;
    };
  };
  tracks: RawTrack[];
  models: ClassifierModelDescription[];
  thumbnail_region: TrackFramePosition;
}
