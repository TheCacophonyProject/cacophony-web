import { expect, test } from "@/helpers/upload-tests";
import { createProjectWithUserAndDevice } from "@/helpers/create-test-entities";
import { uploadRecordingsFromDeviceWithTimesAndDurations } from "@/helpers/recording-uploads";
import { addDays, addMinutes } from "@/helpers/date-helpers";
import { confirmEmailAddressViaApi } from "@/helpers/email-utils";
import {
  signInExistingUser,
  waitToNavigateToProject,
  waitToNavigateToProjectPage,
} from "@/helpers/browse-helpers";

test("Human classifying recordings correctly updates visits context", async ({
  page,
  oneFrameCptv,
}) => {
  const aiClassification = "possum";
  const { recordingId, projectName } =
    await test.step("Init project with classified recordings, sign in user", async () => {
      const now = new Date();
      now.setHours(11, 16, 0);
      const initialDateTime = addDays(now, -5);
      const project = await createProjectWithUserAndDevice({ initialDateTime });
      const adminUser = project.getAdminUser();
      const projectName = project.projectHandle.testId;
      const [{ recordingId, tracks }] = await uploadRecordingsFromDeviceWithTimesAndDurations(
        [
          {
            recordingDateTime: addMinutes(initialDateTime, 2),
            durationSeconds: 40,
            tracks: [aiClassification],
          },
        ],
        project.getDevice(),
        project.locationBase,
        oneFrameCptv,
      );
      await test.step("Sign in user", async () => {
        await confirmEmailAddressViaApi(adminUser);
        // Log in user.
        await signInExistingUser(page, adminUser.testId);
        await waitToNavigateToProject(page, projectName);
      });
      return { recordingId, projectName };
    });
  await test.step("Go to activity view", async () => {
    await page.getByTestId("activity search").click();
    await waitToNavigateToProjectPage(page, projectName, "activity");
  });
  const group0 = await test.step("Locate and expand first day of visits", async () => {
    const group0 = page.getByTestId("visit group 0");
    const speciesCount = group0
      .getByTestId(`visit species ${aiClassification}`)
      .getByTestId("visit count");
    await expect(speciesCount).toBeVisible();
    await expect(speciesCount, `correct number of ${aiClassification} visits`).toHaveText("1", {
      timeout: 10,
    });
    // Expand group
    await group0.click();
    return group0;
  });
  const recordingView = await test.step("Select only visit, open recording modal", async () => {
    await group0.getByTestId(`visit species ${aiClassification}`).click();
    await waitToNavigateToProjectPage(
      page,
      projectName,
      `activity/visit/${aiClassification}/${recordingId}/**`,
    );
    const recordingView = page.getByTestId("recording view");
    await expect(recordingView, "recording selected").toBeVisible();
    await expect(recordingView.getByTestId("track 0"), "tracks loaded").toBeVisible();
    return recordingView;
  });
  await test.step("Expand single track, tag as rodent", async () => {
    const track0 = recordingView.getByTestId("track 0");
    await track0.click();
    const rodentTag = track0.getByTestId(`classification button rodent`);
    await expect(rodentTag, "classifications expanded").toBeVisible();
    await rodentTag.click();
    await waitToNavigateToProjectPage(page, projectName, `activity/visit/rodent/${recordingId}/**`);
  });
  await test.step("Close recording modal", async () => {
    await recordingView.getByTestId("close recording view").click();
    await waitToNavigateToProjectPage(page, projectName, `activity`);
  });
  await expect(
    group0.getByTestId(`visit species rodent`),
    "visit has changed to rodent",
  ).toBeVisible();
});

