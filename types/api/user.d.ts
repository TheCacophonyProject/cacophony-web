import {EndUserAgreementVersion, UserId} from "./common";

export interface ApiUserResponse {
    userName: string;
    id: UserId;
}

export interface ApiLoggedInUserResponse extends ApiUserResponse {
    email: string;
    firstName?: string;
    lastName?: string;
    globalPermission: "write" | "read" | "off";
    endUserAgreement: EndUserAgreementVersion;
}
