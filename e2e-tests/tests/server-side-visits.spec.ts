import { test } from "@/helpers/upload-tests";
import {
  addUserToProject,
  createProjectWithUserAndDevice,
  createUser,
} from "@/helpers/create-test-entities";
import {
  checkVisitClassification,
  uploadRecordingsFromDeviceWithTimesAndDurations,
} from "@/helpers/recording-uploads";
import { addMinutes } from "@/helpers/date-helpers";
import { ApiVisitResponse } from "@shared/api/monitoring";
import { expect } from "@playwright/test";
import { ApiRecordingResponse } from "@shared/api/recording";
import { ApiStaticVisitResponse } from "@shared/api/visit";
import { TrackTagId } from "@shared/api/common";
import { computeVisits, RawVisitRow } from "@typedefs/client/tempComputeVisists";

test("A single recording, single tag server-side visit is computed the same as client-side", async ({
  oneFrameCptv,
}) => {
  // Basic test to make sure visits get made.
  // I think visits should only be composed of recordings that have been processed,
  // therefore, we only need to recompute visits when:
  // - A recording is marked "finished", and, maybe as an optimisation, there are no further recordings queued
  //   for that device within the timespan we care about (of the same recording type)
  // - A new trackTag is added to a recording
  // - A recording is deleted. (Can we debounce this, in the case where someone is deleting a lot of recordings?)
  //
  // I think that's it?
  // Make sure new end-point matches results of previous endpoint.
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const now = new Date();
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const projectHandle = project.projectHandle;
  const User = project.api();
  const [{ recordingId }] = await uploadRecordingsFromDeviceWithTimesAndDurations(
    [
      {
        durationSeconds: 30,
        recordingDateTime: addMinutes(initialDateTime, 1),
        tracks: ["possum"],
      },
    ],
    project.getDevice(),
    project.locationBase,
    oneFrameCptv,
  );
  const recording = (await User.Recordings.getRecordingById(recordingId)) as ApiRecordingResponse;
  expect(recording, "got recording").toBeTruthy();
  expect(recording.tracks.length, "recording has one track").toEqual(1);
  const track = recording.tracks[0];
  expect(track.tags.length, "recording has one trackTag").toEqual(1);
  const trackTag = track.tags[0];
  expect(trackTag.what, "recording has correct trackTag").toEqual("possum");
  expect(trackTag.automatic, "trackTag is by AI").toBe(true);

  // Now we should be able to check the visits end-points
  const runtimeVisit = await User.Monitoring.getAllVisitsForProjectBetweenTimes(
    projectHandle.id,
    initialDateTime,
    now,
  );
  expect(runtimeVisit.success, "got visits response").toBe(true);
  expect(runtimeVisit.visits.length, "got one visit").toEqual(1);
  const visit = runtimeVisit.visits[0] as ApiVisitResponse;
  expect(visit.recordings.length, "visit has one recording").toEqual(1);
  expect(visit.recordings[0].recId, "it's the recording we added").toEqual(recordingId);
  expect(visit.classification, "visit classification is correct").toEqual("possum");
  expect(visit.classFromUserTag, "visit is based on AI classification").toBe(false);
  const staticVisit = (await User.Visits.forProject(
    projectHandle.id,
    initialDateTime,
    now,
  )) as ApiStaticVisitResponse[];
  expect(staticVisit, "got visits response").toBeTruthy();
  expect(staticVisit.length, "got one visit").toEqual(1);
  expect(staticVisit[0].aiClassification, "visit classification is correct").toEqual(
    "all.mammal.possum",
  );
  expect(staticVisit[0].humanClassification, "visit is based on AI classification").toBeNull();
});

