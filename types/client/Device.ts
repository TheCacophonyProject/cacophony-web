import type {
  DeviceId,
  GroupId as ProjectId,
  IsoFormattedDateString,
  LatLng,
  ScheduleId,
} from "@typedefs/api/common";
import type {
  ApiDeviceHistorySettings,
  ApiDeviceResponse,
  ApiMaskRegionsData,
} from "@typedefs/api/device";
import type {
  DeviceConfigDetail,
  DeviceEvent,
  IsoFormattedString,
} from "@typedefs/api/event";
import {
  type DeviceEventType,
  DeviceType,
  type DeviceTypeUnion,
} from "@typedefs/api/consts";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import type { ApiTrackResponse } from "@typedefs/api/track";
import { type CacophonyApiClient, optionalQueryString, unwrapLoadedResource } from "./api";
import {
  type BatteryInfoEvent,
  DEFAULT_AUTH_ID,
  type FetchResult,
  type LoadedResource,
  type LoggedInDeviceCredentials,
  type TestHandle
} from "./types";

const createProxyDevice = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  projectNameOrId: string,
  deviceName: string,
) =>
  api.post(authKey, `/api/v1/devices/create-proxy-device`, {
    group: projectNameOrId,
    type: "trailcam",
    deviceName,
  }) as Promise<FetchResult<{ id: DeviceId }>>;

const deleteDevice = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  projectNameOrId: string | ProjectId,
  deviceId: DeviceId,
) =>
  api.delete(authKey, `/api/v1/devices/${deviceId}`, {
    group: projectNameOrId,
  }) as Promise<FetchResult<{ id: DeviceId }>>;

const setDeviceActive = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  projectNameOrId: string | ProjectId,
  deviceId: DeviceId,
) => {
  return api.post(authKey, `/api/v1/devices/${deviceId}/reactivate`, {
    group: projectNameOrId,
  }) as Promise<FetchResult<{ id: DeviceId }>>;
};

const getDeviceById = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  deviceId: DeviceId,
  activeAndInactive = false,
) => {
  const params = new URLSearchParams();
  if (activeAndInactive) {
    params.append("only-active", false.toString());
  }
  return api.get(
    authKey, `/api/v1/devices/${deviceId}${optionalQueryString(params)}`,
  ) as Promise<FetchResult<{ device: ApiDeviceResponse }>>;
};

const getDeviceLocationAtTime = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  deviceId: DeviceId,
  activeAndInactiveDevices: boolean = false,
  date?: Date,
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
      api.get(
       authKey,  `/api/v1/devices/${deviceId}/location${optionalQueryString(params)}`,
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

const getKnownEventTypes = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => () =>
  api.get(authKey, `/api/v1/events/event-types`) as Promise<
    FetchResult<{ eventTypes: string[] }>
  >;

const getKnownEventTypesForDeviceInLastMonth = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (deviceId: DeviceId) =>
  api.get(
    authKey, `/api/v1/events/event-types/for-device/${deviceId}`,
  ) as Promise<FetchResult<{ eventTypes: string[] }>>;

const getLatestEventsByDeviceId = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  deviceId: number,
  eventParams?: EventApiParams,
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
  return api.get(authKey, `/api/v1/events?${params}`) as Promise<
    FetchResult<{ rows: DeviceEvent[] }>
  >;
};

const getStoppedEvents = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (deviceId: DeviceId, startTime: Date) => {
  const params = new URLSearchParams();
  params.append("deviceId", deviceId.toString());
  params.append("only-active", true.toString());
  params.append("include-count", false.toString());
  params.append("startTime", startTime.toISOString());
  params.append("type", "stop-reported");
  return api.get(authKey, `/api/v1/events?${params}`) as Promise<
    FetchResult<{ rows: DeviceEvent[] }>
  >;
};

