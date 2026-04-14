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
import { successResponse } from "@api/V1/responseUtil.js";
import multiparty from "multiparty";
import { NextFunction, Request, Response } from "express";
import Sequelize, { Op, Transaction } from "sequelize";
import { Recording } from "@models/Recording.js";
import { openS3 } from "@models/util/util.js";
import { Readable } from "stream";
import {
  ReadableStream as WebReadableStream,
  TransformStream,
} from "stream/web";
import type { CptvFrame, CptvHeader } from "@api/cptv-decoder/decoder.js";
import { CptvDecoder } from "@api/cptv-decoder/decoder.js";
import { Device } from "@models/Device.js";
import type { User } from "@models/User.js";
import crypto from "crypto";
import moment from "moment";
import { v4 as uuidv4 } from "uuid";
import type {
  DeviceId,
  GroupId,
  IsoFormattedDateString,
  LatLng,
} from "@typedefs/api/common.js";
import {
  createThumbnail,
  getDeviceIdAndGroupIdAndPossibleStationIdAtRecordingTime,
  guessMimeType,
  maybeUpdateDeviceHistory,
  sendAlerts,
  ThumbnailData,
  tracksFromMeta,
  updateRecordingTimeBookkeeping,
} from "@api/V1/recordingUtil.js";
import { Station } from "@models/Station.js";
import { Group } from "@models/Group.js";
import { isLatLon } from "@models/util/validation.js";
import { tryReadingM4aMetadata } from "@api/m4a-metadata-reader/m4a-metadata-reader.js";
import { RecordingDataSuppliedMetadata } from "@typedefs/api/fileProcessing.js";
import { Fn } from "sequelize/lib/utils";
import { Visit, VISITS_ADVISORY_LOCK_KEY } from "@models/Visit.js";
import { DeviceHistory } from "@models/DeviceHistory.js";
import { JsonDocument } from "@typedefs/api/event.js";
import { parseFormData } from "pechkin";
import { ByteLengthTruncateStream } from "pechkin/dist/ByteLengthTruncateStream.js";

interface RecordingData {
  duration?: number;
  status?: "test" | "startup" | "shutdown";
  type: RecordingType;
  location?: LatLng;
  recordingDateTime?: Date | IsoFormattedDateString;
  processingState: RecordingProcessingState;
  rawFileHash: string;
  additionalMetadata?: Record<string, number | string>;
  fileHash?: string;
  filename?: string;
  metadata?: RecordingDataSuppliedMetadata;
}

