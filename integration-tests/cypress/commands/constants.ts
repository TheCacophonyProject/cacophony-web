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
