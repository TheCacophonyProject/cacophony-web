import { HttpStatusCode, RecordingType } from "@typedefs/api/consts";
import { getCreds } from "@commands/server";

// NOTE: When referring to "reassigning" a device, we mean moving a device into a group that already has an *inactive*
//  device that shares the same name as the new name for the device we're moving.

describe("Devices deleted, inactive, and reassigned", () => {
  const group = "cameras";
  const group2 = "cameras-2";
  const group3 = "cameras-3";
  const adminUser = "Fredirika";
  const adminUser2 = "Angelica";
  before(() => {
    cy.testCreateUserAndGroup(adminUser, group);
    cy.testCreateUserAndGroup(adminUser2, group3);
    cy.apiGroupAdd(adminUser, group2);
  });

  it("Deleting a device with no recordings removes it completely", () => {
    const device = "A001";
    cy.apiDeviceAdd(device, group);
    cy.apiDeviceDeleteOrSetInactive(adminUser, device, group);
    cy.apiDevice(adminUser, device, true, HttpStatusCode.Forbidden);
  });

  it("Deleting a device with recordings sets the device inactive", () => {
    const device = "A001";
    cy.apiDeviceAdd(device, group);
    cy.apiRecordingAdd(
      device,
      { type: RecordingType.ThermalRaw },
      "oneframe.cptv"
    ).then((recordingId) => {
      cy.log("Added recording for device", recordingId);
      cy.apiDeviceDeleteOrSetInactive(adminUser, device, group);
      cy.apiDevice(adminUser, device, true, HttpStatusCode.Ok).then(
        (response) => {
          expect(response.body.device.active, "Device should be inactive.").to
            .be.false;
        }
      );
    });
  });

  it(
    "Recordings uploaded for an inactive device *from the device* should " +
      "reactivate the device if the device has not been moved/re-registered",
    () => {
      cy.log(
        "Recordings uploaded for an inactive device *from the device* make it active again"
      );
      let originalDeviceId;
      const device = "A002";
      cy.apiDeviceAdd(device, group).then((deviceId) => {
        cy.log("Created device", deviceId);
        originalDeviceId = deviceId;
      });
      cy.apiRecordingAdd(
        device,
        { type: RecordingType.ThermalRaw },
        "oneframe.cptv"
      ).then((recordingId) => {
        cy.log("Added recording for device", recordingId);
        cy.log("Setting device inactive");
        cy.apiDeviceDeleteOrSetInactive(adminUser, device, group);
        cy.apiDevice(adminUser, device, true, HttpStatusCode.Ok).then(
          (response) => {
            expect(response.body.device.active, "Device should be inactive.").to
              .be.false;
            // Now add another recording for the device
            cy.apiRecordingAdd(
              device,
              { type: RecordingType.ThermalRaw },
              "oneframe.cptv"
            ).then((recordingId) => {
              cy.log("Added recording for inactive device", recordingId);
              cy.apiDevice(adminUser, device, true, HttpStatusCode.Ok).then(
                (response) => {
                  expect(
                    response.body.device.active,
                    "Device should be active."
                  ).to.be.true;
                }
              );
            });
          }
        );
      });

      cy.log(
        "Recordings uploaded for an inactive device *from the device* which was moved *don't* make it active again"
      );
      const device2 = "A003";
      cy.apiRecordingAdd(
        device,
        { type: RecordingType.ThermalRaw },
        "oneframe.cptv"
      ).then((recordingId) => {
        cy.log("Added recording for device", recordingId);
        cy.apiDeviceDeleteOrSetInactive(adminUser, device, group);
        cy.apiDevice(adminUser, device, true, HttpStatusCode.Ok).then(
          (response) => {
            expect(response.body.device.active, "Device should be inactive.").to
              .be.false;
            cy.log("Re-register the device into another group");
            cy.apiDeviceReregisterAuthorized(
              device,
              device2,
              group2,
              adminUser
            ).then((response) => {
              cy.log("Re-registered device", response.body.id);
              expect(response.body.id).to.not.equal(originalDeviceId);
              // Now add another recording for the device
              cy.apiRecordingAdd(
                device,
                { type: RecordingType.ThermalRaw },
                "oneframe.cptv"
              ).then((recordingId) => {
                cy.log("Added recording for original device", recordingId);
                cy.apiDevice(adminUser, device, true, HttpStatusCode.Ok).then(
                  (response) => {
                    expect(
                      response.body.device.active,
                      "Device should be inactive."
                    ).to.be.false;
                  }
                );
              });
            });
          }
        );
      });
    }
  );

  it("Recordings uploaded for an inactive device on behalf the device (sidekick) should not reactivate the device", () => {
    const device = "B001";
    cy.apiDeviceAdd(device, group).then((deviceId) => {
      cy.log("Created device", deviceId);
      cy.apiRecordingAdd(
        device,
        { type: RecordingType.ThermalRaw },
        "oneframe.cptv"
      ).then((recordingId) => {
        cy.log("Added recording for device", recordingId);
        cy.apiDeviceDeleteOrSetInactive(adminUser, device, group);
        cy.apiDevice(adminUser, device, true, HttpStatusCode.Ok).then(
          (response) => {
            expect(response.body.device.active, "Device should be inactive.").to
              .be.false;

            cy.log("Now upload some recordings on behalf of the device");
            cy.apiRecordingAddOnBehalfUsingDevice(
              adminUser,
              device,
              { type: RecordingType.ThermalRaw },
              "foo",
              "oneframe.cptv"
            ).then(() => {
              cy.apiDevice(adminUser, device, true, HttpStatusCode.Ok).then(
                (response) => {
                  expect(
                    response.body.device.active,
                    "Device should still be active."
                  ).to.be.false;
                }
              );
            });
          }
        );
      });
    });
  });

  it(
    "Reassigning a device into the same group should result in the new device " +
      "becoming the old device and being set active.",
    () => {
      let originalDeviceId;
      const device = "A004";
      cy.apiDeviceAdd(device, group).then((deviceId) => {
        cy.log("Created device", deviceId);
        originalDeviceId = deviceId;
      });
      cy.apiRecordingAdd(
        device,
        { type: RecordingType.ThermalRaw },
        "oneframe.cptv"
      ).then((recordingId) => {
        cy.log("Added recording for device", recordingId);
        cy.log("Setting device inactive");
        cy.apiDeviceDeleteOrSetInactive(adminUser, device, group);
        cy.apiDevice(adminUser, device, true, HttpStatusCode.Ok).then(
          (response) => {
            expect(response.body.device.active, "Device should be inactive.").to
              .be.false;
            cy.log("Re-register the device into the same group");
            cy.apiDeviceReregisterAuthorized(
              device,
              device,
              group,
              adminUser
            ).then((response) => {
              cy.log("Re-registered device", response.body.id);
              expect(response.body.id).to.equal(originalDeviceId);
              cy.apiDevice(adminUser, device, true, HttpStatusCode.Ok).then(
                (response) => {
                  expect(
                    response.body.device.active,
                    "Device should be active."
                  ).to.be.true;
                }
              );
              cy.log("Device inherits recordings");
              cy.testCheckDeviceHasRecordings(adminUser, device, 1);
            });
          }
        );
      });
    }
  );

  it(
    "Reassigning a device with recordings into a different group should make it become the the existing device, " +
      "be set active, while in the group it's moved from it becomes inactive",
    () => {
      let originalDeviceId;
      const deviceDest = "A005";
      const deviceSource = "A005a";
      cy.apiDeviceAdd(deviceDest, group2).then((deviceId) => {
        cy.log("Created device in destination group", deviceId);
        originalDeviceId = deviceId;
        cy.apiRecordingAdd(
          deviceDest,
          { type: RecordingType.ThermalRaw },
          "oneframe.cptv"
        ).then(() => {
          cy.apiRecordingAdd(
            deviceDest,
            { type: RecordingType.ThermalRaw },
            "oneframe.cptv"
          ).then((recordingId) => {
            cy.log("Added recording to device", recordingId);
            cy.log("Setting device inactive");
            cy.apiDeviceDeleteOrSetInactive(adminUser, deviceDest, group2);
            cy.apiDevice(adminUser, deviceDest, true, HttpStatusCode.Ok).then(
              (response) => {
                expect(
                  response.body.device.active,
                  "Device should be inactive."
                ).to.be.false;
                cy.apiDeviceAdd(deviceSource, group).then((deviceId) => {
                  cy.log("Created device in source group", deviceId);
                  cy.apiRecordingAdd(
                    deviceSource,
                    { type: RecordingType.ThermalRaw },
                    "oneframe.cptv"
                  ).then((recordingId) => {
                    // Now move this device from source group to destination
                    cy.apiDeviceReregisterAuthorized(
                      deviceSource,
                      deviceDest,
                      group2,
                      adminUser
                    ).then((response) => {
                      cy.log("Re-registered device", response.body.id);
                      expect(response.body.id).to.equal(originalDeviceId);
                      cy.apiDevice(
                        adminUser,
                        deviceDest,
                        true,
                        HttpStatusCode.Ok
                      ).then((response) => {
                        expect(
                          response.body.device.active,
                          "Dest device should now be active."
                        ).to.be.true;
                      });
                      cy.apiDevice(
                        adminUser,
                        deviceSource,
                        true,
                        HttpStatusCode.Ok
                      ).then((response) => {
                        expect(
                          response.body.device.active,
                          "Source device should be inactive."
                        ).to.be.false;
                      });
                      cy.log("Device inherits recordings");
                      cy.testCheckDeviceHasRecordings(adminUser, deviceDest, 2);
                    });
                  });
                });
              }
            );
          });
        });
      });
    }
  );

  it("Reassigning a device where there's an active device in the destination group with the same name fails", () => {
    const deviceDest = "A008";
    const deviceSource = "A008a";
    cy.apiDeviceAdd(deviceDest, group2).then((deviceId) => {
      cy.log("Created device in destination group", deviceId);
      cy.apiRecordingAdd(
        deviceDest,
        { type: RecordingType.ThermalRaw },
        "oneframe.cptv"
      ).then((recordingId) => {
        cy.log("Added recording to device", recordingId);
        cy.apiDevice(adminUser, deviceDest, true, HttpStatusCode.Ok).then(
          (response) => {
            expect(response.body.device.active, "Device should be active.").to
              .be.true;
            cy.apiDeviceAdd(deviceSource, group).then((deviceId) => {
              cy.log("Created device in source group", deviceId);
              cy.apiRecordingAdd(
                deviceSource,
                { type: RecordingType.ThermalRaw },
                "oneframe.cptv"
              ).then(() => {
                cy.log(
                  "Attempt to move device from source group to destination"
                );
                cy.apiDeviceReregisterAuthorized(
                  deviceSource,
                  deviceDest,
                  group2,
                  adminUser,
                  null,
                  HttpStatusCode.BadRequest
                );
              });
            });
          }
        );
      });
    });
  });

  it(
    "Reassigning a device without recordings into a different group should make it become the " +
      "the existing device, be set active, while in the group it's moved it is deleted",
    () => {
      let originalDeviceId;
      const deviceDest = "A006";
      const deviceSource = "A006";
      cy.apiDeviceAdd(deviceDest, group2).then((deviceId) => {
        cy.log("Created device in destination group", deviceId);
        originalDeviceId = deviceId;
        cy.apiRecordingAdd(
          deviceDest,
          { type: RecordingType.ThermalRaw },
          "oneframe.cptv"
        ).then((recordingId) => {
          cy.log("Added recording to device", recordingId);
          cy.log("Setting device inactive");
          cy.apiDeviceDeleteOrSetInactive(adminUser, deviceDest, group2);
          cy.apiDevice(adminUser, deviceDest, true, HttpStatusCode.Ok).then(
            (response) => {
              expect(response.body.device.active, "Device should be inactive.")
                .to.be.false;
              cy.apiDeviceAdd(deviceSource, group).then((deviceId) => {
                cy.log("Created device in source group", deviceId);
                // Now move this device from source group to destination
                cy.apiDeviceReregisterAuthorized(
                  deviceSource,
                  deviceDest,
                  group2,
                  adminUser
                ).then((response) => {
                  cy.log("Re-registered device", response.body.id);
                  expect(response.body.id).to.equal(originalDeviceId);
                  cy.apiDevice(
                    adminUser,
                    deviceDest,
                    true,
                    HttpStatusCode.Ok
                  ).then((response) => {
                    expect(
                      response.body.device.active,
                      "Dest device should now be active."
                    ).to.be.true;
                  });
                  cy.log("Source device with no recordings should be deleted");
                  cy.apiDeviceInGroup(
                    adminUser,
                    deviceSource,
                    group,
                    null,
                    {},
                    HttpStatusCode.Forbidden
                  );
                  cy.log("Device inherits recordings");
                  cy.testCheckDeviceHasRecordings(adminUser, deviceDest, 1);
                });
              });
            }
          );
        });
      });
    }
  );

  it("To reassign a device, the user must be an admin for both the group being moved from and the destination group.", () => {
    const deviceDest = "A007";
    const deviceSource = "A007";
    cy.apiDeviceAdd(deviceDest, group3).then((deviceId) => {
      cy.log("Created device in destination group", deviceId);
      cy.apiRecordingAdd(
        deviceDest,
        { type: RecordingType.ThermalRaw },
        "oneframe.cptv"
      ).then((recordingId) => {
        cy.log("Added recording to device", recordingId);
        cy.log("Setting device inactive");
        cy.apiDeviceDeleteOrSetInactive(adminUser2, deviceDest, group3);
        cy.apiDevice(adminUser2, deviceDest, true, HttpStatusCode.Ok).then(
          (response) => {
            expect(response.body.device.active, "Device should be inactive.").to
              .be.false;
            cy.apiDeviceAdd(deviceSource, group).then((deviceId) => {
              cy.log("Created device in source group", deviceId);
              // Now move this device from source group to destination
              cy.apiDeviceReregisterAuthorized(
                deviceSource,
                deviceDest,
                group3,
                adminUser,
                null,
                HttpStatusCode.Forbidden
              );
            });
          }
        );
      });
    });
  });
});
