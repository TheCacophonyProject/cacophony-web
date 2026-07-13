// In the Cacophony API, we have the concept of "Visits" which aggregate all the thermal recordings
// in a location in a rolling 10 minute time window.  From the animal classifications assigned to these
// recordings, a "Visit classification" is calculated.
// Previously, these visits were calculated on-the-fly when requested from an API client, however this approach
// does not scale well, and so now we want to implement the same Visit calculation logic as a database table
// that gets updated when recordings are added or removed, and when classification tags are added or removed
// from any of the recordings in the rolling window.

import {
  createProjectWithUserAndDevice,
  ProjectBundle,
} from "@/helpers/create-test-entities";
import { spreadDays } from "@/helpers/date-helpers";
import { uploadThermalRecordingFromDeviceForProject } from "@/helpers/recording-uploads";
import { testLocation } from "@/helpers/location-helpers";
import { ApiStaticVisitResponse } from "@shared/api/visit";

const getProjectVisitsBetween = async (
  project: ProjectBundle,
  from: Date,
  until: Date,
): Promise<ApiStaticVisitResponse[]> => {
  const AdminUser = project.api();
  const visits = await AdminUser.Visits.forProject(
    project.projectHandle.id,
    from,
    until,
  );
  expect(visits).to.not.be.null;
  expect(visits).to.not.be.false;
  return visits as ApiStaticVisitResponse[];
};

const oneMinute = 60 * 1000;

