import { DEFAULT_AUTH_ID } from "./types.js";
import { unwrapLoadedResource } from "./api.js";
import type { CacophonyApiClient } from "./api.js";

import type { FetchResult, LoadedResource, TestHandle } from "./types.js";
import type {
  GroupId as ProjectId,
  LocationId,
  UserId,
} from "../api/common.js";
import type {
  ApiGroupResponse as ApiProjectResponse,
  ApiGroupSettings as ApiProjectSettings,
  ApiGroupUserResponse as ApiProjectUserResponse,
} from "../api/group.js";
import type { ApiDeviceResponse } from "../api/device.js";
import type { ApiStationResponse as ApiLocationResponse } from "../api/station.js";
import type { ApiGroupUserSettings as ApiProjectUserSettings } from "../api/group.js";
import { JsonDocument } from "@typedefs/api/event.js";

const addNewProject =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (projectName: string) =>
    api.post(authKey, "/api/v1/groups", { groupName: projectName }) as Promise<
      FetchResult<{ groupId: ProjectId }>
    >;

const saveProjectUserSettings =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (id: ProjectId, settings: ApiProjectUserSettings) =>
    api.patch(authKey, `/api/v1/groups/${id}/my-settings`, { settings });

const saveProjectSettings =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (id: ProjectId, settings: ApiProjectSettings) =>
    api.patch(authKey, `/api/v1/groups/${id}/group-settings`, { settings });

const getCurrentUserProjects =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (abortable: boolean, shouldViewAsSuperUser = false) => {
    const params = new URLSearchParams();
    if (!shouldViewAsSuperUser) {
      params.append("view-mode", "user");
    }
    return api.get(authKey, `/api/v1/groups?${params}`, abortable) as Promise<
      FetchResult<{ groups: ApiProjectResponse[] }>
    >;
  };

const getAllProjects =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (abortable: boolean) => {
    return api.get(authKey, `/api/v1/groups`, abortable) as Promise<
      FetchResult<{ groups: ApiProjectResponse[] }>
    >;
  };

const addOrUpdateProjectUser =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
    projectNameOrId: string | ProjectId,
    isAdmin: boolean,
    isOwner: boolean,
    userId?: UserId,
    email?: string,
  ) => {
    const payload: {
      group: string | ProjectId;
      admin: boolean;
      owner: boolean;
      userId?: UserId;
      email?: string;
    } = {
      group: projectNameOrId,
      admin: isAdmin,
      owner: isOwner,
    };
    if (userId) {
      payload.userId = userId;
    } else {
      payload.email = email;
    }
    return api.post(authKey, "/api/v1/groups/users", payload) as Promise<
      FetchResult<void>
    >;
  };

const removeProjectUser =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (projectName: string, userId?: UserId, email?: string) => {
    const payload: {
      group: string | ProjectId;
      userId?: UserId;
      email?: string;
    } = {
      group: projectName,
    };
    if (userId) {
      payload.userId = userId;
    } else {
      payload.email = email;
    }
    return api.delete(authKey, "/api/v1/groups/users", payload) as Promise<
      FetchResult<void>
    >;
  };

const getProjectByName =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
    projectName: string,
    shouldViewAsSuperUser = false,
  ): Promise<LoadedResource<ApiProjectResponse>> => {
    const params = new URLSearchParams();
    if (!shouldViewAsSuperUser) {
      params.append("view-mode", "user");
    }
    return unwrapLoadedResource(
      api.get(
        authKey,
        `/api/v1/groups/${encodeURIComponent(projectName)}?${params}`,
      ) as Promise<FetchResult<{ group: ApiProjectResponse }>>,
      "group",
    );
  };

const getProjectById =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
    projectId: ProjectId,
    shouldViewAsSuperUser = false,
  ): Promise<LoadedResource<ApiProjectResponse>> => {
    const params = new URLSearchParams();
    if (!shouldViewAsSuperUser) {
      params.append("view-mode", "user");
    }
    return unwrapLoadedResource(
      api.get(authKey, `/api/v1/groups/${projectId}?${params}`) as Promise<
        FetchResult<{ group: ApiProjectResponse }>
      >,
      "group",
    );
  };

const getUsersForProject =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
    projectNameOrId: string | number,
  ): Promise<LoadedResource<ApiProjectUserResponse[]>> => {
    return unwrapLoadedResource(
      api.get(
        authKey,
        `/api/v1/groups/${encodeURIComponent(projectNameOrId)}/users`,
      ) as Promise<FetchResult<{ users: ApiProjectUserResponse[] }>>,
      "users",
    );
  };

