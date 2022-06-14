import CacophonyApi from "./api";
import type { FetchResult } from "@api/types";
import type { GroupId } from "@typedefs/api/common";
import type {
  ApiGroupResponse,
  ApiGroupUserResponse,
} from "@typedefs/api/group";
import type { ApiDeviceResponse } from "@typedefs/api/device";
import type { ApiStationResponse } from "@typedefs/api/station";
import { shouldViewAsSuperUser } from "@models/LoggedInUser";

// FIXME - Move all the super user view mode stuff into the fetch function?

export const addNewGroup = (groupName: string) =>
  CacophonyApi.post("/api/v1/groups", { groupName }) as Promise<
    FetchResult<{ groupId: GroupId }>
  >;

export const getGroups = (abortable: boolean) =>
  CacophonyApi.get(
    `/api/v1/groups${shouldViewAsSuperUser.value ? "" : "?view-mode=user"}`,
    abortable
  ) as Promise<FetchResult<{ groups: ApiGroupResponse[] }>>;

const addGroupUser = (groupName: string, userName: string, isAdmin: boolean) =>
  CacophonyApi.post("/api/v1/groups/users", {
    group: groupName,
    username: userName,
    admin: isAdmin,
  }) as Promise<FetchResult<void>>;

const removeGroupUser = (groupName: string, userName: string) =>
  CacophonyApi.delete("/api/v1/groups/users", {
    group: groupName,
    username: userName,
  }) as Promise<FetchResult<void>>;

const getGroupByName = (groupName: string) =>
  CacophonyApi.get(
    `/api/v1/groups/${encodeURIComponent(groupName)}${
      shouldViewAsSuperUser.value ? "" : "?view-mode=user"
    }`
  ) as Promise<FetchResult<{ group: ApiGroupResponse }>>;

const getGroupById = (groupId: GroupId) =>
  CacophonyApi.get(
    `/api/v1/groups/${groupId}${
      shouldViewAsSuperUser.value ? "" : "?view-mode=user"
    }`
  ) as Promise<FetchResult<{ group: ApiGroupResponse }>>;

export const getUsersForGroup = (groupNameOrId: string | number) =>
  CacophonyApi.get(
    `/api/v1/groups/${encodeURIComponent(groupNameOrId)}/users`
  ) as Promise<FetchResult<{ users: ApiGroupUserResponse[] }>>;

const getDevicesForGroup = (
  groupNameOrId: string | number,
  activeAndInactive = false
) =>
  CacophonyApi.get(
    `/api/v1/groups/${encodeURIComponent(groupNameOrId)}/devices${
      shouldViewAsSuperUser.value
        ? `?only-active=${activeAndInactive ? "false" : "true"}`
        : `?view-mode=user&only-active=${activeAndInactive ? "false" : "true"}`
    }`
  ) as Promise<FetchResult<{ devices: ApiDeviceResponse[] }>>;

export const getStationsForGroup = (
  groupNameOrId: string,
  activeAndInactive = false
) =>
  CacophonyApi.get(
    `/api/v1/groups/${encodeURIComponent(groupNameOrId)}/stations${
      shouldViewAsSuperUser.value
        ? `?only-active=${activeAndInactive ? "false" : "true"}`
        : `?view-mode=user&only-active=${activeAndInactive ? "false" : "true"}`
    }`
  ) as Promise<FetchResult<{ stations: ApiStationResponse[] }>>;

const getStationByNameInGroup = (
  groupNameOrId: string | GroupId,
  stationName: string
) =>
  CacophonyApi.get(
    `/api/v1/groups/${encodeURIComponent(
      groupNameOrId
    )}/station/${encodeURIComponent(stationName)}`
  ) as Promise<FetchResult<{ station: ApiStationResponse }>>;

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
