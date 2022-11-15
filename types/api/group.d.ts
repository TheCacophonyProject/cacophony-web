import { GroupId, IsoFormattedDateString, UserId } from "./common";
import { ApiUserResponse } from "./user";

export interface ApiGroupUserResponse {
  userName: string; // Full name of user, or email address of invited user.
  id?: UserId; // Unique id of user, if they're not an invited user.
  admin: boolean; // Is the user an admin of this group?
  owner: boolean; // Is the user an owner of this group?
  pending: null | "invited" | "requested"; // Has the user been invited to the group, but not accepted yet?  Has the user requested to join the group?
}

export interface ApiGroupResponse {
  id: GroupId; // Identifier of the group
  groupName: string; // Name of the group
  lastThermalRecordingTime?: IsoFormattedDateString; // ISO formatted date string of time of last thermal recording seen for group
  lastAudioRecordingTime?: IsoFormattedDateString; // ISO formatted date string of time of last audio recording seen for group
  admin: boolean; // Is the calling user an admin of this group?
  owner: boolean; // Is the calling user an owner of this group?
  settings?: ApiGroupSettings;
  userSettings?: ApiGroupUserSettings;
}

export interface ApiGroupSettings {
  // Define group-specific tagging preferences.
  // Define if cameras are on 24/7?
  tags?: string[];
  audioTags?: string[];
}

export interface ApiGroupUserSettings {
  // Define user-specific tagging preferences for the group.
  // Maybe define what mode the user wants to see their dashboard in, whether they prefer seeing
  // recordings or visits for that group?
  displayMode?: "recordings" | "visits";
  tags?: string[];
  audioTags?: string[];
}
