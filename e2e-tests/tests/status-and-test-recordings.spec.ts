import { ApiAudioRecordingResponse, ApiThermalRecordingResponse } from "@typedefs/api/recording";
import { expect, test } from "@/helpers/upload-tests";
import { createProjectWithUserAndDevice } from "@/helpers/create-test-entities";
import {
  getRecordingAsUser,
  uploadAudioTestRecordingFromDevice,
  uploadThermalShutdownRecordingFromDevice,
  uploadThermalStartupRecordingFromDevice,
  uploadThermalTestRecordingFromDevice,
} from "@/helpers/recording-uploads";
import { checkActivity } from "@/helpers/activity-book-keeping-checks";
import { RecordingId } from "@shared/api/common";

test("Device is able to upload a test thermal recording, and have it marked as such", async ({
  smallCptv,
}) => {
  // TODO: Correct fixture

  // Upload a test recording, and then check that the returned recording metadata has it marked as test.
  const project = await createProjectWithUserAndDevice();
  const deviceHandle = project.getDevice();
  const adminUserHandle = project.getAdminUser();
  const requestTime = new Date();
  const recordingId = await uploadThermalTestRecordingFromDevice({
    deviceHandle,
    location: project.locationBase,
    file: smallCptv,
    recordingDateTime: new Date(),
  });
  expect(recordingId, "uploaded recording").not.toBeNull();
  const uploadedRecording = (await getRecordingAsUser(
    adminUserHandle,
    recordingId as RecordingId,
  )) as ApiThermalRecordingResponse;
  expect(uploadedRecording.additionalMetadata).toBeDefined();
  expect(uploadedRecording.additionalMetadata!.status, "recording is a test recording").toEqual(
    "test",
  );

  // Make sure test recording changed book-keeping times
  await checkActivity(project, requestTime, "device", uploadedRecording);
});

test("Device is able to upload a startup thermal recording, and have it marked as such", async ({
  startupCptv,
}) => {
  // Upload a test recording, and then check that the returned recording metadata has it marked as test.
  const project = await createProjectWithUserAndDevice();
  const deviceHandle = project.getDevice();
  const adminUserHandle = project.getAdminUser();
  const requestTime = new Date();
  const recordingId = await uploadThermalStartupRecordingFromDevice({
    deviceHandle,
    location: project.locationBase,
    file: startupCptv,
    recordingDateTime: new Date(),
  });

  const uploadedRecording = (await getRecordingAsUser(
    adminUserHandle,
    recordingId as RecordingId,
  )) as ApiThermalRecordingResponse;
  expect(uploadedRecording.additionalMetadata).toBeDefined();
  expect(uploadedRecording.additionalMetadata!.status).toEqual("startup");

  // Make sure startup recording changed book-keeping times
  await checkActivity(project, requestTime, "device", uploadedRecording);
});

test("Device is able to upload a shutdown thermal recording, and have it marked as such", async ({
  shutdownCptv,
}) => {
  // Upload a test recording, and then check that the returned recording metadata has it marked as test.
  const project = await createProjectWithUserAndDevice();
  const deviceHandle = project.getDevice();
  const adminUserHandle = project.getAdminUser();
  const requestTime = new Date();
  const recordingId = await uploadThermalShutdownRecordingFromDevice({
    file: shutdownCptv,
    deviceHandle,
    recordingDateTime: new Date(),
    location: project.locationBase,
  });
  const uploadedRecording = (await getRecordingAsUser(
    adminUserHandle,
    recordingId,
  )) as ApiThermalRecordingResponse;
  expect(uploadedRecording.additionalMetadata).toBeDefined();
  expect(uploadedRecording.additionalMetadata!.status).toEqual("shutdown");

  // Make sure shutdown recording changed book-keeping times
  await checkActivity(project, requestTime, "device", uploadedRecording);
});

test("Newly uploaded recordings should have a thumbnail available", async ({ smallCptv }) => {
  const project = await createProjectWithUserAndDevice();
  const AdminUser = project.api();
  const deviceHandle = project.getDevice();
  const recordingId = await uploadThermalShutdownRecordingFromDevice({
    deviceHandle,
    file: smallCptv,
    recordingDateTime: new Date(),
    location: project.locationBase,
  });
  const clipThumbnail = await AdminUser.Recordings.getThumbnail(recordingId);
  expect(clipThumbnail.success).toEqual(true);
  expect(clipThumbnail.result).toBeInstanceOf(Blob);
});

test("Device is able to upload a test audio recording, and have it marked as such", async ({
  testAudio,
}) => {
  // Upload a test recording, and then check that the returned recording metadata has it marked as test.
  const project = await createProjectWithUserAndDevice();
  const deviceHandle = project.getDevice();
  const adminUserHandle = project.getAdminUser();
  const requestTime = new Date();
  const recordingId = await uploadAudioTestRecordingFromDevice({
    file: testAudio,
    deviceHandle,
    recordingDateTime: new Date(),
    location: project.locationBase,
  });
  const uploadedRecording = (await getRecordingAsUser(
    adminUserHandle,
    recordingId,
  )) as ApiAudioRecordingResponse;
  expect(uploadedRecording.additionalMetadata).toBeDefined();
  expect(uploadedRecording.additionalMetadata!.status).toEqual("test");

  // Make sure test recording changed book-keeping times
  await checkActivity(project, requestTime, "device", uploadedRecording);
});

test("Device can upload 10 second low power test recordings", async () => {
  // TODO
});
