import type { ApiLoggedInUserResponse } from "@typedefs/api/user";
import type { Ref } from "vue";
import type { ErrorResult } from "@api/types";
import { computed, reactive, ref } from "vue";
import { refreshLogin, login as userLogin } from "@api/User";

export interface LoggedInUser extends ApiLoggedInUserResponse {
  apiToken: string;
  expiry: Date;
  refreshToken: string;
}

export interface PendingRequest {
  requestPending: boolean;
  errors?: ErrorResult;
}

export const CurrentUser: Ref<LoggedInUser | null> = ref(null);

export const userIsLoggedIn = computed<boolean>({
  get: () => CurrentUser.value !== null,
  set: (val: boolean) => {
    if (!val) {
      CurrentUser.value = null;
    }
  },
});

export const setLoggedInUserData = (user: LoggedInUser) => {
  CurrentUser.value = reactive<LoggedInUser>(user);
  persistUser(CurrentUser.value);
  refreshCredentialsAtIn(
    CurrentUser.value.expiry.getTime() - new Date().getTime()
  );
};

export const login = async (
  userEmailAddress: string,
  userPassword: string,
  signInInProgress: PendingRequest
) => {
  const emailAddress = userEmailAddress.trim();
  const password = userPassword.trim();
  signInInProgress.requestPending = true;
  const loggedInUserResponse = await userLogin(emailAddress, password);
  if (loggedInUserResponse.success) {
    const signedInUser = loggedInUserResponse.result;
    setLoggedInUserData({
      ...signedInUser.userData,
      apiToken: signedInUser.token,
      refreshToken: signedInUser.refreshToken,
      expiry: new Date(signedInUser.expiry),
    });
  } else {
    signInInProgress.errors = loggedInUserResponse.result;
  }
  signInInProgress.requestPending = false;
};

export const persistUser = (currentUser: LoggedInUser) => {
  // NOTE: These credentials have already been validated.
  window.localStorage.setItem(
    "saved-login-credentials",
    JSON.stringify(currentUser)
  );
};

const refreshCredentials = async () => {
  // NOTE: Because this can be shared between browser windows/tabs,
  //  always pull out the localStorage version before refreshing
  const rememberedCredentials = window.localStorage.getItem(
    "saved-login-credentials"
  );
  if (rememberedCredentials) {
    let currentUser;
    const now = new Date();
    try {
      currentUser = JSON.parse(rememberedCredentials);
      currentUser.expiry = new Date(currentUser.expiry);
      if (currentUser.expiry > now) {
        // Use existing credentials, setup refresh timer.
        refreshCredentialsAtIn(currentUser.expiry.getTime() - now.getTime());
        CurrentUser.value = reactive<LoggedInUser>(currentUser);
        return;
      } else {
        const refreshedUserResult = await refreshLogin(
          currentUser.refreshToken
        );
        if (refreshedUserResult.success) {
          const refreshedUser = refreshedUserResult.result;
          setLoggedInUserData({
            ...refreshedUser.userData,
            apiToken: refreshedUser.token,
            refreshToken: refreshedUser.refreshToken,
            expiry: new Date(refreshedUser.expiry),
          });
        } else {
          // Refresh token wasn't found, so prompt login again
          forgetUserOnCurrentDevice();
        }
      }
    } catch (e) {
      // JSON user creds was malformed, so clear it, and prompt login again
      forgetUserOnCurrentDevice();
    }
  }
};

let refreshTimeout = -1;
const refreshCredentialsAtIn = (milliseconds: number) => {
  clearTimeout(refreshTimeout);
  refreshTimeout = setTimeout(refreshCredentials, milliseconds);
};

export const tryLoggingInRememberedUser = async (isLoggingIn: Ref<boolean>) => {
  isLoggingIn.value = true;
  await refreshCredentials();
  isLoggingIn.value = false;
};

export const forgetUserOnCurrentDevice = () => {
  window.localStorage.clear();
};
