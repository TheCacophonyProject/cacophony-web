import { FetchResult } from "@api/Recording.api";
import CacophonyApi from "@api/CacophonyApi";
import { ApiScheduleResponse, ScheduleConfig } from "@typedefs/api/schedule";
import { ApiFileResponse } from "@typedefs/api/file";
import { ScheduleId } from "@typedefs/api/common";

const getSchedulesForCurrentUser = (): Promise<
  FetchResult<{ schedules: ApiScheduleResponse[] }>
> => {
  return CacophonyApi.get("/api/v1/schedules/for-user");
};

const getAudioBaitFiles = (): Promise<
  FetchResult<{ files: ApiFileResponse[] }>
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

export default {
  getSchedulesForCurrentUser,
  getAudioBaitFiles,
  createSchedule,
  deleteSchedule,
};
