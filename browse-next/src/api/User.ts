import CacophonyApi from "./api";
import type { ApiLoggedInUserResponse } from "@typedefs/api/user";
import type { IsoFormattedDateString, UserId } from "@typedefs/api/common";
import type { FetchResult, JwtToken } from "@api/types";
import type { UserGlobalPermission } from "@typedefs/api/consts";
import type { EndUserAgreementVersion } from "@typedefs/api/common";
import type { ApiUserSettings } from "@typedefs/api/user";

const NO_ABORT = false;

export const login = (userEmail: string, password: string) =>
  CacophonyApi.post("/api/v1/users/authenticate", {
    email: userEmail,
    password, // Hashed password using some salt known to the client and the server (time-based?)
  }) as Promise<
    FetchResult<{
      userData: ApiLoggedInUserResponse;
      token: JwtToken<UserId>;
      refreshToken: string;
      expiry: IsoFormattedDateString;
    }>
  >;

export const refreshLogin = (refreshToken: string) =>
  CacophonyApi.post(
    "/api/v1/users/refresh-session-token",
    {
      refreshToken,
    },
    NO_ABORT
  ) as Promise<
    FetchResult<{
      userData: ApiLoggedInUserResponse;
      token: JwtToken<UserId>;
      refreshToken: string;
      expiry: IsoFormattedDateString;
    }>
  >;

export const loginOther = (userName: string) =>
  CacophonyApi.post("/api/v1/users/admin-authenticate-as-other-user", {
    name: userName,
  });

export const resetPassword = (email: string) =>
  CacophonyApi.post("/api/v1/users/reset-password", {
    email,
  }) as Promise<FetchResult<void>>;

export const validatePasswordResetToken = (token: string) =>
  CacophonyApi.post("/api/v1/users/validate-reset-token", {
    token,
  }) as Promise<FetchResult<{ userData: ApiLoggedInUserResponse }>>;

export const changePassword = (token: string, newPassword: string) =>
  CacophonyApi.patch("/api/v1/users/change-password", {
    token: token,
    password: newPassword,
  }) as Promise<
    FetchResult<{ userData: ApiLoggedInUserResponse; token: JwtToken<UserId> }>
  >;

export const list = () =>
  CacophonyApi.get("/api/v1/list-users") as Promise<
    FetchResult<{ usersList: ApiLoggedInUserResponse[] }>
  >;

export const register = (
  userName: string,
  password: string,
  email: string,
  endUserAgreement: number | undefined
) =>
  CacophonyApi.post("/api/v1/users", {
    userName,
    password,
    endUserAgreement,
    email,
  }) as Promise<
    FetchResult<{
      userData: ApiLoggedInUserResponse;
      token: JwtToken<UserId>;
      refreshToken: string;
      expiry: IsoFormattedDateString;
    }>
  >;

interface ApiLoggedInUserUpdates {
  email?: string;
  firstName?: string;
  lastName?: string;
  globalPermission?: UserGlobalPermission;
  endUserAgreement?: EndUserAgreementVersion;
  emailConfirmed?: boolean;
  settings?: ApiUserSettings;
}

export const updateFields = (fields: ApiLoggedInUserUpdates) =>
  CacophonyApi.patch("/api/v1/users", fields);

export const getEUAVersion = () =>
  CacophonyApi.get("/api/v1/end-user-agreement/latest", NO_ABORT) as Promise<
    FetchResult<{ euaVersion: number }>
  >;

export const token = async () => {
  // Params must include where (stringified JSON), limit, offset
  // Params can also include tagMode, tags, order

  // FIXME - does this endpoint exist anymore?
  const response = (await CacophonyApi.post("/token")) as FetchResult<any>;
  const { result, success } = response;
  if (!success) {
    throw "Failed to get token";
  }
  return result.token;
};