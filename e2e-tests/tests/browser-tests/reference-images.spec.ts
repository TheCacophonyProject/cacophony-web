import { test, expect } from "@/helpers/upload-tests";
import { createProjectWithUserAndDevice } from "@/helpers/create-test-entities";
import { uploadThermalRecordingFromDevice } from "@/helpers/recording-uploads";
import {
  confirmNewUserEmailAddressWhileLoggedOut,
  ensureMainNavIsAvailable,
  signInExistingUser,
  waitToNavigateToProject,
  waitToNavigateToProjectPage,
} from "@/helpers/browse-helpers";

test(`A user can add a reference image to a device`, async ({
  page,
  smallCptv,
  deviceReferenceImage,
}) => {
  const project = await createProjectWithUserAndDevice();
  const AdminUser = project.api();
  const deviceHandle = project.getDevice();
  const user = project.getAdminUser();
  const recordingId = await uploadThermalRecordingFromDevice({
    deviceHandle,
    location: { ...project.locationBase },
    file: smallCptv,
    recordingDateTime: new Date(),
  });
  expect(recordingId, "recording succeeded").toBeDefined();

  const projectName = project.projectHandle.testId;
  await confirmNewUserEmailAddressWhileLoggedOut(page, user.testId);
  await signInExistingUser(page, user.testId, "password");
  await waitToNavigateToProject(page, projectName);
  await ensureMainNavIsAvailable(page);
  // Go to devices listing
  await page.getByTestId("manage devices").click();
  await waitToNavigateToProjectPage(page, projectName, "devices");
  // Click individual device table row
  await page
    .locator("tr")
    .filter({ has: page.getByTestId(`device ${deviceHandle.testId}`) })
    .click();
  // Go to device page
  await waitToNavigateToProjectPage(
    page,
    projectName,
    `devices/${deviceHandle.id}/${deviceHandle.testId.toLowerCase()}/status`,
  );
  // Click configuration tab
  await page.getByTestId("device configuration").click();
  await waitToNavigateToProjectPage(
    page,
    projectName,
    `devices/${deviceHandle.id}/${deviceHandle.testId.toLowerCase()}/configuration/recording-options`,
  );

  // Click reference photo
  await page.getByTestId("reference photo").click();
  await waitToNavigateToProjectPage(
    page,
    projectName,
    `devices/${deviceHandle.id}/${deviceHandle.testId.toLowerCase()}/configuration/reference`,
  );

  await page.getByTestId("select reference image").setInputFiles({
    name: "reference-image.jpeg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(deviceReferenceImage),
  });

  await page.getByTestId("save reference image").click();
  await expect(page.getByTestId("add new reference image")).toBeAttached();

  // Check that reference image was added:
  const uploadedImage = await AdminUser.Devices.getReferenceImageForDeviceAtTime(deviceHandle.id);
  expect(uploadedImage.success, "retrieved reference image").toBe(true);
  if (uploadedImage) {
    expect(
      (uploadedImage.result as Blob).size,
      "retrieved image has non-zero length",
    ).toBeGreaterThan(0);
  }
});
