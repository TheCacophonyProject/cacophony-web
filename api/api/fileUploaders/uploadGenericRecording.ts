import type { MultipartFormPart } from "@api/fileUploaders/multipartFormDataHelper.js";
import log from "@log";
import {
  BadRequestError,
  ClientError,
  CustomError,
  UnprocessableError,
} from "@api/customErrors.js";
import {
  DeviceType,
  HttpStatusCode,
  RecordingProcessingState,
  RecordingType,
} from "@typedefs/api/consts.js";
import responseUtil, { successResponse } from "@api/V1/responseUtil.js";
import type { ModelsDictionary } from "@models";
import multiparty from "multiparty";
import type { NextFunction, Request, Response } from "express";
import { Op } from "sequelize";
import type { Recording } from "@models/Recording.js";
import { openS3 } from "@models/util/util.js";
import { Readable } from "stream";
import type streamWeb from "stream/web";
import { TransformStream } from "stream/web";
import type { CptvHeader } from "@api/cptv-decoder/decoder.js";
import { CptvDecoder } from "@api/cptv-decoder/decoder.js";
import type { Device } from "@models/Device.js";
import type { User } from "@models/User.js";
import crypto from "crypto";
import moment from "moment";
import { v4 as uuidv4 } from "uuid";
import type { DeviceId, GroupId, LatLng } from "@typedefs/api/common.js";
import {
  getDeviceIdAndGroupIdAndPossibleStationIdAtRecordingTime,
  guessMimeType,
  maybeUpdateDeviceHistory,
  sendAlerts,
  tracksFromMeta,
} from "@api/V1/recordingUtil.js";
import type { Station } from "@models/Station.js";
import type { Group } from "@models/Group.js";

const cameraTypes = [
  RecordingType.ThermalRaw,
  RecordingType.InfraredVideo,
  RecordingType.TrailCamImage,
  RecordingType.TrailCamVideo,
];

interface RecordingData {
  duration: number;
  type: RecordingType;
  location: LatLng;
  recordingDateTime: Date;
  processingState: RecordingProcessingState;
  rawFileHash: string;
  additionalMetadata?: any;
}

const mergeEmbeddedDataWithSuppliedRecordingData = (
  data: RecordingData,
  recordingUploadData: RecordingFileUploadResult
): RecordingData => {
  const mergedData = {
    ...data,
    ...recordingUploadData.embeddedMetadata,
  };
  // FIXME - reject/warn on  recordings without any location set, or location set to zero?
  if (recordingUploadData.embeddedMetadata) {
    const metadata = recordingUploadData.embeddedMetadata;
    if ("location" in metadata && metadata.latitude && metadata.longitude) {
      mergedData.location = {
        lat: metadata.latitude,
        lng: metadata.longitude,
      };
    }

    if (
      (!("duration" in data) && metadata.duration) ||
      (Number(data.duration) === 321 && metadata.duration)
    ) {
      // NOTE: Hack to make tests pass, but not allow sidekick uploads to set a spurious duration.
      //  A solid solution will disallow all of these fields that should come from the CPTV file as
      //  API settable metadata, and require tests to construct CPTV files with correct metadata.
      mergedData.duration = metadata.duration;
    }

    // FIXME - Can we get to here without a valid recordingDateTime?
    if (!("recordingDateTime" in data) && metadata.timestamp) {
      mergedData.recordingDateTime = new Date(metadata.timestamp / 1000);
    }
    if (metadata.previewSecs) {
      if (!mergedData.additionalMetadata) {
        mergedData.additionalMetadata = {};
      }
      mergedData.additionalMetadata.previewSecs = metadata.previewSecs;
    }
    if (metadata.totalFrames) {
      if (!mergedData.additionalMetadata) {
        mergedData.additionalMetadata = {};
      }
      mergedData.additionalMetadata.totalFrames = metadata.totalFrames;
    }
  } else if (
    !("recordingDateTime" in data) &&
    !("recordingDateTime" in mergedData)
  ) {
    throw new UnprocessableError("recordingDateTime not supplied");
  }
  return mergedData;
};

