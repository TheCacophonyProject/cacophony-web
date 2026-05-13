import { ApiThermalRecordingResponse } from "@shared/api/recording";
import { createProjectWithUserAndDevice } from "@/helpers/create-test-entities";
import { uploadThermalRecordingFromDeviceForProject } from "@/helpers/recording-uploads";
import { checkActivity } from "@/helpers/activity-book-keeping-checks";
import { CurrentViewAbortController } from "@shared/client/api";
// TODO
describe.skip("Aborted uploads", () => {
  it("Aborted recording uploads are handled gracefully", async () => {
    // Upload a test recording, and then check that the returned recording metadata has it marked as test.
    const project = await createProjectWithUserAndDevice();
    const upload = uploadThermalRecordingFromDeviceForProject({
      project,
      recordingType: "big-file",
      recordingDateTime: new Date(),
    });

    const recordingId = await upload;
    console.log("upload complete");
    assert.isNull(recordingId);
  });
});
