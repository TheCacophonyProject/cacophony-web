import {GroupId} from "./common";
import {ApiUserResponse} from "./user";

export interface ApiGroupUserRelationshipResponse extends ApiUserResponse {
    admin: boolean;
}

export interface ApiGroupResponse {
    id: GroupId;
    groupName: string;
    admin: boolean;
}