test("A single recording, with multiple animal tags chooses the correct overall classification", async ({
  oneFrameCptv,
}) => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const now = new Date();
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const projectHandle = project.projectHandle;
  const User = project.api();
  await uploadRecordingsFromDeviceWithTimesAndDurations(
    [
      {
        recordingDateTime: addMinutes(initialDateTime, 1),
        durationSeconds: 30,
        tracks: ["hedgehog", "possum", "possum"],
      },
    ],
    project.getDevice(),
    project.locationBase,
    oneFrameCptv,
  );
  expect(
    await checkVisitClassification(project, initialDateTime, now),
    "single visit is possum",
  ).toEqual(["all.mammal.possum"]);
});

test("A single recording, with two conflicting animal tags chooses the best one", async ({
  oneFrameCptv,
}) => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const now = new Date();
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const projectHandle = project.projectHandle;
  const User = project.api();
  await uploadRecordingsFromDeviceWithTimesAndDurations(
    [
      {
        recordingDateTime: addMinutes(initialDateTime, 1),
        durationSeconds: 30,
        tracks: ["hedgehog", { tag: "possum", weight: 10 }],
      },
    ],
    project.getDevice(),
    project.locationBase,
    oneFrameCptv,
  );
  expect(
    await checkVisitClassification(project, initialDateTime, now),
    "single visit is possum",
  ).toEqual(["all.mammal.possum"]);
});

test("Multiple recordings with only AI classifications", async ({ oneFrameCptv }) => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const now = new Date();
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  // Add and tag a recording.
  await uploadRecordingsFromDeviceWithTimesAndDurations(
    [
      {
        recordingDateTime: addMinutes(initialDateTime, 1),
        durationSeconds: 30,
        tracks: ["unidentified", "hedgehog", "false-positive"],
      },
      {
        recordingDateTime: addMinutes(initialDateTime, 2),
        durationSeconds: 30,
        tracks: ["possum", "unidentified"],
      },
      {
        recordingDateTime: addMinutes(initialDateTime, 3),
        durationSeconds: 30,
        tracks: ["possum"],
      },
    ],
    project.getDevice(),
    project.locationBase,
    oneFrameCptv,
  );
  expect(
    await checkVisitClassification(project, initialDateTime, now),
    "single visit is possum",
  ).toEqual(["all.mammal.possum"]);
});

test("A single recording with a mixture of AI and human classifications", async ({
  oneFrameCptv,
}) => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const now = new Date();
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const User = project.api();
  const [{ recordingId, tracks }] = await uploadRecordingsFromDeviceWithTimesAndDurations(
    [
      {
        recordingDateTime: addMinutes(initialDateTime, 1),
        durationSeconds: 10,
        tracks: ["cat", "possum", "possum"],
      },
      {
        recordingDateTime: addMinutes(initialDateTime, 2),
        durationSeconds: 40,
        tracks: ["possum"],
      },
    ],
    project.getDevice(),
    project.locationBase,
    oneFrameCptv,
  );
  expect(
    await checkVisitClassification(project, initialDateTime, now),
    "single visit is possum",
  ).toEqual(["all.mammal.possum"]);
  const trackTagId = await User.Recordings.replaceTrackTag(
    {
      what: "cat",
    },
    recordingId,
    tracks[1],
  );
  expect(trackTagId, "added user trackTag").toBeTruthy();
  expect(
    await checkVisitClassification(project, initialDateTime, now),
    "single visit is cat",
  ).toEqual(["all.mammal.cat"]);
});

