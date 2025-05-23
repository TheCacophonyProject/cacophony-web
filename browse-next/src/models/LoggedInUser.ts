import type {
  ApiLoggedInUserResponse,
  ApiUserSettings,
} from "@typedefs/api/user";
import type { Ref } from "vue";
import type { ErrorResult, JwtTokenPayload, LoadedResource } from "@api/types";
import { computed, reactive, ref, watch } from "vue";
import { login as userLogin, saveUserSettings } from "@api/User";
import type { GroupId as ProjectId } from "@typedefs/api/common";
import type {
  ApiGroupResponse,
  ApiGroupResponse as ApiProjectResponse,
  ApiGroupSettings as ApiProjectSettings,
  ApiGroupUserSettings as ApiProjectUserSettings,
} from "@typedefs/api/group";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import { decodeJWT, urlNormaliseName } from "@/utils";
import { CurrentViewAbortController } from "@/router";
import { maybeRefreshStaleCredentials } from "@api/fetch";
import { useWindowSize } from "@vueuse/core";
import {
  getAllProjects,
  getCurrentUserProjects,
  saveProjectSettings,
  saveProjectUserSettings,
} from "@api/Project";
import type { ApiDeviceResponse } from "@typedefs/api/device";

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

export const CurrentUserCreds = ref<LoadedResource<LoggedInUserAuth>>(null);
export const CurrentUser = ref<LoadedResource<LoggedInUser>>(null);

export const CurrentUserCredsDev = ref<LoadedResource<LoggedInUserAuth>>(null);

export const UserProjects = ref<LoadedResource<ApiProjectResponse[]>>(null);
export const NonUserProjects = ref<LoadedResource<ApiProjectResponse[]>>(null);
export const DevicesForCurrentProject =
  ref<LoadedResource<ApiDeviceResponse[]>>(null);
export const LocationsForCurrentProject =
  ref<LoadedResource<ApiLocationResponse[]>>(null);

export const nonPendingUserProjects = computed<ApiProjectResponse[]>(() => {
  if (!UserProjects.value) {
    return [];
  }
  return UserProjects.value.filter((project) => project.pending === undefined);
});

export const pendingUserProjects = computed<ApiProjectResponse[]>(() => {
  if (!UserProjects.value) {
    return [];
  }
  return UserProjects.value.filter((project) => project.pending !== undefined);
});
export const userHasPendingProjects = computed<boolean>(() => {
  return pendingUserProjects.value.length !== 0;
});

// TODO - Test opening a whole lot of tabs, print who wins the tokenRefresh race in the page title

export const userIsLoggedIn = computed<boolean>({
  get: () => CurrentUser.value !== null,
  set: (val: boolean) => {
    if (!val) {
      CurrentUser.value = null;
    }
  },
});

export const currentUserIsSuperUser = computed<boolean>(() => {
  if (!userIsLoggedIn.value) {
    return false;
  }
  return (CurrentUser.value as LoggedInUser).globalPermission !== "off";
});

export const userHasProjects = computed<boolean>(() => {
  return nonPendingUserProjects.value.length !== 0;
});

export const userHasProjectsIncludingPending = computed<boolean>(() => {
  return !!UserProjects.value && UserProjects.value.length !== 0;
});

export const setLoggedInUserCreds = (creds: LoggedInUserAuth, dev = false) => {
  if (!dev) {
    CurrentUserCreds.value = reactive<LoggedInUserAuth>(creds);
    persistCreds(CurrentUserCreds.value);
  } else {
    CurrentUserCredsDev.value = reactive<LoggedInUserAuth>(creds);
    persistCreds(CurrentUserCredsDev.value, true);
  }
};

export const persistUserProjectSettings = async (
  userSettings: ApiProjectUserSettings,
) => {
  if (currentSelectedProject.value) {
    const localProjectToUpdate = nonPendingUserProjects.value.find(
      ({ id }) => id === (currentSelectedProject.value as SelectedProject).id,
    );
    if (localProjectToUpdate) {
      localProjectToUpdate.userSettings = userSettings;
      await saveProjectUserSettings(localProjectToUpdate.id, userSettings);
    } else if (isViewingAsSuperUser.value) {
      const nonUserProjectToUpdate = (NonUserProjects.value || []).find(
        ({ id }) => id === (currentSelectedProject.value as SelectedProject).id,
      );
      if (nonUserProjectToUpdate) {
        nonUserProjectToUpdate.userSettings = userSettings;
      }
    }
  }
};

export const persistProjectSettings = async (settings: ApiProjectSettings) => {
  if (currentSelectedProject.value) {
    const localProjectToUpdate = nonPendingUserProjects.value.find(
      ({ id }) => id === (currentSelectedProject.value as SelectedProject).id,
    );
    if (localProjectToUpdate) {
      localProjectToUpdate.settings = settings;
      await saveProjectSettings(localProjectToUpdate.id, settings);
    }
  }
};

