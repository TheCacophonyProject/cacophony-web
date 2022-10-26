import type { RecordingId, TagId } from "@typedefs/api/common";
import CacophonyApi from "@api/api";
import type { FetchResult, JwtToken } from "@api/types";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import type { ApiTrackTagRequest } from "@typedefs/api/trackTag";
import type { TrackId } from "@typedefs/api/common";
import type { TrackTagId } from "@typedefs/api/common";

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

export const removeTrackTag = (
  id: RecordingId,
  trackId: TrackId,
  trackTagId: TrackTagId
) =>
  CacophonyApi.delete(
    `/api/v1/recordings/${id}/tracks/${trackId}/tags/${trackTagId}`
  ) as Promise<FetchResult<void>>;

export const addRecordingLabel = (id: RecordingId, label: string) =>
  CacophonyApi.post(`/api/v1/recordings/${id}/tags`, {
    tag: {
      detail: label,
      confidence: 0.9,
    },
  }) as Promise<FetchResult<{ tagId: TagId }>>;
export const removeRecordingLabel = (id: RecordingId, tagId: TagId) =>
  CacophonyApi.delete(`/api/v1/recordings/${id}/tags/${tagId}`) as Promise<
    FetchResult<void>
  >;
