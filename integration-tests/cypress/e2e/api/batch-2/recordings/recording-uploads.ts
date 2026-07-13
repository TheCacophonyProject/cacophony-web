import { createProjectWithUserAndDevice } from "@/helpers/create-test-entities";
import {
  uploadAudioRecordingOnBehalfOfDeviceForProject,
  uploadThermalRecordingOnBehalfOfDeviceForProject,
} from "@/helpers/recording-uploads";
describe("Recording uploads", () => {
  it("Thermal upload from sidekick works", async () => {
    // Upload recordings with file and data fields swapped, as sidekick currently does.
    const project = await createProjectWithUserAndDevice();
    const upload = uploadThermalRecordingOnBehalfOfDeviceForProject({
      project,
      recordingType: "big-file",
      recordingDateTime: new Date(),
    });

    const recordingId = await upload;
    console.log("upload complete");
    assert.isNotNull(recordingId);
  });

  it("Audio upload from sidekick works", async () => {
    const project = await createProjectWithUserAndDevice();
    const upload = uploadAudioRecordingOnBehalfOfDeviceForProject({
      project,
      recordingDateTime: new Date(),
    });

    const recordingId = await upload;
    console.log("upload complete");
    assert.isNotNull(recordingId);
  });
});
