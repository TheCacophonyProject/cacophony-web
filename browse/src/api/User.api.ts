import CacophonyApi from "./CacophonyApi";
import { FetchResult, JwtToken } from "@api/Recording.api";
import { ApiLoggedInUserResponse } from "@typedefs/api/user";
import { UserId } from "@typedefs/api/common";

function login(
  usernameOrEmail: string,
  password: string
): Promise<
  FetchResult<{ userData: ApiLoggedInUserResponse; token: JwtToken<UserId> }>
> {
  return CacophonyApi.post(
    "/authenticate_user",
    {
      nameOrEmail: usernameOrEmail,
      password: password,
    },
    true
  );
}

function loginOther(username) {
  return CacophonyApi.post("/admin_authenticate_as_other_user", {
    name: username,
  });
}

function reset(
  usernameOrEmail: string
): Promise<
  FetchResult<{ userData: ApiLoggedInUserResponse; token: JwtToken<UserId> }>
> {
  return CacophonyApi.post(
    "/reset",
    {
      nameOrEmail: usernameOrEmail,
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
      token: token,
    },
    true
  );
}

function changePassword(token: string, newPassword: string) {
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

function persistUser(
  username,
  token,
  email,
  globalPermission,
  userId,
  acceptedEUA
) {
  localStorage.setItem("userName", username);
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
function register(username, password, email, endUserAgreement) {
  return CacophonyApi.post("/api/v1/Users", {
    username: username,
    password: password,
    endUserAgreement: endUserAgreement,
    email: email,
  });
}
function updateFields(fields) {
  return CacophonyApi.patch("/api/v1/Users", fields);
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
  token,
  reset,
  validateToken,
  changePassword,
};
