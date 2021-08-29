/// <reference path="../../../support/index.d.ts" />

import {
  logTestDescription,
  NO_LOG_MESSAGE,
} from "../../../commands/descriptions";

describe("Recording authorizations", () => {
  const admin = "Betty-groupAdmin";
  const member = "Bob-groupMember";
  const deviceMember = "Beatrice-deviceMember";
  const hacker = "Hacker-recordings";
  const group = "recording_auth";
  const camera = "camera1";
  const NOT_ADMIN = false;
  let recordingUploaded = false;

  before(() => {
    cy.apiUserAdd(member);
    cy.apiUserAdd(deviceMember);
    cy.apiUserAdd(hacker);
    cy.testCreateUserGroupAndDevice(admin, group, camera);
    cy.apiDeviceUserAdd(admin, deviceMember, camera);
    cy.apiGroupUserAdd(admin, member, group, NOT_ADMIN);
  });

  beforeEach(() => {
    if (!recordingUploaded) {
      cy.testRecordingAddWithTestData(camera, { tags: ["possum"] });
      recordingUploaded = true;
    }
  });

  it("Admin group member should see everything", () => {
    checkMonitoringRequestSucceeds(admin, camera);
  });

  it("Group member should be able to read most things", () => {
    checkMonitoringRequestSucceeds(member, camera);
  });

  it("Device member should be able to read most things", () => {
    checkMonitoringRequestSucceeds(deviceMember, camera);
  });

  it("Hacker should not have any access", () => {
    checkMonitoringRequestReturnsNoResults(hacker, camera);
  });
});

function checkMonitoringRequestSucceeds(username: string, camera: string) {
  logTestDescription(`User ${username} should be able to see visits.`, {});
  cy.checkMonitoring(username, camera, [{}], NO_LOG_MESSAGE);
}

function checkMonitoringRequestReturnsNoResults(
  username: string,
  camera: string
) {
  logTestDescription(`User ${username} should not see any visits.`, {});
  cy.checkMonitoring(username, camera, [], NO_LOG_MESSAGE);
}
