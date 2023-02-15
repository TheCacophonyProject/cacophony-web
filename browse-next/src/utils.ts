import type { WatchStopHandle } from "vue";
import { reactive, watch } from "vue";
import type { NetworkConnectionErrorSignal } from "@api/fetch";
import { INITIAL_RETRY_INTERVAL } from "@api/fetch";
import type { JwtTokenPayload } from "@api/types";
import type { LatLng } from "@typedefs/api/common";
import type { ApiStationResponse } from "@typedefs/api/station";

export const isEmpty = (str: string): boolean => str.trim().length === 0;

export const delayMs = async (delayMs: number) =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

export const capitalize = (str: string): string =>
  str
    .split(" ")
    .map((p) => (p[0] || "").toUpperCase() + p.slice(1))
    .join(" ");

export const delayMsThen = async <T>(
  delayInMs: number,
  callback: () => T,
  networkConnectionError?: NetworkConnectionErrorSignal
) =>
  new Promise((resolve) => {
    let unwatch: WatchStopHandle;
    let timeout = 0;
    if (networkConnectionError) {
      unwatch = watch(
        () => networkConnectionError.control,
        async (shouldCancel) => {
          if (shouldCancel) {
            unwatch();
            clearTimeout(timeout);
            networkConnectionError.retryCount = 0;
            networkConnectionError.retryInterval = INITIAL_RETRY_INTERVAL;
            networkConnectionError.control = false;
            resolve(callback());
          }
        }
      );
    }

    timeout = setTimeout(() => {
      unwatch && unwatch();
      if (networkConnectionError) {
        networkConnectionError.retryCount += 1;
        networkConnectionError.retryInterval *= 2;
      }
      resolve(callback());
    }, delayInMs) as unknown as number;
  });

export const isValidName = (str: string): boolean =>
  str.length >= 3 && /(?=.*[A-Za-z])^[a-zA-Z0-9]+([_ \-a-zA-Z0-9])*$/.test(str);

export const formFieldInputText = (initialValue: string | boolean = "") =>
  reactive({
    value: initialValue.toString(),
    touched: false,
  });

export interface FormInputValue {
  value: string;
  touched: boolean;
}

export const decodeJWT = (jwtString: string): JwtTokenPayload | null => {
  const parts = jwtString.split(".");
  if (parts.length !== 3) {
    return null;
  }
  try {
    const decodedToken = JSON.parse(atob(parts[1]));
    return {
      ...decodedToken,
      expiresAt: new Date(decodedToken.exp * 1000),
      createdAt: new Date(decodedToken.iat * 1000),
    };
  } catch (e) {
    return null;
  }
};

export const urlNormaliseName = (name: string): string => {
  return decodeURIComponent(name).trim().replace(/ /g, "-").toLowerCase();
};
const EPSILON = 0.000000000001;
export const locationsAreEqual = (a: LatLng, b: LatLng) => {
  return Math.abs(a.lat - b.lat) < EPSILON && Math.abs(a.lng - b.lng) < EPSILON;
};

export const lastActiveStationTime = (
  station: ApiStationResponse
): Date | null => {
  const lastThermal =
    station.lastActiveThermalTime && new Date(station.lastActiveThermalTime);
  const lastAudio =
    station.lastActiveAudioTime && new Date(station.lastActiveAudioTime);
  if (lastThermal && lastAudio) {
    return lastThermal > lastAudio ? lastThermal : lastAudio;
  } else if (lastThermal) {
    return lastThermal;
  } else if (lastAudio) {
    return lastAudio;
  }
  return null;
};

export type FormInputValidationState = boolean | undefined;
