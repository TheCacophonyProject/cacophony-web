import { computed } from "vue";
import type { Ref, ComputedRef } from "vue";
import type { LatLng } from "@typedefs/api/common";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import type {LoadedResource} from "@api/types";

export const canonicalLatLngForLocations = (
  locations: Ref<LoadedResource<ApiLocationResponse[]>> | ComputedRef<ApiLocationResponse[]>
) =>
  computed<LatLng>(() => {
    if (locations.value && locations.value.length) {
      return locations.value[0].location;
    }
    return { lat: 0, lng: 0 };
  });
