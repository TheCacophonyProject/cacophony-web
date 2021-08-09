/// <reference path="../../../support/index.d.ts" />

import { getTestName } from "../../../commands/names";
import { v1ApiPath } from "../../../commands/server";
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
    cy.apiCreateUser(member);
    cy.apiCreateUser(deviceMember);
    cy.apiCreateUser(hacker);
    cy.apiCreateUserGroupAndDevice(admin, group, camera);
    cy.apiAddUserToDevice(admin, deviceMember, camera);
    cy.apiAddUserToGroup(admin, member, group, NOT_ADMIN);
  });

  beforeEach(() => {
    if (!recordingUploaded) {
      cy.uploadRecording(camera, { tags: ["possum"] });
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

function deviceRequest(group: string, camera: string) {
  const groupName = getTestName(group);
  const deviceName = getTestName(camera);

  return {
    method: "GET",
    url: v1ApiPath(`devices/${deviceName}/in-group/${groupName}`),
  };
}