const getDevicesForProject =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
    projectNameOrId: string | number,
    activeAndInactive = false,
    NO_ABORT = false,
  ): Promise<LoadedResource<ApiDeviceResponse[]>> => {
    const params = new URLSearchParams();
    params.append(
      "only-active",
      activeAndInactive ? false.toString() : true.toString(),
    );
    return unwrapLoadedResource(
      api.get(
        authKey,
        `/api/v1/groups/${encodeURIComponent(projectNameOrId)}/devices?${params}`,
        !NO_ABORT,
      ) as Promise<FetchResult<{ devices: ApiDeviceResponse[] }>>,
      "devices",
    );
  };

const getLocationsForProject =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
    projectNameOrId: string | ProjectId,
    activeAndInactive = false, // Only active locations by default (non-retired)
    withRecordings = true, // Only locations with recordings - locations with all recordings deleted won't show.
  ): Promise<LoadedResource<ApiLocationResponse[]>> => {
    const params = new URLSearchParams();
    params.append(
      "only-active",
      activeAndInactive ? false.toString() : true.toString(),
    );
    params.append(
      "with-recordings",
      withRecordings ? false.toString() : true.toString(),
    );
    return unwrapLoadedResource(
      api.get(
        authKey,
        `/api/v1/groups/${encodeURIComponent(projectNameOrId)}/stations?${params}`,
      ) as Promise<FetchResult<{ stations: ApiLocationResponse[] }>>,
      "stations",
    );
  };

const createLocation =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
    projectNameOrId: string | ProjectId,
    location: { name: string; lat: number; lng: number },
    fromDateTime?: Date,
  ): Promise<LoadedResource<LocationId>> => {
    const body: Record<string, JsonDocument> = {
      station: location,
    };
    if (fromDateTime) {
      body["from-date"] = fromDateTime.toISOString();
    }

    return unwrapLoadedResource(
      api.post(
        authKey,
        `/api/v1/groups/${encodeURIComponent(projectNameOrId)}/station`,
        body,
      ) as Promise<FetchResult<{ stationId: LocationId }>>,
      "stationId",
    );
  };

const getLocationByNameInProject =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (projectNameOrId: string | ProjectId, locationName: string) =>
    api.get(
      authKey,
      `/api/v1/groups/${encodeURIComponent(
        projectNameOrId,
      )}/station/${encodeURIComponent(locationName)}`,
    ) as Promise<FetchResult<{ station: ApiLocationResponse }>>;

const inviteSomeoneToProject =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (
    projectNameOrId: string | ProjectId,
    inviteeEmail: string,
    asAdmin = false,
    asOwner = false,
  ) =>
    api.post(
      authKey,
      `/api/v1/groups/${encodeURIComponent(projectNameOrId)}/invite-user`,
      {
        email: inviteeEmail,
        admin: asAdmin,
        owner: asOwner,
      },
    ) as Promise<FetchResult<void>>;

export default (api: CacophonyApiClient) => {
  // NOTE: this is a bit tedious, but it makes the type inference work for the return type.
  return {
    addNewProject: addNewProject(api),
    addToProjectRequest: addNewProject(api),
    saveProjectUserSettings: saveProjectUserSettings(api),
    saveProjectSettings: saveProjectSettings(api),
    getCurrentUserProjects: getCurrentUserProjects(api),
    getAllProjects: getAllProjects(api),
    addOrUpdateProjectUser: addOrUpdateProjectUser(api),
    removeProjectUser: removeProjectUser(api),
    getProjectById: getProjectById(api),
    getProjectByName: getProjectByName(api),
    getUsersForProject: getUsersForProject(api),
    getDevicesForProject: getDevicesForProject(api),
    getLocationsForProject: getLocationsForProject(api),
    getLocationByNameInProject: getLocationByNameInProject(api),
    inviteSomeoneToProject: inviteSomeoneToProject(api),
    createLocation: createLocation(api),
    withAuth: (authKey: TestHandle) => ({
      addNewProject: addNewProject(api, authKey),
      addToProjectRequest: addNewProject(api, authKey),
      saveProjectUserSettings: saveProjectUserSettings(api, authKey),
      saveProjectSettings: saveProjectSettings(api, authKey),
      getCurrentUserProjects: getCurrentUserProjects(api, authKey),
      getAllProjects: getAllProjects(api, authKey),
      addOrUpdateProjectUser: addOrUpdateProjectUser(api, authKey),
      removeProjectUser: removeProjectUser(api, authKey),
      getProjectById: getProjectById(api, authKey),
      getProjectByName: getProjectByName(api, authKey),
      getUsersForProject: getUsersForProject(api, authKey),
      getDevicesForProject: getDevicesForProject(api, authKey),
      getLocationsForProject: getLocationsForProject(api, authKey),
      getLocationByNameInProject: getLocationByNameInProject(api, authKey),
      inviteSomeoneToProject: inviteSomeoneToProject(api, authKey),
      createLocation: createLocation(api, authKey),
    }),
  };
};
