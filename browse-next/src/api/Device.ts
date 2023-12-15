import CacophonyApi, {
  optionalQueryString,
  unwrapLoadedResource,
} from "@api/api";
import type {
  FetchResult,
  LoadedResource,
  WrappedFetchResult,
} from "@api/types";
import type {
  DeviceId,
  GroupId as ProjectId,
  IsoFormattedDateString,
  LatLng,
} from "@typedefs/api/common";
import type { ApiDeviceResponse, MaskRegionsData } from "@typedefs/api/device";
import type { ScheduleId } from "@typedefs/api/common";
import type {
  DeviceConfigDetail,
  DeviceEvent,
  IsoFormattedString,
} from "@typedefs/api/event";
import type { DeviceEventType } from "@typedefs/api/consts";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import type { ApiTrackResponse } from "@typedefs/api/track";

export const createProxyDevice = (
  projectNameOrId: string,
  deviceName: string
) =>
  CacophonyApi.post(`/api/v1/devices/create-proxy-device`, {
    group: projectNameOrId,
    type: "trailcam",
    deviceName,
  }) as Promise<FetchResult<{ id: DeviceId }>>;

export const deleteDevice = (
  projectNameOrId: string | ProjectId,
  deviceId: DeviceId
) =>
  CacophonyApi.delete(`/api/v1/devices/${deviceId}`, {
    group: projectNameOrId,
  }) as Promise<FetchResult<{ id: DeviceId }>>;

export const getDeviceById = (deviceId: DeviceId) =>
  CacophonyApi.get(`/api/v1/devices/${deviceId}`) as Promise<
    FetchResult<{ device: ApiDeviceResponse }>
  >;

export const getDeviceLocationAtTime = (deviceId: DeviceId, date?: Date) => {
  const params = new URLSearchParams();
  if (date) {
    params.append("at-time", date.toISOString());
  }
  return new Promise((resolve) => {
    (
      CacophonyApi.get(
        `/api/v1/devices/${deviceId}/location${optionalQueryString(params)}`
      ) as Promise<FetchResult<{ location: ApiLocationResponse }>>
    ).then((response) => {
      if (response.success) {
        resolve(response.result.location);
      } else {
        resolve(false);
      }
    });
  }) as Promise<ApiLocationResponse | false>;
};

export interface EventApiParams {
  limit?: number;
  offset?: number;
  type?: DeviceEventType | DeviceEventType[];
  endTime?: IsoFormattedString; // Or in the format YYYY-MM-DD hh:mm:ss
  startTime?: IsoFormattedString;
}

export const getLatestEventsByDeviceId = (
  deviceId: number,
  eventParams?: EventApiParams
) => {
  const params = new URLSearchParams();
  params.append("deviceId", deviceId.toString());
  params.append("latest", true.toString());
  params.append("only-active", false.toString());
  if (eventParams) {
    for (const [key, val] of Object.entries(eventParams)) {
      params.append(key, val.toString());
    }
  }
  return CacophonyApi.get(`/api/v1/events?${params}`) as Promise<
    FetchResult<{ rows: DeviceEvent[] }>
  >;
};

export const getStoppedEvents = (deviceId: DeviceId, startTime: Date) => {
  const params = new URLSearchParams();
  params.append("deviceId", deviceId.toString());
  params.append("only-active", true.toString());
  params.append("startTime", startTime.toISOString());
  params.append("type", "stop-reported");
  return CacophonyApi.get(`/api/v1/events?${params}`) as Promise<
    FetchResult<{ rows: DeviceEvent[] }>
  >;
};

export const getLastStoppedEvent = (deviceId: DeviceId) => {
  const params = new URLSearchParams();
  params.append("deviceId", deviceId.toString());
  params.append("only-active", true.toString());
  params.append("latest", true.toString());
  params.append("limit", "1");
  params.append("type", "stop-reported");
  return CacophonyApi.get(`/api/v1/events?${params}`) as Promise<
    FetchResult<{ rows: DeviceEvent[] }>
  >;
};

export const getEarliestEventAfterTime = (
  deviceId: DeviceId,
  startTime: Date
) => {
  const params = new URLSearchParams();
  params.append("deviceId", deviceId.toString());
  params.append("only-active", true.toString());
  params.append("limit", "1");
  params.append("type", "rpi-power-on");
  params.append("startTime", startTime.toISOString());
  return CacophonyApi.get(`/api/v1/events?${params}`) as Promise<
    FetchResult<{ rows: DeviceEvent[] }>
  >;
};

export const getDeviceVersionInfo = (deviceId: DeviceId) => {
  return new Promise((resolve) => {
    getLatestEventsByDeviceId(deviceId, {
      type: "versionData",
      limit: 1,
    }).then((response) => {
      if (response.success && response.result.rows.length) {
        resolve(response.result.rows[0].EventDetail.details);
      } else {
        resolve(false);
      }
    });
  }) as Promise<Record<string, string> | false>;
};

