/// <reference path="../../../support/index.d.ts" />
import { EXCLUDE_IDS } from "@commands/constants";

import { ApiRecordingSet } from "@commands/types";
import { getCreds } from "@commands/server";

import {
  checkRecording,
  TestCreateExpectedRecordingData,
  TestCreateRecordingData,
} from "@commands/api/recording-tests";
import { ApiThermalRecordingResponse } from "@typedefs/api/recording";
import { HttpStatusCode, RecordingType } from "@typedefs/api/consts";
import {
  TEMPLATE_THERMAL_RECORDING_RESPONSE,
  TEMPLATE_THERMAL_RECORDING,
} from "@commands/dataTemplate";

describe("Recordings (thermal): add, get, delete", () => {
  const templateExpectedRecording: ApiThermalRecordingResponse = JSON.parse(
    JSON.stringify(TEMPLATE_THERMAL_RECORDING_RESPONSE)
  );
  const templateRecording: ApiRecordingSet = JSON.parse(
    JSON.stringify(TEMPLATE_THERMAL_RECORDING)
  );

  before(() => {
    //Create group1 with 2 devices, admin and member
    cy.testCreateUserGroupAndDevice("raGroupAdmin", "raGroup", "raCamera1");
    cy.apiDeviceAdd("raCamera1b", "raGroup");
    cy.apiUserAdd("raGroupMember");

    cy.apiGroupUserAdd("raGroupAdmin", "raGroupMember", "raGroup", true);

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
      HttpStatusCode.Forbidden
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
      HttpStatusCode.Forbidden
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
      cy.apiRecordingCheck(
        "raGroupAdmin",
        "raRecording1",
        expectedRecording1,
        EXCLUDE_IDS
      );
    });

    cy.log("Delete recording");
    cy.apiRecordingDelete("raGroupAdmin", "raRecording1");

    cy.log("Check recording no longer exists");
    cy.apiRecordingCheck(
      "raGroupAdmin",
      "raRecording1",
      undefined,
      [],
      HttpStatusCode.Forbidden
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
      HttpStatusCode.Forbidden
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
      cy.apiRecordingCheck(
        "raGroupAdmin",
        "raRecording1",
        expectedRecording1,
        EXCLUDE_IDS
      );
    });

    cy.log("Delete recording");
    cy.apiRecordingDelete("raGroupAdmin", "raRecording1");

    cy.log("Check recording no longer exists");
    cy.apiRecordingCheck(
      "raGroupAdmin",
      "raRecording1",
      undefined,
      [],
      HttpStatusCode.Forbidden
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
      HttpStatusCode.Forbidden
    );
  });

  it("Group member can add recordings by device on behalf - for inactive device", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecording1: ApiThermalRecordingResponse;

    cy.log("Rename/reregister device");
    cy.apiDeviceReregister("raCamera1", "raCamera1-renamed", "raGroup").then(
      () => {
        cy.log("Add recording as group member");
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
          HttpStatusCode.Forbidden
        );
      }
    );
  });

  it("Group member can add recordings by device on behalf - for inactive device", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecording1: ApiThermalRecordingResponse;

    cy.log("Rename/reregister device");
    cy.apiDeviceReregister(
      "raCamera1-renamed",
      "raCamera1-renamed2",
      "raGroup"
    ).then(() => {
      cy.log("Add recording as group member");
      cy.apiRecordingAddOnBehalfUsingDevice(
        "raGroupMember",
        "raCamera1-renamed",
        recording1,
        "raRecording1"
      ).then(() => {
        expectedRecording1 = TestCreateExpectedRecordingData(
          templateExpectedRecording,
          "raRecording1",
          "raCamera1-renamed",
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
        HttpStatusCode.Forbidden
      );
    });
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
      HttpStatusCode.Forbidden
    );
    cy.log("Cannot add recording for another group's devices using group");
    cy.apiRecordingAddOnBehalfUsingGroup(
      "raGroupAdmin",
      "raCamera2",
      "raGroup2",
      recording2,
      "raRecording2",
      undefined,
      HttpStatusCode.Forbidden
    );

    cy.apiRecordingAdd("raCamera2", recording2, undefined, "raRecording2");
    cy.log("Cannot view details of another group's recordings");
    cy.apiRecordingCheck(
      "raGroupAdmin",
      "raRecording2",
      undefined,
      [],
      HttpStatusCode.Forbidden
    );

    cy.log("Cannot delete another group's recordings");
    cy.apiRecordingDelete(
      "raGroupAdmin",
      "raRecording2",
      HttpStatusCode.Forbidden
    );
    cy.apiRecordingDelete("raGroup2Admin", "raRecording2");
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
      HttpStatusCode.Unprocessable,
      { useRawDeviceName: true }
    );

    cy.log("Add recording using non-existent device id");
    cy.apiRecordingAddOnBehalfUsingDevice(
      "raGroupAdmin",
      "99999",
      recording1,
      "raRecording1",
      undefined,
      HttpStatusCode.Forbidden,
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
      HttpStatusCode.Forbidden,
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
      HttpStatusCode.Forbidden
    );

    cy.log("Add recording using valid group and another groups device");
    cy.apiRecordingAddOnBehalfUsingGroup(
      "raGroupAdmin",
      "raCamera2",
      "raGroup",
      recording1,
      "raRecording1",
      undefined,
      HttpStatusCode.Forbidden
    );
  });

  it("Correct handling of invalid recording get parameters", () => {
    cy.log("Retrieve non-existent recording id");
    cy.apiRecordingCheck(
      "raGroupAdmin",
      "999999",
      undefined,
      [],
      HttpStatusCode.Forbidden,
      { useRawRecordingId: true }
    );
    cy.apiRecordingCheck(
      "raGroupAdmin",
      "ThisIsNotAValidId",
      undefined,
      [],
      HttpStatusCode.Unprocessable,
      { useRawRecordingId: true }
    );
  });

  it("Correct handling of invalid recording delete parameters", () => {
    cy.log("Delete invalid recording id");
    cy.apiRecordingDelete("raGroupAdmin", "999999", HttpStatusCode.Forbidden, {
      useRawRecordingId: true,
    });
    cy.apiRecordingDelete(
      "raGroupAdmin",
      "ThisIsNotAValidId",
      HttpStatusCode.Unprocessable,
      { useRawRecordingId: true }
    );
  });

  it.skip("Correct handling of invalid recording upload parameters", () => {
    //TODO: to be defined / written
  });

  it.skip("Deleted recording deletes associated tracks, tracktags and tags", () => {
    //TODO: would need to include a database query - i.e. use sequelize or an external system call
  });

  it("Recordings marked as deleted are not picked up by any /recordings API calls", () => {
    const filter = { "page-size": 1, page: 1 };
    const recording1 = TestCreateRecordingData(templateRecording);
    if (Cypress.env("running_in_a_dev_environment") == true) {
      cy.log("Removing all recordings not associated with this test");
      const superuser = getCreds("superuser")["email"];
      const suPassword = getCreds("superuser")["password"];
      cy.log("superuser", superuser);
      cy.apiSignInAs(null, superuser, suPassword);
      cy.testDeleteRecordingsInState(
        superuser,
        RecordingType.ThermalRaw,
        undefined
      );
    }

    let stationId;
    cy.log("Add recording as device");
    cy.apiRecordingAdd("raCamera1", recording1, undefined, "raRecording1").then(
      (recordingId) => {
        checkRecording(
          getCreds("superuser").email,
          recordingId,
          (recording) => {
            stationId = recording.stationId;
          }
        );
      }
    );

    cy.log("Delete recording");
    cy.apiRecordingDelete("raGroupAdmin", "raRecording1");

    cy.log("Check /recordings/report ignores deleted recording");
    cy.apiRecordingsReportCheck(
      "raGroupAdmin",
      { where: {}, order: '[["id", "ASC"]]' },
      []
    );

    cy.log("Check /recordings/id: ignores deleted recording");
    cy.apiRecordingCheck(
      "raGroupAdmin",
      "raRecording1",
      undefined,
      [],
      HttpStatusCode.Forbidden
    );

    cy.log("Check /recordings/id:/thumbnail ignores deleted recording");
    cy.apiRecordingThumbnailCheck(
      "raGroupAdmin",
      "raRecording1",
      HttpStatusCode.Forbidden
    );

    cy.log("Check /recordings/count ignores deleted recording");
    cy.apiRecordingsCountCheck(
      "raGroupAdmin",
      {
        where: {},
        order: '[["id", "ASC"]]',
      },
      0
    );

    cy.log("Check /recordings ignores deleted recording");
    cy.apiRecordingsQueryCheck(
      "raGroupAdmin",
      {
        where: {},
        order: '[["id", "ASC"]]',
      },
      [],
      EXCLUDE_IDS
    );
    cy.log("Check /monitoring ignores deleted recording");
    cy.checkMonitoringWithFilter("raGroupAdmin", stationId, filter, []);

    if (Cypress.env("running_in_a_dev_environment") == true) {
      cy.log("Check /recordings/needs-tag ignores deleted recording");
      cy.apiRecordingNeedsTagCheck("raGroupAdmin", undefined, null, []);
    } else {
      cy.log(
        "SKIPPING - Check /recordings/needs-tag ignores deleted recording - as can only do that on a dev server"
      );
    }
  });
});
