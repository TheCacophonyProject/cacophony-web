import { FetchResult } from "./Recording.api";
import CacophonyApi from "./CacophonyApi";
import { ApiClassificationResponse } from "@typedefs/api/trackTag";

function getClassifications(
  version?: string
): Promise<FetchResult<ApiClassificationResponse>> {
  return CacophonyApi.get(
    `/api/v1/files/classifications${version ? `?version=${version}` : ""}`
  );
}

export default {
  getClassifications,
};
