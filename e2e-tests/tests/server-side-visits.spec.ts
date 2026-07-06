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
import { computeVisits, makeRawVisitRows } from "@shared/client/tempComputeVisits";

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
  const staticVisit = (await User.Visits.getVisitsForProject(
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

test("Multiple recordings with only AI classifications, or no tracks", async ({ oneFrameCptv }) => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const now = new Date();
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  // Add and tag a recording.
  await uploadRecordingsFromDeviceWithTimesAndDurations(
    [
      {
        recordingDateTime: addMinutes(initialDateTime, 1),
        durationSeconds: 30,
        tracks: ["unidentified", { tag: "hedgehog", weight: 10 }, "false-positive"],
      },
      {
        recordingDateTime: addMinutes(initialDateTime, 2),
        durationSeconds: 30,
        tracks: ["possum", "unidentified"],
      },
      {
        recordingDateTime: addMinutes(initialDateTime, 3),
        durationSeconds: 30,
        tracks: [],
      },
    ],
    project.getDevice(),
    project.locationBase,
    oneFrameCptv,
  );
  expect(
    await checkVisitClassification(project, initialDateTime, now),
    "single visit is hedgehog",
  ).toEqual(["all.mammal.hedgehog"]);
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

  // NOTE: This should result in "split" visits
  await test.step("Add a second user tag to the first track on the second recording", async () => {
    const trackTagId = await User.Recordings.replaceTrackTag(
      {
        what: "hedgehog",
      },
      visitB.recordingId,
      visitB.tracks[0],
    );
    expect(trackTagId, "added user trackTag").toBeTruthy();
    expect(trackTagId).not.toEqual(visitB.tracks[0]);
    expect(
      await checkVisitClassification(project, initialDateTime, now),
      "visit split into two visits, one for each recording",
    ).toEqual(["all.mammal.hedgehog", "all.mammal.cat"]);
  });
});

test("AI visit classification can't be false-positive", async ({ oneFrameCptv }) => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const now = new Date();
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const AdminUser = project.api();
  const _upload = await uploadRecordingsFromDeviceWithTimesAndDurations(
    [
      {
        recordingDateTime: addMinutes(initialDateTime, 2),
        durationSeconds: 40,
        tracks: ["false-positive"],
      },
    ],
    project.getDevice(),
    project.locationBase,
    oneFrameCptv,
  );

  const visits = (await AdminUser.Visits.getVisitsForProject(
    project.projectHandle.id,
    initialDateTime,
    now,
  )) as ApiStaticVisitResponse[];

  // We never really want AI visits of "false-positive", let's just make them be "none"
  expect(visits[0].humanClassification, "no human classification").toBeNull();
  expect(visits[0].aiClassification, "no AI classification").toBeNull();
});

test("Replace AI tag with false-positive human tag", async ({ oneFrameCptv }) => {
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
  await test.step("Add a user tag to the first track on the first recording", async () => {
    const trackTagId = await User.Recordings.replaceTrackTag(
      {
        what: "false-positive",
      },
      recordingId,
      tracks[0],
    );
    expect(trackTagId, "added user trackTag").toBeTruthy();
    expect(
      await checkVisitClassification(project, initialDateTime, now),
      "single visit is false positive",
    ).toEqual(["all.other.falsepositive"]);
  });
});

test.skip("Multiple recordings with a mixture of AI and human classifications, conflicting human classifications", async ({
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
        tracks: ["possum", { tag: "cat", weight: 15 }],
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

  // Here we make a conscious choice to diverge from the "classic" visits logic.
  // Conflicting user tags should be entered into the DB as two visits, and
  // making i.e. "all.mammal.cat", "all.mammal.hedgehog" into a visit of
  // "all.mammal" with a conflict flag should now be handled at the UI level.

  // NOTE: This should result in "split" visits
  await test.step("Add a second user tag to the first track on the first recording, by a different user", async () => {
    const trackTagId = await UserB.Recordings.replaceTrackTag(
      {
        what: "hedgehog",
      },
      visitA.recordingId,
      visitA.tracks[0],
    );
    expect(trackTagId, "added user trackTag").toBeTruthy();
    // TODO: This could diverge from the usual implementation, and class the visit as "mammal", and give a conflict tag?
    //  Or, we could resolve that at runtime in browse, which seems maybe saner?
    expect(
      await checkVisitClassification(project, initialDateTime, now),
      "multiple visits, marked with conflict?",
    ).toEqual(["all.mammal.cat", "all.mammal.hedgehog"]);
  });
});

test("Visit computation only happens when all current pending recordings for project/location have been processed", async ({
  oneFrameCptv,
}) => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const now = new Date();
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const AdminUser = project.api();
  const _uploads = await uploadRecordingsFromDeviceWithTimesAndDurations(
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
    false,
  );

  const visits = (await AdminUser.Visits.getVisitsForProject(
    project.projectHandle.id,
    initialDateTime,
    now,
  )) as ApiStaticVisitResponse[];

  expect(visits.length, "no visits yet, processing still pending").toEqual(0);
});

