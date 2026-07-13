import type { DeviceId, GroupId, SaltId, UserId } from "../api/common.js";
import type { HttpStatusCode } from "../api/consts.js";
import type { ApiLoggedInUserResponse } from "../api/user.js";
import type { ProjectId } from "../api/common.js";

export type JwtToken<_T> = string;
export type TestHandle = string;
export const DEFAULT_AUTH_ID = "default";
export interface TestUserHandle {
  id: UserId;
  testId: TestHandle;
  type: "user";
}
export interface TestDeviceHandle {
  id: DeviceId;
  testId: TestHandle;
  type: "device";
}
export interface TestProjectHandle {
  id: ProjectId;
  testId: TestHandle;
  type: "project";
}
export interface TestEntityHandle {
  id: number;
  testId: TestHandle;
  type: "user" | "device" | "project";
}

export interface LoggedInUserWithCredentials {
  userData: ApiLoggedInUserResponse;
  token: JwtToken<UserId>;
  refreshToken: string;
}

export interface LoggedInUserAuth {
  userData: ApiLoggedInUserResponse;
  apiToken: JwtToken<UserId>;
  refreshToken: string;
  refreshingToken?: Promise<boolean>;
  decodedToken?: JwtUserAuthTokenPayload;
}

export interface LoggedInUserAuthDeserialized extends LoggedInUserAuth {
  decodedToken: JwtUserAuthTokenPayload;
}

export interface LoggedInDeviceCredentials {
  id: DeviceId;
  saltId: SaltId;
  token: JwtToken<DeviceId>;
}

export interface FieldValidationError {
  msg: string;
  location: "body" | "query" | "param";
  param: string;
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

export type HttpSuccessCode = HttpStatusCode.Ok | HttpStatusCode.NotModified;
export type HttpFailureCode =
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

export interface JwtAcceptInviteTokenPayload extends JwtTokenPayload<
  "invite-new-user" | "invite-existing-user"
> {
  id: UserId | number;
  group: GroupId;
}

export type FetchResult<T> = SuccessFetchResult<T> | FailureFetchResult;
export type WrappedFetchResult<T> =
  | WrappedSuccessFetchResult<T>
  | FailureFetchResult;

// NOTE: null means uninitialised/loading in progress, false means a failure occurred.
export type LoadedResource<T> = null | false | T;
