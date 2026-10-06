import { expect, test } from "@/helpers/upload-tests";
import {
  addUserToProject,
  createProjectWithUserAndDevice,
  createUser,
  ProjectBundle,
} from "@/helpers/create-test-entities";
import {
  uploadAudioRecordingFromDevice,
  uploadThermalRecordingFromDevice,
} from "@/helpers/recording-uploads";
import { processRecordingWithTracksAndTags } from "@/helpers/process-recordings";
import { confirmEmailAddressViaApi } from "@/helpers/email-utils";
import {
  signInExistingUser,
  urlNormaliseName,
  waitToNavigateToProject,
} from "@/helpers/browse-helpers";
import { addMinutes, addSeconds } from "@/helpers/date-helpers";
import { ApiGroupResponse as ApiProjectResponse } from "@shared/api/group";
import { HttpStatusCode, RecordingProcessingState, RecordingType } from "@shared/api/consts";
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

const uploadAndProcessAudio = async (
  project: ProjectBundle,
  file: ArrayBuffer,
  tags: string[],
): Promise<string[]> => {
  const recordingDateTime = addMinutes(initialDateTime, 1);
  const recordingId = await uploadAudioRecordingFromDevice({
    file,
    location: project.locationBase,
    deviceHandle: project.getDevice(),
    recordingDateTime,
    duration: durationSeconds,
    uploadTime: addMinutes(addSeconds(recordingDateTime, durationSeconds), 1),
  });
  const SuperUser = project.api(await project.getTestSuperUser());
  const jobResponse = await SuperUser.Recordings.getOneRecordingForProcessing(
    RecordingType.Audio,
    [RecordingProcessingState.Analyse],
    recordingId,
  );
  expect(jobResponse.success, "got processing job").toBe(true);
  const job = (jobResponse.result as { recording: ApiRecordingProcessingJob }).recording;
  const algorithmResponse = await SuperUser.Recordings.getAlgorithmId({
    name: "Master",
  });
  const algorithmId = (algorithmResponse.result as { algorithmId: number }).algorithmId;
  const tracksResponse = await SuperUser.Recordings.submitProcessingTracksAndTags(
    recordingId,
    tags.map((tag, i) => ({
      start_s: i * 2,
      end_s: i * 2 + 1,
      minFreq: 100,
      maxFreq: 2000,
      predictions: [{ confidence: 0.9, confident: true, tag, name: "Master" }],
    })),
    algorithmId,
  );
  expect(tracksResponse, "adding tracks and tags succeeded").toBeTruthy();
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

const setIgnoredTags = async (
  project: ProjectBundle,
  settings: {
    regionInvalidThermalTags?: string[];
    regionInvalidAudioTags?: string[];
  },
) => {
  const response = await project
    .api()
    .Projects.saveProjectSettings(project.projectHandle.id, settings);
  expect(response.success, "saved project settings").toBe(true);
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
  const algorithmResponse = await SuperUser.Recordings.getAlgorithmId({
    name: "Master",
  });
  const algorithmId = (algorithmResponse.result as { algorithmId: number }).algorithmId;

  const position = {
    x: 100,
    y: 80,
    width: 5,
    height: 5,
    blank: false,
    mass: 5,
  };
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

const setIgnoredThermalTags = async (project: ProjectBundle, tags: string[]) => {
  const response = await project.api().Projects.saveProjectSettings(project.projectHandle.id, {
    regionInvalidThermalTags: tags,
  });
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
    const ignoringProject = await createProjectWithUserAndDevice({
      nameBase: "Ignoring",
    });
    await setIgnoredThermalTags(ignoringProject, ["possum"]);
    const otherProject = await createProjectWithUserAndDevice({
      nameBase: "Other",
    });
    const whats = await uploadAndProcess(otherProject, oneFrameCptv, ["possum"]);
    expect(whats).toEqual(["possum"]);
  });

  test("A classification in the project's ignored audio list is stored as unidentified", async ({
    standardAudio,
  }) => {
    const project = await createProjectWithUserAndDevice({ initialDateTime });
    await setIgnoredTags(project, { regionInvalidAudioTags: ["albatross"] });
    const whats = await uploadAndProcessAudio(project, standardAudio, [
      "wandering albatross",
      "bellbird",
    ]);
    expect(whats.sort()).toEqual(["bellbird", "unidentified"]);
  });

  test("The ignored thermal list doesn't affect audio, and the audio list doesn't affect thermal", async ({
    standardAudio,
    oneFrameCptv,
  }) => {
    const project = await createProjectWithUserAndDevice({ initialDateTime });
    await setIgnoredTags(project, {
      regionInvalidThermalTags: ["bellbird"],
      regionInvalidAudioTags: ["possum"],
    });
    expect(await uploadAndProcessAudio(project, standardAudio, ["bellbird"])).toEqual(["bellbird"]);
    expect(await uploadAndProcess(project, oneFrameCptv, ["possum"])).toEqual(["possum"]);
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

  test("Project admins can add and remove invalid thermal and audio tags in project settings", async ({
    page,
  }) => {
    const project = await createProjectWithUserAndDevice({ initialDateTime });
    const projectName = project.projectHandle.testId;
    const adminUser = project.getAdminUser();
    await confirmEmailAddressViaApi(adminUser);
    await signInExistingUser(page, adminUser.testId);
    await waitToNavigateToProject(page, projectName);
    const settingsUrl = `/${urlNormaliseName(projectName)}/settings/project-settings`;
    await page.goto(settingsUrl);

    const invalidTag = (grouping: "thermal" | "audio", tag: string) =>
      page.getByTestId(`invalid ${grouping} tag ${tag}`);

    const addTag = async (grouping: "thermal" | "audio", tag: string) => {
      await page.getByTestId(`add invalid ${grouping} tag`).click();
      const tagSelect = page.getByTestId("invalid tag select");
      await tagSelect.getByTestId("tag search").fill(tag);
      await tagSelect.getByTestId(`tag option ${tag}`).click();
      await page.getByTestId("confirm add invalid tag").click();
      await expect(page.getByTestId("confirm add invalid tag")).toBeHidden();
    };

    await test.step("Add a thermal tag and an audio tag", async () => {
      await addTag("thermal", "possum");
      await expect(invalidTag("thermal", "possum")).toBeVisible();
      await addTag("audio", "bellbird");
      await expect(invalidTag("audio", "bellbird")).toBeVisible();
    });

    await test.step("The tags are saved to the project settings, in the right lists", async () => {
      await expect(async () => {
        const response = await project.api().Projects.getProjectById(project.projectHandle.id);
        const settings = (response as ApiProjectResponse).settings;
        expect(settings?.regionInvalidThermalTags).toEqual(["possum"]);
        expect(settings?.regionInvalidAudioTags).toEqual(["bellbird"]);
      }).toPass();
    });

    await test.step("The tags persist after a reload, and can be removed", async () => {
      await page.reload();
      await expect(invalidTag("thermal", "possum")).toBeVisible();
      await expect(invalidTag("audio", "bellbird")).toBeVisible();
      await invalidTag("thermal", "possum").getByRole("button").click();
      await invalidTag("thermal", "possum").getByTestId("confirm action").click();
      await expect(invalidTag("thermal", "possum")).toBeHidden();
      await expect(invalidTag("audio", "bellbird")).toBeVisible();
    });
  });

  test("Non-admin project members can't change the ignored lists through the API", async () => {
    const project = await createProjectWithUserAndDevice({ initialDateTime });
    const member = await createUser("member");
    await addUserToProject(project, member);

    const response = await project
      .api(member)
      .Projects.saveProjectSettings(project.projectHandle.id, {
        regionInvalidThermalTags: ["possum"],
        regionInvalidAudioTags: ["bellbird"],
      });
    expect(response.success, "non-admin is blocked from saving settings").toBe(false);
    expect(response.status).toBe(HttpStatusCode.Forbidden);

    const savedProject = (await project
      .api()
      .Projects.getProjectById(project.projectHandle.id)) as ApiProjectResponse;
    expect(savedProject.settings?.regionInvalidThermalTags).toBeUndefined();
    expect(savedProject.settings?.regionInvalidAudioTags).toBeUndefined();
  });

  test("Non-admin project members can't access the project settings UI", async ({ page }) => {
    const project = await createProjectWithUserAndDevice({ initialDateTime });
    const projectName = project.projectHandle.testId;
    const member = await createUser("member");
    await addUserToProject(project, member);
    await confirmEmailAddressViaApi(member);
    await signInExistingUser(page, member.testId);
    await waitToNavigateToProject(page, projectName);

    await page.goto(`/${urlNormaliseName(projectName)}/settings/project-settings`);
    await expect(page, "redirected away from admin-only settings").not.toHaveURL(/\/settings/);
    await expect(page.getByTestId("add invalid thermal tag")).toHaveCount(0);
    await expect(page.getByTestId("add invalid audio tag")).toHaveCount(0);
  });
});
