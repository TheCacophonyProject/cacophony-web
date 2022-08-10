import CacophonyApi from "./CacophonyApi";
import { FetchResult, JwtToken } from "@api/Recording.api";
import { ApiLoggedInUserResponse } from "@typedefs/api/user";
import { UserId } from "@typedefs/api/common";
import { UserGlobalPermission } from "@typedefs/api/consts";

function login(
  email: string,
  password: string
): Promise<
  FetchResult<{ userData: ApiLoggedInUserResponse; token: JwtToken<UserId> }>
> {
  return CacophonyApi.post(
    "/authenticate_user",
    {
      email,
      password,
    },
    true
  );
}

function loginOther(email) {
  return CacophonyApi.post("/admin_authenticate_as_other_user", {
    email,
  });
}

function reset(email: string): Promise<FetchResult<{}>> {
  return CacophonyApi.post(
    "/resetpassword",
    {
      email,
    },
    true
  );
}

function validateToken(
  token: string
): Promise<
  FetchResult<{ userData: ApiLoggedInUserResponse; token: JwtToken<UserId> }>
> {
  return CacophonyApi.post(
    "/validateToken",
    {
      token,
    },
    true
  );
}

function changePassword(
  token: string,
  newPassword: string
): Promise<
  FetchResult<{ userData: ApiLoggedInUserResponse; token: JwtToken<UserId> }>
> {
  return CacophonyApi.patch("/api/v1/Users/changePassword", {
    token: token,
    password: newPassword,
  });
}

function list(): Promise<
  FetchResult<{ usersList: ApiLoggedInUserResponse[] }>
> {
  return CacophonyApi.get("/api/v1/listUsers");
}

interface UserData {
  id: number;
  userName: string;
  email: string;
  globalPermission: UserGlobalPermission;
  endUserAgreement: number;
  emailConfirmed: boolean;
  settings?: {
    reports: object;
    savedSearchQueries: object[];
    displayMode: object;
    viewAsSuperUser: boolean;
    currentSelectedGroup?: {
      groupName: string;
      id: number;
    };
  };
}

function getUserDetails(
  id: string
): Promise<FetchResult<{ userData: UserData }>> {
  return CacophonyApi.get(`/api/v1/users/${id}`);
}

function persistUser(
  userName,
  token,
  email,
  globalPermission,
  userId,
  acceptedEUA
) {
  localStorage.setItem("userName", userName);
  localStorage.setItem("JWT", token);
  localStorage.setItem("email", email);
  localStorage.setItem("globalPermission", globalPermission);
  localStorage.setItem("userId", userId);
  localStorage.setItem("acceptedEUA", acceptedEUA);
}

function persistFields(data) {
  for (const key in data) {
    localStorage.setItem(key, data[key]);
  }
}
function logout() {
  localStorage.removeItem("userName");
  localStorage.removeItem("userId");
  localStorage.removeItem("JWT");
  localStorage.removeItem("email");
  localStorage.removeItem("globalPermission");
  localStorage.removeItem("acceptedEUA");
  localStorage.removeItem("superUserCreds");
}
function register(userName, password, email, endUserAgreement) {
  return CacophonyApi.post("/api/v1/users", {
    userName,
    password,
    endUserAgreement,
    email,
  });
}
function updateFields(fields) {
  return CacophonyApi.patch("/api/v1/users", fields);
}
function getEUAVersion() {
  return CacophonyApi.get("/api/v1/endUserAgreement/latest");
}

async function token() {
  // Params must include where (stringified JSON), limit, offset
  // Params can also include tagMode, tags, order

  // FIXME - does this endpoint exist anymore?
  const { result, success } = await CacophonyApi.post("/token");
  if (!success) {
    throw "Failed to get token";
  }
  return result.token;
}

export default {
  login,
  loginOther,
  persistUser,
  list,
  logout,
  register,
  updateFields,
  persistFields,
  getEUAVersion,
  getUserDetails,
  token,
  reset,
  validateToken,
  changePassword,
};