export const getLocationHistory = (
  deviceId: DeviceId
): Promise<
  LoadedResource<
    { fromDateTime: IsoFormattedDateString; location: ApiLocationResponse }[]
  >
> => {
  return unwrapLoadedResource(
    CacophonyApi.get(`/api/v1/devices/${deviceId}/location-history`) as Promise<
      FetchResult<{
        locations: {
          fromDateTime: IsoFormattedDateString;
          location: ApiLocationResponse;
        }[];
      }>
    >,
    "locations"
  );
};

export const getDeviceConfig = (deviceId: DeviceId) => {
  return new Promise((resolve) => {
    getLatestEventsByDeviceId(deviceId, {
      type: "config",
      limit: 1,
    }).then((response) => {
      if (response.success && response.result.rows.length) {
        resolve(response.result.rows[0].EventDetail.details);
      } else {
        resolve(false);
      }
    });
  }) as Promise<DeviceConfigDetail | false>;
};

export const getLatestStatusRecordingForDevice = (
  deviceId: DeviceId,
  projectId: ProjectId,
  use2SecondRecordings = true
) => {
  return new Promise((resolve) => {
    const params = new URLSearchParams();
    params.append("limit", "1");
    params.append("type", "thermalRaw");
    const where = {
      duration: use2SecondRecordings ? { $gte: 2, $lte: 3 } : { $gte: 2 },
      GroupId: projectId,
      DeviceId: deviceId,
    };
    params.append("where", JSON.stringify(where));
    const response = (
      CacophonyApi.get(`/api/v1/recordings?${params}`) as Promise<
        FetchResult<{ rows: ApiRecordingResponse[] }>
      >
    ).then((response) => {
      if (response.success) {
        if (response.result.rows.length) {
          resolve(response.result.rows[0]);
        } else {
          if (use2SecondRecordings) {
            // 2 Second recording may not be available, get the latest regular recording:
            getLatestStatusRecordingForDevice(deviceId, projectId, false).then(
              resolve
            );
          } else {
            resolve(false);
          }
        }
      } else {
        resolve(false);
      }
    });
  }) as Promise<ApiRecordingResponse | false>;
};

const latestEventDateFromResponse = (
  a: FetchResult<{ rows: DeviceEvent[] }>,
  b: FetchResult<{ rows: DeviceEvent[] }>
): Date | false => {
  let d1;
  let d2;
  if (a.success && a.result.rows.length) {
    d1 = new Date(a.result.rows[0].dateTime);
  }
  if (b.success && b.result.rows.length) {
    d2 = new Date(b.result.rows[0].dateTime);
  }
  if (d1 && d2) {
    return d1 > d2 ? d1 : d2;
  } else if (d1) {
    return d1;
  } else if (d2) {
    return d2;
  }
  return false;
};
export const getDeviceLastPoweredOff = (deviceId: DeviceId) => {
  return new Promise((resolve) => {
    Promise.all(
      ["daytime-power-off", "powered-off"].map((type) =>
        getLatestEventsByDeviceId(deviceId, {
          type: type as DeviceEventType,
          limit: 1,
        })
      )
    ).then(([r1, r2]) => resolve(latestEventDateFromResponse(r1, r2)));
  }) as Promise<any | false>;
};

export const getDeviceLastPoweredOn = (deviceId: DeviceId) => {
  return new Promise((resolve) => {
    Promise.all(
      ["rpi-power-on", "power-on-test"].map((type) =>
        getLatestEventsByDeviceId(deviceId, {
          type: type as DeviceEventType,
          limit: 1,
        })
      )
    ).then(([r1, r2]) => resolve(latestEventDateFromResponse(r1, r2)));
  }) as Promise<any | false>;
};

export const assignScheduleToDevice = (
  deviceId: DeviceId,
  scheduleId: ScheduleId,
  activeAndInactive = false
) => {
  const params = new URLSearchParams();
  const shouldViewAsSuperUser = false; // TODO
  if (!shouldViewAsSuperUser) {
    params.append("view-mode", "user");
  }
  params.append("only-active", (!activeAndInactive).toString());
  return CacophonyApi.post(
    `/api/v1/devices/${deviceId}/assign-schedule?${params}`,
    {
      scheduleId,
    }
  ) as Promise<FetchResult<void>>;
};

export const removeScheduleFromDevice = (
  deviceId: DeviceId,
  scheduleId: ScheduleId,
  activeAndInactive = false
) => {
  const suppressGlobalMessaging = true;
  const params = new URLSearchParams();
  const shouldViewAsSuperUser = false; // TODO
  if (!shouldViewAsSuperUser) {
    params.append("view-mode", "user");
  }
  params.append("only-active", (!activeAndInactive).toString());
  return CacophonyApi.post(
    `/api/v1/devices/${deviceId}/remove-schedule?${params}`,
    {
      scheduleId,
    },
    suppressGlobalMessaging
  ) as Promise<FetchResult<void>>;
};