const getLastStoppedEvent = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (deviceId: DeviceId) => {
  const params = new URLSearchParams();
  params.append("deviceId", deviceId.toString());
  params.append("only-active", true.toString());
  params.append("latest", true.toString());
  params.append("limit", "1");
  params.append("include-count", false.toString());
  params.append("type", "stop-reported");
  return api.get(authKey, `/api/v1/events?${params}`) as Promise<
    FetchResult<{ rows: DeviceEvent[] }>
  >;
};

const getDeviceNodeGroup = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (deviceId: DeviceId) => {
  return new Promise((resolve) => {
    getLatestEventsByDeviceId(api, authKey)(deviceId, {
      type: "salt-update",
      limit: 1,
    }).then((response) => {
      if (response.success && response.result.rows.length) {
        resolve(
          response.result.rows[0].EventDetail.details.nodegroup ||
            "unknown channel",
        );
      } else {
        resolve(false);
      }
    });
  }) as Promise<string | false>;
};

const latestEventDateFromResponse = (
  a: FetchResult<{ rows: DeviceEvent[] }>,
  b: FetchResult<{ rows: DeviceEvent[] }>,
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

const getBatteryInfo = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  deviceId: DeviceId,
  startTime: Date,
  limit = 300,
  stopAfterNumResults: number | null = null,
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
      //params.append("only-active", true.toString());
      params.append("startTime", fromDateTime.toISOString());
      params.append("endTime", untilDateTime.toISOString());
      params.append("include-count", false.toString());
      params.append("limit", String(limit));
      params.append("type", "rpiBattery");
      params.append("latest", true.toString());
      const response = (await api.get(
        authKey, `/api/v1/events?${params}`,
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
          }),
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

const getEarliestEventAfterTime = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  deviceId: DeviceId,
  startTime: Date,
) => {
  const params = new URLSearchParams();
  params.append("deviceId", deviceId.toString());
  params.append("only-active", true.toString());
  params.append("limit", "1");
  params.append("type", "rpi-power-on");
  params.append("include-count", false.toString());
  params.append("startTime", startTime.toISOString());
  return api.get(authKey, `/api/v1/events?${params}`) as Promise<
    FetchResult<{ rows: DeviceEvent[] }>
  >;
};

