import { test, expect } from "@/helpers/upload-tests";
import { addDeviceToProject, createProjectWithUserAndDevice } from "@/helpers/create-test-entities";
import {
  uploadThermalRecordingFromDevice,
  uploadThermalRecordingsFromDeviceWithTimesAndDurations,
} from "@/helpers/recording-uploads";
import { SidekickSim } from "@/helpers/sidekick-sim";
import { DeviceSim } from "@/helpers/device-sim";
import { addDays, addMinutes } from "@/helpers/date-helpers";
import { spreadLocations } from "@/helpers/location-helpers";
import { confirmEmailAddressViaApi } from "@/helpers/email-utils";
import type { Page } from "@playwright/test";
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

const sha256Hex = async (data: ArrayBuffer): Promise<string> => {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(Buffer.from(data)).digest("hex");
};

// Hash the bytes behind the blob: URL of the reference image currently displayed in the player.
const displayedReferenceImageHash = async (page: Page): Promise<string | null> =>
  page.evaluate(async () => {
    const img = document.querySelector<HTMLImageElement>(
      '[data-cy="recording view"] .reveal-slider img',
    );
    if (!img || !img.src) {
      return null;
    }
    const bytes = await (await fetch(img.src)).arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  });

test(`Navigating between recordings from different devices shows each device's own reference image`, async ({
  page,
  oneFrameCptv,
  deviceReferenceImage,
}) => {
  const now = new Date();
  now.setHours(11, 16, 0);
  const initialDateTime = addDays(now, -5);
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const projectName = project.projectHandle.testId;
  const adminUser = project.getAdminUser();
  const AdminUser = project.api();
  const deviceA = project.getDevice();
  const deviceB = await addDeviceToProject("Second", project.projectHandle, initialDateTime);
  project.deviceHandles.push(deviceB);
  const [locationA, locationB] = spreadLocations(project.locationBase, 2);

  // Two visibly different reference images (trailing bytes after the JPEG EOI marker are ignored by decoders)
  const imageA = Buffer.concat([Buffer.from(deviceReferenceImage), Buffer.from("device-a")]);
  const imageB = Buffer.concat([Buffer.from(deviceReferenceImage), Buffer.from("device-b-longer")]);

  await test.step("Give each device a location and a different reference image", async () => {
    for (const [device, location, image] of [
      [deviceA, locationA, imageA],
      [deviceB, locationB, imageB],
    ] as const) {
      const sidekick = new SidekickSim(adminUser);
      sidekick.connectToDevice(new DeviceSim(device, false));
      sidekick.addLocation(
        location,
        `location for device ${device.id}`,
        addMinutes(initialDateTime, 1),
      );
      sidekick.addReferencePhoto(new Uint8Array(image).buffer, addMinutes(initialDateTime, 2));
      sidekick.disconnectFromDevice();
      await sidekick.syncWithApi();
    }
  });

  const expectedHashes = new Map<number, string>();
  await test.step("Fetch the stored reference images", async () => {
    for (const device of [deviceA, deviceB]) {
      const response = await AdminUser.Devices.getReferenceImageForDeviceAtTime(
        device.id,
        addMinutes(initialDateTime, 10),
        true,
      );
      expect(response.success, `reference image exists for device #${device.id}`).toBe(true);
      expectedHashes.set(device.id, await sha256Hex(await (response.result as Blob).arrayBuffer()));
    }
    expect(expectedHashes.get(deviceA.id), "devices have different reference images").not.toEqual(
      expectedHashes.get(deviceB.id),
    );
  });

  // Alternating devices, so that the third and fourth recordings revisit cached images.
  const devices = [deviceA, deviceB, deviceA, deviceB];
  const uploads =
    await test.step("Upload alternating recordings from the two devices", async () => {
      const results = [];
      for (const [i, device] of devices.entries()) {
        const [upload] = await uploadThermalRecordingsFromDeviceWithTimesAndDurations(
          [
            {
              recordingDateTime: addMinutes(initialDateTime, 10 + i),
              durationSeconds: 40,
              tracks: ["possum"],
            },
          ],
          device,
          device === deviceA ? locationA : locationB,
          oneFrameCptv,
        );
        results.push(upload);
      }
      return results;
    });

  await test.step("Sign in and open the first recording", async () => {
    await confirmEmailAddressViaApi(adminUser);
    await signInExistingUser(page, adminUser.testId);
    await waitToNavigateToProject(page, projectName);
    await page.getByTestId("activity search").click();
    await waitToNavigateToProjectPage(page, projectName, "activity");
    await page.getByTestId("recordings search").click();
    await page.getByTestId("include false triggers").click();
    await page.getByTestId(`recording ${devices.length - 1}`).click();
    await waitToNavigateToProjectPage(
      page,
      projectName,
      `activity/recording/${uploads[0].recordingId}/**`,
    );
  });

  const recordingView = page.getByTestId("recording view");
  await expect(recordingView.getByTestId("track 0"), "tracks loaded").toBeVisible();

  const checkReferenceImage = async (index: number) => {
    await expect
      .poll(() => displayedReferenceImageHash(page), {
        message: `recording #${index} shows the reference image for device #${devices[index].id}`,
      })
      .toEqual(expectedHashes.get(devices[index].id));
  };

  await checkReferenceImage(0);
  for (let i = 1; i < devices.length; i++) {
    await test.step(`Go to next recording #${i}`, async () => {
      await recordingView.getByTestId("goto next recording").click();
      await waitToNavigateToProjectPage(
        page,
        projectName,
        `activity/recording/${uploads[i].recordingId}/**`,
      );
      await expect(recordingView.getByTestId("track 0"), "tracks loaded").toBeVisible();
      await checkReferenceImage(i);
    });
  }
  for (let i = devices.length - 2; i >= 0; i--) {
    await test.step(`Go back to previous recording #${i}`, async () => {
      await recordingView.getByTestId("goto previous recording").click();
      await waitToNavigateToProjectPage(
        page,
        projectName,
        `activity/recording/${uploads[i].recordingId}/**`,
      );
      await expect(recordingView.getByTestId("track 0"), "tracks loaded").toBeVisible();
      await checkReferenceImage(i);
    });
  }
});

