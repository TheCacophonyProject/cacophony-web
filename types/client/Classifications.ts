import type { ApiClassificationResponse } from "@typedefs/api/trackTag.js";
import type { CacophonyApiClient } from "@typedefs/client/api.js";
import type { FetchResult, TestHandle } from "@typedefs/client/types.js";
import { DEFAULT_AUTH_ID } from "@typedefs/client/types.js";

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
