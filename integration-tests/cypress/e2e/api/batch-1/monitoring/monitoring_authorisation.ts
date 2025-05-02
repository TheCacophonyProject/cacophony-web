import { logTestDescription, NO_LOG_MESSAGE } from "@commands/descriptions";
import { checkRecording } from "@commands/api/recording-tests";
import { StationId } from "@typedefs/api/common";

describe("Recording authorizations", () => {
  const admin = "Betty-groupAdmin";
  const member = "Bob-groupMember";
  const hacker = "Hacker-recordings";
  const group = "recording_auth";
  const camera = "camera1";
  const NOT_ADMIN = false;
  let recordingUploaded = false;
  let stationId = 0;

  before(() => {
    cy.apiUserAdd(member);
    cy.apiUserAdd(hacker);
    cy.testCreateUserGroupAndDevice(admin, group, camera);
    cy.apiGroupUserAdd(admin, member, group, NOT_ADMIN);
  });

  beforeEach(() => {
    if (!recordingUploaded) {
      cy.testUploadRecording(camera, { tags: ["possum"] }).then(
        (recordingId) => {
          checkRecording(member, recordingId, (recording) => {
            stationId = recording.stationId;
          });
        },
      );
      recordingUploaded = true;
    }
  });

  it("Admin group member should see everything", () => {
    checkMonitoringRequestSucceeds(admin, stationId);
  });

  it("Group member should be able to read most things", () => {
    checkMonitoringRequestSucceeds(member, stationId);
  });

  it("Hacker should not have any access", () => {
    checkMonitoringRequestReturnsNoResults(hacker, stationId);
  });
});

function checkMonitoringRequestSucceeds(
  username: string,
  stationId: StationId,
) {
  logTestDescription(`User ${username} should be able to see visits.`, {});
  cy.checkMonitoring(username, stationId, [{}], NO_LOG_MESSAGE);
}

function checkMonitoringRequestReturnsNoResults(
  username: string,
  stationId: StationId,
) {
  logTestDescription(`User ${username} should not see any visits.`, {});
  cy.checkMonitoring(username, stationId, [], NO_LOG_MESSAGE);
}
