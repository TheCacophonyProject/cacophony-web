import type { RecordingId } from "@typedefs/api/common";
import CacophonyApi from "@api/api";
import type { FetchResult, JwtToken } from "@api/types";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import type { ApiTrackTagRequest } from "@typedefs/api/trackTag";
import type { TrackId } from "@typedefs/api/common";

export const getRecordingById = (
  id: RecordingId,
  includeDeletedRecordings = false
) =>
  CacophonyApi.get(
    `/api/v1/recordings/${id}${includeDeletedRecordings ? "?deleted=true" : ""}`
  ) as Promise<
    FetchResult<{
      recording: ApiRecordingResponse;
      rawSize?: number;
      fileSize?: number;
      downloadFileJWT?: JwtToken<RecordingId>;
      downloadRawJWT?: JwtToken<RecordingId>;
    }>
  >;

export const replaceTrackTag = (
  tag: ApiTrackTagRequest,
  recordingId: RecordingId,
  trackId: TrackId,
  automatic = false
) => {
  const body: ApiTrackTagRequest = {
    ...tag,
    automatic,
  };
  return CacophonyApi.post(
    `/api/v1/recordings/${recordingId}/tracks/${trackId}/replaceTag`, // TODO - change to replace-tag
    body
  ) as Promise<FetchResult<{ trackTagId?: number }>>;
};
