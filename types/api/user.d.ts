import type { EndUserAgreementVersion, GroupId, UserId } from "./common.ts";
import { UserGlobalPermission } from "./consts.js";

export interface ApiUserResponse {
  userName: string; // Full name of user
  id: UserId; // Unique id of user
  email?: string; // Email address of user (if superadmin)
}

export interface ApiLoggedInUserResponse extends ApiUserResponse {
  email: string;
  globalPermission: UserGlobalPermission;
  endUserAgreement: EndUserAgreementVersion;
  emailConfirmed: boolean;
  settings?: ApiUserSettings;
}

export interface ApiUserSettings {
  // Define user-specific preferences.
  // Maybe define what mode the user wants to see their dashboard in, whether they prefer seeing
  // recordings or visits for that group?  This can also be defined at a group by group level, and remembered there?
  displayMode?: "audio" | "thermal";
  lastKnownTimezone?: string;
  currentSelectedGroup?: {
    groupName: string;
    id: GroupId;
  };
}
