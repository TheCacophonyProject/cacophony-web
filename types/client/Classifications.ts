import type { ApiClassificationResponse } from "@typedefs/api/trackTag";
import type { CacophonyApiClient } from "./api";
import { DEFAULT_AUTH_ID, type FetchResult, type TestHandle } from "./types";

const apiGetClassifications = (api: CacophonyApiClient, authKey: TestHandle | null = DEFAULT_AUTH_ID) => (version?: string) =>
  api.get(
    authKey, `/api/v1/files/classifications${version ? `?version=${version}` : ""}`,
  ) as Promise<FetchResult<ApiClassificationResponse>>;

export default (api: CacophonyApiClient) => {
  // NOTE: this is a bit tedious, but it makes the type inference work for the return type.
  return {
    apiGetClassifications: apiGetClassifications(api),
  };
};
