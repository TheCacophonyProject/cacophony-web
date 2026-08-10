import type {
  DeviceId,
  GroupId as ProjectId,
  RecordingId,
  StationId as LocationId,
  TagId,
  TrackId,
  TrackTagId,
} from "../api/common.js";
import {
  ApiRecordingProcessingJob,
  ApiRecordingResponse,
} from "../api/recording.js";
import type { ApiTrackTagRequest } from "../api/trackTag.js";
import {
  RecordingProcessingState,
  RecordingType,
  TagMode,
} from "../api/consts.js";
import type { ApiTrackDataRequest } from "../api/track.js";
import type {
  FetchResult,
  JwtToken,
  LoadedResource,
  TestHandle,
  WrappedFetchResult,
} from "./types.js";
import { DEFAULT_AUTH_ID } from "./types.js";
import { CacophonyApiClient, optionalQueryString } from "./api.js";

import { unwrapLoadedResource } from "./api.js";
import type { ApiRecordingUploadData } from "../api/recording.js";
import type { NonEmptyArray } from "./utils.js";
import { type } from "node:os";
import { MinimalTracksRequestData } from "@typedefs/api/fileProcessing.js";
import { JsonDocument } from "@typedefs/api/event.js";

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
  countOnly?: boolean;

  durationMinSecs?: number;
  durationMaxSecs?: number;

  types?: (RecordingType.ThermalRaw | RecordingType.Audio)[];
}
export interface BulkRecordingsResponse {
  recordings: ApiRecordingResponse[];
  count?: number;
}

const getRecordingById =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
    id: RecordingId,
    includeDeletedRecordings = false,
  ): Promise<LoadedResource<ApiRecordingResponse>> => {
    const params = new URLSearchParams();
    if (includeDeletedRecordings) {
      params.append("deleted", true.toString());
    }
    params.append("requires-signed-url", false.toString());
    return unwrapLoadedResource(
      api.get(authKey, `/api/v1/recordings/${id}?${params}`) as Promise<
        FetchResult<{
          recording: ApiRecordingResponse;
        }>
      >,
      "recording",
    );
  };

const getThumbnail =
  (api: CacophonyApiClient, _authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (recordingId: RecordingId, trackId?: TrackId) => {
    let endPoint = `/api/v1/recordings/${recordingId}/thumbnail`;
    if (trackId) {
      const params = new URLSearchParams();
      params.append("trackId", trackId.toString());
      endPoint = `${endPoint}?${params}`;
    }
    return api.get(null, endPoint) as Promise<FetchResult<Blob>>;
  };

const replaceTrackTag =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
    tag: Omit<ApiTrackTagRequest, "confidence">, // We specify a default for user tags
    recordingId: RecordingId,
    trackId: TrackId,
    automatic = false,
  ) => {
    const body: ApiTrackTagRequest = {
      confidence: !automatic ? 0.9 : 0,
      ...tag,
      automatic,
    };
    return api.post(
      authKey,
      `/api/v1/recordings/${recordingId}/tracks/${trackId}/replace-tag`,
      body,
    ) as Promise<FetchResult<{ trackTagId?: number }>>;
  };

const removeTrackTag =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (id: RecordingId, trackId: TrackId, trackTagId: TrackTagId) =>
    api.delete(
      authKey,
      `/api/v1/recordings/${id}/tracks/${trackId}/tags/${trackTagId}`,
    ) as Promise<FetchResult<void>>;

const createDummyTrack =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (recording: ApiRecordingResponse, track: ApiTrackDataRequest) =>
    api.post(authKey, `/api/v1/recordings/${recording.id}/tracks`, {
      data: {
        ...track,
        tracker_version: "dummy-track",
      },
    }) as Promise<FetchResult<{ trackId: TrackId }>>;

const deleteTrack =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (recording: ApiRecordingResponse, trackId: TrackId) =>
    api.delete(
      authKey,
      `/api/v1/recordings/${recording.id}/tracks/${trackId}?soft-delete=false`,
    ) as Promise<FetchResult<void>>;

const createUserDefinedTrack =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (recording: ApiRecordingResponse, track: ApiTrackDataRequest) =>
    api.post(authKey, `/api/v1/recordings/${recording.id}/tracks`, {
      data: {
        ...track,
      },
    }) as Promise<FetchResult<{ trackId: TrackId }>>;

const addRecordingLabel =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (id: RecordingId, label: string) =>
    api.post(authKey, `/api/v1/recordings/${id}/tags`, {
      tag: {
        detail: label,
        confidence: 0.9,
      },
    }) as Promise<FetchResult<{ tagId: TagId }>>;

