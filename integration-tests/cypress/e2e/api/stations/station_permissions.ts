/// <reference path="../../../support/index.d.ts" />
import { ApiStationResponse } from "@typedefs/api/station";
import { getCreds } from "@commands/server";
import { getTestName } from "@commands/names";
import { NOT_NULL, NOT_NULL_STRING } from "@commands/constants";
import {
  TestCreateStationData,
  TestCreateExpectedStation,
  TestGetLocation,
} from "@commands/api/station";
import { ApiStationData } from "@commands/types";
import { HttpStatusCode } from "@typedefs/api/consts";

describe("Stations: permissions", () => {
  const superuser = getCreds("superuser")["name"];
  const suPassword = getCreds("superuser")["password"];

  const TemplateExpectedStation: ApiStationResponse = {
    id: NOT_NULL,
    name: "saStation1",
    location: { lat: -43.62367659982, lng: 172.62646754804 },
    lastUpdatedById: NOT_NULL,
    createdAt: NOT_NULL_STRING,
    activeAt: NOT_NULL_STRING,
    updatedAt: NOT_NULL_STRING,
    automatic: false,
    groupId: NOT_NULL,
    groupName: NOT_NULL_STRING,
  };

  before(() => {
    cy.testCreateUserGroupAndDevice("saAdmin", "saGroup", "saCamera1").then(
      () => {
        TemplateExpectedStation.groupId = getCreds("saGroup").id;
        TemplateExpectedStation.groupName = getTestName("saGroup");
        TemplateExpectedStation.name = getTestName("saStation1");
      }
    );
    cy.apiUserAdd("saMember");
    cy.apiGroupUserAdd("saAdmin", "saMember", "saGroup", false);
    cy.apiUserAdd("saNonMember");
  });

  it("Permissions: Group admin can add, get, update, delete a station", () => {
    const saStation1 = TestCreateStationData("saStation", 1);
    const saExpectedStation1 = TestCreateExpectedStation(
      TemplateExpectedStation,
      "saStation",
      1
    );
    const saUpdatedExpectedStation1 = TestCreateExpectedStation(
      TemplateExpectedStation,
      "saUpdatedStation",
      1
    );
    const thisLocation = TestGetLocation(1);

    cy.log("Adding station");
    cy.apiGroupStationAdd("saAdmin", "saGroup", saStation1).then(() => {
      cy.log("Can get station by id");
      cy.apiStationCheck(
        "saAdmin",
        getTestName("saStation1"),
        saExpectedStation1
      );

      const recordingTime = new Date();
      cy.testUploadRecording(
        "saCamera1",
        { ...thisLocation, time: recordingTime },
        "saRecording1"
      )
        .thenCheckStationNameIs("saAdmin", getTestName("saStation1"))
        .then(() => {
          //Station now has a last thermal recording time
          saExpectedStation1.lastThermalRecordingTime =
            recordingTime.toISOString();
          saUpdatedExpectedStation1.lastThermalRecordingTime =
            recordingTime.toISOString();
          cy.log("Can get station by group, name");
          cy.apiGroupStationCheck(
            "saAdmin",
            "saGroup",
            "saStation1",
            saExpectedStation1
          );

          cy.log("Can get stations by group");
          cy.apiGroupStationsCheck("saAdmin", "saGroup", [saExpectedStation1]);

          cy.log("Can get stations by user");
          cy.apiStationsCheck("saAdmin", [saExpectedStation1]);

          cy.log("Can update a station");
          cy.apiStationUpdate("saAdmin", "saStation1", {
            name: "newName",
          } as unknown as ApiStationData).then(() => {
            saExpectedStation1.name = getTestName("newName");
            cy.apiStationCheck(
              "saAdmin",
              getTestName("saStation1"),
              saExpectedStation1
            );
          });

          cy.log("Can delete station");
          cy.apiStationDelete("saAdmin", "saStation1").then(() => {
            cy.log("Station no longer exists");
            cy.apiStationCheck(
              "saAdmin",
              getTestName("saStation1"),
              undefined,
              [],
              HttpStatusCode.Forbidden
            );

            cy.log("Recording deleted too");
            cy.apiRecordingCheck(
              "saAdmin",
              "saRecording1",
              undefined,
              [],
              HttpStatusCode.Forbidden
            );
          });
        });
    });
  });

  it("Permissions: Member cannot add, update or delete a station but can get", () => {
    const saStation = TestCreateStationData("saStation", 2);
    const saExpectedStation = TestCreateExpectedStation(
      TemplateExpectedStation,
      "saStation",
      2
    );
    cy.log("Member cannot add station");
    cy.apiGroupStationAdd(
      "saMember",
      "saGroup",
      saStation,
      undefined,
      undefined,
      HttpStatusCode.Forbidden
    );

    cy.log("Get admin to add a station to test with");
    cy.apiGroupStationAdd("saAdmin", "saGroup", saStation).then(() => {
      cy.log("Member can get station by id");
      cy.apiStationCheck(
        "saMember",
        getTestName("saStation2"),
        saExpectedStation
      );

      cy.log("Member can get station by group");
      cy.apiGroupStationCheck(
        "saMember",
        "saGroup",
        "saStation2",
        saExpectedStation
      );

      cy.log("Can get stations by group");
      cy.apiGroupStationsCheck("saMember", "saGroup", [saExpectedStation]);

      cy.log("Get stations by user lists this station");
      cy.apiStationsCheck("saMember", [saExpectedStation]);

      cy.log("Cannot update station");
      cy.apiStationUpdate(
        "saMember",
        "saStation2",
        { name: "newName" } as unknown as ApiStationData,
        undefined,
        undefined,
        false,
        HttpStatusCode.Forbidden
      );

      cy.log("Cannot delete station");
      cy.apiStationDelete(
        "saMember",
        "saStation2",
        true,
        HttpStatusCode.Forbidden
      );

      cy.log("Station still exists");
      cy.apiStationCheck(
        "saAdmin",
        getTestName("saStation2"),
        saExpectedStation
      );
    });
  });

  it("Permissions: Non-member cannot add, get, update or delete a station", () => {
    const saStation = TestCreateStationData("saStation", 3);
    const saExpectedStation = TestCreateExpectedStation(
      TemplateExpectedStation,
      "saStation",
      3
    );
    cy.log("Non-Member cannot add station");
    cy.apiGroupStationAdd(
      "saNonMember",
      "saGroup",
      saStation,
      undefined,
      undefined,
      HttpStatusCode.Forbidden
    );

    cy.log("Get admin to add a station to test with");
    cy.apiGroupStationAdd("saAdmin", "saGroup", saStation).then(() => {
      cy.log("Non-Member cannot get station by id");
      cy.apiStationCheck(
        "saNonMember",
        getTestName("saStation3"),
        undefined,
        undefined,
        HttpStatusCode.Forbidden
      );

      cy.log("Non-Member cannot get station by group");
      cy.apiGroupStationCheck(
        "saNonMember",
        "saGroup",
        "saStation3",
        undefined,
        undefined,
        HttpStatusCode.Forbidden
      );

      cy.log("Cannot get stations by group");
      cy.apiGroupStationsCheck(
        "saNonMember",
        "saGroup",
        [],
        undefined,
        HttpStatusCode.Forbidden
      );

      cy.log("Get stations by user does not list this station");
      cy.apiStationsCheck("saNonMember", []);

      cy.log("Non-member Cannot update station");
      cy.apiStationUpdate(
        "saNonMember",
        "saStation3",
        { name: "newName" } as unknown as ApiStationData,
        undefined,
        undefined,
        false,
        HttpStatusCode.Forbidden
      );

      cy.log("Non-member Cannot delete station");
      cy.apiStationDelete(
        "saNonMember",
        "saStation3",
        true,
        HttpStatusCode.Forbidden
      );

      cy.log("Station still exists");
      cy.apiStationCheck(
        "saAdmin",
        getTestName("saStation3"),
        saExpectedStation
      );
    });
  });

  if (Cypress.env("running_in_a_dev_environment") == true) {
    it("Super-user as user should see only their recordings", () => {
      cy.apiSignInAs(null, null, superuser, suPassword);

      cy.apiGroupAdd("saAdmin", "saOnlyGroup");
      cy.apiDeviceAdd("saOnlyCamera", "saOnlyGroup");
      cy.apiGroupAdd(superuser, "saSuGroup");
      cy.apiDeviceAdd("saSuCamera", "saSuGroup");

      const saStation1 = TestCreateStationData("saStation", 4);
      const saExpectedStation1 = TestCreateExpectedStation(
        TemplateExpectedStation,
        "saStation",
        4
      );
      const saStation2 = TestCreateStationData("saStation", 5);
      const saExpectedStation2 = TestCreateExpectedStation(
        TemplateExpectedStation,
        "saStation",
        5
      );

      cy.log("Adding station in another group");
      cy.apiGroupStationAdd("saAdmin", "saOnlyGroup", saStation1).then(() => {
        cy.apiGroupStationAdd(superuser, "saSuGroup", saStation2).then(() => {
          saExpectedStation2.groupId = getCreds("saSuGroup").id;
          saExpectedStation2.groupName = getTestName("saSuGroup");
          saExpectedStation1.groupId = getCreds("saOnlyGroup").id;
          saExpectedStation1.groupName = getTestName("saOnlyGroup");
          //Station by ID
          cy.log("SU can get station in any group by id");
          cy.apiStationCheck(
            superuser,
            getTestName("saStation4"),
            saExpectedStation1
          );

          cy.log("SU cannot get station in any group by id when in user-mode");
          cy.apiStationCheck(
            superuser,
            getTestName("saStation4"),
            undefined,
            undefined,
            HttpStatusCode.Forbidden,
            { additionalParams: { "view-mode": "user" } }
          );

          cy.log("SU can get station in own group by id when in user-mode");
          cy.apiStationCheck(
            superuser,
            getTestName("saStation5"),
            saExpectedStation2,
            undefined,
            undefined,
            { additionalParams: { "view-mode": "user" } }
          );

          // all stations by group
          cy.log("SU can get station by group");
          cy.apiGroupStationsCheck(superuser, "saOnlyGroup", [
            saExpectedStation1,
          ]);

          cy.log(
            "SU cannot get station in any group by group when in user-mode"
          );
          cy.apiGroupStationsCheck(
            superuser,
            "saOnlyGroup",
            [saExpectedStation1],
            undefined,
            HttpStatusCode.Forbidden,
            { additionalParams: { "view-mode": "user" } }
          );

          cy.log("SU can get stations in own group by group when in user-mode");
          cy.apiGroupStationsCheck(
            superuser,
            "saSuGroup",
            [saExpectedStation2],
            undefined,
            undefined,
            { additionalParams: { "view-mode": "user" } }
          );

          //Station by group and name
          cy.log("Can get station in any group by group, name");
          cy.apiGroupStationCheck(
            superuser,
            "saOnlyGroup",
            "saStation4",
            saExpectedStation1
          );

          cy.log(
            "Cannot get station in any group by group, name when in user mode"
          );
          cy.apiGroupStationCheck(
            superuser,
            "saOnlyGroup",
            "saStation4",
            undefined,
            undefined,
            HttpStatusCode.Forbidden,
            { additionalParams: { "view-mode": "user" } }
          );

          cy.log(
            "Can get station in own group by group, name when in user-mode"
          );
          cy.apiGroupStationCheck(
            superuser,
            "saSuGroup",
            "saStation5",
            saExpectedStation2,
            undefined,
            undefined,
            { additionalParams: { "view-mode": "user" } }
          );

          //Stations by user
          cy.log("Can get only own stations by user when in user-mode");
          cy.apiStationsCheck(
            superuser,
            [saExpectedStation2],
            undefined,
            undefined,
            { additionalParams: { "view-mode": "user" } }
          );

          //Tidy up
          cy.apiStationDelete(superuser, "saStation5");
          //;
        });
      });
    });
  } else {
    it.skip("Super-user as user should see only their recordings", () => {});
  }
});
