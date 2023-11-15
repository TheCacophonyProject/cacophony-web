import CacophonyApi from "./api";
import type { ApiLoggedInUserResponse } from "@typedefs/api/user";
import type { GroupId, UserId } from "@typedefs/api/common";
import type { FetchResult, JwtToken } from "@api/types";
import type { UserGlobalPermission } from "@typedefs/api/consts";
import type { EndUserAgreementVersion } from "@typedefs/api/common";
import type { ApiUserSettings } from "@typedefs/api/user";
import type { ApiGroupResponse } from "@typedefs/api/group";
import { CurrentUser, setLoggedInUserData } from "@models/LoggedInUser";
import type { LoggedInUser } from "@models/LoggedInUser";

const NO_ABORT = false;

export const login = (userEmail: string, password: string) =>
  CacophonyApi.post("/api/v1/users/authenticate", {
    email: userEmail,
    password,
  }) as Promise<
    FetchResult<{
      userData: ApiLoggedInUserResponse;
      token: JwtToken<UserId>;
      refreshToken: string;
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
      token: JwtToken<UserId>;
      refreshToken: string;
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
  }) as Promise<
    FetchResult<{
      userData: ApiLoggedInUserResponse;
    }>
  >;

export const validateEmailConfirmationToken = (token: string) =>
  CacophonyApi.post("/api/v1/users/validate-email-confirmation-request", {
    emailConfirmationJWT: token,
  }) as Promise<
    FetchResult<{
      userData: ApiLoggedInUserResponse;
      token: JwtToken<UserId>;
      signOutUser: boolean;
      refreshToken: string;
    }>
  >;

export const changePassword = (token: string, newPassword: string) =>
  CacophonyApi.patch("/api/v1/users/change-password", {
    token: token,
    password: newPassword,
  }) as Promise<
    FetchResult<{ userData: ApiLoggedInUserResponse; token: JwtToken<UserId> }>
  >;

export const resendAccountActivationEmail = () =>
  CacophonyApi.post(
    "/api/v1/users/resend-email-confirmation-request"
  ) as Promise<FetchResult<void>>;

export const changeAccountEmail = async (
  newEmailAddress: string
): Promise<FetchResult<void>> => {
  const response = await updateUserFields({ email: newEmailAddress });
  if (response.success) {
    const currentUser = CurrentUser.value as LoggedInUser;
    currentUser.email = newEmailAddress;
    setLoggedInUserData(currentUser);
  }
  return response;
};

export const debugGetEmailConfirmationToken = (email: string) =>
  CacophonyApi.post("/api/v1/users/get-email-confirmation-token", {
    email,
  }) as Promise<FetchResult<{ token: string }>>;

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
    }>
  >;

interface ApiLoggedInUserUpdates {
  email?: string;
  userName?: string;
  globalPermission?: UserGlobalPermission;
  endUserAgreement?: EndUserAgreementVersion;
  emailConfirmed?: boolean;
  settings?: ApiUserSettings;
}

export const saveUserSettings = (settings: ApiUserSettings) =>
  updateUserFields({ settings }, false);

export const updateUserFields = (
  fields: ApiLoggedInUserUpdates,
  abortable?: boolean
) =>
  CacophonyApi.patch("/api/v1/users", fields, abortable) as Promise<
    FetchResult<void>
  >;

export const getEUAVersion = () =>
  CacophonyApi.get("/api/v1/end-user-agreement/latest", NO_ABORT) as Promise<
    FetchResult<{ euaVersion: number }>
  >;

export const getProjectsForProjectAdminByEmail = (
  groupAdminEmail: string,
  abortable = false
) =>
  CacophonyApi.get(
    `/api/v1/users/groups-for-admin-user/${encodeURIComponent(
      groupAdminEmail
    )}`,
    abortable
  ) as Promise<FetchResult<{ groups: ApiGroupResponse[] }>>;

export const requestToJoinGroup = (
  groupAdminEmail: string,
  groupId: GroupId,
  abortable = false
) =>
  CacophonyApi.post(
    `/api/v1/users/request-group-membership`,
    {
      groupAdminEmail, 
      groupId,
    },
    abortable
  ) as Promise<FetchResult<void>>;

export const acceptProjectInvitation = (groupId: GroupId, abortable = false) =>
  CacophonyApi.post(
    `/api/v1/groups/${groupId}/accept-invitation`,
    {},
    abortable
  ) as Promise<FetchResult<void>>;

export const confirmAddToProjectRequest = (membershipRequestJWT: string, abortable = false) =>
  CacophonyApi.post(
    `/api/v1/users/validate-group-membership-request`,
    {
      membershipRequestJWT
    },
    abortable
  ) as Promise<FetchResult<void>>;