test("Deleting a recording in the middle of a visit splits original visit in visit context list", async ({
  page,
  oneFrameCptv,
}) => {
  const aiClassification = "possum";
  const { recordingIds, projectName } =
    await test.step("Init project with classified recordings, sign in user", async () => {
      const now = new Date();
      now.setHours(11, 16, 0);
      const initialDateTime = addDays(now, -5);
      const project = await createProjectWithUserAndDevice({ initialDateTime });
      const adminUser = project.getAdminUser();
      const projectName = project.projectHandle.testId;
      const uploads = await uploadRecordingsFromDeviceWithTimesAndDurations(
        [
          {
            recordingDateTime: addMinutes(initialDateTime, 2),
            durationSeconds: 40,
            tracks: [{ tag: aiClassification, weight: 7 }],
          },
          {
            recordingDateTime: addMinutes(initialDateTime, 7),
            durationSeconds: 40,
            tracks: [aiClassification],
          },
          {
            recordingDateTime: addMinutes(initialDateTime, 14),
            durationSeconds: 40,
            tracks: [{ tag: aiClassification, weight: 10 }],
          },
        ],
        project.getDevice(),
        project.locationBase,
        oneFrameCptv,
      );
      await test.step("Sign in user", async () => {
        await confirmEmailAddressViaApi(adminUser);
        // Log in user.
        await signInExistingUser(page, adminUser.testId);
        await waitToNavigateToProject(page, projectName);
      });
      const recordingIds = uploads.map((r) => r.recordingId);
      return { recordingIds, projectName };
    });

  await test.step("Go to activity view", async () => {
    await page.getByTestId("activity search").click();
    await waitToNavigateToProjectPage(page, projectName, "activity");
  });

  const group0 = await test.step("Locate and expand first day visits group", async () => {
    const group0 = page.getByTestId("visit group 0");
    const speciesCount = group0
      .getByTestId(`visit species ${aiClassification}`)
      .getByTestId("visit count");
    await expect(speciesCount).toBeVisible();
    await expect(speciesCount, `correct number of ${aiClassification} visits`).toHaveText("1", {
      timeout: 10,
    });
    // Expand group
    await group0.click();
    return group0;
  });
  await test.step("Check single visit is as expected", async () => {
    const visit1 = group0.getByTestId("visit 1");
    await expect(visit1.getByTestId("visit start time")).toContainText("11:18 AM");
    await expect(visit1.getByTestId("visit duration")).toContainText("12m 40s");
    await expect(visit1.getByTestId("visit recording count")).toContainText("3");

    await expect(group0.getByTestId(`visit species ${aiClassification}`)).toBeVisible();
    await expect(group0.getByTestId("visit 2")).not.toBeAttached();
  });
  await test.step("Select single visit, open recording modal", async () => {
    await group0.getByTestId(`visit species ${aiClassification}`).click();
  });
  {
    const recordingView =
      await test.step("Open recording modal to best recording in visit", async () => {
        // The canonical recording for the visit should be the third one; it has the "best" track.
        await waitToNavigateToProjectPage(
          page,
          projectName,
          `activity/visit/${aiClassification}/${recordingIds[2]}/**`,
        );
        const recordingView = page.getByTestId("recording view");
        await expect(recordingView, "recording selected").toBeVisible();
        await expect(recordingView.getByTestId("track 0"), "tracks loaded").toBeVisible();
        await expect(recordingView.getByTestId("recording start time")).toHaveText("11:30:00 AM");
        return recordingView;
      });

    // Go back to the middle recording of the visit
    await test.step("Go back to previous recording", async () => {
      await recordingView.getByTestId("goto previous recording").click();
      await waitToNavigateToProjectPage(
        page,
        projectName,
        `activity/visit/${aiClassification}/${recordingIds[1]}/**`,
      );
      await expect(recordingView.getByTestId("track 0"), "tracks loaded").toBeVisible();
    });

    await test.step(`Delete selected recording (#${recordingIds[1]})`, async () => {
      await recordingView.getByTestId("delete recording").click();
      await page.getByTestId("confirm action").click();
    });

    await test.step(`Wait to go to next recording (#${recordingIds[2]})`, async () => {
      // The number of recordings in the url should go down to one
      await waitToNavigateToProjectPage(
        page,
        projectName,
        `activity/visit/${aiClassification}/${recordingIds[2]}/${recordingIds[2]}/**`,
      );
      await expect(recordingView.getByTestId("visit duration")).toContainText(
        "11:30 AM (40 seconds)",
      );
      await expect(recordingView.getByTestId("track 0"), "tracks loaded").toBeVisible();
      await expect(
        recordingView.getByTestId("goto previous visit"),
        "there is a previous visit",
      ).toBeVisible();
      await expect(
        recordingView.getByTestId("goto previous recording"),
        "there is no previous recording",
      ).not.toBeAttached();
      await expect(
        recordingView.getByTestId("goto next visit"),
        "there is no next visit",
      ).not.toBeAttached();
      await expect(
        recordingView.getByTestId("goto next recording"),
        "there is no next recording",
      ).not.toBeAttached();
    });

    await test.step("Go to previous visit", async () => {
      await recordingView.getByTestId("goto previous visit").click();
      await waitToNavigateToProjectPage(
        page,
        projectName,
        `activity/visit/${aiClassification}/${recordingIds[0]}/${recordingIds[0]}/**`,
      );
      await expect(recordingView.getByTestId("visit duration")).toContainText(
        "11:18 AM (40 seconds)",
      );
      await expect(recordingView.getByTestId("track 0"), "tracks loaded").toBeVisible();
      await expect(
        recordingView.getByTestId("goto next visit"),
        "there is a next visit",
      ).toBeVisible();
      await expect(
        recordingView.getByTestId("goto next recording"),
        "there is no next recording",
      ).not.toBeAttached();
      await expect(
        recordingView.getByTestId("goto previous visit"),
        "there is no previous visit",
      ).not.toBeAttached();
      await expect(
        recordingView.getByTestId("goto previous recording"),
        "there is no previous recording",
      ).not.toBeAttached();
    });

    await test.step("Close recording modal", async () => {
      await recordingView.getByTestId("close recording view").click();
      await waitToNavigateToProjectPage(page, projectName, `activity`);
    });
  }
  await test.step("Check that there are now two visits", async () => {
    await expect(group0.getByTestId("visit 1")).toBeVisible();
    await expect(group0.getByTestId("visit 2")).toBeVisible();
  });
});

