import { ProjectBundle } from "@/helpers/create-test-entities";
import { ApiRecordingResponse } from "@shared/api/recording";
import { ApiGroupResponse as ApiProjectResponse } from "@typedefs/api/group";
import { ApiStationResponse as ApiLocationResponse } from "@shared/api/station";
import { ApiDeviceResponse } from "@shared/api/device";
import { RecordingType } from "@shared/api/consts";
import { expect, test } from "@playwright/test";

export const checkActivity = async (
  projectBundle: ProjectBundle,
  requestTime: Date,
  uploader: "device" | "user",
  recording: ApiRecordingResponse,
): Promise<[ApiProjectResponse, ApiDeviceResponse, ApiLocationResponse]> => {
  return await test.step(`Check project activity for '${projectBundle.projectHandle.testId}'`, async () => {
    // Check that there is expected activity in project.
    const AdminUser = projectBundle.api();
    const [project, device, location] = (await Promise.all([
      AdminUser.Projects.getProjectById(projectBundle.projectHandle.id),
      AdminUser.Devices.getDeviceById(recording.deviceId),
      AdminUser.Locations.getLocationById(recording.stationId!),
    ])) as [ApiProjectResponse, ApiDeviceResponse, ApiLocationResponse];

    expect(project, "project exists").toBeTruthy();
    expect(device, "device exists").toBeTruthy();
    expect(location, "location exists").toBeTruthy();

    // Project activity checks
    if (recording.type === RecordingType.ThermalRaw) {
      expect(Object.keys(project)).toContain("lastThermalRecordingTime");
      expect(project.lastThermalRecordingTime, "project last thermal recording time").toEqual(
        recording.recordingDateTime,
      );
    } else if (recording.type === RecordingType.Audio) {
      expect(Object.keys(project)).toContain("lastAudioRecordingTime");
      expect(project.lastAudioRecordingTime, "project last audio recording time").toEqual(
        recording.recordingDateTime,
      );
    }

    // Device activity checks
    if (recording.type === RecordingType.ThermalRaw) {
      expect(device.lastThermalRecordingTime, "device last recording time").toEqual(
        recording.recordingDateTime,
      );
    } else if (recording.type === RecordingType.Audio) {
      expect(device.lastAudioRecordingTime, "device last recording time").toEqual(
        recording.recordingDateTime,
      );
    }

    if (uploader === "device") {
      expect(device.lastConnectionTime, "lastConnectionTime exists").toBeDefined();
      expect(
        new Date(device.lastConnectionTime!).getTime(),
        "device last connection time > request time",
      ).toBeGreaterThan(requestTime.getTime());
      expect(
        new Date(device.lastConnectionTime!).getTime(),
        "device last connection time < now",
      ).toBeLessThan(new Date().getTime());
    }

    // Location activity checks
    if (recording.type === RecordingType.ThermalRaw) {
      expect(location.lastThermalRecordingTime, "location last thermal recording time").toEqual(
        recording.recordingDateTime,
      );
    } else if (recording.type === RecordingType.Audio) {
      expect(location.lastAudioRecordingTime, "location last audio recording time").toEqual(
        recording.recordingDateTime,
      );
    }
    if (uploader === "device") {
      // 'Last active times' for locations are designed to track which locations
      // had active cameras, and *could* have had activity but may not have made
      // recordings during the active period.
      // This is less useful now that all cameras make startup and shutdown status recordings,
      // and we may want to consider removing this.
      if (recording.type === RecordingType.ThermalRaw) {
        expect(location.lastActiveThermalTime, "lastActiveThermalTime exists").toBeDefined();
        expect(
          new Date(location.lastActiveThermalTime!).getTime(),
          "location last active thermal time > request time",
        ).toBeGreaterThan(requestTime.getTime());
        expect(
          new Date(location.lastActiveThermalTime!).getTime(),
          "location last active thermal time < now",
        ).toBeLessThan(new Date().getTime());
      } else if (recording.type === RecordingType.Audio) {
        expect(location.lastActiveAudioTime, "lastActiveAudioTime exists").toBeDefined();
        expect(
          new Date(location.lastActiveAudioTime!).getTime(),
          "location last active audio time > request time",
        ).toBeGreaterThan(requestTime.getTime());
        expect(
          new Date(location.lastActiveAudioTime!).getTime(),
          "location last active audio time < now",
        ).toBeLessThan(new Date().getTime());
      }
    }
    return [project, device, location];
  });
};
