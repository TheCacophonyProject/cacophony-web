import { expect, test } from "@/helpers/upload-tests";
import { createProjectWithUserAndDevice } from "@/helpers/create-test-entities";
import { DeviceSim } from "@/helpers/device-sim";
import { getRecordingAsUser } from "@/helpers/recording-uploads";
import { testLocation } from "@/helpers/location-helpers";
import { RecordingProcessingState, RecordingType } from "@shared/api/consts";
import { ApiRecordingUploadData } from "@shared/api/recording";
import { TestApiImpl } from "@shared/client";

test.describe("Corrupt device recording uploads", () => {
  for (const filename of ["21580622-015407.986773-snap.cptv", "21580622-015407.986773.cptv"]) {
    test(`Corrupt cptv named '${filename}' is accepted, with far-future date set to upload time`, async () => {
      const project = await createProjectWithUserAndDevice();
      const user = project.getAdminUser();
      const device = project.getDevice();

      // The filename's date can only be interpreted using the device's location (for its timezone),
      // so make sure the device has one.
      const sim = new DeviceSim(device);
      sim.updateLocation(testLocation(-42.0, 172.0, 5.0), new Date());
      await sim.uploadEvents();

      // NOTE: The test client refuses to upload a zero-length file, so use a few bytes of junk.
      const corruptFile = new Uint8Array(16).buffer;
      // No recordingDateTime or location: these must come from the filename and the device.
      const data: ApiRecordingUploadData = {
        type: RecordingType.ThermalRaw,
        // Set fileHash to null so that duplicate recordings are not rejected during testing.
        fileHash: null,
      };

      const beforeUpload = Date.now();
      const response = await TestApiImpl.Recordings.withAuth(
        device.testId,
      ).uploadRecordingFromDevice(data, corruptFile, filename);
      expect(response, "got response to upload request").toBeDefined();
      expect(response.success, "corrupt recording was accepted").toBe(true);
      const recordingId = (response.result as { recordingId: number }).recordingId;

      const recording = await getRecordingAsUser(user, recordingId);
      expect(recording.processingState, "recording is marked corrupt").toBe(
        RecordingProcessingState.Corrupt,
      );
      // The parsed date (year 2158) is in the future, so should have been replaced with the upload time.
      const recordingTime = new Date(recording.recordingDateTime).getTime();
      expect(recordingTime, "recordingDateTime is not in the far future").toBeLessThan(
        Date.now() + 60 * 1000,
      );
      expect(recordingTime, "recordingDateTime is the upload time").toBeGreaterThanOrEqual(
        beforeUpload - 1000,
      );
    });
  }
});