test("Human tagging two different tracks in the *same* recording with different classifications splits original visit in visit context list", async ({
  page,
  oneFrameCptv,
}) => {
  // TODO
});

test("Human tagging two different tracks in two different recordings with different classifications splits original visit in visit context list", async ({
  page,
  oneFrameCptv,
}) => {
  const aiClassification = "possum";
  const { recordingIds, projectName } =
    await test.step("Init project with classified recordings, sign in user", async () => {
      const now = new Date();
      now.setHours(11, 16, 0);
      const initialDateTime = addDays(now, -5);
      const project = await createProjectWithUserAndDevice({ initialDateTime });
      const adminUser = project.getAdminUser();
      const projectName = project.projectHandle.testId;
      const uploads = await uploadRecordingsFromDeviceWithTimesAndDurations(
        [
          {
            recordingDateTime: addMinutes(initialDateTime, 2),
            durationSeconds: 40,
            tracks: [{ tag: aiClassification, weight: 7 }],
          },
          {
            recordingDateTime: addMinutes(initialDateTime, 7),
            durationSeconds: 40,
            tracks: [aiClassification],
          },
          {
            recordingDateTime: addMinutes(initialDateTime, 14),
            durationSeconds: 40,
            tracks: [{ tag: aiClassification, weight: 10 }],
          },
        ],
        project.getDevice(),
        project.locationBase,
        oneFrameCptv,
      );
      await test.step("Sign in user", async () => {
        await confirmEmailAddressViaApi(adminUser);
        // Log in user.
        await signInExistingUser(page, adminUser.testId);
        await waitToNavigateToProject(page, projectName);
      });
      const recordingIds = uploads.map((r) => r.recordingId);
      return { recordingIds, projectName };
    });

  await test.step("Go to activity view", async () => {
    await page.getByTestId("activity search").click();
    await waitToNavigateToProjectPage(page, projectName, "activity");
  });

  const group0 = await test.step("Locate and expand first day visits group", async () => {
    const group0 = page.getByTestId("visit group 0");
    const speciesCount = group0
      .getByTestId(`visit species ${aiClassification}`)
      .getByTestId("visit count");
    await expect(speciesCount).toBeVisible();
    await expect(speciesCount, `correct number of ${aiClassification} visits`).toHaveText("1", {
      timeout: 10,
    });
    // Expand group
    await group0.click();
    return group0;
  });
  await test.step("Check single visit is as expected", async () => {
    const visit1 = group0.getByTestId("visit 1");
    await expect(visit1.getByTestId("visit start time")).toContainText("11:18 AM");
    await expect(visit1.getByTestId("visit duration")).toContainText("12m 40s");
    await expect(visit1.getByTestId("visit recording count")).toContainText("3");

    await expect(group0.getByTestId(`visit species ${aiClassification}`)).toBeVisible();
    await expect(group0.getByTestId("visit 2")).not.toBeAttached();
  });
  await test.step("Select single visit, open recording modal", async () => {
    await group0.getByTestId(`visit species ${aiClassification}`).click();
  });
  {
    const recordingView =
      await test.step("Open recording modal to best recording in visit", async () => {
        // The canonical recording for the visit should be the third one; it has the "best" track.
        await waitToNavigateToProjectPage(
          page,
          projectName,
          `activity/visit/${aiClassification}/${recordingIds[2]}/**`,
        );
        const recordingView = page.getByTestId("recording view");
        await expect(recordingView, "recording selected").toBeVisible();
        await expect(recordingView.getByTestId("track 0"), "tracks loaded").toBeVisible();
        await expect(recordingView.getByTestId("recording start time")).toHaveText("11:30:00 AM");
        return recordingView;
      });

    // TODO: Implement, tag one recording as confirmed possum, tag another as cat

    // Go back to the middle recording of the visit
    await test.step("Go back to previous recording", async () => {
      await recordingView.getByTestId("goto previous recording").click();
      await waitToNavigateToProjectPage(
        page,
        projectName,
        `activity/visit/${aiClassification}/${recordingIds[1]}/**`,
      );
      await expect(recordingView.getByTestId("track 0"), "tracks loaded").toBeVisible();
    });

    await test.step(`Wait to go to next recording (#${recordingIds[2]})`, async () => {
      // The number of recordings in the url should go down to one
      await waitToNavigateToProjectPage(
        page,
        projectName,
        `activity/visit/${aiClassification}/${recordingIds[2]}/${recordingIds[2]}/**`,
      );
      await expect(recordingView.getByTestId("visit duration")).toContainText(
        "11:30 AM (40 seconds)",
      );
      await expect(recordingView.getByTestId("track 0"), "tracks loaded").toBeVisible();
      await expect(
        recordingView.getByTestId("goto previous visit"),
        "there is a previous visit",
      ).toBeVisible();
      await expect(
        recordingView.getByTestId("goto previous recording"),
        "there is no previous recording",
      ).not.toBeAttached();
      await expect(
        recordingView.getByTestId("goto next visit"),
        "there is no next visit",
      ).not.toBeAttached();
      await expect(
        recordingView.getByTestId("goto next recording"),
        "there is no next recording",
      ).not.toBeAttached();
    });

    await test.step("Go to previous visit", async () => {
      await recordingView.getByTestId("goto previous visit").click();
      await waitToNavigateToProjectPage(
        page,
        projectName,
        `activity/visit/${aiClassification}/${recordingIds[0]}/${recordingIds[0]}/**`,
      );
      await expect(recordingView.getByTestId("visit duration")).toContainText(
        "11:18 AM (40 seconds)",
      );
      await expect(recordingView.getByTestId("track 0"), "tracks loaded").toBeVisible();
      await expect(
        recordingView.getByTestId("goto next visit"),
        "there is a next visit",
      ).toBeVisible();
      await expect(
        recordingView.getByTestId("goto next recording"),
        "there is no next recording",
      ).not.toBeAttached();
      await expect(
        recordingView.getByTestId("goto previous visit"),
        "there is no previous visit",
      ).not.toBeAttached();
      await expect(
        recordingView.getByTestId("goto previous recording"),
        "there is no previous recording",
      ).not.toBeAttached();
    });

    await test.step("Close recording modal", async () => {
      await recordingView.getByTestId("close recording view").click();
      await waitToNavigateToProjectPage(page, projectName, `activity`);
    });
  }
  await test.step("Check that there are now two visits", async () => {
    await expect(group0.getByTestId("visit 1")).toBeVisible();
    await expect(group0.getByTestId("visit 2")).toBeVisible();
  });
});