test("A single recording with AI and human classifications; user removing tag reverts to original AI classification", async ({
  oneFrameCptv,
}) => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const now = new Date();
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const User = project.api();
  const [{ recordingId, tracks }] = await uploadRecordingsFromDeviceWithTimesAndDurations(
    [
      {
        recordingDateTime: addMinutes(initialDateTime, 2),
        durationSeconds: 40,
        tracks: ["possum"],
      },
    ],
    project.getDevice(),
    project.locationBase,
    oneFrameCptv,
  );
  expect(
    await checkVisitClassification(project, initialDateTime, now),
    "single visit is possum",
  ).toEqual(["all.mammal.possum"]);
  const trackTagId = await User.Recordings.replaceTrackTag(
    {
      what: "cat",
    },
    recordingId,
    tracks[0],
  );
  expect(trackTagId, "added user trackTag").toBeTruthy();
  expect(
    await checkVisitClassification(project, initialDateTime, now),
    "single visit is cat",
  ).toEqual(["all.mammal.cat"]);
  await User.Recordings.removeTrackTag(
    recordingId,
    tracks[0],
    (trackTagId.result as { trackTagId: TrackTagId }).trackTagId,
  );
  expect(
    await checkVisitClassification(project, initialDateTime, now),
    "single visit is possum",
  ).toEqual(["all.mammal.possum"]);
});

test("Multiple recordings with a mixture of AI and human classifications", async ({
  oneFrameCptv,
}) => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const now = new Date();
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const User = project.api();
  const [{ recordingId, tracks }] = await uploadRecordingsFromDeviceWithTimesAndDurations(
    [
      {
        recordingDateTime: addMinutes(initialDateTime, 2),
        durationSeconds: 40,
        tracks: ["possum"],
      },
      {
        recordingDateTime: addMinutes(initialDateTime, 3),
        durationSeconds: 10,
        tracks: ["possum", "cat"],
      },
    ],
    project.getDevice(),
    project.locationBase,
    oneFrameCptv,
  );
  expect(
    await checkVisitClassification(project, initialDateTime, now),
    "single visit is possum",
  ).toEqual(["all.mammal.possum"]);
  const trackTagId = await User.Recordings.replaceTrackTag(
    {
      what: "cat",
    },
    recordingId,
    tracks[0],
  );
  expect(trackTagId, "added user trackTag").toBeTruthy();
  expect(
    await checkVisitClassification(project, initialDateTime, now),
    "single visit is cat",
  ).toEqual(["all.mammal.cat"]);
  await User.Recordings.removeTrackTag(
    recordingId,
    tracks[0],
    (trackTagId.result as { trackTagId: TrackTagId }).trackTagId,
  );
  expect(
    await checkVisitClassification(project, initialDateTime, now),
    "single visit is possum",
  ).toEqual(["all.mammal.possum"]);
});

test("Multiple recordings with a mixture of AI and human classifications, multiple human classifications", async ({
  oneFrameCptv,
}) => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const now = new Date();
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const User = project.api();
  const [visitA, visitB] = await uploadRecordingsFromDeviceWithTimesAndDurations(
    [
      {
        recordingDateTime: addMinutes(initialDateTime, 2),
        durationSeconds: 40,
        tracks: ["possum"],
      },
      {
        recordingDateTime: addMinutes(initialDateTime, 3),
        durationSeconds: 10,
        tracks: [{ tag: "possum", weight: 10 }, "cat"],
      },
    ],
    project.getDevice(),
    project.locationBase,
    oneFrameCptv,
  );
  expect(
    await checkVisitClassification(project, initialDateTime, now),
    "single visit is possum",
  ).toEqual(["all.mammal.possum"]);
  await test.step("Add a user tag to the first track on the first recording", async () => {
    const trackTagId = await User.Recordings.replaceTrackTag(
      {
        what: "cat",
      },
      visitA.recordingId,
      visitA.tracks[0],
    );
    expect(trackTagId, "added user trackTag").toBeTruthy();
    expect(
      await checkVisitClassification(project, initialDateTime, now),
      "single visit is cat",
    ).toEqual(["all.mammal.cat"]);
  });

  // NOTE: This should result in "split" visits, though I can't remember the splitting logic
  await test.step("Add a second user tag to the first track on the second recording", async () => {
    const trackTagId = await User.Recordings.replaceTrackTag(
      {
        what: "hedgehog", // Huh, replacing track tag seems to be in place?
      },
      visitB.recordingId,
      visitB.tracks[0],
    );
    expect(trackTagId, "added user trackTag").toBeTruthy();
    expect(trackTagId).not.toEqual(visitB.tracks[0]);
    expect(
      await checkVisitClassification(project, initialDateTime, now),
      "single visit is cat",
    ).toEqual(["all.mammal.cat"]);
  });
});

