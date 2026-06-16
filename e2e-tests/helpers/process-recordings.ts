import { RecordingId } from "@shared/api/common";
import { expect, test } from "@/helpers/upload-tests";
import { loginSuperAdminUser } from "@/helpers/create-test-entities";
import { TestApiImpl } from "@typedefs/client";
import { RecordingProcessingState, RecordingType } from "@shared/api/consts";
import { ApiRecordingProcessingJob } from "@shared/api/recording";

const createTracksWithTags = (trackTags: string[]) => {
  return trackTags.map((trackTag) => ({
    start_s: 0,
    end_s: 10,
    predictions: [{ confidence: 0.9, confident: true, tag: trackTag, name: "Master" }],
    positions: [
      {
        x: 20,
        y: 20,
        width: 10,
        height: 10,
        blank: false,
        mass: 30,
      },
    ],
  }));
};

export const processRecordingWithTracksAndTags = async (
  recordingId: RecordingId,
  trackTags: string[],
) => {
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
      createTracksWithTags(trackTags),
      algorithmId,
    );
    expect(trackAndTagResponse.success, "adding tracks and tags succeeded").toEqual(true);
    const finishedResponse = await SuperUser.Recordings.finishProcessingJob(
      processingJob.id,
      processingJob.jobKey,
      true,
      true,
    );
    expect(finishedResponse.success, "moved recording to finished processing state").toEqual(true);
  });
};
