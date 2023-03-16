import type { WatchStopHandle } from "vue";
import { reactive, watch } from "vue";
import type { NetworkConnectionErrorSignal } from "@api/fetch";
import { INITIAL_RETRY_INTERVAL } from "@api/fetch";
import type { JwtTokenPayload } from "@api/types";
import type { LatLng } from "@typedefs/api/common";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";

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

export const lastActiveLocationTime = (
  location: ApiLocationResponse
): Date | null => {
  const lastThermal =
    (location.lastActiveThermalTime &&
      new Date(location.lastActiveThermalTime)) ||
    (location.lastThermalRecordingTime &&
      new Date(location.lastThermalRecordingTime));
  const lastAudio =
    (location.lastActiveAudioTime && new Date(location.lastActiveAudioTime)) ||
    (location.lastAudioRecordingTime &&
      new Date(location.lastAudioRecordingTime));
  if (lastThermal && lastAudio) {
    return lastThermal > lastAudio ? lastThermal : lastAudio;
  } else if (lastThermal) {
    return lastThermal;
  } else if (lastAudio) {
    return lastAudio;
  }
  return null;
};

// Convert NZTM2000 to Latitude Longitude

export const convertNZTMtoLatLng = (x: number, y: number): LatLng => {
  // From https://gis.stackexchange.com/questions/225065/converting-nztm-new-zealand-transverse-mercator-to-lat-long
  // But may be slightly wrong, check it.
  const a = 6378137;
  const f = 1 / 298.257222101;
  const phizero = 0;
  const lambdazero = 173;
  const Nzero = 10000000;
  const Ezero = 1600000;
  const kzero = 0.9996;
  const N = y;
  const E = x;
  const b = a * (1 - f);
  const esq = 2 * f - Math.pow(f, 2);
  const Z0 =
    1 - esq / 4 - (3 * Math.pow(esq, 2)) / 64 - (5 * Math.pow(esq, 3)) / 256;
  const A2 =
    0.375 * (esq + Math.pow(esq, 2) / 4 + (15 * Math.pow(esq, 3)) / 128);
  const A4 = (15 * (Math.pow(esq, 2) + (3 * Math.pow(esq, 2)) / 4)) / 256;
  const A6 = (35 * Math.pow(esq, 3)) / 3072;
  const Nprime = N - Nzero;
  const mprime = Nprime / kzero;
  const smn = (a - b) / (a + b);
  const G =
    (a *
      (1 - smn) *
      (1 - Math.pow(smn, 2)) *
      (1 + (9 * Math.pow(smn, 2)) / 4 + (225 * Math.pow(smn, 4)) / 64) *
      Math.PI) /
    180.0;
  const sigma = (mprime * Math.PI) / (180 * G);
  const phiprime =
    sigma +
    ((3 * smn) / 2 - (27 * Math.pow(smn, 3)) / 32) * Math.sin(2 * sigma) +
    ((21 * Math.pow(smn, 2)) / 16 - (55 * Math.pow(smn, 4)) / 32) *
      Math.sin(4 * sigma) +
    ((151 * Math.pow(smn, 3)) / 96) * Math.sin(6 * sigma) +
    ((1097 * Math.pow(smn, 4)) / 512) * Math.sin(8 * sigma);
  const rhoprime =
    (a * (1 - esq)) / Math.pow(Math.pow(1 - esq * Math.sin(phiprime), 2), 1.5);
  const upsilonprime = a / Math.sqrt(1 - esq * Math.pow(Math.sin(phiprime), 2));
  const psiprime = upsilonprime / rhoprime;
  const tprime = Math.tan(phiprime);
  const Eprime = E - Ezero;
  const chi = Eprime / (kzero * upsilonprime);
  const term_1 = (tprime * Eprime * chi) / (kzero * rhoprime * 2);
  const term_2 =
    ((term_1 * Math.pow(chi, 2)) / 12) *
    (-4 * Math.pow(psiprime, 2) +
      9 * psiprime * (1 - Math.pow(tprime, 2)) +
      12 * Math.pow(tprime, 2));
  const term_3 =
    ((tprime * Eprime * Math.pow(chi, 5)) / (kzero * rhoprime * 720)) *
    (8 * Math.pow(psiprime, 4) * (11 - 24 * Math.pow(tprime, 2)) -
      12 * Math.pow(psiprime, 3) * (21 - 71 * Math.pow(tprime, 2)) +
      15 *
        Math.pow(psiprime, 2) *
        (15 - 98 * Math.pow(tprime, 2) + 15 * Math.pow(tprime, 4)) +
      180 * psiprime * (5 * Math.pow(tprime, 2) - 3 * Math.pow(tprime, 4)) +
      360 * Math.pow(tprime, 4));
  const term_4 =
    ((tprime * Eprime * Math.pow(chi, 7)) / (kzero * rhoprime * 40320)) *
    (1385 +
      3633 * Math.pow(tprime, 2) +
      4095 * Math.pow(tprime, 4) +
      1575 * Math.pow(tprime, 6));
  const term1 = chi * (1 / Math.cos(phiprime));
  const term2 =
    ((Math.pow(chi, 3) * (1 / Math.cos(phiprime))) / 6) *
    (psiprime + 2 * Math.pow(tprime, 2));
  const term3 =
    ((Math.pow(chi, 5) * (1 / Math.cos(phiprime))) / 120) *
    (-4 * Math.pow(psiprime, 3) * (1 - 6 * Math.pow(tprime, 2)) +
      Math.pow(psiprime, 2) * (9 - 68 * Math.pow(tprime, 2)) +
      72 * psiprime * Math.pow(tprime, 2) +
      24 * Math.pow(tprime, 4));
  const term4 =
    ((Math.pow(chi, 7) * (1 / Math.cos(phiprime))) / 5040) *
    (61 +
      662 * Math.pow(tprime, 2) +
      1320 * Math.pow(tprime, 4) +
      720 * Math.pow(tprime, 6));
  const latitude =
    ((phiprime - term_1 + term_2 - term_3 + term_4) * 180) / Math.PI;
  const longitude =
    lambdazero + (180 / Math.PI) * (term1 - term2 + term3 - term4);

  return { lat: latitude, lng: longitude };
};

export type FormInputValidationState = boolean | undefined;
