import type {
  DeviceId,
  GroupId as ProjectId,
  IsoFormattedDateString,
  LatLng,
  ScheduleId,
  UserId,
} from "../api/common.js";
import type {
  ApiDeviceActionResponse,
  ApiDeviceHistory,
  ApiDeviceHistorySettings,
  ApiDeviceResponse,
  ApiMaskRegionsData,
  DeviceAction,
} from "../api/device.js";
import type {
  ApiSubmitEventsRequestBody,
  BatteryInfoEvent,
  BatteryInfoEventDetail,
  DeviceConfigDetail,
  DeviceEvent,
  IsoFormattedString,
} from "../api/event.js";
import {
  DeviceActionStatus,
  DeviceEventType,
  DeviceTypeUnion,
} from "../api/consts.js";
import type { ApiStationResponse as ApiLocationResponse } from "../api/station.js";
import type { ApiRecordingResponse } from "../api/recording.js";
import type { ApiTrackResponse } from "../api/track.js";
import type { CacophonyApiClient } from "./api.js";
import { optionalQueryString, unwrapLoadedResource } from "./api.js";
import type {
  FetchResult,
  JwtToken,
  LoadedResource,
  LoggedInDeviceCredentials,
  TestHandle,
} from "./types.js";
import { DEFAULT_AUTH_ID } from "./types.js";

const deleteDevice =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (projectNameOrId: string | ProjectId, deviceId: DeviceId) =>
    api.delete(authKey, `/api/v1/devices/${deviceId}`, {
      group: projectNameOrId,
    }) as Promise<FetchResult<{ id: DeviceId }>>;

const setDeviceActive =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (projectNameOrId: string | ProjectId, deviceId: DeviceId) => {
    return api.post(authKey, `/api/v1/devices/${deviceId}/reactivate`, {
      group: projectNameOrId,
    }) as Promise<FetchResult<{ id: DeviceId }>>;
  };

const getDeviceById =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (deviceId: DeviceId, activeAndInactive = true) => {
    const params = new URLSearchParams();
    params.append("only-active", (!activeAndInactive).toString());
    return unwrapLoadedResource(
      api.get(
        authKey,
        `/api/v1/devices/${deviceId}${optionalQueryString(params)}`,
      ) as Promise<FetchResult<{ device: ApiDeviceResponse }>>,
      "device",
    );
  };

