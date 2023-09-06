import { successResponse } from "../V1/responseUtil.js";
import middleware, {
  getRecordingById,
  expectedTypeOf,
  validateFields,
} from "../middleware.js";
import log from "@log";
import { body, param, query, oneOf } from "express-validator";
import modelsInit from "@models/index.js";
import _ from "lodash";
import {
  addTag,
  finishedProcessingRecording,
  saveThumbnailInfo,
  sendAlerts,
  signedToken,
  updateMetadata,
} from "../V1/recordingUtil.js";
import type { Application, NextFunction, Request, Response } from "express";
import type { Recording } from "@models/Recording.js";

import type { ClassifierRawResult } from "@typedefs/api/fileProcessing.js";
import ClassifierRawResultSchema from "@schemas/api/fileProcessing/ClassifierRawResult.schema.json" assert { type: "json" };
import ApiMinimalTrackRequestSchema from "@schemas/api/fileProcessing/MinimalTrackRequestData.schema.json" assert { type: "json" };
import { jsonSchemaOf } from "../schema-validation.js";
import { booleanOf, idOf } from "../validation-middleware.js";
import { ClientError } from "../customErrors.js";
import util from "../V1/util.js";
import {
  HttpStatusCode,
  RecordingProcessingState,
  RecordingType,
} from "@typedefs/api/consts.js";
import {
  extractJwtAuthorisedSuperAdminUser,
  fetchUnauthorizedRequiredEventDetailSnapshotById,
  fetchUnauthorizedRequiredRecordingById,
  fetchUnauthorizedRequiredTrackById,
  parseJSONField,
} from "@api/extract-middleware.js";
import type { Track } from "@/models/Track.js";

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
     * @apiSuccess {recording} requested
     * @apiSuccess {String} signed url to download the raw file

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
          ]),
        ],
        [
          query("type").isIn([
            RecordingType.InfraredVideo,
            RecordingType.ThermalRaw,
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
      async (uploader, uploadingDevice, uploadingUser, data, keys) => {
        // Expect only one file to be uploaded at a time
        console.assert(
          keys.length === 1,
          "Only expected 1 file attachment for this end-point"
        );
        return keys[0];
      }
    )
  );

  // Add tracks

  // Add track tags
  // TODO - Processing should send this request gzipped.
  app.put(
    `${apiUrl}/raw`,
    extractJwtAuthorisedSuperAdminUser,
    [
      body("id")
        .isInt()
        .toInt()
        .withMessage(expectedTypeOf("integer"))
        .bail()
        .custom(getRecordingById())
        .bail()
        .custom(() =>
          // Job key given matches the one on the retrieved recording
          body("jobKey")
            .exists()
            .withMessage(expectedTypeOf("string"))
            .custom(
              (jobKey, { req }) =>
                (req.body.recording as Recording).get("jobKey") === jobKey
            )
            .withMessage(
              (jobKey, { req }) =>
                `'jobKey' '${jobKey}' given did not match the database (${(
                  req.body.recording as Recording
                ).get("jobKey")})`
            )
        ),
      body("success")
        .isBoolean()
        .toBoolean()
        .withMessage(expectedTypeOf("boolean")),
      body("result")
        .exists()
        .withMessage(expectedTypeOf("ClassifierRawResult"))
        .bail()
        .custom(jsonSchemaOf(ClassifierRawResultSchema)),
      body("newProcessedFileKey").optional(),
    ],
    middleware.requestWrapper(async (request: Request, response: Response) => {
      const {
        id,
        result,
        complete,
        newProcessedFileKey,
        success,
        recording,
      }: {
        id: number;
        newProcessedFileKey?: string;
        result: ClassifierRawResult;
        recording: Recording;
        complete: boolean;
        success: boolean;
      } = request.body;
      // Input the bits we care about to the DB, and store the rest as gzipped metadata for the object?

      const prevState = recording.processingState;
      if (success) {
        recording.set("currentStateStartTime", null);
        if (newProcessedFileKey) {
          recording.fileKey = newProcessedFileKey;
        }
        if (complete) {
          recording.jobKey = null;
          recording.processing = false;
          recording.processingEndTime = new Date().toISOString();
        }
        recording.processingState = recording.getNextState();
        // Process extra data from file processing

        // FIXME Is fieldUpdates ever set by current processing?
        // if (result && result.fieldUpdates) {
        // _.merge(recording, result.fieldUpdates);
        // }
        await recording.save();
        if (
          recording.type === RecordingType.ThermalRaw &&
          recording.processingState === RecordingProcessingState.Finished
        ) {
          await finishedProcessingRecording(
            models,
            recording,
            result,
            prevState
          );
        }
        return successResponse(response, `Processing finished for #${id}`);
      } else {
        // The current stage failed
        recording.processingState =
          `${recording.processingState}.failed` as RecordingProcessingState;
        recording.jobKey = null;
        recording.processing = false;
        recording.processingEndTime = new Date().toISOString(); // Still set processingEndTime, since we might want to know how long it took to fail.
        await recording.save();
        // FIXME - should this be an error response?
        return successResponse(response, `Processing failed for #${id}`);
      }
    })
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
        if (newProcessedFileKey) {
          recording.fileKey = newProcessedFileKey;
        }
        const nextJob = recording.getNextState();
        const complete =
          nextJob == models.Recording.finishedState(recording.type);
        recording.processingState = nextJob;
        recording.processingEndTime = new Date().toISOString();
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
        if (complete && recording.type === RecordingType.Audio) {
          const device = await recording.getDevice();
          const group = await device.getGroup();
          const shouldFilter = group.settings?.filterHuman ?? true;
          if (shouldFilter) {
            const tracks: Track[] = await recording.getTracks();
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
          const tracks = await recording.getTracks();
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

        return successResponse(response, "Processing finished.");
      } else {
        recording.processingState =
          `${recording.processingState}.failed` as RecordingProcessingState;
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
    fetchUnauthorizedRequiredRecordingById(body("id")),
    parseJSONField(body("metadata")),
    async (request: Request, response: Response) => {
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
   * @apiParam {Number} AlgorithmId Database Id of the Tracking algorithm details retrieved from
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

      // FIXME - We don't currently have ML generated tracks for audio recordings, but when we do we need to widen this check.
      body("data").custom(jsonSchemaOf(ApiMinimalTrackRequestSchema)),
      idOf(body("algorithmId")),
    ]),
    fetchUnauthorizedRequiredRecordingById(param("id")),
    fetchUnauthorizedRequiredEventDetailSnapshotById(body("algorithmId")),
    parseJSONField(body("data")),
    async (request: Request, response) => {
      const track = await response.locals.recording.createTrack({
        data: response.locals.data,
        AlgorithmId: request.body.algorithmId,
      });
      await track.updateIsFiltered();
      return successResponse(response, "Track added.", {
        trackId: track.id,
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
    fetchUnauthorizedRequiredRecordingById(param("id")),
    async (request: Request, response: Response) => {
      const tracks = await response.locals.recording.getTracks();
      tracks.forEach((track) => track.destroy());
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
    fetchUnauthorizedRequiredRecordingById(param("id")),
    fetchUnauthorizedRequiredTrackById(param("trackId")),
    parseJSONField(body("data")),
    async (request: Request, response: Response) => {
      const tag = await response.locals.track.addTag(
        request.body.what,
        request.body.confidence,
        true,
        response.locals.data
      );
      return successResponse(response, "Track tag added.", {
        trackTagId: tag.id,
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
   * @apiSuccess {int} algorithmId Id of the matching algorithm tag.
   *
   * @apiUse V1ResponseError
   */
  app.post(
    `${apiUrl}/algorithm`,
    extractJwtAuthorisedSuperAdminUser,
    validateFields([body("algorithm").isJSON()]),
    parseJSONField(body("algorithm")),
    async (request, response) => {
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
    fetchUnauthorizedRequiredRecordingById(param("id")),
    fetchUnauthorizedRequiredTrackById(param("trackId")),
    async (request: Request, response) => {
      await response.locals.track.update({ archivedAt: Date.now() });

      return successResponse(response, "Track archived");
    }
  );

  /**
   * @api {patch} /api/fileProcessing/:id/tracks/:trackId Update track data for recording and archives the old track data.
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
    fetchUnauthorizedRequiredRecordingById(param("id")),
    fetchUnauthorizedRequiredTrackById(param("trackId")),
    parseJSONField(body("data")),
    async (request: Request, response) => {
      // make a copy of the original track
      await response.locals.recording.createTrack({
        data: response.locals.track.data,
        AlgorithmId: response.locals.track.AlgorithmId,
        archivedAt: Date.now(),
      });
      await response.locals.track.update({ data: response.locals.data });
      return successResponse(response, "Track updated");
    }
  );
}