const uploadStream = (
  key: string,
  readableWebStream: streamWeb.ReadableStream,
  fileName?: string
) => {
  if (fileName) {
    return openS3().uploadStreaming(key, readableWebStream, {
      filename: fileName,
    });
  }
  return openS3().uploadStreaming(key, readableWebStream);
};

const processDataPart = (part: MultipartFormPart) => {
  return new Promise((resolve, reject) => {
    // Parse the data field.
    let jsonStream = "";
    part.on("data", (chunk: string) => {
      jsonStream += chunk;
    });
    part.on("end", () => {
      try {
        const data = JSON.parse(jsonStream);
        resolve(data);
      } catch (err) {
        reject(err);
      }
    });
  });
};

const validateDataPart = async (
  data: any,
  uploadingDeviceId: DeviceId,
  models: ModelsDictionary
) => {
  // If the recordingDateTime data field is set, it must be a valid date.
  if (
    "recordingDateTime" in data &&
    isNaN(Date.parse(data.recordingDateTime))
  ) {
    throw new UnprocessableError(
      `Invalid recordingDateTime '${data.recordingDateTime}'`
    );
  }
  if ("fileHash" in data && !!data.fileHash) {
    const existingRecordingWithHashForDevice = await models.Recording.findOne({
      where: {
        DeviceId: uploadingDeviceId,
        rawFileHash: data.fileHash,
        deletedAt: { [Op.eq]: null },
      },
    });
    if (existingRecordingWithHashForDevice !== null) {
      log.warning(
        "Recording with hash %s for device %s already exists, discarding duplicate",
        data.fileHash,
        uploadingDeviceId
      );
      throw new ClientError(
        "Duplicate recording found for device",
        HttpStatusCode.Ok
      );
    }
  }
  return data;
};

const processAndValidateDataPart = async (
  part: MultipartFormPart,
  uploadingDeviceId: DeviceId,
  models: ModelsDictionary
) => {
  try {
    const data = await processDataPart(part);
    return await validateDataPart(data, uploadingDeviceId, models);
  } catch (err) {
    part.emit("error", err);
  }
};