test("Two humans classifying the same track differently results in split visits, controversial label", async () => {
  // TODO
});

test("Deleting a recording at the end of a visit shortens the length in the visit context list", async ({
  page,
  oneFrameCptv,
}) => {
  const aiClassification = "possum";
  const { recordingIds, projectName } =
    await test.step("Init project with classified recordings, sign in user", async () => {
      const now = new Date();
      now.setHours(11, 16, 0);
      const initialDateTime = addDays(now, -5);
      const project = await createProjectWithUserAndDevice({ initialDateTime });
      const adminUser = project.getAdminUser();
      const projectName = project.projectHandle.testId;
      const uploads = await uploadRecordingsFromDeviceWithTimesAndDurations(
        [
          {
            recordingDateTime: addMinutes(initialDateTime, 2),
            durationSeconds: 40,
            tracks: [{ tag: aiClassification, weight: 7 }],
          },
          {
            recordingDateTime: addMinutes(initialDateTime, 7),
            durationSeconds: 40,
            tracks: [aiClassification],
          },
          {
            recordingDateTime: addMinutes(initialDateTime, 14),
            durationSeconds: 40,
            tracks: [{ tag: aiClassification, weight: 10 }],
          },
        ],
        project.getDevice(),
        project.locationBase,
        oneFrameCptv,
      );
      await test.step("Sign in user", async () => {
        await confirmEmailAddressViaApi(adminUser);
        // Log in user.
        await signInExistingUser(page, adminUser.testId);
        await waitToNavigateToProject(page, projectName);
      });
      const recordingIds = uploads.map((r) => r.recordingId);
      return { recordingIds, projectName };
    });

  await test.step("Go to activity view", async () => {
    await page.getByTestId("activity search").click();
    await waitToNavigateToProjectPage(page, projectName, "activity");
  });

  const group0 = await test.step("Locate and expand the first day visit group", async () => {
    const group0 = page.getByTestId("visit group 0");
    const speciesCount = group0
      .getByTestId(`visit species ${aiClassification}`)
      .getByTestId("visit count");
    await expect(speciesCount).toBeVisible();
    await expect(speciesCount, `correct number of ${aiClassification} visits`).toHaveText("1", {
      timeout: 10,
    });
    // Expand group
    await group0.click();
    return group0;
  });
  await test.step("Check that initial visit in group is as expected", async () => {
    const visit1 = group0.getByTestId("visit 1");
    await expect(visit1.getByTestId("visit start time")).toContainText("11:18 AM");
    await expect(visit1.getByTestId("visit duration")).toContainText("12m 40s");
    await expect(visit1.getByTestId("visit recording count")).toContainText("3");
    await expect(
      group0.getByTestId(`visit species ${aiClassification}`),
      `visit classification is ${aiClassification}`,
    ).toBeVisible();
    await expect(group0.getByTestId("visit 2"), "there is no second visit").not.toBeAttached();
  });
  const recordingView =
    await test.step("Select the single visit, open recording modal", async () => {
      await group0.getByTestId(`visit species ${aiClassification}`).click();
      // The canonical recording for the visit should be the third one; it has the "best" track.
      await waitToNavigateToProjectPage(
        page,
        projectName,
        `activity/visit/${aiClassification}/${recordingIds[2]}/**`,
      );
      const recordingView = page.getByTestId("recording view");
      await expect(recordingView, "recording selected").toBeVisible();
      await expect(recordingView.getByTestId("track 0"), "tracks loaded").toBeVisible();
      return recordingView;
    });

  await test.step("Delete the canonical visit recording (at the end of the visit)", async () => {
    await recordingView.getByTestId("delete recording").click();
    await page.getByTestId("confirm action").click();
  });

  await test.step("Wait to navigate to the previous recording in the now shortened visit", async () => {
    await waitToNavigateToProjectPage(
      page,
      projectName,
      `activity/visit/${aiClassification}/${recordingIds[1]}/**`,
    );
    await expect(recordingView.getByTestId("visit duration")).toContainText("11:23");
  });

  await test.step("Close recording modal", async () => {
    await page.getByTestId("close recording view").click();
    await waitToNavigateToProjectPage(page, projectName, `activity`);
  });

  await test.step("Check shortened visit", async () => {
    const visit1 = group0.getByTestId("visit 1");
    await expect(visit1).toBeVisible();
    await expect(visit1.getByTestId("visit start time")).toContainText("11:18 AM");
    await expect(visit1.getByTestId("visit duration"), "visit duration is reduced").toContainText(
      "5m 40s",
    );
    await expect(visit1.getByTestId("visit recording count")).toContainText("2");
    await expect(group0.getByTestId("visit 2")).not.toBeAttached();
  });
});

