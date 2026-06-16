import { test } from "@/helpers/upload-tests";
import { createProjectWithUserAndDevice } from "@/helpers/create-test-entities";
import { uploadThermalRecordingFromDevice } from "@/helpers/recording-uploads";
import { addMinutes } from "@/helpers/date-helpers";
import { processRecordingWithTracksAndTags } from "@/helpers/process-recordings";
import { ApiVisitResponse } from "@shared/api/monitoring";
import { expect } from "@playwright/test";
import { ApiRecordingResponse } from "@shared/api/recording";
import { ApiStaticVisitResponse } from "@shared/api/visit";

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

  // Add and tag a bunch of recordings.
  const recordingId = await uploadThermalRecordingFromDevice({
    file: oneFrameCptv,
    recordingDateTime: addMinutes(initialDateTime, 1),
    location: project.locationBase,
    deviceHandle: project.getDevice(),
    uploadTime: addMinutes(initialDateTime, 2),
    duration: 30, // Needed so we aren't filtered out of visits
  });
  await processRecordingWithTracksAndTags(recordingId, ["possum"]);
  const recording = (await User.Recordings.getRecordingById(recordingId)) as ApiRecordingResponse;
  expect(recording, "got recording").toBeTruthy();
  expect(recording.tracks.length, "recording has one track").toEqual(1);
  const track = recording.tracks[0];
  expect(track.tags.length, "recording has one trackTag").toEqual(1);
  const trackTag = track.tags[0];
  expect(trackTag.what, "recording has correct trackTag").toEqual("possum");
  expect(trackTag.automatic, "trackTag is by AI").toBe(true);

  // Now we should be able to check the visits end-points
  const classicVisit = await User.Monitoring.getAllVisitsForProjectBetweenTimes(
    projectHandle.id,
    initialDateTime,
    now,
  );
  expect(classicVisit.success, "got visits response").toBe(true);
  expect(classicVisit.visits.length, "got one visit").toEqual(1);
  const visit = classicVisit.visits[0] as ApiVisitResponse;
  expect(visit.recordings.length, "visit has one recording").toEqual(1);
  expect(visit.recordings[0].recId, "it's the recording we added").toEqual(recordingId);
  expect(visit.classification, "visit classification is correct").toEqual("possum");
  expect(visit.classFromUserTag, "visit is based on AI classification").toBe(false);

  const ssVisit = (await User.Visits.forProject(
    projectHandle.id,
    initialDateTime,
    now,
  )) as ApiStaticVisitResponse[];
  expect(ssVisit, "got visits response").toBeTruthy();
  expect(ssVisit.length, "got one visit").toEqual(1);
});