interface RecordingFileUploadResult {
  partName: string;
  key: string;
  isCorrupt: boolean;
  sha1Hash: string;
  fileLength: number;
  embeddedMetadata?: CptvHeader;
  fileName?: string;
}
const processFilePart = async (
  part: MultipartFormPart,
  groupId: GroupId,
  request: Request,
  canceledRequest: { canceled: boolean }
): Promise<RecordingFileUploadResult> => {
  let length = 0;
  // NOTE: it can end up that we are uploading old recordings for another group, in which case we'd want to rename these keys.
  const partKey = `${groupId}/${moment().format("YYYY/MM/DD/")}${uuidv4()}`;
  const sha1Hash = crypto.createHash("sha1");
  console.assert(!!part.filename, "NO FILENAME");
  const mightBeCptvFile =
    !("filename" in part) || (part.filename && part.filename.endsWith(".cptv"));
  const transform = new TransformStream({
    transform(chunk, controller) {
      if (canceledRequest.canceled) {
        upload.abort();
      }
      length += chunk.length;
      sha1Hash.update(chunk, "binary");
      controller.enqueue(chunk);
    },
  });
  let uploaderStream;
  let decodeStream;
  if (mightBeCptvFile) {
    const stream = Readable.toWeb(part);
    [uploaderStream, decodeStream] = stream.pipeThrough(transform).tee();
  } else {
    uploaderStream = Readable.toWeb(part).pipeThrough(transform);
  }
  // TODO: If there are multiple file uploads, and *any* fail or are prematurely aborted, we need to exit early.
  // Upload part, while piping it through a transform that performs sha1 + checks length.
  const upload = uploadStream(partKey, uploaderStream);

  // Special treatment for "file" part, since that is the "raw" file.
  // NOTE: Maybe validate stream, depending on upload recording type.
  //  If there have been recordings from this device previously, we can get the
  //  expected type from the device kind.
  let isCorrupt = false;
  let embeddedMetadata: CptvHeader | string;
  if (mightBeCptvFile) {
    // If the device is a known thermal camera, we can validate the cptv file, and potentially
    // exit early if it is found to be corrupt.
    const decoder = new CptvDecoder();
    embeddedMetadata = await decoder.getStreamMetadata(decodeStream);
    if (!canceledRequest.canceled) {
      if (typeof embeddedMetadata === "string") {
        log.error("Stream error %s", embeddedMetadata);
        // NOTE: we don't abort corrupt files, we just mark them as corrupt and keep them.
        isCorrupt = true;
        // TODO: The file could be corrupt, but we could still get a valid CPTV header out.
        //  test this case.
        const header = await decoder.getHeader();
        if (header) {
          embeddedMetadata = header;
        }
      }
      await upload.done().catch((error) => {
        if (error.name !== "AbortError") {
          log.info("Upload error: %s", error.toString());
        }
      });
    }
    await decoder.close();
  } else {
    await upload.done().catch((error) => {
      if (error.name !== "AbortError") {
        log.info("DONE? %s", error.toString());
      }
    });
  }
  const payload: RecordingFileUploadResult = {
    partName: part.name,
    isCorrupt,
    key: partKey,
    sha1Hash: sha1Hash.digest("hex"),
    fileLength: length,
  };
  if (embeddedMetadata && typeof embeddedMetadata !== "string") {
    payload.embeddedMetadata = embeddedMetadata as CptvHeader;
  }
  if (part.filename) {
    payload.fileName = part.filename;
  }
  return payload;
};

const createRecording = (
  models: ModelsDictionary,
  data: RecordingData,
  uploader: "device" | "user",
  uploadingDevice: Device,
  uploadingUser?: User
): Recording => {
  const recording = models.Recording.buildSafely(data);
  recording.public = uploadingDevice.public;
  recording.uploader = uploader;
  if (uploader === "device") {
    recording.DeviceId = uploadingDevice.id;
  }
  recording.uploaderId =
    uploader === "device" ? uploadingDevice.id : (uploadingUser as User).id;

  return recording;
};

export const uploadGenericRecordingFromDevice = (models: ModelsDictionary) =>
  uploadGenericRecording(models, true);
export const uploadGenericRecordingOnBehalfOfDevice = (
  models: ModelsDictionary
) => uploadGenericRecording(models, false);

