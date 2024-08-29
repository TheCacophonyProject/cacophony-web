import type { ApiDeviceResponse } from "@typedefs/api/device";

export const deviceIsStopped = (device: ApiDeviceResponse): boolean => {
  if (device.hasOwnProperty("isHealthy") && device.active) {
    return !!device.isHealthy;
  }
  return false;
};
