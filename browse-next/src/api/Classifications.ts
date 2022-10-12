import type { ApiClassificationResponse } from "@typedefs/api/trackTag";
import type { FetchResult } from "@api/types";
import CacophonyApi from "./api";

export const getClassifications = (version?: string) =>
  CacophonyApi.get(
    `/api/v1/files/classifications${version ? `?version=${version}` : ""}`
  ) as Promise<FetchResult<ApiClassificationResponse>>;
