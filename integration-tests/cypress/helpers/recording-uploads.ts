import { LatLng, RecordingId } from "@shared/api/common";
import { ProjectBundle } from "@/helpers/create-test-entities";
import { ApiRecordingUploadData } from "@shared/api/recording";
import { RecordingType } from "@shared/api/consts";
import { TestDeviceHandle, TestEntityHandle } from "@shared/client/types";
import { TestApiImpl } from "@shared/client";
import { RecordingDataSuppliedMetadata } from "@shared/api/fileProcessing";

const extForUploadFileType = (type: RecordingType) => {
  switch (type) {
    case RecordingType.Audio:
      return ".m4a";
    case RecordingType.InfraredVideo:
      return ".mp4";
    case RecordingType.ThermalRaw:
    default:
      return ".cptv";
  }
};

const getRecordingFixtureForType = (
  fixtures: Record<string, ArrayBuffer>,
  type: RecordingType,
  variant?: "test" | "startup" | "shutdown",
) => {
  switch (type) {
    case RecordingType.Audio:
      if (variant === "test") {
        return fixtures["audio-test-recording-tc2.m4a"];
      }
      return fixtures["audio-60s-tc2.m4a"];
    case RecordingType.ThermalRaw:
      if (variant === "startup") {
        return fixtures["startup-status.cptv"];
      } else if (variant === "shutdown") {
        return fixtures["shutdown-status.cptv"];
      } else {
        return fixtures["oneframe.cptv"];
      }
  }
};

export const uploadRecording = async (
  uploaderHandle: TestEntityHandle,
  recordingOptions: {
    project: ProjectBundle;
    location?: LatLng;
    deviceHandle?: TestDeviceHandle;
    recordingType?: "test" | "startup" | "shutdown";
    duration?: number;
    metadata?: RecordingDataSuppliedMetadata;
    type: RecordingType;
    recordingDateTime: Date;
  },
): Promise<RecordingId | null> => {
  expect(["user", "device"], "uploader must be device or user").to.include(
    uploaderHandle.type,
  );
  const deviceId = uploaderHandle.id;
  const rawFile = getRecordingFixtureForType(
    recordingOptions.project.testFixtures,
    recordingOptions.type,
    recordingOptions.recordingType,
  );
  const rawFileName = `filename.${extForUploadFileType(recordingOptions.type)}`;
  // TODO: Maybe we could fuzz a location based on locationBase if there's no supplied location
  const location =
    recordingOptions.location ?? recordingOptions.project.locationBase;
  let upload;
  const data: ApiRecordingUploadData = {
    location,
    type: recordingOptions.type,
    recordingDateTime: recordingOptions.recordingDateTime,
  };
  if (recordingOptions.duration) {
    data.duration = recordingOptions.duration;
  }
  if (recordingOptions.metadata) {
    data.metadata = recordingOptions.metadata;
  }
  if (
    recordingOptions.type === RecordingType.ThermalRaw &&
    recordingOptions.recordingType === "test"
  ) {
    // TODO: Get a low power mode test fixture
    data.status = "test";
    data.duration = 2;
  } else if (
    recordingOptions.type === RecordingType.Audio &&
    recordingOptions.recordingType === "test"
  ) {
    //data.status = "test";
    // Metadata in audio should set recording duration to 10s
  }
  if (uploaderHandle.type === "device") {
    upload = TestApiImpl.Recordings.withAuth(
      uploaderHandle.testId,
    ).uploadRecordingFromDevice(data, rawFile, rawFileName);
  } else if (uploaderHandle.type === "user") {
    upload = TestApiImpl.Recordings.withAuth(
      uploaderHandle.testId,
    ).uploadRecordingOnBehalfOfDevice(deviceId, data, rawFile, rawFileName);
  }
  const response = await upload;
  expect(response.success, "uploaded recording").to.be.true;
  if (response.success) {
    return response.result.recordingId;
  } else {
    console.error("Failed to upload recording", response);
  }
  return null;
};

export const uploadRecordingFromDeviceForProject = async (options: {
  project: ProjectBundle;
  location?: LatLng;
  deviceHandle?: TestDeviceHandle;
  recordingType?: "test" | "startup" | "shutdown";
  duration?: number;
  metadata?: RecordingDataSuppliedMetadata;
  type: RecordingType;
  recordingDateTime: Date;
}): Promise<RecordingId | null> => {
  // Use the first device in the project bundle, or the specified device.
  const deviceToUploadFrom: TestDeviceHandle =
    options.deviceHandle || options.project.deviceHandles[0];
  return uploadRecording(deviceToUploadFrom, options);
};

export const uploadThermalRecordingFromDeviceForProject = async (options: {
  project: ProjectBundle;
  location?: LatLng;
  deviceHandle?: TestDeviceHandle;
  duration?: number; // Artifically set a duration for test purposes
  metadata?: RecordingDataSuppliedMetadata;
  recordingDateTime: Date;
}): Promise<RecordingId> => {
  return uploadRecordingFromDeviceForProject({
    ...options,
    type: RecordingType.ThermalRaw,
  });
};

export const uploadThermalTestRecordingFromDeviceForProject = async (options: {
  project: ProjectBundle;
  location?: LatLng;
  deviceHandle?: TestDeviceHandle;
  recordingDateTime: Date;
}): Promise<RecordingId> => {
  return uploadRecordingFromDeviceForProject({
    ...options,
    type: RecordingType.ThermalRaw,
    recordingType: "test",
  });
};

export const uploadThermalStartupRecordingFromDeviceForProject =
  async (options: {
    project: ProjectBundle;
    location?: LatLng;
    deviceHandle?: TestDeviceHandle;
    recordingDateTime: Date;
  }): Promise<RecordingId> => {
    return uploadRecordingFromDeviceForProject({
      ...options,
      type: RecordingType.ThermalRaw,
      recordingType: "startup",
    });
  };

export const uploadThermalShutdownRecordingFromDeviceForProject =
  async (options: {
    project: ProjectBundle;
    location?: LatLng;
    deviceHandle?: TestDeviceHandle;
    recordingDateTime: Date;
  }): Promise<RecordingId> => {
    return uploadRecordingFromDeviceForProject({
      ...options,
      type: RecordingType.ThermalRaw,
      recordingType: "shutdown",
    });
  };

export const uploadAudioRecordingFromDeviceForProject = async (options: {
  project: ProjectBundle;
  location?: LatLng;
  deviceHandle?: TestDeviceHandle;
  isTestRecording?: true;
  recordingDateTime: Date;
}): Promise<RecordingId> => {
  return uploadRecordingFromDeviceForProject({
    ...options,
    type: RecordingType.Audio,
  });
};

export const uploadAudioTestRecordingFromDeviceForProject = async (options: {
  project: ProjectBundle;
  location?: LatLng;
  deviceHandle?: TestDeviceHandle;
  recordingDateTime: Date;
}): Promise<RecordingId> => {
  return uploadRecordingFromDeviceForProject({
    ...options,
    type: RecordingType.Audio,
    recordingType: "test",
  });
};
