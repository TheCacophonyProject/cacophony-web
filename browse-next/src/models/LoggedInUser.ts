import type {
  ApiLoggedInUserResponse,
} from "@typedefs/api/user";
import type { Ref } from "vue";
import { computed, ref } from "vue";
import { delayMs } from "@/utils";

export interface LoggedInUser extends ApiLoggedInUserResponse {
  apiToken: string; // Should have token time.
}

export const CurrentUser: Ref<LoggedInUser | null> = ref(null);

// TODO: Here we can set this to false if for instance the session has expired.
export const userIsLoggedIn = computed<boolean>({
  get: () => CurrentUser.value !== null,
  set: (val: boolean) => {
    if (!val) {
      CurrentUser.value = null;
    }
  },
});

export const rememberUserOnCurrentDevice = (
  emailAddress: string,
  password: string
) => {
  // NOTE: These credentials have already been validated.
  window.localStorage.setItem(
    "saved-login-credentials",
    JSON.stringify({
      emailAddress,
      password,
    })
  );
};

export const tryLoggingInRememberedUser = async (isLoggingIn: Ref<boolean>) => {
  const rememberedCredentials = window.localStorage.getItem(
    "saved-login-credentials"
  );
  if (rememberedCredentials) {
    isLoggingIn.value = true;
    await delayMs(1000);
    isLoggingIn.value = false;
  }
  // FIXME - set current user.
};

export const forgetUserOnCurrentDevice = () => {
  window.localStorage.clear();
};
