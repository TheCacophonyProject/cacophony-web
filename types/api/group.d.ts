import {GroupId} from "./common";
import {ApiUserResponse} from "./user";

export interface ApiGroupUserRelationshipResponse extends ApiUserResponse {
    isAdmin: boolean;
}

export interface ApiGroupResponse {
    groupId: GroupId;
    groupName: string;
}
