// Recordings uploaded with `metadata.tracks` no longer get tracks created by the API at upload time.
// To keep tests that rely on pre-existing tracks working, test helpers strip the tracks out of the upload,
// and then post them via the processing `tracks-and-tags` endpoint (the same path the real processing
// pipeline uses).  The helpers here convert from the upload metadata format into that endpoint's format.

interface UploadPrediction {
  tag?: string;
  confident?: boolean;
  confident_tag?: string;
  confidence?: number;
  model_id?: number;
  model_used?: string;
  name?: string;
  [key: string]: unknown;
}

interface UploadTrack {
  start_s?: number;
  end_s?: number;
  predictions?: UploadPrediction[];
  [key: string]: unknown;
}

interface UploadMetadata {
  algorithm?: object;
  models?: { id: number; name: string }[];
  tracks?: UploadTrack[];
  [key: string]: unknown;
}

// NOTE: The tracks-and-tags request schema has `additionalProperties: false`, so only pass through
//  fields it knows about.
const TRACK_KEYS = [
  "tracker_version",
  "minFreq",
  "maxFreq",
  "scale",
  "tracking_score",
  "num_frames",
  "frame_start",
  "frame_end",
  "confidence",
  "message",
  "thumbnail",
];
const POSITION_KEYS = [
  "x",
  "y",
  "width",
  "height",
  "mass",
  "frame_number",
  "pixel_variance",
  "blank",
  "in_trap",
];
const PREDICTION_KEYS = [
  "all_class_confidences",
  "clarity",
  "classify_time",
  "message",
  "model_id",
  "model_used",
  "rat_thresh_version",
  "threshold_used",
  "label",
];

const pick = (obj: Record<string, unknown>, keys: string[]) => {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (obj[key] !== undefined) {
      out[key] = obj[key];
    }
  }
  return out;
};

const modelNameForPrediction = (
  prediction: UploadPrediction,
  models?: { id: number; name: string }[],
): string => {
  if (prediction.name) {
    return prediction.name;
  }
  if (prediction.model_id) {
    const model = (models || []).find((m) => m.id == prediction.model_id);
    return model ? model.name : "unknown";
  }
  if (prediction.model_used) {
    return prediction.model_used;
  }
  return "unknown";
};

// Mirrors the tag selection the API used in `tracksFromMeta` when it created tracks on upload.
const tagForPrediction = (prediction: UploadPrediction): string => {
  if (prediction.confident && prediction.tag) {
    return prediction.tag;
  }
  return prediction.confident_tag || "unidentified";
};

export const hasMetadataTracks = (metadata?: { tracks?: unknown[] }): boolean =>
  !!(metadata && Array.isArray(metadata.tracks) && metadata.tracks.length);

export const metadataTracksToProcessingTracks = (
  suppliedMetadata: { tracks?: unknown[] },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any[] => {
  const metadata = suppliedMetadata as UploadMetadata;
  return (metadata.tracks || []).map((track) => {
    const out: Record<string, unknown> = pick(track, TRACK_KEYS);
    out.start_s = track.start_s || 0;
    out.end_s = track.end_s || 0;
    if (Array.isArray(track.positions)) {
      out.positions = (track.positions as Record<string, unknown>[]).map((p) =>
        pick(p, POSITION_KEYS),
      );
    }
    out.predictions = (track.predictions || []).map((prediction) => {
      const tag = tagForPrediction(prediction);
      return {
        ...pick(prediction, PREDICTION_KEYS),
        name: modelNameForPrediction(prediction, metadata.models),
        tag,
        // NOTE: tracks-and-tags turns non-confident predictions into "unidentified", so we've already
        //  resolved the tag above and mark it confident so it is stored as-is.
        confident: tag !== "unidentified",
        confidence: prediction.confidence ?? 0,
      };
    });
    return out;
  });
};

// Returns a copy of the upload data with `metadata.tracks` removed, leaving the original untouched so
// callers can still build expected results from it.
export const withoutMetadataTracks = <T extends { metadata?: object }>(
  data: T,
): T => {
  if (!data.metadata) {
    return data;
  }
  const metadata = { ...data.metadata } as { tracks?: unknown };
  delete metadata.tracks;
  return { ...data, metadata };
};
