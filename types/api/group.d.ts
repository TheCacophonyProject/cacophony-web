import { GroupId, IsoFormattedDateString } from "./common";
import { ApiUserResponse } from "./user";

export interface ApiGroupUserRelationshipResponse extends ApiUserResponse {
  admin: boolean; // Is the user an admin of this group?
}

export interface ApiGroupResponse {
  id: GroupId; // Identifier of the group
  groupName: string; // Name of the group
  lastRecordingTime?: IsoFormattedDateString; // ISO formatted date string of time of last recording seen for group
  admin: boolean; // Is the calling user an admin of this group?
}