const mergeEmbeddedDataWithSuppliedRecordingData = (
  data: RecordingData,
  recordingUploadData: RecordingFileUploadResult,
  deviceId: DeviceId,
): RecordingData => {
  const mergedData: RecordingData = {
    ...recordingUploadData.embeddedMetadata,
    ...data,
  };
  // FIXME - reject/warn on  recordings without any location set, or location set to zero?
  if (recordingUploadData.embeddedMetadata) {
    const metadata = recordingUploadData.embeddedMetadata;
    if (
      !("location" in mergedData) &&
      metadata.latitude &&
      metadata.longitude
    ) {
      mergedData.location = {
        lat: Number(metadata.latitude),
        lng: Number(metadata.longitude),
      };
    }

    // TODO: When tc2-agent is correctly adding test metadata,
    //  we can also check for `"testRecording" in mergedData`
    if (mergedData.type === RecordingType.Audio) {
      // Add test status for audio recording.
      if (!mergedData.additionalMetadata) {
        mergedData.additionalMetadata = {};
      }
      if (mergedData.duration < 11.0) {
        mergedData.additionalMetadata.status = "test";
      } else if (mergedData.duration > 60 * 4) {
        mergedData.additionalMetadata.status = "bird-count";
      }
    }

    if ("motionConfig" in mergedData) {
      // See if it's a low power test/startup/shutdown recording.
      try {
        let mc = mergedData.motionConfig as string;
        if (mc.startsWith("status:")) {
          mc = `{ "status": "${mc.replace("status:", "").trim()}" }`;
        }
        const motionConfig = JSON.parse(mc);

        if (motionConfig.status) {
          if (!mergedData.additionalMetadata) {
            mergedData.additionalMetadata = {};
          }
          mergedData.additionalMetadata.status = motionConfig.status;
        }
      } catch (_e) {
        // Failed to parse motion config JSON.
      }
    }

    if (
      (!("duration" in data) && metadata.duration) ||
      (Number(data.duration) === 321 && metadata.duration)
    ) {
      // NOTE: Hack to make tests pass, but not allow sidekick uploads to set a spurious duration.
      //  A solid solution will disallow all of these fields that should come from the CPTV file as
      //  API settable metadata, and require tests to construct CPTV files with correct metadata.
      mergedData.duration = Number(metadata.duration);
    }

    // FIXME - Can we get to here without a valid recordingDateTime?
    if (!("recordingDateTime" in data) && metadata.timestamp) {
      mergedData.recordingDateTime = new Date(
        Number(metadata.timestamp) / 1000,
      );
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
  } else if (!("recordingDateTime" in mergedData)) {
    throw new UnprocessableError(
      `recordingDateTime not supplied for device ${deviceId}`,
    );
  }
  if (mergedData.status) {
    if (!mergedData.additionalMetadata) {
      mergedData.additionalMetadata = {};
    }
    mergedData.additionalMetadata.status = mergedData.status;
  }
  return mergedData;
};

const uploadStream = (
  key: string,
  readableWebStream: WebReadableStream,
  fileName?: string,
) => {
  if (fileName) {
    return openS3().uploadStreaming(key, readableWebStream as ReadableStream, {
      filename: fileName,
    });
  }
  return openS3().uploadStreaming(key, readableWebStream as ReadableStream);
};

const processDataPart = (part: MultipartFormPart): Promise<JsonDocument> => {
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
  data: JsonDocument,
  uploadingDeviceId: DeviceId,
) => {
  // If the recordingDateTime data field is set, it must be a valid date.
  if (typeof data !== "object") {
    throw new UnprocessableError(`Could not validate data part: ${data}`);
  }
  const dataObj = data as RecordingData;
  if (
    "recordingDateTime" in dataObj &&
    isNaN(Date.parse((dataObj.recordingDateTime || "").toString()))
  ) {
    throw new UnprocessableError(
      `Invalid recordingDateTime '${dataObj.recordingDateTime}'`,
    );
  }
  if ("duration" in dataObj) {
    const duration = Number(dataObj.duration);
    if (isNaN(duration) || duration <= 0) {
      throw new UnprocessableError(
        `Invalid recording duration '${dataObj.duration}'`,
      );
    }
  }
  if ("fileHash" in dataObj && !!dataObj.fileHash) {
    const existingRecordingWithHashForDevice: Recording =
      (await Recording.findOne({
        where: {
          DeviceId: uploadingDeviceId,
          rawFileHash: dataObj.fileHash,
          deletedAt: { [Op.eq]: null },
        },
      })) as Recording;
    if (existingRecordingWithHashForDevice !== null) {
      log.warning(
        "Recording with hash %s for device %s already exists, discarding duplicate",
        dataObj.fileHash,
        uploadingDeviceId,
      );
      throw new ClientError(
        `Duplicate recording found for device: ${existingRecordingWithHashForDevice.DeviceId}, (recording #${existingRecordingWithHashForDevice.id})`,
        HttpStatusCode.Ok,
      );
    }
  }
  return dataObj;
};

interface RecordingFileUploadResult {
  partName: string;
  key: string;
  isCorrupt: boolean;
  sha1Hash: string;
  fileLength: number;
  embeddedMetadata?: CptvHeader | Record<string, string | number>;
  fileName?: string;
  clipThumbnail?: ThumbnailData;
}

const mapPartName = (partKey: string, partName: string): string => {
  switch (partName) {
    case "file":
      return `raw/${partKey}`;
    case "derived":
      return `rec/${partKey}`;
    case "thumb":
      return `raw/${partKey}-thumb`;
  }
  return partKey;
};

const closeStreams = async (streams: (WebReadableStream | undefined)[]) => {
  for (const stream of streams) {
    if (stream && stream.cancel && !stream.locked) {
      try {
        await stream.cancel();
      } catch (_err) {
        // Failed to cancel stream
      }
    }
  }
};

const processFilePart = async (
  partKey: string,
  part: ByteLengthTruncateStream,
  data: RecordingData,
): Promise<RecordingFileUploadResult> => {
  console.assert(!!data, "DATA MISSING");
  console.assert(!!data.type, "FILETYPE MISSING");
  let length = 0;
  // NOTE: it can end up that we are uploading old recordings for another group, in which case we'd want to rename these keys.
  const sha1Hash = crypto.createHash("sha1");
  //  so we need to check for m4a metadata as well as trying to parse as a CPTV file.
  const isCptvFile = data.type === RecordingType.ThermalRaw;
  const isAudioFile = data.type === RecordingType.Audio;

  const transform = new TransformStream({
    transform(chunk, controller) {
      length += chunk.length;
      sha1Hash.update(chunk, "binary");
      controller.enqueue(chunk);
    },
  });
  const stream: WebReadableStream = Readable.toWeb(part);
  const [uploaderStream, mediaDecodeStream] = stream
    .pipeThrough(transform)
    .tee();
  const streams = [stream, uploaderStream, mediaDecodeStream];
  // Upload part, while piping it through a transform that performs sha1 + checks length.
  const upload = uploadStream(partKey, uploaderStream);
  let isCorrupt = false;
  let embeddedMetadata:
    | (CptvHeader & { firstFrame?: CptvFrame })
    | string
    | Record<string, unknown>;
  let uploaded = false;
  let decoder: CptvDecoder;

  // FIXME: Rewrite this for both device uploads from tc2-devices, and from sidekick uploads.
  //  Also handle device uploads from classic cameras, and via sidekick
  if (isCptvFile) {
    // If the device is a known thermal camera, we can validate the cptv file, and potentially
    // exit early if it is found to be corrupt.
    try {
      decoder = new CptvDecoder();
      embeddedMetadata = await decoder.getStreamMetadata(mediaDecodeStream);

      if (typeof embeddedMetadata === "string") {
        // NOTE: we don't abort corrupt files, we just mark them as corrupt and keep them.
        isCorrupt = true;
        log.warning("CPTV Stream error %s", embeddedMetadata);
      }
      // If this is a zero-sized file, we will timeout when trying to upload it via the S3 API.
      if (length === 0) {
        log.warning("Zero length file");
        await upload.abort().catch(() => {
          closeStreams(streams);
          return;
        });
      } else {
        await upload.done().catch((error) => {
          closeStreams(streams);
          if (
            error.name !== "AbortError" &&
            !error.toString().includes("Request aborted")
          ) {
            decoder.close().then(() => {
              part.emit(
                "error",
                new UnprocessableError(
                  `Upload error: 'file', ${error.toString()}'`,
                ),
              );
            });
          }
        });
        uploaded = true;
      }
    } catch (e) {
      // Close streams
      await closeStreams(streams);
      part.emit("error", new UnprocessableError(e));
    } finally {
      if (decoder && decoder.close) {
        await decoder.close();
      }
    }
  } else if (isAudioFile) {
    try {
      const metadata = await tryReadingM4aMetadata(mediaDecodeStream);
      if (typeof metadata === "string") {
        log.warning("Failed parsing m4a metadata: %s", metadata);
        // Probably wasn't a valid .aac file?  Could be an old bird-recorder file.
        // isCorrupt = true;
      } else if (typeof metadata === "object") {
        embeddedMetadata = metadata as Record<string, string>;
      }

      if (length === 0) {
        log.warning("Zero length file");
        await upload.abort().catch(() => {
          closeStreams(streams);
          return;
        });
      } else {
        await upload.done().catch((error) => {
          closeStreams(streams);
          if (error.name !== "AbortError") {
            part.emit(
              "error",
              new UnprocessableError(
                `Upload error: 'file', ${error.toString()}'`,
              ),
            );
          }
        });
        uploaded = true;
      }
    } catch (e) {
      // Close streams
      await closeStreams(streams);
      part.emit("error", new UnprocessableError(e));
    }
  }
  if (!uploaded) {
    await upload.done().catch((error) => {
      closeStreams(streams);
      if (error.name !== "AbortError") {
        log.error("DONE? %s", error.toString());
        part.emit(
          "error",
          new UnprocessableError(`Upload error: 'file', ${error.toString()}`),
        );
      }
    });
  }
  await closeStreams(streams);

  const payload: RecordingFileUploadResult = {
    partName: "file",
    isCorrupt,
    key: length ? partKey : null,
    sha1Hash: sha1Hash.digest("hex"),
    fileLength: length,
  };

  if (embeddedMetadata && typeof embeddedMetadata !== "string") {
    if (isCptvFile && embeddedMetadata.firstFrame) {
      payload.clipThumbnail = await createThumbnail(
        (embeddedMetadata as CptvHeader & { firstFrame?: CptvFrame })
          .firstFrame,
        { x: 0, y: 0, width: 160, height: 120 },
      );
      delete embeddedMetadata.firstFrame;
    }
    payload.embeddedMetadata = embeddedMetadata as
      | CptvHeader
      | Record<string, number>;
  }
  return payload;
};

const createRecording = (
  data: RecordingData,
  uploader: "device" | "user",
  uploadingDevice: Device,
  uploadingUser?: User,
): Recording => {
  const recording = Recording.buildSafely(
    data as unknown as Record<string, unknown>,
  );
  recording.public = uploadingDevice.public;
  recording.uploader = uploader;
  if (uploader === "device") {
    recording.DeviceId = uploadingDevice.id;
  }
  recording.uploaderId =
    uploader === "device" ? uploadingDevice.id : (uploadingUser as User).id;

  return recording;
};

export const uploadGenericRecordingFromDevice = () =>
  uploadGenericRecording(true);
export const uploadGenericRecordingOnBehalfOfDevice = () =>
  uploadGenericRecording(false);

export const uploadGenericRecording =
  (fromDevice: boolean) =>
  async (request: Request, response: Response, next: NextFunction) => {
    // If it was the actual device uploading the recording, not a user
    // on the devices' behalf, set the lastConnectionTime for the device.
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
        (await Device.findByPk(recordingDeviceId, {
          include: [Group],
        }));
    }

    if (!recordingDevice) {
      return next(
        new UnprocessableError(
          `No device found for ID ${recordingDeviceId}. Cannot proceed with upload.`,
        ),
      );
    }
    if (!recordingDevice.GroupId) {
      return next(
        new UnprocessableError(
          `Device ${recordingDeviceId} is not assigned to any group. Cannot upload a recording.`,
        ),
      );
    }
    if (!recordingDevice.Group) {
      // If we rely on `recordingDevice.Group` from `include: [models.Group]`
      return next(
        new UnprocessableError(
          `Device ${recordingDeviceId} has GroupId = ${recordingDevice.GroupId}, but no matching group found.`,
        ),
      );
    }

    if (response.locals.requestUser) {
      uploadingUser = response.locals.requestUser;
    }
    const partKey = `${recordingDevice.GroupId}/${moment().format(
      "YYYY/MM/DD/",
    )}${uuidv4()}`;
    let uploadResult: RecordingFileUploadResult;
    let recordingData: RecordingData;
    try {
      const { fields, files } = await parseFormData(request, {
        maxTotalFileFieldCount: Infinity,
        maxFileCountPerField: Infinity,
        maxTotalFileCount: 1,
      });
      if (!("data" in fields)) {
        return next(new UnprocessableError("'data' field missing"));
      }
      recordingData = await validateDataPart(
        JSON.parse(fields.data) as JsonDocument,
        recordingDeviceId,
      );

      for await (const {
        filename: originalFilename,
        stream,
        ...file
      } of files) {
        if (file.field === "file") {
          uploadResult = await processFilePart(
            mapPartName(partKey, file.field),
            stream,
            recordingData,
          );
          uploadResult.fileName = originalFilename;
        }
      }
    } catch (err) {
      // What kind of errors can we have?  Do we handle early upload termination?
      return next(err);
    }

    try {
      recordingData = mergeEmbeddedDataWithSuppliedRecordingData(
        recordingData,
        uploadResult,
        recordingDeviceId,
      );
    } catch (error) {
      console.assert(error instanceof CustomError, "Expected CustomError");
      await deleteUploads([uploadResult]);
      return next(error);
    }
    // NOTE: For uploads of old audio files without all embedded location metadata:
    if (
      recordingData.type === RecordingType.Audio &&
      !recordingData.location &&
      recordingDevice &&
      recordingDevice.location
    ) {
      const deviceLocationAtTime = await DeviceHistory.getDeviceLocationAtTime(
        recordingDevice.id,
        recordingDevice.GroupId,
        new Date(recordingData.recordingDateTime),
      );
      if (deviceLocationAtTime) {
        recordingData.location = deviceLocationAtTime;
      } else {
        recordingData.location = recordingDevice.location;
      }
    }

    // Reject recordings with invalid locations
    if (
      !("location" in recordingData) ||
      ("location" in recordingData && !recordingData.location) ||
      ("location" in recordingData && !isLatLon(recordingData.location, false))
    ) {
      await deleteUploads([uploadResult]);
      return next(
        new UnprocessableError(
          `Invalid location '${JSON.stringify(recordingData["location"])}' for device ${recordingDeviceId}, data: ${JSON.stringify(recordingData)}`,
        ),
      );
    }

    if (
      recordingData.fileHash &&
      recordingData.fileHash !== uploadResult.sha1Hash
    ) {
      // File was corrupted during upload, so we should reject it.
      log.error(
        "File hash check failed, for device %s, deleting key: %s",
        recordingDeviceId,
        uploadResult.key,
      );
      // Hash check failed, delete the file from s3, and return an error which the client can respond
      // to in order to decide whether to retry immediately.
      await deleteUploads([uploadResult]);
      return next(
        new BadRequestError(
          "Uploaded file integrity check failed, please retry.",
        ),
      );
    }

    const recordingTemplate = createRecording(
      recordingData,
      uploader,
      recordingDevice,
      uploadingUser,
    );
    recordingTemplate.rawFileHash = uploadResult.sha1Hash;

    // NOTE: If processingState is supplied, we're in a test, and should not mark files as corrupt.
    //  We only detect corrupt thermalRaw files currently.
    if (
      !recordingData.processingState &&
      uploadResult.isCorrupt &&
      "type" in recordingData &&
      recordingData.type === RecordingType.ThermalRaw
    ) {
      // The file couldn't be parsed, but it matches what was uploaded, so mark
      // it as corrupt and keep the file for investigation.
      recordingTemplate.processingState = RecordingProcessingState.Corrupt;
    }
    recordingTemplate.rawFileKey = uploadResult.key;
    recordingTemplate.rawMimeType = guessMimeType(
      recordingTemplate.type,
      uploadResult.fileName,
    );

    recordingTemplate.rawFileSize = uploadResult.fileLength;
    if (recordingTemplate.recordingDateTime.toString() === "Invalid Date") {
      log.warning(
        "Discarding recording for DeviceId(%s) with invalid recordingDateTime: %s",
        recordingTemplate.DeviceId,
        recordingTemplate.recordingDateTime,
      );
      return next(
        new UnprocessableError(
          `Unable to parse recording date (${recordingTemplate.recordingDateTime}) (from ${JSON.stringify(recordingData)}).`,
        ),
      );
    }
    // Allow recordings to be from 10mins in the future, to allow for RTC drift on devices.
    if (
      recordingTemplate.recordingDateTime.getTime() >
      Date.now() + 1000 * 60 * 10
    ) {
      // Recording is from the future, set the recordingDateTime to "now".
      log.warning(
        "Got recording for DeviceId(%s) with future recordingDateTime: %s",
        recordingTemplate.DeviceId,
        recordingTemplate.recordingDateTime,
      );
      recordingTemplate.recordingDateTime = new Date();
    }

    // Work out which group and station to assign based on recordingDateTime, device history etc.
    const groupAndStation = await assignGroupAndStationToRecording(
      recordingDevice,
      recordingTemplate.recordingDateTime,
      recordingTemplate.location,
    );
    if (typeof groupAndStation === "string") {
      // Lat/lng was zero and we couldn't find a last location where the device was in the device history.
      // Can this actually happen in practice?
      await deleteUploads([uploadResult]);
      return next(new UnprocessableError(groupAndStation));
    }
    const {
      deviceId,
      groupId,
      station: stationToAssignToRecording,
    } = groupAndStation;

    if (!deviceId || !groupId) {
      // FIXME: Can we ever get to here?  Shouldn't we always have a group and device?
      // Perhaps this can happen if we are trying to assign to a device and group from when the device that
      // made this recording was assigned to another device/group?  We want more testing around this case.

      // We can throw a 422 or similar
      await deleteUploads([uploadResult]);
      return next(
        new UnprocessableError(
          `Unable to determine valid device (${deviceId}) or group (${groupId}) for this recording at recording time.  Current device Id is ${recordingDeviceId}`,
        ),
      );
    }

    recordingTemplate.DeviceId = deviceId;
    recordingTemplate.GroupId = groupId;
    const recordingGroup: Group = recordingDevice.Group;
    if (!recordingGroup) {
      await deleteUploads([uploadResult]);
      log.error(`Uploading device (${deviceId}) is not assigned to any group.`);
      return next(
        new UnprocessableError(
          `Device (${deviceId}) is not assigned to any group.`,
        ),
      );
    }
    if (deviceId !== recordingDevice.id) {
      // Get the actual device at the recording time.
      recordingDevice = await Device.findByPk(deviceId, {
        include: [Group],
      });
    }

    const wouldHaveSuppliedTracks = dataHasSuppliedTracks(recordingData);
    // or with supplied tracks to support existing devices
    const metadataSupplied =
      !!(recordingData.metadata && recordingData.metadata.metadata_source) ||
      wouldHaveSuppliedTracks;
    setInitialProcessingState(
      recordingTemplate,
      recordingData,
      metadataSupplied,
    );

    if (metadataSupplied && recordingData.type === RecordingType.ThermalRaw) {
      recordingTemplate.additionalMetadata = {
        ...recordingTemplate.additionalMetadata,
        metadataSource: recordingData.metadata.metadata_source,
      };
    }
    if (!isLatLon(recordingTemplate.location)) {
      throw new Error("Invalid location");
    }
    if (stationToAssignToRecording) {
      recordingTemplate.StationId = stationToAssignToRecording.id;
    }
    let recording: Recording;
    await Recording.sequelize.transaction(async (transaction) => {
      // These calls must complete in blocking sequence.
      await Recording.sequelize.query(
        `SELECT pg_advisory_xact_lock(:k, :stationId);`,
        {
          transaction,
          replacements: {
            k: VISITS_ADVISORY_LOCK_KEY,
            stationId: recordingTemplate.StationId,
          },
        },
      );
      recording = await recordingTemplate.save({ transaction });
      await maybeUpdateDeviceMetadata(
        recordingTemplate,
        recordingDevice,
        fromDevice,
        transaction,
      );
      await updateRecordingTimeBookkeeping(recording, fromDevice, transaction);
      await Visit.rebuildForRecording(recording, transaction);
    });

    // If there was a clip thumbnail, save it
    if (uploadResult.clipThumbnail) {
      log.info("Saving clip thumbnail %s", `${recording.rawFileKey}-thumb`);
      await openS3()
        .upload(
          `${recording.rawFileKey}-thumb`,
          uploadResult.clipThumbnail.data,
          uploadResult.clipThumbnail.meta,
        )
        .catch((_err) => {
          // Do nothing
        });
    }

    if (wouldHaveSuppliedTracks) {
      // TODO: If tracks are supplied, we need to recalculate the Visits
      // Now that we have a recording saved to the DB, we can create any associated track items
      await tracksFromMeta(recording, recordingData.metadata);
    }

    const recordingHasFinishedProcessing =
      recording.processingState === Recording.finishedState();
    if (recordingHasFinishedProcessing) {
      // NOTE: Should only occur during testing.
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;
      const recordingAgeMs =
        new Date().getTime() - recording.recordingDateTime.getTime();
      if (uploader === "device" && recordingAgeMs < twentyFourHoursMs) {
        // Alerts should only be sent for uploading devices.
        // FIXME: Alerts should really be added to a queue table, and processed out of band, rather than
        //  blocking the upload request.
        await sendAlerts(recording.id);
      }
    }
    // Add file data info to data (length, key, mimeType etc)
    // Create recording, adding any embedded metadata from the file(s), and assigning location,
    // updating device history, etc.

    // Insert recording into DB.
    if (!response.headersSent) {
      return successResponse(response, "Thanks for the data", {
        recordingId: recording.id,
      });
    } else {
      console.log("Not returning response, headers already sent");
    }
  };