test("Calculating visit islands", async ({ oneFrameCptv }) => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const now = new Date();
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  // NOTE: These get all uploaded, and then all processed sequentially, to avoid race-conditions that emerge
  // non-deterministically especially in a test enviroment, and that's not really what we're trying to test here.
  const _uploads = await uploadRecordingsFromDeviceWithTimesAndDurations(
    [
      {
        recordingDateTime: addMinutes(initialDateTime, 2),
        durationSeconds: 40,
        tracks: ["possum"],
      },
      {
        recordingDateTime: addMinutes(initialDateTime, 3),
        durationSeconds: 10,
        tracks: ["possum", { tag: "cat", weight: 15 }],
      },
      {
        recordingDateTime: addMinutes(initialDateTime, 15),
        durationSeconds: 10,
        tracks: ["possum", { tag: "cat", weight: 15 }],
      },
    ],
    project.getDevice(),
    project.locationBase,
    oneFrameCptv,
    true,
    true,
  );
  // NOTE: Visits are returned reverse chronologically
  expect(
    await checkVisitClassification(project, initialDateTime, now),
    "one possum visit, followed by a cat",
  ).toEqual(["all.mammal.cat", "all.mammal.possum"]);
});

test("Deleting a recording which would split a visit", async ({ oneFrameCptv }) => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const now = new Date();
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const AdminUser = project.api();
  const uploads = await uploadRecordingsFromDeviceWithTimesAndDurations(
    [
      {
        recordingDateTime: addMinutes(initialDateTime, 2),
        durationSeconds: 40,
        tracks: ["possum"],
      },
      {
        recordingDateTime: addMinutes(initialDateTime, 3),
        durationSeconds: 10,
        tracks: ["possum", { tag: "cat", weight: 15 }],
      },
      {
        recordingDateTime: addMinutes(initialDateTime, 5),
        durationSeconds: 10,
        tracks: ["possum", { tag: "cat", weight: 15 }],
      },
      {
        recordingDateTime: addMinutes(initialDateTime, 14),
        durationSeconds: 10,
        tracks: ["possum", { tag: "cat", weight: 15 }],
      },
    ],
    project.getDevice(),
    project.locationBase,
    oneFrameCptv,
  );
  expect(await checkVisitClassification(project, initialDateTime, now), "one possum visit").toEqual(
    ["all.mammal.possum"],
  );
  await AdminUser.Recordings.deleteRecording(uploads[2].recordingId);

  expect(await checkVisitClassification(project, initialDateTime, now), "one possum visit").toEqual(
    ["all.mammal.cat", "all.mammal.possum"],
  );
});

test("Deleting the classification recording at the end of a visit", async ({ oneFrameCptv }) => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const now = new Date();
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const AdminUser = project.api();
  const uploads = await uploadRecordingsFromDeviceWithTimesAndDurations(
    [
      {
        recordingDateTime: addMinutes(initialDateTime, 2),
        durationSeconds: 40,
        tracks: ["possum", { tag: "cat", weight: 15 }],
      },
      {
        recordingDateTime: addMinutes(initialDateTime, 3),
        durationSeconds: 10,
        tracks: ["possum", { tag: "cat", weight: 15 }],
      },
      {
        recordingDateTime: addMinutes(initialDateTime, 5),
        durationSeconds: 10,
        tracks: ["possum", { tag: "cat", weight: 15 }],
      },
      {
        recordingDateTime: addMinutes(initialDateTime, 14),
        durationSeconds: 10,
        tracks: ["possum"],
      },
    ],
    project.getDevice(),
    project.locationBase,
    oneFrameCptv,
  );
  console.log(JSON.stringify(uploads, null, 2));
  expect(await checkVisitClassification(project, initialDateTime, now), "one possum visit").toEqual(
    ["all.mammal.possum"],
  );
  await AdminUser.Recordings.deleteRecording(uploads[3].recordingId);

  expect(await checkVisitClassification(project, initialDateTime, now), "one cat visit").toEqual([
    "all.mammal.cat",
  ]);
});

test("AI tags in the discarded/filtered list make 'none/null' visits", async ({ oneFrameCptv }) => {
  const initialDateTime = new Date("2026-05-01T10:00:00Z");
  const now = new Date();
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const AdminUser = project.api();
  const uploads = await uploadRecordingsFromDeviceWithTimesAndDurations(
    [
      {
        recordingDateTime: addMinutes(initialDateTime, 2),
        durationSeconds: 40,
        tracks: ["false-positive"],
      },
    ],
    project.getDevice(),
    project.locationBase,
    oneFrameCptv,
  );
  const visits = (await AdminUser.Visits.getVisitsForProject(
    project.projectHandle.id,
    initialDateTime,
    now,
  )) as ApiStaticVisitResponse[];
  expect(visits.length, "Has empty 'null' visit").toEqual(1);
  expect(visits[0].aiClassification, "ai classification is null").toBeNull();
});

