import type { RecordingId } from "@typedefs/api/common";
import CacophonyApi from "@api/api";
import type { FetchResult, JwtToken } from "@api/types";
import type { ApiRecordingResponse } from "@typedefs/api/recording";

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

export const getRawRecordingById = (
  id: RecordingId,
  includeDeletedRecordings = false,
  apiToken?: string
) =>
  CacophonyApi.get(
    `/api/v1/recordings/raw/${id}${
      includeDeletedRecordings ? "?deleted=true" : ""
    }`,
    true,
    apiToken
  ) as unknown as Promise<Response>;
