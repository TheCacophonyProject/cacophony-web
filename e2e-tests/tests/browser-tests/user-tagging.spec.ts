import { expect, test } from "@/helpers/upload-tests";
import type { Page } from "@playwright/test";
import { addDays, addMinutes } from "@/helpers/date-helpers";
import { createProjectWithUserAndDevice } from "@/helpers/create-test-entities";
import type { ApiRecordingResponse } from "@shared/api/recording";
import { uploadThermalRecordingsFromDeviceWithTimesAndDurations } from "@/helpers/recording-uploads";
import { confirmEmailAddressViaApi } from "@/helpers/email-utils";
import {
  signInExistingUser,
  waitToNavigateToProject,
  waitToNavigateToProjectPage,
} from "@/helpers/browse-helpers";

// The default set of quick-tag buttons shown for thermal recordings, as their display names
// (which is what the buttons' test ids are keyed on).
const DEFAULT_THERMAL_BUTTONS = [
  "possum",
  "rodent",
  "hedgehog",
  "cat",
  "bird",
  "mustelid",
  "false trigger",
  "not identifiable",
];

const setupAndOpenRecording = async (page: Page, oneFrameCptv: ArrayBuffer) => {
  const now = new Date();
  now.setHours(11, 16, 0);
  const initialDateTime = addDays(now, -5);
  const project = await createProjectWithUserAndDevice({ initialDateTime });
  const adminUser = project.getAdminUser();
  const projectName = project.projectHandle.testId;
  const [{ recordingId }] = await uploadThermalRecordingsFromDeviceWithTimesAndDurations(
    [
      {
        recordingDateTime: addMinutes(initialDateTime, 2),
        durationSeconds: 40,
        tracks: ["possum", "cat"],
      },
    ],
    project.getDevice(),
    project.locationBase,
    oneFrameCptv,
  );

  await test.step("Sign in user", async () => {
    await confirmEmailAddressViaApi(adminUser);
    await signInExistingUser(page, adminUser.testId);
    await waitToNavigateToProject(page, projectName);
  });

  await test.step("Go to activity view, open the recording", async () => {
    await page.getByTestId("activity search").click();
    await waitToNavigateToProjectPage(page, projectName, "activity");
    await page.getByTestId("recordings search").click();
    await page.getByTestId("recording 0").click();
    await waitToNavigateToProjectPage(page, projectName, `activity/recording/${recordingId}/**`);
  });

  const recordingView = page.getByTestId("recording view");
  await expect(recordingView, "recording selected").toBeVisible();
  await expect(recordingView.getByTestId("track 0"), "tracks loaded").toBeVisible();
  return { recordingView, recordingId, projectName, project };
};

test.describe("User tagging of thermal recordings", () => {
  test("All images on the tagging buttons load correctly", async ({ oneFrameCptv, page }) => {
    const { recordingView } = await setupAndOpenRecording(page, oneFrameCptv);

    for (const trackIndex of [0, 1]) {
      await test.step(`Expand track ${trackIndex} tagging interface`, async () => {
        const track = recordingView.getByTestId(`track ${trackIndex}`);
        await track.click();
        await expect(
          track.getByTestId("classification button possum"),
          "classifications expanded",
        ).toBeVisible();

        const buttons = track.locator('[data-cy^="classification button "]');
        await expect(buttons, "default tag buttons are shown").toHaveCount(
          DEFAULT_THERMAL_BUTTONS.length,
        );

        for (const tag of DEFAULT_THERMAL_BUTTONS) {
          const button = track.getByTestId(`classification button ${tag}`);
          await expect(button, `${tag} button exists`).toBeVisible();
          // Images may be lazily loaded when scrolled into view.
          await button.scrollIntoViewIfNeeded();
          const image = button.locator("img");
          await expect(image, `${tag} has an image`).toHaveCount(1);
          await expect(image, `${tag} image is not marked as missing`).not.toHaveClass(
            /image-not-found/,
          );
          await expect(async () => {
            const loaded = await image.evaluate(
              (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
            );
            expect(loaded, `${tag} image loaded`).toBe(true);
          }, `${tag} image loads`).toPass();
        }
      });
    }
  });

  // `label` is the classification label, `display` is the text shown on the resulting button, and
  // `path` is the chain of parent classifications to descend through to reach it in the taxonomy.
  const customTags = [
    { description: "without a space", label: "quoll", display: "quoll", path: ["mammal"] },
    {
      description: "with a space",
      label: "sambar deer",
      display: "sambar deer",
      path: ["mammal", "deer"],
    },
  ];
  for (const method of ["searching", "browsing the hierarchy"] as const) {
    for (const { description, label, display, path } of customTags) {
      test(`User can add a custom tag ${description} by ${method} in the tag selection modal`, async ({
        oneFrameCptv,
        page,
      }) => {
        const { recordingView, recordingId, project } = await setupAndOpenRecording(
          page,
          oneFrameCptv,
        );
        const track = recordingView.getByTestId("track 0");
        const modal = recordingView.getByTestId("custom tag selection");

        await test.step("Expand the track, open the custom tag modal", async () => {
          await track.click();
          await expect(track.getByTestId("classification button possum")).toBeVisible();
          await expect(
            track.getByTestId(`classification button ${display}`),
            "custom tag isn't shown before it's added",
          ).toHaveCount(0);
          await track.getByTestId("add custom tag").click();
          await expect(modal).toBeVisible();
        });

        if (method === "searching") {
          await test.step(`Search for and select '${label}'`, async () => {
            await modal.getByTestId("tag search").fill(label);
            await modal.getByTestId(`tag option ${label}`).click();
          });
        } else {
          await test.step(`Descend through ${path.join(" > ")} and select '${label}'`, async () => {
            for (const parent of path) {
              await modal.getByTestId(`tag children ${parent}`).click();
            }
            await modal.getByTestId(`tag option ${label}`).click();
          });
        }
        await expect(modal, "modal closes after selection").toBeHidden();

        await test.step("The custom tag is applied to the track", async () => {
          await expect(track.getByTestId(`classification button ${display}`)).toBeVisible();
          await expect(async () => {
            const recording = (await project
              .api()
              .Recordings.getRecordingById(recordingId)) as ApiRecordingResponse;
            const humanTags = recording.tracks.flatMap(({ tags }) =>
              tags.filter(({ automatic }) => !automatic).map(({ what }) => what),
            );
            expect(humanTags).toEqual([label]);
          }).toPass();
        });
      });
    }
  }
});