test("Visits include recordings in the island with no tracks", async () => {
  const classifications = computeVisits(makeRawVisitRows([[[["possum", "ai"]]], [], []]));
  expect(classifications.length, "there is one visit").toBe(1);
  expect(classifications, "the visit contains all recordings, including empties").toMatchObject([
    {
      humanClassification: null,
      aiClassification: "possum",
      recordingIds: [1, 2, 3],
    },
  ]);
});

test("Visit splitting, each recording with a distinct human tag overriding the AI tag", async () => {
  const classifications = computeVisits(
    makeRawVisitRows([
      [
        [
          ["possum", "ai"],
          ["cat", "human"],
        ],
      ],
      [
        [
          ["possum", "ai", 10],
          ["cat", "ai"],
          ["hedgehog", "human"], // Should this assume all other tracks are also hedgehog?  Probably?
        ],
      ],
    ]),
  );

  expect(classifications.length, "there are two visits").toBe(2);
  expect(classifications, "each visit contains one human tagged recording").toMatchObject([
    {
      humanClassification: "cat",
      aiClassification: "possum",
      recordingIds: [1],
    },
    {
      humanClassification: "hedgehog",
      aiClassification: "possum",
      recordingIds: [2],
    },
  ]);
});

test("Visit splitting, multiple human visits 1", async () => {
  const classifications = computeVisits(
    makeRawVisitRows([
      [
        [
          ["possum", "ai"],
          ["cat", "human"], // <-- First recording is excluded from the second visit, since only track has contradicting human tag.
        ],
      ],
      [
        [
          ["possum", "ai", 10],
          ["cat", "human"],
        ],
        [
          ["cat", "ai"],
          ["hedgehog", "human"],
          ["possum", "ai"],
        ],
      ],
    ]),
  );

  expect(classifications.length, "there are two visits").toBe(2);
  expect(classifications, "each visit contains the same recordings").toMatchObject([
    {
      humanClassification: "cat",
      aiClassification: "possum",
      recordingIds: [1, 2],
    },
    {
      humanClassification: "hedgehog",
      aiClassification: "possum",
      recordingIds: [2],
    },
  ]);
});

test("Visit splitting, multiple human visits 2", async () => {
  const classifications = computeVisits(
    makeRawVisitRows([
      [[["possum", "ai"]], [["cat", "human"]]],
      [
        [
          ["possum", "ai", 10],
          ["cat", "human"],
        ],
        [
          ["cat", "ai"],
          ["hedgehog", "human"],
          ["possum", "ai"],
        ],
      ],
    ]),
  );

  expect(classifications.length, "there are two visits").toBe(2);
  expect(classifications, "each visit contains the same recordings").toMatchObject([
    {
      humanClassification: "cat",
      aiClassification: "possum",
      recordingIds: [1, 2],
    },
    {
      humanClassification: "hedgehog",
      aiClassification: "possum",
      recordingIds: [1, 2],
    },
  ]);
});

test("Multiple human tags on different tracks of the same recording", async () => {
  const classifications = computeVisits(
    makeRawVisitRows([
      [[["possum", "ai"]]],
      [
        [
          ["possum", "ai"],
          ["cat", "human"],
        ],
        [
          ["cat", "ai"],
          ["hedgehog", "human"],
        ],
      ],
    ]),
  );
  expect(classifications.length, "there are two visits").toBe(2);
  expect(classifications).toMatchObject([
    {
      humanClassification: "cat",
      aiClassification: "possum",
      recordingIds: [1, 2],
    },
    {
      humanClassification: "hedgehog",
      aiClassification: "possum",
      recordingIds: [1, 2],
    },
  ]);
});

test("Longer AI visit tallies", async () => {
  const classifications = computeVisits(
    makeRawVisitRows([
      [[["possum", "ai"]], [["cat", "ai"]]],
      [[["possum", "ai"]], [["cat", "ai"]]],
      [[["possum", "ai"]], [["cat", "ai"]]],
      [[["possum", "ai"]]],
    ]),
  );
  expect(classifications.length, "there is one visit").toBe(1);
  expect(classifications).toMatchObject([
    {
      humanClassification: null,
      aiClassification: "possum",
      recordingIds: [1, 2, 3, 4],
    },
  ]);
});

test("Filtered out AI tags", async () => {
  const classifications = computeVisits(
    makeRawVisitRows([
      [
        [
          ["possum", "human"],
          ["false-positive", "ai"],
        ],
      ],
    ]),
  );
  expect(classifications.length, "there is one visit").toBe(1);
  expect(classifications).toMatchObject([
    {
      humanClassification: "possum",
      aiClassification: "none",
      recordingIds: [1],
    },
  ]);
});
