import { expect, test } from "@/helpers/upload-tests";
import { createProjectWithUserAndDevice, ProjectBundle } from "@/helpers/create-test-entities";
import { uploadThermalRecordingFromDevice } from "@/helpers/recording-uploads";
import { processRecordingWithTracksAndTags } from "@/helpers/process-recordings";
import { addMinutes, addSeconds } from "@/helpers/date-helpers";
import { RecordingProcessingState, RecordingType } from "@shared/api/consts";
import { ApiRecordingProcessingJob, ApiRecordingResponse } from "@shared/api/recording";

// When the classifier submits a classification via the tracks-and-tags processing endpoint, and it
// matches an ignored ("invalid regional") classification for the project, it should be stored as
// "unidentified".

const initialDateTime = new Date("2026-08-01T10:00:00Z");
const durationSeconds = 30;

const uploadAndProcess = async (
  project: ProjectBundle,
  file: ArrayBuffer,
  tags: string[],
): Promise<string[]> => {
  const recordingDateTime = addMinutes(initialDateTime, 1);
  const recordingId = await uploadThermalRecordingFromDevice({
    file,
    location: project.locationBase,
    deviceHandle: project.getDevice(),
    recordingDateTime,
    duration: durationSeconds,
    uploadTime: addMinutes(addSeconds(recordingDateTime, durationSeconds), 1),
  });
  await processRecordingWithTracksAndTags(recordingId, tags, durationSeconds);
  const recording = (await project
    .api()
    .Recordings.getRecordingById(recordingId)) as ApiRecordingResponse;
  expect(recording, "got recording").toBeTruthy();
  return [...recording.tracks]
    .sort((a, b) => a.start - b.start)
    .flatMap(({ tags }) => tags.map(({ what }) => what));
};

// Uses the older, deprecated per-track processing routes, which some clients still use.
const uploadAndProcessWithLegacyRoutes = async (
  project: ProjectBundle,
  file: ArrayBuffer,
  tags: string[],
  route: "tags" | "tags-bulk",
): Promise<string[]> => {
  const recordingDateTime = addMinutes(initialDateTime, 1);
  const recordingId = await uploadThermalRecordingFromDevice({
    file,
    location: project.locationBase,
    deviceHandle: project.getDevice(),
    recordingDateTime,
    duration: durationSeconds,
    uploadTime: addMinutes(addSeconds(recordingDateTime, durationSeconds), 1),
  });
  const SuperUser = project.api(await project.getTestSuperUser());
  const jobResponse = await SuperUser.Recordings.getOneRecordingForProcessing(
    RecordingType.ThermalRaw,
    [RecordingProcessingState.TrackAndAnalyse],
    recordingId,
  );
  expect(jobResponse.success, "got processing job").toBe(true);
  const job = (jobResponse.result as { recording: ApiRecordingProcessingJob }).recording;
  const algorithmResponse = await SuperUser.Recordings.getAlgorithmId({ name: "Master" });
  const algorithmId = (algorithmResponse.result as { algorithmId: number }).algorithmId;

  const position = { x: 100, y: 80, width: 5, height: 5, blank: false, mass: 5 };
  for (const [i, tag] of tags.entries()) {
    const trackResponse = await SuperUser.Recordings.submitProcessingTrack(
      recordingId,
      {
        start_s: i * 2,
        end_s: i * 2 + 1,
        predictions: [],
        positions: [position],
        thumbnail: { score: 5, contours: 0, region: position, median_diff: 0 },
      },
      algorithmId,
    );
    expect(trackResponse.success, "added track").toBe(true);
    const trackId = (trackResponse.result as { trackId: number }).trackId;
    const tagResponse =
      route === "tags"
        ? await SuperUser.Recordings.submitProcessingTrackTag(recordingId, trackId, tag, 0.9, {
            name: "Master",
            confident: true,
          })
        : await SuperUser.Recordings.submitProcessingTrackTagsBulk(recordingId, trackId, [
            { name: "Master", tag, confidence: 0.9, confident: true },
          ]);
    expect(tagResponse.success, "added tag").toBe(true);
  }
  const finished = await SuperUser.Recordings.finishProcessingJob(
    recordingId,
    job.jobKey,
    true,
    true,
  );
  expect(finished.success, "finished processing").toBe(true);
  const recording = (await project
    .api()
    .Recordings.getRecordingById(recordingId)) as ApiRecordingResponse;
  return [...recording.tracks]
    .sort((a, b) => a.start - b.start)
    .flatMap(({ tags }) => tags.map(({ what }) => what));
};