const addRecordingNoteLabel =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (id: RecordingId, note: string) =>
    api.post(authKey, `/api/v1/recordings/${id}/tags`, {
      tag: {
        detail: "note",
        comment: note,
        confidence: 0.9,
      },
    }) as Promise<FetchResult<{ tagId: TagId }>>;

const removeRecordingLabel =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (id: RecordingId, tagId: TagId) =>
    api.delete(authKey, `/api/v1/recordings/${id}/tags/${tagId}`) as Promise<
      FetchResult<void>
    >;

const deleteRecording =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (id: RecordingId) =>
    api.delete(authKey, `/api/v1/recordings/${id}`) as Promise<
      FetchResult<void>
    >;

const undeleteRecording =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (id: RecordingId) =>
    api.patch(authKey, `/api/v1/recordings/${id}/undelete`) as Promise<
      FetchResult<void>
    >;

const undeleteRecordings =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (ids: RecordingId[]) =>
    api.patch(authKey, `/api/v1/recordings/undelete`, { ids }) as Promise<
      FetchResult<void>
    >;

const queryRecordingsInProjectNew =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
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
    if (options.countOnly) {
      params.append("count-only", options.countOnly.toString());
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

    // TODO: We need to know if we reached the limit, in which case we can increment the cursor,
    //  or we need to hold onto the pagination value.
    const ABORTABLE = true;
    return api.get(
      authKey,
      `/api/v1/recordings/for-project/${projectId}?${params}`,
      ABORTABLE,
    ) as Promise<FetchResult<{ recordings: ApiRecordingResponse[] }>>;
  };

const getRecordingsForDeviceInProject =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
    deviceIds: DeviceId | DeviceId[],
    projectId: ProjectId,
    tags?: string[],
  ): Promise<LoadedResource<ApiRecordingResponse[]>> =>
    getRecordingsForLocationsAndDevicesInProject(api, authKey)(
      projectId,
      undefined,
      deviceIds,
      tags,
    );

const getRecordingsForLocationsInProject =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
    locationIds: LocationId | LocationId[],
    projectId: ProjectId,
    tags?: string[],
  ): Promise<LoadedResource<ApiRecordingResponse[]>> =>
    getRecordingsForLocationsAndDevicesInProject(api, authKey)(
      projectId,
      locationIds,
      undefined,
      tags,
    );

const getRecordingsForLocationsAndDevicesInProject =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
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
      queryRecordingsInProjectNew(api, authKey)(projectId, options) as Promise<
        WrappedFetchResult<ApiRecordingResponse[]>
      >,
      "recordings",
    );
  };

const getAllRecordingsForProjectBetweenTimes =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  async (
    projectId: ProjectId,
    query: QueryRecordingsOptions,
    progressUpdater: () => void = () => {
      /* empty */
    },
  ): Promise<ApiRecordingResponse[]> => {
    query.limit = 1000;
    const recordings = [];
    let moreRecordingsToLoad = true;
    while (moreRecordingsToLoad) {
      const response = await queryRecordingsInProjectNew(api, authKey)(
        projectId,
        {
          ...query,
          queryIsTimeSensitive: false,
        },
      );
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

const longRunningQuery =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (seconds?: number, succeed?: boolean) => {
    const abortable = true;
    const params = new URLSearchParams();
    if (seconds) {
      params.append("seconds", seconds.toString());
    }
    if (succeed !== undefined) {
      params.append("succeed", succeed.toString());
    }
    return api.get(
      authKey,
      `/api/v1/recordings/long-running-query?${params}`,
      abortable,
    ) as Promise<FetchResult<{ count: number }>>;
  };

const uploadRecordingOnBehalfOfDevice =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
    deviceId: DeviceId,
    data: ApiRecordingUploadData,
    rawFile: ArrayBuffer,
    rawFileName: string,
  ) => {
    const formData = prepareUploadedRecordingData(
      data,
      rawFile,
      rawFileName,
      true,
    );
    return api.post(
      authKey,
      `/api/v1/recordings/device/${deviceId}`,
      formData,
      true,
    ) as Promise<FetchResult<{ recordingId: RecordingId; messages: string[] }>>;
  };

const getMimeTypeFromFileName = (fileName: string): string => {
  const ext = fileName.split(".").pop();
  let mimeType = "application/octet-stream";
  switch (ext) {
    case "mp4":
      mimeType = "video/mp4";
      break;
    case "m4a":
      mimeType = "audio/mp4";
      break;
    case "mp3":
      mimeType = "audio/mpeg";
      break;
    case "cptv":
      mimeType = "application/x-cptv";
      break;
    case "webp":
      mimeType = "image/webp";
      break;
    case "jpg":
    case "jpeg":
      mimeType = "image/jpeg";
      break;
    case "ogg":
      mimeType = "audio/ogg";
      break;
    case "wav":
      mimeType = "audio/wav";
      break;
  }
  return mimeType;
};

const prepareUploadedRecordingData = (
  data: ApiRecordingUploadData,
  rawFile: ArrayBuffer,
  rawFileName: string,
  swapFieldOrder: boolean,
) => {
  const formData = new FormData();
  if (!swapFieldOrder) {
    formData.set("data", JSON.stringify(data));
  }
  if (rawFile && rawFile.byteLength) {
    formData.set(
      "file",
      new Blob([rawFile], { type: getMimeTypeFromFileName(rawFileName) }),
      rawFileName,
    );
  } else {
    throw new Error(`File data for ${rawFileName} not found.`);
  }
  if (swapFieldOrder) {
    formData.set("data", JSON.stringify(data));
  }
  return formData;
};

const uploadRecordingFromDevice =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
    data: ApiRecordingUploadData,
    rawFile: ArrayBuffer,
    rawFileName: string,
    uploadTime?: Date,
  ) => {
    const formData = prepareUploadedRecordingData(
      data,
      rawFile,
      rawFileName,
      false,
    );
    const params = new URLSearchParams();
    if (uploadTime) {
      params.append("at-time", uploadTime.toISOString());
    }
    return api.post(
      authKey,
      `/api/v1/recordings${optionalQueryString(params)}`,
      formData,
      true,
    ) as Promise<FetchResult<{ recordingId: RecordingId; messages: string[] }>>;
  };