const getDeviceLocationAtTime =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (deviceId: DeviceId, activeAndInactiveDevices = false, date?: Date) => {
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
          authKey,
          `/api/v1/devices/${deviceId}/location${optionalQueryString(params)}`,
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

const getKnownEventTypes =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  () =>
    api.get(authKey, `/api/v1/events/event-types`) as Promise<
      FetchResult<{ eventTypes: string[] }>
    >;

const getKnownEventTypesForDeviceInLastMonth =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (deviceId: DeviceId) =>
    api.get(
      authKey,
      `/api/v1/events/event-types/for-device/${deviceId}`,
    ) as Promise<FetchResult<{ eventTypes: string[] }>>;

const getLatestEventsByDeviceId =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (deviceId: number, eventParams?: EventApiParams) => {
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

const getStoppedEvents =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (deviceId: DeviceId, startTime: Date) => {
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

const getLastStoppedEvent =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (deviceId: DeviceId) => {
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

const getDeviceNodeGroup =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (deviceId: DeviceId) => {
    return new Promise((resolve) => {
      getLatestEventsByDeviceId(api, authKey)(deviceId, {
        type: "salt-update",
        limit: 1,
      }).then((response) => {
        if (response.success && response.result.rows.length) {
          let details = response.result.rows[0].EventDetail.details;
          if (typeof details === "string") {
            try {
              details = details
                .trim()
                // eslint-disable-next-line no-control-regex
                .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
                .replace(/\\\\/g, "\\");
              details = JSON.parse(details);
            } catch (e) {
              console.warn(e);
              // Do nothing
            }
          }
          resolve(
            (
              details as {
                nodegroup: string;
              }
            ).nodegroup || "tc2-prod",
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

const getBatteryInfo =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
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
      const events: (BatteryInfoEventDetail & { dateTime: Date })[] = [];
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
          authKey,
          `/api/v1/events?${params}`,
        )) as unknown as FetchResult<{ rows: BatteryInfoEvent[] }>;
        if (response && response.success) {
          const eventsSubset = response.result.rows.map((event) => {
            const {
              dateTime,
              EventDetail: { details },
            } = event;
            return {
              dateTime,
              ...details,
            };
          });
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
    }) as Promise<
      (BatteryInfoEventDetail & { dateTime: Date })[] | false | null
    >;
  };

const getEarliestEventAfterTime =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (deviceId: DeviceId, startTime: Date) => {
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

const getDeviceVersionInfo =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (deviceId: DeviceId) => {
    return new Promise((resolve) => {
      getLatestEventsByDeviceId(api, authKey)(deviceId, {
        type: "versionData",
        limit: 1,
      }).then((response) => {
        if (response.success && response.result.rows.length) {
          resolve(
            response.result.rows[0].EventDetail.details as Record<
              string,
              string
            >,
          );
        } else {
          resolve(false);
        }
      });
    }) as Promise<Record<string, string> | false>;
  };

const getDeviceLatestVersionInfo =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  () => {
    return unwrapLoadedResource(
      api.get(authKey, `/api/v1/devices/latest-software-versions`) as Promise<
        FetchResult<{
          versions: Record<string, Record<string, Record<string, string>>>;
        }>
      >,
      "versions",
    ) as Promise<Record<string, Record<string, Record<string, string>>>>;
  };

const getLocationHistory =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
    deviceId: DeviceId,
  ): Promise<
    LoadedResource<
      { fromDateTime: IsoFormattedDateString; location: ApiLocationResponse }[]
    >
  > => {
    return unwrapLoadedResource(
      api.get(
        authKey,
        `/api/v1/devices/${deviceId}/location-history`,
      ) as Promise<
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

const getActiveDevicesForCurrentUser =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (): Promise<LoadedResource<ApiDeviceResponse[]>> =>
    unwrapLoadedResource(
      api.get(authKey, "/api/v1/devices?only-active=true") as Promise<
        FetchResult<{ devices: ApiDeviceResponse[] }>
      >,
      "devices",
    );

const getDeviceConfig =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (deviceId: DeviceId) => {
    return new Promise((resolve) => {
      getLatestEventsByDeviceId(api, authKey)(deviceId, {
        type: "config",
        limit: 1,
      }).then((response) => {
        if (response && response.success && response.result.rows.length) {
          resolve(
            response.result.rows[0].EventDetail.details as DeviceConfigDetail,
          );
        } else {
          resolve(false);
        }
      });
    }) as Promise<DeviceConfigDetail | false>;
  };

const getLatestStatusRecordingForDevice =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (deviceId: DeviceId, projectId: ProjectId, use2SecondRecordings = true) => {
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
          authKey,
          `/api/v1/recordings/for-project/${projectId}/${optionalQueryString(
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
              getLatestStatusRecordingForDevice(api, authKey)(
                deviceId,
                projectId,
                false,
              ).then(resolve);
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

const getDeviceLastPoweredOff =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (deviceId: DeviceId) => {
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

const getDeviceLastPoweredOn =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (deviceId: DeviceId) => {
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

const assignScheduleToDevice =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (deviceId: DeviceId, scheduleId: ScheduleId, activeAndInactive = false) => {
    const params = new URLSearchParams();
    const shouldViewAsSuperUser = false; // TODO
    if (!shouldViewAsSuperUser) {
      params.append("view-mode", "user");
    }
    params.append("only-active", (!activeAndInactive).toString());
    return api.post(
      authKey,
      `/api/v1/devices/${deviceId}/assign-schedule?${params}`,
      {
        scheduleId,
      },
    ) as Promise<FetchResult<void>>;
  };

const removeScheduleFromDevice =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (deviceId: DeviceId, scheduleId: ScheduleId, activeAndInactive = false) => {
    const suppressGlobalMessaging = true;
    const params = new URLSearchParams();
    const shouldViewAsSuperUser = false; // TODO
    if (!shouldViewAsSuperUser) {
      params.append("view-mode", "user");
    }
    params.append("only-active", (!activeAndInactive).toString());
    return api.post(
      authKey,
      `/api/v1/devices/${deviceId}/remove-schedule?${params}`,
      {
        scheduleId,
      },
      suppressGlobalMessaging,
    ) as Promise<FetchResult<void>>;
  };

const getUniqueTrackTagsForDeviceInProject =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
    deviceId: DeviceId,
    fromDateTime?: Date,
    untilDateTime?: Date,
  ): Promise<
    LoadedResource<{ path: string; what: string; count: number }[]>
  > => {
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
          authKey,
          `/api/v1/devices/${deviceId}/unique-track-tags?${params}`,
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

const getTracksWithTagForDeviceInProject =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
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
        authKey,
        `/api/v1/devices/${deviceId}/tracks-with-tag/${tag}?${params}`,
      ) as Promise<FetchResult<{ tracks: ApiTrackResponse[] }>>,
      "tracks",
    );
  };

const addReferenceImageForDeviceAtTime =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
    deviceId: DeviceId,
    payload: ArrayBuffer,
    atTime?: Date,
    type?: "pov" | "in-situ",
  ) => {
    const params = new URLSearchParams();
    if (atTime) {
      params.append("at-time", atTime.toISOString());
    }
    if (type) {
      params.append("type", type);
    }
    // Set the reference image for the location start time?  Or create a new entry for this reference image starting now?
    return api.post(
      authKey,
      `/api/v1/devices/${deviceId}/reference-image${optionalQueryString(params)}`,
      payload,
    ) as Promise<FetchResult<{ key: string; size: number }>>;
  };

const getReferenceImageForDeviceAtCurrentLocation =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (deviceId: DeviceId) => {
    const params = new URLSearchParams();
    return api.get(
      authKey,
      `/api/v1/devices/${deviceId}/reference-image${optionalQueryString(params)}`,
    ) as Promise<FetchResult<Blob>>;
  };

const deleteAllReferenceImagesForDeviceAtTime =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (deviceId: DeviceId, beforeDateTime?: Date, type?: "pov" | "in-situ") => {
    const params = new URLSearchParams();
    if (beforeDateTime) {
      params.append("at-time", beforeDateTime.toISOString());
    }
    if (type) {
      params.append("type", type);
    }
    return api.delete(
      authKey,
      `/api/v1/devices/${deviceId}/reference-image${optionalQueryString(params)}`,
    ) as Promise<FetchResult<unknown>>;
  };

const getMaskRegionsForDevice =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (deviceId: DeviceId, activeAndInactive = true, atTime?: Date) => {
    const params = new URLSearchParams();
    params.append("at-time", (atTime || new Date()).toISOString());
    if (!activeAndInactive) {
      params.append("only-active", true.toString());
    }
    const queryString = params.toString();

    return api.get(
      authKey,
      `/api/v1/devices/${deviceId}/mask-regions?${queryString}`,
    ) as Promise<FetchResult<ApiMaskRegionsData>>;
  };

const getSettingsForDevice =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (deviceId: DeviceId, lastSynced = false) => {
    const params = new URLSearchParams();
    if (lastSynced) {
      params.append("latest-synced", true.toString());
    }
    return api.get(
      authKey,
      `/api/v1/devices/${deviceId}/settings${optionalQueryString(params)}`,
    ) as Promise<
      FetchResult<{
        settings: ApiDeviceHistorySettings | null;
        location: LatLng;
      }>
    >;
  };

const updateDeviceLocation =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (deviceId: DeviceId, location: LatLng, atTime?: Date) => {
    const payload: { location: LatLng; fromDateTime?: IsoFormattedDateString } =
      {
        location,
      };
    if (atTime) {
      payload.fromDateTime = atTime.toISOString();
    }
    return api.post(
      authKey,
      `/api/v1/devices/${deviceId}/settings`,
      payload,
    ) as Promise<
      FetchResult<{ settings: ApiDeviceHistorySettings; location?: LatLng }>
    >;
  };

const updateDeviceSettings =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (deviceId: DeviceId, settings?: ApiDeviceHistorySettings, atTime?: Date) => {
    const payload: {
      settings?: ApiDeviceHistorySettings;
      fromDateTime?: IsoFormattedDateString;
    } = {};
    if (settings) {
      payload.settings = settings;
    }
    if (atTime) {
      payload.fromDateTime = atTime.toISOString();
    }
    return api.post(
      authKey,
      `/api/v1/devices/${deviceId}/settings`,
      payload,
    ) as Promise<
      FetchResult<{
        settings: ApiDeviceHistorySettings | null;
        location?: LatLng;
      }>
    >;
  };

const updateMaskRegionsForDevice =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (deviceId: DeviceId, maskRegionsData: ApiMaskRegionsData) => {
    return api.post(
      authKey,
      `/api/v1/devices/${deviceId}/mask-regions`,
      maskRegionsData,
    ) as Promise<FetchResult<void>>;
  };

const getReferenceImageForDeviceAtTime =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (deviceId: DeviceId, atTime?: Date, activeAndInactive = false) => {
    const params = new URLSearchParams();
    if (atTime) {
      params.append("at-time", atTime.toISOString());
    }
    if (!activeAndInactive) {
      params.append("only-active", true.toString());
    }
    return api.get(
      authKey,
      `/api/v1/devices/${deviceId}/reference-image${optionalQueryString(params)}`,
    ) as Promise<FetchResult<Blob>>;
  };

const hasReferenceImageForDeviceAtTime =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (deviceId: DeviceId, atTime?: Date, activeAndInactive = false) => {
    const params = new URLSearchParams();
    if (atTime) {
      params.append("at-time", atTime.toISOString());
    }
    if (!activeAndInactive) {
      params.append("only-active", true.toString());
    }
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

const getLastKnownDeviceBatteryLevel =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
    deviceId: DeviceId,
  ): Promise<(BatteryInfoEventDetail & { dateTime: Date }) | false | null> => {
    const lastThirtyDays = new Date();
    lastThirtyDays.setDate(lastThirtyDays.getDate() - 30);
    return new Promise((resolve) => {
      getBatteryInfo(api, authKey)(deviceId, lastThirtyDays, 1, 1).then(
        (result) => {
          if (result === null) {
            resolve(null);
          } else if (result === false || result.length === 0) {
            resolve(false);
          }
          resolve(
            (result as (BatteryInfoEventDetail & { dateTime: Date })[])[0],
          );
        },
      );
    });
  };

const getDeviceModel =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (deviceId: DeviceId) => {
    return api.get(authKey, `/api/v1/devices/${deviceId}/type`) as Promise<
      FetchResult<{ type: DeviceTypeUnion }>
    >;
  };

const registerDevice =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
    projectName: string,
    deviceName: string,
    password: string,
    initialDateTime?: Date,
  ) => {
    const payload: {
      deviceName: string;
      group: string;
      password: string;
      fromDateTime?: IsoFormattedDateString;
    } = {
      deviceName,
      group: projectName,
      password,
    };
    if (initialDateTime) {
      payload.fromDateTime = initialDateTime.toISOString();
    }
    return api.post(authKey, "/api/v1/devices", payload) as Promise<
      FetchResult<LoggedInDeviceCredentials>
    >;
  };

const reRegisterDeviceWithAdminAuthorization =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
    adminUserAuthJWT: JwtToken<UserId>,
    projectNameOrId?: string | ProjectId,
    initialDateTime?: Date,
    newDeviceName?: string,
    newDevicePassword?: string,
  ) => {
    if (!projectNameOrId && !newDeviceName && !newDevicePassword) {
      throw new Error(
        "Must have one of 'projectNameOrId', 'newDeviceName', 'newDevicePassword'",
      );
    }
    const payload: {
      newName?: string;
      newGroup?: string | ProjectId;
      newPassword?: string;
      fromDateTime?: IsoFormattedDateString;
      authorizedToken: JwtToken<UserId>;
    } = {
      authorizedToken: adminUserAuthJWT,
    };

    if (initialDateTime) {
      payload.fromDateTime = initialDateTime.toISOString();
    }
    if (projectNameOrId) {
      payload.newGroup = projectNameOrId;
    }
    if (newDeviceName) {
      payload.newName = newDeviceName;
    }
    if (newDevicePassword) {
      payload.newPassword = newDevicePassword;
    }

    return api.post(
      authKey,
      "/api/v1/devices/reregister-authorized",
      payload,
    ) as Promise<FetchResult<LoggedInDeviceCredentials>>;
  };

const reRegisterDeviceWithoutAuthorization =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
    projectNameOrId: string | ProjectId,
    newDeviceName: string,
    newDevicePassword: string,
    initialDateTime?: Date,
  ) => {
    const payload: {
      newName?: string;
      newGroup?: string | ProjectId;
      newPassword?: string;
      fromDateTime?: IsoFormattedDateString;
    } = {
      newGroup: projectNameOrId,
      newName: newDeviceName,
      newPassword: newDevicePassword,
    };

    if (initialDateTime) {
      payload.fromDateTime = initialDateTime.toISOString();
    }

    return api.post(authKey, "/api/v1/devices/reregister", payload) as Promise<
      FetchResult<LoggedInDeviceCredentials>
    >;
  };

const submitEventsFromDevice =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (eventsPayload: ApiSubmitEventsRequestBody, atTime?: Date) => {
    const params = new URLSearchParams();
    if (atTime) {
      params.append("at-time", atTime.toISOString());
    }
    return api.post(
      authKey,
      `/api/v1/events${optionalQueryString(params)}`,
      eventsPayload,
    ) as Promise<FetchResult<{ success: boolean }>>;
  };

const submitEventsOnBehalfOfDevice =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (deviceId: DeviceId, eventsPayload: ApiSubmitEventsRequestBody) => {
    return api.post(
      authKey,
      `/api/v1/events/device/${deviceId}`,
      eventsPayload,
    ) as Promise<FetchResult<{ success: boolean }>>;
  };

const getDeviceHistoryInTest =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (deviceId: DeviceId) => {
    return unwrapLoadedResource(
      api.get(authKey, `/api/v1/devices/${deviceId}/history`) as Promise<
        FetchResult<{ history: ApiDeviceHistory[] }>
      >,
      "history",
    ) as Promise<LoadedResource<ApiDeviceHistory[]>>;
  };

const createDeviceActionRequest =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
    deviceId: DeviceId,
    uuid: string,
    createdAt: Date,
    classification: string,
  ) => {
    return api.post(authKey, `/api/v1/devices/${deviceId}/device-action`, {
      uuid,
      createdAt: createdAt.toISOString(),
      classification,
    });
  };
const getDeviceActionRequest =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (deviceId: DeviceId, uuid: string) => {
    const params = new URLSearchParams();
    params.append("uuid", uuid);
    return unwrapLoadedResource(
      api.get(
        authKey,
        `/api/v1/devices/${deviceId}/device-action?${params.toString()}`,
      ) as Promise<FetchResult<{ "device-action": ApiDeviceActionResponse }>>,
      "device-action",
    );
  };

const updateDeviceActionRequest =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (deviceId: DeviceId, uuid: string, status: DeviceActionStatus) => {
    const params = new URLSearchParams();
    params.append("uuid", uuid);
    return api.patch(
      authKey,
      `/api/v1/devices/${deviceId}/device-action?${params.toString()}`,
      {
        status,
      },
    ) as Promise<FetchResult<void>>;
  };

export default (api: CacophonyApiClient) => {
  // NOTE: this is a bit tedious, but it makes the type inference work for the return type.
  return {
    deleteDevice: deleteDevice(api),
    setDeviceActive: setDeviceActive(api),
    getDeviceById: getDeviceById(api),
    getDeviceLocationAtTime: getDeviceLocationAtTime(api),
    getKnownEventTypes: getKnownEventTypes(api),
    getKnownEventTypesForDeviceInLastMonth:
      getKnownEventTypesForDeviceInLastMonth(api),
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
    getUniqueTrackTagsForDeviceInProject:
      getUniqueTrackTagsForDeviceInProject(api),
    getTracksWithTagForDeviceInProject: getTracksWithTagForDeviceInProject(api),
    addReferenceImageForDeviceAtTime: addReferenceImageForDeviceAtTime(api),
    getReferenceImageForDeviceAtCurrentLocation:
      getReferenceImageForDeviceAtCurrentLocation(api),
    deleteAllReferenceImagesForDeviceAtTime:
      deleteAllReferenceImagesForDeviceAtTime(api),
    getMaskRegionsForDevice: getMaskRegionsForDevice(api),
    getSettingsForDevice: getSettingsForDevice(api),
    updateDeviceSettings: updateDeviceSettings(api),
    updateDeviceLocation: updateDeviceLocation(api),
    updateMaskRegionsForDevice: updateMaskRegionsForDevice(api),
    getReferenceImageForDeviceAtTime: getReferenceImageForDeviceAtTime(api),
    hasReferenceImageForDeviceAtTime: hasReferenceImageForDeviceAtTime(api),
    getLastKnownDeviceBatteryLevel: getLastKnownDeviceBatteryLevel(api),
    getDeviceModel: getDeviceModel(api),
    registerDevice: registerDevice(api),
    reRegisterDeviceWithAdminAuthorization:
      reRegisterDeviceWithAdminAuthorization(api),
    reRegisterDeviceWithoutAuthorization:
      reRegisterDeviceWithoutAuthorization(api),
    getDeviceHistoryInTest: getDeviceHistoryInTest(api),
    submitEventsFromDevice: submitEventsFromDevice(api),
    submitEventsOnBehalfOfDevice: submitEventsOnBehalfOfDevice(api),
    createDeviceActionRequest: createDeviceActionRequest(api),
    getDeviceActionRequest: getDeviceActionRequest(api),
    updateDeviceActionRequest: updateDeviceActionRequest(api),
    withAuth: (authKey: TestHandle) => ({
      deleteDevice: deleteDevice(api, authKey),
      setDeviceActive: setDeviceActive(api, authKey),
      getDeviceById: getDeviceById(api, authKey),
      getDeviceLocationAtTime: getDeviceLocationAtTime(api, authKey),
      getKnownEventTypes: getKnownEventTypes(api, authKey),
      getKnownEventTypesForDeviceInLastMonth:
        getKnownEventTypesForDeviceInLastMonth(api, authKey),
      getLatestEventsByDeviceId: getLatestEventsByDeviceId(api, authKey),
      getStoppedEvents: getStoppedEvents(api, authKey),
      getLastStoppedEvent: getLastStoppedEvent(api, authKey),
      getDeviceNodeGroup: getDeviceNodeGroup(api, authKey),
      getDeviceLatestVersionInfo: getDeviceLatestVersionInfo(api, authKey),
      getBatteryInfo: getBatteryInfo(api, authKey),
      getEarliestEventAfterTime: getEarliestEventAfterTime(api, authKey),
      getDeviceVersionInfo: getDeviceVersionInfo(api, authKey),
      getLocationHistory: getLocationHistory(api, authKey),
      getActiveDevicesForCurrentUser: getActiveDevicesForCurrentUser(
        api,
        authKey,
      ),
      getDeviceConfig: getDeviceConfig(api, authKey),
      getLatestStatusRecordingForDevice: getLatestStatusRecordingForDevice(
        api,
        authKey,
      ),
      getDeviceLastPoweredOff: getDeviceLastPoweredOff(api, authKey),
      getDeviceLastPoweredOn: getDeviceLastPoweredOn(api, authKey),
      assignScheduleToDevice: assignScheduleToDevice(api, authKey),
      removeScheduleFromDevice: removeScheduleFromDevice(api, authKey),
      getUniqueTrackTagsForDeviceInProject:
        getUniqueTrackTagsForDeviceInProject(api, authKey),
      getTracksWithTagForDeviceInProject: getTracksWithTagForDeviceInProject(
        api,
        authKey,
      ),
      addReferenceImageForDeviceAtTime: addReferenceImageForDeviceAtTime(
        api,
        authKey,
      ),
      getReferenceImageForDeviceAtCurrentLocation:
        getReferenceImageForDeviceAtCurrentLocation(api, authKey),
      deleteAllReferenceImagesForDeviceAtTime:
        deleteAllReferenceImagesForDeviceAtTime(api, authKey),
      getMaskRegionsForDevice: getMaskRegionsForDevice(api, authKey),
      getSettingsForDevice: getSettingsForDevice(api, authKey),
      updateDeviceSettings: updateDeviceSettings(api, authKey),
      updateDeviceLocation: updateDeviceLocation(api, authKey),
      updateMaskRegionsForDevice: updateMaskRegionsForDevice(api, authKey),
      getReferenceImageForDeviceAtTime: getReferenceImageForDeviceAtTime(
        api,
        authKey,
      ),
      hasReferenceImageForDeviceAtTime: hasReferenceImageForDeviceAtTime(
        api,
        authKey,
      ),
      getLastKnownDeviceBatteryLevel: getLastKnownDeviceBatteryLevel(
        api,
        authKey,
      ),
      getDeviceModel: getDeviceModel(api, authKey),
      registerDevice: registerDevice(api, authKey),
      reRegisterDeviceWithAdminAuthorization:
        reRegisterDeviceWithAdminAuthorization(api, authKey),
      reRegisterDeviceWithoutAuthorization:
        reRegisterDeviceWithoutAuthorization(api, authKey),
      getDeviceHistoryInTest: getDeviceHistoryInTest(api, authKey),
      submitEventsFromDevice: submitEventsFromDevice(api, authKey),
      submitEventsOnBehalfOfDevice: submitEventsOnBehalfOfDevice(api, authKey),
      createDeviceActionRequest: createDeviceActionRequest(api, authKey),
      getDeviceActionRequest: getDeviceActionRequest(api, authKey),
      updateDeviceActionRequest: updateDeviceActionRequest(api, authKey),
    }),
  };
};
