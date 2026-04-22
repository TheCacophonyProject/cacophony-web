import { LatLng, RecordingId } from "@shared/api/common";
import { ProjectBundle } from "@/helpers/create-test-entities";
import {
    ApiRecordingResponse,
    ApiRecordingUploadData
} from "@shared/api/recording";
import { RecordingType } from "@shared/api/consts";
import {TestDeviceHandle, TestEntityHandle} from "@shared/client/types";
import {TestApi, TestApiImpl} from "@shared/client";
import { RecordingDataSuppliedMetadata } from "@shared/api/fileProcessing";
import {expect, test} from "./upload-tests";

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
        project: ProjectBundle;
        file: ArrayBuffer;
        location?: LatLng;
        deviceHandle?: TestDeviceHandle;
        duration?: number;
        metadata?: RecordingDataSuppliedMetadata;
        type: RecordingType;
        recordingDateTime: Date;
    },
): Promise<RecordingId | null> => {
    return await test.step(`Upload recording`, async () => {
        expect(["user", "device"], "uploader must be device or user").toContain(
            uploaderHandle.type,
        );
        const deviceId = uploaderHandle.id;
        const rawFile = recordingOptions.file;
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
            upload = TestApiImpl.Recordings.withAuth(
                uploaderHandle.testId,
            ).uploadRecordingFromDevice(data, rawFile, rawFileName);
        } else if (uploaderHandle.type === "user") {
            upload = TestApiImpl.Recordings.withAuth(
                uploaderHandle.testId,
            ).uploadRecordingOnBehalfOfDevice(deviceId, data, rawFile, rawFileName);
        }
        const response = await upload;
        expect(response.success, "uploaded recording").toBeTruthy();
        if (response.success) {
            return response.result.recordingId;
        } else {
            console.error("Failed to upload recording", response);
        }
        return null;
    });
};

export const uploadRecordingFromDeviceForProject = async (options: {
    project: ProjectBundle;
    file: ArrayBuffer,
    location?: LatLng;
    deviceHandle?: TestDeviceHandle;
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
    file: ArrayBuffer;
    location?: LatLng;
    deviceHandle?: TestDeviceHandle;
    duration?: number; // Artificially set a duration for test purposes
    metadata?: RecordingDataSuppliedMetadata;
    recordingDateTime: Date;
}): Promise<RecordingId> => {
    return uploadRecordingFromDeviceForProject({
        ...options,
        type: RecordingType.ThermalRaw,
    });
};

export const getRecordingAsUser = async (api: TestApi, recordingId: RecordingId) => {
    return await test.step(`Get recording #${recordingId}`, async () => {
        const recording = await api.Recordings.getRecordingById(recordingId);
        expect(recording, "got recording").toBeTruthy();
        return recording as ApiRecordingResponse;
    });
};

export const uploadThermalTestRecordingFromDeviceForProject = async (options: {
    project: ProjectBundle;
    file: ArrayBuffer;
    location?: LatLng;
    deviceHandle?: TestDeviceHandle;
    recordingDateTime: Date;
}): Promise<RecordingId> => {
    return uploadRecordingFromDeviceForProject({
        ...options,
        type: RecordingType.ThermalRaw,
    });
};

export const uploadThermalStartupRecordingFromDeviceForProject =
    async (options: {
        project: ProjectBundle;
        file: ArrayBuffer;
        location?: LatLng;
        deviceHandle?: TestDeviceHandle;
        recordingDateTime: Date;
    }): Promise<RecordingId> => {
        return uploadRecordingFromDeviceForProject({
            ...options,
            type: RecordingType.ThermalRaw
        });
    };

export const uploadThermalShutdownRecordingFromDeviceForProject =
    async (options: {
        project: ProjectBundle;
        file: ArrayBuffer;
        location?: LatLng;
        deviceHandle?: TestDeviceHandle;
        recordingDateTime: Date;
    }): Promise<RecordingId> => {
        return uploadRecordingFromDeviceForProject({
            ...options,
            type: RecordingType.ThermalRaw,
        });
    };

export const uploadAudioRecordingFromDeviceForProject = async (options: {
    project: ProjectBundle;
    file: ArrayBuffer;
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
    file: ArrayBuffer;
    location?: LatLng;
    deviceHandle?: TestDeviceHandle;
    recordingDateTime: Date;
}): Promise<RecordingId> => {
    return uploadRecordingFromDeviceForProject({
        ...options,
        type: RecordingType.Audio,
    });
};