const getRawRecording =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (recordingId: RecordingId) => {
    const ABORTABLE = true;
    return api.get(
      authKey,
      `/api/v1/recordings/raw/${recordingId}`,
      ABORTABLE,
    ) as Promise<FetchResult<Blob>>;
  };

const updateResizedTrack =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
    recordingId: RecordingId,
    trackId: TrackId,
    startSeconds: number,
    endSeconds: number,
    minFreqHz: number,
    maxFreqHz: number,
  ) => {
    return api.patch(
      authKey,
      `/api/v1/recordings/${recordingId}/tracks/${trackId}/update-data`,
      {
        data: {
          start_s: startSeconds,
          end_s: endSeconds,
          minFreq: minFreqHz,
          maxFreq: maxFreqHz,
        },
      },
    ) as Promise<FetchResult<void>>;
  };

const getOneRecordingForProcessing =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
    type: RecordingType,
    withStates: NonEmptyArray<RecordingProcessingState>,
    id?: RecordingId,
  ) => {
    const params = new URLSearchParams();
    params.append("type", type);
    for (const state of withStates) {
      params.append("state", state);
    }
    if (id) {
      params.append("id", id.toString());
    }
    return api.get(authKey, `/api/v1/processing/?${params}`, false) as Promise<
      FetchResult<{
        recording: ApiRecordingProcessingJob;
        rawJWT: JwtToken<RecordingId>;
      }>
    >;
  };

const submitProcessingTracksAndTags =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
    recordingId: RecordingId,
    tracksAndTags: MinimalTracksRequestData,
    algorithmId: number,
  ) => {
    return unwrapLoadedResource(
      api.post(authKey, `/api/v1/processing/${recordingId}/tracks-and-tags`, {
        data: tracksAndTags,
        algorithmId,
      }) as Promise<FetchResult<{ trackIds: TrackId[] }>>,
      "trackIds",
    ) as Promise<LoadedResource<TrackId[]>>;
  };

const getAlgorithmId =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (algorithmJson: JsonDocument) => {
    return api.post(authKey, `/api/v1/processing/algorithm`, {
      algorithm: JSON.stringify(algorithmJson),
    }) as Promise<FetchResult<{ algorithmId: number }>>;
  };

const finishProcessingJob =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
    recordingId: RecordingId,
    jobKey: string,
    success: boolean,
    complete: boolean,
    fileHash?: string,
    result?: JsonDocument,
  ) => {
    const payload: {
      id: RecordingId;
      jobKey: string;
      success: boolean;
      complete: boolean;
      fileHash?: string;
      result?: JsonDocument;
    } = {
      id: recordingId,
      jobKey,
      success,
      complete,
    };
    if (fileHash) {
      payload.fileHash = fileHash;
    }
    if (result) {
      payload.result = result;
    }
    return api.put(authKey, `/api/v1/processing`, payload) as Promise<
      FetchResult<unknown>
    >;
  };

