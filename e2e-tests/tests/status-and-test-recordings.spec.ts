import {
    ApiAudioRecordingResponse,
    ApiThermalRecordingResponse,
} from "@typedefs/api/recording";
import {expect, test} from "@/helpers/upload-tests"
import {createProjectWithUserAndDevice} from "@/helpers/create-test-entities";
import {
    getRecordingAsUser,
    uploadAudioTestRecordingFromDeviceForProject,
    uploadThermalShutdownRecordingFromDeviceForProject,
    uploadThermalStartupRecordingFromDeviceForProject,
    uploadThermalTestRecordingFromDeviceForProject,
} from "@/helpers/recording-uploads";
import { checkActivity } from "@/helpers/activity-book-keeping-checks";

test.beforeEach(async ({ request }) => {
    const nodeFetch = global.fetch;
    // @ts-ignore
    global.fetch = request.fetch.bind(request);
    global.nodeFetch = nodeFetch;
});

test.afterEach(async () => {
    global.fetch = global.nodeFetch;
});

test("Device is able to upload a test thermal recording, and have it marked as such", async ({smallCptv}) => {


    // TODO: Fixture

    // Upload a test recording, and then check that the returned recording metadata has it marked as test.
    const project = await createProjectWithUserAndDevice();
    const AdminUser = project.api();
    const requestTime = new Date();
    const recordingId = await uploadThermalTestRecordingFromDeviceForProject({
        project,
        file: smallCptv,
        recordingDateTime: new Date(),
    });

    const uploadedRecording = await getRecordingAsUser(AdminUser, recordingId) as ApiThermalRecordingResponse;
    console.log(uploadedRecording);
    expect(
        uploadedRecording.additionalMetadata.status,
        "recording is a test recording",
    ).toEqual("test");

    // Make sure test recording changed book-keeping times
    await checkActivity(project, requestTime, "device", uploadedRecording);
});

test("Device is able to upload a startup thermal recording, and have it marked as such", async ({startupCptv}) => {
    // Upload a test recording, and then check that the returned recording metadata has it marked as test.
    const project = await createProjectWithUserAndDevice();
    const AdminUser = project.api();
    const requestTime = new Date();
    const recordingId = await uploadThermalStartupRecordingFromDeviceForProject(
        {
            project,
            file: startupCptv,
            recordingDateTime: new Date(),
        },
    );
    const uploadedRecording = await getRecordingAsUser(AdminUser, recordingId) as ApiThermalRecordingResponse;
    expect(uploadedRecording.additionalMetadata.status).toEqual("startup");

    // Make sure startup recording changed book-keeping times
    await checkActivity(project, requestTime, "device", uploadedRecording);
});

test("Device is able to upload a shutdown thermal recording, and have it marked as such", async ({shutdownCptv}) => {
    // Upload a test recording, and then check that the returned recording metadata has it marked as test.
    const project = await createProjectWithUserAndDevice();
    const AdminUser = project.api();
    const requestTime = new Date();
    const recordingId =
        await uploadThermalShutdownRecordingFromDeviceForProject({
            file: shutdownCptv,
            project,
            recordingDateTime: new Date(),
        });
    const uploadedRecording = await getRecordingAsUser(AdminUser, recordingId) as ApiThermalRecordingResponse;
    expect(uploadedRecording.additionalMetadata.status).toEqual("shutdown");

    // Make sure shutdown recording changed book-keeping times
    await checkActivity(project, requestTime, "device", uploadedRecording);
});

test("Newly uploaded recordings should have a thumbnail available", async ({smallCptv}) => {
    const project = await createProjectWithUserAndDevice();
    const AdminUser = project.api();
    const recordingId =
        await uploadThermalShutdownRecordingFromDeviceForProject({
            project,
            file: smallCptv,
            recordingDateTime: new Date(),
        });
    const clipThumbnail = await AdminUser.Recordings.getThumbnail(recordingId);
    expect(clipThumbnail.success).toEqual(true);
    expect(clipThumbnail.result).toBeInstanceOf(Blob);
});

test("Device is able to upload a test audio recording, and have it marked as such", async ({testAudio}) => {
    // Upload a test recording, and then check that the returned recording metadata has it marked as test.
    const project = await createProjectWithUserAndDevice();
    const AdminUser = project.api();
    const requestTime = new Date();
    const recordingId = await uploadAudioTestRecordingFromDeviceForProject({
        file: testAudio,
        project,
        recordingDateTime: new Date(),
    });
    const uploadedRecording = await getRecordingAsUser(AdminUser, recordingId) as ApiAudioRecordingResponse;
    expect(uploadedRecording.additionalMetadata.status).toEqual("test");

    // Make sure test recording changed book-keeping times
    await checkActivity(project, requestTime, "device", uploadedRecording);
});

test("Device can upload 10 second low power test recordings", async () => {
    // TODO
});