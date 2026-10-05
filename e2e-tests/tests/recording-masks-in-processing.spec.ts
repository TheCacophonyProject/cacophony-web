import { expect, test } from "@/helpers/upload-tests";
import { createProjectWithUserAndDevice } from "@/helpers/create-test-entities";
import { uploadThermalRecordingFromDevice } from "@/helpers/recording-uploads";
import { addMinutes, addSeconds } from "@/helpers/date-helpers";
import { RecordingProcessingState, RecordingType } from "@shared/api/consts";
import { ApiRecordingProcessingJob, ApiRecordingResponse } from "@shared/api/recording";

const makeTrack = (startSeconds: number, endSeconds: number, x: number, y: number, tag: string) => {
  const position = { x, y, width: 5, height: 5, blank: false, mass: 5 };
  return {
    start_s: startSeconds,
    end_s: endSeconds,
    predictions: [{ confidence: 0.9, confident: true, tag, name: "Master" }],
    positions: [position],
    thumbnail: {
      score: 5,
      contours: 0,
      region: position,
      median_diff: 0,
    },
  };
};

test("A masked track in the middle of a bulk tracks-and-tags request doesn't shift tags and data onto the wrong tracks", async ({
  oneFrameCptv,
}) => {
  // - Upload a recording from a device with a location.
  // - Add a mask region in the top left corner of the frame.
  // - Submit three tracks in a single processing request: the middle track is entirely inside the
  //   mask region, the first and last are not.
  // - Only the first and last tracks should be created, each with their own times and tags.
  const initialDateTime = new Date("2026-08-01T10:00:00Z");
  const recordingDateTime = addMinutes(initialDateTime, 1);
  const durationSeconds = 30;
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const deviceHandle = project.getDevice();
  const User = project.api();

  const recordingId = await uploadThermalRecordingFromDevice({
    file: oneFrameCptv,
    location: project.locationBase,
    deviceHandle,
    recordingDateTime,
    duration: durationSeconds,
    uploadTime: addMinutes(addSeconds(recordingDateTime, durationSeconds), 1),
  });

  const maskResponse = await User.Devices.updateMaskRegionsForDevice(deviceHandle.id, {
    maskRegions: {
      Water: {
        regionData: [
          { x: 0, y: 0 },
          { x: 0.1, y: 0.0 },
          { x: 0.1, y: 0.1 },
          { x: 0.0, y: 0.1 },
          { x: 0, y: 0.0 },
        ],
      },
    },
  });
  expect(maskResponse.success, "mask region was set").toBe(true);

  const SuperUser = project.api(await project.getTestSuperUser());
  const processingJobResponse = await SuperUser.Recordings.getOneRecordingForProcessing(
    RecordingType.ThermalRaw,
    [RecordingProcessingState.TrackAndAnalyse],
    recordingId,
  );
  expect(processingJobResponse.success, "got processing job").toBe(true);
  const processingJob = (processingJobResponse.result as { recording: ApiRecordingProcessingJob })
    .recording;
  expect(processingJob.id, "got correct recording").toEqual(recordingId);

  const algorithmResponse = await SuperUser.Recordings.getAlgorithmId({ name: "Master" });
  expect(algorithmResponse.success, "got algorithm").toBe(true);
  const algorithmId = (algorithmResponse.result as { algorithmId: number }).algorithmId;

  const trackAndTagResponse = await SuperUser.Recordings.submitProcessingTracksAndTags(
    recordingId,
    [
      makeTrack(1, 4, 100, 80, "possum"),
      // Entirely inside the mask region, so this track is skipped.
      makeTrack(5, 6, 0, 0, "rat"),
      makeTrack(7, 9, 100, 80, "cat"),
    ],
    algorithmId,
  );
  expect(trackAndTagResponse, "adding tracks and tags succeeded").toBeTruthy();

  const finishedResponse = await SuperUser.Recordings.finishProcessingJob(
    recordingId,
    processingJob.jobKey,
    true,
    true,
  );
  expect(finishedResponse.success, "moved recording to finished processing state").toBe(true);

  const recording = (await User.Recordings.getRecordingById(recordingId)) as ApiRecordingResponse;
  expect(recording, "got recording").toBeTruthy();
  const tracks = [...recording.tracks].sort((a, b) => a.start - b.start);
  expect(
    tracks.map(({ start, end }) => [start, end]),
    "only the unmasked tracks were created, with their own times",
  ).toEqual([
    [1, 4],
    [7, 9],
  ]);
  expect(
    tracks.map(({ tags }) => tags.map(({ what }) => what)),
    "each track has the tag that was submitted for it",
  ).toEqual([["possum"], ["cat"]]);
});
