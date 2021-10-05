/// <reference path="../../../support/index.d.ts" />
import { HTTP_BadRequest, HTTP_Forbidden, HTTP_Unprocessable } from "@commands/constants";

import { ApiRecordingSet } from "@commands/types";

import { TestCreateExpectedRecordingData, TestCreateRecordingData } from "@commands/api/recording-tests";
import { ApiThermalRecordingResponse } from "@typedefs/api/recording";
import { RecordingProcessingState, RecordingType } from "@typedefs/api/consts";

const EXCLUDE_IDS = [
  ".tracks[].tags[].trackId",
  ".tracks[].id",
];

describe("Recordings (thermal): add, get, delete", () => {
  const templateExpectedRecording: ApiThermalRecordingResponse = {
    deviceId: 0,
    deviceName: "",
    groupName: "",
    id: 892972,
    rawMimeType: "application/x-cptv",
    processingState: RecordingProcessingState.Finished,
    duration: 15.6666666666667,
    recordingDateTime: "2021-07-17T20:13:17.248Z",
    location: { lat: -45.29115, lng: 169.30845 },
    type: RecordingType.ThermalRaw,
    additionalMetadata: { algorithm: 31143, previewSecs: 5, totalFrames: 141 },
    groupId: 246,
    comment: "This is a comment",
    processing: false,
    tags: [],
    tracks: []
  };

  const templateRecording: ApiRecordingSet = {
    type: "thermalRaw",
    fileHash: null,
    duration: 15.6666666666667,
    recordingDateTime: "2021-07-17T20:13:17.248Z",
    location: [-45.29115, 169.30845],
    additionalMetadata: {
      algorithm: 31143,
      previewSecs: 5,
      totalFrames: 141,
    },
    metadata: {
      algorithm: { model_name: "master" },
      tracks: [{ start_s: 2, end_s: 5, predictions: [{confident_tag: "cat", confidence: 0.9, model_id: 1}] }],
    },
    comment: "This is a comment",
    processingState: "FINISHED",
  };

  before(() => {
    //Create group1 with 2 devices, admin and member
    cy.testCreateUserGroupAndDevice("raGroupAdmin", "raGroup", "raCamera1");
    cy.apiDeviceAdd("raCamera1b", "raGroup");
    cy.apiUserAdd("raGroupMember");

    //Add admin & member to Camer1
    cy.apiUserAdd("raDeviceAdmin");
    cy.apiUserAdd("raDeviceMember");
    cy.apiGroupUserAdd("raGroupAdmin", "raGroupMember", "raGroup", true);
    cy.apiDeviceUserAdd("raGroupAdmin", "raDeviceAdmin", "raCamera1", true);
    cy.apiDeviceUserAdd("raGroupAdmin", "raDeviceMember", "raCamera1", true);

    //Create group2 with admin and device
    cy.testCreateUserGroupAndDevice("raGroup2Admin", "raGroup2", "raCamera2");
  });

  it("Group admin can view and delete device's recordings", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecording1: ApiThermalRecordingResponse;

    cy.log("Add recording as device");
    cy.apiRecordingAdd("raCamera1", recording1, undefined, "raRecording1").then(
      () => {
        expectedRecording1 = TestCreateExpectedRecordingData(
          templateExpectedRecording,
          "raRecording1",
          "raCamera1",
          "raGroup",
          null,
          recording1
        );
        cy.log("Check recording can be viewed correctly");
        cy.apiRecordingCheck(
          "raGroupAdmin",
          "raRecording1",
          expectedRecording1,
          EXCLUDE_IDS
        );
      }
    );

    cy.log("Delete recording");
    cy.apiRecordingDelete("raGroupAdmin", "raRecording1");

    cy.log("Check recording no longer exists");
    cy.apiRecordingCheck(
      "raGroupAdmin",
      "raRecording1",
      undefined,
      [],
      HTTP_Forbidden
    );
  });

  it("Group member can view and delete device's recordings", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecording1: ApiThermalRecordingResponse;

    cy.log("Add recording as device");
    cy.apiRecordingAdd("raCamera1", recording1, undefined, "raRecording1").then(
      () => {
        expectedRecording1 = TestCreateExpectedRecordingData(
          templateExpectedRecording,
          "raRecording1",
          "raCamera1",
          "raGroup",
          null,
          recording1
        );
        cy.log("Check recording can be viewed correctly");
        cy.apiRecordingCheck(
          "raGroupMember",
          "raRecording1",
          expectedRecording1,
         EXCLUDE_IDS
        );
      }
    );

    cy.log("Delete recording");
    cy.apiRecordingDelete("raGroupMember", "raRecording1");

    cy.log("Check recording no longer exists");
    cy.apiRecordingCheck(
      "raGroupMember",
      "raRecording1",
      undefined,
      [],
      HTTP_Forbidden
    );
  });

  it("Device admin can view and delete device's recordings", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecording1: ApiThermalRecordingResponse;

    cy.log("Add recording as device");
    cy.apiRecordingAdd("raCamera1", recording1, undefined, "raRecording1").then(
      () => {
        expectedRecording1 = TestCreateExpectedRecordingData(
          templateExpectedRecording,
          "raRecording1",
          "raCamera1",
          "raGroup",
          null,
          recording1
        );
        cy.log("Check recording can be viewed correctly");
        cy.apiRecordingCheck(
          "raDeviceAdmin",
          "raRecording1",
          expectedRecording1,
          EXCLUDE_IDS
        );
      }
    );

    cy.log("Delete recording");
    cy.apiRecordingDelete("raDeviceAdmin", "raRecording1");

    cy.log("Check recording no longer exists");
    cy.apiRecordingCheck(
      "raDeviceAdmin",
      "raRecording1",
      undefined,
      [],
      HTTP_Forbidden
    );
  });

  it("Device member can view and delete device's recordings", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecording1: ApiThermalRecordingResponse;

    cy.log("Add recording as device");
    cy.apiRecordingAdd("raCamera1", recording1, undefined, "raRecording1").then(
      () => {
        expectedRecording1 = TestCreateExpectedRecordingData(
          templateExpectedRecording,
          "raRecording1",
          "raCamera1",
          "raGroup",
          null,
          recording1
        );
        cy.log("Check recording can be viewed correctly");
        cy.apiRecordingCheck(
          "raDeviceMember",
          "raRecording1",
          expectedRecording1,
          EXCLUDE_IDS
        );
      }
    );

    cy.log("Delete recording");
    cy.apiRecordingDelete("raDeviceMember", "raRecording1");

    cy.log("Check recording no longer exists");
    cy.apiRecordingCheck(
      "raDeviceMember",
      "raRecording1",
      undefined,
      [],
      HTTP_Forbidden
    );
  });

  it("Group admin can add recordings by group on behalf", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecording1: ApiThermalRecordingResponse;

    cy.log("Add recording as group admin");
    cy.apiRecordingAddOnBehalfUsingGroup(
      "raGroupAdmin",
      "raCamera1",
      "raGroup",
      recording1,
      "raRecording1"
    ).then(() => {
      expectedRecording1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "raRecording1",
        "raCamera1",
        "raGroup",
        null,
        recording1
      );
      cy.log("Check recording can be viewed correctly");
      cy.apiRecordingCheck("raGroupAdmin", "raRecording1", expectedRecording1, EXCLUDE_IDS);
    });

    cy.log("Delete recording");
    cy.apiRecordingDelete("raGroupAdmin", "raRecording1");

    cy.log("Check recording no longer exists");
    cy.apiRecordingCheck(
      "raGroupAdmin",
      "raRecording1",
      undefined,
      [],
      HTTP_Forbidden
    );
  });

  it("Group member can add recordings by group on behalf", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecording1: ApiThermalRecordingResponse;

    cy.log("Add recording as group member");
    cy.apiRecordingAddOnBehalfUsingGroup(
      "raGroupMember",
      "raCamera1",
      "raGroup",
      recording1,
      "raRecording1"
    ).then(() => {
      expectedRecording1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "raRecording1",
        "raCamera1",
        "raGroup",
        null,
        recording1
      );
      cy.log("Check recording can be viewed correctly");
      cy.apiRecordingCheck(
        "raGroupMember",
        "raRecording1",
        expectedRecording1,
       EXCLUDE_IDS
      );
    });

    cy.log("Delete recording");
    cy.apiRecordingDelete("raGroupMember", "raRecording1");

    cy.log("Check recording no longer exists");
    cy.apiRecordingCheck(
      "raGroupMember",
      "raRecording1",
      undefined,
      [],
      HTTP_Forbidden
    );
  });

  it("Device admin can add recordings by group on behalf", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecording1: ApiThermalRecordingResponse;

    cy.log("Add recording as device admin");
    cy.apiRecordingAddOnBehalfUsingGroup(
      "raDeviceAdmin",
      "raCamera1",
      "raGroup",
      recording1,
      "raRecording1"
    ).then(() => {
      expectedRecording1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "raRecording1",
        "raCamera1",
        "raGroup",
        null,
        recording1
      );
      cy.log("Check recording can be viewed correctly");
      cy.apiRecordingCheck(
        "raDeviceAdmin",
        "raRecording1",
        expectedRecording1,
        EXCLUDE_IDS
      );
    });

    cy.log("Delete recording");
    cy.apiRecordingDelete("raDeviceAdmin", "raRecording1");

    cy.log("Check recording no longer exists");
    cy.apiRecordingCheck(
      "raDeviceAdmin",
      "raRecording1",
      undefined,
      [],
      HTTP_Forbidden
    );
  });

  it("Device member can add recordings by group on behalf", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecording1: ApiThermalRecordingResponse;

    cy.log("Add recording as device member");
    cy.apiRecordingAddOnBehalfUsingGroup(
      "raDeviceMember",
      "raCamera1",
      "raGroup",
      recording1,
      "raRecording1"
    ).then(() => {
      expectedRecording1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "raRecording1",
        "raCamera1",
        "raGroup",
        null,
        recording1
      );
      cy.log("Check recording can be viewed correctly");
      cy.apiRecordingCheck(
        "raDeviceMember",
        "raRecording1",
        expectedRecording1,
        EXCLUDE_IDS
      );
    });

    cy.log("Delete recording");
    cy.apiRecordingDelete("raDeviceMember", "raRecording1");

    cy.log("Check recording no longer exists");
    cy.apiRecordingCheck(
      "raDeviceMember",
      "raRecording1",
      undefined,
      [],
      HTTP_Forbidden
    );
  });

  it("Group admin can add recordings by device on behalf", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecording1: ApiThermalRecordingResponse;

    cy.log("Add recording as group admin");
    cy.apiRecordingAddOnBehalfUsingDevice(
      "raGroupAdmin",
      "raCamera1",
      recording1,
      "raRecording1"
    ).then(() => {
      expectedRecording1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "raRecording1",
        "raCamera1",
        "raGroup",
        null,
        recording1
      );
      cy.log("Check recording can be viewed correctly");
      cy.apiRecordingCheck("raGroupAdmin", "raRecording1", expectedRecording1, EXCLUDE_IDS);
    });

    cy.log("Delete recording");
    cy.apiRecordingDelete("raGroupAdmin", "raRecording1");

    cy.log("Check recording no longer exists");
    cy.apiRecordingCheck(
      "raGroupAdmin",
      "raRecording1",
      undefined,
      [],
      HTTP_Forbidden
    );
  });

  it("Group member can add recordings by device on behalf", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecording1: ApiThermalRecordingResponse;

    cy.log("Add recording as group member");
    cy.apiRecordingAddOnBehalfUsingDevice(
      "raGroupMember",
      "raCamera1",
      recording1,
      "raRecording1"
    ).then(() => {
      expectedRecording1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "raRecording1",
        "raCamera1",
        "raGroup",
        null,
        recording1
      );
      cy.log("Check recording can be viewed correctly");
      cy.apiRecordingCheck(
        "raGroupMember",
        "raRecording1",
        expectedRecording1,
        EXCLUDE_IDS
      );
    });

    cy.log("Delete recording");
    cy.apiRecordingDelete("raGroupMember", "raRecording1");

    cy.log("Check recording no longer exists");
    cy.apiRecordingCheck(
      "raGroupMember",
      "raRecording1",
      undefined,
      [],
      HTTP_Forbidden
    );
  });

  it("Device admin can add recordings by device on behalf", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecording1: ApiThermalRecordingResponse;

    cy.log("Add recording as device admin");
    cy.apiRecordingAddOnBehalfUsingDevice(
      "raDeviceAdmin",
      "raCamera1",
      recording1,
      "raRecording1"
    ).then(() => {
      expectedRecording1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "raRecording1",
        "raCamera1",
        "raGroup",
        null,
        recording1
      );
      cy.log("Check recording can be viewed correctly");
      cy.apiRecordingCheck(
        "raDeviceAdmin",
        "raRecording1",
        expectedRecording1,
        EXCLUDE_IDS
      );
    });

    cy.log("Delete recording");
    cy.apiRecordingDelete("raDeviceAdmin", "raRecording1");

    cy.log("Check recording no longer exists");
    cy.apiRecordingCheck(
      "raDeviceAdmin",
      "raRecording1",
      undefined,
      [],
      HTTP_Forbidden
    );
  });

  it("Device member can add recordings by device on behalf", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecording1: ApiThermalRecordingResponse;

    cy.log("Add recording as device member");
    cy.apiRecordingAddOnBehalfUsingDevice(
      "raDeviceMember",
      "raCamera1",
      recording1,
      "raRecording1"
    ).then(() => {
      expectedRecording1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "raRecording1",
        "raCamera1",
        "raGroup",
        null,
        recording1
      );
      cy.log("Check recording can be viewed correctly");
      cy.apiRecordingCheck(
        "raDeviceMember",
        "raRecording1",
        expectedRecording1,
        EXCLUDE_IDS
      );
    });

    cy.log("Delete recording");
    cy.apiRecordingDelete("raDeviceMember", "raRecording1");

    cy.log("Check recording no longer exists");
    cy.apiRecordingCheck(
      "raDeviceMember",
      "raRecording1",
      undefined,
      [],
      HTTP_Forbidden
    );
  });

  it("Group admin/member cannot access devices outside their group", () => {
    const recording2 = TestCreateRecordingData(templateRecording);
    cy.log("Cannot add recording for another group's devices using device");
    cy.apiRecordingAddOnBehalfUsingDevice(
      "raGroupAdmin",
      "raCamera2",
      recording2,
      "raRecording2",
      undefined,
      HTTP_Forbidden
    );
    cy.log("Cannot add recording for another group's devices using group");
    cy.apiRecordingAddOnBehalfUsingGroup(
      "raGroupAdmin",
      "raCamera2",
      "raGroup2",
      recording2,
      "raRecording2",
      undefined,
      HTTP_Forbidden
    );

    cy.apiRecordingAdd("raCamera2", recording2, undefined, "raRecording2");
    cy.log("Cannot view details of another group's recordings");
    cy.apiRecordingCheck(
      "raGroupAdmin",
      "raRecording2",
      undefined,
      [],
      HTTP_Forbidden
    );

    cy.log("Cannot delete another group's recordings");
    cy.apiRecordingDelete("raGroupAdmin", "raRecording2", HTTP_Forbidden);
    cy.apiRecordingDelete("raGroup2Admin", "raRecording2");
  });

  it("Device admin/member cannot access devices outside their device", () => {
    const recording1b = TestCreateRecordingData(templateRecording);
    cy.log("Cannot add recording for another group's devices using device");
    cy.apiRecordingAddOnBehalfUsingDevice(
      "raDeviceAdmin",
      "raCamera1b",
      recording1b,
      "raRecording1b",
      undefined,
      HTTP_Forbidden
    );
    cy.log("Cannot add recording for another group's devices using group");
    cy.apiRecordingAddOnBehalfUsingGroup(
      "raDeviceAdmin",
      "raCamera1b",
      "raGroup",
      recording1b,
      "raRecording1b",
      undefined,
      HTTP_Forbidden
    );

    cy.apiRecordingAdd("raCamera1b", recording1b, undefined, "raRecording1b");
    cy.log("Cannot view details of another group's recordings");
    cy.apiRecordingCheck(
      "raDeviceAdmin",
      "raRecording1b",
      undefined,
      [],
      HTTP_Forbidden
    );

    cy.log("Cannot delete another group's recordings");
    cy.apiRecordingDelete("raDeviceAdmin", "raRecording1b", HTTP_Forbidden);
    cy.apiRecordingDelete("raGroupAdmin", "raRecording1b");
  });

  it("Correct handling of non-existent device, group", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    cy.log("Add recording using invalid device name");
    cy.apiRecordingAddOnBehalfUsingDevice(
      "raGroupAdmin",
      "IDoNotExist",
      recording1,
      "raRecording1",
      undefined,
      HTTP_Unprocessable,
      { useRawDeviceName: true }
    );

    cy.log("Add recording using non-existent device id");
    cy.apiRecordingAddOnBehalfUsingDevice(
      "raGroupAdmin",
      "99999",
      recording1,
      "raRecording1",
      undefined,
      HTTP_Forbidden,
      { useRawDeviceName: true }
    );

    cy.log("Add recording using valid group, non-existent device name");
    cy.apiRecordingAddOnBehalfUsingGroup(
      "raGroupAdmin",
      "IDoNotExist",
      "raGroup",
      recording1,
      "raRecording1",
      undefined,
      HTTP_Forbidden,
      { useRawDeviceName: true }
    );

    cy.log("Add recording using non-existent group");
    cy.apiRecordingAddOnBehalfUsingGroup(
      "raGroupAdmin",
      "raCamera",
      "GroupDoesNotExist",
      recording1,
      "raRecording1",
      undefined,
      HTTP_Forbidden
    );

    cy.log("Add recording using valid group and another groups device");
    cy.apiRecordingAddOnBehalfUsingGroup(
      "raGroupAdmin",
      "raCamera2",
      "raGroup",
      recording1,
      "raRecording1",
      undefined,
      HTTP_Forbidden
    );
  });

  it("Correct handling of invalid recording get parameters", () => {
    cy.log("Retrieve non-existent recording id");
    cy.apiRecordingCheck(
      "raDeviceAdmin",
      "999999",
      undefined,
      [],
      HTTP_Forbidden,
      { useRawRecordingId: true }
    );
    cy.apiRecordingCheck(
      "raDeviceAdmin",
      "ThisIsNotAValidId",
      undefined,
      [],
      HTTP_Unprocessable,
      { useRawRecordingId: true }
    );
  });

  it("Correct handling of invalid recording delete parameters", () => {
    cy.log("Delete invalid recording id");
    cy.apiRecordingDelete("raDeviceAdmin", "999999", HTTP_Forbidden, {
      useRawRecordingId: true,
    });
    cy.apiRecordingDelete(
      "raDeviceAdmin",
      "ThisIsNotAValidId",
      HTTP_Unprocessable,
      { useRawRecordingId: true }
    );
  });

  it.skip("Correct handling of invalid recording upload parameters", () => {
    //TODO: to be defined / written
  });

  it.skip("Deleted recording deletes associated tracks, tracktags and tags", () => {
    //TODO: would need to include a database query - i.e. use sequelize or an external system call
  });
});
