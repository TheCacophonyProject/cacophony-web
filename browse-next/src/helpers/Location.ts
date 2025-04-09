import { computed } from "vue";
import type { Ref, ComputedRef } from "vue";
import type { LatLng } from "@typedefs/api/common";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import type { LoadedResource } from "@api/types";
import type { ApiDeviceResponse } from "@typedefs/api/device";
import { DeviceType as ConcreteDeviceType } from "@typedefs/api/consts.ts";

export const canonicalLatLngForLocations = (
  locations:
    | Ref<LoadedResource<ApiLocationResponse[]>>
    | ComputedRef<ApiLocationResponse[]>,
) =>
  computed<LatLng>(() => {
    if (locations.value && locations.value.length) {
      return locations.value[0].location;
    }
    return { lat: 0, lng: 0 };
  });

export const latestRecordingTimeForDeviceAtLocation = (
  device: ApiDeviceResponse,
  location: ApiLocationResponse,
): Date | null => {
  if (location && device.type) {
    if (
      device.type === ConcreteDeviceType.Hybrid &&
      (location.lastAudioRecordingTime || location.lastThermalRecordingTime)
    ) {
      if (
        location.lastAudioRecordingTime &&
        location.lastThermalRecordingTime
      ) {
        return new Date(
          Math.max(
            new Date(location.lastAudioRecordingTime).getTime(),
            new Date(location.lastThermalRecordingTime).getTime(),
          ),
        );
      } else if (location.lastAudioRecordingTime) {
        return new Date(location.lastAudioRecordingTime);
      } else if (location.lastThermalRecordingTime) {
        return new Date(location.lastThermalRecordingTime);
      }
    } else if (
      device.type === ConcreteDeviceType.Audio &&
      location.lastAudioRecordingTime
    ) {
      return new Date(location.lastAudioRecordingTime);
    } else if (
      [ConcreteDeviceType.Thermal, ConcreteDeviceType.TrailCam].includes(
        device.type,
      ) &&
      location.lastThermalRecordingTime
    ) {
      return new Date(location.lastThermalRecordingTime);
    }
  }

  return null;
};