test(`Navigating to a recording from a device with no reference image hides the previous device's reference image`, async ({
  page,
  oneFrameCptv,
  deviceReferenceImage,
}) => {
  const now = new Date();
  now.setHours(11, 16, 0);
  const initialDateTime = addDays(now, -5);
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const projectName = project.projectHandle.testId;
  const adminUser = project.getAdminUser();
  const AdminUser = project.api();
  const deviceWithImage = project.getDevice();
  const deviceWithoutImage = await addDeviceToProject(
    "NoImage",
    project.projectHandle,
    initialDateTime,
  );
  project.deviceHandles.push(deviceWithoutImage);
  const [locationWithImage, locationWithoutImage] = spreadLocations(project.locationBase, 2);

  await test.step("Both devices get a location, but only one gets a reference image", async () => {
    for (const [device, location, withImage] of [
      [deviceWithImage, locationWithImage, true],
      [deviceWithoutImage, locationWithoutImage, false],
    ] as const) {
      const sidekick = new SidekickSim(adminUser);
      sidekick.connectToDevice(new DeviceSim(device, false));
      sidekick.addLocation(
        location,
        `location for device ${device.id}`,
        addMinutes(initialDateTime, 1),
      );
      if (withImage) {
        sidekick.addReferencePhoto(deviceReferenceImage, addMinutes(initialDateTime, 2));
      }
      sidekick.disconnectFromDevice();
      await sidekick.syncWithApi();
    }
  });

  let expectedHash: string;
  await test.step("Check the API agrees about which device has an image", async () => {
    const withImage = await AdminUser.Devices.getReferenceImageForDeviceAtTime(
      deviceWithImage.id,
      addMinutes(initialDateTime, 10),
      true,
    );
    expect(withImage.success, "first device has a reference image").toBe(true);
    expectedHash = await sha256Hex(await (withImage.result as Blob).arrayBuffer());
    const withoutImage = await AdminUser.Devices.hasReferenceImageForDeviceAtTime(
      deviceWithoutImage.id,
      addMinutes(initialDateTime, 10),
      true,
    );
    expect(withoutImage.success, "second device has no reference image").toBe(false);
  });

  // Image, none, image: covers hiding the stale image, and then showing it again.
  const devices = [deviceWithImage, deviceWithoutImage, deviceWithImage];
  const uploads = await test.step("Upload recordings from the two devices", async () => {
    const results = [];
    for (const [i, device] of devices.entries()) {
      const [upload] = await uploadThermalRecordingsFromDeviceWithTimesAndDurations(
        [
          {
            recordingDateTime: addMinutes(initialDateTime, 10 + i),
            durationSeconds: 40,
            tracks: ["possum"],
          },
        ],
        device,
        device === deviceWithImage ? locationWithImage : locationWithoutImage,
        oneFrameCptv,
      );
      results.push(upload);
    }
    return results;
  });

  await test.step("Sign in and open the first recording", async () => {
    await confirmEmailAddressViaApi(adminUser);
    await signInExistingUser(page, adminUser.testId);
    await waitToNavigateToProject(page, projectName);
    await page.getByTestId("activity search").click();
    await waitToNavigateToProjectPage(page, projectName, "activity");
    await page.getByTestId("recordings search").click();
    await page.getByTestId("include false triggers").click();
    await page.getByTestId(`recording ${devices.length - 1}`).click();
    await waitToNavigateToProjectPage(
      page,
      projectName,
      `activity/recording/${uploads[0].recordingId}/**`,
    );
  });

  const recordingView = page.getByTestId("recording view");
  await expect(recordingView.getByTestId("track 0"), "tracks loaded").toBeVisible();
  const referenceImage = recordingView.locator(".reveal-slider img");

  await test.step("First recording shows its device's reference image", async () => {
    await expect
      .poll(() => displayedReferenceImageHash(page), { message: "reference image is shown" })
      .toEqual(expectedHash);
  });

  await test.step("Device with no reference image shows none", async () => {
    await recordingView.getByTestId("goto next recording").click();
    await waitToNavigateToProjectPage(
      page,
      projectName,
      `activity/recording/${uploads[1].recordingId}/**`,
    );
    await expect(recordingView.getByTestId("track 0"), "tracks loaded").toBeVisible();
    await expect(referenceImage, "previous device's image is gone").toHaveCount(0);
  });

  await test.step("Going back to the device with an image shows it again", async () => {
    await recordingView.getByTestId("goto next recording").click();
    await waitToNavigateToProjectPage(
      page,
      projectName,
      `activity/recording/${uploads[2].recordingId}/**`,
    );
    await expect(recordingView.getByTestId("track 0"), "tracks loaded").toBeVisible();
    await expect
      .poll(() => displayedReferenceImageHash(page), { message: "reference image is shown again" })
      .toEqual(expectedHash);
  });
});
