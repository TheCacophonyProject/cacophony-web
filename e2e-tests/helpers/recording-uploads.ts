import { DeviceId, LatLng, RecordingId, TrackId } from "@shared/api/common";
import { ApiRecordingResponse, ApiRecordingUploadData } from "@shared/api/recording";
import { RecordingType } from "@shared/api/consts";
import { TestDeviceHandle, TestEntityHandle, TestUserHandle } from "@shared/client/types";
import { TestApiImpl } from "@shared/client";
import { RecordingDataSuppliedMetadata } from "@shared/api/fileProcessing";
import { expect, test } from "./upload-tests";
import { addMinutes } from "@/helpers/date-helpers";
import { processRecordingWithTracksAndTags } from "@/helpers/process-recordings";
import { ProjectBundle } from "@/helpers/create-test-entities";
import { ApiStaticVisitResponse } from "@shared/api/visit";
import { BulkVisitsResponse } from "@shared/client/Monitoring";

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
  duration?: number;
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

export interface RecordingUploadSpec {
  durationSeconds?: number;
  recordingDateTime: Date;
  tracks: (string | { tag: string; weight: number })[]; // TODO: Does current visit logic care about track length, or just recording duration?
}

const uploadRecordingsFromDeviceWithTimesAndDurations = async (
  recordingSpecs: RecordingUploadSpec[],
  deviceHandle: TestDeviceHandle,
  location: LatLng,
  file: ArrayBuffer,
  shouldProcess = true,
  sequentially = false,
  uploader: typeof uploadAudioRecordingFromDevice | typeof uploadThermalRecordingFromDevice,
): Promise<{ recordingId: RecordingId; tracks: TrackId[] }[]> => {
  // Upload multiple recordings at offset times with different durations to help testing visit islands.
  return test.step("Upload recordings and processing classifications", async () => {
    if (!sequentially) {
      return Promise.all(
        recordingSpecs.map((rec) => {
          const uploadTime = new Date(rec.recordingDateTime);
          const durationSeconds = rec.durationSeconds || 30;
          uploadTime.setSeconds(uploadTime.getSeconds() + durationSeconds);
          return new Promise<{ recordingId: RecordingId; tracks: TrackId[] }>((resolve, reject) => {
            uploader({
              file,
              recordingDateTime: rec.recordingDateTime,
              location,
              deviceHandle,
              uploadTime: addMinutes(uploadTime, 1),
              duration: rec.durationSeconds, // >2 Needed so we aren't filtered out of visits
            }).then((recordingId) => {
              if (shouldProcess) {
                processRecordingWithTracksAndTags(recordingId, rec.tracks, durationSeconds).then(
                  (trackIds) => {
                    resolve({ recordingId, tracks: trackIds });
                  },
                );
              } else {
                resolve({ recordingId, tracks: [] });
              }
            });
          });
        }),
      );
    } else {
      const recordingIds = [];
      const results = [];
      for (const rec of recordingSpecs) {
        const uploadTime = new Date(rec.recordingDateTime);
        const durationSeconds = rec.durationSeconds || 30;
        uploadTime.setSeconds(uploadTime.getSeconds() + durationSeconds);
        recordingIds.push(
          await uploader({
            file,
            recordingDateTime: rec.recordingDateTime,
            location,
            deviceHandle,
            uploadTime: addMinutes(uploadTime, 1),
            duration: rec.durationSeconds, // >2 Needed so we aren't filtered out of visits
          }),
        );
      }
      const zip = <A, B>(a: A[], b: B[]) => a.map((k, i) => [k, b[i]] as [A, B]);
      for (const [recordingId, rec] of zip(recordingIds, recordingSpecs)) {
        if (shouldProcess) {
          const trackIds = await processRecordingWithTracksAndTags(
            recordingId,
            rec.tracks,
            rec.durationSeconds || 30,
          );
          results.push({ recordingId, tracks: trackIds });
        } else {
          results.push({ recordingId, tracks: [] });
        }
      }
      return results;
    }
  });
};

export const uploadAudioRecordingsFromDeviceWithTimesAndDurations = async (
  recordingSpecs: RecordingUploadSpec[],
  deviceHandle: TestDeviceHandle,
  location: LatLng,
  file: ArrayBuffer,
  shouldProcess = true,
  sequentially = false,
): Promise<{ recordingId: RecordingId; tracks: TrackId[] }[]> =>
  uploadRecordingsFromDeviceWithTimesAndDurations(
    recordingSpecs,
    deviceHandle,
    location,
    file,
    shouldProcess,
    sequentially,
    uploadAudioRecordingFromDevice,
  );

export const uploadThermalRecordingsFromDeviceWithTimesAndDurations = async (
  recordingSpecs: RecordingUploadSpec[],
  deviceHandle: TestDeviceHandle,
  location: LatLng,
  file: ArrayBuffer,
  shouldProcess = true,
  sequentially = false,
): Promise<{ recordingId: RecordingId; tracks: TrackId[] }[]> =>
  uploadRecordingsFromDeviceWithTimesAndDurations(
    recordingSpecs,
    deviceHandle,
    location,
    file,
    shouldProcess,
    sequentially,
    uploadThermalRecordingFromDevice,
  );

export const checkVisitClassification = async (project: ProjectBundle, from: Date, until: Date) => {
  return await test.step("Check visit classification", async () => {
    const adminUser = project.getAdminUser().testId;
    const [runtimeVisits, staticVisits] = (await Promise.all([
      TestApiImpl.Monitoring.withAuth(adminUser).getAllVisitsForProjectBetweenTimes(
        project.projectHandle.id,
        from,
        until,
      ),
      TestApiImpl.Visits.withAuth(adminUser).getVisitsForProject(
        project.projectHandle.id,
        from,
        until,
      ),
    ])) as [BulkVisitsResponse, ApiStaticVisitResponse[]];
    expect(runtimeVisits.visits.length, "runtime visit count agrees with static").toEqual(
      staticVisits.length,
    );
    staticVisits.forEach((item, index) => {
      const visitClassification = (item.humanClassification || item.aiClassification) as string;
      expect(visitClassification, "static classification exists").not.toBeNull();
      const runtimeVisit = runtimeVisits.visits[index];
      expect(
        (runtimeVisit.classification || "").replaceAll("-", ""),
        "runtime visit agrees with static",
      ).toEqual(visitClassification.split(".").pop());
      expect(runtimeVisit.classFromUserTag, "runtime tagger agrees with static").toEqual(
        item.humanClassification !== null,
      );
    });
    return staticVisits.map(
      (item) => (item.humanClassification || item.aiClassification) as string,
    );
  });
};
