import { type CacophonyApiClient, unwrapLoadedResource } from "./api";
import type { ApiLoggedInUserResponse } from "@typedefs/api/user";
import type { GroupId, UserId } from "@typedefs/api/common";
import {
  DEFAULT_AUTH_ID,
  type FetchResult,
  type JwtToken,
  type LoadedResource,
  type LoggedInUserWithCredentials,
  type TestHandle
} from "./types";
import type { UserGlobalPermission } from "@typedefs/api/consts";
import type { EndUserAgreementVersion } from "@typedefs/api/common";
import type { ApiUserSettings } from "@typedefs/api/user";
import type { ApiGroupResponse } from "@typedefs/api/group";
const NO_ABORT = false;

// FIXME: Move to globally exported types?
interface ApiLoggedInUserUpdates {
  email?: string;
  userName?: string;
  globalPermission?: UserGlobalPermission;
  endUserAgreement?: EndUserAgreementVersion;
  emailConfirmed?: boolean;
  settings?: ApiUserSettings;
}

const login = (api: CacophonyApiClient, authKey: TestHandle | null = null) => (userEmail: string, password: string) =>
  api.post(
    null,
    `${(authKey && authKey.includes("dev")) ? "https://api.cacophony.org.nz" : ""}/api/v1/users/authenticate`,
    {
      email: userEmail,
      password,
    },
  ) as Promise<
    FetchResult<LoggedInUserWithCredentials>
  >;

const refreshLogin = (api: CacophonyApiClient, _authKey: TestHandle | null = null) => (refreshToken: string) =>
  api.post(
    null,
    "/api/v1/users/refresh-session-token",
    {
      refreshToken,
    },
    NO_ABORT,
  ) as Promise<
    FetchResult<{
      token: JwtToken<UserId>;
      refreshToken: string;
    }>
  >;

const loginOther = (api: CacophonyApiClient, authKey: TestHandle | null = null) => (userName: string) =>
  api.post(authKey, "/api/v1/users/admin-authenticate-as-other-user", {
    name: userName,
  });

const sendPasswordResetRequest = (api: CacophonyApiClient, authKey: TestHandle | null = null) => (email: string) =>
  api.post(authKey, "/api/v1/users/reset-password", {
    email,
  }) as Promise<FetchResult<void>>;

const validatePasswordResetToken = (api: CacophonyApiClient, authKey: TestHandle | null = null) => (token: string) =>
  api.post(authKey, "/api/v1/users/validate-reset-token", {
    token,
  }) as Promise<
    FetchResult<{
      userData: ApiLoggedInUserResponse;
    }>
  >;

const validateEmailConfirmationToken = (api: CacophonyApiClient, authKey: TestHandle | null = null) => (token: string) =>
  api.post(authKey, "/api/v1/users/validate-email-confirmation-request", {
    emailConfirmationJWT: token,
  }) as Promise<
    FetchResult<{
      userData: ApiLoggedInUserResponse;
      token: JwtToken<UserId>;
      signOutUser: boolean;
      refreshToken: string;
    }>
  >;

const changePassword = (api: CacophonyApiClient, authKey: TestHandle | null = null) => (token: string, newPassword: string) =>
  api.patch(authKey, "/api/v1/users/change-password", {
    token: token,
    password: newPassword,
  }) as Promise<
    FetchResult<{ userData: ApiLoggedInUserResponse; token: JwtToken<UserId> }>
  >;

const resendAccountActivationEmail = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID)=> () =>
  api.post(
    authKey,
    "/api/v1/users/resend-email-confirmation-request",
  ) as Promise<FetchResult<void>>;

const changeAccountEmail = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => async (
  newEmailAddress: string,
): Promise<FetchResult<void>> => {
  const response = await updateUserFields(api,authKey)({ email: newEmailAddress });
  if (response.success) {
    // FIXME
    //const currentUser = CurrentUser.value as LoggedInUser;
    //currentUser.email = newEmailAddress;
    //setLoggedInUserData(currentUser);
  }
  return response;
};

const debugGetEmailConfirmationToken = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (email: string) =>
  api.post(authKey, "/api/v1/users/get-email-confirmation-token", {
    email,
  }) as Promise<FetchResult<{ token: string }>>;

const list = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => () =>
  api.get(authKey, "/api/v1/users/list-users") as Promise<
    FetchResult<{ usersList: ApiLoggedInUserResponse[] }>
  >;

const register = (api: CacophonyApiClient, authKey: TestHandle | null = null) => (
  userName: string,
  password: string,
  email: string,
  endUserAgreement: number | undefined,
) =>
  api.post(authKey, "/api/v1/users", {
    userName,
    password,
    endUserAgreement,
    email,
  }) as Promise<
    FetchResult<LoggedInUserWithCredentials>
  >;

const saveUserSettings = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (settings: ApiUserSettings) =>
  updateUserFields(api, authKey)({ settings });

