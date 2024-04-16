import type { WatchStopHandle } from "vue";
import { reactive, watch } from "vue";
import type { NetworkConnectionErrorSignal } from "@api/fetch";
import { INITIAL_RETRY_INTERVAL } from "@api/fetch";
import type { JwtTokenPayload } from "@api/types";
import type { LatLng } from "@typedefs/api/common";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";

export const isEmpty = (str: string): boolean => str.trim().length === 0;

interface CancelToken {
  token: Promise<void>;
  canceller: { cancel: () => void };
}
const createToken = () => {
  let canceller = {
    cancel: () => {
      return;
    },
  };
  const token: CancelToken = {
    token: new Promise((resolve) => {
      canceller = {
        cancel: () => {
          // the reason property can be checked
          // synchronously to see if you're cancelled
          resolve();
        },
      };
    }),
    canceller,
  };
  token.canceller = canceller;
  return { token, canceller };
};

export interface CancelableDelay {
  promise: Promise<void>;
  cancel: () => void;
}
// create a token and a function to use later.

export const delayMs = (ms: number): CancelableDelay => {
  const { token, canceller } = createToken();
  return {
    promise: new Promise((resolve) => {
      const id = setTimeout(resolve, ms);
      token.token.then(() => clearTimeout(id));
    }),
    cancel: () => canceller.cancel(),
  };
};

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

const NZTM_A = 6378137;
const NZTM_RF = 298.257222101;

const NZTM_CM = 173.0;
const NZTM_OLAT = 0.0;
const NZTM_SF = 0.9996;
const NZTM_FE = 1600000.0;
const NZTM_FN = 10000000.0;
const TWOPI = Math.PI * 2;
const rad2deg = 180 / Math.PI;
const degToRad = Math.PI / 180;

interface TmProjection {
  meridian: number;
  scalef: number;
  orglat: number;
  falsee: number;
  falsen: number;
  utom: number;

  a: number;
  rf: number;
  f: number;
  e2: number;
  ep2: number;
  om: number;
}

const meridianArc = (a: number, e2: number, lt: number): number => {
  const e4 = e2 * e2;
  const e6 = e4 * e2;

  const A0 = 1 - e2 / 4.0 - (3.0 * e4) / 64.0 - (5.0 * e6) / 256.0;
  const A2 = (3.0 / 8.0) * (e2 + e4 / 4.0 + (15.0 * e6) / 128.0);
  const A4 = (15.0 / 256.0) * (e4 + (3.0 * e6) / 4.0);
  const A6 = (35.0 * e6) / 3072.0;

  return (
    a *
    (A0 * lt -
      A2 * Math.sin(2 * lt) +
      A4 * Math.sin(4 * lt) -
      A6 * Math.sin(6 * lt))
  );
};

const getNZTMProjection = () =>
  ((
    a: number,
    rf: number,
    cm: number,
    sf: number,
    lto: number,
    fe: number,
    fn: number,
    utom: number
  ): TmProjection => {
    let f = 0;
    if (rf !== 0) {
      f = 1 / rf;
    }
    const e2 = 2 * f - f * f;
    return {
      meridian: cm,
      scalef: sf,
      orglat: lto,
      falsee: fe,
      falsen: fn,
      utom,
      a,
      rf,
      f,
      e2,
      ep2: e2 / (1 / e2),
      om: meridianArc(a, e2, lto),
    };
  })(
    NZTM_A,
    NZTM_RF,
    NZTM_CM / rad2deg,
    NZTM_SF,
    NZTM_OLAT / rad2deg,
    NZTM_FE,
    NZTM_FN,
    1.0
  );

