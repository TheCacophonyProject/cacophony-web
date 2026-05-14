import { createProjectWithUserAndDevice } from "@/helpers/create-test-entities";
import { spreadDays } from "@/helpers/date-helpers";
import { uploadThermalRecordingFromDeviceForProject } from "@/helpers/recording-uploads";
import { testLocation } from "@/helpers/location-helpers";

describe("Tracks: insights", () => {
  it(
    "Can get track positional data for a given tag in order to produce a heatmap",
    { retries: 3 },
    async () => {
      // Add recordings, add tags to recording, pull in data and check that positional data is present
      const project = await createProjectWithUserAndDevice();
      const AdminUser = project.api();
      const startDate = new Date("2026-01-10T20:07:06.292Z");
      const beforeStartDate = new Date(startDate);
      beforeStartDate.setTime(beforeStartDate.getTime() - 60000);
      const dates = spreadDays(startDate, 3);
      const recordingUploads = [];
      for (const date of dates) {
        recordingUploads.push(
          uploadThermalRecordingFromDeviceForProject({
            project,
            location: testLocation(-42, 170, 0),
            recordingDateTime: date,
            metadata: {
              algorithm: { name: "Master" },
              tracks: [
                {
                  num_frames: 1,
                  frame_end: 1,
                  frame_start: 0,
                  start_s: 0,
                  end_s: 10,
                  predictions: [
                    {
                      confidence: 100,
                      confident: true,
                      tag: "bat",
                      model_used: "Master",
                    },
                  ],
                  positions: [
                    {
                      x: 0,
                      y: 0,
                      width: 50,
                      height: 50,
                    },
                  ],
                },
              ],
            },
          }),
        );
      }
      await Promise.all(recordingUploads);
      const uniqueTrackTagsForDevice =
        await AdminUser.Devices.getUniqueTrackTagsForDeviceInProject(
          project.deviceHandles[0].id,
        );
      expect(uniqueTrackTagsForDevice)
        .to.be.an("array")
        .and.to.have.lengthOf(1);
      expect(
        uniqueTrackTagsForDevice[0].what,
        "bat tag exists in device unique track tags",
      ).to.equal("bat");
      expect(uniqueTrackTagsForDevice[0].count).to.equal(3);
      const insightsData =
        await AdminUser.Devices.getTracksWithTagForDeviceInProject(
          project.deviceHandles[0].id,
          uniqueTrackTagsForDevice[0].what,
          beforeStartDate,
        );
      expect(insightsData).to.have.length(3);
      expect(insightsData[0].positions).to.be.an("array").and.to.have.length(1);
    },
  );
});