const updateUserFields = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  fields: ApiLoggedInUserUpdates,
  abortable: boolean = NO_ABORT,
) => {
  const allowedFields = [
    "displayMode",
    "lastKnownTimezone",
    "currentSelectedGroup",
  ];
  if (fields.settings) {
    const toRemove = [];
    for (const field of Object.keys(fields.settings)) {
      if (!allowedFields.includes(field)) {
        toRemove.push(field);
      }
    }
    for (const field of toRemove) {
      delete (fields.settings as Record<string, unknown>)[field];
    }
  }
  return api.patch(authKey, "/api/v1/users", fields, abortable) as Promise<
    FetchResult<void>
  >;
};

const getEUAVersion = (api: CacophonyApiClient, authKey: TestHandle | null = null) => () =>
  api.get(authKey, "/api/v1/end-user-agreement/latest", NO_ABORT) as Promise<
    FetchResult<{ euaVersion: number }>
  >;

const getProjectsForProjectAdminByEmail = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  groupAdminEmail: string,
  abortable = NO_ABORT,
) =>
  api.get(
    authKey,
    `/api/v1/users/groups-for-admin-user/${encodeURIComponent(
      groupAdminEmail,
    )}`,
    abortable,
  ) as Promise<FetchResult<{ groups: ApiGroupResponse[] }>>;

const superUserGetProjectsForUserByEmail = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  userEmail: string,
  abortable = NO_ABORT,
): Promise<LoadedResource<ApiGroupResponse[]>> =>
  unwrapLoadedResource(
    api.get(
      authKey,
      `/api/v1/users/groups-for-user/${encodeURIComponent(userEmail)}`,
      abortable,
    ) as Promise<FetchResult<{ groups: ApiGroupResponse[] }>>,
    "groups",
  );

const requestToJoinProject = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  groupAdminEmail: string,
  groupId: GroupId,
  abortable = NO_ABORT,
) =>
  api.post(
    authKey,
    `/api/v1/users/request-group-membership`,
    {
      groupAdminEmail,
      groupId,
    },
    abortable,
  ) as Promise<FetchResult<void>>;

const acceptProjectInvitation = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (groupId: GroupId, abortable = false) =>
  api.post(
    authKey,
    `/api/v1/groups/${groupId}/accept-invitation`,
    {},
    abortable,
  ) as Promise<FetchResult<void>>;

const confirmAddToProjectRequest = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (
  membershipRequestJWT: string,
  abortable = NO_ABORT,
) =>
  api.post(
    authKey,
    `/api/v1/users/validate-group-membership-request`,
    {
      membershipRequestJWT,
    },
    abortable,
  ) as Promise<FetchResult<void>>;

export default (api: CacophonyApiClient) => {
  // NOTE: this is a bit tedious, but it makes the type inference work for the return type.
  return {
    confirmAddToProjectRequest: confirmAddToProjectRequest(api),
    acceptProjectInvitation: acceptProjectInvitation(api),
    requestToJoinProject: requestToJoinProject(api),
    superUserGetProjectsForUserByEmail: superUserGetProjectsForUserByEmail(api),
    list: list(api),
    register: register(api),
    refreshLogin: refreshLogin(api),
    sendPasswordResetRequest: sendPasswordResetRequest(api),
    debugGetEmailConfirmationToken: debugGetEmailConfirmationToken(api),
    resendAccountActivationEmail: resendAccountActivationEmail(api),
    changePassword: changePassword(api),
    validateEmailConfirmationToken: validateEmailConfirmationToken(api),
    login: login(api),
    loginDev: login(api, "dev"),
    loginOther: loginOther(api),
    saveUserSettings: saveUserSettings(api),
    updateUserFields: updateUserFields(api),
    getEUAVersion: getEUAVersion(api),
    getProjectsForProjectAdminByEmail: getProjectsForProjectAdminByEmail(api),
    validatePasswordResetToken: validatePasswordResetToken(api),
    changeAccountEmail: changeAccountEmail(api),
    withAuth: (authKey: TestHandle) => ({
      confirmAddToProjectRequest: confirmAddToProjectRequest(api, authKey),
      acceptProjectInvitation: acceptProjectInvitation(api, authKey),
      requestToJoinProject: requestToJoinProject(api, authKey),
      superUserGetProjectsForUserByEmail: superUserGetProjectsForUserByEmail(api, authKey),
      list: list(api, authKey),
      register: register(api, authKey),
      refreshLogin: refreshLogin(api, authKey),
      sendPasswordResetRequest: sendPasswordResetRequest(api, authKey),
      debugGetEmailConfirmationToken: debugGetEmailConfirmationToken(api, authKey),
      resendAccountActivationEmail: resendAccountActivationEmail(api, authKey),
      changePassword: changePassword(api, authKey),
      validateEmailConfirmationToken: validateEmailConfirmationToken(api, authKey),
      login: login(api, authKey),
      loginOther: loginOther(api, authKey),
      saveUserSettings: saveUserSettings(api, authKey),
      updateUserFields: updateUserFields(api, authKey),
      getEUAVersion: getEUAVersion(api, authKey),
      getProjectsForProjectAdminByEmail: getProjectsForProjectAdminByEmail(api, authKey),
      validatePasswordResetToken: validatePasswordResetToken(api, authKey),
      changeAccountEmail: changeAccountEmail(api, authKey),
    }),
  };
};