export const getUniqueTrackTagsForDeviceInProject = (
  deviceId: DeviceId,
  fromDateTime?: Date,
  untilDateTime?: Date
): Promise<LoadedResource<{ path: string; what: string; count: number }[]>> => {
  const params = new URLSearchParams();
  if (fromDateTime) {
    params.append("from-time", fromDateTime.toISOString());
  }
  if (untilDateTime) {
    params.append("until-time", untilDateTime.toISOString());
  }
  return new Promise((resolve, reject) => {
    (
      CacophonyApi.get(
        `/api/v1/devices/${deviceId}/unique-track-tags?${params}`
      ) as Promise<
        FetchResult<{
          trackTags: { path: string; what: string; count: number }[];
        }>
      >
    ).then((result) => {
      if (result.success) {
        resolve(result.result.trackTags.sort((a, b) => b.count - a.count));
      } else {
        resolve(false);
      }
    });
  });
};

export const getTracksWithTagForDeviceInProject = (
  deviceId: DeviceId,
  tag: string,
  fromDateTime?: Date,
  untilDateTime?: Date
): Promise<LoadedResource<ApiTrackResponse[]>> => {
  const params = new URLSearchParams();
  if (fromDateTime) {
    params.append("from-time", fromDateTime.toISOString());
  }
  if (untilDateTime) {
    params.append("until-time", untilDateTime.toISOString());
  }
  return unwrapLoadedResource(
    CacophonyApi.get(
      `/api/v1/devices/${deviceId}/tracks-with-tag/${tag}?${params}`
    ) as Promise<FetchResult<{ tracks: ApiTrackResponse[] }>>,
    "tracks"
  );
};

export const updateReferenceImageForDeviceAtCurrentLocation = (
  deviceId: DeviceId,
  payload: ArrayBuffer
) => {
  //const params = new URLSearchParams();
  // Set the reference image for the location start time?  Or create a new entry for this reference image starting now?
  return CacophonyApi.postBinaryData(
    `/api/v1/devices/${deviceId}/reference-image`,
    payload
  ) as Promise<FetchResult<{ key: string; size: number }>>;
};

export const getReferenceImageForDeviceAtCurrentLocation = (
  deviceId: DeviceId
) => {
  return CacophonyApi.get(
    `/api/v1/devices/${deviceId}/reference-image`
  ) as Promise<FetchResult<any>>;
};

export const getMaskRegionsForDevice = (deviceId: DeviceId, atTime: Date) => {
  const params = new URLSearchParams();
  params.append("at-time", atTime.toISOString().toString());
  const queryString = params.toString();

  return CacophonyApi.get(
    `/api/v1/devices/${deviceId}/mask-regions?${queryString}`
  ) as Promise<FetchResult<MaskRegionsData>>;
};

export const getSettingsForDevice = (deviceId: DeviceId, atTime: Date) => {
  const params = new URLSearchParams();
  params.append("at-time", atTime.toISOString().toString());
  const queryString = params.toString();
  return CacophonyApi.get(
    `/api/v1/devices/${deviceId}/settings?${queryString}`
  ) as Promise<FetchResult<any>>;
};

export const updateMaskRegionsForDevice = (
  deviceId: DeviceId,
  maskRegionsData: MaskRegionsData
) => {
  return CacophonyApi.post(`/api/v1/devices/${deviceId}/mask-regions`, maskRegionsData) as Promise<FetchResult<{ id: DeviceId }>>;
};

export const getReferenceImageForDeviceAtTime = (
  deviceId: DeviceId,
  atTime: Date
) => {
  const params = new URLSearchParams();
  params.append("at-time", atTime.toISOString());
  return CacophonyApi.get(
    `/api/v1/devices/${deviceId}/reference-image?${params}`
  ) as Promise<FetchResult<any>>;
};

export const hasReferenceImageForDeviceAtTime = (
  deviceId: DeviceId,
  atTime: Date
) => {
  const params = new URLSearchParams();
  params.append("at-time", atTime.toISOString());
  // Set the reference image for the location start time?  Or create a new entry for this reference image starting now?
  return CacophonyApi.get(
    `/api/v1/devices/${deviceId}/reference-image/exists?${params}`
  ) as Promise<
    FetchResult<{
      fromDateTime: IsoFormattedDateString;
      untilDateTime?: IsoFormattedDateString;
    }>
  >;
};

export const hasReferenceImageForDeviceAtCurrentLocation = (
  deviceId: DeviceId
) => {
  // Set the reference image for the location start time?  Or create a new entry for this reference image starting now?
  return CacophonyApi.get(
    `/api/v1/devices/${deviceId}/reference-image/exists`
  ) as Promise<
    FetchResult<{
      fromDateTime: IsoFormattedDateString;
      untilDateTime?: IsoFormattedDateString;
    }>
  >;
};
