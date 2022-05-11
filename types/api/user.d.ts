import {EndUserAgreementVersion, GroupId, UserId} from "./common";
import { UserGlobalPermission } from "./consts";

export interface ApiUserResponse {
  userName: string; // Username of user
  id: UserId; // Unique id of user
}

export interface ApiLoggedInUserResponse extends ApiUserResponse {
  email: string;
  firstName?: string;
  lastName?: string;
  globalPermission: UserGlobalPermission;
  endUserAgreement: EndUserAgreementVersion;
  emailConfirmed: boolean;
  settings?: ApiUserSettings;
}

export interface ApiUserSettings {
  // Define user-specific preferences.
  // Maybe define what mode the user wants to see their dashboard in, whether they prefer seeing
  // recordings or visits for that group?
  reports?: "recordings" | "visits";
  savedSearchQueries?: string[];
  displayMode?: "audio" | "thermal";
  viewAsSuperUser?: boolean;
  currentSelectedGroup?: {
    groupName: string;
    id: GroupId;
  }
}
