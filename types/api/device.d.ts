import {DeviceId, GroupId, SaltId} from "./common";
import {ApiUserResponse} from "./user";

export interface ApiDeviceUserRelationshipResponse extends ApiUserResponse {
  admin: boolean;
  relation: "group" | "device";
}

export interface ApiDeviceResponse {
  deviceName: string;
  groupName: string;
  groupId: GroupId;
  id: DeviceId;
  saltId: SaltId;
  active: boolean;
  admin: boolean;
  users?: ApiDeviceUserRelationshipResponse[]
}