export const uploadGenericRecording =
  (models: ModelsDictionary, fromDevice: boolean) =>
  async (request: Request, response: Response, next: NextFunction) => {
    // If it was the actual device uploading the recording, not a user
    // on the devices' behalf, set the lastConnectionTime for the device.
    const canceledRequest = { canceled: false };
    const uploader = fromDevice ? "device" : "user";

    // NOTE: Get the real device - do we always have this here, or just the device.id?
    let uploadingUser: User;
    const recordingDeviceId: DeviceId =
      (response.locals.requestDevice && response.locals.requestDevice.id) ||
      response.locals.device.id;
    let recordingDevice: Device = response.locals.requestDevice;
    if (
      !recordingDevice ||
      (recordingDevice && !response.locals.requestDevice.deviceName)
    ) {
      recordingDevice =
        response.locals.device ||
        (await models.Device.findByPk(recordingDeviceId, {
          include: [models.Group],
        }));
    }

    if (response.locals.requestUser) {
      uploadingUser = response.locals.requestUser;
    }

    const form = new multiparty.Form();
    form.on("error", (error: Error) => {
      if (error instanceof CustomError && !canceledRequest.canceled) {
        canceledRequest.canceled = true;
        return next(error);
      }
    });

    // TODO - depending on the kind of asset we're uploading, it can go to different object storage providers and buckets.
    //  Choose destination based on object type, and potentially owning group.
    const fileUploadsInProgress: Promise<RecordingFileUploadResult>[] = [];
    const recognisedFileParts = ["file", "derived", "thumb"];
    let dataPromise: Promise<any>;
    form.on("part", async (part: MultipartFormPart) => {
      if (canceledRequest.canceled) {
        part.destroy();
        return;
      }
      part.on("error", (error) => {
        if (error instanceof CustomError) {
          // Emit our custom errors to the form error handler,
          // which can then handle canceling the request.
          form.emit("error", error);
        }
      });

      if (part.name === "data") {
        dataPromise = processAndValidateDataPart(
          part,
          recordingDeviceId,
          models
        );
      } else if (recognisedFileParts.includes(part.name)) {
        fileUploadsInProgress.push(
          processFilePart(
            part,
            recordingDevice.GroupId,
            request,
            canceledRequest
          )
        );
      } else {
        part.emit(
          "error",
          new UnprocessableError(`Unknown form field '${part.name}'`)
        );
      }
    });

    // Only once all the parts are finished do we create the recording.
    form.on("close", async () => {
      let data = await dataPromise;
      const uploadResults = await Promise.all(fileUploadsInProgress);
      if (canceledRequest.canceled) {
        await deleteUploads(uploadResults);
        return;
      }
      const rawFileUploadResult = uploadResults.find(
        (part) => part.partName === "file"
      );
      const derivedUploadResult = uploadResults.find(
        (part) => part.partName === "derived"
      );
      try {
        data = mergeEmbeddedDataWithSuppliedRecordingData(
          data,
          rawFileUploadResult
        );
      } catch (error) {
        if (error instanceof CustomError && !canceledRequest) {
          canceledRequest.canceled = true;
          return next(error);
        }
      }
      if (
        data &&
        data.fileHash &&
        data.fileHash !== rawFileUploadResult.sha1Hash
      ) {
        // File was corrupted during upload, so we should reject it.
        log.error(
          "File hash check failed, for device %s, deleting key: %s",
          recordingDeviceId,
          rawFileUploadResult.key
        );
        // Hash check failed, delete the file from s3, and return an error which the client can respond
        // to in order to decide whether to retry immediately.
        await deleteUploads(uploadResults);
        if (!canceledRequest.canceled) {
          return next(
            new BadRequestError(
              "Uploaded file integrity check failed, please retry."
            )
          );
        } else {
          return;
        }
      }
      const recordingTemplate = createRecording(
        models,
        data,
        uploader,
        recordingDevice,
        uploadingUser
      );
      recordingTemplate.rawFileHash = rawFileUploadResult.sha1Hash;

      // NOTE: If processingState is supplied, we're in a test, and should not mark files as corrupt.
      //  We only detect corrupt thermalRaw files currently.
      if (
        data &&
        !data.processingState &&
        rawFileUploadResult.isCorrupt &&
        data.type === RecordingType.ThermalRaw
      ) {
        // The file couldn't be parsed, but it matches what was uploaded, so mark
        // it as corrupt and keep the file for investigation.
        recordingTemplate.processingState = RecordingProcessingState.Corrupt;
      }
      recordingTemplate.rawFileKey = rawFileUploadResult.key;
      recordingTemplate.rawMimeType = guessMimeType(
        recordingTemplate.type,
        rawFileUploadResult.fileName
      );

      recordingTemplate.rawFileSize = rawFileUploadResult.fileLength;
      if (derivedUploadResult) {
        recordingTemplate.fileKey = derivedUploadResult.key;
        recordingTemplate.fileMimeType = guessMimeType(
          recordingTemplate.type,
          derivedUploadResult.fileName
        );
        recordingTemplate.fileSize = derivedUploadResult.fileLength;
      }
      // Work out which group and station to assign based on recordingDateTime, device history etc.
      const {
        deviceId,
        groupId,
        station: stationToAssignToRecording,
      } = await assignGroupAndStationToRecording(
        models,
        recordingDevice,
        recordingTemplate.recordingDateTime,
        recordingTemplate.location
      );
      recordingTemplate.DeviceId = deviceId;
      recordingTemplate.GroupId = groupId;

      // TODO: Decide what we're doing about thumbnails etc.
      let recordingGroup: Group = recordingDevice.Group;
      console.assert(!!recordingDevice.Group, "NO DEVICE GROUP");
      if (deviceId !== recordingDevice.id) {
        // Get the actual device at the recording time.
        recordingDevice = await models.Device.findByPk(deviceId, {
          include: [models.Group],
        });
      }
      if (groupId !== recordingDevice.GroupId) {
        // We are uploading old recordings from a device that has since been reassigned to another group.
        // TODO: Rename s3 objects to start with the correct group name.
        // Get the actual group at the recording time.
        recordingGroup = await models.Group.findByPk(groupId);
      }
      let recordingDeviceUpdatePayload = {};
      if (fromDevice) {
        // Set the device active and update its connection time.
        recordingDeviceUpdatePayload = {
          lastConnectionTime: new Date(),
          active: true,
        };
      }

      const wouldHaveSuppliedTracks = dataHasSuppliedTracks(data);
      const wouldHaveSuppliedTracksWithPredictions =
        dataHasSuppliedTracksWithPredictions(data);
      setInitialProcessingState(
        recordingTemplate,
        data,
        wouldHaveSuppliedTracksWithPredictions
      );

      const [recording, _station] = await Promise.all([
        recordingTemplate.save(),
        maybeUpdateLastRecordingTimesForStation(
          recordingTemplate,
          stationToAssignToRecording
        ),
        maybeUpdateLastRecordingTimesForDeviceAndGroup(
          recordingTemplate,
          recordingDevice,
          recordingDeviceUpdatePayload,
          recordingGroup
        ),
      ]);

      if (wouldHaveSuppliedTracks) {
        // Now that we have a recording saved to the DB, we can create any associated track items
        await tracksFromMeta(models, recording, data.metadata);
      }

      const recordingHasFinishedProcessing =
        recording.processingState ===
        models.Recording.finishedState(data.type as RecordingType);
      if (recordingHasFinishedProcessing) {
        // NOTE: Should only occur during testing.
        const twentyFourHoursMs = 24 * 60 * 60 * 1000;
        const recordingAgeMs =
          new Date().getTime() - recording.recordingDateTime.getTime();
        if (uploader === "device" && recordingAgeMs < twentyFourHoursMs) {
          // Alerts should only be sent for uploading devices.
          await sendAlerts(models, recording.id);
        }
      }

      // console.log(uploadResults);
      // console.log(data);
      // console.log(recording.get({ plain: true }));

      // Add file data info to data (length, key, mimeType etc)

      // Create recording, adding any embedded metadata from the file(s), and assigning location,
      // updating device history, etc.

      // Insert recording into DB.
      if (!response.headersSent) {
        return successResponse(response, "Thanks for the data", {
          recordingId: recording.id,
        });
      }
    });

    form.parse(request);
  };