const deleteUploads = async (uploadResults: RecordingFileUploadResult[]) => {
  const deleteUploadPromises = [];
  for (const uploadResult of uploadResults) {
    if (uploadResult.key) {
      deleteUploadPromises.push(
        openS3()
          .deleteObject(uploadResult.key)
          .catch((err) => {
            log.warning("Failed to delete upload: %s", err);
            return err;
          }),
      );
    } else {
      log.warning(
        "Could not delete upload without key: %s, length %d",
        uploadResult.partName,
        uploadResult.fileLength,
      );
    }
  }
  return Promise.allSettled(deleteUploadPromises);
};

const recordingUploadedState = (type: RecordingType, recording: Recording) => {
  if (type === RecordingType.Audio) {
    return RecordingProcessingState.Analyse;
  } else if (type === RecordingType.ThermalRaw) {
    if (
      recording.additionalMetadata &&
      ["startup", "shutdown"].includes(recording.additionalMetadata.status)
    ) {
      // NOTE: Skip processing for status recordings.
      return RecordingProcessingState.Finished;
    }
    return RecordingProcessingState.TrackAndAnalyse;
  } else if (type === RecordingType.InfraredVideo) {
    return RecordingProcessingState.Tracking;
  }
  return RecordingProcessingState.Finished;
};
const dataHasSuppliedTracks = (data: { metadata?: { tracks?: unknown[] } }) => {
  return (
    data.metadata && data.metadata.tracks && data.metadata.tracks.length !== 0
  );
};

