/// <reference path="../../../support/index.d.ts" />
import { makeAuthorizedRequest, saveIdOnly, v1ApiPath } from "@commands/server";
import { TestGetLocation } from "@commands/api/station";
import { ApiMaskRegionsData } from "@typedefs/api/device";
import { uploadFile } from "@commands/fileUpload";
import { RecordingId } from "@typedefs/api/common";

describe("Device mask regions", () => {
  const user1 = "Josie";
  const group1 = "Josie-Team";
  const camera1 = "Josie-camera";
  let id;

  const testRegions1: ApiMaskRegionsData = {
    maskRegions: {
      region1: {
        regionData: [
          {
            x: 0.6099355445717866,
            y: 0.18160262197818397,
          },
          {
            x: 0.3794299431566922,
            y: 0.4624104049970519,
          },
          {
            x: 0.7691336577793337,
            y: 0.5132653578272406,
          },
          {
            x: 0.6099355445717866,
            y: 0.18160262197818397,
          },
        ],
      },
      region2: {
        regionData: [
          {
            x: 0.7757669124963148,
            y: 0.7012075748083727,
          },
          {
            x: 0.80561655872273,
            y: 0.9377936597140331,
          },
          {
            x: 0.13897445966612618,
            y: 0.7211073389593161,
          },
        ],
      },
    },
  };

  const testRegions2: ApiMaskRegionsData = {
    maskRegions: {
      "alt region": {
        regionData: [
          {
            x: 0.7757669124963148,
            y: 0.7012075748083727,
          },
          {
            x: 0.80561655872273,
            y: 0.9377936597140331,
          },
          {
            x: 0.13897445966612618,
            y: 0.7211073389593161,
          },
        ],
      },
    },
  };

  before(() => {
    cy.testCreateUserAndGroup(user1, group1);
    const now = new Date();
    const twoDaysAgo = new Date(new Date().setDate(now.getDate() - 2));
    // Add a device with two recordings one day apart in different locations.
    cy.apiDeviceAdd(camera1, group1).then((deviceId) => {
      id = deviceId;
      let location = TestGetLocation(1);
      cy.testUploadRecording(camera1, {
        ...location,
        time: twoDaysAgo,
        noTracks: true,
      }).then(() => {
        makeAuthorizedRequest(
          {
            method: "POST",
            url: v1ApiPath(`devices/${deviceId}/mask-regions`),
            body: testRegions1,
          },
          user1
        ).then(() => {
          const oneDayAgo = new Date(new Date().setDate(now.getDate() - 1));
          location = TestGetLocation(2);
          cy.testUploadRecording(camera1, {
            ...location,
            time: oneDayAgo,
            noTracks: true,
          });
          makeAuthorizedRequest(
            {
              method: "POST",
              url: v1ApiPath(`devices/${deviceId}/mask-regions`),
              body: testRegions2,
            },
            user1
          );
        });
      });
    });
  });

  it("Set, retrieve, and validate a mask region for the latest device location", () => {
    const now = new Date();
    cy.log("Time: ", now.toISOString());
    const params = new URLSearchParams();
    params.append("at-time", now.toISOString());
    const queryString = params.toString();
    const apiUrl = v1ApiPath(`devices/${id}/mask-regions`);
    // Make sure we read the same regions out
    makeAuthorizedRequest(
      {
        method: "GET",
        url: `${apiUrl}?${queryString}`,
      },
      user1
    ).then((response) => {
      expect(response.body.maskRegions).to.deep.equal(testRegions2.maskRegions);
    });
  });

  it("Retrieve a mask region for a historical device location", () => {
    const now = new Date();
    const twoDaysAgo = new Date(new Date().setDate(now.getDate() - 2));
    cy.log("Time: ", twoDaysAgo.toISOString());

    const params = new URLSearchParams();
    params.append("at-time", twoDaysAgo.toISOString());

    const queryString = params.toString();
    const apiUrl = v1ApiPath(`devices/${id}/mask-regions`);

    makeAuthorizedRequest(
      {
        method: "GET",
        url: `${apiUrl}?${queryString}`,
      },
      user1
    ).then((response) => {
      expect(response.status).to.equal(200);
      expect(response.body.maskRegions).to.deep.equal(testRegions1.maskRegions);
    });
  });

  it("Attempt to set a single mask region for a device that has no location", () => {
    //create a deviceHistory entry with no location
    const user2 = "Sam";
    const group2 = "Sam-Team";
    const camera2 = "Sam-camera";
    cy.testCreateUserAndGroup(user2, group2);
    cy.apiDeviceAdd(camera2, group2).then((deviceID) => {
      makeAuthorizedRequest(
        {
          method: "POST",
          url: v1ApiPath(`devices/${deviceID}/mask-regions`, deviceID),
          body: testRegions1,
          failOnStatusCode: false,
        },
        user2
      ).then((response) => {
        expect(response.status).to.eq(400);
        expect(response.body.messages[0]).to.equal(
          "No device history settings entry found to add mask regions"
        );
      });
    });
  });

  it("Check setting a mask region preserves other existing settings in DeviceSettings", () => {
    const user3 = "Caitlin";
    const group3 = "Caitlin-Team";
    const camera3 = "Caitlin-camera";
    cy.testCreateUserAndGroup(user3, group3);
    cy.apiDeviceAdd(camera3, group3).then((id) => {
      const location = TestGetLocation(1);
      cy.testUploadRecording(camera3, {
        ...location,
        time: new Date(),
        noTracks: true,
      }).then(() => {
        let params = new URLSearchParams();
        params.append("at-time", new Date().toISOString());
        params.append("type", "pov");
        let queryString = params.toString();
        const apiUrl = v1ApiPath(`devices/${id}/reference-image`);

        // Add a reference image.
        uploadFile(
          `${apiUrl}?${queryString}`,
          user3,
          "trailcam-image.jpeg",
          "image/jpeg",
          {},
          "",
          200
        );

        makeAuthorizedRequest(
          {
            method: "POST",
            url: v1ApiPath(`devices/${id}/mask-regions`),
            body: testRegions1,
          },
          user3
        );
        const deviceSettingsApiUrl = v1ApiPath(`devices/${id}/settings`);

        params = new URLSearchParams();
        params.append("at-time", new Date().toISOString());
        queryString = params.toString();

        makeAuthorizedRequest(
          {
            method: "GET",
            url: `${deviceSettingsApiUrl}?${queryString}`,
          },
          user3
        ).then((response) => {
          const settings = response.body.settings;
          expect(settings).to.exist;
          const maskRegionsExist = settings.hasOwnProperty("maskRegions");
          const referenceImagePOVExist =
            settings.hasOwnProperty("referenceImagePOV");
          const referenceImagePOVFileSizeExist = settings.hasOwnProperty(
            "referenceImagePOVFileSize"
          );
          expect(maskRegionsExist).to.be.true;
          expect(referenceImagePOVExist).to.be.true;
          expect(referenceImagePOVFileSizeExist).to.be.true;
        });
      });
    });
  });
});