const deleteUploads = async (uploadResults: RecordingFileUploadResult[]) => {
  const deleteUploadPromises = [];
  for (const uploadResult of uploadResults) {
    deleteUploadPromises.push(
      openS3()
        .deleteObject(uploadResult.key)
        .catch((err) => {
          return err;
        })
    );
  }
  return Promise.allSettled(deleteUploadPromises);
};

const recordingUploadedState = (type: RecordingType) => {
  if (type == RecordingType.Audio) {
    return RecordingProcessingState.Analyse;
  } else {
    return RecordingProcessingState.Tracking;
  }
};
const recordingFinishedState = (type: RecordingType) => {
  if (type == RecordingType.Audio) {
    return RecordingProcessingState.Finished;
  } else {
    return RecordingProcessingState.Finished;
  }
};

const dataHasSuppliedTracks = (data: { metadata?: any }) => {
  return (
    data.metadata && data.metadata.tracks && data.metadata.tracks.length !== 0
  );
};

const dataHasSuppliedTracksWithPredictions = (data: { metadata?: any }) => {
  return (
    data.metadata &&
    data.metadata.tracks &&
    data.metadata.tracks.some(
      (track) => track.predictions && track.predictions.length !== 0
    )
  );
};

const setInitialProcessingState = (
  recordingTemplate: Recording,
  data: { processingState?: RecordingProcessingState; type: RecordingType },
  hasSuppliedTracks: boolean
) => {
  if (data.processingState) {
    // NOTE: If the processingState field is present when a recording is uploaded, this means that the recording
    //  has already been processed, and we are supplying the processing results with the recording.
    //  This *only* happens from the test suite, and exists solely for testing purposes.
    recordingTemplate.processingState = data.processingState;
  } else {
    // NOTE: During testing, even if the file is corrupt, it won't be marked as such if a concrete processingState
    //  is supplied.  This would ideally get fixed once we are always uploading valid files during testing.

    if (
      recordingTemplate.processingState !== RecordingProcessingState.Corrupt
    ) {
      if (
        hasSuppliedTracks &&
        recordingTemplate.type === RecordingType.ThermalRaw
      ) {
        // NOTE: If there are supplied tracks, we have already done tracking on the device, so skip to analyse state.
        recordingTemplate.processingState =
          RecordingProcessingState.AnalyseThermal;
      } else if (
        recordingTemplate.type !== RecordingType.TrailCamImage &&
        recordingTemplate.type !== RecordingType.TrailCamVideo
      ) {
        recordingTemplate.processingState = recordingUploadedState(data.type);
      } else {
        // Trailcam and others
        recordingTemplate.processingState = RecordingProcessingState.Finished;
      }
    }
  }
  recordingTemplate.currentStateStartTime = new Date();
};

