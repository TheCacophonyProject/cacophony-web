import { FetchResult } from "@api/Recording.api";
import CacophonyApi from "@api/CacophonyApi";
import { ApiScheduleResponse, ScheduleConfig } from "@typedefs/api/schedule";
import { ApiAudiobaitFileResponse } from "@typedefs/api/file";
import { ScheduleId, FileId } from "@typedefs/api/common";

const getSchedulesForCurrentUser = (): Promise<
  FetchResult<{ schedules: ApiScheduleResponse[] }>
> => {
  return CacophonyApi.get("/api/v1/schedules/for-user");
};

const getAudioBaitFiles = (): Promise<
  FetchResult<{ files: ApiAudiobaitFileResponse[] }>
> => {
  return CacophonyApi.get("/api/v1/files?type=audioBait");
};

const createSchedule = (
  schedule: ScheduleConfig
): Promise<FetchResult<{ id: ScheduleId }>> => {
  return CacophonyApi.post("/api/v1/schedules", {
    schedule,
  });
};

const deleteSchedule = (scheduleId: ScheduleId): Promise<FetchResult<{}>> => {
  return CacophonyApi.delete(`/api/v1/schedules/${scheduleId}`);
};

const uploadAudiobaitFile = (
  sound: FormData
): Promise<FetchResult<{ id: FileId }>> => {
  return CacophonyApi.postMultipartFormData("/api/v1/files", sound);
};

const deleteAudiobaitFile = (fileId: FileId): Promise<FetchResult<{}>> => {
  return CacophonyApi.delete(`/api/v1/files/${fileId}`);
};

const getAudioBaitFileSource = async (
  fileId: FileId
): Promise<
  FetchResult<{ file: ApiAudiobaitFileResponse; fileSize: number; jwt: string }>
> => {
  return CacophonyApi.get(`/api/v1/files/${fileId}`);
};

export default {
  getAudioBaitFileSource,
  getSchedulesForCurrentUser,
  getAudioBaitFiles,
  createSchedule,
  deleteSchedule,
  uploadAudiobaitFile,
  deleteAudiobaitFile,
};
