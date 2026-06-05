import { TestGetLocation } from "@commands/api/station";
import { getCreds, makeAuthorizedRequest, v1ApiPath } from "@commands/server";
import { uploadFile } from "@commands/fileUpload";
import { ApiDeviceHistorySettings } from "@shared/api/device";
import { RecordingProcessingState } from "@typedefs/api/consts";

export const addDays = (startDate: Date, days: number) => {
  const result = new Date(startDate);
  result.setDate(result.getDate() + days);
  return result;
};

export const addMinutes = (startDate: Date, mins: number) => {
  const result = new Date(startDate);
  result.setMinutes(result.getMinutes() + mins);
  return result;
};

export const addSeconds = (startDate: Date, secs: number) => {
  const result = new Date(startDate);
  result.setSeconds(result.getSeconds() + secs);
  return result;
};

describe("Devices historic settings", () => {
  it("A user can add and retrieve a reference image for a device in a location", () => {
    /// When a device is moved from its current location, any maskRegions or reference images should be removed from settings

    const user = "Casey";
    const group = "Casey-Team";
    const camera = "Casey-camera";
    const initialDateTime = new Date("2026-01-01T00:00:00Z");

    const oneDayAgo = addDays(initialDateTime, -1);
    const twoDaysAgo = addDays(initialDateTime, -2);
    const threeDaysAgo = addDays(initialDateTime, -3);
    cy.testCreateUserGroupAndDevice(user, group, camera, threeDaysAgo);

    cy.testUploadRecording(camera, {
      ...TestGetLocation(1),
      time: twoDaysAgo,
      noTracks: true,
      processingState: RecordingProcessingState.TrackAndAnalyse,
    }).then(() => {
      let params = new URLSearchParams();
      params.append("at-time", addMinutes(twoDaysAgo, 1).toISOString());
      params.append("type", "pov");
      let queryString = params.toString();
      const referenceImageApiUrl = v1ApiPath(
        `devices/${getCreds(camera).id}/reference-image`,
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
        200,
      ).then(() => {
        cy.log("Make sure we can retrieve the reference image");
        const deviceSettingsApiUrl = v1ApiPath(
          `devices/${getCreds(camera).id}/settings`,
        );
        params = new URLSearchParams();
        params.append("at-time", new Date().toISOString());
        queryString = params.toString();

        makeAuthorizedRequest(
          {
            method: "GET",
            url: `${deviceSettingsApiUrl}?${queryString}`,
          },
          user,
        ).then(
          (
            response: Cypress.Response<{
              settings: ApiDeviceHistorySettings | null;
            }>,
          ) => {
            const settings = response.body.settings;
            expect(settings).to.exist;
            expect((settings as ApiDeviceHistorySettings).referenceImagePOV).to
              .exist;
            expect(
              (settings as ApiDeviceHistorySettings).referenceImagePOVFileSize,
            ).to.exist;

            cy.log("Set low power mode");
            makeAuthorizedRequest(
              {
                method: "POST",
                url: `${deviceSettingsApiUrl}`,
                body: {
                  settings: {
                    thermalRecording: {
                      useLowPowerMode: true,
                      updated: addMinutes(twoDaysAgo, 2).toISOString(),
                    },
                  },
                  fromDateTime: addMinutes(twoDaysAgo, 2).toISOString(),
                },
              },
              user,
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
                user,
              ).then(
                (
                  response: Cypress.Response<{
                    settings: ApiDeviceHistorySettings;
                  }>,
                ) => {
                  const settings = response.body.settings;
                  expect(settings).to.exist;
                  expect(settings.referenceImagePOV).to.exist;
                  expect(settings.referenceImagePOVFileSize).to.exist;
                  expect(settings.thermalRecording).to.exist;
                  expect(settings.thermalRecording.useLowPowerMode).to.exist;
                  expect(settings.synced).to.exist;

                  cy.log("Upload a new recording 'now' in a new location");
                  cy.testUploadRecording(camera, {
                    ...TestGetLocation(3),
                    time: initialDateTime,
                    noTracks: true,
                    processingState: RecordingProcessingState.TrackAndAnalyse,
                  }).then(() => {
                    cy.log(
                      "Make sure the location specific settings have been cleared for the new location, while other settings are preserved",
                    );
                    params = new URLSearchParams();
                    params.append(
                      "at-time",
                      addMinutes(initialDateTime, 2).toISOString(),
                    );
                    queryString = params.toString();
                    makeAuthorizedRequest(
                      {
                        method: "GET",
                        url: `${deviceSettingsApiUrl}?${queryString}`,
                      },
                      user,
                    ).then(
                      (
                        response: Cypress.Response<{
                          settings: ApiDeviceHistorySettings;
                        }>,
                      ) => {
                        const settings = response.body.settings;
                        expect(settings).to.exist;
                        expect(settings.referenceImagePOV).to.not.exist;
                        expect(settings.referenceImagePOVFileSize).to.not.exist;
                        expect(settings.thermalRecording).to.exist;
                        expect(settings.thermalRecording?.useLowPowerMode).to
                          .exist;
                        expect(settings.synced).to.exist;
                        expect(settings.synced).to.be.false;

                        cy.log("Sync settings with device");
                        const confirmedSettings = { ...settings };
                        delete confirmedSettings.synced;
                        makeAuthorizedRequest(
                          {
                            method: "POST",
                            url: deviceSettingsApiUrl,
                            body: {
                              settings: confirmedSettings,
                            },
                          },
                          camera,
                        ).then(() => {
                          params = new URLSearchParams();
                          params.append(
                            "at-time",
                            addMinutes(initialDateTime, 3).toISOString(),
                          );
                          queryString = params.toString();
                          makeAuthorizedRequest(
                            {
                              method: "GET",
                              url: `${deviceSettingsApiUrl}?${queryString}`,
                            },
                            user,
                          ).then(
                            (
                              response: Cypress.Response<{
                                settings: ApiDeviceHistorySettings;
                              }>,
                            ) => {
                              const settings = response.body.settings;
                              expect(settings).to.exist;
                              expect(settings.synced).to.exist;
                              expect(settings.synced).to.be.true;
                              cy.log(
                                "Add new settings and ask for the latest synced settings",
                              );
                              makeAuthorizedRequest(
                                {
                                  method: "POST",
                                  url: `${deviceSettingsApiUrl}`,
                                  body: {
                                    settings: {
                                      thermalRecording: {
                                        useLowPowerMode: false,
                                        updated: addMinutes(
                                          initialDateTime,
                                          4,
                                        ).toISOString(),
                                      },
                                    },
                                  },
                                },
                                user,
                              ).then(() => {
                                params = new URLSearchParams();
                                params.append(
                                  "at-time",
                                  new Date().toISOString(),
                                );
                                queryString = params.toString();
                                makeAuthorizedRequest(
                                  {
                                    method: "GET",
                                    url: `${deviceSettingsApiUrl}?${queryString}`,
                                  },
                                  user,
                                ).then(
                                  (
                                    response: Cypress.Response<{
                                      settings: ApiDeviceHistorySettings;
                                    }>,
                                  ) => {
                                    const settings = response.body.settings;
                                    expect(settings).to.exist;
                                    expect(settings.synced).to.exist;
                                    expect(settings.synced).to.be.false;
                                  },
                                );

                                params = new URLSearchParams();
                                params.append(
                                  "at-time",
                                  new Date().toISOString(),
                                );
                                params.append("latest-synced", true.toString());
                                queryString = params.toString();
                                makeAuthorizedRequest(
                                  {
                                    method: "GET",
                                    url: `${deviceSettingsApiUrl}?${queryString}`,
                                  },
                                  user,
                                ).then(
                                  (
                                    response: Cypress.Response<{
                                      settings: ApiDeviceHistorySettings;
                                    }>,
                                  ) => {
                                    const settings = response.body.settings;
                                    expect(settings).to.exist;
                                    expect(settings.synced).to.exist;
                                    expect(settings.synced).to.be.true;
                                  },
                                );
                              });
                            },
                          );
                        });
                      },
                    );
                  });
                },
              );
            });
          },
        );
      });
    });
  });
});
