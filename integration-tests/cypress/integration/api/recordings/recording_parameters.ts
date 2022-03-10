/// <reference path="../../../support/index.d.ts" />
import {
  HTTP_BadRequest,
  HTTP_Forbidden,
  HTTP_OK200,
  HTTP_Unprocessable,
  EXCLUDE_IDS,
} from "@commands/constants";

import {
  ApiLocation,
  ApiRecordingSet,
  ApiThermalAdditionalMetadata,
} from "@commands/types";

import {
  TestCreateExpectedRecordingData,
  TestCreateRecordingData,
} from "@commands/api/recording-tests";
import { ApiThermalRecordingResponse } from "@typedefs/api/recording";
import {
  TEMPLATE_THERMAL_RECORDING,
  TEMPLATE_THERMAL_RECORDING_RESPONSE,
} from "@commands/dataTemplate";

describe("Recordings - parameter tests", () => {
  const templateExpectedRecording: ApiThermalRecordingResponse = JSON.parse(
    JSON.stringify(TEMPLATE_THERMAL_RECORDING_RESPONSE)
  );
  const templateRecording: ApiRecordingSet = JSON.parse(
    JSON.stringify(TEMPLATE_THERMAL_RECORDING)
  );

  before(() => {
    //Create group 1 with 2 devices, admin and member
    cy.testCreateUserGroupAndDevice("rpaGroupAdmin", "rpaGroup", "rpaCamera1");
    cy.apiDeviceAdd("rpaCamera1b", "rpaGroup");
    cy.apiUserAdd("rpaGroupMember");
    cy.apiGroupUserAdd("rpaGroupAdmin", "rpaGroupMember", "rpaGroup", true);

    //create a 2nd group with admin and device
    cy.testCreateUserGroupAndDevice(
      "rpaGroup2Admin",
      "rpaGroup2",
      "rpaCamera2"
    );
  });

  it("Can upload a thermal recording", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecording1: ApiThermalRecordingResponse;

    cy.log("Add recording as device");
    cy.apiRecordingAdd(
      "rpaCamera1",
      recording1,
      undefined,
      "rpaRecording1"
    ).then(() => {
      expectedRecording1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpaRecording1",
        "rpaCamera1",
        "rpaGroup",
        null,
        recording1
      );
      cy.log("Check recording can be viewed correctly");
      cy.apiRecordingCheck(
        "rpaGroupAdmin",
        "rpaRecording1",
        expectedRecording1,
        EXCLUDE_IDS
      );
    });

    cy.log("Delete recording");
    cy.apiRecordingDelete("rpaGroupAdmin", "rpaRecording1");

    cy.log("Check recording no longer exists");
    cy.apiRecordingCheck(
      "rpaGroupAdmin",
      "rpaRecording1",
      undefined,
      [],
      HTTP_Forbidden
    );
  });

  it.skip("Can upload recordings from 1 frame to 10 mins", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    recording1.duration = 1;
    let expectedRecording1: ApiThermalRecordingResponse;

    cy.log("Add 1sec recording as device");
    cy.apiRecordingAdd(
      "rpaCamera1",
      recording1,
      "oneframe.cptv",
      "rpaRecording2"
    ).then(() => {
      expectedRecording1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpaRecording2",
        "rpaCamera1",
        "rpaGroup",
        null,
        recording1
      );
      cy.apiRecordingCheck(
        "rpaGroupAdmin",
        "rpaRecording2",
        expectedRecording1,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rpaGroupAdmin", "rpaRecording2");
    });

    cy.log("Add 1sec recording as user by device");
    cy.apiRecordingAddOnBehalfUsingDevice(
      "rpaGroupAdmin",
      "rpaCamera1",
      recording1,
      "rpaRecording3",
      "oneframe.cptv"
    ).then(() => {
      expectedRecording1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpaRecording3",
        "rpaCamera1",
        "rpaGroup",
        null,
        recording1
      );
      cy.apiRecordingCheck(
        "rpaGroupAdmin",
        "rpaRecording3",
        expectedRecording1,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rpaGroupAdmin", "rpaRecording3");
    });

    cy.log("Add 1sec recording as user by group");
    cy.apiRecordingAddOnBehalfUsingGroup(
      "rpaGroupAdmin",
      "rpaCamera1",
      "rpaGroup",
      recording1,
      "raRecording4",
      "oneframe.cptv"
    ).then(() => {
      expectedRecording1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpaRecording4",
        "rpaCamera1",
        "rpaGroup",
        null,
        recording1
      );
      cy.apiRecordingCheck(
        "rpaGroupAdmin",
        "rpaRecording4",
        expectedRecording1,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rpaGroupAdmin", "rpaRecording4");
    });

    recording1.duration = 600;
    cy.log("Add 10min recording as device");
    cy.apiRecordingAdd(
      "rpaCamera1",
      recording1,
      "tenminutes.cptv",
      "rpaRecording5"
    ).then(() => {
      expectedRecording1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpaRecording5",
        "rpaCamera1",
        "rpaGroup",
        null,
        recording1
      );
      cy.apiRecordingCheck(
        "rpaGroupAdmin",
        "rpaRecording5",
        expectedRecording1,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rpaGroupAdmin", "rpaRecording5");
    });

    cy.log("Add 10min recording as user by device");
    cy.apiRecordingAddOnBehalfUsingDevice(
      "rpaGroupAdmin",
      "rpaCamera1",
      recording1,
      "raRecording6",
      "tenminutes.cptv"
    ).then(() => {
      expectedRecording1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpaRecording6",
        "rpaCamera1",
        "rpaGroup",
        null,
        recording1
      );
      cy.apiRecordingCheck(
        "rpaGroupAdmin",
        "rpaRecording6",
        expectedRecording1,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rpaGroupAdmin", "rpaRecording6");
    });

    cy.log("Add 10min recording as user by group");
    cy.apiRecordingAddOnBehalfUsingGroup(
      "rpaGroupAdmin",
      "rpaCamera1",
      "rpaGroup",
      recording1,
      "raRecording7",
      "tenminutes.cptv"
    ).then(() => {
      expectedRecording1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpaRecording7",
        "rpaCamera1",
        "rpaGroup",
        null,
        recording1
      );
      cy.apiRecordingCheck(
        "rpaGroupAdmin",
        "rpaRecording7",
        expectedRecording1,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rpaGroupAdmin", "rpaRecording7");
    });
  });

  it("Can read duration from file if not provided", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecording1: ApiThermalRecordingResponse;
    delete recording1.duration;
    cy.apiRecordingAdd(
      "rpaCamera1",
      recording1,
      "oneframe.cptv",
      "rpaRecording35"
    ).then(() => {
      expectedRecording1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpaRecording35",
        "rpaCamera1",
        "rpaGroup",
        null,
        recording1
      );
      expectedRecording1.duration = 0.555555555555556;
      cy.apiRecordingCheck(
        "rpaGroupAdmin",
        "rpaRecording35",
        expectedRecording1,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rpaGroupAdmin", "rpaRecording35");
    });
  });

  it("RecordingDateTime takes correct values", () => {
    //can specify recordingDateTime
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecording1: ApiThermalRecordingResponse;

    recording1.recordingDateTime = new Date().toISOString();
    cy.apiRecordingAdd(
      "rpaCamera1",
      recording1,
      "oneframe.cptv",
      "rpaRecording8"
    ).then(() => {
      expectedRecording1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpaRecording8",
        "rpaCamera1",
        "rpaGroup",
        null,
        recording1
      );
      expectedRecording1.recordingDateTime = recording1.recordingDateTime;
      cy.apiRecordingCheck(
        "rpaGroupAdmin",
        "rpaRecording8",
        expectedRecording1,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rpaGroupAdmin", "rpaRecording8");
    });

    //can have blank recordingDateTime
    const recording2 = TestCreateRecordingData(templateRecording);
    let expectedRecording2: ApiThermalRecordingResponse;
    recording2.recordingDateTime = null;
    cy.apiRecordingAdd(
      "rpaCamera1",
      recording2,
      "oneframe.cptv",
      "rpaRecording9"
    ).then(() => {
      expectedRecording2 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpaRecording9",
        "rpaCamera1",
        "rpaGroup",
        null,
        recording2
      );
      expectedRecording2.recordingDateTime = null;
      cy.apiRecordingCheck(
        "rpaGroupAdmin",
        "rpaRecording9",
        expectedRecording2,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rpaGroupAdmin", "rpaRecording9");
    });
  });
  it("Can read recordingDateTime from file if not provided", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecording1: ApiThermalRecordingResponse;

    delete recording1.recordingDateTime;
    cy.apiRecordingAdd(
      "rpaCamera1",
      recording1,
      "oneframe.cptv",
      "rpaRecording36"
    ).then(() => {
      expectedRecording1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpaRecording36",
        "rpaCamera1",
        "rpaGroup",
        null,
        recording1
      );
      expectedRecording1.recordingDateTime = "2021-03-18T17:36:46.555Z";
      cy.apiRecordingCheck(
        "rpaGroupAdmin",
        "rpaRecording36",
        expectedRecording1,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rpaGroupAdmin", "rpaRecording36");
    });
  });

  //TODO: Fails - issue 80
  it.skip("Invalid recordingDateTime handled correctly", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    recording1.recordingDateTime = "BadTimeValue";
    cy.apiRecordingAdd(
      "rpaCamera1",
      recording1,
      "oneframe.cptv",
      "rpaRecording10",
      HTTP_Unprocessable
    );
  });

  //TODO: issue 81.  Locations at following locations cause server error:
  //Grenwich meridian at equator (0 deg long, 0 deg lat)
  //North and south poles (+/-90 deg lat)
  //International date line (+/-180 deg)
  //Locations retunred inaccurately (rounded to 100m) - issue 82
  it.skip("Location parameters processed correctly", () => {
    //locations 0-180 degrees long and 0-89 lat accepted
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecording1: ApiThermalRecordingResponse;
    recording1.location = [89.0001, 179.0001];

    cy.apiRecordingAdd(
      "rpaCamera1",
      recording1,
      "oneframe.cptv",
      "rpaRecording11"
    ).then(() => {
      expectedRecording1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpaRecording11",
        "rpaCamera1",
        "rpaGroup",
        null,
        recording1
      );
      cy.apiRecordingCheck(
        "rpaGroupAdmin",
        "rpaRecording11",
        expectedRecording1,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rpaGroupAdmin", "rpaRecording11");
    });

    //TODO Fails: Issue 81.  Locations on south pole or international date line cause server error
    //locations 180 degrees long (international date line west)
    const recording2 = TestCreateRecordingData(templateRecording);
    let expectedRecording2: ApiThermalRecordingResponse;
    recording2.location = [89, 180];
    cy.apiRecordingAdd(
      "rpaCamera1",
      recording2,
      "oneframe.cptv",
      "rpaRecording12"
    ).then(() => {
      expectedRecording2 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpaRecording12",
        "rpaCamera1",
        "rpaGroup",
        null,
        recording2
      );
      cy.apiRecordingCheck(
        "rpaGroupAdmin",
        "rpaRecording12",
        expectedRecording2,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rpaGroupAdmin", "rpaRecording12");
    });

    //locations -179 to 0 degrees long and -89 to 0 lat accepted
    const recording3 = TestCreateRecordingData(templateRecording);
    let expectedRecording3: ApiThermalRecordingResponse;
    recording3.location = [-89, -179];
    cy.apiRecordingAdd(
      "rpaCamera1",
      recording3,
      "oneframe.cptv",
      "rpaRecording13"
    ).then(() => {
      expectedRecording3 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpaRecording13",
        "rpaCamera1",
        "rpaGroup",
        null,
        recording3
      );
      cy.apiRecordingCheck(
        "rpaGroupAdmin",
        "rpaRecording13",
        expectedRecording3,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rpaGroupAdmin", "rpaRecording13");
    });

    //locations 181 to 360 degrees long (equivalent to -0 to -180 deg long)
    const recording4 = TestCreateRecordingData(templateRecording);
    let expectedRecording4: ApiThermalRecordingResponse;
    recording4.location = [-89, 359];
    cy.apiRecordingAdd(
      "rpaCamera1",
      recording4,
      "oneframe.cptv",
      "rpaRecording14"
    ).then(() => {
      expectedRecording4 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpaRecording14",
        "rpaCamera1",
        "rpaGroup",
        null,
        recording4
      );
      cy.apiRecordingCheck(
        "rpaGroupAdmin",
        "rpaRecording14",
        expectedRecording4,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rpaGroupAdmin", "rpaRecording14");
    });

    //locations 360 degrees
    const recording5 = TestCreateRecordingData(templateRecording);
    let expectedRecording5: ApiThermalRecordingResponse;
    recording5.location = [90, 360];
    cy.apiRecordingAdd(
      "rpaCamera1",
      recording5,
      "oneframe.cptv",
      "rpaRecording15"
    ).then(() => {
      expectedRecording5 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpaRecording15",
        "rpaCamera1",
        "rpaGroup",
        null,
        recording5
      );
      cy.apiRecordingCheck(
        "rpaGroupAdmin",
        "rpaRecording15 ",
        expectedRecording5,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rpaGroupAdmin", "rpaRecording15");
    });

    //locations 0 degrees - equator on meridian
    const recording6 = TestCreateRecordingData(templateRecording);
    let expectedRecording6: ApiThermalRecordingResponse;
    recording6.location = { type: "Point", coordinates: [0, 0] };
    cy.apiRecordingAdd(
      "rpaCamera1",
      recording6,
      "oneframe.cptv",
      "rpaRecording16"
    ).then(() => {
      expectedRecording6 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpaRecording16",
        "rpaCamera1",
        "rpaGroup",
        null,
        recording6
      );
      cy.apiRecordingCheck(
        "rpaGroupAdmin",
        "rpaRecording16 ",
        expectedRecording6,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rpaGroupAdmin", "rpaRecording16");
    });

    //locations -180 degrees international date line east
    const recording7 = TestCreateRecordingData(templateRecording);
    let expectedRecording7: ApiThermalRecordingResponse;
    recording7.location = [-89, -180];
    cy.apiRecordingAdd(
      "rpaCamera1",
      recording7,
      "oneframe.cptv",
      "rpaRecording17"
    ).then(() => {
      expectedRecording7 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpaRecording17",
        "rpaCamera1",
        "rpaGroup",
        null,
        recording7
      );
      cy.apiRecordingCheck(
        "rpaGroupAdmin",
        "rpaRecording17",
        expectedRecording7,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rpaGroupAdmin", "rpaRecording17");
    });
  });

  //TODO: Issue 81.  Bad locations cause server error (not caught with error code)
  it.skip("Invalid locations handled correctly", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    recording1.location = [-91, 20];
    cy.apiRecordingAdd(
      "rpaCamera1",
      recording1,
      "oneframe.cptv",
      "rpaRecording18",
      HTTP_Unprocessable
    );

    const recording2 = TestCreateRecordingData(templateRecording);
    recording2.location = [-20, 361];
    cy.apiRecordingAdd(
      "rpaCamera2",
      recording2,
      "oneframe.cptv",
      "rpaRecording19",
      HTTP_Unprocessable
    );

    const recording3 = TestCreateRecordingData(templateRecording);
    recording3.location = "NotAValidValue" as unknown as ApiLocation;
    cy.apiRecordingAdd(
      "rpaCamera3",
      recording3,
      "oneframe.cptv",
      "rpaRecording20",
      HTTP_Unprocessable
    );
  });

  it("Version handled correctly", () => {
    //can specify version
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecording1: ApiThermalRecordingResponse;

    recording1.version = "A valid version string";
    cy.apiRecordingAdd(
      "rpaCamera1",
      recording1,
      "oneframe.cptv",
      "rpaRecording21"
    ).then(() => {
      expectedRecording1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpaRecording21",
        "rpaCamera1",
        "rpaGroup",
        null,
        recording1
      );
      // NOTE: Version seems to only ever be set for audio recordings, so doesn't
      //  really apply here
      delete (expectedRecording1 as any).version;
      cy.apiRecordingCheck(
        "rpaGroupAdmin",
        "rpaRecording21",
        expectedRecording1,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rpaGroupAdmin", "rpaRecording21");
    });

    //blank version
    const recording2 = TestCreateRecordingData(templateRecording);
    let expectedRecording2: ApiThermalRecordingResponse;

    delete recording2.version;
    cy.apiRecordingAdd(
      "rpaCamera1",
      recording2,
      "oneframe.cptv",
      "rpaRecording22"
    ).then(() => {
      expectedRecording2 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpaRecording22",
        "rpaCamera1",
        "rpaGroup",
        null,
        recording2
      );
      cy.apiRecordingCheck(
        "rpaGroupAdmin",
        "rpaRecording22",
        expectedRecording2,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rpaGroupAdmin", "rpaRecording22");
    });

    //no version
    const recording3 = TestCreateRecordingData(templateRecording);
    let expectedRecording3: ApiThermalRecordingResponse;

    delete recording3.version;
    cy.apiRecordingAdd(
      "rpaCamera1",
      recording3,
      "oneframe.cptv",
      "rpaRecording23"
    ).then(() => {
      expectedRecording3 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpaRecording23",
        "rpaCamera1",
        "rpaGroup",
        null,
        recording3
      );
      cy.apiRecordingCheck(
        "rpaGroupAdmin",
        "rpaRecording23",
        expectedRecording3,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rpaGroupAdmin", "rpaRecording23");
    });
  });

  it("Comments handled correctly", () => {
    //can specify comments
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecording1: ApiThermalRecordingResponse;

    recording1.comment = "A valid comment string";
    cy.apiRecordingAdd(
      "rpaCamera1",
      recording1,
      "oneframe.cptv",
      "rpaRecording24"
    ).then(() => {
      expectedRecording1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpaRecording24",
        "rpaCamera1",
        "rpaGroup",
        null,
        recording1
      );
      cy.apiRecordingCheck(
        "rpaGroupAdmin",
        "rpaRecording24",
        expectedRecording1,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rpaGroupAdmin", "rpaRecording24");
    });

    //blank comments
    const recording2 = TestCreateRecordingData(templateRecording);
    let expectedRecording2: ApiThermalRecordingResponse;

    recording2.comment = null;
    cy.apiRecordingAdd(
      "rpaCamera1",
      recording2,
      "oneframe.cptv",
      "rpaRecording25"
    ).then(() => {
      expectedRecording2 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpaRecording25",
        "rpaCamera1",
        "rpaGroup",
        null,
        recording2
      );
      delete expectedRecording2.comment;
      cy.apiRecordingCheck(
        "rpaGroupAdmin",
        "rpaRecording25",
        expectedRecording2,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rpaGroupAdmin", "rpaRecording25");
    });

    //no comment (optional)
    const recording3 = TestCreateRecordingData(templateRecording);
    let expectedRecording3: ApiThermalRecordingResponse;

    delete recording3.comment;
    cy.apiRecordingAdd(
      "rpaCamera1",
      recording3,
      "oneframe.cptv",
      "rpaRecording26"
    ).then(() => {
      expectedRecording3 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpaRecording26",
        "rpaCamera1",
        "rpaGroup",
        null,
        recording3
      );
      delete expectedRecording3.comment;
      cy.apiRecordingCheck(
        "rpaGroupAdmin",
        "rpaRecording26",
        expectedRecording3,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rpaGroupAdmin", "rpaRecording26");
    });
  });

  it("File hash accepted correctly", () => {
    cy.log("Correct file hash accepted");
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecording1: ApiThermalRecordingResponse;
    recording1.fileHash = "0add9e2337d1c6df3e6a52e797e6b995e433f0f0"; //shasum output for oneframe.cptv
    cy.apiRecordingAdd(
      "rpaCamera1",
      recording1,
      "oneframe.cptv",
      "rpaRecording27"
    ).then(() => {
      expectedRecording1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpaRecording27",
        "rpaCamera1",
        "rpaGroup",
        null,
        recording1
      );
      cy.apiRecordingCheck(
        "rpaGroupAdmin",
        "rpaRecording27",
        expectedRecording1,
        EXCLUDE_IDS
      );

      cy.log("Check that duplicate uploads for the same device are rejected");
      cy.apiRecordingAdd(
        "rpaCamera1",
        recording1,
        "oneframe.cptv",
        "rpaRecording27",
        HTTP_OK200,
        { message: "Duplicate recording found for device" }
      );

      cy.apiRecordingDelete("rpaGroupAdmin", "rpaRecording27");
    });

    cy.log("Incorrect file hash rejected");
    const recording2 = TestCreateRecordingData(templateRecording);

    recording2.fileHash = "1111111111111111111111111111111111111111"; //invalid shasum
    cy.apiRecordingAdd(
      "rpaCamera1",
      recording2,
      "oneframe.cptv",
      "rpaRecording28",
      HTTP_BadRequest,
      { message: "Uploaded file integrity check failed, please retry." }
    );

    cy.log("Blank hash accepted");
    const recording3 = TestCreateRecordingData(templateRecording);
    let expectedRecording3: ApiThermalRecordingResponse;

    recording3.fileHash = null;
    cy.apiRecordingAdd(
      "rpaCamera1",
      recording3,
      "oneframe.cptv",
      "rpaRecording29"
    ).then(() => {
      expectedRecording3 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpaRecording29",
        "rpaCamera1",
        "rpaGroup",
        null,
        recording3
      );
      cy.apiRecordingCheck(
        "rpaGroupAdmin",
        "rpaRecording29",
        expectedRecording3,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rpaGroupAdmin", "rpaRecording29");
    });

    cy.log("No hash accepted");
    const recording4 = TestCreateRecordingData(templateRecording);
    let expectedRecording4: ApiThermalRecordingResponse;

    recording4.fileHash = null;
    cy.apiRecordingAdd(
      "rpaCamera1",
      recording4,
      "oneframe.cptv",
      "rpaRecording30"
    ).then(() => {
      expectedRecording4 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpaRecording30",
        "rpaCamera1",
        "rpaGroup",
        null,
        recording4
      );
      cy.apiRecordingCheck(
        "rpaGroupAdmin",
        "rpaRecording30",
        expectedRecording4,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rpaGroupAdmin", "rpaRecording30");
    });
  });

  it("Additional metadata handled correctly", () => {
    cy.log("Any data accepted in additonalMetadata");
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecording1: ApiThermalRecordingResponse;

    recording1.additionalMetadata = {
      ...recording1.additionalMetadata,
      ICanSetAnyKey: "ToAnyValue",
    } as unknown as ApiThermalAdditionalMetadata;
    cy.apiRecordingAdd(
      "rpaCamera1",
      recording1,
      "oneframe.cptv",
      "rpaRecording31"
    ).then(() => {
      expectedRecording1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpaRecording31",
        "rpaCamera1",
        "rpaGroup",
        null,
        recording1
      );
      cy.apiRecordingCheck(
        "rpaGroupAdmin",
        "rpaRecording31",
        expectedRecording1,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rpaGroupAdmin", "rpaRecording31");
    });

    cy.log("Can handle lot of additionalMetadata");
    const recording2 = TestCreateRecordingData(templateRecording);
    let expectedRecording2: ApiThermalRecordingResponse;

    for (let count = 1; count < 200; count++) {
      recording2.additionalMetadata["key" + count.toString()] =
        "value" + count.toString();
    }
    cy.apiRecordingAdd(
      "rpaCamera1",
      recording2,
      "oneframe.cptv",
      "rpaRecording32"
    ).then(() => {
      expectedRecording2 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpaRecording32",
        "rpaCamera1",
        "rpaGroup",
        null,
        recording2
      );
      cy.apiRecordingCheck(
        "rpaGroupAdmin",
        "rpaRecording32",
        expectedRecording2,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rpaGroupAdmin", "rpaRecording32");
    });

    cy.log("Can handle empty additionalMetadata");
    const recording3 = TestCreateRecordingData(templateRecording);
    let expectedRecording3: ApiThermalRecordingResponse;

    recording3.additionalMetadata = {};
    cy.apiRecordingAdd(
      "rpaCamera1",
      recording3,
      "oneframe.cptv",
      "rpaRecording33"
    ).then(() => {
      expectedRecording3 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpaRecording33",
        "rpaCamera1",
        "rpaGroup",
        null,
        recording3
      );
      cy.apiRecordingCheck(
        "rpaGroupAdmin",
        "rpaRecording33",
        expectedRecording3,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rpaGroupAdmin", "rpaRecording33");
    });

    cy.log(
      "Can handle missing additionalMetadata (optional) extracts it from cptv file if not provided"
    );
    const recording4 = TestCreateRecordingData(templateRecording);
    let expectedRecording4: ApiThermalRecordingResponse;

    delete recording4.additionalMetadata;
    cy.apiRecordingAdd(
      "rpaCamera1",
      recording4,
      "oneframe.cptv",
      "rpaRecording34"
    ).then(() => {
      expectedRecording4 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rpaRecording34",
        "rpaCamera1",
        "rpaGroup",
        null,
        recording4
      );
      expectedRecording4.additionalMetadata = {
        previewSecs: 5,
        totalFrames: 5,
      };
      cy.apiRecordingCheck(
        "rpaGroupAdmin",
        "rpaRecording34",
        expectedRecording4,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rpaGroupAdmin", "rpaRecording34");
    });
  });

  //Note: Processing state tested in processing test suite
});
