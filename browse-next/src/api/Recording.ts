import type {
  DeviceId,
  GroupId as ProjectId,
  RecordingId,
  StationId as LocationId,
  TagId,
  TrackId,
  TrackTagId,
} from "@typedefs/api/common";
import CacophonyApi, { unwrapLoadedResource } from "@api/api";
import type {
  FetchResult,
  LoadedResource,
  WrappedFetchResult,
} from "@api/types";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import type { ApiTrackTagRequest } from "@typedefs/api/trackTag";
import { RecordingType, TagMode } from "@typedefs/api/consts.ts";
import type {
  ApiTrackDataRequest,
  ApiTrackResponse,
} from "@typedefs/api/track";

export const getRecordingById = (
  id: RecordingId,
  includeDeletedRecordings = false
): Promise<LoadedResource<ApiRecordingResponse>> => {
  const params = new URLSearchParams();
  if (includeDeletedRecordings) {
    params.append("deleted", true.toString());
  }
  params.append("requires-signed-url", false.toString());
  return unwrapLoadedResource(
    CacophonyApi.get(`/api/v1/recordings/${id}?${params}`) as Promise<
      FetchResult<{
        recording: ApiRecordingResponse;
      }>
    >,
    "recording"
  );
};

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

export const createDummyTrack = (
  recording: ApiRecordingResponse,
  track: ApiTrackDataRequest
) =>
  CacophonyApi.post(`/api/v1/recordings/${recording.id}/tracks`, {
    data: {
      ...track,
      tracker_version: "dummy-track",
    },
  }) as Promise<FetchResult<{ trackId: TrackId }>>;

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

export const deleteRecording = (id: RecordingId) =>
  CacophonyApi.delete(`/api/v1/recordings/${id}`) as Promise<FetchResult<void>>;

interface QueryRecordingsOptions {
  devices?: DeviceId[];
  locations?: LocationId[];
  tags?: string[];
  fromDateTime?: Date;
  untilDateTime?: Date;
  limit?: number;
  tagMode?: TagMode;

  durationMinSecs?: number;
  durationMaxSecs?: number;

  types?: (
    | RecordingType.TrailCamImage
    | RecordingType.TrailCamVideo
    | RecordingType.ThermalRaw
    | RecordingType.Audio
  )[];

  countAll?: boolean;
}

export interface BulkRecordingsResponse {
  rows: ApiRecordingResponse[];
  limit: number;
  count: number;
}

export const queryRecordingsInProject = (
  projectId: ProjectId,
  options: QueryRecordingsOptions
): Promise<FetchResult<BulkRecordingsResponse>> => {
  // FIXME: Implement guard on types

  const params = new URLSearchParams();
  if (options.limit) {
    params.append("limit", options.limit.toString());
  }
  if (options.tags) {
    params.append("tags", JSON.stringify(options.tags));
  }
  const where: any = {
    GroupId: projectId,
  };
  if (options.devices) {
    where.DeviceId = options.devices;
  }
  if (options.locations) {
    where.StationId = options.locations;
  }
  if (options.fromDateTime) {
    where.recordingDateTime = where.recordingDateTime || {};
    where.recordingDateTime["$gte"] = options.fromDateTime.toISOString();
  }
  if (options.untilDateTime) {
    where.recordingDateTime = where.recordingDateTime || {};
    where.recordingDateTime["$lte"] = options.untilDateTime.toISOString();
  }
  if (!options.durationMinSecs) {
    options.durationMinSecs = 2.5; // Make sure we ignore status recordings
  }

  where.duration = where.duration || {};
  where.duration["$gte"] = options.durationMinSecs;
  if (options.durationMaxSecs) {
    where.duration["$lte"] = Math.max(
      options.durationMaxSecs,
      options.durationMinSecs
    );
  }

  // Do we want this, or do we want to show processing recordings?
  // params.append("processingState", RecordingProcessingState.Finished);

  // TODO: We might want to count-all the first time.
  params.append("countAll", (options.countAll || false).toString());
  params.append("tagMode", options.tagMode || TagMode.Any);
  if (options.tagMode && options.tagMode !== TagMode.Any) {
    params.append("filterModel", "Master");
  }
  params.append("limit", (options.limit && options.limit.toString()) || "30");

  // TODO: We need to know if we reached the limit, in which case we can increment the cursor,
  //  or we need to hold onto the pagination value.

  if (Object.values(where).length) {
    params.append("where", JSON.stringify(where));
  }
  //return unwrapLoadedResource(
  return CacophonyApi.get(`/api/v1/recordings?${params}`) as Promise<
    FetchResult<{ rows: ApiRecordingResponse[]; limit: number; count: number }>
  >;
  //"rows"
  //);
};

export const getRecordingsForDeviceInProject = (
  deviceIds: DeviceId | DeviceId[],
  projectId: ProjectId,
  tags?: string[]
): Promise<LoadedResource<ApiRecordingResponse[]>> =>
  getRecordingsForLocationsAndDevicesInProject(
    projectId,
    undefined,
    deviceIds,
    tags
  );

export const getRecordingsForLocationsInProject = (
  locationIds: LocationId | LocationId[],
  projectId: ProjectId,
  tags?: string[]
): Promise<LoadedResource<ApiRecordingResponse[]>> =>
  getRecordingsForLocationsAndDevicesInProject(
    projectId,
    locationIds,
    undefined,
    tags
  );

export const getRecordingsForLocationsAndDevicesInProject = (
  projectId: ProjectId,
  locationIds?: LocationId | LocationId[],
  deviceIds?: DeviceId | DeviceId[],
  tags?: string[]
): Promise<LoadedResource<ApiRecordingResponse[]>> => {
  const options: QueryRecordingsOptions = {
    limit: 100,
  };
  if (locationIds) {
    options.locations = Array.isArray(locationIds)
      ? locationIds
      : [locationIds];
  }
  if (deviceIds) {
    options.devices = Array.isArray(deviceIds) ? deviceIds : [deviceIds];
  }
  if (tags) {
    options.tagMode = TagMode.Tagged;
    options.tags = tags;
  }
  return unwrapLoadedResource(
    queryRecordingsInProject(projectId, options) as Promise<
      WrappedFetchResult<ApiRecordingResponse[]>
    >,
    "rows"
  );
};

export const longRunningQuery = (seconds?: number, succeed?: boolean) => {
  const abortable = true;
  const params = new URLSearchParams();
  if (seconds) {
    params.append("seconds", seconds.toString());
  }
  if (succeed !== undefined) {
    params.append("succeed", succeed.toString());
  }
  return CacophonyApi.get(
    `/api/v1/recordings/long-running-query?${params}`,
    abortable
  ) as Promise<FetchResult<{ count: number }>>;
};

export const uploadRecording = (
  deviceId: DeviceId,
  data: { fileHash: string },
  rawFile: ArrayBuffer,
  rawFileName: string,
  derivedFile?: ArrayBuffer,
  derivedFileName?: string,
  thumbFile?: ArrayBuffer,
  thumbFileName?: string
) => {
  const formData = new FormData();
  formData.set("data", JSON.stringify(data));
  formData.set("file", new Blob([rawFile]), rawFileName);
  if (derivedFile && derivedFileName) {
    formData.set("derived", new Blob([derivedFile]), derivedFileName);
  }
  if (thumbFile && thumbFileName) {
    formData.set("thumb", new Blob([thumbFile]), thumbFileName);
  }
  return CacophonyApi.postMultipartFormData(
    `/api/v1/recordings/device/${deviceId}`,
    formData,
    true
  ) as Promise<FetchResult<{ recordingId: RecordingId; messages: string[] }>>;
};