const userSettingsHaveChanged = (
  prevSettings: ApiUserSettings | undefined,
  newSettings: ApiUserSettings,
): boolean => {
  if (!prevSettings && newSettings) {
    return true;
  } else if (prevSettings && newSettings) {
    if (
      prevSettings.currentSelectedGroup?.id !==
      newSettings.currentSelectedGroup?.id
    ) {
      return true;
    }
    if (prevSettings.displayMode !== newSettings.displayMode) {
      return true;
    }
    if (prevSettings.lastKnownTimezone !== newSettings.lastKnownTimezone) {
      return true;
    }
  }
  return false;
};

export const setLoggedInUserData = (user: LoggedInUser) => {
  let prevUserData = CurrentUser.value;
  if (prevUserData) {
    try {
      prevUserData = JSON.parse(JSON.stringify(prevUserData)) as LoggedInUser;
      if (user.settings) {
        user.settings.lastKnownTimezone =
          Intl.DateTimeFormat().resolvedOptions().timeZone;
      }
      if (
        userSettingsHaveChanged(
          prevUserData.settings,
          user.settings as ApiUserSettings,
        )
      ) {
        // TODO: If something not allowed in user settings schema makes it into settings, we need to remove
        //  it before it can validate properly.  Client-side json schema validation? Or just be careful?
        // Update settings on server?
        saveUserSettings(user.settings as ApiUserSettings).then((response) => {
          console.warn("User settings updated", response);
        });
      }
    } catch (e) {
      // Shouldn't get malformed json errors here.
      console.error("Shouldn't get malformed json errors here.", e);
    }
  }
  CurrentUser.value = reactive<LoggedInUser>(user);
  persistUser(CurrentUser.value);
};

export const login = async (
  userEmailAddress: string,
  userPassword: string,
  signInInProgress: PendingRequest,
) => {
  const emailAddress = userEmailAddress.trim().toLowerCase();
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
    // console.log("Sign in error", loggedInUserResponse.result);
    signInInProgress.errors = loggedInUserResponse.result;
  }
  if (import.meta.env.DEV) {
    const loggedInUserResponse = await userLogin(emailAddress, password, true);
    if (loggedInUserResponse.success) {
      const signedInUser = loggedInUserResponse.result;
      setLoggedInUserCreds(
        {
          apiToken: signedInUser.token,
          refreshToken: signedInUser.refreshToken,
          refreshingToken: false,
        },
        true,
      );
    } else {
      // console.log("Sign in error for dev account", loggedInUserResponse.result);
    }
  }

  signInInProgress.requestPending = false;
};

export const persistUser = (currentUser: LoggedInUser) => {
  window.localStorage.setItem(
    "saved-login-user-data",
    JSON.stringify(currentUser),
  );
};

export const persistCreds = (creds: LoggedInUserAuth, dev = false) => {
  if (!dev) {
    // NOTE: These credentials have already been validated.
    window.localStorage.setItem(
      "saved-login-credentials",
      JSON.stringify(creds),
    );
  } else {
    window.localStorage.setItem(
      "saved-login-credentials-dev",
      JSON.stringify(creds),
    );
  }
};

