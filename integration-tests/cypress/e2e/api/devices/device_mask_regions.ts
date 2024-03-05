/// <reference path="../../../support/index.d.ts" />
import { getCreds, makeAuthorizedRequest, v1ApiPath } from "@commands/server";
import { TestGetLocation } from "@commands/api/station";
import { ApiMaskRegionsData } from "@typedefs/api/device";
import { uploadFile } from "@commands/fileUpload";
import { ApiTrackDataRequest, ApiTrackPosition } from "@typedefs/api/track";

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

const positions1: ApiTrackPosition[] = [
  {
    x: 1,
    y: 2,
    width: 10,
    height: 20,
  },
  {
    x: 2,
    y: 3,
    width: 11,
    height: 21,
  },
];

// NOTE: This data comes from https://browse.cacophony.org.nz/recording/1717593/3774282
//  Aviemore dam, with the water masked off, as it is a common source of false triggers
const maskedTrack1: ApiTrackDataRequest = {
  start_s: 1.56,
  end_s: 4.22,
  tag: "false-positive",
  positions: [
    {
      x: 1,
      y: 46,
      width: 11,
      height: 11,
    },
    {
      x: 1,
      y: 47,
      width: 11,
      height: 10,
    },
    {
      x: 3,
      y: 48,
      width: 10,
      height: 9,
    },
    {
      x: 3,
      y: 48,
      width: 10,
      height: 9,
    },
    {
      x: 1,
      y: 51,
      width: 9,
      height: 10,
    },
    {
      x: 1,
      y: 50,
      width: 14,
      height: 11,
    },
    {
      x: 2,
      y: 50,
      width: 14,
      height: 11,
    },
    {
      x: 3,
      y: 50,
      width: 13,
      height: 11,
    },
    {
      x: 3,
      y: 50,
      width: 13,
      height: 11,
    },
    {
      x: 22,
      y: 42,
      width: 9,
      height: 10,
    },
    {
      x: 1,
      y: 51,
      width: 11,
      height: 10,
    },
    {
      x: 1,
      y: 51,
      width: 11,
      height: 10,
    },
    {
      x: 1,
      y: 50,
      width: 15,
      height: 11,
    },
    {
      x: 1,
      y: 50,
      width: 15,
      height: 14,
    },
    {
      x: 1,
      y: 51,
      width: 13,
      height: 13,
    },
    {
      x: 1,
      y: 52,
      width: 8,
      height: 12,
    },
    {
      x: 1,
      y: 46,
      width: 8,
      height: 18,
    },
    {
      x: 1,
      y: 47,
      width: 8,
      height: 17,
    },
    {
      x: 1,
      y: 47,
      width: 8,
      height: 16,
    },
    {
      x: 1,
      y: 46,
      width: 3,
      height: 16,
    },
    {
      x: 1,
      y: 46,
      width: 3,
      height: 16,
    },
    {
      x: 1,
      y: 45,
      width: 8,
      height: 17,
    },
    {
      x: 1,
      y: 45,
      width: 8,
      height: 18,
    },
    {
      x: 1,
      y: 45,
      width: 8,
      height: 18,
    },
  ],
};

const algorithm1 = {
  model_name: "inc3",
};

