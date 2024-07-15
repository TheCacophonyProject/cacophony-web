import CacophonyApi, { unwrapLoadedResource } from "./api";
import type { FetchResult, LoadedResource } from "@api/types";
import type { GroupId as ProjectId, UserId } from "@typedefs/api/common";
import type {
  ApiGroupResponse as ApiProjectResponse,
  ApiGroupSettings as ApiProjectSettings,
  ApiGroupUserResponse as ApiProjectUserResponse,
} from "@typedefs/api/group";
import type { ApiDeviceResponse } from "@typedefs/api/device";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import { shouldViewAsSuperUser } from "@models/LoggedInUser";
import type { ApiGroupUserSettings as ApiProjectUserSettings } from "@typedefs/api/group";

// FIXME - Move all the super user view mode stuff into the fetch function?

export const addNewProject = (projectName: string) =>
  CacophonyApi.post("/api/v1/groups", { groupName: projectName }) as Promise<
    FetchResult<{ groupId: ProjectId }>
  >;

export const saveProjectUserSettings = (
  id: ProjectId,
  settings: ApiProjectUserSettings
) => CacophonyApi.patch(`/api/v1/groups/${id}/my-settings`, { settings });

export const saveProjectSettings = (
  id: ProjectId,
  settings: ApiProjectSettings
) => CacophonyApi.patch(`/api/v1/groups/${id}/group-settings`, { settings });

export const getCurrentUserProjects = (abortable: boolean) => {
  const params = new URLSearchParams();
  if (!shouldViewAsSuperUser.value) {
    params.append("view-mode", "user");
  }
  return CacophonyApi.get(`/api/v1/groups?${params}`, abortable) as Promise<
    FetchResult<{ groups: ApiProjectResponse[] }>
  >;
};

export const getAllProjects = (abortable: boolean) => {
  return CacophonyApi.get(`/api/v1/groups`, abortable) as Promise<
    FetchResult<{ groups: ApiProjectResponse[] }>
  >;
};

export const addOrUpdateProjectUser = (
  projectNameOrId: string | ProjectId,
  isAdmin: boolean,
  isOwner: boolean,
  userId?: UserId,
  email?: string
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
  return CacophonyApi.post("/api/v1/groups/users", payload) as Promise<
    FetchResult<void>
  >;
};

export const removeProjectUser = (
  projectName: string,
  userId?: UserId,
  email?: string
) => {
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
  return CacophonyApi.delete("/api/v1/groups/users", payload) as Promise<
    FetchResult<void>
  >;
};

export const getProjectByName = (
  projectName: string
): Promise<LoadedResource<ApiProjectResponse>> => {
  const params = new URLSearchParams();
  if (!shouldViewAsSuperUser.value) {
    params.append("view-mode", "user");
  }
  return unwrapLoadedResource(
    CacophonyApi.get(
      `/api/v1/groups/${encodeURIComponent(projectName)}?${params}`
    ) as Promise<FetchResult<{ group: ApiProjectResponse }>>,
    "group"
  );
};

export const getProjectById = (
  projectId: ProjectId
): Promise<LoadedResource<ApiProjectResponse>> => {
  const params = new URLSearchParams();
  if (!shouldViewAsSuperUser.value) {
    params.append("view-mode", "user");
  }
  return unwrapLoadedResource(
    CacophonyApi.get(`/api/v1/groups/${projectId}?${params}`) as Promise<
      FetchResult<{ group: ApiProjectResponse }>
    >,
    "group"
  );
};

export const getUsersForProject = (
  projectNameOrId: string | number
): Promise<LoadedResource<ApiProjectUserResponse[]>> => {
  return unwrapLoadedResource(
    CacophonyApi.get(
      `/api/v1/groups/${encodeURIComponent(projectNameOrId)}/users`
    ) as Promise<FetchResult<{ users: ApiProjectUserResponse[] }>>,
    "users"
  );
};

export const getDevicesForProject = (
  projectNameOrId: string | number,
  activeAndInactive = false,
  NO_ABORT = false
): Promise<LoadedResource<ApiDeviceResponse[]>> => {
  const params = new URLSearchParams();
  params.append(
    "only-active",
    activeAndInactive ? false.toString() : true.toString()
  );
  return unwrapLoadedResource(
    CacophonyApi.get(
      `/api/v1/groups/${encodeURIComponent(projectNameOrId)}/devices?${params}`,
      !NO_ABORT
    ) as Promise<FetchResult<{ devices: ApiDeviceResponse[] }>>,
    "devices"
  );
};

export const getLocationsForProject = (
  projectNameOrId: string,
  activeAndInactive = false
): Promise<LoadedResource<ApiLocationResponse[]>> => {
  const params = new URLSearchParams();
  params.append(
    "only-active",
    activeAndInactive ? false.toString() : true.toString()
  );
  return unwrapLoadedResource(
    CacophonyApi.get(
      `/api/v1/groups/${encodeURIComponent(projectNameOrId)}/stations?${params}`
    ) as Promise<FetchResult<{ stations: ApiLocationResponse[] }>>,
    "stations"
  );
};

export const getLocationByNameInProject = (
  projectNameOrId: string | ProjectId,
  locationName: string
) =>
  CacophonyApi.get(
    `/api/v1/groups/${encodeURIComponent(
      projectNameOrId
    )}/station/${encodeURIComponent(locationName)}`
  ) as Promise<FetchResult<{ station: ApiLocationResponse }>>;

export const inviteSomeoneToProject = (
  projectNameOrId: string | ProjectId,
  inviteeEmail: string,
  asAdmin = false,
  asOwner = false
) =>
  CacophonyApi.post(
    `/api/v1/groups/${encodeURIComponent(projectNameOrId)}/invite-user`,
    {
      email: inviteeEmail,
      admin: asAdmin,
      owner: asOwner,
    }
  ) as Promise<FetchResult<void>>;
/*
const createStationInGroup = (
  groupNameOrId: string | GroupId,
  station: { name: string; lat: number; lng: number },
  applyFromDate?: Date,
  applyUntilDate?: Date
) => {
  const payload: {
    station: string;
    ['from-date']?: IsoFormattedDateString;
    ['until-date']?: IsoFormattedDateString;
  } = {
    station: JSON.stringify(station),
  };
  if (applyFromDate) {
    payload["from-date"] = applyFromDate.toISOString();
    if (applyUntilDate) {
      payload["until-date"] = applyUntilDate.toISOString();
    }
  }
  return CacophonyApi.post(
    `/api/v1/groups/${encodeURIComponent(groupNameOrId)}/station`,
    payload
  ) as Promise<FetchResult<{ stationId: StationId }>>;
}
 */

// function addStationsToGroup(
//   groupName: string | number,
//   stations: { name: string; lat: number; lng: number }[],
//   applyFromDate?: Date,
//   applyUntilDate?: Date
// ) {
//   const payload: {
//     stations: string;
//     fromDate?: string;
//     untilDate?: string;
//   } = {
//     stations: JSON.stringify(stations),
//   };
//   if (applyFromDate) {
//     payload["from-date"] = applyFromDate.toISOString();
//     if (applyUntilDate) {
//       payload["until-date"] = applyUntilDate.toISOString();
//     }
//   }
//   return CacophonyApi.post(
//     `/api/v1/groups/${encodeURIComponent(groupName)}/stations`,
//     payload
//   );
// }