export const refreshLocallyStoredUserActivation = (): boolean => {
  const rememberedCredentials = window.localStorage.getItem(
    "saved-login-user-data",
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

export const refreshLocallyStoredUser = (
  refreshedUserData?: ApiLoggedInUserResponse,
): boolean => {
  if (refreshedUserData) {
    setLoggedInUserData({
      ...refreshedUserData,
    });
    return true;
  }
  const rememberedCredentials = window.localStorage.getItem(
    "saved-login-user-data",
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
  // NOTE: Because this can be shared between browser windows/tabs,
  //  always pull out the localStorage version before refreshing
  const rememberedCredentials = window.localStorage.getItem(
    "saved-login-credentials",
  );
  if (rememberedCredentials) {
    if (!import.meta.env.DEV) {
      console.warn("-- Resuming from saved credentials");
    }
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
        if (!import.meta.env.DEV) {
          // console.log("Not out of date yet, can use existing user");
          return;
        }
      } else {
        await maybeRefreshStaleCredentials();
        refreshLocallyStoredUser();
      }
    } catch (e) {
      // JSON user creds was malformed, so clear it, and prompt login again
      forgetUserOnCurrentDevice();
    }
  }
  if (import.meta.env.DEV) {
    const rememberedCredentialsDev = window.localStorage.getItem(
      "saved-login-credentials-dev",
    );
    if (rememberedCredentialsDev) {
      let currentUserCreds;
      const now = new Date();
      try {
        currentUserCreds = JSON.parse(
          rememberedCredentialsDev,
        ) as LoggedInUserAuth;
        const currentToken = currentUserCreds.apiToken;
        const apiToken = decodeJWT(currentToken) as JwtTokenPayload;
        if (apiToken.expiresAt.getTime() > now.getTime() + 5000) {
          if (
            JSON.stringify(CurrentUserCredsDev.value) !==
            rememberedCredentialsDev
          ) {
            CurrentUserCredsDev.value =
              reactive<LoggedInUserAuth>(currentUserCreds);
          }
          return;
        } else {
          await maybeRefreshStaleCredentials(true);
        }
      } catch (e) {
        // JSON user creds was malformed, so clear it, and prompt login again
        forgetUserOnCurrentDevice();
      }
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
  if (import.meta.env.DEV) {
    window.localStorage.removeItem("saved-login-credentials-dev");
  }
  UserProjects.value = null;
  NonUserProjects.value = null;
  DevicesForCurrentProject.value = null;
  LocationsForCurrentProject.value = null;
  userIsLoggedIn.value = false;
};

export const switchCurrentProject = (newGroup: {
  groupName: string;
  id: ProjectId;
}): boolean => {
  // Save the current (new) group to the local user settings, and persist it to the server.
  const loggedInUser = CurrentUser.value as LoggedInUser;
  if (newGroup.id !== loggedInUser.settings?.currentSelectedGroup?.id) {
    if (currentSelectedProject.value) {
      // Abort requests for the previous group.
      console.warn("!!! Abort requests");
      CurrentViewAbortController.newView();
    }
    DevicesForCurrentProject.value = null;
    LocationsForCurrentProject.value = null;

    setLoggedInUserData({
      ...loggedInUser,
      settings: {
        ...(loggedInUser.settings as ApiUserSettings),
        currentSelectedGroup: newGroup,
      },
    });
    return true;
  }
  return false;
};

// User blocking action checks
export const currentEUAVersion = ref(0);

export const hasAcceptedSomeEUA = computed<boolean>(() => {
  return !!CurrentUser.value && !!CurrentUser.value?.endUserAgreement;
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

export const showUnimplementedModal = ref<boolean>(false);

export const currentUserSettings = computed<ApiUserSettings | false>(() => {
  if (userIsLoggedIn.value) {
    return (CurrentUser.value as LoggedInUser).settings || false;
  }
  return false;
});

export interface SelectedProject {
  groupName: string;
  id: ProjectId;
  admin?: boolean;
  settings?: ApiProjectSettings;
  userSettings?: ApiProjectUserSettings;
  lastThermalRecordingTime?: string;
  lastAudioRecordingTime?: string;
}
export const currentSelectedProject = computed<SelectedProject | false>(() => {
  if (
    userIsLoggedIn.value &&
    currentUserSettings.value &&
    UserProjects.value !== null
  ) {
    // Basically don't try to get currentSelectedGroup until UserGroups has loaded?
    if (nonPendingUserProjects.value.length === 0) {
      return false;
    }
    if (
      currentUserSettings.value &&
      currentUserSettings.value.currentSelectedGroup
    ) {
      const potentialGroupId =
        currentUserSettings.value.currentSelectedGroup.id;
      let matchedProject = nonPendingUserProjects.value.find(
        ({ id }) => id === potentialGroupId,
      );
      if (matchedProject) {
        isViewingAsSuperUser.value = false;
      }

      if (!matchedProject && currentUserIsSuperUser.value) {
        matchedProject = (
          (NonUserProjects.value as ApiGroupResponse[]) || []
        ).find(({ id }) => id === potentialGroupId);
        isViewingAsSuperUser.value = !!matchedProject;
        if (matchedProject) {
          return matchedProject;
        }
      }

      if (!matchedProject) {
        return false;
      }
      return {
        id: matchedProject.id,
        groupName: matchedProject.groupName,
        settings: matchedProject.settings,
        userSettings: matchedProject.userSettings,
        admin: matchedProject.admin,
        owner: matchedProject.owner,
        lastAudioRecordingTime: matchedProject.lastAudioRecordingTime,
        lastThermalRecordingTime: matchedProject.lastThermalRecordingTime,
      };
    }
  }
  if (nonPendingUserProjects.value.length !== 0) {
    const {
      id,
      groupName,
      settings,
      userSettings,
      admin,
      owner,
      lastAudioRecordingTime,
      lastThermalRecordingTime,
    } = nonPendingUserProjects.value[0];
    return {
      id,
      groupName,
      settings,
      userSettings,
      admin,
      owner,
      lastAudioRecordingTime,
      lastThermalRecordingTime,
    };
  }
  return false;
});

export const userIsAdminForCurrentSelectedProject = computed<boolean>(() => {
  if (isViewingAsSuperUser.value) {
    return true;
  }
  if (currentSelectedProject.value && UserProjects.value) {
    const currentGroup = UserProjects.value.find(
      ({ id }) =>
        id ===
        (currentSelectedProject.value as { groupName: string; id: ProjectId })
          .id,
    );
    return (currentGroup && !!currentGroup.admin) || false;
  }
  return false;
});

export const userHasMultipleProjects = computed<boolean>(() => {
  return (UserProjects.value && UserProjects.value?.length > 1) || false;
});

export const shouldViewAsSuperUser = computed<boolean>(() => {
  if (userIsLoggedIn.value && currentUserSettings.value) {
    return isViewingAsSuperUser.value;
  }
  return false;
});
export const isViewingAsSuperUser = ref<boolean>(false);

// TODO - If viewing other user as super user, return appropriate name
export const userDisplayName = computed<string>(() => {
  if (userIsLoggedIn.value) {
    return (!!CurrentUser.value && CurrentUser.value?.userName) || "";
  }
  return "";
});

export const userHasConfirmedEmailAddress = computed<boolean>(() => {
  if (userIsLoggedIn.value) {
    return (!!CurrentUser.value && CurrentUser.value?.emailConfirmed) || false;
  }
  return false;
});

export const urlNormalisedCurrentProjectName = computed<string>(
  () =>
    (currentSelectedProject.value &&
      urlNormaliseName(currentSelectedProject.value.groupName)) ||
    "",
);

export const isResumingSession = ref(false);

export const isLoggingInAutomatically = ref(false);
export const isFetchingProjects = ref(false);

export const refreshUserProjects = async () => {
  // Grab the users' groups, and select the first one.
  isFetchingProjects.value = true;
  console.warn("Fetching user projects");
  const NO_ABORT = false;
  const projectsResponse = await getCurrentUserProjects(NO_ABORT);
  if (projectsResponse.success) {
    UserProjects.value = reactive(projectsResponse.result.groups);
  }
  if (currentUserIsSuperUser.value) {
    const allProjectsResponse = await getAllProjects(NO_ABORT);
    if (allProjectsResponse.success) {
      NonUserProjects.value = reactive(
        (allProjectsResponse.result.groups || []).filter(
          (project) =>
            !(UserProjects.value || []).map((p) => p.id).includes(project.id),
        ),
      );
    }
  }

  isFetchingProjects.value = false;
  return projectsResponse;
};

// Global modal control
export const creatingNewProject = reactive({ enabled: false, visible: false });
export const showEUAOutOfDate = computed<{
  enabled: boolean;
  visible: boolean;
}>(() => ({ enabled: euaIsOutOfDate.value, visible: false }));
export const joiningNewProject = reactive({ enabled: false, visible: false });
export const showSwitchProject = reactive({ enabled: false, visible: false });
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
      "saved-login-credentials",
    );
    if (rememberedCredentials) {
      let currentUser;
      try {
        currentUser = JSON.parse(rememberedCredentials) as LoggedInUser;
        window.localStorage.setItem(
          "saved-login-credentials",
          JSON.stringify({ ...currentUser, refreshingToken: false }),
        );
      } catch (e) {
        forgetUserOnCurrentDevice();
      }
    }
  }
}

export const currentGroupName = computed<string>(() => {
  if (currentSelectedProject.value) {
    return currentSelectedProject.value.groupName;
  }
  return "";
});

export const userProjectsLoaded = async () => {
  if (UserProjects.value !== null) {
    return true;
  } else {
    return new Promise((resolve, reject) => {
      watch(UserProjects, (next) => {
        if (next && next?.length) {
          resolve(true);
        } else {
          reject();
        }
      });
    });
  }
};

export const projectDevicesLoaded = async () => {
  // This gets loaded in the route handler, so won't be hot-reloaded?
  if (DevicesForCurrentProject.value !== null) {
    return true;
  } else {
    return new Promise((resolve, reject) => {
      watch(DevicesForCurrentProject, (next) => {
        if (next && next?.length) {
          resolve(true);
        } else {
          reject();
        }
      });
    });
  }
};

export const projectLocationsLoaded = async () => {
  // This gets loaded in the route handler, so won't be hot-reloaded?
  if (LocationsForCurrentProject.value !== null) {
    return true;
  } else {
    return new Promise((resolve, reject) => {
      watch(LocationsForCurrentProject, (next) => {
        if (next && next?.length) {
          resolve(true);
        } else {
          reject();
        }
      });
    });
  }
};