const assignGroupAndStationToRecording = async (
  models: ModelsDictionary,
  deviceForRecording: Device,
  recordingDateTime: Date,
  recordingLocation?: LatLng
): Promise<{ groupId: GroupId; deviceId: DeviceId; station: Station }> => {
  let groupId;
  let deviceId;
  let station;
  if (recordingLocation) {
    const { stationToAssignToRecording, deviceHistoryEntry } =
      await maybeUpdateDeviceHistory(
        models,
        deviceForRecording,
        recordingLocation,
        recordingDateTime
      );
    station = stationToAssignToRecording;
    deviceId = deviceHistoryEntry.DeviceId;
    groupId = deviceHistoryEntry.GroupId;
  }

  if (!deviceId && !groupId) {
    // Check what group the uploading device (or the device embedded in the recording) was part of at the time the recording was made.
    const { deviceId: d, groupId: g } =
      await getDeviceIdAndGroupIdAndPossibleStationIdAtRecordingTime(
        models,
        deviceForRecording,
        recordingDateTime
      );
    deviceId = d;
    groupId = g;
  }
  return {
    groupId,
    deviceId,
    station,
  };
};

const maybeUpdateLastRecordingTimesForStation = async (
  recordingData: Recording,
  station?: Station
): Promise<void | Station> => {
  let stationUpdatePromise: Promise<void | Station> = new Promise(
    (resolve, _reject) => {
      resolve();
    }
  );
  if (station) {
    recordingData.StationId = station.id;
    {
      // Update station lastRecordingTimes if needed.
      if (
        recordingData.type === RecordingType.Audio &&
        (!station.lastAudioRecordingTime ||
          recordingData.recordingDateTime > station.lastAudioRecordingTime)
      ) {
        station.lastAudioRecordingTime = recordingData.recordingDateTime;
        stationUpdatePromise = station.save();
      } else if (
        cameraTypes.includes(recordingData.type) &&
        (!station.lastThermalRecordingTime ||
          recordingData.recordingDateTime > station.lastThermalRecordingTime)
      ) {
        station.lastThermalRecordingTime = recordingData.recordingDateTime;
        stationUpdatePromise = station.save();
      }
    }
  }
  return stationUpdatePromise;
};

