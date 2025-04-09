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
  includeDeletedRecordings = false,
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
    "recording",
  );
};

export const replaceTrackTag = (
  tag: ApiTrackTagRequest,
  recordingId: RecordingId,
  trackId: TrackId,
  automatic = false,
) => {
  const body: ApiTrackTagRequest = {
    ...tag,
    automatic,
  };
  return CacophonyApi.post(
    `/api/v1/recordings/${recordingId}/tracks/${trackId}/replace-tag`,
    body,
  ) as Promise<FetchResult<{ trackTagId?: number }>>;
};

export const removeTrackTag = (
  id: RecordingId,
  trackId: TrackId,
  trackTagId: TrackTagId,
) =>
  CacophonyApi.delete(
    `/api/v1/recordings/${id}/tracks/${trackId}/tags/${trackTagId}`,
  ) as Promise<FetchResult<void>>;

export const createDummyTrack = (
  recording: ApiRecordingResponse,
  track: ApiTrackDataRequest,
) =>
  CacophonyApi.post(`/api/v1/recordings/${recording.id}/tracks`, {
    data: {
      ...track,
      tracker_version: "dummy-track",
    },
  }) as Promise<FetchResult<{ trackId: TrackId }>>;

export const deleteTrack = (
  recording: ApiRecordingResponse,
  trackId: TrackId,
) =>
  CacophonyApi.delete(
    `/api/v1/recordings/${recording.id}/tracks/${trackId}?soft-delete=false`,
  ) as Promise<FetchResult<void>>;

export const createUserDefinedTrack = (
  recording: ApiRecordingResponse,
  track: ApiTrackDataRequest,
) =>
  CacophonyApi.post(`/api/v1/recordings/${recording.id}/tracks`, {
    data: {
      ...track,
    },
  }) as Promise<FetchResult<{ trackId: TrackId }>>;

export const addRecordingLabel = (id: RecordingId, label: string) =>
  CacophonyApi.post(`/api/v1/recordings/${id}/tags`, {
    tag: {
      detail: label,
      confidence: 0.9,
    },
  }) as Promise<FetchResult<{ tagId: TagId }>>;

export const addRecordingNoteLabel = (id: RecordingId, note: string) =>
  CacophonyApi.post(`/api/v1/recordings/${id}/tags`, {
    tag: {
      detail: "note",
      comment: note,
      confidence: 0.9,
    },
  }) as Promise<FetchResult<{ tagId: TagId }>>;

export const removeRecordingLabel = (id: RecordingId, tagId: TagId) =>
  CacophonyApi.delete(`/api/v1/recordings/${id}/tags/${tagId}`) as Promise<
    FetchResult<void>
  >;

export const deleteRecording = (id: RecordingId) =>
  CacophonyApi.delete(`/api/v1/recordings/${id}`) as Promise<FetchResult<void>>;

export interface QueryRecordingsOptions {
  devices?: DeviceId[];
  locations?: LocationId[];
  taggedWith?: string[];
  labelledWith?: string[];
  fromDateTime?: Date | null;
  untilDateTime?: Date | null;
  limit?: number;
  tagMode?: TagMode;
  includeFilteredFalsePositivesAndNones?: boolean;
  subClassTags?: boolean;
  queryIsTimeSensitive?: boolean;

  durationMinSecs?: number;
  durationMaxSecs?: number;

  types?: (
    | RecordingType.TrailCamImage
    | RecordingType.TrailCamVideo
    | RecordingType.ThermalRaw
    | RecordingType.Audio
  )[];
}

export interface BulkRecordingsResponse {
  recordings: ApiRecordingResponse[];
  count?: number;
}

export const queryRecordingsInProjectNew = (
  projectId: ProjectId,
  options: QueryRecordingsOptions,
): Promise<
  FetchResult<{ recordings: ApiRecordingResponse[]; count?: number }>
