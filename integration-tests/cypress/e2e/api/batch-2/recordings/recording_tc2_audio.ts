import { EXCLUDE_IDS } from "@commands/constants";
import { ApiRecordingSet } from "@commands/types";

import {
  TestCreateExpectedRecordingData,
  TestCreateRecordingData,
} from "@commands/api/recording-tests";
import { ApiAudioRecordingResponse } from "@typedefs/api/recording";
import {
  TEMPLATE_AUDIO_RECORDING_RESPONSE_TC2,
  TEMPLATE_AUDIO_RECORDING_TC2,
} from "@commands/dataTemplate";
import { RecordingType } from "@typedefs/api/consts";

describe("Recordings - audio recording parameter tests", () => {
  const templateExpectedRecording: ApiAudioRecordingResponse = JSON.parse(
    JSON.stringify(TEMPLATE_AUDIO_RECORDING_RESPONSE_TC2),
  );
  const templateRecording: ApiRecordingSet = JSON.parse(
    JSON.stringify(TEMPLATE_AUDIO_RECORDING_TC2),
  );

  const adminUser = "tc2AudioGroupAdmin";
  const group = "tc2AudioGroup";
  const device = "tc2AudioDevice";

  before(() => {
    //Create group1 with Admin, Member and 2 devices
    cy.testCreateUserGroupAndDevice(adminUser, group, device);
  });

  it("Can upload an audio recording and use embedded metadata", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecording1: ApiAudioRecordingResponse;
    recording1.duration = 10.08;
    recording1.location = [-43.5339, 172.64731];
    templateExpectedRecording.status = "test";
    recording1.recordingDateTime = "2026-02-01T20:23:09.103Z";
    cy.log("Add recording as device");
    cy.apiRecordingAdd(
      device,
      { type: RecordingType.Audio },
      "audio-test-recording-tc2.m4a",
      "rarRecording1",
    ).then(() => {
      expectedRecording1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording1",
        device,
        group,
        null,
        recording1,
      );
      cy.log("Check recording can be viewed correctly");
      cy.apiRecordingCheck(
        adminUser,
        "rarRecording1",
        expectedRecording1,
        EXCLUDE_IDS,
      );
    });
  });
});
