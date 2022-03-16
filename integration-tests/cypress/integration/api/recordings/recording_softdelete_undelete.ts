/// <reference path="../../../support/index.d.ts" />
import {
  HTTP_Forbidden,
  HTTP_Unprocessable,
  HTTP_OK200,
  EXCLUDE_IDS_ARRAY,
} from "@commands/constants";

import { ApiRecordingSet, ApiRecordingColumns } from "@commands/types";
import { getCreds } from "@commands/server";

import {
  TestCreateExpectedRecordingData,
  TestCreateExpectedRecordingColumns,
  TestCreateRecordingData,
} from "@commands/api/recording-tests";
import { ApiThermalRecordingResponse } from "@typedefs/api/recording";
import {
  TEMPLATE_THERMAL_RECORDING,
  TEMPLATE_THERMAL_RECORDING_RESPONSE,
} from "@commands/dataTemplate";

//FIXME: Disabled checking DATA as that would require creating a model and associating
//model name and id
//TODO: do that once prior to all tests and enable checking of DATA
const EXCLUDE_IDS_RECORDINGS = EXCLUDE_IDS_ARRAY.concat([
  "[].tracks[].tags[].data",
]);

const EXCLUDE_COLUMNS = ["Date", "Time"];

describe("Recordings: soft delete, undelete", () => {
  const templateExpectedRecording: ApiThermalRecordingResponse = JSON.parse(
    JSON.stringify(TEMPLATE_THERMAL_RECORDING_RESPONSE)
  );
  const templateRecording: ApiRecordingSet = JSON.parse(
    JSON.stringify(TEMPLATE_THERMAL_RECORDING)
  );

  before(() => {
    //Create group1 with 2 devices, admin and member
    cy.testCreateUserGroupAndDevice("rsdGroupAdmin", "rsdGroup", "rsdCamera1");
    cy.apiDeviceAdd("rsdCamera1b", "rsdGroup");
    cy.apiUserAdd("rsdGroupMember");

    cy.apiGroupUserAdd("rsdGroupAdmin", "rsdGroupMember", "rsdGroup", true);

    //Create group2 with admin and device
    cy.testCreateUserGroupAndDevice(
      "rsdGroup2Admin",
      "rsdGroup2",
      "rsdCamera2"
    );
  });

  it("Group admin can soft delete a recording and undelete it", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecordingFromQuery1: ApiThermalRecordingResponse;

    cy.log("Add recording as device");
    cy.apiRecordingAdd(
      "rsdCamera1",
      recording1,
      undefined,
      "rsdRecording1"
    ).then(() => {
      expectedRecordingFromQuery1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rsdRecording1",
        "rsdCamera1",
        "rsdGroup",
        null,
        recording1
      );
      delete expectedRecordingFromQuery1.tracks[0].positions;

      cy.log("Soft delete recording");
      cy.apiRecordingDelete("rsdGroupAdmin", "rsdRecording1", HTTP_OK200, {
        additionalParams: "{soft-delete: true}",
      }).then(() => {
        cy.log("Check recording no longer shown by default");
        cy.apiRecordingsQueryCheck(
          "rsdGroupAdmin",
          { where: { id: getCreds("rsdRecording1").id } },
          [],
          []
        );

        cy.log("Check recording listed as deleted");
        cy.apiRecordingsQueryCheck(
          "rsdGroupAdmin",
          { deleted: true, where: { id: getCreds("rsdRecording1").id } },
          [expectedRecordingFromQuery1],
          EXCLUDE_IDS_RECORDINGS
        );

        cy.log("Undelete");
        cy.apiRecordingUndelete("rsdGroupAdmin", "rsdRecording1").then(() => {
          cy.log("Check recording listed");
          cy.apiRecordingsQueryCheck(
            "rsdGroupAdmin",
            { where: { id: getCreds("rsdRecording1").id } },
            [expectedRecordingFromQuery1],
            EXCLUDE_IDS_RECORDINGS
          );
          cy.log("Check recording not listed as deleted");
          cy.apiRecordingsQueryCheck(
            "rsdGroupAdmin",
            { deleted: true, where: { id: getCreds("rsdRecording1").id } },
            [],
            []
          );
        });
      });
    });
  });

  it("Group member can soft delete a recording and undelete it", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecordingFromQuery1: ApiThermalRecordingResponse;

    cy.log("Add recording as device");
    cy.apiRecordingAdd(
      "rsdCamera1",
      recording1,
      undefined,
      "rsdRecording2"
    ).then(() => {
      expectedRecordingFromQuery1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rsdRecording2",
        "rsdCamera1",
        "rsdGroup",
        null,
        recording1
      );
      delete expectedRecordingFromQuery1.tracks[0].positions;

      cy.log("Soft delete recording");
      cy.apiRecordingDelete("rsdGroupMember", "rsdRecording2", HTTP_OK200, {
        additionalParams: "{soft-delete: true}",
      }).then(() => {
        cy.log("Check recording no longer shown by default");
        cy.apiRecordingsQueryCheck(
          "rsdGroupMember",
          { where: { id: getCreds("rsdRecording2").id } },
          [],
          []
        );

        cy.log("Check recording listed as deleted");
        cy.apiRecordingsQueryCheck(
          "rsdGroupMember",
          { deleted: true, where: { id: getCreds("rsdRecording2").id } },
          [expectedRecordingFromQuery1],
          EXCLUDE_IDS_RECORDINGS
        );

        cy.log("Undelete");
        cy.apiRecordingUndelete("rsdGroupMember", "rsdRecording2").then(() => {
          cy.log("Check recording listed");
          cy.apiRecordingsQueryCheck(
            "rsdGroupMember",
            { where: { id: getCreds("rsdRecording2").id } },
            [expectedRecordingFromQuery1],
            EXCLUDE_IDS_RECORDINGS
          );
          cy.log("Check recording not listed as deleted");
          cy.apiRecordingsQueryCheck(
            "rsdGroupMember",
            { deleted: true, where: { id: getCreds("rsdRecording2").id } },
            [],
            []
          );
        });
      });
    });
  });

  it("Can hard-delete a recording", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    cy.log("Add recording as device");
    cy.apiRecordingAdd(
      "rsdCamera1",
      recording1,
      undefined,
      "rsdRecording5"
    ).then(() => {
      cy.log("Hard delete recording");
      cy.apiRecordingDelete("rsdGroupMember", "rsdRecording5", HTTP_OK200, {
        additionalParams: { "soft-delete": false },
      });

      cy.log("Check recording no longer shown by default");
      cy.apiRecordingsQueryCheck(
        "rsdGroupMember",
        { where: { id: getCreds("rsdRecording5").id } },
        [],
        []
      );

      cy.log("Check recording not listed as deleted");
      cy.apiRecordingsQueryCheck(
        "rsdGroupMember",
        { deleted: true, where: { id: getCreds("rsdRecording5").id } },
        [],
        EXCLUDE_IDS_RECORDINGS
      );

      cy.log("Check cannot undelete");
      cy.apiRecordingUndelete(
        "rsdGroupMember",
        "rsdRecording5",
        HTTP_Forbidden
      );
    });
  });

  it("Cannot delete / undelete a recording we don't have permissions for", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecordingFromQuery1: ApiThermalRecordingResponse;

    cy.log("Add recording as device");
    cy.apiRecordingAdd(
      "rsdCamera1",
      recording1,
      undefined,
      "rsdRecording6"
    ).then(() => {
      expectedRecordingFromQuery1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rsdRecording6",
        "rsdCamera1",
        "rsdGroup",
        null,
        recording1
      );
      delete expectedRecordingFromQuery1.tracks[0].positions;

      cy.log("Member of a different group cannot soft delete recording");
      cy.apiRecordingDelete("rsdGroup2Admin", "rsdRecording6", HTTP_Forbidden);

      cy.log("Check recording not deleted");
      cy.apiRecordingsQueryCheck(
        "rsdGroupAdmin",
        { where: { id: getCreds("rsdRecording6").id } },
        [expectedRecordingFromQuery1],
        EXCLUDE_IDS_RECORDINGS
      );

      cy.log("Owner can soft-delete recording");
      cy.apiRecordingDelete("rsdGroupAdmin", "rsdRecording6", HTTP_OK200, {
        additionalParams: "{soft-delete: true}",
      }).then(() => {
        cy.log("Non member cannot list as deleted");
        cy.apiRecordingsQueryCheck(
          "rsdGroup2Admin",
          { deleted: true, where: { id: getCreds("rsdRecording6").id } },
          [],
          EXCLUDE_IDS_RECORDINGS
        );

        cy.log("Non member cannot Undelete");
        cy.apiRecordingUndelete(
          "rsdGroup2Admin",
          "rsdRecording6",
          HTTP_Forbidden
        ).then(() => {
          cy.log("Check recording still deleted");
          cy.apiRecordingsQueryCheck(
            "rsdGroupAdmin",
            { deleted: true, where: { id: getCreds("rsdRecording6").id } },
            [expectedRecordingFromQuery1],
            EXCLUDE_IDS_RECORDINGS
          );
        });
      });
    });
  });

  it("Check soft-deleted recordings not returned by default, for supported endpoitns", () => {
    const recording1 = TestCreateRecordingData(templateRecording);

    cy.log("Add recording as device");
    cy.apiRecordingAdd(
      "rsdCamera1",
      recording1,
      undefined,
      "rsdRecording7"
    ).then(() => {
      cy.log("Soft-delete recording");
      cy.apiRecordingDelete("rsdGroupAdmin", "rsdRecording7", HTTP_OK200, {
        additionalParams: "{soft-delete: true}",
      }).then(() => {
        cy.log("Check not returned by /recordings/?where=");
        cy.apiRecordingsQueryCheck(
          "rsdGroupAdmin",
          { where: { id: getCreds("rsdRecording7").id } },
          [],
          EXCLUDE_IDS_RECORDINGS
        );

        //check /recordings/count
        cy.log("Check not returned by /recordings/count");
        cy.apiRecordingsCountCheck(
          "rsdGroupAdmin",
          { where: { id: getCreds("rsdRecording7").id } },
          0
        );

        //check /recordings/report
        cy.log("Check not returned by /recordings/report");
        cy.apiRecordingsReportCheck(
          "rsdGroupAdmin",
          { where: { id: getCreds("rsdRecording7").id } },
          []
        );
      });
    });
  });

  it("Check soft-deleted recordings returned where requested, for supported endpoints", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecordingFromQuery1: ApiThermalRecordingResponse;
    let expectedReportFromQuery1: ApiRecordingColumns;

    cy.log("Add recording as device");
    cy.apiRecordingAdd(
      "rsdCamera1",
      recording1,
      undefined,
      "rsdRecording8"
    ).then(() => {
      expectedRecordingFromQuery1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rsdRecording8",
        "rsdCamera1",
        "rsdGroup",
        null,
        recording1
      );
      delete expectedRecordingFromQuery1.tracks[0].positions;

      expectedReportFromQuery1 = TestCreateExpectedRecordingColumns(
        "rsdRecording8",
        "rsdCamera1",
        "rsdGroup",
        undefined,
        recording1
      );

      cy.log("Soft-delete recording");
      cy.apiRecordingDelete("rsdGroupAdmin", "rsdRecording8", HTTP_OK200, {
        additionalParams: "{soft-delete: true}",
      }).then(() => {
        cy.log("Check returned when deleted requested by /recordings/?where=");
        cy.apiRecordingsQueryCheck(
          "rsdGroupAdmin",
          { deleted: true, where: { id: getCreds("rsdRecording8").id } },
          [expectedRecordingFromQuery1],
          EXCLUDE_IDS_RECORDINGS
        );

        //check /recordings/count
        cy.log("Check returned when deleted requested by /recordings/count");
        cy.apiRecordingsCountCheck(
          "rsdGroupAdmin",
          { deleted: true, where: { id: getCreds("rsdRecording8").id } },
          1
        );

        //check /recordings/report
        cy.log("Check returned when deleted requested by /recordings/report");
        cy.apiRecordingsReportCheck(
          "rsdGroupAdmin",
          { deleted: true, where: { id: getCreds("rsdRecording8").id } },
          [expectedReportFromQuery1],
          EXCLUDE_COLUMNS
        );
      });
    });
  });

  it("Check default action is soft-delete", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecordingFromQuery1: ApiThermalRecordingResponse;

    cy.log("Add recording as device");
    cy.apiRecordingAdd(
      "rsdCamera1",
      recording1,
      undefined,
      "rsdRecording9"
    ).then(() => {
      expectedRecordingFromQuery1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rsdRecording9",
        "rsdCamera1",
        "rsdGroup",
        null,
        recording1
      );
      delete expectedRecordingFromQuery1.tracks[0].positions;

      cy.log("Delete recording without specifying soft/hard delete");
      cy.apiRecordingDelete("rsdGroupAdmin", "rsdRecording9").then(() => {
        cy.log(
          "Check recording was soft-deleted (listed in soft-deleted recordings query"
        );
        cy.apiRecordingsQueryCheck(
          "rsdGroupAdmin",
          { deleted: true, where: { id: getCreds("rsdRecording9").id } },
          [expectedRecordingFromQuery1],
          EXCLUDE_IDS_RECORDINGS
        );
      });
    });
  });

  it("Undelete - handling of invalid parameters", () => {
    const recording1 = TestCreateRecordingData(templateRecording);

    cy.log("Add recording as device");
    cy.apiRecordingAdd(
      "rsdCamera1",
      recording1,
      undefined,
      "rsdRecording10"
    ).then(() => {
      cy.log("Delete recording without specifying soft/hard delete");
      cy.apiRecordingDelete("rsdGroupAdmin", "rsdRecording10", HTTP_OK200, {
        additionalParams: "{soft-delete: true}",
      }).then(() => {
        cy.log("Handling of undelete invalid recording id");
        cy.apiRecordingUndelete("rsdGroupAdmin", "999999", HTTP_Forbidden, {
          useRawRecordingId: true,
        });

        cy.log("Handling of invalid parameter");
        cy.apiRecordingUndelete(
          "rsdGroupAdmin",
          "rsdRecording10",
          HTTP_Unprocessable,
          { additionalParams: { badParameter: "hello" } }
        );
      });
    });
  });
});
