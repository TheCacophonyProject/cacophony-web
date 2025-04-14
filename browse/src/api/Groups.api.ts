import CacophonyApi from "./CacophonyApi";
import { shouldViewAsSuperUser } from "@/utils";
import { FetchResult } from "@/api/Recording.api";
import {
  ApiGroupResponse,
  ApiGroupSettings,
  ApiGroupUserResponse,
} from "@typedefs/api/group";
import { ApiDeviceResponse } from "@typedefs/api/device";
import { GroupId, StationId } from "@typedefs/api/common";
import { ApiStationResponse } from "@typedefs/api/station";

function addNewGroup(groupName): Promise<FetchResult<{ groupId: GroupId }>> {
  const suppressGlobalMessaging = true;
  return CacophonyApi.post(
    "/api/v1/groups",
    { groupName },
    suppressGlobalMessaging
  );
}

function addGroupUser(
  groupName,
  emailOrUserId: string | number,
  isAdmin
): Promise<{ success: boolean; status: number; result: any }> {
  const suppressGlobalMessaging = true;
  const payload = {
    group: groupName,
    admin: isAdmin,
  };
  if (typeof emailOrUserId === "number") {
    (payload as any).userId = emailOrUserId;
  } else {
    (payload as any).email = emailOrUserId;
  }
  return CacophonyApi.post(
    "/api/v1/groups/users",
    payload,
    suppressGlobalMessaging
  );
}

function removeGroupUser(groupName, userId) {
  return CacophonyApi.delete("/api/v1/groups/users", {
    group: groupName,
    userId,
  });
}

function getGroup(
  groupName: string
): Promise<FetchResult<{ group: ApiGroupResponse }>> {
  return CacophonyApi.get(
    `/api/v1/groups/${encodeURIComponent(groupName)}${
      shouldViewAsSuperUser() ? "" : "?view-mode=user"
    }`
  );
}

function getGroupById(
  groupId: GroupId
): Promise<FetchResult<{ group: ApiGroupResponse }>> {
  return CacophonyApi.get(
    `/api/v1/groups/${groupId}${
      shouldViewAsSuperUser() ? "" : "?view-mode=user"
    }`
  );
}

function getGroups(): Promise<FetchResult<{ groups: ApiGroupResponse[] }>> {
  return CacophonyApi.get(
    `/api/v1/groups${shouldViewAsSuperUser() ? "" : "?view-mode=user"}`
  );
}

function getUsersForGroup(
  groupNameOrId: string | number
): Promise<FetchResult<{ users: ApiGroupUserResponse[] }>> {
  return CacophonyApi.get(
    `/api/v1/groups/${encodeURIComponent(groupNameOrId)}/users`
  );
}

function getDevicesForGroup(
  groupNameOrId: string | number,
  activeAndInactive = false
): Promise<FetchResult<{ devices: ApiDeviceResponse[] }>> {
  return CacophonyApi.get(
    `/api/v1/groups/${encodeURIComponent(groupNameOrId)}/devices${
      shouldViewAsSuperUser()
        ? `?only-active=${activeAndInactive ? "false" : "true"}`
        : `?view-mode=user&only-active=${activeAndInactive ? "false" : "true"}`
    }`
  );
}

function getStationsForGroup(
  groupNameOrId: string,
  activeAndInactive = false
): Promise<FetchResult<{ stations: ApiStationResponse[] }>> {
  return CacophonyApi.get(
    `/api/v1/groups/${encodeURIComponent(groupNameOrId)}/stations${
      shouldViewAsSuperUser()
        ? `?only-active=${activeAndInactive ? "false" : "true"}`
        : `?view-mode=user&only-active=${activeAndInactive ? "false" : "true"}`
    }`
  );
}

function createStationInGroup(
  groupNameOrId: string | GroupId,
  station: { name: string; lat: number; lng: number },
  applyFromDate?: Date,
  applyUntilDate?: Date
): Promise<FetchResult<{ stationId: StationId }>> {
  const payload: {
    station: string;
    fromDate?: string;
    untilDate?: string;
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
  );
}

function getStationByNameInGroup(
  groupNameOrId: string | GroupId,
  stationName: string
): Promise<FetchResult<{ station: ApiStationResponse }>> {
  return CacophonyApi.get(
    `/api/v1/groups/${encodeURIComponent(
      groupNameOrId
    )}/station/${encodeURIComponent(stationName)}`
  );
}

function addStationsToGroup(
  groupName: string | number,
  stations: { name: string; lat: number; lng: number }[],
  applyFromDate?: Date,
  applyUntilDate?: Date
) {
  const payload: {
    stations: string;
    fromDate?: string;
    untilDate?: string;
  } = {
    stations: JSON.stringify(stations),
  };
  if (applyFromDate) {
    payload["from-date"] = applyFromDate.toISOString();
    if (applyUntilDate) {
      payload["until-date"] = applyUntilDate.toISOString();
    }
  }
  return CacophonyApi.post(
    `/api/v1/groups/${encodeURIComponent(groupName)}/stations`,
    payload
  );
}

function updateGroupSettings(
  groupName: string | number,
  settings: ApiGroupSettings
) {
  return CacophonyApi.patch(`/api/v1/groups/${groupName}/group-settings`, {
    settings,
  });
}

export default {
  addNewGroup,
  getGroups,
  getGroup,
  getGroupById,
  getUsersForGroup,
  getDevicesForGroup,
  getStationsForGroup,
  getStationByNameInGroup,
  createStationInGroup,
  addStationsToGroup,
  addGroupUser,
  removeGroupUser,
  updateGroupSettings,
};
