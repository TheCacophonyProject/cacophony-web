import {
  TEMPLATE_AUDIO_RECORDING,
  TEMPLATE_AUDIO_RECORDING_RESPONSE,
} from "@commands/dataTemplate";
/// <reference path="../../../support/index.d.ts" />
import { EXCLUDE_IDS_ARRAY } from "@commands/constants";

import {
  ApiRecordingSet,
  ApiRecordingColumns,
  TestNameAndId,
} from "@commands/types";
import { getCreds } from "@commands/server";

import {
  TestCreateExpectedRecordingData,
  TestCreateExpectedRecordingColumns,
  TestCreateRecordingData,
} from "@commands/api/recording-tests";
import {
  ApiAudioRecordingResponse,
  ApiThermalRecordingResponse,
} from "@typedefs/api/recording";
import {
  TEMPLATE_THERMAL_RECORDING,
  TEMPLATE_THERMAL_RECORDING_RESPONSE,
} from "@commands/dataTemplate";
import { HttpStatusCode } from "@typedefs/api/consts";

//Note: Disabled checking DATA as that would require creating a model and associating
//model name and id, and that can only be done through processing API
//and only done safely on dev
const EXCLUDE_IDS_RECORDINGS = EXCLUDE_IDS_ARRAY.concat([
  "[].tracks[].tags[].data",
]);

const EXCLUDE_COLUMNS = ["Date", "Time"];

