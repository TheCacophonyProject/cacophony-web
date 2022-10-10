import type {
  ApiLoggedInUserResponse,
  ApiUserSettings,
} from "@typedefs/api/user";
import type { Ref } from "vue";
import type { ErrorResult, JwtTokenPayload } from "@api/types";
import { computed, reactive, ref } from "vue";
import { login as userLogin, saveUserSettings } from "@api/User";
import type { GroupId } from "@typedefs/api/common";
import type { ApiGroupResponse } from "@typedefs/api/group";
import { decodeJWT, urlNormaliseGroupName } from "@/utils";
import { CurrentViewAbortController } from "@/router";
import { maybeRefreshStaleCredentials } from "@api/fetch";
import { useWindowSize } from "@vueuse/core";

export interface LoggedInUserAuth {
  apiToken: string;
  refreshToken: string;
  refreshingToken: boolean;
}

export type LoggedInUser = ApiLoggedInUserResponse;

export interface PendingRequest {
  requestPending: boolean;
  errors?: ErrorResult;
}

export const CurrentUserCreds: Ref<LoggedInUserAuth | null> = ref(null);
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

export const setLoggedInUserCreds = (creds: LoggedInUserAuth) => {
  CurrentUserCreds.value = reactive<LoggedInUserAuth>(creds);
  persistCreds(CurrentUserCreds.value);
};

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
            console.warn("User settings updated", response);
          });
        }
        // Check to see if new user values have settings changed.
        // If so, persist to the server.
      }
    } catch (e) {
      // Shouldn't get malformed json errors here.
      console.error("Shouldn't get malformed json errors here.", e);
    }
  }
  console.log("Setting logged in user data", user);
  CurrentUser.value = reactive<LoggedInUser>(user);
  persistUser(CurrentUser.value);
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
    });
    setLoggedInUserCreds({
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
    "saved-login-user-data",
    JSON.stringify(currentUser)
  );
};

export const persistCreds = (creds: LoggedInUserAuth) => {
  // NOTE: These credentials have already been validated.
  window.localStorage.setItem("saved-login-credentials", JSON.stringify(creds));
};

export const refreshLocallyStoredUserActivation = (): boolean => {
  const rememberedCredentials = window.localStorage.getItem(
    "saved-login-user-data"
  );
  if (rememberedCredentials) {
    let currentUser;
    try {
      currentUser = JSON.parse(rememberedCredentials);
      if (currentUser.emailConfirmed) {
        // FIXME - What was this expiry field for?
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

export const refreshLocallyStoredUser = (): boolean => {
  const rememberedCredentials = window.localStorage.getItem(
    "saved-login-user-data"
  );
  if (rememberedCredentials) {
    let currentUser;
    if (JSON.stringify(CurrentUser.value) !== rememberedCredentials) {
      try {
        currentUser = JSON.parse(rememberedCredentials);
        CurrentUser.value = reactive<LoggedInUser>(currentUser);
        setLoggedInUserData({
          ...currentUser,
        });
        return true;
      } catch (e) {
        forgetUserOnCurrentDevice();
      }
    } else {
      return true;
    }
  }
  return false;
};

const refreshCredentials = async () => {
  // FIXME - Should also load current user here.

  // NOTE: Because this can be shared between browser windows/tabs,
  //  always pull out the localStorage version before refreshing
  const rememberedCredentials = window.localStorage.getItem(
    "saved-login-credentials"
  );
  if (rememberedCredentials) {
    console.warn("-- Resuming from saved credentials");
    let currentUserCreds;
    const now = new Date();
    try {
      currentUserCreds = JSON.parse(rememberedCredentials) as LoggedInUserAuth;
      const currentToken = currentUserCreds.apiToken;
      const apiToken = decodeJWT(currentToken) as JwtTokenPayload;
      if (apiToken.expiresAt.getTime() > now.getTime() + 5000) {
        if (JSON.stringify(CurrentUserCreds.value) !== rememberedCredentials) {
          CurrentUserCreds.value = reactive<LoggedInUserAuth>(currentUserCreds);
        }
        refreshLocallyStoredUser();
        console.log("Not out of date yet, can use existing user");
        return;
      } else {
        await maybeRefreshStaleCredentials();
        refreshLocallyStoredUser();
      }
    } catch (e) {
      // JSON user creds was malformed, so clear it, and prompt login again
      forgetUserOnCurrentDevice();
    }
  }
};

export const tryLoggingInRememberedUser = async (isLoggingIn: Ref<boolean>) => {
  isLoggingIn.value = true;
  await refreshCredentials();
  isLoggingIn.value = false;
};

export const forgetUserOnCurrentDevice = () => {
  console.warn("Signing out");
  window.localStorage.removeItem("saved-login-credentials");
  window.localStorage.removeItem("saved-login-user-data");
  userIsLoggedIn.value = false;
};

export const switchCurrentGroup = (newGroup: {
  groupName: string;
  id: GroupId;
}) => {
  // Save the current (new) group to the local user settings, and persist it to the server.
  const loggedInUser = CurrentUser.value as LoggedInUser;
  if (newGroup.id !== loggedInUser.settings?.currentSelectedGroup?.id) {
    if (currentSelectedGroup.value) {
      // Abort requests for the previous group.
      console.warn("!!! Abort requests");
      CurrentViewAbortController.newView();
    }
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

export type SelectedGroup = { groupName: string; id: GroupId; admin?: boolean };
export const currentSelectedGroup = computed<SelectedGroup | false>(() => {
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

// TODO - If viewing other user as super user, return appropriate name
export const userDisplayName = computed<string>(() => {
  if (userIsLoggedIn.value) {
    return CurrentUser.value?.userName || "";
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

const windowDimensions = useWindowSize();

export const isWideScreen = computed<boolean>(() => {
  return windowDimensions.width.value > 1650;
});
export const isSmallScreen = computed<boolean>(() => {
  return windowDimensions.width.value < 576;
});

export const sideNavIsPinned = computed<boolean>(() => {
  return pinSideNav.value || isWideScreen.value;
});

export const showSideNavBg = computed<boolean>(() => {
  return pinSideNav.value && isSmallScreen.value;
});

export const rafFps = ref(60);
// On load:
{
  if (typeof window !== "undefined") {
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
}

export const currentGroupName = computed<string>(() => {
  if (currentSelectedGroup.value) {
    return currentSelectedGroup.value.groupName;
  }
  return "";
});