const getDeviceVersionInfo = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (deviceId: DeviceId) => {
  return new Promise((resolve) => {
    getLatestEventsByDeviceId(api, authKey)(deviceId, {
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

const getDeviceLatestVersionInfo = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => () => {
  return unwrapLoadedResource(
    api.get(authKey, `/api/v1/devices/latest-software-versions`) as Promise<
      FetchResult<{
        versions: Record<string, Record<string, Record<string, string>>>;
      }>
    >,
    "versions",
  ) as Promise<Record<string, Record<string, Record<string, string>>>>;
};

const getLocationHistory = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  deviceId: DeviceId,
): Promise<
  LoadedResource<
    { fromDateTime: IsoFormattedDateString; location: ApiLocationResponse }[]
  >
> => {
  return unwrapLoadedResource(
    api.get(authKey, `/api/v1/devices/${deviceId}/location-history`) as Promise<
      FetchResult<{
        locations: {
          fromDateTime: IsoFormattedDateString;
          location: ApiLocationResponse;
        }[];
      }>
    >,
    "locations",
  );
};

const getActiveDevicesForCurrentUser = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (): Promise<
  LoadedResource<ApiDeviceResponse[]>
> =>
  unwrapLoadedResource(
    api.get(authKey, "/api/v1/devices?only-active=true") as Promise<
      FetchResult<{ devices: ApiDeviceResponse[] }>
    >,
    "devices",
  );

const getDeviceConfig = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (deviceId: DeviceId) => {
  return new Promise((resolve) => {
    getLatestEventsByDeviceId(api, authKey)(deviceId, {
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

const getLatestStatusRecordingForDevice = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  deviceId: DeviceId,
  projectId: ProjectId,
  use2SecondRecordings = true,
) => {
  return new Promise((resolve) => {
    const params = new URLSearchParams();
    params.append("max-results", "1");
    params.append("types", "thermal");
    params.append("include-false-positives", true.toString());
    params.append("devices", deviceId.toString());
    if (use2SecondRecordings) {
      params.append("status-recordings", true.toString());
    }
    (
      api.get(
        authKey, `/api/v1/recordings/for-project/${projectId}/${optionalQueryString(
          params,
        )}`,
      ) as Promise<FetchResult<{ recordings: ApiRecordingResponse[] }>>
    ).then((response) => {
      if (response.success) {
        if (response.result.recordings.length) {
          resolve(response.result.recordings[0]);
        } else {
          if (use2SecondRecordings) {
            // 2 Second recording may not be available, get the latest regular recording:
            getLatestStatusRecordingForDevice(api, authKey)(deviceId, projectId, false).then(
              resolve,
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

const getDeviceLastPoweredOff = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (deviceId: DeviceId) => {
  return new Promise((resolve) => {
    Promise.all(
      ["daytime-power-off", "powered-off"].map((type) =>
        getLatestEventsByDeviceId(api, authKey)(deviceId, {
          type: type as DeviceEventType,
          limit: 1,
        }),
      ),
    ).then(([r1, r2]) => resolve(latestEventDateFromResponse(r1, r2)));
  }) as Promise<Date | false>;
};

const getDeviceLastPoweredOn = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (deviceId: DeviceId) => {
  return new Promise((resolve) => {
    Promise.all(
      ["rpi-power-on", "power-on-test"].map((type) =>
        getLatestEventsByDeviceId(api, authKey)(deviceId, {
          type: type as DeviceEventType,
          limit: 1,
        }),
      ),
    ).then(([r1, r2]) => resolve(latestEventDateFromResponse(r1, r2)));
  }) as Promise<Date | false>;
};

const assignScheduleToDevice = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  deviceId: DeviceId,
  scheduleId: ScheduleId,
  activeAndInactive = false,
) => {
  const params = new URLSearchParams();
  const shouldViewAsSuperUser = false; // TODO
  if (!shouldViewAsSuperUser) {
    params.append("view-mode", "user");
  }
  params.append("only-active", (!activeAndInactive).toString());
  return api.post(
    authKey, `/api/v1/devices/${deviceId}/assign-schedule?${params}`,
    {
      scheduleId,
    },
  ) as Promise<FetchResult<void>>;
};

const removeScheduleFromDevice = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  deviceId: DeviceId,
  scheduleId: ScheduleId,
  activeAndInactive = false,
) => {
  const suppressGlobalMessaging = true;
  const params = new URLSearchParams();
  const shouldViewAsSuperUser = false; // TODO
  if (!shouldViewAsSuperUser) {
    params.append("view-mode", "user");
  }
  params.append("only-active", (!activeAndInactive).toString());
  return api.post(
    authKey, `/api/v1/devices/${deviceId}/remove-schedule?${params}`,
    {
      scheduleId,
    },
    suppressGlobalMessaging,
  ) as Promise<FetchResult<void>>;
};

const getUniqueTrackTagsForDeviceInProject = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  deviceId: DeviceId,
  fromDateTime?: Date,
  untilDateTime?: Date,
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
      api.get(
        authKey, `/api/v1/devices/${deviceId}/unique-track-tags?${params}`,
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

const getTracksWithTagForDeviceInProject = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  deviceId: DeviceId,
  tag: string,
  fromDateTime?: Date,
  untilDateTime?: Date,
): Promise<LoadedResource<ApiTrackResponse[]>> => {
  const params = new URLSearchParams();
  if (fromDateTime) {
    params.append("from-time", fromDateTime.toISOString());
  }
  if (untilDateTime) {
    params.append("until-time", untilDateTime.toISOString());
  }
  return unwrapLoadedResource(
    api.get(
      authKey, `/api/v1/devices/${deviceId}/tracks-with-tag/${tag}?${params}`,
    ) as Promise<FetchResult<{ tracks: ApiTrackResponse[] }>>,
    "tracks",
  );
};

const updateReferenceImageForDeviceAtCurrentLocation = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  deviceId: DeviceId,
  payload: ArrayBuffer,
) => {
  //const params = new URLSearchParams();
  // Set the reference image for the location start time?  Or create a new entry for this reference image starting now?
  return api.post(
    authKey, `/api/v1/devices/${deviceId}/reference-image`,
    payload,
  ) as Promise<FetchResult<{ key: string; size: number }>>;
};

const getReferenceImageForDeviceAtCurrentLocation = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  deviceId: DeviceId,
) => {
  const params = new URLSearchParams();
  return api.get(
    authKey, `/api/v1/devices/${deviceId}/reference-image${optionalQueryString(params)}`,
  ) as Promise<FetchResult<Blob>>;
};

const getMaskRegionsForDevice = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  deviceId: DeviceId,
  activeAndInactive = true,
  atTime?: Date,
) => {
  const params = new URLSearchParams();
  params.append("at-time", (atTime || new Date()).toISOString());
  if (!activeAndInactive) {
    params.append("only-active", true.toString());
  }
  const queryString = params.toString();

  return api.get(
    authKey, `/api/v1/devices/${deviceId}/mask-regions?${queryString}`,
  ) as Promise<FetchResult<ApiMaskRegionsData>>;
};

const getSettingsForDevice = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  deviceId: DeviceId,
  lastSynced = false,
) => {
  const params = new URLSearchParams();
  if (lastSynced) {
    params.append("latest-synced", true.toString());
  }
  const queryString = params.toString();
  return api.get(
    authKey, `/api/v1/devices/${deviceId}/settings?${queryString}`,
  ) as Promise<
    FetchResult<{
      settings: ApiDeviceHistorySettings | null;
      location: LatLng;
    }>
  >;
};

const updateDeviceSettings = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  deviceId: DeviceId,
  settings: ApiDeviceHistorySettings,
) => {
  return api.post(authKey, `/api/v1/devices/${deviceId}/settings`, {
    settings,
  }) as Promise<FetchResult<{ settings: ApiDeviceHistorySettings }>>;
};

const updateMaskRegionsForDevice = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  deviceId: DeviceId,
  maskRegionsData: ApiMaskRegionsData,
) => {
  return api.post(
    authKey,
    `/api/v1/devices/${deviceId}/mask-regions`,
    maskRegionsData,
  ) as Promise<FetchResult<void>>;
};

const getReferenceImageForDeviceAtTime = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  deviceId: DeviceId,
  atTime: Date,
  activeAndInactive: boolean = false,
) => {
  const params = new URLSearchParams();
  params.append("at-time", atTime.toISOString());
  if (!activeAndInactive) {
    params.append("only-active", true.toString());
  }
  return api.get(
    authKey,
    `/api/v1/devices/${deviceId}/reference-image${optionalQueryString(params)}`,
  ) as Promise<FetchResult<Blob>>;
};

const hasReferenceImageForDeviceAtTime = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  deviceId: DeviceId,
  atTime: Date,
  activeAndInactive: boolean = false,
) => {
  const params = new URLSearchParams();
  params.append("at-time", atTime.toISOString());
  if (!activeAndInactive) {
    params.append("only-active", true.toString());
  }
  // Set the reference image for the location start time?  Or create a new entry for this reference image starting now?
  return api.get(
    authKey,
    `/api/v1/devices/${deviceId}/reference-image/exists${optionalQueryString(
      params,
    )}`,
  ) as Promise<
    FetchResult<{
      fromDateTime: IsoFormattedDateString;
      untilDateTime?: IsoFormattedDateString;
    }>
  >;
};

const hasReferenceImageForDeviceAtCurrentLocation = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  deviceId: DeviceId,
  activeAndInactive: boolean = false,
) => {
  const params = new URLSearchParams();
  if (!activeAndInactive) {
    params.append("only-active", true.toString());
  }
  // Set the reference image for the location start time?  Or create a new entry for this reference image starting now?
  return api.get(
    authKey,
    `/api/v1/devices/${deviceId}/reference-image/exists${optionalQueryString(
      params,
    )}`,
  ) as Promise<
    FetchResult<{
      fromDateTime: IsoFormattedDateString;
      untilDateTime?: IsoFormattedDateString;
    }>
  >;
};

const getLastKnownDeviceBatteryLevel = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  deviceId: DeviceId,
): Promise<BatteryInfoEvent | false | null> => {
  const lastThirtyDays = new Date();
  lastThirtyDays.setDate(lastThirtyDays.getDate() - 30);
  return new Promise((resolve) => {
    getBatteryInfo(api, authKey)(deviceId, lastThirtyDays, 1, 1).then((result) => {
      if (result === null) {
        resolve(null);
      } else if (result === false || result.length === 0) {
        resolve(false);
      }
      resolve((result as BatteryInfoEvent[])[0]);
    });
  });
};

const getDeviceModel = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (deviceId: DeviceId) => {
  return api.get(authKey, `/api/v1/devices/${deviceId}/type`) as Promise<
    FetchResult<{ type: DeviceTypeUnion }>
  >;
};

const registerDevice = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (projectName: string, deviceName: string, password: string, deviceType = DeviceType.Unknown) => {
  const payload = {
    deviceName,
    group: projectName,
    password,
    deviceType,
  };
  return api.post(authKey, "/api/v1/devices", payload) as Promise<FetchResult<LoggedInDeviceCredentials>>;
};

export default (api: CacophonyApiClient) => {
  // NOTE: this is a bit tedious, but it makes the type inference work for the return type.
  return {
    createProxyDevice: createProxyDevice(api),
    deleteDevice: deleteDevice(api),
    setDeviceActive: setDeviceActive(api),
    getDeviceById: getDeviceById(api),
    getDeviceLocationAtTime: getDeviceLocationAtTime(api),
    getKnownEventTypes: getKnownEventTypes(api),
    getKnownEventTypesForDeviceInLastMonth: getKnownEventTypesForDeviceInLastMonth(api),
    getLatestEventsByDeviceId: getLatestEventsByDeviceId(api),
    getStoppedEvents: getStoppedEvents(api),
    getLastStoppedEvent: getLastStoppedEvent(api),
    getDeviceNodeGroup: getDeviceNodeGroup(api),
    getBatteryInfo: getBatteryInfo(api),
    getEarliestEventAfterTime: getEarliestEventAfterTime(api),
    getDeviceVersionInfo: getDeviceVersionInfo(api),
    getDeviceLatestVersionInfo: getDeviceLatestVersionInfo(api),
    getLocationHistory: getLocationHistory(api),
    getActiveDevicesForCurrentUser: getActiveDevicesForCurrentUser(api),
    getDeviceConfig: getDeviceConfig(api),
    getLatestStatusRecordingForDevice: getLatestStatusRecordingForDevice(api),
    getDeviceLastPoweredOff: getDeviceLastPoweredOff(api),
    getDeviceLastPoweredOn: getDeviceLastPoweredOn(api),
    assignScheduleToDevice: assignScheduleToDevice(api),
    removeScheduleFromDevice: removeScheduleFromDevice(api),
    getUniqueTrackTagsForDeviceInProject:getUniqueTrackTagsForDeviceInProject(api),
    getTracksWithTagForDeviceInProject: getTracksWithTagForDeviceInProject(api),
    updateReferenceImageForDeviceAtCurrentLocation: updateReferenceImageForDeviceAtCurrentLocation(api),
    getReferenceImageForDeviceAtCurrentLocation: getReferenceImageForDeviceAtCurrentLocation(api),
    getMaskRegionsForDevice: getMaskRegionsForDevice(api),
    getSettingsForDevice: getSettingsForDevice(api),
    updateDeviceSettings: updateDeviceSettings(api),
    updateMaskRegionsForDevice: updateMaskRegionsForDevice(api),
    getReferenceImageForDeviceAtTime: getReferenceImageForDeviceAtTime(api),
    hasReferenceImageForDeviceAtTime: hasReferenceImageForDeviceAtTime(api),
    hasReferenceImageForDeviceAtCurrentLocation: hasReferenceImageForDeviceAtCurrentLocation(api),
    getLastKnownDeviceBatteryLevel: getLastKnownDeviceBatteryLevel(api),
    getDeviceModel: getDeviceModel(api),
    registerDevice: registerDevice(api),
    withAuth: (authKey: TestHandle) => ({
      createProxyDevice: createProxyDevice(api, authKey),
      deleteDevice: deleteDevice(api, authKey),
      setDeviceActive: setDeviceActive(api, authKey),
      getDeviceById: getDeviceById(api, authKey),
      getDeviceLocationAtTime: getDeviceLocationAtTime(api, authKey),
      getKnownEventTypes: getKnownEventTypes(api, authKey),
      getKnownEventTypesForDeviceInLastMonth: getKnownEventTypesForDeviceInLastMonth(api, authKey),
      getLatestEventsByDeviceId: getLatestEventsByDeviceId(api, authKey),
      getStoppedEvents: getStoppedEvents(api, authKey),
      getLastStoppedEvent: getLastStoppedEvent(api, authKey),
      getDeviceNodeGroup: getDeviceNodeGroup(api, authKey),
      getDeviceLatestVersionInfo: getDeviceLatestVersionInfo(api, authKey),
      getBatteryInfo: getBatteryInfo(api, authKey),
      getEarliestEventAfterTime: getEarliestEventAfterTime(api, authKey),
      getDeviceVersionInfo: getDeviceVersionInfo(api, authKey),
      getLocationHistory: getLocationHistory(api, authKey),
      getActiveDevicesForCurrentUser: getActiveDevicesForCurrentUser(api, authKey),
      getDeviceConfig: getDeviceConfig(api, authKey),
      getLatestStatusRecordingForDevice: getLatestStatusRecordingForDevice(api, authKey),
      getDeviceLastPoweredOff: getDeviceLastPoweredOff(api, authKey),
      getDeviceLastPoweredOn: getDeviceLastPoweredOn(api, authKey),
      assignScheduleToDevice: assignScheduleToDevice(api, authKey),
      removeScheduleFromDevice: removeScheduleFromDevice(api, authKey),
      getUniqueTrackTagsForDeviceInProject:getUniqueTrackTagsForDeviceInProject(api, authKey),
      getTracksWithTagForDeviceInProject: getTracksWithTagForDeviceInProject(api, authKey),
      updateReferenceImageForDeviceAtCurrentLocation: updateReferenceImageForDeviceAtCurrentLocation(api, authKey),
      getReferenceImageForDeviceAtCurrentLocation: getReferenceImageForDeviceAtCurrentLocation(api, authKey),
      getMaskRegionsForDevice: getMaskRegionsForDevice(api, authKey),
      getSettingsForDevice: getSettingsForDevice(api, authKey),
      updateDeviceSettings: updateDeviceSettings(api, authKey),
      updateMaskRegionsForDevice: updateMaskRegionsForDevice(api, authKey),
      getReferenceImageForDeviceAtTime: getReferenceImageForDeviceAtTime(api, authKey),
      hasReferenceImageForDeviceAtTime: hasReferenceImageForDeviceAtTime(api, authKey),
      hasReferenceImageForDeviceAtCurrentLocation: hasReferenceImageForDeviceAtCurrentLocation(api, authKey),
      getLastKnownDeviceBatteryLevel: getLastKnownDeviceBatteryLevel(api, authKey),
      getDeviceModel: getDeviceModel(api, authKey),
      registerDevice: registerDevice(api, authKey),
    }),
  };
};
