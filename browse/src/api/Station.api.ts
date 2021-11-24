import { FetchResult } from "@api/Recording.api";
import { ApiStationResponse } from "@typedefs/api/station";
import CacophonyApi from "@api/CacophonyApi";
import { shouldViewAsSuperUser } from "@/utils";

export const getStations = (
  activeAndInactive: boolean = false
): Promise<FetchResult<{ stations: ApiStationResponse[] }>> => {
  return CacophonyApi.get(
    `/api/v1/stations?${
      shouldViewAsSuperUser()
        ? `only-active=${activeAndInactive ? "false" : "true"}`
        : `view-mode=user&only-active=${activeAndInactive ? "false" : "true"}`
    }`
  );
};

export default {
  getStations,
};
