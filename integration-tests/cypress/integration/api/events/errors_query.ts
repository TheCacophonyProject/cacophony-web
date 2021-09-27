/// <reference path="../../../support/index.d.ts" />

import { getTestName } from "../../../commands/names";
import { HTTP_Unprocessable } from "../../../commands/constants";
import {
  ApiEventErrorSimilar,
  ApiEventError,
  ApiEventErrorCategory,
} from "../../../commands/types";

//
// This test set checks for errors reported against device services
// It checks the correct reporting, but NOT THE CORRECT categorisation of errors
// TODO: consider adding tests for the classification and pattern matching of errors
//
//


describe("Events - query errors", () => {
  const ADMIN = true;
  const NOT_ADMIN = false;
  const DEVICE_NOT_SPECIFIED = undefined;
  const DEFINED = []; // will verify that 'patterns' is present (undefined will verify that it is absent)

  let expectedSimilar1: ApiEventErrorSimilar;
  let expectedSimilar2: ApiEventErrorSimilar;
  let expectedSimilar3: ApiEventErrorSimilar;
  let expectedSimilar4: ApiEventErrorSimilar;
  let expectedSimilar5: ApiEventErrorSimilar;

  //  let expectedError1: ApiEventError;
  let expectedError1and2: ApiEventError;
  let expectedError1and2and4: ApiEventError;
  let expectedError1and2and4and5: ApiEventError;
  let expectedError2: ApiEventError;
  let expectedError2and4: ApiEventError;
  let expectedError3: ApiEventError;
  let expectedError4: ApiEventError;
  let expectedError5: ApiEventError;

  //  let expectedCategoryError1: ApiEventErrorCategory;
  let expectedCategoryError1and2: ApiEventErrorCategory;
  let expectedCategoryError1and2and4: ApiEventErrorCategory;
  let expectedCategoryError1and2and4and5: ApiEventErrorCategory;
  let expectedCategoryError2: ApiEventErrorCategory;
  let expectedCategoryError2and4: ApiEventErrorCategory;
  let expectedCategoryError3: ApiEventErrorCategory;
  let expectedCategoryError4: ApiEventErrorCategory;
  let expectedCategoryError5: ApiEventErrorCategory;

  const time1 = "2018-01-01T07:22:56.000Z";
  const time2 = "2018-01-02T07:22:56.000Z";
  const time3 = "2018-01-03T07:22:56.000Z";
  const time4 = "2018-01-04T07:22:56.000Z";
  const time5 = "2018-01-05T07:22:56.000Z";
  const time6 = "2018-01-06T07:22:56.000Z";
  const errorDetails1 = {
    logs: [
      "Started FLIR Lepton 3 Interface Daemon.",
      "version: 2.13.0",
      "SPI speed: 20000000",
      "power pin: GPIO23",
      "frame output: /var/run/lepton-frames",
      "dialing frame output socket",
      "host initialisation",
      "uninstalling spi driver",
      "turning camera power off",
      "turning camera power on",
      "waiting for camera startup",
      "camera should be ready",
      "installing spi driver",
      "host reinitialisation",
      "enabling radiometry",
      "opening camera",
      "spireg: no port found; did you forget to call Init.skip()?",
      "leptond.service: Main process exited, code=exited, status=1/FAILURE",
      "leptond.service: Unit entered failed state.",
      "leptond.service: Failed with result 'exit-code'.",
    ],
    version: 1,
    unitName: "leptond.service",
    activeState: "activating",
  };
  const errorDetails2 = {
    logs: [
      "host initialisation",
      "uninstalling spi driver",
      "turning camera power off",
      "turning camera power on",
      "waiting for camera startup",
      "camera should be ready",
      "installing spi driver",
      "host reinitialisation",
      "enabling radiometry",
      "opening camera",
      "reading frames",
      "resync! first bit set on header",
      "resync! out of order segment",
      "resync! first bit set on header",
      "resync! invalid packet number",
      "resync! out of order segment",
      "write unix @->/var/run/lepton-frames: write: broken pipe",
      "leptond.service: Main process exited, code=exited, status=1/FAILURE",
      "leptond.service: Unit entered failed state.",
      "leptond.service: Failed with result 'exit-code'.",
    ],
    version: 1,
    unitName: "leptond.service",
    activeState: "activating",
  };
  const errorDetails3 = {
    logs: [
      "Started Cacophony Project Thermal Video uploader.",
      "running version: 2.2.0",
      "requesting internet connection",
      "internet connection made",
      "Post https://api.cacophony.org.nz/authenticate_device: unexpected EOF",
      "thermal-uploader.service: Main process exited, code=exited, status=1/FAILURE",
      "thermal-uploader.service: Unit entered failed state.",
      "thermal-uploader.service: Failed with result 'exit-code'.",
    ],
    version: 1,
    unitName: "thermal-uploader.service",
    activeState: "activating",
  };
  const errorDetails4 = {
    logs: [
      "host initialisation",
      "uninstalling spi driver",
      "turning camera power off",
      "turning camera power on",
      "waiting for camera startup",
      "camera should be ready",
      "installing spi driver",
      "host reinitialisation",
      "enabling radiometry",
      "opening camera",
      "reading frames",
      "resync! first bit set on header",
      "resync! out of order segment",
      "resync! first bit set on header",
      "resync! invalid packet number",
      "resync! out of order segment",
      "write unix @->/var/run/lepton-frames: write: broken pipe",
      "leptond.service: Main process exited, code=exited, status=1/FAILURE",
      "leptond.service: Unit entered failed state.",
      "leptond.service: Failed with result 'exit-code'.",
    ],
    version: 1,
    unitName: "leptond.service",
    activeState: "activating",
  };

  const eventDetails1 = { type: "systemError", details: errorDetails1 };
  const eventDetails2 = { type: "systemError", details: errorDetails2 };
  const eventDetails3 = { type: "systemError", details: errorDetails3 };
  const eventDetails4 = { type: "systemError", details: errorDetails4 };

  before(() => {
    // group with 2 devices, admin and member users
    cy.testCreateUserGroupAndDevice("erGroupAdmin", "erGroup", "erCamera");
    cy.apiUserAdd("erGroupMember");
    cy.apiGroupUserAdd("erGroupAdmin", "erGroupMember", "erGroup", NOT_ADMIN);
    cy.apiDeviceAdd("erOtherCamera", "erGroup");

    //admin and member for single device
    cy.apiUserAdd("erDeviceAdmin");
    cy.apiUserAdd("erDeviceMember");
    cy.apiDeviceUserAdd("erGroupAdmin", "erDeviceAdmin", "erCamera", ADMIN);
    cy.apiDeviceUserAdd(
      "erGroupAdmin",
      "erDeviceMember",
      "erCamera",
      NOT_ADMIN
    );

    //another group and device
    cy.testCreateUserGroupAndDevice(
      "erOtherGroupAdmin",
      "erOherGroup",
      "erOtherGroupCamera"
    );

    //Create some errors to reuse / query
    cy.apiEventsDeviceAddOnBehalf("erGroupAdmin", "erCamera", eventDetails1, [
      time1,
    ]);
    cy.apiEventsDeviceAddOnBehalf("erGroupAdmin", "erCamera", eventDetails2, [
      time2,
    ]);
    cy.apiEventsDeviceAddOnBehalf("erGroupAdmin", "erCamera", eventDetails3, [
      time3,
    ]);
    cy.apiEventsDeviceAddOnBehalf("erGroupAdmin", "erCamera", eventDetails4, [
      time4,
    ]);
    cy.apiEventsDeviceAddOnBehalf(
      "erGroupAdmin",
      "erOtherCamera",
      eventDetails1,
      [time5]
    );
    cy.apiEventsDeviceAddOnBehalf(
      "erOtherGroupAdmin",
      "erOtherGroupCamera",
      eventDetails2,
      [time6]
    );

    //Define the expected 'similar' field in the report for the above errors
    expectedSimilar1 = {
      device: getTestName("erCamera"),
      timestamp: time1,
      lines: errorDetails1.logs,
    };
    expectedSimilar2 = {
      device: getTestName("erCamera"),
      timestamp: time2,
      lines: errorDetails2.logs,
    };
    expectedSimilar3 = {
      device: getTestName("erCamera"),
      timestamp: time3,
      lines: errorDetails3.logs,
    };
    expectedSimilar4 = {
      device: getTestName("erCamera"),
      timestamp: time4,
      lines: errorDetails4.logs,
    };
    expectedSimilar5 = {
      device: getTestName("erOtherCamera"),
      timestamp: time5,
      lines: errorDetails1.logs,
    };
  });

  //Define the expected errors - once the device and event creation has completed
  before(() => {
    //    expectedError1 = {
    //      devices: [getTestName("erCamera")],
    //      patterns: undefined,
    //      similar: [expectedSimilar1],
    //      timestamps: [time1],
    //    };
    expectedError2 = {
      devices: [getTestName("erCamera")],
      patterns: undefined,
      similar: [expectedSimilar2],
      timestamps: [time2],
    };
    expectedError3 = {
      devices: [getTestName("erCamera")],
      patterns: undefined,
      similar: [expectedSimilar3],
      timestamps: [time3],
    };
    expectedError4 = {
      devices: [getTestName("erCamera")],
      patterns: undefined,
      similar: [expectedSimilar4],
      timestamps: [time4],
    };
    expectedError5 = {
      devices: [getTestName("erOtherCamera")],
      patterns: undefined,
      similar: [expectedSimilar5],
      timestamps: [time5],
    };
    expectedError1and2 = {
      devices: [getTestName("erCamera")],
      patterns: DEFINED,
      similar: [expectedSimilar1, expectedSimilar2],
      timestamps: [time1, time2],
    };
    expectedError1and2and4 = {
      devices: [getTestName("erCamera")],
      patterns: DEFINED,
      similar: [expectedSimilar1, expectedSimilar2, expectedSimilar4],
      timestamps: [time1, time2, time4],
    };
    expectedError1and2and4and5 = {
      devices: [getTestName("erCamera"), getTestName("erOtherCamera")],
      patterns: DEFINED,
      similar: [
        expectedSimilar1,
        expectedSimilar2,
        expectedSimilar4,
        expectedSimilar5,
      ],
      timestamps: [time1, time2, time4, time5],
    };
    expectedError2and4 = {
      devices: [getTestName("erCamera")],
      patterns: undefined,
      similar: [expectedSimilar2, expectedSimilar4],
      timestamps: [time2, time4],
    };

    //    expectedCategoryError1 = {
    //      name: "leptond.service",
    //      devices: [getTestName("erCamera")],
    //      errors: [expectedError1],
    //    };
    expectedCategoryError2 = {
      name: "leptond.service",
      devices: [getTestName("erCamera")],
      errors: [expectedError2],
    };
    expectedCategoryError3 = {
      name: "thermal-uploader.service",
      devices: [getTestName("erCamera")],
      errors: [expectedError3],
    };
    expectedCategoryError4 = {
      name: "leptond.service",
      devices: [getTestName("erCamera")],
      errors: [expectedError4],
    };
    expectedCategoryError5 = {
      name: "leptond.service",
      devices: [getTestName("erOtherCamera")],
      errors: [expectedError5],
    };
    expectedCategoryError1and2 = {
      name: "leptond.service",
      devices: [getTestName("erCamera")],
      errors: [expectedError1and2],
    };
    expectedCategoryError1and2and4 = {
      name: "leptond.service",
      devices: [getTestName("erCamera")],
      errors: [expectedError1and2and4],
    };
    expectedCategoryError1and2and4and5 = {
      name: "leptond.service",
      devices: [getTestName("erCamera"), getTestName("erOtherCamera")],
      errors: [expectedError1and2and4and5],
    };
    expectedCategoryError2and4 = {
      name: "leptond.service",
      devices: [getTestName("erCamera")],
      errors: [expectedError2and4],
    };
  });

  it("Group admin and member can view all errors on all devices their group", () => {
    //check errors as both admin and member user types - see all errors in our group - 1,2,3,4,5
    cy.apiEventsErrorsCheck("erGroupAdmin", DEVICE_NOT_SPECIFIED, {}, [
      expectedCategoryError1and2and4and5,
      expectedCategoryError3,
    ]);
    cy.apiEventsErrorsCheck("erGroupMember", DEVICE_NOT_SPECIFIED, {}, [
      expectedCategoryError1and2and4and5,
      expectedCategoryError3,
    ]);
  });

  it("Device admin and member can view events only on their devices", () => {
    //check errors as both device admin and device member users, see all errors on our device - 1,2,3,4
    cy.apiEventsErrorsCheck("erDeviceAdmin", DEVICE_NOT_SPECIFIED, {}, [
      expectedCategoryError1and2and4,
      expectedCategoryError3,
    ]);
    cy.apiEventsErrorsCheck("erDeviceMember", DEVICE_NOT_SPECIFIED, {}, [
      expectedCategoryError1and2and4,
      expectedCategoryError3,
    ]);
  });

  it("Group admin can only request events by deviceId from within their group", () => {
    //Check error one device at a time - specifying device
    //erCamera has errors 1,2,3,4
    cy.log("Can check errors on cameras in our group");
    cy.apiEventsErrorsCheck("erGroupAdmin", "erCamera", {}, [
      expectedCategoryError1and2and4,
      expectedCategoryError3,
    ]);
    //erOtherCamera has error 5
    cy.apiEventsErrorsCheck("erGroupAdmin", "erOtherCamera", {}, [
      expectedCategoryError5,
    ]);
    cy.log("Cannot check errors on camera not in our group");
    cy.apiEventsErrorsCheck("erGroupAdmin", "erOtherGroupCamera", {}, []);
  });

  it("Device admin can only request events by deviceId from within their device", () => {
    //check errors one device at a time, specifying device
    //erCamera has errors 1,2,3,4
    cy.log("Can check errors on cameras in our group");
    cy.apiEventsErrorsCheck("erDeviceAdmin", "erCamera", {}, [
      expectedCategoryError1and2and4,
      expectedCategoryError3,
    ]);

    cy.log("Cannot check errors on camera not assigned to us");
    cy.apiEventsErrorsCheck("erDeviceAdmin", "erOtherCamera", {}, []);
    cy.apiEventsErrorsCheck("erDeviceAdmin", "erOtherGroupCamera", {}, []);
  });

  //TODO: time filtering not working (issue 71).
  it.skip("Verify time filtering works correctly", () => {
    //Test for query errors >= time 2
    cy.log("start time = time2 returns errors at times 2,3,4");
    cy.apiEventsErrorsCheck("erGroupAdmin", "erCamera", { startTime: time2 }, [
      expectedCategoryError2and4,
      expectedCategoryError3,
    ]);

    //Test for query errors < time 3
    cy.log("end time = time3 returns errors at times 1,2 but not 3");
    cy.apiEventsErrorsCheck("erGroupAdmin", "erCamera", { endTime: time2 }, [
      expectedCategoryError1and2,
    ]);

    //Test for query errors >= time 2 and < time 3
    cy.log(
      "start time = time 2, end time = time3 returns errors at time 2 only"
    );
    cy.apiEventsErrorsCheck(
      "erGroupAdmin",
      "erCamera",
      { startTime: time2, endTime: time3 },
      [expectedCategoryError2]
    );

    //Test for 0-length time period (returns noting)
    cy.log("Time range start=end returns empty as must be < end");
    cy.apiEventsErrorsCheck(
      "erGroupAdmin",
      "erCamera",
      { startTime: time2, endTime: time2 },
      []
    );
  });

  it("Verify incorrect time values handled correctly", () => {
    cy.apiEventsErrorsCheck(
      "erGroupAdmin",
      DEVICE_NOT_SPECIFIED,
      { startTime: "" },
      [],
      [],
      HTTP_Unprocessable
    );
    cy.apiEventsErrorsCheck(
      "erGroupAdmin",
      DEVICE_NOT_SPECIFIED,
      { endTime: "" },
      [],
      [],
      HTTP_Unprocessable
    );
    cy.apiEventsErrorsCheck(
      "erGroupAdmin",
      DEVICE_NOT_SPECIFIED,
      { startTime: "not a timestamp" },
      [],
      [],
      HTTP_Unprocessable
    );
    cy.apiEventsErrorsCheck(
      "erGroupAdmin",
      DEVICE_NOT_SPECIFIED,
      { endTime: "not a timestamp" },
      [],
      [],
      HTTP_Unprocessable
    );
  });

  it("Verify limit and offset paging works correctly", () => {
    //Test with just length parameter
    cy.log(
      "Specify just length returns 1st page of specified length (errors at times 1,2)"
    );
    //Check expected errors reported
    cy.apiEventsErrorsCheck("erGroupAdmin", "erCamera", { limit: 2 }, [
      expectedCategoryError1and2,
    ]);

    //Test with offset=0
    cy.log(
      "Offset of 0 returns 1st page of specified length (errors at times 1,2)"
    );
    cy.apiEventsErrorsCheck(
      "erGroupAdmin",
      "erCamera",
      { offest: 0, limit: 2 },
      [expectedCategoryError1and2]
    );

    //Test with offset = length
    cy.log("Offset of [limit] returns 2nd page (errors at times 3,4)");
    //Check expected errors reported
    cy.apiEventsErrorsCheck(
      "erGroupAdmin",
      "erCamera",
      { offset: 2, limit: 2 },
      [expectedCategoryError3, expectedCategoryError4]
    );

    //Test with offset > data length
    cy.log("offset beyond data returns empty");
    cy.apiEventsErrorsCheck(
      "erGroupAdmin",
      "erCamera",
      { offset: 4, limit: 2 },
      []
    );

    //Test with offset not a multiple of length
    cy.log(
      "Arbitrary offset unrelated to page length works (offset 1, lemgth 2 retruns errors at times 2,3)"
    );
    cy.apiEventsErrorsCheck(
      "erGroupAdmin",
      "erCamera",
      { offset: 1, limit: 2 },
      [expectedCategoryError2, expectedCategoryError3]
    );
  });

  it("Verify bad values for limit and offset handled correctly", () => {
    //invalid values for limit
    cy.log("Invalid limits");
    cy.apiEventsErrorsCheck(
      "erGroupAdmin",
      DEVICE_NOT_SPECIFIED,
      { limit: "" },
      [],
      [],
      HTTP_Unprocessable
    );
    cy.apiEventsErrorsCheck(
      "erGroupAdmin",
      DEVICE_NOT_SPECIFIED,
      { limit: "a" },
      [],
      [],
      HTTP_Unprocessable
    );
    //TODO: Issue 68 - -ve values cause server error - disabling until fixed
    // cy.apiEventsErrorsCheck("erGroupAdmin",DEVICE_NOT_SPECIFIED,{limit: -1}, [],[],HTTP_Unprocessable);

    //invalid values for offset
    cy.log("Invalid offsets");
    cy.apiEventsErrorsCheck(
      "erGroupAdmin",
      DEVICE_NOT_SPECIFIED,
      { limit: 1, offset: "" },
      [],
      [],
      HTTP_Unprocessable
    );
    cy.apiEventsErrorsCheck(
      "erGroupAdmin",
      DEVICE_NOT_SPECIFIED,
      { limit: 1, offset: "a" },
      [],
      [],
      HTTP_Unprocessable
    );
    //TODO: Issue 68 - -ve values cause server error - disabling until fixed
    //cy.apiEventsErrorsCheck("erGroupAdmin",DEVICE_NOT_SPECIFIED,{limit: 1, offset: -1}, [],[],HTTP_Unprocessable);

    //TODO: A test for default would be good ... but too time consuming for here.  Add to performance tests?
  });
});
