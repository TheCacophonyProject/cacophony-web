import { ProjectBundle } from "@/helpers/create-test-entities";
import { ApiRecordingResponse } from "@shared/api/recording";
import { ApiGroupResponse as ApiProjectResponse } from "@typedefs/api/group";
import { ApiStationResponse as ApiLocationResponse } from "@shared/api/station";
import { ApiDeviceResponse } from "@shared/api/device";
import { RecordingType } from "@shared/api/consts";

export const checkActivity = async (
  projectBundle: ProjectBundle,
  requestTime: Date,
  uploader: "device" | "user",
  recording: ApiRecordingResponse,
): Promise<[ApiProjectResponse, ApiDeviceResponse, ApiLocationResponse]> => {
  // Check that there is expected activity in project.
  const AdminUser = projectBundle.api();
  const [project, device, location] = (await Promise.all([
    AdminUser.Projects.getProjectById(projectBundle.projectHandle.id),
    AdminUser.Devices.getDeviceById(recording.deviceId),
    AdminUser.Locations.getLocationById(recording.stationId!),
  ])) as [ApiProjectResponse, ApiDeviceResponse, ApiLocationResponse];

  expect(project, "project exists").to.not.be.false;
  expect(device, "device exists").to.not.be.false;
  expect(location, "location exists").to.not.be.false;

  // Project activity checks
  if (recording.type === RecordingType.ThermalRaw) {
    expect(Object.keys(project)).to.include("lastThermalRecordingTime");
    expect(
      project.lastThermalRecordingTime,
      "project last thermal recording time",
    ).to.equal(recording.recordingDateTime);
  } else if (recording.type === RecordingType.Audio) {
    expect(Object.keys(project)).to.include("lastAudioRecordingTime");
    expect(
      project.lastAudioRecordingTime,
      "project last audio recording time",
    ).to.equal(recording.recordingDateTime);
  }

  // Device activity checks
  if (recording.type === RecordingType.ThermalRaw) {
    expect(
      device.lastThermalRecordingTime,
      "device last recording time",
    ).to.equal(recording.recordingDateTime);
  } else if (recording.type === RecordingType.Audio) {
    expect(
      device.lastAudioRecordingTime,
      "device last recording time",
    ).to.equal(recording.recordingDateTime);
  }

  if (uploader === "device") {
    expect(
      new Date(device.lastConnectionTime!),
      "device last connection time < now",
    ).to.be.lessThan(new Date());
  }

  // Location activity checks
  if (recording.type === RecordingType.ThermalRaw) {
    expect(
      location.lastThermalRecordingTime,
      "location last thermal recording time",
    ).to.equal(recording.recordingDateTime);
  } else if (recording.type === RecordingType.Audio) {
    expect(
      location.lastAudioRecordingTime,
      "location last audio recording time",
    ).to.equal(recording.recordingDateTime);
  }
  if (uploader === "device") {
    // 'Last active times' for locations are designed to track which locations
    // had active cameras, and *could* have had activity but may not have made
    // recordings during the active period.
    // This is less useful now that all cameras make startup and shutdown status recordings,
    // and we may want to consider removing this.
    if (recording.type === RecordingType.ThermalRaw) {
      expect(
        new Date(location.lastActiveThermalTime!),
        "location last active thermal time < now",
      ).to.be.lessThan(new Date());
    } else if (recording.type === RecordingType.Audio) {
      expect(
        new Date(location.lastActiveAudioTime!),
        "location last active audio time < now",
      ).to.be.lessThan(new Date());
    }
  }
  return [project, device, location];
};
