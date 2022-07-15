/// <reference path="../../../support/index.d.ts" />

import { ApiRecordingNeedsTagReturned, ApiRecordingSet } from "@commands/types";

import { getCreds } from "@commands/server";

import {
  TestCreateExpectedNeedsTagData,
  TestCreateRecordingData,
} from "@commands/api/recording-tests";
import {HTTP_BadRequest, HTTP_OK200, RecordingType} from "@typedefs/api/consts";
import {
  TEMPLATE_THERMAL_RECORDING,
  TEMPLATE_THERMAL_RECORDING_NEEDS_TAG,
} from "@commands/dataTemplate";

const NO_SAVE_ID = null;

describe("Recording needs-tag (power-tagger)", () => {
  const superuser = getCreds("superuser")["name"];
  const suPassword = getCreds("superuser")["password"];

  const templateExpectedRecording: ApiRecordingNeedsTagReturned = JSON.parse(
    JSON.stringify(TEMPLATE_THERMAL_RECORDING_NEEDS_TAG)
  );
  const templateRecording: ApiRecordingSet = JSON.parse(
    JSON.stringify(TEMPLATE_THERMAL_RECORDING)
  );

  let dev_env = false;
  let doNotValidate = true;

  const recording1 = TestCreateRecordingData(templateRecording);
  let expectedRecording1: ApiRecordingNeedsTagReturned;

  before(() => {
    //Create group1 with admin and device
    cy.testCreateUserGroupAndDevice("rntGroupAdmin", "rntGroup", "rntCamera1");
    cy.apiDeviceAdd("rntCamera1b", "rntGroup");

    //Create user not associated with any devices
    cy.apiUserAdd("rntNonMember");

    //Create second group, admin & device
    cy.testCreateUserGroupAndDevice(
      "rntGroup2Admin",
      "rntGroup2",
      "rntCamera2"
    );

    //When running on dev we know what recordings are present so can validate
    //all paramters.
    //When running on test we cannot control what data is present so just validate that the
    //API calls work
    if (Cypress.env("running_in_a_dev_environment") == true) {
      dev_env = true;
      doNotValidate = false;
      cy.apiSignInAs(null, null, superuser, suPassword);
    } else {
      doNotValidate = true;
      cy.log(
        "Warning: validating returned returned data presence but not parameter values"
      );
      cy.log(
        "Enable running_in_a_dev_environment to allow value checks (only on dev)"
      );
    }
  });

  beforeEach(() => {
    //If running on dev, delete any recordings already present so that we know
    //what requires tagging
    if (dev_env == true) {
      cy.testDeleteRecordingsInState(
        superuser,
        RecordingType.ThermalRaw,
        undefined
      );
      cy.testDeleteRecordingsInState(superuser, RecordingType.Audio, undefined);
    }
  });

  it("Non-member can view a recording", () => {
    cy.log("Add a recording in group1");
    cy.apiRecordingAdd(
      "rntCamera1",
      recording1,
      undefined,
      "rntRecording1"
    ).then(() => {
      expectedRecording1 = TestCreateExpectedNeedsTagData(
        templateExpectedRecording,
        "rntRecording1",
        "rntCamera1",
        recording1
      );
      cy.log("Verify non-member can view this recording");
      cy.apiRecordingNeedsTagCheck(
        "rntNonMember",
        undefined,
        NO_SAVE_ID,
        [expectedRecording1],
        [],
        HTTP_OK200,
        { doNotValidate: doNotValidate }
      );
    });
  });

  //cannot run without SU credentials as we need to ensure no recordings that need tagging are present
  if (Cypress.env("running_in_a_dev_environment") == true) {
    it("Does not return recordings not needing tagging", () => {
      cy.log("Add a recording in group1");
      cy.apiRecordingAdd(
        "rntCamera1",
        recording1,
        undefined,
        "rntRecording2"
      ).then(() => {
        cy.log("Add a user tag to theis recording");
        cy.testUserTagRecording(
          getCreds("rntRecording2").id,
          0,
          "rntGroupAdmin",
          "possum"
        ).then(() => {
          cy.log("Verify this recording not returned");
          cy.apiRecordingNeedsTagCheck(
            "rntNonMember",
            undefined,
            NO_SAVE_ID,
            []
          );
        });
      });
    });
  } else {
    it.skip("DISABLED: Does not return recordings not needing tagging");
  }

  //TODO: Isssue 100 - test fails, returns a recording with all 0's / blanks when no recording available
  //TODO: apiRecordingNeedsTagCheck has a workaround which needs removing when this is fixed
  if (Cypress.env("running_in_a_dev_environment") == true) {
    it("Can handle no returned matches", () => {
      cy.log("Verify non-member can view this recording");
      cy.apiRecordingNeedsTagCheck("rntNonMember", undefined, NO_SAVE_ID, []);
    });
  } else {
    it.skip("Can handle no returned matches", () => {});
  }

  //TODO: Issue 101 - returns only specified device, rather than preferring that device
  it.skip("Bias towards supplied deviceId works as expected", () => {
    let expectedRecording3: ApiRecordingNeedsTagReturned;
    let expectedRecording3b: ApiRecordingNeedsTagReturned;
    let expectedRecording4: ApiRecordingNeedsTagReturned;
    cy.log("Add a recording in group1");
    cy.apiRecordingAdd(
      "rntCamera1",
      recording1,
      undefined,
      "rntRecording3"
    ).then(() => {
      expectedRecording3 = TestCreateExpectedNeedsTagData(
        templateExpectedRecording,
        "rntRecording3",
        "rntCamera1",
        recording1
      );

      cy.apiRecordingAdd(
        "rntCamera1b",
        recording1,
        undefined,
        "rntRecording3b"
      ).then(() => {
        expectedRecording3b = TestCreateExpectedNeedsTagData(
          templateExpectedRecording,
          "rntRecording3b",
          "rntCamera1b",
          recording1
        );

        cy.apiRecordingAdd(
          "rntCamera2",
          recording1,
          undefined,
          "rntRecording4"
        ).then(() => {
          expectedRecording4 = TestCreateExpectedNeedsTagData(
            templateExpectedRecording,
            "rntRecording4",
            "rntCamera2",
            recording1
          );

          cy.log(
            "Request recording specifying preferred device, verify preferred is returned"
          );
          cy.apiRecordingNeedsTagCheck(
            "rntNonMember",
            "rntCamera1b",
            NO_SAVE_ID,
            [expectedRecording3b],
            [],
            HTTP_OK200,
            { doNotValidate: doNotValidate }
          );

          cy.log("Tag preferred recording");
          cy.testUserTagRecording(
            getCreds("rntRecording3b").id,
            0,
            "rntGroupAdmin",
            "possum"
          ).then(() => {
            cy.log(
              "Now check non-preferred device is returned now preferred has no untagged recordings"
            );
            cy.apiRecordingNeedsTagCheck(
              "rntNonMember",
              "rntCamera1b",
              NO_SAVE_ID,
              [expectedRecording3, expectedRecording4],
              [],
              HTTP_OK200,
              { doNotValidate: doNotValidate }
            );
          });
        });
      });
    });
  });

  //TODO: Iuuse 107 - No validation - bad device id just ignored
  it.skip("Invalid parameters handled correctly", () => {
    cy.log("Invalid device");
    cy.apiRecordingNeedsTagCheck(
      "rntNonMember",
      "999999",
      NO_SAVE_ID,
      [],
      [],
      HTTP_BadRequest,
      { useRawDeviceId: true }
    );
  });
});