const getRecordingWithSignedUrl =
  (api: CacophonyApiClient, _authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (recordingRawJWT: JwtToken<RecordingId>) => {
    const ABORTABLE = true;
    const params = new URLSearchParams();
    params.append("jwt", recordingRawJWT);
    return api.get(null, `/api/v1/signedUrl/?${params}`, ABORTABLE) as Promise<
      FetchResult<Blob>
    >;
  };

export default (api: CacophonyApiClient) => {
  return {
    getRecordingById: getRecordingById(api),
    getRecordingWithSignedUrl: getRecordingWithSignedUrl(api),
    replaceTrackTag: replaceTrackTag(api),
    removeTrackTag: removeTrackTag(api),
    createDummyTrack: createDummyTrack(api),
    deleteTrack: deleteTrack(api),
    createUserDefinedTrack: createUserDefinedTrack(api),
    addRecordingLabel: addRecordingLabel(api),
    addRecordingNoteLabel: addRecordingNoteLabel(api),
    removeRecordingLabel: removeRecordingLabel(api),
    deleteRecording: deleteRecording(api),
    undeleteRecording: undeleteRecording(api),
    undeleteRecordings: undeleteRecordings(api),
    queryRecordingsInProjectNew: queryRecordingsInProjectNew(api),
    getRecordingsForDeviceInProject: getRecordingsForDeviceInProject(api),
    getRecordingsForLocationsInProject: getRecordingsForLocationsInProject(api),
    getRecordingsForLocationsAndDevicesInProject:
      getRecordingsForLocationsAndDevicesInProject(api),
    getAllRecordingsForProjectBetweenTimes:
      getAllRecordingsForProjectBetweenTimes(api),
    longRunningQuery: longRunningQuery(api),
    uploadRecordingOnBehalfOfDevice: uploadRecordingOnBehalfOfDevice(api),
    getRawRecording: getRawRecording(api),
    updateResizedTrack: updateResizedTrack(api),
    getThumbnail: getThumbnail(api),
    getOneRecordingForProcessing: getOneRecordingForProcessing(api),
    submitProcessingTracksAndTags: submitProcessingTracksAndTags(api),
    finishProcessingJob: finishProcessingJob(api),
    getAlgorithmId: getAlgorithmId(api),
    withAuth: (authKey: TestHandle) => ({
      getRecordingById: getRecordingById(api, authKey),
      getRecordingWithSignedUrl: getRecordingWithSignedUrl(api, authKey),
      getThumbnail: getThumbnail(api, authKey),
      replaceTrackTag: replaceTrackTag(api, authKey),
      removeTrackTag: removeTrackTag(api, authKey),
      createDummyTrack: createDummyTrack(api, authKey),
      deleteTrack: deleteTrack(api, authKey),
      createUserDefinedTrack: createUserDefinedTrack(api, authKey),
      addRecordingLabel: addRecordingLabel(api, authKey),
      addRecordingNoteLabel: addRecordingNoteLabel(api, authKey),
      removeRecordingLabel: removeRecordingLabel(api, authKey),
      deleteRecording: deleteRecording(api, authKey),
      undeleteRecording: undeleteRecording(api, authKey),
      undeleteRecordings: undeleteRecordings(api, authKey),
      queryRecordingsInProjectNew: queryRecordingsInProjectNew(api, authKey),
      getRecordingsForDeviceInProject: getRecordingsForDeviceInProject(
        api,
        authKey,
      ),
      getRecordingsForLocationsInProject: getRecordingsForLocationsInProject(
        api,
        authKey,
      ),
      getRecordingsForLocationsAndDevicesInProject:
        getRecordingsForLocationsAndDevicesInProject(api, authKey),
      getAllRecordingsForProjectBetweenTimes:
        getAllRecordingsForProjectBetweenTimes(api, authKey),
      longRunningQuery: longRunningQuery(api, authKey),
      uploadRecordingOnBehalfOfDevice: uploadRecordingOnBehalfOfDevice(
        api,
        authKey,
      ),
      uploadRecordingFromDevice: uploadRecordingFromDevice(api, authKey),
      getRawRecording: getRawRecording(api, authKey),
      updateResizedTrack: updateResizedTrack(api, authKey),
      getOneRecordingForProcessing: getOneRecordingForProcessing(api, authKey),
      submitProcessingTracksAndTags: submitProcessingTracksAndTags(
        api,
        authKey,
      ),
      getAlgorithmId: getAlgorithmId(api, authKey),
      finishProcessingJob: finishProcessingJob(api, authKey),
    }),
  };
};