test("Deleting a recording at the start of a visit moves start time forwards in the visit context list", async ({
  page,
  oneFrameCptv,
}) => {
  const aiClassification = "possum";
  const { recordingIds, projectName } =
    await test.step("Init project with classified recordings, sign in user", async () => {
      const now = new Date();
      now.setHours(11, 16, 0);
      const initialDateTime = addDays(now, -5);
      const project = await createProjectWithUserAndDevice({ initialDateTime });
      const adminUser = project.getAdminUser();
      const projectName = project.projectHandle.testId;
      const uploads = await uploadRecordingsFromDeviceWithTimesAndDurations(
        [
          {
            recordingDateTime: addMinutes(initialDateTime, 2),
            durationSeconds: 40,
            tracks: [{ tag: aiClassification, weight: 7 }],
          },
          {
            recordingDateTime: addMinutes(initialDateTime, 7),
            durationSeconds: 40,
            tracks: [aiClassification],
          },
          {
            recordingDateTime: addMinutes(initialDateTime, 14),
            durationSeconds: 40,
            tracks: [{ tag: aiClassification, weight: 10 }],
          },
        ],
        project.getDevice(),
        project.locationBase,
        oneFrameCptv,
      );
      await test.step("Sign in user", async () => {
        await confirmEmailAddressViaApi(adminUser);
        // Log in user.
        await signInExistingUser(page, adminUser.testId);
        await waitToNavigateToProject(page, projectName);
      });
      const recordingIds = uploads.map((r) => r.recordingId);
      return { recordingIds, projectName };
    });

  await test.step("Go to activity view", async () => {
    await page.getByTestId("activity search").click();
    await waitToNavigateToProjectPage(page, projectName, "activity");
  });

  const group0 = await test.step("Locate and expand the first day visit group", async () => {
    const group0 = page.getByTestId("visit group 0");
    const speciesCount = group0
      .getByTestId(`visit species ${aiClassification}`)
      .getByTestId("visit count");
    await expect(speciesCount).toBeVisible();
    await expect(speciesCount, `correct number of ${aiClassification} visits`).toHaveText("1", {
      timeout: 10,
    });
    // Expand group
    await group0.click();
    return group0;
  });
  await test.step("Check that initial visit in group is as expected", async () => {
    const visit1 = group0.getByTestId("visit 1");
    await expect(visit1.getByTestId("visit start time")).toContainText("11:18 AM");
    await expect(visit1.getByTestId("visit duration")).toContainText("12m 40s");
    await expect(visit1.getByTestId("visit recording count")).toContainText("3");
    await expect(
      group0.getByTestId(`visit species ${aiClassification}`),
      `visit classification is ${aiClassification}`,
    ).toBeVisible();
    await expect(group0.getByTestId("visit 2"), "there is no second visit").not.toBeAttached();
  });
  const recordingView =
    await test.step("Select the single visit, open recording modal", async () => {
      await group0.getByTestId(`visit species ${aiClassification}`).click();
      // The canonical recording for the visit should be the third one; it has the "best" track.
      await waitToNavigateToProjectPage(
        page,
        projectName,
        `activity/visit/${aiClassification}/${recordingIds[2]}/**`,
      );
      const recordingView = page.getByTestId("recording view");
      await expect(recordingView, "recording selected").toBeVisible();
      await expect(recordingView.getByTestId("track 0"), "tracks loaded").toBeVisible();
      return recordingView;
    });

  await test.step("Go to beginning of visit", async () => {
    await recordingView.getByTestId("goto previous recording").click();
    await waitToNavigateToProjectPage(
      page,
      projectName,
      `activity/visit/${aiClassification}/${recordingIds[1]}/**`,
    );
    await recordingView.getByTestId("goto previous recording").click();
    await waitToNavigateToProjectPage(
      page,
      projectName,
      `activity/visit/${aiClassification}/${recordingIds[0]}/**`,
    );
  });

  await test.step(`Delete the first visit recording (#${recordingIds[0]}) (at the start of the visit)`, async () => {
    await recordingView.getByTestId("delete recording").click();
    await page.getByTestId("confirm action").click();
  });

  await test.step("Wait to navigate to the next recording in the now shortened visit", async () => {
    await waitToNavigateToProjectPage(
      page,
      projectName,
      `activity/visit/${aiClassification}/${recordingIds[1]}/**`,
    );
    await expect(recordingView.getByTestId("visit duration")).toContainText(
      "11:23–11:30 AM (7 minutes 40 seconds)",
    );
  });

  await test.step("Close recording modal", async () => {
    await page.getByTestId("close recording view").click();
    await waitToNavigateToProjectPage(page, projectName, `activity`);
  });

  await test.step("Check shortened visit", async () => {
    const visit1 = group0.getByTestId("visit 1");
    await expect(visit1).toBeVisible();
    await expect(visit1.getByTestId("visit start time")).toContainText("11:23 AM");
    await expect(visit1.getByTestId("visit duration"), "visit duration is reduced").toContainText(
      "7m 40s",
    );
    await expect(visit1.getByTestId("visit recording count")).toContainText("2");
    await expect(group0.getByTestId("visit 2")).not.toBeAttached();
  });
});

