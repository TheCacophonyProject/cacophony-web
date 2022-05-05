import type {
  ApiLoggedInUserResponse,
  ApiUserSettings,
} from "@typedefs/api/user";
import type { Ref } from "vue";
import type { ErrorResult } from "@api/types";
import { computed, reactive, ref } from "vue";
import { refreshLogin, login as userLogin } from "@api/User";
import type { GroupId } from "@typedefs/api/common";
import type {ApiGroupResponse} from "@typedefs/api/group";

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
export const UserGroups: Ref<ApiGroupResponse[] | null> = ref(null);
// TODO - Test opening a whole lot of tabs, print who wins the tokenRefresh race in the page title

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
        console.log("Refresh login");
        const refreshedUserResult = await refreshLogin(
          currentUser.refreshToken
        );
        if (refreshedUserResult.success) {
          const refreshedUser = refreshedUserResult.result;
          setLoggedInUserData({
            ...currentUser,
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

// User blocking action checks
export const currentEUAVersion = ref(0);

export const hasAcceptedSomeEUA = computed<boolean>(() => {
  return !!CurrentUser.value?.endUserAgreement;
});

export const euaIsOutOfDate = computed<boolean>(() => {
  return (
    (userIsLoggedIn.value && !hasAcceptedSomeEUA.value) ||
    (currentEUAVersion.value !== 0 &&
      currentEUAVersion.value >
        (CurrentUser.value as LoggedInUser).endUserAgreement)
  );
});

export const currentUserSettings = computed<ApiUserSettings | false>(() => {
  if (userIsLoggedIn.value) {
    return (CurrentUser.value as LoggedInUser).settings || false;
  }
  return false;
});

export const currentSelectedGroup = computed<
  { groupName: string; id: GroupId } | false
>(() => {
  if (userIsLoggedIn.value && currentUserSettings.value) {
    return currentUserSettings.value.currentSelectedGroup || false;
  }
  return false;
});

export const shouldViewAsSuperUser = computed<boolean>(() => {
  if (userIsLoggedIn.value && currentUserSettings.value) {
    return currentUserSettings.value.viewAsSuperUser || false;
  }
  return false;
});