describe("Recordings: bulk delete, undelete", () => {
  const templateExpectedRecording: ApiThermalRecordingResponse = JSON.parse(
    JSON.stringify(TEMPLATE_THERMAL_RECORDING_RESPONSE)
  );
  const templateExpectedAudioRecording: ApiAudioRecordingResponse = JSON.parse(
    JSON.stringify(TEMPLATE_AUDIO_RECORDING_RESPONSE)
  );
  const templateRecording: ApiRecordingSet = JSON.parse(
    JSON.stringify(TEMPLATE_THERMAL_RECORDING)
  );
  const templateAudioRecording: ApiRecordingSet = JSON.parse(
    JSON.stringify(TEMPLATE_AUDIO_RECORDING)
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

  it("Group admin can soft delete recordings and undelete them", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const recording2 = TestCreateRecordingData(templateAudioRecording);
    let expectedRecordingFromQuery1: ApiThermalRecordingResponse;
    let expectedRecordingFromQuery2: ApiAudioRecordingResponse;

    cy.log("Add recording as device");
    cy.apiRecordingAdd("rsdCamera1", recording1, undefined, "rsdRecording1")
      .then(() =>
        cy.apiRecordingAdd("rsdCamera1", recording2, undefined, "rsdRecording2")
      )
      .then(() => {
        expectedRecordingFromQuery1 = TestCreateExpectedRecordingData(
          templateExpectedRecording,
          "rsdRecording1",
          "rsdCamera1",
          "rsdGroup",
          null,
          recording1,
          false
        );
        expectedRecordingFromQuery2 = TestCreateExpectedRecordingData(
          templateExpectedAudioRecording,
          "rsdRecording2",
          "rsdCamera1",
          "rsdGroup",
          null,
          recording2,
          false
        );
        //expectedRecordingFromQuery1.tracks[0].positions = [];

        const id1 = getCreds("rsdRecording1").id;
        const id2 = getCreds("rsdRecording2").id;
        cy.log("Soft delete recordings");
        cy.apiRecordingBulkDelete(
          "rsdGroupAdmin",
          { where: { id: id1 } },
          HttpStatusCode.Ok
        ).then(() => {
          cy.log("Check recording no longer shown by default");
          const ids = [id1, id2];
          cy.apiRecordingsCountCheck(
            "rsdGroupAdmin",
            { where: { id: ids } },
            1
          );

          cy.log("Undelete");
          cy.apiRecordingBulkUndelete("rsdGroupAdmin", [id1]).then(() => {
            cy.log("Check recording listed");
            cy.apiRecordingsCountCheck(
              "rsdGroupAdmin",
              { where: { id: ids }, order: '[["id", "ASC"]]' },
              2
            );
          });
        });
      });
  });

  it("Cannot delete / undelete a recording we don't have permissions for", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    const recording2 = TestCreateRecordingData(templateAudioRecording);
    let expectedRecordingFromQuery1: ApiThermalRecordingResponse;
    let expectedRecordingFromQuery2: ApiAudioRecordingResponse;

    cy.log("Add recording as device");

    cy.apiRecordingAdd("rsdCamera1", recording1, undefined, "rsdRecording6")
      .then(() =>
        cy.apiRecordingAdd("rsdCamera1", recording2, undefined, "rsdRecording7")
      )
      .then(() => {
        const id1 = getCreds("rsdRecording1").id;
        const id2 = getCreds("rsdRecording2").id;
        expectedRecordingFromQuery1 = TestCreateExpectedRecordingData(
          templateExpectedRecording,
          "rsdRecording6",
          "rsdCamera1",
          "rsdGroup",
          null,
          recording1,
          false
        );
        expectedRecordingFromQuery1 = TestCreateExpectedRecordingData(
          templateExpectedRecording,
          "rsdRecording7",
          "rsdCamera1",
          "rsdGroup",
          null,
          recording2,
          false
        );
        // TODO: Isue 104: positions whould be returned or absent, but not empty
        //expectedRecordingFromQuery1.tracks[0].positions = [];

        cy.log("Member of a different group cannot soft delete recording");
        cy.apiRecordingBulkDelete(
          "rsdGroup2Admin",
          { where: { id: id1 } },
          HttpStatusCode.BadRequest
        );

        cy.log("Check recording not deleted");
        cy.apiRecordingsCountCheck("rsdGroupAdmin", { where: { id: id1 } }, 1);

        cy.log("Owner can soft-delete recording");
        cy.apiRecordingBulkDelete(
          "rsdGroupAdmin",
          { where: { id: id1 } },
          HttpStatusCode.Ok
        ).then(() => {
          cy.log("Non member cannot list as deleted");
          cy.apiRecordingsCountCheck(
            "rsdGroup2Admin",
            { deleted: true, where: { id: id1 } },
            0
          );

          cy.log("Non member cannot Undelete");
          cy.apiRecordingBulkUndelete(
            "rsdGroup2Admin",
            [id1],
            HttpStatusCode.Forbidden
          ).then(() => {
            cy.log("Check recording still deleted");
            cy.apiRecordingsCountCheck(
              "rsdGroupAdmin",
              { deleted: true, where: { id: id1 } },
              1
            );
          });
        });
      });
  });

  it("Check bulk deleted recordings not returned by default, for supported endpoitns", () => {
    const recording1 = TestCreateRecordingData(templateRecording);

    cy.log("Add recording as device");
    cy.apiRecordingAdd(
      "rsdCamera1",
      recording1,
      undefined,
      "rsdRecording7"
    ).then(() => {
      cy.log("Soft-delete recording");
      cy.apiRecordingBulkDelete(
        "rsdGroupAdmin",
        { where: { id: getCreds("rsdRecording7").id } },
        HttpStatusCode.Ok
      ).then(() => {
        cy.log("Check not returned by /recordings/?where=");
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

  it("Check bulk deleted recordings returned where requested, for supported endpoints", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecordingFromQuery1: ApiThermalRecordingResponse;
    let expectedReportFromQuery1: ApiRecordingColumns;

    cy.log("Add recording as device");
    cy.apiRecordingAdd("rsdCamera1", recording1, undefined, "rsdRecording8")
      .thenCheckStationIsNew("rsdGroupAdmin")
      .then((station: TestNameAndId) => {
        expectedRecordingFromQuery1 = TestCreateExpectedRecordingData(
          templateExpectedRecording,
          "rsdRecording8",
          "rsdCamera1",
          "rsdGroup",
          station.name,
          recording1,
          false
        );

        expectedReportFromQuery1 = TestCreateExpectedRecordingColumns(
          "rsdRecording8",
          "rsdCamera1",
          "rsdGroup",
          station.name,
          recording1
        );

        cy.log("Soft-delete recording");
        cy.apiRecordingBulkDelete(
          "rsdGroupAdmin",
          { where: { id: getCreds("rsdRecording8").id } },
          HttpStatusCode.Ok
        ).then(() => {
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

  it("Check default action is soft-delete for bulk", () => {
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
        recording1,
        false
      );
      // TODO: Isue 104: positions whould be returned or absent, but not empty
      //expectedRecordingFromQuery1.tracks[0].positions = [];

      cy.log("Delete recording without specifying soft/hard delete");
      cy.apiRecordingBulkDelete("rsdGroupAdmin", {
        where: { id: getCreds("rsdRecording9").id },
      }).then(() => {
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
      cy.apiRecordingBulkDelete(
        "rsdGroupAdmin",
        { where: { id: getCreds("rsdRecording10").id } },
        HttpStatusCode.Ok
      ).then(() => {
        cy.log("Handling of undelete invalid recording id");
        cy.apiRecordingBulkUndelete(
          "rsdGroupAdmin",
          [999999],
          HttpStatusCode.Forbidden
        );

        cy.log("Handling of invalid parameter");
        cy.apiRecordingBulkUndelete(
          "rsdGroupAdmin",
          [999999],
          HttpStatusCode.Forbidden,
          { additionalParams: { badParameter: "hello" } }
        );
      });
    });
  });
});
