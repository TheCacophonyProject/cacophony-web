import type { GroupId, UserId } from "@typedefs/api/common";
import type { HttpStatusCode } from "@typedefs/api/consts";

export type JwtToken<_T> = string;

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

type HttpSuccessCode = HttpStatusCode.Ok | HttpStatusCode.NotModified;
type HttpFailureCode =
  | HttpStatusCode.BadRequest
  | HttpStatusCode.AuthorizationError
  | HttpStatusCode.Forbidden
  | HttpStatusCode.Unprocessable
  | HttpStatusCode.ServerError;

interface SuccessFetchResult<SUCCESS> {
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
    | "refresh"
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

// NOTE: null means uninitialised, false means a failure occurred, undefined means loading in progress
export type LoadedResource<T> = null | false | undefined | T;