> => {
  const params = new URLSearchParams();
  if (options.taggedWith) {
    for (const tag of options.taggedWith) {
      params.append("tagged-with", tag);
    }
  }
  if (options.labelledWith) {
    for (const label of options.labelledWith) {
      params.append("labelled-with", label);
    }
  }
  if (options.devices) {
    for (const deviceId of options.devices) {
      params.append("devices", deviceId.toString());
    }
  }
  if (options.locations) {
    for (const locationId of options.locations) {
      params.append("locations", locationId.toString());
    }
  }
  if (options.types) {
    for (const type of options.types) {
      params.append("types", type);
    }
  }
  if (options.fromDateTime) {
    params.append("from", options.fromDateTime.toISOString());
  }
  if (options.untilDateTime) {
    params.append("until", options.untilDateTime.toISOString());
  }
  if (options.limit) {
    params.append("max-results", options.limit.toString());
  }
  params.append("duration", "0");
  // Do we want this, or do we want to show processing recordings?
  // params.append("processingState", RecordingProcessingState.Finished);

  // TODO: We might want to count-all the first time.
  //params.append("countAll", (options.countAll || false).toString());
  params.append("tag-mode", options.tagMode || TagMode.Any);
  // if (options.tagMode && options.tagMode !== TagMode.Any) {
  //   params.append("filterModel", "Master");
  // }
  //params.append("limit", (options.limit && options.limit.toString()) || "30");
  if (options.includeFilteredFalsePositivesAndNones) {
    params.append("include-false-positives", true.toString());
  }
  if (!options.subClassTags) {
    params.append("sub-class-tags", false.toString());
  }
  if (options.queryIsTimeSensitive) {
    // For the front-end, we want to return early with any results to appear responsive.
    // For exports, we don't care as much.
    params.append("time-sensitive", true.toString());
  }
  console.log("API params", params.toString());

  // TODO: We need to know if we reached the limit, in which case we can increment the cursor,
  //  or we need to hold onto the pagination value.
  //return unwrapLoadedResource(
  const ABORTABLE = true;
  return CacophonyApi.get(
    `/api/v1/recordings/for-project/${projectId}?${params}`,
    ABORTABLE,
  ) as Promise<FetchResult<{ recordings: ApiRecordingResponse[] }>>;
  //"rows"
  //);
};

export const getRecordingsForDeviceInProject = (
  deviceIds: DeviceId | DeviceId[],
  projectId: ProjectId,
  tags?: string[],
): Promise<LoadedResource<ApiRecordingResponse[]>> =>
  getRecordingsForLocationsAndDevicesInProject(
    projectId,
    undefined,
    deviceIds,
    tags,
  );

export const getRecordingsForLocationsInProject = (
  locationIds: LocationId | LocationId[],
  projectId: ProjectId,
  tags?: string[],
): Promise<LoadedResource<ApiRecordingResponse[]>> =>
  getRecordingsForLocationsAndDevicesInProject(
    projectId,
    locationIds,
    undefined,
    tags,
  );

export const getRecordingsForLocationsAndDevicesInProject = (
  projectId: ProjectId,
  locationIds?: LocationId | LocationId[],
  deviceIds?: DeviceId | DeviceId[],
  tags?: string[],
): Promise<LoadedResource<ApiRecordingResponse[]>> => {
  const options: QueryRecordingsOptions = {
    limit: 100,
    includeFilteredFalsePositivesAndNones: true,
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
    options.taggedWith = tags;
  }
  return unwrapLoadedResource(
    queryRecordingsInProjectNew(projectId, options) as Promise<
      WrappedFetchResult<ApiRecordingResponse[]>
    >,
    "recordings",
  );
};

export const getAllRecordingsForProjectBetweenTimes = async (
  projectId: ProjectId,
  query: QueryRecordingsOptions,
  progressUpdater: () => void,
): Promise<ApiRecordingResponse[]> => {
  query.limit = 1000;
  const recordings = [];
  let moreRecordingsToLoad = true;
  while (moreRecordingsToLoad) {
    const response = await queryRecordingsInProjectNew(projectId, {
      ...query,
      queryIsTimeSensitive: false,
    });
    if (response.success) {
      const result = response.result;
      recordings.push(...result.recordings);
      moreRecordingsToLoad = result.recordings.length !== 0;
      // TODO: Show progress bar based on a linear interpolation of start vs end time.
      if (recordings.length) {
        query.untilDateTime = new Date(
          recordings[recordings.length - 1].recordingDateTime,
        );
        query.untilDateTime = new Date(query.untilDateTime.getTime() - 1000);
      }
      progressUpdater();
    }
  }
  return recordings;
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
    abortable,
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
  thumbFileName?: string,
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
    true,
  ) as Promise<FetchResult<{ recordingId: RecordingId; messages: string[] }>>;
};

export const getRawRecording = async (recordingId: RecordingId) => {
  const ABORTABLE = true;
  return CacophonyApi.get(
    `/api/v1/recordings/raw/${recordingId}`,
    ABORTABLE,
  ) as Promise<FetchResult<Blob>>;
};