const maybeUpdateLastRecordingTimesForDeviceAndGroup = async (
  recording: Recording,
  uploadingDevice: Device,
  updateDevicePayload: {
    kind?: DeviceType;
    location?: LatLng;
    lastRecordingTime?: Date;
    lastConnectionTime?: Date;
    active?: boolean;
  },
  uploadingGroup: Group
): Promise<void> => {
  if (uploadingDevice.kind === DeviceType.Unknown) {
    // If this is the first recording we've gotten from a device, we can set its type.
    const typeMappings = {
      [RecordingType.Audio]: DeviceType.Audio,
      [RecordingType.ThermalRaw]: DeviceType.Thermal,
      [RecordingType.TrailCamVideo]: DeviceType.TrailCam,
      [RecordingType.TrailCamImage]: DeviceType.TrailCam,
      [RecordingType.InfraredVideo]: DeviceType.TrapIrCam,
    };
    updateDevicePayload.kind = typeMappings[recording.type];
  }
  if (
    (uploadingDevice.kind === DeviceType.Thermal &&
      recording.type === RecordingType.Audio) ||
    (uploadingDevice.kind === DeviceType.Audio &&
      recording.type === RecordingType.ThermalRaw)
  ) {
    // If we have a hybrid bird monitor/thermal camera device, we can update its type when we know it's used for both things.
    updateDevicePayload.kind = DeviceType.Hybrid;
  }
  // Update the device location and lastRecordingTime from the recording data,
  // if the recording time is *later* than the last recording time, or there
  // is no last recording time
  const updateGroupPayload: {
    lastThermalRecordingTime?: Date;
    lastAudioRecordingTime?: Date;
  } = {};
  if (
    !uploadingDevice.lastRecordingTime ||
    uploadingDevice.lastRecordingTime < recording.recordingDateTime
  ) {
    updateDevicePayload.location = recording.location;
    updateDevicePayload.lastRecordingTime = recording.recordingDateTime;
    if (
      cameraTypes.includes(recording.type) &&
      (!uploadingGroup.lastThermalRecordingTime ||
        uploadingGroup.lastThermalRecordingTime < recording.recordingDateTime)
    ) {
      updateGroupPayload.lastThermalRecordingTime = recording.recordingDateTime;
    } else if (
      recording.type === RecordingType.Audio &&
      (!uploadingGroup.lastAudioRecordingTime ||
        uploadingGroup.lastAudioRecordingTime < recording.recordingDateTime)
    ) {
      updateGroupPayload.lastAudioRecordingTime = recording.recordingDateTime;
    }
  }
  const hasGroupUpdate = Object.keys(updateGroupPayload).length !== 0;
  const hasDeviceUpdate = Object.keys(updateDevicePayload).length !== 0;
  if (hasDeviceUpdate && hasGroupUpdate) {
    return new Promise((resolve, _reject) => {
      Promise.all([
        uploadingDevice.update(updateDevicePayload),
        uploadingGroup.update(updateDevicePayload),
      ]).then(() => resolve());
    });
  } else if (hasDeviceUpdate) {
    return new Promise((resolve, _reject) => {
      uploadingDevice.update(updateDevicePayload).then(() => resolve());
    });
  } else {
    return new Promise((resolve, _reject) => {
      resolve();
    }) as Promise<void>;
  }
};
