import { DeviceId, LatLng, RecordingId } from "@shared/api/common";
import { ApiRecordingResponse, ApiRecordingUploadData } from "@shared/api/recording";
import { RecordingType } from "@shared/api/consts";
import { TestDeviceHandle, TestEntityHandle, TestUserHandle } from "@shared/client/types";
import { TestApiImpl } from "@shared/client";
import { RecordingDataSuppliedMetadata } from "@shared/api/fileProcessing";
import { expect, test } from "./upload-tests";

const extForUploadFileType = (type: RecordingType) => {
  switch (type) {
    case RecordingType.Audio:
      return "m4a";
    case RecordingType.InfraredVideo:
      return "mp4";
    case RecordingType.ThermalRaw:
    default:
      return "cptv";
  }
};

export const uploadRecording = async (
  uploaderHandle: TestEntityHandle,
  recordingOptions: {
    file: ArrayBuffer;
    location: LatLng;
    deviceId?: DeviceId;
    duration?: number;
    uploadTime?: Date;
    metadata?: RecordingDataSuppliedMetadata;
    type: RecordingType;
    recordingDateTime: Date;
  },
): Promise<RecordingId> => {
  return await test.step(`Upload recording`, async () => {
    expect(["user", "device"], "uploader must be device or user").toContain(uploaderHandle.type);
    const rawFile = recordingOptions.file;
    const rawFileName = `filename.${extForUploadFileType(recordingOptions.type)}`;
    const location = recordingOptions.location;
    let upload;
    const data: ApiRecordingUploadData = {
      location,
      // It's important to set fileHash to null here so that duplicate recordings are not rejected during testing.
      fileHash: null,
      type: recordingOptions.type,
      recordingDateTime: recordingOptions.recordingDateTime,
    };
    if (recordingOptions.duration) {
      data.duration = recordingOptions.duration;
    }
    if (recordingOptions.metadata) {
      data.metadata = recordingOptions.metadata;
    }
    // if (
    //     recordingOptions.type === RecordingType.ThermalRaw &&
    //     recordingOptions.recordingType === "test"
    // ) {
    //     // TODO: Get a low power mode test fixture
    //     data.status = "test";
    //     data.duration = 2;
    // } else if (
    //     recordingOptions.type === RecordingType.Audio &&
    //     recordingOptions.recordingType === "test"
    // ) {
    //     //data.status = "test";
    //     // Metadata in audio should set recording duration to 10s
    // }
    if (uploaderHandle.type === "device") {
      upload = TestApiImpl.Recordings.withAuth(uploaderHandle.testId).uploadRecordingFromDevice(
        data,
        rawFile,
        rawFileName,
        recordingOptions.uploadTime,
      );
    } else if (uploaderHandle.type === "user") {
      if (!recordingOptions.deviceId) {
        throw new Error("DeviceId must be provided to upload a recording on behalf of device");
      }
      upload = TestApiImpl.Recordings.withAuth(
        uploaderHandle.testId,
      ).uploadRecordingOnBehalfOfDevice(recordingOptions.deviceId!, data, rawFile, rawFileName);
    }
    const response = await upload;
    expect(response, "got response to upload request").toBeDefined();
    expect(response!.success, "uploaded recording successfully").toBeTruthy();
    return (response!.result as { recordingId: RecordingId }).recordingId;
  });
};

export const uploadRecordingFromDevice = async (options: {
  file: ArrayBuffer;
  location: LatLng;
  deviceHandle: TestDeviceHandle;
  duration?: number;
  metadata?: RecordingDataSuppliedMetadata;
  uploadTime?: Date;
  type: RecordingType;
  recordingDateTime: Date;
}): Promise<RecordingId> => {
  // Use the first device in the project bundle, or the specified device.
  const deviceToUploadFrom: TestDeviceHandle = options.deviceHandle;
  return uploadRecording(deviceToUploadFrom, options);
};

export const uploadThermalRecordingFromDevice = async (options: {
  file: ArrayBuffer;
  location: LatLng;
  deviceHandle: TestDeviceHandle;
  recordingDateTime: Date;
  duration?: number; // Artificially set a duration for test purposes
  metadata?: RecordingDataSuppliedMetadata;
  uploadTime?: Date;
}): Promise<RecordingId> => {
  return uploadRecordingFromDevice({
    ...options,
    type: RecordingType.ThermalRaw,
  });
};

export const getRecordingAsUser = async (userHandle: TestUserHandle, recordingId: RecordingId) => {
  return await test.step(`Get recording #${recordingId}`, async () => {
    const recording = await TestApiImpl.Recordings.withAuth(userHandle.testId).getRecordingById(
      recordingId,
    );
    expect(recording, "got recording").toBeTruthy();
    return recording as ApiRecordingResponse;
  });
};

export const uploadThermalTestRecordingFromDevice = async (options: {
  file: ArrayBuffer;
  location: LatLng;
  deviceHandle: TestDeviceHandle;
  recordingDateTime: Date;
}): Promise<RecordingId> => {
  return uploadRecordingFromDevice({
    ...options,
    type: RecordingType.ThermalRaw,
  });
};

export const uploadThermalStartupRecordingFromDevice = async (options: {
  file: ArrayBuffer;
  location: LatLng;
  deviceHandle: TestDeviceHandle;
  recordingDateTime: Date;
}): Promise<RecordingId> => {
  return uploadRecordingFromDevice({
    ...options,
    type: RecordingType.ThermalRaw,
  });
};

export const uploadThermalShutdownRecordingFromDevice = async (options: {
  file: ArrayBuffer;
  location: LatLng;
  deviceHandle: TestDeviceHandle;
  recordingDateTime: Date;
}): Promise<RecordingId> => {
  return uploadRecordingFromDevice({
    ...options,
    type: RecordingType.ThermalRaw,
  });
};

export const uploadAudioRecordingFromDevice = async (options: {
  file: ArrayBuffer;
  location: LatLng;
  deviceHandle: TestDeviceHandle;
  isTestRecording?: true;
  recordingDateTime: Date;
  uploadTime?: Date;
}): Promise<RecordingId> => {
  return uploadRecordingFromDevice({
    ...options,
    type: RecordingType.Audio,
  });
};

export const uploadAudioTestRecordingFromDevice = async (options: {
  file: ArrayBuffer;
  location: LatLng;
  deviceHandle: TestDeviceHandle;
  recordingDateTime: Date;
}): Promise<RecordingId> => {
  return uploadRecordingFromDevice({
    ...options,
    type: RecordingType.Audio,
  });
};