test("Multiple recordings with a mixture of AI and human classifications, conflicting human classifications", async ({
  oneFrameCptv,
}) => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const now = new Date();
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const UserA = project.api();
  const secondUser = await createUser("second user");
  await addUserToProject(project, secondUser);
  const UserB = project.api(secondUser);
  const [visitA, visitB] = await uploadRecordingsFromDeviceWithTimesAndDurations(
    [
      {
        recordingDateTime: addMinutes(initialDateTime, 2),
        durationSeconds: 40,
        tracks: ["possum"],
      },
      {
        recordingDateTime: addMinutes(initialDateTime, 3),
        durationSeconds: 10,
        tracks: ["possum", "cat"],
      },
    ],
    project.getDevice(),
    project.locationBase,
    oneFrameCptv,
  );
  expect(
    await checkVisitClassification(project, initialDateTime, now),
    "single visit is possum",
  ).toEqual(["all.mammal.possum"]);
  await test.step("Add a user tag to the first track on the first recording", async () => {
    const trackTagId = await UserA.Recordings.replaceTrackTag(
      {
        what: "cat",
      },
      visitA.recordingId,
      visitA.tracks[0],
    );
    expect(trackTagId, "added user trackTag").toBeTruthy();
    expect(
      await checkVisitClassification(project, initialDateTime, now),
      "single visit is cat",
    ).toEqual(["all.mammal.cat"]);
  });

  // NOTE: This should result in "split" visits, though I can't remember the splitting logic
  await test.step("Add a second user tag to the first track on the first recording, by a different user", async () => {
    const trackTagId = await UserB.Recordings.replaceTrackTag(
      {
        what: "hedgehog",
      },
      visitB.recordingId,
      visitB.tracks[0],
    );
    expect(trackTagId, "added user trackTag").toBeTruthy();
    expect(
      await checkVisitClassification(project, initialDateTime, now),
      "single visit is cat",
    ).toEqual(["all.mammal.cat"]);
  });
});

test("Visit computation only happens when all current pending recordings for project/location have been processed", async () => {});

test("Calculating visit islands", async () => {
  // TODO
});

test("Deleting a recording which would split a visit", async () => {
  // TODO
});

test("Deleting the classification recording at the end of a visit", async () => {
  // TODO
});

test("Newly uploaded recordings are not included in visits until they are processed", async () => {
  // TODO
});

