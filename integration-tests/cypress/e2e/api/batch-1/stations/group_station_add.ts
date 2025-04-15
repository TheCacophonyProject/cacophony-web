import { ApiStationResponse } from "@typedefs/api/station";
import { getCreds } from "@commands/server";
import { getTestName } from "@commands/names";
import { NOT_NULL, NOT_NULL_STRING } from "@commands/constants";
import {
  TestCreateStationData,
  TestCreateExpectedStation,
} from "@commands/api/station";
import { HttpStatusCode } from "@typedefs/api/consts";

describe("Stations: adding", () => {
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
    cy.testCreateUserGroupAndDevice("staAdmin", "staGroup", "staCamera1").then(
      () => {
        TemplateExpectedStation.groupId = getCreds("staGroup").id;
        TemplateExpectedStation.groupName = getTestName("staGroup");
        TemplateExpectedStation.name = getTestName("staStation1");
      },
    );

    // second group and device
    cy.apiGroupAdd("staAdmin", "staGroup2");
    cy.apiDeviceAdd("staCamera2", "staGroup2");
  });

  it("Can add a station with unique name and location", () => {
    const station1 = TestCreateStationData("staStation", 1);
    const expectedStation1 = TestCreateExpectedStation(
      TemplateExpectedStation,
      "staStation",
      1,
    );

    cy.log("Adding station");
    cy.apiGroupStationAdd("staAdmin", "staGroup", station1).then(() => {
      cy.log("Check station exists");
      cy.apiStationCheck(
        "staAdmin",
        getTestName("staStation1"),
        expectedStation1,
      );
    });
  });

  it("Cannot add a station with duplicate name in this group", () => {
    const station1 = TestCreateStationData("staStation", 2);
    const stationWithSameName = {
      name: "staStation2",
      lat: -47,
      lng: 177,
    };

    cy.log("Adding station");
    cy.apiGroupStationAdd("staAdmin", "staGroup", station1);

    cy.log("Cannot add duplicate-named station");
    cy.apiGroupStationAdd(
      "staAdmin",
      "staGroup",
      stationWithSameName,
      null,
      null,
      HttpStatusCode.Unprocessable,
    );
  });

  it("Can add a station with duplicate name in another group", () => {
    const station1 = TestCreateStationData("staStation", 3);
    const stationWithSameName = {
      name: "staStation3",
      lat: -47,
      lng: 177,
    };

    const expectedStation1 = TestCreateExpectedStation(
      TemplateExpectedStation,
      "staStation",
      3,
    );
    const expectedStation2 = TestCreateExpectedStation(
      TemplateExpectedStation,
      "staStation",
      3,
    );
    expectedStation2.location.lat = -47;
    expectedStation2.location.lng = 177;
    expectedStation2.groupId = getCreds("staGroup2").id;
    expectedStation2.groupName = getTestName("staGroup2");

    cy.log("Adding station");
    cy.apiGroupStationAdd("staAdmin", "staGroup", station1);

    cy.log("Can add duplicate-named station in another group");
    cy.apiGroupStationAdd("staAdmin", "staGroup2", stationWithSameName);

    cy.log("Check station1 exists");
    cy.apiGroupStationCheck(
      "staAdmin",
      "staGroup",
      "staStation3",
      expectedStation1,
    );

    cy.log("Check station2 exists");
    cy.apiGroupStationCheck(
      "staAdmin",
      "staGroup2",
      "staStation3",
      expectedStation2,
    );
  });

  it("Station with duplicate name to retired station", () => {
    const station1 = TestCreateStationData("staStation", 4);
    const stationWithSameName = {
      name: "staStation4",
      lat: -47,
      lng: 177,
    };

    const expectedStation1 = TestCreateExpectedStation(
      TemplateExpectedStation,
      "staStation",
      4,
    );
    const expectedStation2 = TestCreateExpectedStation(
      TemplateExpectedStation,
      "staStation",
      4,
    );
    expectedStation2.location.lat = -47;
    expectedStation2.location.lng = 177;

    cy.log("Adding station");
    cy.apiGroupStationAdd(
      "staAdmin",
      "staGroup",
      station1,
      "2020-01-01T00:00:00.000Z",
    ).then(() => {
      const station1Id = getCreds(getTestName("staStation4")).id;

      cy.log("Retire that station");
      cy.testStationRetire(
        "staAdmin",
        "staStation4",
        "2020-02-01T00:00:00.000Z",
      );

      cy.log("Can add duplicate-named station");
      cy.apiGroupStationAdd("staAdmin", "staGroup", stationWithSameName);

      cy.log("Check station1 exists");
      cy.apiStationCheck(
        "staAdmin",
        station1Id.toString(),
        expectedStation1,
        null,
        null,
        { useRawStationId: true, additionalParams: { "only-active": false } },
      );
      cy.log("Check station2 exists");
      cy.apiGroupStationCheck(
        "staAdmin",
        "staGroup",
        "staStation4",
        expectedStation2,
      );
    });
  });

  it("No warning on add station with unique location", () => {
    const station1 = TestCreateStationData("staStation", 5);

    cy.log("Adding station and check no warnings returned");
    cy.apiGroupStationAdd(
      "staAdmin",
      "staGroup",
      station1,
      undefined,
      undefined,
      HttpStatusCode.Ok,
      { warnings: "none" },
    );
  });

  it("Warning given for station too close in same group", () => {
    const station1 = TestCreateStationData("staStation", 6);
    const expectedStation1 = TestCreateExpectedStation(
      TemplateExpectedStation,
      "staStation",
      6,
    );
    const stationTooClose = TestCreateStationData("staStation", 6);
    stationTooClose.name = "stationTooClose6";
    const expectedStationTooClose = TestCreateExpectedStation(
      TemplateExpectedStation,
      "staStation",
      6,
    );
    expectedStationTooClose.name = getTestName("stationTooClose6");

    cy.log("Adding station");
    cy.apiGroupStationAdd("staAdmin", "staGroup", station1).then(
      (station1Id: number) => {
        cy.log("Can add duplicate-located station but warning given");
        cy.apiGroupStationAdd(
          "staAdmin",
          "staGroup",
          stationTooClose,
          undefined,
          undefined,
          HttpStatusCode.Ok,
          {
            warnings: [
              `New station is too close to ${getTestName(
                station1.name,
              )} (#${station1Id}) - recordings may be incorrectly matched`,
            ],
          },
        );

        cy.log("Check stations both exist");
        cy.apiGroupStationCheck(
          "staAdmin",
          "staGroup",
          "staStation6",
          expectedStation1,
        );
        cy.apiGroupStationCheck(
          "staAdmin",
          "staGroup",
          "stationTooClose6",
          expectedStationTooClose,
        );
      },
    );
  });

  it("No warning given for station too close in another group", () => {
    const station1 = TestCreateStationData("staStation", 7);
    const stationTooClose = TestCreateStationData("staStation", 7);
    stationTooClose.name = "stationTooClose7";

    cy.log("Adding station");
    cy.apiGroupStationAdd("staAdmin", "staGroup", station1);

    cy.log("Can add duplicate-located station without warning");
    cy.apiGroupStationAdd(
      "staAdmin",
      "staGroup2",
      stationTooClose,
      undefined,
      undefined,
      HttpStatusCode.Ok,
      { warnings: "none" },
    );
  });

  it("No warning given for station too close to retired station", () => {
    const station1 = TestCreateStationData("staStation", 8);
    const stationWithSameLocation = TestCreateStationData("staStation", 8);
    stationWithSameLocation.name = "stationWithSameLocation8";
    const expectedStation1 = TestCreateExpectedStation(
      TemplateExpectedStation,
      "staStation",
      8,
    );
    const expectedStationWithSameLocation = TestCreateExpectedStation(
      TemplateExpectedStation,
      "stationWithSameLocation",
      8,
    );

    cy.apiGroupStationAdd(
      "staAdmin",
      "staGroup",
      station1,
      "2020-01-01T00:00:00.000Z",
    ).then((firstStationId: number) => {
      cy.log("Retire that station");
      cy.testStationRetire(
        "staAdmin",
        "staStation8",
        "2020-02-01T00:00:00.000Z",
      );
      expectedStation1.retiredAt = "2020-02-01T00:00:00.000Z";

      cy.log("Can add duplicate-located station with no warning");
      cy.apiGroupStationAdd(
        "staAdmin",
        "staGroup",
        stationWithSameLocation,
        undefined,
        undefined,
        undefined,
        { warnings: "none" },
      ).then((secondStationId: number) => {
        cy.log("Check that both stations exist");
        cy.apiStationCheck(
          "staAdmin",
          firstStationId.toString(),
          expectedStation1,
          undefined,
          undefined,
          { useRawStationId: true },
        );
        cy.apiStationCheck(
          "staAdmin",
          secondStationId.toString(),
          expectedStationWithSameLocation,
          undefined,
          undefined,
          { useRawStationId: true },
        );
        cy.apiGroupStationCheck(
          "staAdmin",
          "staGroup",
          "stationWithSameLocation8",
          expectedStationWithSameLocation,
        );
      });
    });
  });
});
