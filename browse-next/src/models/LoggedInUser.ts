import type {
  ApiLoggedInUserResponse,
  ApiUserSettings,
} from "@typedefs/api/user";
import type { Ref } from "vue";
import type { ErrorResult, JwtTokenPayload } from "@api/types";
import { computed, reactive, ref } from "vue";
import { refreshLogin, login as userLogin, saveUserSettings } from "@api/User";
import type { GroupId } from "@typedefs/api/common";
import type { ApiGroupResponse } from "@typedefs/api/group";
import { decodeJWT, urlNormaliseGroupName } from "@/utils";

export interface LoggedInUser extends ApiLoggedInUserResponse {
  apiToken: string;
  refreshToken: string;
  refreshingToken: boolean;
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

export const userHasGroups = computed<boolean>(() => {
  return UserGroups.value !== null && UserGroups.value.length !== 0;
});

export const setLoggedInUserData = (user: LoggedInUser) => {
  let prevUserData = CurrentUser.value;
  if (prevUserData) {
    try {
      prevUserData = JSON.parse(JSON.stringify(prevUserData)) as LoggedInUser;
      if (prevUserData.settings && user.settings) {
        if (
          prevUserData.settings.currentSelectedGroup?.id !==
          user.settings.currentSelectedGroup?.id
        ) {
          // Update settings on server?
          saveUserSettings(user.settings).then((response) => {
            console.log("User settings updated", response);
          });
        }
        // Check to see if new user values have settings changed.
        // If so, persist to the server.
      }
    } catch (e) {
      // Shouldn't get malformed json errors here.
      debugger;
    }
  }

  CurrentUser.value = reactive<LoggedInUser>(user);
  persistUser(CurrentUser.value);
  const apiToken = decodeJWT(CurrentUser.value?.apiToken) as JwtTokenPayload;
  if (!CurrentUser.value?.refreshingToken) {
    refreshCredentialsAtIn(
      apiToken?.expiresAt.getTime() - new Date().getTime() - 5000
    );
  }
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
      refreshingToken: false,
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

export const refreshLocallyStoredUserActivation = (): boolean => {
  const rememberedCredentials = window.localStorage.getItem(
    "saved-login-credentials"
  );
  if (rememberedCredentials) {
    let currentUser;
    try {
      currentUser = JSON.parse(rememberedCredentials);
      if (currentUser.emailConfirmed) {
        currentUser.expiry = new Date(currentUser.expiry);
        setLoggedInUserData({
          ...currentUser,
        });
        return true;
      }
    } catch (e) {
      forgetUserOnCurrentDevice();
    }
  }
  return false;
};

const refreshCredentials = async () => {
  // NOTE: Because this can be shared between browser windows/tabs,
  //  always pull out the localStorage version before refreshing
  const rememberedCredentials = window.localStorage.getItem(
    "saved-login-credentials"
  );
  if (rememberedCredentials) {
    console.log("-- Resuming from saved credentials");
    let currentUser;
    const now = new Date();
    try {
      currentUser = JSON.parse(rememberedCredentials) as LoggedInUser;
      const currentToken = currentUser.apiToken;
      const apiToken = decodeJWT(currentToken) as JwtTokenPayload;
      if (apiToken.expiresAt.getTime() > now.getTime() + 5000) {
        // Use existing credentials, setup refresh timer to refresh just before the token expires, so there's
        // no noticeable interruption to service.
        refreshCredentialsAtIn(
          apiToken.expiresAt.getTime() - now.getTime() - 5000
        );
        CurrentUser.value = reactive<LoggedInUser>(currentUser);
        return;
      } else {
        ///setLoggedInUserData({ ...currentUser, refreshingToken: false });
        if (!currentUser.refreshingToken) {
          //clearTimeout(refreshTimeout);
          setLoggedInUserData({ ...currentUser, refreshingToken: true });
          const refreshedUserResult = await refreshLogin(
            currentUser.refreshToken
          );
          if (refreshedUserResult.success) {
            const refreshedUser = refreshedUserResult.result;
            setLoggedInUserData({
              ...currentUser,
              apiToken: refreshedUser.token,
              refreshToken: refreshedUser.refreshToken,
              refreshingToken: false,
            });
          } else {
            // Refresh token wasn't found, so prompt login again
            forgetUserOnCurrentDevice();
          }
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
  milliseconds = Math.max(1000, milliseconds);
  console.log("Setting refresh in", milliseconds);
  clearTimeout(refreshTimeout);
  refreshTimeout = setTimeout(refreshCredentials, milliseconds);
};

export const tryLoggingInRememberedUser = async (isLoggingIn: Ref<boolean>) => {
  isLoggingIn.value = true;
  await refreshCredentials();
  isLoggingIn.value = false;
};

export const forgetUserOnCurrentDevice = () => {
  console.log("Signing out");
  window.localStorage.clear();
  CurrentUser.value = null;
};

export const switchCurrentGroup = (newGroup: {
  groupName: string;
  id: GroupId;
}) => {
  // Save the current (new) group to the local user settings, and persist it to the server.
  const loggedInUser = CurrentUser.value as LoggedInUser;
  if (newGroup.id !== loggedInUser.settings?.currentSelectedGroup?.id) {
    setLoggedInUserData({
      ...loggedInUser,
      settings: {
        ...(loggedInUser.settings as ApiUserSettings),
        currentSelectedGroup: newGroup,
      },
    });
  }
};

// User blocking action checks
export const currentEUAVersion = ref(0);

export const hasAcceptedSomeEUA = computed<boolean>(() => {
  return !!CurrentUser.value?.endUserAgreement;
});

export const euaIsOutOfDate = computed<boolean>(() => {
  return (
    (userIsLoggedIn.value && !hasAcceptedSomeEUA.value) ||
    (userIsLoggedIn.value &&
      currentEUAVersion.value !== 0 &&
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
  { groupName: string; id: GroupId; admin?: boolean } | false
>(() => {
  if (userIsLoggedIn.value && currentUserSettings.value) {
    if (UserGroups.value && UserGroups.value?.length === 0) {
      return false;
    }
    if (
      UserGroups.value &&
      UserGroups.value?.length !== 0 &&
      currentUserSettings.value.currentSelectedGroup
    ) {
      const potentialGroupId =
        currentUserSettings.value.currentSelectedGroup.id;
      const matchedGroup = (UserGroups.value as ApiGroupResponse[]).find(
        ({ id }) => id === potentialGroupId
      );
      if (!matchedGroup) {
        return false;
      }
    }

    return (
      currentUserSettings.value.currentSelectedGroup ||
      (UserGroups.value &&
        UserGroups.value.length !== 0 && {
          id: UserGroups.value[0].id,
          groupName: UserGroups.value[0].groupName,
        }) ||
      false
    );
  }
  return (
    (UserGroups.value &&
      UserGroups.value?.length !== 0 && {
        id: UserGroups.value[0].id,
        groupName: UserGroups.value[0].groupName,
      }) ||
    false
  );
});

export const userIsAdminForCurrentSelectedGroup = computed<boolean>(() => {
  if (currentSelectedGroup.value && UserGroups.value) {
    const currentGroup = UserGroups.value.find(
      ({ id }) =>
        id ===
        (currentSelectedGroup.value as { groupName: string; id: GroupId }).id
    );
    return (currentGroup && !!currentGroup.admin) || false;
  }
  return false;
});

export const userHasMultipleGroups = computed<boolean>(() => {
  return (UserGroups.value && UserGroups.value?.length > 1) || false;
});

export const shouldViewAsSuperUser = computed<boolean>(() => {
  if (userIsLoggedIn.value && currentUserSettings.value) {
    return currentUserSettings.value.viewAsSuperUser || false;
  }
  return false;
});

// TODO - If viewing other user as super user, return appropriate naem
export const userDisplayName = computed<string>(() => {
  if (userIsLoggedIn.value) {
    return CurrentUser.value?.firstName || CurrentUser.value?.userName || "";
  }
  return "";
});

export const userHasConfirmedEmailAddress = computed<boolean>(() => {
  if (userIsLoggedIn.value) {
    return CurrentUser.value?.emailConfirmed || false;
  }
  return false;
});

export const urlNormalisedCurrentGroupName = computed<string>(
  () =>
    (currentSelectedGroup.value &&
      urlNormaliseGroupName(currentSelectedGroup.value.groupName)) ||
    ""
);

export const isResumingSession = ref(false);

export const isLoggingInAutomatically = ref(false);
export const isFetchingGroups = ref(false);

// Global modal control
export const creatingNewGroup = reactive({
  enabled: false,
  visible: false,
});
export const joiningNewGroup = reactive({ enabled: false, visible: false });
export const showSwitchGroup = reactive({ enabled: false, visible: false });
export const pinSideNav = ref(false);

// On load:
{
  const rememberedCredentials = window.localStorage.getItem(
    "saved-login-credentials"
  );
  if (rememberedCredentials) {
    let currentUser;
    try {
      currentUser = JSON.parse(rememberedCredentials) as LoggedInUser;
      window.localStorage.setItem(
        "saved-login-credentials",
        JSON.stringify({ ...currentUser, refreshingToken: false })
      );
    } catch (e) {
      forgetUserOnCurrentDevice();
    }
  }
}
