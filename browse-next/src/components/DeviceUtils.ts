import sunCalc from "suncalc";
import type { DeviceConfigDetail } from "@typedefs/api/event";
import type { ApiDeviceResponse } from "@typedefs/api/device";

const absoluteTime = (timeStr: string, relativeTo: Date): Date => {
  let offsetMinutes = 0;
  const rel = new Date(relativeTo);
  if (timeStr.endsWith("m")) {
    offsetMinutes = Number(timeStr.replace("m", ""));
    rel.setMinutes(rel.getMinutes() + offsetMinutes);
  } else {
    const now = new Date();
    const [hours, mins] = timeStr.split(":").map(Number);
    now.setHours(hours);
    now.setMinutes(mins);
    return now;
  }
  return rel;
};
export const deviceScheduledPowerOnTime = (
  device: ApiDeviceResponse,
  config: DeviceConfigDetail
): Date | null => {
  if (device.location) {
    const windows = config.windows;
    const start = (windows && windows["power-on"]) || "-30m";
    const { sunset } = sunCalc.getTimes(
      new Date(),
      device.location.lat,
      device.location.lng
    );
    return absoluteTime(start, sunset);
  }
  return null;
};

export const deviceScheduledPowerOffTime = (
  device: ApiDeviceResponse,
  config: DeviceConfigDetail
): Date | null => {
  const windows = config.windows;
  const end = (windows && windows["power-off"]) || "+30m";
  if (device.location) {
    const { sunrise } = sunCalc.getTimes(
      new Date(),
      device.location.lat,
      device.location.lng
    );
    const off = absoluteTime(end, sunrise);
    const scheduledPowerOnTime = deviceScheduledPowerOnTime(device, config);
    if (scheduledPowerOnTime && off > scheduledPowerOnTime) {
      return off;
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const { sunrise } = sunCalc.getTimes(
        tomorrow,
        device.location.lat,
        device.location.lng
      );
      return absoluteTime(end, sunrise);
    }
  }
  return null;
};