test("Visit splitting, multiple human visits", async () => {
  const rows = [
    {
      "path": "all.mammal.possum",
      "aiTagged": true,
      "trackTagId": 149,
      "confidence": 0.9,
      "score": null,
      "startSeconds": 0,
      "endSeconds": 7,
      "trackId": 112,
      "recordingId": 68,
      "recordingStart": "2026-05-01T10:02:00.000Z",
      "recordingEnd": "2026-05-01T10:02:40.000Z"
    },
    {
      "path": "all.mammal.possum",
      "aiTagged": true,
      "trackTagId": 150,
      "confidence": 0.9,
      "score": 10,
      "startSeconds": 0,
      "endSeconds": 7,
      "trackId": 113,
      "recordingId": 69,
      "recordingStart": "2026-05-01T10:03:00.000Z",
      "recordingEnd": "2026-05-01T10:03:10.000Z"
    },
    {
      "path": "all.mammal.cat",
      "aiTagged": true,
      "trackTagId": 151,
      "confidence": 0.9,
      "score": null,
      "startSeconds": 5,
      "endSeconds": 10,
      "trackId": 114,
      "recordingId": 69,
      "recordingStart": "2026-05-01T10:03:00.000Z",
      "recordingEnd": "2026-05-01T10:03:10.000Z"
    },

    // Human classifications
    {
      "path": "all.mammal.cat",
      "aiTagged": false,
      "trackTagId": 152,
      "confidence": 0.9,
      "score": null,
      "startSeconds": 0,
      "endSeconds": 7,
      "trackId": 112,
      "recordingId": 68,
      "recordingStart": "2026-05-01T10:02:00.000Z",
      "recordingEnd": "2026-05-01T10:02:40.000Z"
    },
    {
      "path": "all.mammal.hedgehog",
      "aiTagged": false,
      "trackTagId": 153,
      "confidence": 0.9,
      "score": 10,
      "startSeconds": 0,
      "endSeconds": 7,
      "trackId": 113,
      "recordingId": 69,
      "recordingStart": "2026-05-01T10:03:00.000Z",
      "recordingEnd": "2026-05-01T10:03:10.000Z"
    },
  ] as RawVisitRow[];
  const classifications = computeVisits(rows);

  expect(classifications.length).toBe(2);
  expect(classifications[0]).toMatchObject({
    humanClassification: "all.mammal.cat",
    aiClassification: "all.mammal.possum",
  });
  expect(classifications[1]).toMatchObject({
    humanClassification: "all.mammal.hedgehog",
    aiClassification: "all.mammal.possum",
  });
});

test("Multiple human tags on different tracks of the same recording", async () => {
  const rows = [
    {
      "path": "all.mammal.possum",
      "aiTagged": true,
      "trackTagId": 149,
      "confidence": 0.9,
      "score": null,
      "startSeconds": 0,
      "endSeconds": 7,
      "trackId": 112,
      "recordingId": 68,
      "recordingStart": "2026-05-01T10:02:00.000Z",
      "recordingEnd": "2026-05-01T10:02:40.000Z"
    },
    {
      "path": "all.mammal.possum",
      "aiTagged": true,
      "trackTagId": 150,
      "confidence": 0.9,
      "score": 10,
      "startSeconds": 0,
      "endSeconds": 7,
      "trackId": 113,
      "recordingId": 69,
      "recordingStart": "2026-05-01T10:03:00.000Z",
      "recordingEnd": "2026-05-01T10:03:10.000Z"
    },
    {
      "path": "all.mammal.cat",
      "aiTagged": true,
      "trackTagId": 151,
      "confidence": 0.9,
      "score": null,
      "startSeconds": 5,
      "endSeconds": 10,
      "trackId": 114,
      "recordingId": 69,
      "recordingStart": "2026-05-01T10:03:00.000Z",
      "recordingEnd": "2026-05-01T10:03:10.000Z"
    },

    // Human classifications
    {
      "path": "all.mammal.cat",
      "aiTagged": false,
      "trackTagId": 153,
      "confidence": 0.9,
      "score": 10,
      "startSeconds": 0,
      "endSeconds": 7,
      "trackId": 113,
      "recordingId": 69,
      "recordingStart": "2026-05-01T10:03:00.000Z",
      "recordingEnd": "2026-05-01T10:03:10.000Z"
    },
    {
      "path": "all.mammal.hedgehog",
      "aiTagged": false,
      "trackTagId": 153,
      "confidence": 0.9,
      "score": null,
      "startSeconds": 5,
      "endSeconds": 10,
      "trackId": 114,
      "recordingId": 69,
      "recordingStart": "2026-05-01T10:03:00.000Z",
      "recordingEnd": "2026-05-01T10:03:10.000Z"
    },
  ] as RawVisitRow[];
  const classifications = computeVisits(rows);

  expect(classifications.length).toBe(2);
  expect(classifications[0]).toMatchObject({
    humanClassification: "all.mammal.cat",
    aiClassification: "all.mammal.possum",
  });
  expect(classifications[1]).toMatchObject({
    humanClassification: "all.mammal.hedgehog",
    aiClassification: "all.mammal.possum",
  });
});