test("Deleting a tie-breaking recording reclassifies in the visit context list, next visit correctly selected", async () => {
  // TODO
});

test("Deleting a single recording visit cleanly removes it from the visit context list, advances to next visit", async ({
  page,
  oneFrameCptv,
}) => {
  const aiClassification1 = "possum";
  const aiClassification2 = "cat";
  const { recordingIds, projectName } =
    await test.step("Init project with classified recordings, sign in user", async () => {
      const now = new Date();
      now.setHours(11, 16, 0);
      const initialDateTime = addDays(now, -5);
      const project = await createProjectWithUserAndDevice({ initialDateTime });
      const adminUser = project.getAdminUser();
      const projectName = project.projectHandle.testId;
      const uploads = await uploadRecordingsFromDeviceWithTimesAndDurations(
        [
          {
            recordingDateTime: addMinutes(initialDateTime, 2),
            durationSeconds: 40,
            tracks: [{ tag: aiClassification1, weight: 7 }],
          },
          {
            recordingDateTime: addMinutes(initialDateTime, 14),
            durationSeconds: 40,
            tracks: [{ tag: aiClassification2, weight: 10 }],
          },
        ],
        project.getDevice(),
        project.locationBase,
        oneFrameCptv,
      );
      await test.step("Sign in user", async () => {
        await confirmEmailAddressViaApi(adminUser);
        // Log in user.
        await signInExistingUser(page, adminUser.testId);
        await waitToNavigateToProject(page, projectName);
      });
      const recordingIds = uploads.map((r) => r.recordingId);
      return { recordingIds, projectName };
    });

  await test.step("Go to activity view", async () => {
    await page.getByTestId("activity search").click();
    await waitToNavigateToProjectPage(page, projectName, "activity");
  });

  const group0 = await test.step("Locate and expand the first day visit group", async () => {
    const group0 = page.getByTestId("visit group 0");
    const speciesCount1 = group0
      .getByTestId(`visit species ${aiClassification1}`)
      .getByTestId("visit count");
    await expect(speciesCount1).toBeVisible();
    await expect(speciesCount1, `correct number of ${aiClassification1} visits`).toHaveText("1", {
      timeout: 10,
    });
    const speciesCount2 = group0
      .getByTestId(`visit species ${aiClassification2}`)
      .getByTestId("visit count");
    await expect(speciesCount2).toBeVisible();
    await expect(speciesCount2, `correct number of ${aiClassification2} visits`).toHaveText("1", {
      timeout: 10,
    });
    // Expand group
    await group0.click();
    return group0;
  });
  await test.step("Check that initial visits in group are as expected", async () => {
    const visit1 = group0.getByTestId("visit 1");
    const visit2 = group0.getByTestId("visit 2");
    await expect(visit1).toBeAttached();
    await expect(visit2).toBeAttached();
    await expect(visit1.getByTestId("visit start time")).toHaveText("11:30 AM");
    await expect(visit1.getByTestId("visit duration")).toHaveText("40s");
    await expect(visit1.getByTestId("visit recording count")).toHaveText("1");
    await expect(
      visit1.getByTestId(`visit species ${aiClassification2}`),
      `visit classification is ${aiClassification2}`,
    ).toBeVisible();

    await expect(visit2.getByTestId("visit start time")).toHaveText("11:18 AM");
    await expect(visit2.getByTestId("visit duration")).toHaveText("40s");
    await expect(visit2.getByTestId("visit recording count")).toHaveText("1");
    await expect(
      visit2.getByTestId(`visit species ${aiClassification1}`),
      `visit classification is ${aiClassification1}`,
    ).toBeVisible();
  });
  const recordingView =
    await test.step("Select the single visit, open recording modal", async () => {
      await group0.getByTestId(`visit 2`).click();
      await waitToNavigateToProjectPage(
        page,
        projectName,
        `activity/visit/${aiClassification1}/${recordingIds[0]}/**`,
      );
      const recordingView = page.getByTestId("recording view");
      await expect(recordingView, "recording selected").toBeVisible();
      await expect(recordingView.getByTestId("track 0"), "tracks loaded").toBeVisible();
      return recordingView;
    });

  await test.step("Delete the single visit recording", async () => {
    await recordingView.getByTestId("delete recording").click();
    await page.getByTestId("confirm action").click();
  });

  await test.step("Wait to navigate to the previous visit", async () => {
    await waitToNavigateToProjectPage(
      page,
      projectName,
      `activity/visit/${aiClassification2}/${recordingIds[1]}/**`,
    );
    await expect(recordingView.getByTestId("visit duration")).toContainText("11:30");
  });

  await test.step("Close recording modal", async () => {
    await page.getByTestId("close recording view").click();
    await waitToNavigateToProjectPage(page, projectName, `activity`);
  });

  await test.step("Check removed visit", async () => {
    const visit1 = group0.getByTestId("visit 1");
    await expect(visit1).toBeVisible();
    await expect(visit1.getByTestId("visit start time")).toHaveText("11:30 AM");
    await expect(visit1.getByTestId("visit recording count")).toHaveText("1");
    await expect(group0.getByTestId("visit 2")).not.toBeAttached();
  });
});

