import type { DeviceId, GroupId, SaltId, StationId as LocationId, UserId } from "@typedefs/api/common";
import type { HttpStatusCode } from "@typedefs/api/consts";
import type { ApiLoggedInUserResponse } from "../api/user";
import { RecordingType, TagMode } from "../api/consts";
import type { ApiRecordingResponse } from "../api/recording";
import type { IsoFormattedString } from "../api/event";

export type JwtToken<_T> = string;
export type TestHandle = string;
export const DEFAULT_AUTH_ID = "default";
export type UserName = TestHandle;
export type DeviceName = TestHandle;
export type ProjectName = TestHandle;

export interface LoggedInUserWithCredentials {
  userData: ApiLoggedInUserResponse;
  token: JwtToken<UserId>;
  refreshToken: string;
}

export interface LoggedInUserAuth {
  userData: ApiLoggedInUserResponse;
  apiToken: JwtToken<UserId>;
  refreshToken: string;
  decodedToken?: JwtUserAuthTokenPayload,
}

export interface LoggedInUserAuthDeserialized extends LoggedInUserAuth {
  decodedToken: JwtUserAuthTokenPayload,
}

export interface LoggedInDeviceCredentials {
  id: DeviceId,
  saltId: SaltId,
  token: JwtToken<DeviceId>
}

export interface FieldValidationError {
  msg: string;
  location: "body" | "query" | "param";
  param: string;
}

export interface BatteryInfoEvent {
  dateTime: IsoFormattedString | Date;
  voltage: number | null;
  battery: number | null;
  batteryType: "unknown" | "lime" | "mains" | "li-ion";
}

export interface ErrorResult {
  messages: string[];
  errors?: string[] | FieldValidationError[];
  errorType?: string;
}

export interface ValidationErrorResult extends ErrorResult {
  messages: string[];
  errors: FieldValidationError[];
  errorType?: "validation";
}

type HttpSuccessCode = HttpStatusCode.Ok | HttpStatusCode.NotModified;
type HttpFailureCode =
  | HttpStatusCode.BadRequest
  | HttpStatusCode.AuthorizationError
  | HttpStatusCode.Forbidden
  | HttpStatusCode.Unprocessable
  | HttpStatusCode.ServerError;

export interface SuccessFetchResult<SUCCESS> {
  result: SUCCESS;
  status: HttpSuccessCode;
  success: true;
}

interface WrappedSuccessFetchResult<SUCCESS> {
  result: Record<string, SUCCESS>;
  status: HttpSuccessCode;
  success: true;
}

interface FailureFetchResult<FAILURE = ErrorResult> {
  result: FAILURE;
  status: HttpFailureCode;
  success: false;
}

export interface JwtTokenPayload<
  T =
    | "user"
    | "device"
    | "reset-password"
    | "confirm-email"
    | "join-group"
    | "invite-new-user"
    | "invite-existing-user"
    | "refresh",
> {
  exp: number;
  iat: number;
  _type: T;
  createdAt: Date;
  expiresAt: Date;
}

export interface JwtUserAuthTokenPayload extends JwtTokenPayload<"user"> {
  id: UserId;
}

export interface JwtAcceptInviteTokenPayload
  extends JwtTokenPayload<"invite-new-user" | "invite-existing-user"> {
  id: UserId | number;
  group: GroupId;
}

export type FetchResult<T> = SuccessFetchResult<T> | FailureFetchResult;
export type WrappedFetchResult<T> =
  | WrappedSuccessFetchResult<T>
  | FailureFetchResult;

// NOTE: null means uninitialised/loading in progress, false means a failure occurred.
export type LoadedResource<T> = null | false | T;
