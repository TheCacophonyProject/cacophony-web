import CacophonyApi from "./CacophonyApi";
import { FetchResult } from "@api/Recording.api";
import { RecordingId, TagId } from "@typedefs/api/common";
import { ApiRecordingTagRequest } from "@typedefs/api/tag";

export default {
  addTag,
  deleteTag,
};

const apiPath = "/api/v1/tags";

function addTag(
  tag: ApiRecordingTagRequest,
  id: RecordingId
): Promise<FetchResult<{ tagId: TagId }>> {
  return CacophonyApi.post(apiPath, {
    recordingId: id,
    tag: tag,
  });
}

function deleteTag(id: TagId): Promise<FetchResult<void>> {
  return CacophonyApi.delete(apiPath, { tagId: id });
}
