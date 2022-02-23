export const HTTP_AuthorizationError = 401;
export const HTTP_Forbidden = 403;
export const HTTP_BadRequest = 400;
export const HTTP_Unprocessable = 422;
export const HTTP_OK200 = 200;
export const NOT_NULL = -99;
export const NOT_NULL_STRING = NOT_NULL.toString();
export const LATEST_END_USER_AGREEMENT = 3;

//parameter checks - fields we do not check value of by default in 'recording'
export const EXCLUDE_IDS = [
  ".tracks[].TrackTags[].TrackId",
  ".tracks[].tags[].id",
  ".tracks[].id",
  ".rawMimeType",
  //  ".tracks[].filtered",
];

//parameter checks - fields we do not check value of by default in 'recordings'
export const EXCLUDE_IDS_ARRAY = [
  "[].tracks[].TrackTags[].TrackId",
  "[].tracks[].tags[].id",
  "[].tracks[].id",
  "[].rawMimeType",
  //  "[].tracks[].filtered",
];

//Column names in the recording export csv
export const ApiRecordingColumnNames = [
  "Id",
  "Type",
  "Group",
  "Device",
  "Station",
  "Date",
  "Time",
  "Latitude",
  "Longitude",
  "Duration",
  "BatteryPercent",
  "Comment",
  "Track Count",
  "Automatic Track Tags",
  "Human Track Tags",
  "Recording Tags",
  "URL",
  "Cacophony Index",
  "Species Classification",
];

//Tags used on tracks that we do not expect to be filtered
export const unfiltered_tags = [
  "part",
  "human",
  "leporidae",
  "cat",
  "insect",
  "poor tracking",
  "unknown",
  "bird",
  "rabbit",
  "unidentified",
  "rodent",
  "deer",
  "dog",
  "rat",
  "pig",
  "possum",
  "vehicle",
  "hedgehog",
  "other",
  "wallaby",
  "mustelid",
];

// Tags used on tracks that we expect to be filtered.  This is used by the
// createExpectedRecording and createExpectedTrack to set the expected value
// of 'filtered' in API responses and by filter tests
export const filtered_tags = ["false-positive"];
