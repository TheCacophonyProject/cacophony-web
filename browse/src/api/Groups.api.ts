import CacophonyApi from "./CacophonyApi";
import { shouldViewAsSuperUser } from "../utils";
import { FetchResult } from "@/api/Recording.api";
import {
  ApiGroupResponse,
  ApiGroupUserRelationshipResponse,
} from "@typedefs/api/group";
import { ApiDeviceResponse } from "@typedefs/api/device";

function addNewGroup(groupName) {
  const suppressGlobalMessaging = true;
  return CacophonyApi.post(
    "/api/v1/groups",
    { groupname: groupName },
    suppressGlobalMessaging
  );
}

function addGroupUser(
  groupName,
  userName,
  isAdmin
): Promise<{ success: boolean; status: number; result: any }> {
  const suppressGlobalMessaging = true;
  return CacophonyApi.post(
    "/api/v1/groups/users",
    {
      group: groupName,
      username: userName,
      admin: isAdmin,
    },
    suppressGlobalMessaging
  );
}

function removeGroupUser(groupName, userName) {
  return CacophonyApi.delete("/api/v1/groups/users", {
    group: groupName,
    username: userName,
  });
}

function getGroup(
  groupName: string
): Promise<FetchResult<{ group: ApiGroupResponse }>> {
  return CacophonyApi.get(`/api/v1/groups/${encodeURIComponent(groupName)}`);
}

function getGroups(): Promise<FetchResult<{ groups: ApiGroupResponse[] }>> {
  return CacophonyApi.get(
    `/api/v1/groups${shouldViewAsSuperUser() ? "" : "?view-mode=user"}`
  );
}

function getUsersForGroup(
  groupNameOrId: string | number
): Promise<FetchResult<{ users: ApiGroupUserRelationshipResponse[] }>> {
  return CacophonyApi.get(
    `/api/v1/groups/${encodeURIComponent(groupNameOrId)}/users`
  );
}

function getDevicesForGroup(
  groupNameOrId: string | number
): Promise<FetchResult<{ devices: ApiDeviceResponse[] }>> {
  return CacophonyApi.get(
    `/api/v1/groups/${encodeURIComponent(groupNameOrId)}/devices`
  );
}

function getStationsForGroup(groupNameOrId: string) {
  return CacophonyApi.get(
    `/api/v1/groups/${encodeURIComponent(groupNameOrId)}/stations`
  );
}

function addStationsToGroup(
  groupName: string | number,
  stations: { name: string; lat: number; lng: number },
  applyFromDate?: Date
) {
  const payload: {
    stations: string;
    fromDate?: string;
  } = {
    stations: JSON.stringify(stations),
  };
  if (applyFromDate) {
    payload.fromDate = applyFromDate.toISOString();
  }
  return CacophonyApi.post(
    `/api/v1/groups/${encodeURIComponent(groupName)}/stations`,
    payload
  );
}

export default {
  addNewGroup,
  getGroups,
  getGroup,
  getUsersForGroup,
  getDevicesForGroup,
  getStationsForGroup,
  addStationsToGroup,
  addGroupUser,
  removeGroupUser,
};
