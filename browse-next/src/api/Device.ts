import CacophonyApi, {
  optionalQueryString,
  unwrapLoadedResource,
} from "@api/api";
import type { FetchResult, LoadedResource } from "@api/types";
import type {
  DeviceId,
  GroupId as ProjectId,
  IsoFormattedDateString,
  LatLng,
} from "@typedefs/api/common";
import type {
  ApiDeviceHistorySettings,
  ApiDeviceResponse,
  ApiMaskRegionsData,
} from "@typedefs/api/device";
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

export const getDeviceById = (
  deviceId: DeviceId,
  activeAndInactive = false
) => {
  const params = new URLSearchParams();
  if (activeAndInactive) {
    params.append("only-active", false.toString());
  }
  return CacophonyApi.get(
    `/api/v1/devices/${deviceId}${optionalQueryString(params)}`
  ) as Promise<FetchResult<{ device: ApiDeviceResponse }>>;
};

export const getDeviceLocationAtTime = (
  deviceId: DeviceId,
  activeAndInactiveDevices: boolean = false,
  date?: Date
) => {
  const params = new URLSearchParams();
  if (date) {
    params.append("at-time", date.toISOString());
  }
  if (activeAndInactiveDevices) {
    params.append("only-active", false.toString());
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
  type?: DeviceEventType | DeviceEventType[] | string | string[];
  endTime?: IsoFormattedString; // Or in the format YYYY-MM-DD hh:mm:ss
  startTime?: IsoFormattedString;
}

export const getKnownEventTypes = () =>
  CacophonyApi.get(`/api/v1/events/event-types`) as Promise<
    FetchResult<{ eventTypes: string[] }>
  >;

export const getKnownEventTypesForDeviceInLastMonth = (deviceId: DeviceId) =>
  CacophonyApi.get(
    `/api/v1/events/event-types/for-device/${deviceId}`
  ) as Promise<FetchResult<{ eventTypes: string[] }>>;

export const getLatestEventsByDeviceId = (
  deviceId: number,
  eventParams?: EventApiParams
) => {
  const params = new URLSearchParams();
  params.append("deviceId", deviceId.toString());
  params.append("latest", true.toString());
  params.append("only-active", false.toString());
  params.append("include-count", false.toString());
  if (eventParams) {
    for (const [key, val] of Object.entries(eventParams)) {
      if (Array.isArray(val)) {
        for (const item of val) {
          params.append(key, item.toString());
        }
      } else {
        params.append(key, val.toString());
      }
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
  params.append("include-count", false.toString());
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
  params.append("include-count", false.toString());
  params.append("type", "stop-reported");
  return CacophonyApi.get(`/api/v1/events?${params}`) as Promise<
    FetchResult<{ rows: DeviceEvent[] }>
  >;
};

export const getDeviceNodeGroup = (deviceId: DeviceId) => {
  return new Promise((resolve) => {
    getLatestEventsByDeviceId(deviceId, {
      type: "salt-update",
      limit: 1,
    }).then((response) => {
      debugger;
      if (response.success && response.result.rows.length) {
        resolve(
          response.result.rows[0].EventDetail.details.nodegroup ||
            "unknown channel"
        );
      } else {
        resolve(false);
      }
    });
  }) as Promise<string | false>;
};

export const getDeviceModel = async (deviceId: DeviceId) => {
  try {
    const nodegroup = await getDeviceNodeGroup(deviceId);
    if (nodegroup) {
      const model = nodegroup.includes("tc2")
        ? "tc2"
        : nodegroup.includes("pi")
        ? "pi"
        : null;
      if (model !== null) {
        return model;
      }
    }
    const model = await getLatestEventsByDeviceId(deviceId, {
      type: "versionData",
      limit: 1,
    }).then((response) => {
      if (response.success && response.result.rows.length) {
        return response.result.rows[0].EventDetail.details["tc2-agent"]
          ? "tc2"
          : "pi";
      } else {
        return null;
      }
    });
    return model;
  } catch (e) {
    return null;
  }
};

export interface BatteryInfoEvent {
  dateTime: IsoFormattedString | Date;
  voltage: number | null;
  battery: number | null;
  batteryType: "unknown" | "lime" | "mains" | "li-ion";
}

export const getBatteryInfo = (
  deviceId: DeviceId,
  startTime: Date,
  limit = 300,
  stopAfterNumResults: number | null = null
) => {
  // There may be a limit of 100 events, so make sure we get as far back to startTime as possible.
  let untilDateTime = new Date();
  let fromDateTime = new Date(startTime);
  const batteryEpoch = new Date("2024-06-20 16:27:25.312 +1200");
  if (batteryEpoch > fromDateTime) {
    fromDateTime = batteryEpoch;
  }
  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async (resolve) => {
    let stillHasEvents = true;
    const events: BatteryInfoEvent[] = [];
    while (
      stillHasEvents &&
      (stopAfterNumResults === null || events.length !== stopAfterNumResults)
    ) {
      const params = new URLSearchParams();
      params.append("deviceId", deviceId.toString());
      params.append("only-active", true.toString());
      params.append("startTime", fromDateTime.toISOString());
      params.append("endTime", untilDateTime.toISOString());
      params.append("include-count", false.toString());
      params.append("limit", String(limit));
      params.append("type", "rpiBattery");
      params.append("latest", true.toString());
      const response = (await CacophonyApi.get(
        `/api/v1/events?${params}`
      )) as unknown as FetchResult<{ rows: DeviceEvent[] }>;
      if (response && response.success) {
        const eventsSubset = response.result.rows.map(
          ({
            dateTime,
            EventDetail: {
              details: { voltage, battery, batteryType },
            },
          }) => ({
            dateTime,
            voltage,
            battery,
            batteryType,
          })
        );
        events.push(...eventsSubset);
        if (eventsSubset.length === 0) {
          stillHasEvents = false;
        } else {
          untilDateTime = new Date(events[events.length - 1].dateTime);
        }
      } else {
        if (!response) {
          // We aborted the request
          resolve(null);
        }
        stillHasEvents = false;
      }
    }
    if (events.length) {
      resolve(events);
    } else {
      resolve(false);
    }
  }) as Promise<BatteryInfoEvent[] | false | null>;
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
  params.append("include-count", false.toString());
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

export const getDeviceLatestVersionInfo = async () => {
  return unwrapLoadedResource(
    CacophonyApi.get(`/api/v1/devices/latest-software-versions`) as Promise<
      FetchResult<{
        versions: Record<string, Record<string, Record<string, string>>>;
      }>
    >,
    "versions"
  ) as Promise<Record<string, Record<string, Record<string, string>>>>;
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

export const getActiveDevicesForCurrentUser = (): Promise<
  LoadedResource<ApiDeviceResponse[]>
> =>
  unwrapLoadedResource(
    CacophonyApi.get("/api/v1/devices?only-active=true") as Promise<
      FetchResult<{ devices: ApiDeviceResponse[] }>
    >,
    "devices"
  );

export const getDeviceConfig = (deviceId: DeviceId) => {
  return new Promise((resolve) => {
    getLatestEventsByDeviceId(deviceId, {
      type: "config",
      limit: 1,
    }).then((response) => {
      if (response && response.success && response.result.rows.length) {
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
    params.append("max-results", "1");
    params.append("types", "thermal");
    params.append("include-false-positives", true.toString());
    if (use2SecondRecordings) {
      params.append("status-recordings", true.toString());
    }
    (
      CacophonyApi.get(
        `/api/v1/recordings/for-project/${projectId}/${optionalQueryString(
          params
        )}`
      ) as Promise<FetchResult<{ recordings: ApiRecordingResponse[] }>>
    ).then((response) => {
      if (response.success) {
        if (response.result.recordings.length) {
          resolve(response.result.recordings[0]);
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
  }) as Promise<Date | false>;
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
  }) as Promise<Date | false>;
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
  return new Promise((resolve, _reject) => {
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
  const params = new URLSearchParams();
  return CacophonyApi.get(
    `/api/v1/devices/${deviceId}/reference-image${optionalQueryString(params)}`
  ) as Promise<FetchResult<Blob>>;
};

export const getMaskRegionsForDevice = (
  deviceId: DeviceId,
  activeAndInactive = true,
  atTime?: Date
) => {
  const params = new URLSearchParams();
  params.append("at-time", (atTime || new Date()).toISOString());
  if (!activeAndInactive) {
    params.append("only-active", true.toString());
  }
  const queryString = params.toString();

  return CacophonyApi.get(
    `/api/v1/devices/${deviceId}/mask-regions?${queryString}`
  ) as Promise<FetchResult<ApiMaskRegionsData>>;
};

export const getSettingsForDevice = (
  deviceId: DeviceId,
  atTime?: Date,
  lastSynced = false
) => {
  const params = new URLSearchParams();
  params.append("at-time", (atTime || new Date()).toISOString());
  if (lastSynced) {
    params.append("latest-synced", true.toString());
  }
  const queryString = params.toString();
  return CacophonyApi.get(
    `/api/v1/devices/${deviceId}/settings?${queryString}`
  ) as Promise<
    FetchResult<{
      settings: ApiDeviceHistorySettings | null;
      location: LatLng;
    }>
  >;
};

export const updateDeviceSettings = (
  deviceId: DeviceId,
  settings: ApiDeviceHistorySettings
) => {
  return CacophonyApi.post(`/api/v1/devices/${deviceId}/settings`, {
    settings,
  }) as Promise<FetchResult<{ settings: ApiDeviceHistorySettings }>>;
};

export const updateMaskRegionsForDevice = (
  deviceId: DeviceId,
  maskRegionsData: ApiMaskRegionsData
) => {
  return CacophonyApi.post(
    `/api/v1/devices/${deviceId}/mask-regions`,
    maskRegionsData
  ) as Promise<FetchResult<void>>;
};

export const getReferenceImageForDeviceAtTime = (
  deviceId: DeviceId,
  atTime: Date,
  activeAndInactive: boolean = false
) => {
  const params = new URLSearchParams();
  params.append("at-time", atTime.toISOString());
  if (!activeAndInactive) {
    params.append("only-active", true.toString());
  }
  return CacophonyApi.get(
    `/api/v1/devices/${deviceId}/reference-image?${optionalQueryString(params)}`
  ) as Promise<FetchResult<Blob>>;
};

export const hasReferenceImageForDeviceAtTime = (
  deviceId: DeviceId,
  atTime: Date,
  activeAndInactive: boolean = false
) => {
  const params = new URLSearchParams();
  params.append("at-time", atTime.toISOString());
  if (!activeAndInactive) {
    params.append("only-active", true.toString());
  }
  // Set the reference image for the location start time?  Or create a new entry for this reference image starting now?
  return CacophonyApi.get(
    `/api/v1/devices/${deviceId}/reference-image/exists?${optionalQueryString(
      params
    )}`
  ) as Promise<
    FetchResult<{
      fromDateTime: IsoFormattedDateString;
      untilDateTime?: IsoFormattedDateString;
    }>
  >;
};

export const hasReferenceImageForDeviceAtCurrentLocation = (
  deviceId: DeviceId,
  activeAndInactive: boolean = false
) => {
  const params = new URLSearchParams();
  if (!activeAndInactive) {
    params.append("only-active", true.toString());
  }
  // Set the reference image for the location start time?  Or create a new entry for this reference image starting now?
  return CacophonyApi.get(
    `/api/v1/devices/${deviceId}/reference-image/exists${optionalQueryString(
      params
    )}`
  ) as Promise<
    FetchResult<{
      fromDateTime: IsoFormattedDateString;
      untilDateTime?: IsoFormattedDateString;
    }>
  >;
};

export const getLastKnownDeviceBatteryLevel = (
  deviceId: DeviceId
): Promise<BatteryInfoEvent | false | null> => {
  const last25Hours = new Date();
  last25Hours.setHours(last25Hours.getHours() - 25);
  return new Promise((resolve) => {
    getBatteryInfo(deviceId, last25Hours, 1, 1).then((result) => {
      if (result === null) {
        resolve(null);
      } else if (result === false || result.length === 0) {
        resolve(false);
      }
      resolve((result as BatteryInfoEvent[])[0]);
    });
  });
};
