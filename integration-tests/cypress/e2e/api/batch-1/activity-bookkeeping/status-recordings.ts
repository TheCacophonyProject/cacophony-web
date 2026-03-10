import {
  ApiAudioRecordingMetadataResponse,
  ApiAudioRecordingResponse,
  ApiThermalRecordingResponse,
} from "@shared/api/recording";
import { createProjectWithUserAndDevice } from "@/helpers/create-test-entities";
import {
  uploadAudioTestRecordingFromDeviceForProject,
  uploadThermalShutdownRecordingFromDeviceForProject,
  uploadThermalStartupRecordingFromDeviceForProject,
  uploadThermalTestRecordingFromDeviceForProject,
} from "@/helpers/recording-uploads";
import { checkActivity } from "@/helpers/activity-book-keeping-checks";

describe("Status and test recordings", () => {
  it("Device is able to upload a test thermal recording, and have it marked as such", async () => {
    // Upload a test recording, and then check that the returned recording metadata has it marked as test.
    const project = await createProjectWithUserAndDevice();
    const AdminUser = project.api();
    const requestTime = new Date();
    const recordingId = await uploadThermalTestRecordingFromDeviceForProject({
      project,
      recordingDateTime: new Date(),
    });
    const uploadedRecording = (await AdminUser.Recordings.getRecordingById(
      recordingId,
    )) as ApiThermalRecordingResponse;
    expect(
      uploadedRecording.additionalMetadata.status,
      "recording is a test recording",
    ).to.equal("test");

    // Make sure test recording changed book-keeping times
    await checkActivity(project, requestTime, "device", uploadedRecording);
  });

  it("Device is able to upload a startup thermal recording, and have it marked as such", async () => {
    // Upload a test recording, and then check that the returned recording metadata has it marked as test.
    const project = await createProjectWithUserAndDevice();
    const AdminUser = project.api();
    const requestTime = new Date();
    const recordingId = await uploadThermalStartupRecordingFromDeviceForProject(
      {
        project,
        recordingDateTime: new Date(),
      },
    );
    const uploadedRecording = (await AdminUser.Recordings.getRecordingById(
      recordingId,
    )) as ApiThermalRecordingResponse;
    expect(uploadedRecording.additionalMetadata.status).to.equal("startup");

    // Make sure startup recording changed book-keeping times
    await checkActivity(project, requestTime, "device", uploadedRecording);
  });

  it("Device is able to upload a shutdown thermal recording, and have it marked as such", async () => {
    // Upload a test recording, and then check that the returned recording metadata has it marked as test.
    const project = await createProjectWithUserAndDevice();
    const AdminUser = project.api();
    const requestTime = new Date();
    const recordingId =
      await uploadThermalShutdownRecordingFromDeviceForProject({
        project,
        recordingDateTime: new Date(),
      });
    const uploadedRecording = (await AdminUser.Recordings.getRecordingById(
      recordingId,
    )) as ApiThermalRecordingResponse;
    expect(uploadedRecording.additionalMetadata.status).to.equal("shutdown");

    // Make sure shutdown recording changed book-keeping times
    await checkActivity(project, requestTime, "device", uploadedRecording);
  });

  it("Newly uploaded recordings should have a thumbnail available", async () => {
    const project = await createProjectWithUserAndDevice();
    const AdminUser = project.api();
    const recordingId =
      await uploadThermalShutdownRecordingFromDeviceForProject({
        project,
        recordingDateTime: new Date(),
      });
    const clipThumbnail = await AdminUser.Recordings.getThumbnail(recordingId);
    expect(clipThumbnail.success).to.equal(true);
    expect(clipThumbnail.result).to.be.an.instanceof(Blob);
  });

  it("Device is able to upload a test audio recording, and have it marked as such", async () => {
    // Upload a test recording, and then check that the returned recording metadata has it marked as test.
    const project = await createProjectWithUserAndDevice();
    const AdminUser = project.api();
    const requestTime = new Date();
    const recordingId = await uploadAudioTestRecordingFromDeviceForProject({
      project,
      recordingDateTime: new Date(),
    });
    const uploadedRecording = (await AdminUser.Recordings.getRecordingById(
      recordingId,
    )) as ApiAudioRecordingResponse;
    console.log(uploadedRecording);
    expect(
      (
        uploadedRecording.additionalMetadata as ApiAudioRecordingMetadataResponse
      ).status,
    ).to.equal("test");

    // Make sure test recording changed book-keeping times
    await checkActivity(project, requestTime, "device", uploadedRecording);
  });
});
