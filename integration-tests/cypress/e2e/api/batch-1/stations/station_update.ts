import { ApiStationResponse } from "@typedefs/api/station";
import { getCreds } from "@commands/server";
import { getTestName } from "@commands/names";
import { NOT_NULL, NOT_NULL_STRING } from "@commands/constants";
import {
  TestCreateStationData,
  TestCreateExpectedStation,
  TestCreateExpectedAutomaticStation,
  TestGetLocation,
} from "@commands/api/station";

import { ApiStationData } from "@commands/types";
import { HttpStatusCode } from "@typedefs/api/consts";

describe("Stations: updating", () => {
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
    cy.testCreateUserGroupAndDevice("stuAdmin", "stuGroup", "stuCamera1").then(
      () => {
        TemplateExpectedStation.groupId = getCreds("stuGroup").id;
        TemplateExpectedStation.groupName = getTestName("stuGroup");
        TemplateExpectedStation.name = getTestName("stuStation1");
      }
    );

    // second group and device
    cy.apiGroupAdd("stuAdmin", "stuGroup2");
    cy.apiDeviceAdd("stuCamera2", "stuGroup2");
  });

  it("Can update a station with new unique name", () => {
    const station1 = TestCreateStationData("stuStation", 1);

    const station2: ApiStationData = {
      name: "stuUpdateStation1",
    } as unknown as ApiStationData;
    const expectedStation2 = TestCreateExpectedStation(
      TemplateExpectedStation,
      "stuUpdateStation",
      1
    );

    cy.log("Adding station");
    cy.apiGroupStationAdd("stuAdmin", "stuGroup", station1);

    cy.log("Updating name");
    cy.apiStationUpdate("stuAdmin", "stuStation1", station2);

    cy.log("Check station updated correctly");
    cy.apiGroupStationCheck(
      "stuAdmin",
      "stuGroup",
      "stuUpdateStation1",
      expectedStation2
    );

    cy.log("Check old station name no longer present");
    cy.apiGroupStationCheck(
      "stuAdmin",
      "stuGroup",
      "stuStation1",
      undefined,
      undefined,
      HttpStatusCode.Forbidden
    );
  });

  it("Can update a station with new unique location", () => {
    const station1 = TestCreateStationData("stuStation", 2);

    const station2 = { lat: -47, lng: 177 } as unknown as ApiStationData;
    const expectedStation2 = TestCreateExpectedStation(
      TemplateExpectedStation,
      "stuStation",
      2
    );
    expectedStation2.location = { lat: -47, lng: 177 };

    cy.log("Adding station");
    cy.apiGroupStationAdd("stuAdmin", "stuGroup", station1);

    cy.log("Updating location");
    cy.apiStationUpdate("stuAdmin", "stuStation2", station2);

    cy.log("Check station updated correctly");
    cy.apiGroupStationCheck(
      "stuAdmin",
      "stuGroup",
      "stuStation2",
      expectedStation2
    );
  });

  it("Can update a station with both name and new unique location", () => {
    const station1 = TestCreateStationData("stuStation", 3);

    const station2 = TestCreateStationData("stuUpdateStation", 4);
    const expectedStation2 = TestCreateExpectedStation(
      TemplateExpectedStation,
      "stuUpdateStation",
      4
    );

    cy.log("Adding station");
    cy.apiGroupStationAdd("stuAdmin", "stuGroup", station1);

    cy.log("Updating location");
    cy.apiStationUpdate("stuAdmin", "stuStation3", station2);

    cy.log("Check station updated correctly");
    cy.apiGroupStationCheck(
      "stuAdmin",
      "stuGroup",
      "stuUpdateStation4",
      expectedStation2
    );

    cy.log("Check old station name no longer present");
    cy.apiGroupStationCheck(
      "stuAdmin",
      "stuGroup",
      "stuStation3",
      undefined,
      undefined,
      HttpStatusCode.Forbidden
    );
  });

  it("Cannot update a station to have duplicate name in same group", () => {
    const station1 = TestCreateStationData("stuStation", 5);
    const station2 = TestCreateStationData("stuStation", 6);
    const stationWithSameName = TestCreateStationData("stuStation", 6);
    stationWithSameName.name = "stuStation5";

    cy.log("Adding station1");
    cy.apiGroupStationAdd("stuAdmin", "stuGroup", station1);

    cy.log("Adding station1");
    cy.apiGroupStationAdd("stuAdmin", "stuGroup", station2);

    cy.log("Cannot rename station2 to same name as station1");
    cy.apiStationUpdate(
      "stuAdmin",
      "stuStation2",
      stationWithSameName,
      null,
      null,
      null,
      HttpStatusCode.Unprocessable
    );
  });

  it("Can add a station with duplicate name in another group", () => {
    const station1 = TestCreateStationData("stuStation", 7);
    const station2 = TestCreateStationData("stuStation", 8);
    const stationWithSameName = TestCreateStationData("stuStation", 8);
    stationWithSameName.name = "stuStation7";

    const expectedStation1 = TestCreateExpectedStation(
      TemplateExpectedStation,
      "stuStation",
      7
    );
    const expectedStationWithSameName = TestCreateExpectedStation(
      TemplateExpectedStation,
      "stuStation",
      8
    );
    expectedStationWithSameName.name = getTestName("stuStation7");
    expectedStationWithSameName.groupId = getCreds("stuGroup2").id;
    expectedStationWithSameName.groupName = getTestName("stuGroup2");

    cy.log("Adding station1");
    cy.apiGroupStationAdd("stuAdmin", "stuGroup", station1);

    cy.log("Adding station2");
    cy.apiGroupStationAdd("stuAdmin", "stuGroup2", station2);

    cy.log("Can rename to Station2 to same name as station1 in another group");
    cy.apiStationUpdate("stuAdmin", "stuStation8", stationWithSameName);

    cy.log("Check station1 exists");
    cy.apiGroupStationCheck(
      "stuAdmin",
      "stuGroup",
      "stuStation7",
      expectedStation1
    );

    cy.log("Check station2 exists");
    cy.apiGroupStationCheck(
      "stuAdmin",
      "stuGroup2",
      "stuStation7",
      expectedStationWithSameName
    );
  });

  it("Station with duplicate name to retired station", () => {
    const station1 = TestCreateStationData("stuStation", 9);
    const station2 = TestCreateStationData("stuStation", 10);
    const stationWithSameName = TestCreateStationData("stuStation", 10);
    stationWithSameName.name = "stuStation9";

    const expectedStation1 = TestCreateExpectedStation(
      TemplateExpectedStation,
      "stuStation",
      9
    );
    const expectedStationWithSameName = TestCreateExpectedStation(
      TemplateExpectedStation,
      "stuStation",
      10
    );
    expectedStationWithSameName.name = getTestName("stuStation9");

    cy.log("Adding station1");
    cy.apiGroupStationAdd(
      "stuAdmin",
      "stuGroup",
      station1,
      "2020-01-01T00:00:00.000Z"
    ).then(() => {
      const station1Id = getCreds(getTestName("stuStation9")).id;

      cy.log("Adding station2");
      cy.apiGroupStationAdd("stuAdmin", "stuGroup", station2);

      cy.log("Retire station1");
      cy.testStationRetire(
        "stuAdmin",
        "stuStation9",
        "2020-02-01T00:00:00.000Z"
      );

      cy.log("Can update station2 to have same name as retired station1");
      cy.apiStationUpdate("stuAdmin", "stuStation10", stationWithSameName);

      cy.log("Check station1 exists");
      cy.apiStationCheck(
        "stuAdmin",
        station1Id.toString(),
        expectedStation1,
        null,
        null,
        { useRawStationId: true, additionalParams: { "only-active": false } }
      );
      cy.log("Check station2 exists");
      cy.apiGroupStationCheck(
        "stuAdmin",
        "stuGroup",
        "stuStation9",
        expectedStationWithSameName
      );
    });
  });

  it("No warning on update station with unique location", () => {
    const station1 = TestCreateStationData("stuStation", 11);
    const movedStation = TestCreateStationData("stuStation", 12);

    cy.log("Adding station");
    cy.apiGroupStationAdd("stuAdmin", "stuGroup", station1);

    cy.log("Updating station location and check no warnings returned");
    cy.apiStationUpdate(
      "stuAdmin",
      "stuStation11",
      movedStation,
      undefined,
      undefined,
      undefined,
      HttpStatusCode.Ok,
      { warnings: "none" }
    );
  });

  it("Warning given for update station too close to another in same group", () => {
    const station1 = TestCreateStationData("stuStation", 13);
    const expectedStation1 = TestCreateExpectedStation(
      TemplateExpectedStation,
      "stuStation",
      13
    );
    const station2 = TestCreateStationData("stuStation", 14);
    const stationTooClose = TestCreateStationData("stuStation", 13);
    stationTooClose.name = "stationTooClose14";

    const expectedStationTooClose = TestCreateExpectedStation(
      TemplateExpectedStation,
      "stuStation",
      13
    );
    expectedStationTooClose.name = getTestName("stationTooClose14");

    cy.log("Adding station1");
    cy.apiGroupStationAdd("stuAdmin", "stuGroup", station1).then(
      (station1Id: number) => {
        cy.log("Adding station2");
        cy.apiGroupStationAdd("stuAdmin", "stuGroup", station2);

        cy.log("Can update station to same posn as station1 but warning given");
        cy.apiStationUpdate(
          "stuAdmin",
          "stuStation14",
          stationTooClose,
          undefined,
          undefined,
          undefined,
          HttpStatusCode.Ok,
          {
            warnings: [
              `Updated station location is too close to ${getTestName(
                station1.name
              )} (#${station1Id}) - recordings may be incorrectly matched`,
            ],
          }
        );

        cy.log("Check stations both exist");
        cy.apiGroupStationCheck(
          "stuAdmin",
          "stuGroup",
          "stuStation13",
          expectedStation1
        );
        cy.apiGroupStationCheck(
          "stuAdmin",
          "stuGroup",
          "stationTooClose14",
          expectedStationTooClose
        );
      }
    );
  });

  it("No warning given for station too close in another group", () => {
    const station1 = TestCreateStationData("stuStation", 15);
    const station2 = TestCreateStationData("stuStation", 16);
    const stationTooClose = TestCreateStationData("stuStation", 15);
    stationTooClose.name = "stationTooClose16";

    cy.log("Adding station1");
    cy.apiGroupStationAdd("stuAdmin", "stuGroup", station1);

    cy.log("Adding station2 group2");
    cy.apiGroupStationAdd("stuAdmin", "stuGroup2", station2);

    cy.log(
      "Can udpdate station2 to same posn as station1 in different group without warning"
    );
    cy.apiStationUpdate(
      "stuAdmin",
      "stuStation16",
      stationTooClose,
      undefined,
      undefined,
      undefined,
      HttpStatusCode.Ok,
      { warnings: "none" }
    );
  });

  it("No warning given for station too close to retired station", () => {
    const station1 = TestCreateStationData("stuStation", 17);
    const station2 = TestCreateStationData("stuStation", 18);
    const stationWithSameLocation = TestCreateStationData("stuStation", 17);
    stationWithSameLocation.name = "stationWithSameLocation18";

    const expectedStation1 = TestCreateExpectedStation(
      TemplateExpectedStation,
      "stuStation",
      17
    );
    const expectedStationWithSameLocation = TestCreateExpectedStation(
      TemplateExpectedStation,
      "stationWithSameLocation",
      17
    );
    expectedStationWithSameLocation.name = getTestName(
      "stationWithSameLocation18"
    );

    cy.log("Add station1");
    cy.apiGroupStationAdd(
      "stuAdmin",
      "stuGroup",
      station1,
      "2020-01-01T00:00:00.000Z"
    ).then(() => {
      cy.log("Add station2");
      cy.apiGroupStationAdd("stuAdmin", "stuGroup", station2);

      cy.log("Retire station1");
      cy.testStationRetire(
        "stuAdmin",
        "stuStation17",
        "2020-02-01T00:00:00.000Z"
      );
      expectedStation1.retiredAt = "2020-02-01T00:00:00.000Z";

      cy.log("Can relocate station2 to position of station1 with no warning");
      cy.apiStationUpdate(
        "stuAdmin",
        "stuStation18",
        stationWithSameLocation,
        undefined,
        undefined,
        undefined,
        undefined,
        { warnings: "none" }
      );

      cy.log("Check that both stations exist");
      cy.apiStationCheck(
        "stuAdmin",
        getTestName("stuStation17"),
        expectedStation1,
        undefined,
        undefined,
        { additionalParams: { "only-active": false } }
      );
      cy.apiGroupStationCheck(
        "stuAdmin",
        "stuGroup",
        "stationWithSameLocation18",
        expectedStationWithSameLocation
      );
    });
  });

  it("Automatic station becomes manual when updated", () => {
    const recordingTime = new Date();
    const station2 = TestCreateStationData("stuStation", 20);
    const expectedStation1 = TestCreateExpectedAutomaticStation(
      TemplateExpectedStation,
      19,
      "stuCamera1",
      recordingTime.toISOString()
    );
    expectedStation1.needsRename = true;

    const expectedStation2 = TestCreateExpectedStation(
      TemplateExpectedStation,
      "stuStation",
      20
    );
    expectedStation2.lastThermalRecordingTime = recordingTime.toISOString();
    const thisLocation = TestGetLocation(19);

    cy.testUploadRecording(
      "stuCamera1",
      { ...thisLocation, time: recordingTime, noTracks: true },
      "saRecording1"
    )
      .thenCheckStationIsNew("stuAdmin")
      .then(() => {
        cy.log("Check autocreated station");
        cy.apiGroupStationCheck(
          "stuAdmin",
          "stuGroup",
          expectedStation1.name,
          expectedStation1,
          undefined,
          undefined,
          { useRawStationName: true }
        ).then((stationId: number) => {
          cy.log("Update automatic station");
          cy.apiStationUpdate(
            "stuAdmin",
            stationId.toString(),
            station2,
            undefined,
            undefined,
            undefined,
            undefined,
            { useRawStationId: true }
          );

          cy.log("Check updated station");
          cy.apiStationCheck(
            "stuAdmin",
            stationId.toString(),
            expectedStation2,
            undefined,
            undefined,
            { useRawStationId: true }
          );
        });
      });
  });

  //TODO write this
  it.skip(
    "fromDate and untilDate applied to station as activeAt and retiredAt"
  );

  //TODO write this
  it.skip("setting retired=true sets retiredAt to Now()");
});