describe("Device mask regions", () => {
  it("Set, retrieve, and validate a mask region for the latest device location, and for a historical device location", () => {
    const user = "Josie";
    const group = "Josie-Team";
    const camera = "Josie-camera";
    const now = new Date();
    const oneDayAgo = new Date(new Date().setDate(now.getDate() - 1));
    const twoDaysAgo = new Date(new Date().setDate(now.getDate() - 2));
    cy.testCreateUserGroupAndDevice(user, group, camera);

    cy.testUploadRecording(camera, {
      ...TestGetLocation(1),
      time: twoDaysAgo,
      noTracks: true,
    });

    cy.apiDeviceAddMaskRegions(user, camera, testRegions1);

    cy.testUploadRecording(camera, {
      ...TestGetLocation(2),
      time: oneDayAgo,
      noTracks: true,
    });
    cy.apiDeviceAddMaskRegions(user, camera, testRegions2);

    // Make sure we read the same regions out
    cy.apiDeviceGetMaskRegions(user, camera).then((response) => {
      expect(response.body.maskRegions).to.deep.equal(testRegions2.maskRegions);
    });

    // Historical location.
    cy.apiDeviceGetMaskRegions(user, camera, twoDaysAgo).then((response) => {
      expect(response.body.maskRegions).to.deep.equal(testRegions1.maskRegions);
    });
  });

  it("Attempt to set a single mask region for a device that has no location", () => {
    //create a deviceHistory entry with no location
    const user = "Sam";
    const group = "Sam-Team";
    const camera = "Sam-camera";
    cy.testCreateUserGroupAndDevice(user, group, camera);
    cy.apiDeviceAddMaskRegions(user, camera, testRegions1, 400);
  });

  it("Check setting a mask region preserves other existing settings in DeviceSettings", () => {
    const user = "Caitlin";
    const group = "Caitlin-Team";
    const camera = "Caitlin-camera";
    cy.testCreateUserGroupAndDevice(user, group, camera);

    const location = TestGetLocation(1);
    cy.testUploadRecording(camera, {
      ...location,
      time: new Date(),
      noTracks: true,
    }).then(() => {
      let params = new URLSearchParams();
      params.append("at-time", new Date().toISOString());
      params.append("type", "pov");
      let queryString = params.toString();
      // eslint-disable-next-line no-undef
      const apiUrl = v1ApiPath(
        `devices/${getCreds(camera).id}/reference-image`
      );

      // Add a reference image.
      uploadFile(
        `${apiUrl}?${queryString}`,
        user,
        "trailcam-image.jpeg",
        "image/jpeg",
        {},
        "",
        200
      );

      cy.apiDeviceAddMaskRegions(user, camera, testRegions1);
      const deviceSettingsApiUrl = v1ApiPath(
        `devices/${getCreds(camera).id}/settings`
      );

      params = new URLSearchParams();
      params.append("at-time", new Date().toISOString());
      queryString = params.toString();

      makeAuthorizedRequest(
        {
          method: "GET",
          url: `${deviceSettingsApiUrl}?${queryString}`,
        },
        user
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

  it("Mask regions mask out tracks that are entirely contained within the region.", () => {
    // - Upload a recording with a location.
    // - Add a mask region
    // - Add a track to the recording
    // - The track should be entirely contained in the region.
    // - That track should not actually get created, and returns a fake trackId of 1
    const user = "Mark";
    const group = "Marks-Team";
    const camera = "CameraWithMask";
    const recording = "rec1";
    const maskedTrack = "maskedTrack";
    cy.testCreateUserGroupAndDevice(user, group, camera);

    cy.testUploadRecording(
      camera,
      {
        ...TestGetLocation(1),
        time: new Date(),
        noTracks: true,
      },
      recording
    );
    cy.apiDeviceAddMaskRegions(user, camera, {
      maskRegions: {
        Water: {
          regionData: [
            { x: -0.1, y: -0.05 },
            { x: 1.1, y: -0.05 },
            { x: 1.0, y: 0.1395 },
            { x: 0.0, y: 0.633 },
            { x: -0.1, y: -0.05 },
          ],
        },
      },
    });

    // Now add tracks.
    cy.apiTrackAdd(
      user,
      recording,
      maskedTrack,
      "testAlgorithm1",
      maskedTrack1,
      algorithm1
    ).then((response) => {
      expect(response.body.trackId).to.equal(1);
    });
    // Now adding tag to non-existent track should not fail.
    cy.apiTrackTagAdd(user, recording, maskedTrack, "1", {
      what: "possum",
      confidence: 0.9,
      automatic: true,
    });
    cy.apiTracksCheck(user, recording, []);
  });

  it.skip("A track that enters a mask region marked 'alertOnEnter' should trigger an email alert to the project member(s)", () => {});
});