describe.skip("Visits v2", () => {
  it("Can calculate and retrieve visits for a project", async () => {
    const project = await createProjectWithUserAndDevice();
    const startDate = new Date("2026-01-10T20:07:06.292Z");
    const dates = spreadDays(startDate, 3);
    const recordingUploads = [];
    for (const date of dates) {
      recordingUploads.push(
        uploadThermalRecordingFromDeviceForProject({
          project,
          location: testLocation(-42, 170, 0),
          recordingDateTime: date,
          duration: 10,
        }),
      );
    }
    await Promise.all(recordingUploads);
    const from = new Date(startDate);
    from.setTime(startDate.getTime() - oneMinute);
    const until = new Date(dates[dates.length - 1]);
    until.setTime(until.getTime() + oneMinute);
    const visits = await getProjectVisitsBetween(project, from, until);
    expect(visits).to.have.length(3);
  });

  it("Can calculate and retrieve visits for a project, then add a recording within a visit window to extend it.", async () => {
    // Create a project
    // Add three thermal recordings each within ten minutes of each other.
    // Check that we have a single visit created.
    // Add another recording within the visit window to extend it.
    // Check that the visit window is properly extended.

    const project = await createProjectWithUserAndDevice();
    const location = testLocation(-42, 170, 0);

    // Three recordings where each starts within 10 minutes of the previous recording's end,
    // so they should aggregate into a single visit.
    const t0 = new Date("2026-01-10T20:07:06.292Z");
    const t1 = new Date(t0.getTime() + 5 * oneMinute);
    const t2 = new Date(t0.getTime() + 9 * oneMinute);

    const [r0, r1, r2] = await Promise.all([
      uploadThermalRecordingFromDeviceForProject({
        project,
        location,
        recordingDateTime: t0,
        duration: 10,
      }),
      uploadThermalRecordingFromDeviceForProject({
        project,
        location,
        recordingDateTime: t1,
        duration: 10,
      }),
      uploadThermalRecordingFromDeviceForProject({
        project,
        location,
        recordingDateTime: t2,
        duration: 10,
      }),
    ]);

    const from = new Date(t0.getTime() - oneMinute);
    const untilInitial = new Date(t2.getTime() + 20 * oneMinute);

    const visitsBefore = await getProjectVisitsBetween(
      project,
      from,
      untilInitial,
    );
    expect(visitsBefore, "should aggregate into one visit").to.have.length(1);

    const visitBefore = visitsBefore[0];
    expect(visitBefore.recordingIds, "visit should contain the 3 recordings")
      .to.be.an("array")
      .that.includes(r0)
      .and.includes(r1)
      .and.includes(r2);

    const endBefore = new Date(visitBefore.endTime).getTime();

    // Add another recording that should extend the existing visit.
    // Keep it within the 10 minute rolling window relative to the previous recording end.
    const t3 = new Date(t2.getTime() + 9 * oneMinute);
    const r3 = await uploadThermalRecordingFromDeviceForProject({
      project,
      location,
      recordingDateTime: t3,
      duration: 10,
    });

    const untilAfter = new Date(t3.getTime() + 20 * oneMinute);
    const visitsAfter = await getProjectVisitsBetween(
      project,
      from,
      untilAfter,
    );
    expect(
      visitsAfter,
      "should still be one visit after extending",
    ).to.have.length(1);

    const visitAfter = visitsAfter[0];
    expect(visitAfter.recordingIds, "visit should contain the new recording")
      .to.be.an("array")
      .that.includes(r3);

    const endAfter = new Date(visitAfter.endTime).getTime();
    expect(
      endAfter,
      "visit endTime should extend after adding a recording within the visit window",
    ).to.be.greaterThan(endBefore);
  });

  it(`Can add recordings that all end up in the same visit window, 
  and then a user tags different tracks as different classifications, and the visit is split correctly.`, async () => {
    return;
  });

  it(`Can add a two sets of recordings that make up two visit windows, 
  then bridge them into one by adding a new recording in the middle`, async () => {
    const project = await createProjectWithUserAndDevice();
    const location = testLocation(-42, 170, 0);

    // Build two visits made from two clusters and then bridge with a single "middle" recording:
    // Cluster 1: 0m, 9m
    // Bridge:    18m
    // Cluster 2: 27m, 36m
    //
    // With the bridge not present, the gap is > 10 minutes and there are two visits.
    // After adding the bridge, the gap is removed and there is one visit.
    const base = new Date("2026-01-10T20:07:06.292Z");
    const tA = new Date(base.getTime());
    const tB = new Date(base.getTime() + 9 * oneMinute);
    const tBridge = new Date(base.getTime() + 18 * oneMinute);
    const tD = new Date(base.getTime() + 27 * oneMinute);
    const tE = new Date(base.getTime() + 36 * oneMinute);

    const [rA, rB, rD, rE] = await Promise.all([
      uploadThermalRecordingFromDeviceForProject({
        project,
        location,
        recordingDateTime: tA,
        duration: 10,
      }),
      uploadThermalRecordingFromDeviceForProject({
        project,
        location,
        recordingDateTime: tB,
        duration: 10,
      }),
      uploadThermalRecordingFromDeviceForProject({
        project,
        location,
        recordingDateTime: tD,
        duration: 10,
      }),
      uploadThermalRecordingFromDeviceForProject({
        project,
        location,
        recordingDateTime: tE,
        duration: 10,
      }),
    ]);

    const from = new Date(tA.getTime() - oneMinute);
    const until = new Date(tE.getTime() + 20 * oneMinute);

    const visitsBeforeBridge = await getProjectVisitsBetween(
      project,
      from,
      until,
    );
    expect(visitsBeforeBridge, "there are two visits").to.have.length(2);
    expect(visitsBeforeBridge[0].recordingIds)
      .to.be.an("array")
      .that.includes(rA)
      .and.includes(rB);
    expect(visitsBeforeBridge[1].recordingIds)
      .to.be.an("array")
      .that.includes(rD)
      .and.includes(rE);

    const rBridge = await uploadThermalRecordingFromDeviceForProject({
      project,
      location,
      recordingDateTime: tBridge,
      duration: 10,
    });

    const visitsAfterBridge = await getProjectVisitsBetween(
      project,
      from,
      until,
    );
    expect(visitsAfterBridge[0].recordingIds)
      .to.be.an("array")
      .that.includes(rA)
      .and.includes(rB)
      .and.includes(rBridge)
      .and.includes(rD)
      .and.includes(rE);
    expect(visitsAfterBridge, "there is one visit").to.have.length(1);
  });

  it("Can delete a recording from the middle of a visit, and split the visit into two visit windows.", async () => {
    const project = await createProjectWithUserAndDevice();
    const AdminUser = project.api();
    const location = testLocation(-42, 170, 0);

    // Build a single visit made from two clusters bridged by a single "middle" recording:
    // Cluster 1: 0m, 9m
    // Bridge:    18m
    // Cluster 2: 27m, 36m
    //
    // With the bridge present, all gaps are < 10 minutes -> one visit.
    // After deleting the bridge, gap between 9m(end) and 27m(start) is > 10 minutes -> two visits.
    const base = new Date("2026-01-10T20:07:06.292Z");
    const tA = new Date(base.getTime());
    const tB = new Date(base.getTime() + 9 * oneMinute);
    const tBridge = new Date(base.getTime() + 18 * oneMinute);
    const tD = new Date(base.getTime() + 27 * oneMinute);
    const tE = new Date(base.getTime() + 36 * oneMinute);

    const [rA, rB, rBridge, rD, rE] = await Promise.all([
      uploadThermalRecordingFromDeviceForProject({
        project,
        location,
        recordingDateTime: tA,
        duration: 10,
      }),
      uploadThermalRecordingFromDeviceForProject({
        project,
        location,
        recordingDateTime: tB,
        duration: 10,
      }),
      uploadThermalRecordingFromDeviceForProject({
        project,
        location,
        recordingDateTime: tBridge,
        duration: 10,
      }),
      uploadThermalRecordingFromDeviceForProject({
        project,
        location,
        recordingDateTime: tD,
        duration: 10,
      }),
      uploadThermalRecordingFromDeviceForProject({
        project,
        location,
        recordingDateTime: tE,
        duration: 10,
      }),
    ]);

    const from = new Date(tA.getTime() - oneMinute);
    const until = new Date(tE.getTime() + 20 * oneMinute);

    const visitsBeforeDelete = await getProjectVisitsBetween(
      project,
      from,
      until,
    );
    expect(
      visitsBeforeDelete,
      "bridge should create a single visit",
    ).to.have.length(1);

    const before = visitsBeforeDelete[0];
    expect(before.recordingIds)
      .to.be.an("array")
      .that.includes(rA)
      .and.includes(rB)
      .and.includes(rBridge)
      .and.includes(rD)
      .and.includes(rE);

    //Delete the bridge recording, which should split the visit into two.
    const deleteResponse = await AdminUser.Recordings.deleteRecording(rBridge);
    expect(deleteResponse.success, "delete bridge recording").to.be.true;

    const visitsAfterDelete = await getProjectVisitsBetween(
      project,
      from,
      until,
    );
    expect(
      visitsAfterDelete,
      "visit should split into two after deletion",
    ).to.have.length(2);

    // API returns visits ordered by startTime ASC; assert split membership.
    const [firstVisit, secondVisit] =
      visitsAfterDelete as ApiStaticVisitResponse[];

    expect(firstVisit.recordingIds)
      .to.be.an("array")
      .that.includes(rA)
      .and.includes(rB);

    expect(
      firstVisit.recordingIds,
      "bridge should not be in first visit",
    ).to.not.include(rBridge);
    expect(
      firstVisit.recordingIds,
      "second cluster should not be in first visit",
    )
      .to.not.include(rD)
      .and.not.include(rE);

    expect(secondVisit.recordingIds)
      .to.be.an("array")
      .that.includes(rD)
      .and.includes(rE);

    expect(
      secondVisit.recordingIds,
      "bridge should not be in second visit",
    ).to.not.include(rBridge);
    expect(
      secondVisit.recordingIds,
      "first cluster should not be in second visit",
    )
      .to.not.include(rA)
      .and.not.include(rB);

    expect(
      new Date(firstVisit.startTime).getTime(),
      "the split is in time order",
    ).to.be.lessThan(new Date(secondVisit.startTime).getTime());
  });
});
