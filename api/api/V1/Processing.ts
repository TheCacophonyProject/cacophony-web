import { successResponse } from "../V1/responseUtil.js";
import middleware, { validateFields } from "../middleware.js";
import log from "@log";
import { body, param, query, oneOf } from "express-validator";
import modelsInit from "@models/index.js";
import _ from "lodash";
import {
  saveThumbnailInfo,
  sendAlerts,
  signedToken,
  updateMetadata,
} from "../V1/recordingUtil.js";
import type { Application, NextFunction, Request, Response } from "express";
import { trackIsMasked } from "@api/V1/trackMasking.js";
import ApiMinimalTrackRequestSchema from "@schemas/api/fileProcessing/MinimalTrackRequestData.schema.json" assert { type: "json" };
import { jsonSchemaOf } from "../schema-validation.js";
import { booleanOf, idOf } from "../validation-middleware.js";
import { AuthorizationError, ClientError } from "../customErrors.js";
import util from "../V1/util.js";
import {
  HttpStatusCode,
  RecordingProcessingState,
  RecordingType,
} from "@typedefs/api/consts.js";
import {
  extractJwtAuthorisedSuperAdminUser,
  fetchUnauthorizedRequiredTrackById,
  parseJSONField,
  fetchAuthorizedRequiredDeviceById,
  extractValFromRequest,
  fetchUnauthorizedRequiredFlatRecordingById,
} from "@api/extract-middleware.js";
import track, {
  getTrackData,
  saveTrackData,
  type Track,
} from "@/models/Track.js";
import type { DeviceHistory } from "@models/DeviceHistory.js";
import Sequelize, { Op } from "sequelize";
import type { TrackId } from "@typedefs/api/common.js";
import { openS3 } from "@models/util/util.js";
const NULL_TRACK_ID = 1;
const models = await modelsInit();
export default function (app: Application, baseUrl: string) {
  const apiUrl = `${baseUrl}/processing`;

  /**
     * @api {get} /api/v1/processing Get a new file processing job
     * @apiName getNewFileProcessingJob
     * @apiGroup Processing
     *
     * Requires super-admin user credentials
     *
     * @apiParam {String} type Type of recording.
     * @apiParam {String} state Processing state.
     * @apiSuccess {Recording} recording
     * @apiSuccess {String} rawJWT signed url to download the raw file

     */
  app.get(
    apiUrl,
    extractJwtAuthorisedSuperAdminUser,
    [
      oneOf([
        [
          query("type").equals(RecordingType.Audio),
          query("state").isIn([
            RecordingProcessingState.Reprocess,
            RecordingProcessingState.Analyse,
            RecordingProcessingState.Finished,
          ]),
        ],
        [
          query("type").isIn([
            RecordingType.InfraredVideo,
            RecordingType.ThermalRaw,
            RecordingType.TrailCamImage,
          ]),
          query("state").isIn([
            RecordingProcessingState.Reprocess,
            RecordingProcessingState.AnalyseThermal,
            RecordingProcessingState.Tracking,
            RecordingProcessingState.ReTrack,
          ]),
        ],
      ]),
    ],
    middleware.requestWrapper(async (request: Request, response: Response) => {
      const type = request.query.type as RecordingType;
      const state = request.query.state as RecordingProcessingState;
      const recording = await models.Recording.getOneForProcessing(type, state);
      if (recording === null) {
        log.debug(
          "No file to be processed for '%s' in state '%s.",
          type,
          state
        );
        // FIXME - Do we really want this status code/response?
        return response.status(HttpStatusCode.OkNoContent).json();
      } else {
        const rawJWT = signedToken(
          recording.rawFileKey,
          recording.getRawFileName(),
          recording.rawMimeType
        );
        const rec = (recording as any).dataValues;
        if (rec.location) {
          // Some versions of postgres seem to put this in.
          delete rec.location.crs;
        }
        return successResponse(response, {
          recording: rec,
          rawJWT,
        });
      }
    })
  );

  /**
   * @api {post} /api/v1/processing/processed Upload a processed file to object storage
   * @apiName PostProcessedFile
   * @apiGroup Processing
   *
   * Requires super-admin user credentials
   * @apiUse V1ResponseSuccess
   * @apiSuccess {String} fileKey of uploaded file
   *
   * @apiUse V1ResponseError
   */
  app.post(
    `${apiUrl}/processed`,
    extractJwtAuthorisedSuperAdminUser,
    util.multipartUpload(
      "file",
      async (_uploader, _uploadingDevice, _uploadingUser, _data, keys) => {
        // Expect only one file to be uploaded at a time
        console.assert(
          keys.length === 1,
          "Only expected 1 file attachment for this end-point"
        );
        return keys[0];
      }
    )
  );

  /**
   * @api {put} /api/v1/processing Finished a file processing job
   * @apiName finishedFileProcessingJob
   * @apiGroup Processing
   *
   * Requires super-admin user credentials
   *
   * @apiParam {Integer} id ID of the recording.
   * @apiParam {String} jobKey Key given when requesting the job.
   * @apiParam {Boolean} success If the job was finished successfully.
   * @apiParam {JSON} [result] Result of the file processing
   * @apiParam {String} [newProcessedFileKey] LeoFS Key of the new file.
   */
  app.put(
    apiUrl,
    extractJwtAuthorisedSuperAdminUser,
    validateFields([
      idOf(body("id")),
      body("jobKey").exists(),
      booleanOf(body("success")),
      body("newProcessedFileKey").isString().optional(),
      booleanOf(body("complete")),
      body("fileHash").isString().optional(),
      // FIXME - JSON schema validate this?
      body("result").isJSON().optional(),
    ]),
    parseJSONField(body("result")),
    async (request: Request, response: Response, next: NextFunction) => {
      const recording = await models.Recording.findByPk(request.body.id);
      if (!recording) {
        return next(
          new ClientError(
            `Recording ${request.body.id} not found for jobKey ${request.body.jobKey}`
          )
        );
      } else {
        if (recording.jobKey !== request.body.jobKey) {
          return next(
            new ClientError("'jobKey' given did not match the database.")
          );
        }
        response.locals.recording = recording;
        next();
      }
    },
    async (request: Request, response: Response) => {
      const { newProcessedFileKey, success } = request.body;
      const result = response.locals.result;
      const recording = response.locals.recording;
      recording.jobKey = null;
      recording.processing = false;

      const prevState = recording.processingState;
      if (success) {
        try {
          if (newProcessedFileKey) {
            recording.fileKey = newProcessedFileKey;
          }
          const nextJob = recording.getNextState();
          const complete =
            nextJob == models.Recording.finishedState(recording.type);
          recording.processingState = nextJob;
          recording.processingEndTime = new Date().toISOString();
          recording.processingFailedCount = 0;

          // Process extra data from file processing
          if (result && result.fieldUpdates) {
            // TODO(jon): if the previous step was tracking, here would be the best time to consolidate tracks - however,
            //  we need to make sure that the AI is reading these tracks back out to do its classifications:
            //  #1283385 is a great example of why we need this.

            // NOTE: We used to re-match stations here if location changed, but really there's no good reason
            //  why file processing should update the location.
            delete result.fieldUpdates.location;
            _.merge(recording, result.fieldUpdates);
            for (const [key, value] of Object.entries(recording.dataValues)) {
              if (typeof value === "object" && key in result.fieldUpdates) {
                // We need to let sequelize know that deep json values have changed, since it doesn't
                // check for deep equality.
                recording.changed(key, true);
              }
            }
          }
          let tracks: Track[] | null = null;
          if (complete) {
            tracks = await recording.getTracks();
            for (const track of tracks) {
              await track.updateIsFiltered();
            }
          }
          if (complete && recording.type === RecordingType.Audio) {
            const group = await recording.getGroup();
            const shouldFilter = group.settings?.filterHuman ?? true;
            if (shouldFilter) {
              let hasHuman = false;
              for (const t of tracks) {
                const tags = await t.getTrackTags({});
                hasHuman = tags.some((tt) => tt.what === "human");
                if (hasHuman) {
                  break;
                }
              }
              if (hasHuman) {
                const rawFileKey = recording.rawFileKey;
                const fileKey = recording.fileKey;
                recording.redacted = true;
                try {
                  if (rawFileKey) {
                    await util.deleteS3Object(rawFileKey).catch((err) => {
                      log.warning(err);
                    });
                  }
                  if (fileKey) {
                    await util.deleteS3Object(fileKey).catch((err) => {
                      log.warning(err);
                    });
                  }
                } catch (e) {
                  log.warning("Failed to delete file: %s", e);
                }
              }
            }
          }
          await recording.save();

          if (
            complete &&
            (recording.type === RecordingType.ThermalRaw ||
              recording.type === RecordingType.InfraredVideo)
          ) {
            const results = await saveThumbnailInfo(
              recording,
              tracks,
              recording.additionalMetadata["thumbnail_region"]
            );
            if (results) {
              for (const result of results) {
                if (result instanceof Error) {
                  log.warning(
                    "Failed to upload thumbnail for %s",
                    `${recording.rawFileKey}-thumb`
                  );
                  log.error("Reason: %s", result.message);
                }
              }
            }
          }

          // If group filters out human audio, delete the file

          const twentyFourHoursMs = 24 * 60 * 60 * 1000;
          const recordingAgeMs =
            new Date().getTime() - recording.recordingDateTime.getTime();
          if (
            complete &&
            prevState !== RecordingProcessingState.Reprocess &&
            recording.uploader === "device" &&
            recordingAgeMs < twentyFourHoursMs
          ) {
            await sendAlerts(models, recording.id);
          }
        } catch (e) {
          log.error("Failed to save recording: %s", e);
        }
        return successResponse(response, "Processing finished.");
      } else {
        recording.processingState =
          `${recording.processingState}.failed` as RecordingProcessingState;
        recording.processingFailedCount += 1;
        await recording.save();

        // FIXME, should this be an error response?
        return successResponse(response, "Processing failed.");
      }
    }
  );

  /**
   * @api {post} /api/v1/processing/metadata Updates the metadata for the recording
   * @apiName updateMetaData
   * @apiGroup Processing
   *
   * @apiDescription This call updates the metadata for a recording
   * Requires super-admin user credentials
   *
   * @apiParam {Number} recordingId ID of the recording that you want to tag.
   * @apiparam {JSON} metadata Metadata to be updated for the recording.  See /api/V1/recording for more details
   *
   * @apiUse V1ResponseSuccess
   *
   * @apiuse V1ResponseError
   *
   */
  app.post(
    `${apiUrl}/metadata`,
    extractJwtAuthorisedSuperAdminUser,
    validateFields([idOf(body("id")), body("metadata").isJSON()]),
    fetchUnauthorizedRequiredFlatRecordingById(body("id")),
    parseJSONField(body("metadata")),
    async (_request: Request, response: Response) => {
      await updateMetadata(response.locals.recording, response.locals.metadata);
    }
  );

  /**
   * @api {post} /api/v1/processing/:id/tracks Add track to recording
   * @apiName PostTrack
   * @apiGroup Processing
   *
   * Requires super-admin user credentials
   *
   * @apiParam {JSON} data Data which defines the track (type specific).
   * @apiParam {Number} AlgorithmId Database ID of the Tracking algorithm details retrieved from
   * (#FileProcessing:Algorithm) request
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {int} trackId Unique id of the newly created track.
   *
   * @apiUse V1ResponseError
   *
   */
  app.post(
    `${apiUrl}/:id/tracks`,
    extractJwtAuthorisedSuperAdminUser,
    validateFields([
      idOf(param("id")),
      body("data").custom(jsonSchemaOf(ApiMinimalTrackRequestSchema)),
      idOf(body("algorithmId")),
    ]),
    parseJSONField(body("data")),
    async (request: Request, response: Response, next: NextFunction) => {
      const recording = await models.Recording.findByPk(request.params.id);
      if (!recording) {
        return next(
          new AuthorizationError(
            `Could not find a Recording with an id of '${request.params.id}'`
          )
        );
      }
      const deviceId = recording.DeviceId;
      const groupId = recording.GroupId;
      const atTime = recording.recordingDateTime;
      let discardMaskedTrack = false;
      let trackId: TrackId = 1;
      const data = response.locals.data;
      if (recording.type === RecordingType.ThermalRaw) {
        const positions = data && data.positions;
        if (positions) {
          discardMaskedTrack = await trackIsMasked(
            models,
            deviceId,
            groupId,
            atTime,
            positions
          );
        }
      }
      if (!discardMaskedTrack) {
        const newTrack = {
          data,
          AlgorithmId: request.body.algorithmId,
          startSeconds: data.start_s || 0,
          endSeconds: data.end_s || 0,
          minFreqHz: null,
          maxFreqHz: null,
        };
        if (recording.type === RecordingType.Audio) {
          newTrack.minFreqHz = data.minFreq || 0;
          newTrack.maxFreqHz = data.maxFreq || 0;
        }
        const track = await recording.addTrack(newTrack);
        await saveTrackData(track.id, data);
        // TODO:M: Save track data to object storage

        trackId = track.id;
      }
      // If it gets filtered out, we can just give it a trackId of 1, and then just not do anything when you try to add
      // trackTags to tag id 1.
      return successResponse(response, "Track added.", {
        trackId,
      });
    }
  );

  /**
   * @api {delete} /api/v1/processing/:id/tracks Delete all tracks for a recording
   * @apiName DeleteTracks
   * @apiGroup Processing
   *
   * @apiUse V1ResponseSuccess
   *
   * @apiuse V1ResponseError
   *
   */
  app.delete(
    `${apiUrl}/:id/tracks`,
    extractJwtAuthorisedSuperAdminUser,
    validateFields([idOf(param("id"))]),
    fetchUnauthorizedRequiredFlatRecordingById(param("id")),
    async (_request: Request, response: Response) => {
      const tracks = (await response.locals.recording.getTracks()) as Track[];
      const promises = [];
      for (const track of tracks) {
        promises.push(openS3().deleteObject(`Track/${track.id}`));
        promises.push(track.destroy());
      }
      await Promise.all(promises);
      return successResponse(response, "Tracks cleared.");
    }
  );

  /**
   * @api {post} /api/v1/processing/:id/tracks/:trackId/tags Add tag to track
   * @apiName PostTrackTag
   * @apiGroup Processing
   *
   * Requires super-admin user credentials
   *
   * @apiParam {String} what Object/event to tag.
   * @apiParam {Number} confidence Tag confidence score.
   * @apiParam {JSON} data Data Additional tag data.
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {int} trackTagId Unique id of the newly created track tag.
   *
   * @apiUse V1ResponseError
   */
  app.post(
    `${apiUrl}/:id/tracks/:trackId/tags`,
    extractJwtAuthorisedSuperAdminUser,
    validateFields([
      idOf(param("id")),
      idOf(param("trackId")),
      body("what").exists().isString(), // FIXME - Validate against valid tags?
      body("confidence").isFloat().toFloat(),
      body("data").isJSON().optional(),
    ]),
    (request, response, next) => {
      const trackId = param("trackId");
      const id = Number(extractValFromRequest(request, trackId));
      if (id !== NULL_TRACK_ID) {
        fetchUnauthorizedRequiredTrackById(trackId)(request, response, next);
      } else {
        response.locals.skip = true;
        next();
      }
    },
    parseJSONField(body("data")),
    async (request: Request, response: Response) => {
      if (!response.locals.skip) {
        const tag = await response.locals.track.addTag(
          request.body.what,
          request.body.confidence,
          true,
          response.locals.data,
          null,
          false
        );
        return successResponse(response, "Track tag added.", {
          trackTagId: tag.id,
        });
      }
      // Returns without creating track if this is a masked out track.
      return successResponse(response, "Track tag added.", {
        trackTagId: 1,
      });
    }
  );

  /**
   * @api {post} /api/v1/processing/algorithm Finds matching existing algorithm definition or adds a new one to the database
   * @apiName Algorithm
   * @apiGroup Processing
   *
   * @apiParam {JSON} algorithm algorithm data in tag form.
   * Requires super-admin user credentials
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {int} algorithmId ID of the matching algorithm tag.
   *
   * @apiUse V1ResponseError
   */
  app.post(
    `${apiUrl}/algorithm`,
    extractJwtAuthorisedSuperAdminUser,
    validateFields([body("algorithm").isJSON()]),
    parseJSONField(body("algorithm")),
    async (_request, response) => {
      const algorithm = await models.DetailSnapshot.getOrCreateMatching(
        "algorithm",
        response.locals.algorithm
      );
      return successResponse(response, "Algorithm key retrieved.", {
        algorithmId: algorithm.id,
      });
    }
  );

  /**
   * @api {patch} /api/fileProcessing/:id/tracks/:trackId/archive Archives a track
   * @apiName ArchiveTrack
   * @apiGroup Processing
   *
   * @apiUse V1ResponseSuccess
   * @apiuse V1ResponseError
   *
   */
  app.post(
    `${apiUrl}/:id/tracks/:trackId/archive`,
    extractJwtAuthorisedSuperAdminUser,
    validateFields([idOf(param("id")), idOf(param("trackId"))]),
    fetchUnauthorizedRequiredTrackById(param("trackId")),
    async (_request: Request, response) => {
      await response.locals.track.update({ archivedAt: Date.now() });
      return successResponse(response, "Track archived");
    }
  );

  /**
   * @api {post} /api/fileProcessing/:id/tracks/:trackId Update track data for recording and archives the old track data.
   * @apiName UpdateTrackData
   * @apiGroup Processing
   *
   * @apiParam {JSON} data Data which defines the track (type specific).
   *
   * @apiUse V1ResponseSuccess
   * @apiuse V1ResponseError
   *
   */
  app.post(
    `${apiUrl}/:id/tracks/:trackId`,
    extractJwtAuthorisedSuperAdminUser,
    validateFields([
      idOf(param("id")),
      idOf(param("trackId")),
      body("data").custom(jsonSchemaOf(ApiMinimalTrackRequestSchema)),
    ]),
    fetchUnauthorizedRequiredFlatRecordingById(param("id")),
    fetchUnauthorizedRequiredTrackById(param("trackId")),
    parseJSONField(body("data")),
    async (_request: Request, response) => {
      // make a copy of the original track
      // TODO:M: Wrangle object storage data
      let d;
      const { data, filtered, AlgorithmId } = response.locals.track;
      const oldData = await getTrackData(response.locals.track.id);
      if (Object.keys(oldData).length === 0) {
        d = data;
      } else {
        d = oldData;
      }
      const archivedDataCopy = {
        data: d,
        AlgorithmId,
        filtered,
        startSeconds: d.start_s || 0,
        endSeconds: d.end_s || 0,
        minFreqHz: null,
        maxFreqHz: null,
        archivedAt: new Date(),
      };
      if (response.locals.recording.type === RecordingType.Audio) {
        archivedDataCopy.minFreqHz = d.minFreq || 0;
        archivedDataCopy.maxFreqHz = d.maxFreq || 0;
      }
      await response.locals.recording.addTrack(archivedDataCopy);
      const newData = response.locals.data;
      const update = {
        data: newData,
        startSeconds: newData.start_s || 0,
        endSeconds: newData.end_s || 0,
        minFreqHz: null,
        maxFreqHz: null,
      };
      if (response.locals.recording.type === RecordingType.Audio) {
        update.minFreqHz = newData.minFreq || 0;
        update.maxFreqHz = newData.maxFreq || 0;
      }
      await response.locals.track.update(update);
      await saveTrackData(response.locals.track.id, response.locals.data);

      return successResponse(response, "Track updated");
    }
  );

  /**
   * @api {get} /api/fileProcessing/ratThresh/:deviceId Get rat threshold values for a device
   * @apiName RatThreshold
   * @apiGroup Processing
   * @apiParam {Integer} deviceId ID of the device
   * @apiQuery {String} [at-time] ISO8601 formatted date string for when the rat threshold should be current.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess DeviceHistory
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/ratThresh/:id`,
    extractJwtAuthorisedSuperAdminUser,
    validateFields([
      idOf(param("id")),
      query("at-time").isISO8601().toDate().optional(),
      booleanOf(query("only-active"), false),
    ]),
    fetchAuthorizedRequiredDeviceById(param("id")),
    async (request: Request, response: Response, _next: NextFunction) => {
      const atTime =
        (request.query["at-time"] &&
          (request.query["at-time"] as unknown as Date)) ||
        new Date();
      const device = response.locals.device;
      const deviceHistoryEntry: DeviceHistory =
        await models.DeviceHistory.findOne({
          where: {
            DeviceId: device.id,
            GroupId: device.GroupId,
            fromDateTime: { [Op.lte]: atTime },
          },
          order: [["fromDateTime", "DESC"]],
          attributes: [
            "DeviceId",
            "fromDateTime",
            "location",
            [
              Sequelize.fn(
                "json_build_object",
                "ratThresh",
                Sequelize.literal(`"DeviceHistory"."settings"#>'{ratThresh}'`)
              ),
              "settings",
            ],
          ],
        });
      return successResponse(response, "Got device history", {
        deviceHistoryEntry,
      });
    }
  );
}