test("Deleting a single visit recording that was the only one in the list removes from the list and closes recording modal", async ({
  page,
  oneFrameCptv,
}) => {
  const aiClassification = "possum";
  const { recordingIds, projectName } =
    await test.step("Init project with classified recordings, sign in user", async () => {
      const now = new Date();
      now.setHours(11, 16, 0);
      const initialDateTime = addDays(now, -5);
      const project = await createProjectWithUserAndDevice({ initialDateTime });
      const adminUser = project.getAdminUser();
      const projectName = project.projectHandle.testId;
      const uploads = await uploadRecordingsFromDeviceWithTimesAndDurations(
        [
          {
            recordingDateTime: addMinutes(initialDateTime, 2),
            durationSeconds: 40,
            tracks: [{ tag: aiClassification, weight: 7 }],
          },
        ],
        project.getDevice(),
        project.locationBase,
        oneFrameCptv,
      );
      await test.step("Sign in user", async () => {
        await confirmEmailAddressViaApi(adminUser);
        // Log in user.
        await signInExistingUser(page, adminUser.testId);
        await waitToNavigateToProject(page, projectName);
      });
      const recordingIds = uploads.map((r) => r.recordingId);
      return { recordingIds, projectName };
    });

  await test.step("Go to activity view", async () => {
    await page.getByTestId("activity search").click();
    await waitToNavigateToProjectPage(page, projectName, "activity");
  });

  const group0 = await test.step("Locate and expand the first day visit group", async () => {
    const group0 = page.getByTestId("visit group 0");
    const speciesCount1 = group0
      .getByTestId(`visit species ${aiClassification}`)
      .getByTestId("visit count");
    await expect(speciesCount1).toBeVisible();
    await expect(speciesCount1, `correct number of ${aiClassification} visits`).toHaveText("1", {
      timeout: 10,
    });
    // Expand group
    await group0.click();
    return group0;
  });
  await test.step("Check that initial visits in group are as expected", async () => {
    const visit1 = group0.getByTestId("visit 1");
    await expect(visit1).toBeAttached();
    await expect(group0.getByTestId("visit 2")).not.toBeAttached();
    await expect(visit1.getByTestId("visit start time")).toHaveText("11:18 AM");
    await expect(visit1.getByTestId("visit duration")).toHaveText("40s");
    await expect(visit1.getByTestId("visit recording count")).toHaveText("1");
    await expect(
      visit1.getByTestId(`visit species ${aiClassification}`),
      `visit classification is ${aiClassification}`,
    ).toBeVisible();
  });
  const recordingView =
    await test.step("Select the single visit, open recording modal", async () => {
      await group0.getByTestId(`visit 1`).click();
      await waitToNavigateToProjectPage(
        page,
        projectName,
        `activity/visit/${aiClassification}/${recordingIds[0]}/**`,
      );
      const recordingView = page.getByTestId("recording view");
      await expect(recordingView, "recording selected").toBeVisible();
      await expect(recordingView.getByTestId("track 0"), "tracks loaded").toBeVisible();
      return recordingView;
    });

  await test.step("Delete the single visit recording", async () => {
    await recordingView.getByTestId("delete recording").click();
    await page.getByTestId("confirm action").click();
  });

  await test.step("Wait to navigate to the activity list", async () => {
    await waitToNavigateToProjectPage(page, projectName, `activity`);
    await expect(page.getByTestId("no results")).toBeVisible();
  });

  await test.step("Check removed visit", async () => {
    const visit1 = group0.getByTestId("visit 1");
    await expect(visit1).not.toBeAttached();

    // TODO: Empty activity
  });
});

test("Deleting one half of a split visit should return it to a single visit in the visit context list", async () => {
  // TODO
});

test("Double clicking a tag button should resolve visits correctly", async () => {
  // TODO
});

test("Next and prev recordings inside a visit go in the correct order", async () => {
  // TODO
});

test("Next and prev visits inside a visit context go in the correct order", async () => {
  // TODO
});