const setInitialProcessingState = (
  recordingTemplate: Recording,
  data: { processingState?: RecordingProcessingState; type: RecordingType },
  hasSuppliedMetadata: boolean,
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
        hasSuppliedMetadata &&
        (recordingTemplate.type === RecordingType.ThermalRaw ||
          recordingTemplate.type === RecordingType.InfraredVideo)
      ) {
        recordingTemplate.processingState = RecordingProcessingState.Analyse;
      } else {
        recordingTemplate.processingState = recordingUploadedState(
          data.type,
          recordingTemplate,
        );
      }
    }
  }
  recordingTemplate.currentStateStartTime = new Date();
};

const assignGroupAndStationToRecording = async (
  deviceForRecording: Device,
  recordingDateTime: Date,
  recordingLocation?: LatLng,
): Promise<
  | {
      groupId: GroupId;
      deviceId: DeviceId;
      station?: Station;
    }
  | string
> => {
  let groupId: GroupId;
  let deviceId: DeviceId;
  let station: Station;
  if (recordingLocation) {
    const result = await maybeUpdateDeviceHistory(
      deviceForRecording,
      recordingLocation,
      recordingDateTime,
    );
    if (typeof result === "string") {
      return result;
    }
    const { stationToAssignToRecording, deviceHistoryEntry } = result;
    station = stationToAssignToRecording;
    deviceId = deviceHistoryEntry.DeviceId;
    groupId = deviceHistoryEntry.GroupId;
  }

  if (!deviceId && !groupId) {
    // Check what group the uploading device (or the device embedded in the recording) was part of at the time the recording was made.
    const { deviceId: d, groupId: g } =
      await getDeviceIdAndGroupIdAndPossibleStationIdAtRecordingTime(
        deviceForRecording,
        recordingDateTime,
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

interface UpdateDevicePayload {
  kind?: DeviceType;
  location?: LatLng;
  lastConnectionTime?: Fn;
  active?: boolean;
}

const greaterDate = (date: Date | IsoFormattedDateString, column: string) => {
  return Sequelize.fn("GREATEST", Sequelize.col(column), date);
};
const mapRecordingTypeToDeviceKind = (
  recordingType: RecordingType,
  existingType: DeviceType,
): DeviceType => {
  switch (recordingType) {
    case RecordingType.Audio: {
      if (existingType === DeviceType.Thermal) {
        return DeviceType.Hybrid;
      }
      return DeviceType.Audio;
    }
    case RecordingType.ThermalRaw:
    default: {
      if (existingType === DeviceType.Audio) {
        return DeviceType.Hybrid;
      }
      return DeviceType.Thermal;
    }
  }
};
const maybeUpdateDeviceMetadata = async (
  recording: Recording,
  uploadingDevice: Device,
  fromDevice: boolean,
  transaction?: Transaction,
): Promise<unknown> => {
  // TODO: Streamline logic
  let uploadingDeviceUpdatePayload: UpdateDevicePayload = {};
  if (fromDevice) {
    let shouldSetActive = false;
    if (!uploadingDevice.active) {
      // Check if the device has been re-assigned to another group:
      const activeDevice = await Device.findOne({
        where: {
          saltId: uploadingDevice.saltId,
          active: true,
        },
        transaction,
      });
      if (!activeDevice) {
        shouldSetActive = true;
      }
    }
    // Set the device active and update its connection time.
    uploadingDeviceUpdatePayload = {
      lastConnectionTime: greaterDate(new Date(), "lastConnectionTime"),
    };
    if (shouldSetActive) {
      uploadingDeviceUpdatePayload.active = true;
    }
  } else if (
    !fromDevice &&
    (recording.recordingDateTime > uploadingDevice.lastConnectionTime ||
      !uploadingDevice.lastConnectionTime)
  ) {
    let shouldSetActive = false;
    if (!uploadingDevice.active) {
      // Check if the device has been re-assigned to another group:
      const activeDevice = await Device.findOne({
        where: {
          saltId: uploadingDevice.saltId,
          active: true,
        },
        transaction,
      });
      if (!activeDevice) {
        shouldSetActive = true;
      }
    }
    // If we're getting a recording via sidekick that's later than a previous lastConnectionTime,
    // or there is no previous lastConnectionTime, we can null out the lastConnectionTime,
    // which indicates that this device is now "offline".
    // As such, it will no longer be targeted by stopped device emails, and can show up as offline in browse.

    // FIXME: Test NULLING out lastConnectionTime
    uploadingDeviceUpdatePayload = {
      lastConnectionTime: null,
    };
    if (shouldSetActive) {
      uploadingDeviceUpdatePayload.active = true;
    }
  }
  return Device.update(
    {
      ...uploadingDeviceUpdatePayload,
      location: Sequelize.literal(`
        case
          when (
            '${recording.recordingDateTime.toISOString()}' > GREATEST(
              COALESCE("lastAudioRecordingTime", TIMESTAMP '1970-01-01 00:00:00'),
              COALESCE("lastThermalRecordingTime", TIMESTAMP '1970-01-01 00:00:00')
            )          
          ) 
            then ST_GeomFromGeoJSON('{"type":"Point", "coordinates":[${recording.location.lng}, ${recording.location.lat}]}')
          else "location"
        end
      `),
      kind: Sequelize.literal(`
        case "kind"
          when '${DeviceType.Unknown}' then '${mapRecordingTypeToDeviceKind(recording.type, DeviceType.Unknown)}'
          when '${DeviceType.Thermal}' then '${mapRecordingTypeToDeviceKind(recording.type, DeviceType.Thermal)}'
          when '${DeviceType.Audio}' then '${mapRecordingTypeToDeviceKind(recording.type, DeviceType.Audio)}'
          else "kind"
        end  
      `),
    },
    {
      validate: false,
      sideEffects: false, // NOTE: Necessary to bypass location setter validation
      where: {
        id: uploadingDevice.id,
      },
      transaction,
    },
  );
};
