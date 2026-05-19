import {test} from "@/helpers/upload-tests"
import {createProjectWithUserAndDevice} from "@/helpers/create-test-entities";
import {expect} from "@playwright/test";
import {
    uploadThermalRecordingFromDeviceForProject,
    uploadThermalTestRecordingFromDeviceForProject
} from "@/helpers/recording-uploads";
import {
    confirmNewUserEmailAddressWhileLoggedIn, confirmNewUserEmailAddressWhileLoggedOut, ensureMainNavIsAvailable,
    registerNewUser,
    signInExistingUser,
    uniqueName, urlNormaliseProjectName, waitToNavigateToProject, waitToNavigateToProjectPage
} from "@/helpers/browse-helpers";
import {URLPattern} from "node:url";

test.beforeEach(async ({ request }) => {
    const nodeFetch = global.fetch;
    // @ts-ignore
    global.fetch = request.fetch.bind(request);
    // @ts-ignore
    global.nodeFetch = nodeFetch;
});

test.afterEach(async () => {
    // @ts-ignore
    global.fetch = global.nodeFetch;
});

test(`A user can add a reference image to a device`, async ({page, smallCptv, deviceReferenceImage}) => {
    const project = await createProjectWithUserAndDevice();
    const AdminUser = project.api();
    const deviceHandle = project.deviceHandles[0];
    const user = project.userHandles[0].testId;
    const recordingId = await uploadThermalRecordingFromDeviceForProject({
        project,
        file: smallCptv,
        recordingDateTime: new Date(),
    });

    const projectName = project.projectHandle.testId;
    await confirmNewUserEmailAddressWhileLoggedOut(page, user);
    await signInExistingUser(page, user, "password");
    await waitToNavigateToProject(page, projectName);
    await ensureMainNavIsAvailable(page);
    // Go to devices listing
    await page.getByTestId("manage devices").click();
    await waitToNavigateToProjectPage(page, projectName, "devices");
    // Click individual device table row
    await page.locator('tr').filter({ has: page.getByTestId(`device ${deviceHandle.testId}`) }).click();
    // Go to device page
    await waitToNavigateToProjectPage(page, projectName, `devices/${deviceHandle.id}/${deviceHandle.testId.toLowerCase()}/status`);
    // Click configuration tab
    await page.getByTestId("device configuration").click();
    await waitToNavigateToProjectPage(page, projectName, `devices/${deviceHandle.id}/${deviceHandle.testId.toLowerCase()}/configuration/recording-options`);

    // Click reference photo
    await page.getByTestId("reference photo").click();
    await waitToNavigateToProjectPage(page, projectName, `devices/${deviceHandle.id}/${deviceHandle.testId.toLowerCase()}/configuration/reference`);

    await page.getByTestId("select reference image").setInputFiles({
        name: "reference-image.jpeg",
        mimeType: "image/jpeg",
        buffer: Buffer.from(deviceReferenceImage)
    });

    await page.getByTestId("save reference image").click();
    await expect(page.getByTestId("add new reference image")).toBeAttached();
});