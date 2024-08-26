import { TestGetLocation } from "@commands/api/station";
import { getCreds, makeAuthorizedRequest, v1ApiPath } from "@commands/server";
import { uploadFile } from "@commands/fileUpload";

describe("Devices historic settings", () => {
  it("A user can add and retrieve a reference image for a device in a location", () => {

    /// When a device is moved from its current location, any maskRegions or reference images should be removed from settings

    const user = "Casey";
    const group = "Casey-Team";
    const camera = "Casey-camera";
    const now = new Date();
    const oneDayAgo = new Date(new Date().setDate(now.getDate() - 1));
    const twoDaysAgo = new Date(new Date().setDate(now.getDate() - 2));
    cy.testCreateUserGroupAndDevice(user, group, camera);

    cy.testUploadRecording(camera, {
      ...TestGetLocation(1),
      time: twoDaysAgo,
      noTracks: true,
    }).then(() => {
      let params = new URLSearchParams();
      params.append("at-time", new Date().toISOString());
      params.append("type", "pov");
      let queryString = params.toString();
      const referenceImageApiUrl = v1ApiPath(
        `devices/${getCreds(camera).id}/reference-image`
      );
      cy.log("Add a POV reference image");
      // Add a reference image.
      uploadFile(
        `${referenceImageApiUrl}?${queryString}`,
        user,
        "trailcam-image.jpeg",
        "image/jpeg",
        {},
        "",
        200
      ).then(() => {
        cy.log("Make sure we can retrieve the reference image");
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
          const referenceImagePOVExist =
            settings.hasOwnProperty("referenceImagePOV");
          const referenceImagePOVFileSizeExist = settings.hasOwnProperty(
            "referenceImagePOVFileSize"
          );
          expect(referenceImagePOVExist).to.be.true;
          expect(referenceImagePOVFileSizeExist).to.be.true;

          cy.log("Set low power mode");
          makeAuthorizedRequest(
            {
              method: "POST",
              url: `${deviceSettingsApiUrl}`,
              body: {
                settings: {
                  thermalRecording: {
                    useLowPowerMode: true,
                    updated: new Date().toISOString(),
                  },
                },
              },
            },
            user
          ).then(() => {
            cy.log("Check low power mode has been merged");
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
              const referenceImagePOVExist =
                settings.hasOwnProperty("referenceImagePOV");
              const referenceImagePOVFileSizeExist = settings.hasOwnProperty(
                "referenceImagePOVFileSize"
              );
              const lowPowerModeSettingExist =
                settings.hasOwnProperty("thermalRecording");
              const lowPowerModeSettingExist2 =
                settings.thermalRecording &&
                settings.thermalRecording.hasOwnProperty("useLowPowerMode");
              const syncExists = settings.hasOwnProperty("synced");

              expect(referenceImagePOVExist).to.be.true;
              expect(referenceImagePOVFileSizeExist).to.be.true;
              expect(lowPowerModeSettingExist).to.be.true;
              expect(lowPowerModeSettingExist2).to.be.true;
              expect(syncExists).to.be.true;

              cy.log(
                "Upload a second recording at a different location to create a new DeviceHistory entry"
              );
              cy.testUploadRecording(camera, {
                ...TestGetLocation(2),
                time: oneDayAgo,
                noTracks: true,
              }).then(() => {
                cy.log(
                  "Make sure the settings have been cleared for the older location."
                );
                params = new URLSearchParams();
                params.append("at-time", oneDayAgo.toISOString());
                queryString = params.toString();
                makeAuthorizedRequest(
                  {
                    method: "GET",
                    url: `${deviceSettingsApiUrl}?${queryString}`,
                  },
                  user
                ).then((response) => {
                  const hasSettings = response.body.settings && Object.keys(response.body.settings).length !== 0;
                  expect(hasSettings).to.be.false;
                });
              });
                cy.log("Upload a new recording 'now' in a new location");
                cy.testUploadRecording(camera, {
                    ...TestGetLocation(3),
                    time: new Date(),
                    noTracks: true,
                }).then(() => {
                    cy.log(
                        "Make sure the location specific settings have been cleared for the new location, while other settings are preserved"
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
                        const referenceImagePOVExist =
                            settings.hasOwnProperty("referenceImagePOV");
                        const referenceImagePOVFileSizeExist = settings.hasOwnProperty(
                            "referenceImagePOVFileSize"
                        );
                        const lowPowerModeSettingExist =
                            settings.hasOwnProperty("thermalRecording");
                        const lowPowerModeSettingExist2 =
                            settings.thermalRecording &&
                            settings.thermalRecording.hasOwnProperty("useLowPowerMode");
                        const syncExists = settings.hasOwnProperty("synced");

                        expect(referenceImagePOVExist).to.be.false;
                        expect(referenceImagePOVFileSizeExist).to.be.false;
                        expect(lowPowerModeSettingExist).to.be.true;
                        expect(lowPowerModeSettingExist2).to.be.true;
                        expect(syncExists).to.be.true;
                    });
                });
            });
          });
        });
      });
    });
  });
});
