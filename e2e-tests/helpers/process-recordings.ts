import { RecordingId, TrackId } from "@shared/api/common";
import { expect, test } from "@/helpers/upload-tests";
import { loginSuperAdminUser } from "@/helpers/create-test-entities";
import { TestApiImpl } from "@typedefs/client";
import { RecordingProcessingState, RecordingType } from "@shared/api/consts";
import { ApiRecordingProcessingJob } from "@shared/api/recording";

const createTracksWithTags = (
  trackTags: (string | { tag: string; weight: number })[],
  overDurationSeconds: number,
) => {
  return trackTags.map((trackTag, i) => {
    const tag = typeof trackTag === "string" ? trackTag : trackTag.tag;
    const position = {
      x: 20,
      y: 20,
      width: 10,
      height: 10,
      blank: false,
      mass: typeof trackTag === "string" ? 0 : trackTag.weight,
    };
    return {
      start_s: (overDurationSeconds / trackTags.length) * i,
      end_s: Math.min((overDurationSeconds / trackTags.length) * i + 7, overDurationSeconds),
      predictions: [{ confidence: 0.9, confident: true, tag, name: "Master" }],
      positions: [position],
      thumbnail: {
        score: typeof trackTag === "string" ? 0 : trackTag.weight,
        contours: 0,
        region: position,
        median_diff: 0,
      },
    };
  });
};

export const processRecordingWithTracksAndTags = async (
  recordingId: RecordingId,
  trackTags: (string | { tag: string; weight: number })[],
  overDurationSeconds: number,
): Promise<TrackId[]> => {
  return await test.step(`Processing recording #${recordingId}`, async () => {
    const superUserHandle = await loginSuperAdminUser(
      "admin_test",
      "admin@email.com",
      "admin_test",
    );
    const SuperUser = TestApiImpl.withAuth(superUserHandle.testId);
    const processingJobResponse = await SuperUser.Recordings.getOneRecordingForProcessing(
      RecordingType.ThermalRaw,
      [RecordingProcessingState.TrackAndAnalyse],
      recordingId,
    );
    expect(processingJobResponse, "got processing job").toBeTruthy();
    const processingJob = (processingJobResponse.result as { recording: ApiRecordingProcessingJob })
      .recording;
    expect(processingJob.id, "got correct recording").toEqual(recordingId);

    const getAlgorithm = await SuperUser.Recordings.getAlgorithmId({ name: "Master" });
    expect(getAlgorithm.success, "got algorithm").toBeTruthy();
    const algorithmId = (getAlgorithm.result as { algorithmId: number }).algorithmId;

    const trackAndTagResponse = await SuperUser.Recordings.submitProcessingTracksAndTags(
      processingJob.id,
      createTracksWithTags(trackTags, overDurationSeconds),
      algorithmId,
    );
    expect(trackAndTagResponse, "adding tracks and tags succeeded").toBeTruthy();
    const finishedResponse = await SuperUser.Recordings.finishProcessingJob(
      processingJob.id,
      processingJob.jobKey,
      true,
      true,
    );
    expect(finishedResponse.success, "moved recording to finished processing state").toEqual(true);
    return trackAndTagResponse as TrackId[];
  });
};
