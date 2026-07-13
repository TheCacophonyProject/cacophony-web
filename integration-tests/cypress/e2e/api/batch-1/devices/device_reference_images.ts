import { makeAuthorizedRequestWithStatus, v1ApiPath } from "@commands/server";

describe("Device reference images", () => {
  it("If we create a device it should have no reference image", () => {
    const user = "Josie";
    const group = "Josie-Team";
    const camera = "Josie-camera";
    cy.testCreateUserGroupAndDevice(user, group, camera).then((deviceId) => {
      const url = v1ApiPath(`devices/${deviceId}/reference-image/exists`);
      makeAuthorizedRequestWithStatus(
        {
          method: "GET",
          url: url,
        },
        user,
        422,
      );
    });
  });
});
