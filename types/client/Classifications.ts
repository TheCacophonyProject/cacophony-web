import type { ApiClassificationResponse } from "../api/trackTag.js";
import type { CacophonyApiClient } from "./api.js";
import type { FetchResult, TestHandle } from "./types.js";
import { DEFAULT_AUTH_ID } from "./types.js";

const apiGetClassifications =
  (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) =>
  (version?: string) =>
    api.get(
      authKey,
      `/api/v1/files/classifications${version ? `?version=${version}` : ""}`,
    ) as Promise<FetchResult<ApiClassificationResponse>>;

export default (api: CacophonyApiClient) => {
  // NOTE: this is a bit tedious, but it makes the type inference work for the return type.
  return {
    apiGetClassifications: apiGetClassifications(api),
  };
};