const setIgnoredThermalTags = async (
  project: ProjectBundle,
  tags: string[],
) => {
  const response = await project
    .api()
    .Projects.saveProjectSettings(project.projectHandle.id, { regionInvalidThermalTags: tags });
  expect(response.success, "saved project settings").toBe(true);
};

test.describe("Ignored project classifications in processing", () => {
  test("A classification in the project's ignored thermal list is stored as unidentified", async ({
    oneFrameCptv,
  }) => {
    const project = await createProjectWithUserAndDevice({ initialDateTime });
    await setIgnoredThermalTags(project, ["possum"]);
    const whats = await uploadAndProcess(project, oneFrameCptv, ["possum", "cat"]);
    expect(whats.sort()).toEqual(["cat", "unidentified"]);
  });

  test("Ignoring a parent classification also ignores its children", async ({ oneFrameCptv }) => {
    const project = await createProjectWithUserAndDevice({ initialDateTime });
    await setIgnoredThermalTags(project, ["leporidae"]);
    const whats = await uploadAndProcess(project, oneFrameCptv, ["rabbit", "hare", "cat"]);
    expect(whats.sort()).toEqual(["cat", "unidentified", "unidentified"]);
  });

  test("Ignoring a child classification doesn't ignore its parent or siblings", async ({
    oneFrameCptv,
  }) => {
    const project = await createProjectWithUserAndDevice({ initialDateTime });
    await setIgnoredThermalTags(project, ["rabbit"]);
    const whats = await uploadAndProcess(project, oneFrameCptv, ["leporidae", "hare", "rabbit"]);
    expect(whats.sort()).toEqual(["hare", "leporidae", "unidentified"]);
  });

  test("Classifications are unchanged when the project has no ignored list", async ({
    oneFrameCptv,
  }) => {
    const project = await createProjectWithUserAndDevice({ initialDateTime });
    const whats = await uploadAndProcess(project, oneFrameCptv, ["possum", "cat"]);
    expect(whats.sort()).toEqual(["cat", "possum"]);
  });

  test("Another project's ignored list doesn't affect this project", async ({ oneFrameCptv }) => {
    const ignoringProject = await createProjectWithUserAndDevice({ nameBase: "Ignoring" });
    await setIgnoredThermalTags(ignoringProject, ["possum"]);
    const otherProject = await createProjectWithUserAndDevice({ nameBase: "Other" });
    const whats = await uploadAndProcess(otherProject, oneFrameCptv, ["possum"]);
    expect(whats).toEqual(["possum"]);
  });

  for (const route of ["tags-bulk", "tags"] as const) {
    test(`The deprecated per-track '${route}' route also reclassifies ignored classifications`, async ({
      oneFrameCptv,
    }) => {
      const project = await createProjectWithUserAndDevice({ initialDateTime });
      await setIgnoredThermalTags(project, ["leporidae"]);
      const whats = await uploadAndProcessWithLegacyRoutes(
        project,
        oneFrameCptv,
        ["rabbit", "cat"],
        route,
      );
      expect(whats.sort()).toEqual(["cat", "unidentified"]);
    });
  }

  // TODO: Same cases for audio recordings with `regionInvalidAudioTags`, and a browser test
  //  for adding/removing invalid tags in the project settings UI.
});