export const convertLatLngToNZTM = (
  lngDegrees: number,
  latDegrees: number
): { easting: number; northing: number } => {
  const lng = lngDegrees * degToRad;
  const lat = latDegrees * degToRad;
  const { falsen, falsee, scalef, e2, a, meridian, om, utom } =
    getNZTMProjection();
  let dlon;
  let trm1;
  let trm2;
  let trm3;

  dlon = lng - meridian;
  while (dlon > Math.PI) {
    dlon -= TWOPI;
  }
  while (dlon < -Math.PI) {
    dlon += TWOPI;
  }

  const m = meridianArc(a, e2, lat);

  const slt = Math.sin(lat);

  const eslt = 1.0 - e2 * slt * slt;
  const eta = a / Math.sqrt(eslt);
  const rho = (eta * (1.0 - e2)) / eslt;
  const psi = eta / rho;

  const clt = Math.cos(lat);
  const w = dlon;

  const wc = clt * w;
  const wc2 = wc * wc;

  const t = slt / clt;
  const t2 = t * t;
  const t4 = t2 * t2;
  const t6 = t2 * t4;

  trm1 = (psi - t2) / 6.0;

  trm2 =
    (((4.0 * (1.0 - 6.0 * t2) * psi + (1.0 + 8.0 * t2)) * psi - 2.0 * t2) *
      psi +
      t4) /
    120.0;

  trm3 = (61 - 479.0 * t2 + 179.0 * t4 - t6) / 5040.0;

  const gce =
    scalef *
    eta *
    dlon *
    clt *
    (((trm3 * wc2 + trm2) * wc2 + trm1) * wc2 + 1.0);
  const easting = gce / utom + falsee;

  trm1 = 1.0 / 2.0;

  trm2 = ((4.0 * psi + 1) * psi - t2) / 24.0;

  trm3 =
    ((((8.0 * (11.0 - 24.0 * t2) * psi - 28.0 * (1.0 - 6.0 * t2)) * psi +
      (1.0 - 32.0 * t2)) *
      psi -
      2.0 * t2) *
      psi +
      t4) /
    720.0;

  const trm4 = (1385.0 - 3111.0 * t2 + 543.0 * t4 - t6) / 40320.0;

  const gcn =
    eta * t * ((((trm4 * wc2 + trm3) * wc2 + trm2) * wc2 + trm1) * wc2);
  const northing = ((gcn + m - om) * scalef) / utom + falsen;

  return { easting, northing };
};

const footPointLat = (f: number, a: number, m: number) => {
  const n = f / (2.0 - f);
  const n2 = n * n;
  const n3 = n2 * n;
  const n4 = n2 * n2;

  const g =
    a * (1.0 - n) * (1.0 - n2) * (1 + (9.0 * n2) / 4.0 + (225.0 * n4) / 64.0);
  const sig = m / g;

  return (
    sig +
    ((3.0 * n) / 2.0 - (27.0 * n3) / 32.0) * Math.sin(2.0 * sig) +
    ((21.0 * n2) / 16.0 - (55.0 * n4) / 32.0) * Math.sin(4.0 * sig) +
    ((151.0 * n3) / 96.0) * Math.sin(6.0 * sig) +
    ((1097.0 * n4) / 512.0) * Math.sin(8.0 * sig)
  );
};

export const convertNZTMToLatLng = (
  eastingMetres: number,
  northingMetres: number
): LatLng => {
  const { falsen, falsee, scalef, e2, a, meridian, om, utom, f } =
    getNZTMProjection();
  let trm1;
  let trm2;
  let trm3;
  let trm4;

  const cn1 = ((northingMetres - falsen) * utom) / scalef + om;
  const fphi = footPointLat(f, a, cn1);
  const slt = Math.sin(fphi);
  const clt = Math.cos(fphi);

  const eslt = 1.0 - e2 * slt * slt;
  const eta = a / Math.sqrt(eslt);
  const rho = (eta * (1.0 - e2)) / eslt;
  const psi = eta / rho;

  const E = (eastingMetres - falsee) * utom;
  const x = E / (eta * scalef);
  const x2 = x * x;

  const t = slt / clt;
  const t2 = t * t;
  const t4 = t2 * t2;

  trm1 = 1.0 / 2.0;

  trm2 = ((-4.0 * psi + 9.0 * (1 - t2)) * psi + 12.0 * t2) / 24.0;

  trm3 =
    ((((8.0 * (11.0 - 24.0 * t2) * psi - 12.0 * (21.0 - 71.0 * t2)) * psi +
      15.0 * ((15.0 * t2 - 98.0) * t2 + 15)) *
      psi +
      180.0 * ((-3.0 * t2 + 5.0) * t2)) *
      psi +
      360.0 * t4) /
    720.0;

  trm4 = (((1575.0 * t2 + 4095.0) * t2 + 3633.0) * t2 + 1385.0) / 40320.0;

  const lat =
    fphi +
    ((t * x * E) / (scalef * rho)) *
      (((trm4 * x2 - trm3) * x2 + trm2) * x2 - trm1);

  trm1 = 1.0;

  trm2 = (psi + 2.0 * t2) / 6.0;

  trm3 =
    (((-4.0 * (1.0 - 6.0 * t2) * psi + (9.0 - 68.0 * t2)) * psi + 72.0 * t2) *
      psi +
      24.0 * t4) /
    120.0;

  trm4 = (((720.0 * t2 + 1320.0) * t2 + 662.0) * t2 + 61.0) / 5040.0;

  const lng =
    meridian - (x / clt) * (((trm4 * x2 - trm3) * x2 + trm2) * x2 - trm1);
  return { lat: lat * rad2deg, lng: lng * rad2deg };
};

export type FormInputValidationState = boolean | undefined;
