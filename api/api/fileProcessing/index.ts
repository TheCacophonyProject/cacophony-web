import responseUtil from "../V1/responseUtil";
import middleware, {
  getRecordingById,
  expectedTypeOf,
  validateFields,
} from "../middleware";
import log from "@log";
import { body, param, query, oneOf } from "express-validator";
import models from "@models";
import recordingUtil, {
  finishedProcessingRecording,
} from "../V1/recordingUtil";
import { Application, NextFunction, Request, Response } from "express";
import { Recording } from "@models/Recording";

import { ClassifierRawResult } from "@typedefs/api/fileProcessing";
import ClassifierRawResultSchema from "@schemas/api/fileProcessing/ClassifierRawResult.schema.json";
import ApiMinimalTrackRequestSchema from "@schemas/api/fileProcessing/MinimalTrackRequestData.schema.json";
import { jsonSchemaOf } from "../schema-validation";
import { booleanOf, idOf } from "../validation-middleware";
import { ClientError } from "../customErrors";
import util from "../V1/util";
import { RecordingProcessingState, RecordingType } from "@typedefs/api/consts";
import {
  fetchUnauthorizedRequiredEventDetailSnapshotById,
  fetchUnauthorizedRequiredRecordingById,
  fetchUnauthorizedRequiredTrackById,
  parseJSONField,
} from "@api/extract-middleware";
import logger from "@log";

export default function (app: Application) {
  const apiUrl = "/api/fileProcessing";

  /**
   * @api {get} /api/fileProcessing Get a new file processing job
   * @apiName getNewFileProcessingJob
   * @apiGroup FileProcessing
   *
   * @apiParam {String} type Type of recording.
   * @apiParam {String} state Processing state.
   * @apiSuccess {recording} requested
   * @apiSuccess {String} signed url to download the raw file

   */
  app.get(
    apiUrl,
    [
      oneOf([
        [
          query("type").equals(RecordingType.Audio),
          query("state").isIn([
            RecordingProcessingState.Reprocess,
            RecordingProcessingState.ToMp3,
            RecordingProcessingState.Analyse,
          ]),
        ],
        [
          query("type").equals(RecordingType.ThermalRaw),
          query("state").isIn([
            RecordingProcessingState.Reprocess,
            RecordingProcessingState.AnalyseThermal,
            RecordingProcessingState.Tracking,
          ]),
        ],
      ]),
    ],
    middleware.requestWrapper(async (request: Request, response: Response) => {
      const type = request.query.type as RecordingType;
      const state = request.query.state as RecordingProcessingState;
      const recording = await models.Recording.getOneForProcessing(type, state);
      if (recording == null) {
        log.debug(
          "No file to be processed for '%s' in state '%s.",
          type,
          state
        );
        return response.status(204).json();
      } else {
        const rawJWT = recordingUtil.signedToken(
          recording.rawFileKey,
          recording.getRawFileName(),
          recording.rawMimeType
        );
        return response.status(200).json({
          recording: (recording as any).dataValues,
          rawJWT,
        });
      }
    })
  );

  /**
   * @api {post} /api/fileProcessing/processed Upload a processed file to object storage
   * @apiName PostProcessedFile
   * @apiGroup FileProcessing

   * @apiUse V1ResponseSuccess
   * @apiSuccess {String} fileKey of uploaded file
   *
   * @apiUse V1ResponseError
   */
  app.post(`${apiUrl}/processed`, () => {
    util.multipartUpload("file", async (uploader, data, key) => {
      return key;
    });
  });

  // Add tracks

  // Add track tags
  // TODO - Processing should send this request gzipped.
  app.put(
    `${apiUrl}/raw`,
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
        .custom(jsonSchemaOf(ClassifierRawResultSchema)), // TODO: Can we compile the schema for this on demand?
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
        if (newProcessedFileKey) {
          recording.set("fileKey", newProcessedFileKey);
        }
        if (complete) {
          recording.set({
            jobKey: null,
            processing: false,
            processingEndTime: new Date().toISOString(),
          });
        }
        const nextJob = recording.getNextState();
        recording.set("processingState", nextJob);
        // Process extra data from file processing

        // FIXME Is fieldUpdates ever set by current processing?
        // if (result && result.fieldUpdates) {
        //   await recording.mergeUpdate(result.fieldUpdates);
        // }
        await recording.save();
        if (
          recording.type === RecordingType.ThermalRaw &&
          recording.processingState === RecordingProcessingState.Finished
        ) {
          await finishedProcessingRecording(recording, result, prevState);
        }
        return response
          .status(200)
          .json({ messages: [`Processing finished for #${id}`] });
      } else {
        // The current stage failed
        recording.set({
          processingState:
            `${recording.processingState}.failed` as RecordingProcessingState,
          jobKey: null,
          processing: false,
          processingEndTime: new Date().toISOString(), // Still set processingEndTime, since we might want to know how long it took to fail.
        });
        await recording.save();
        return response.status(200).json({
          messages: [`Processing failed for #${id}`],
        });
      }
    })
  );

  /**
   * @api {put} /api/fileProcessing Finished a file processing job
   * @apiName finishedFileProcessingJob
   * @apiGroup FileProcessing
   *
   * @apiParam {Integer} id ID of the recording.
   * @apiParam {String} jobKey Key given when requesting the job.
   * @apiParam {Boolean} success If the job was finished successfully.
   * @apiParam {JSON} [result] Result of the file processing
   * @apiParam {String} [newProcessedFileKey] LeoFS Key of the new file.
   */
  app.put(
    apiUrl,
    validateFields([
      idOf(body("id")),
      body("jobKey").exists(),
      booleanOf(body("success")),
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
            `Recording ${request.body.id} not found for jobKey ${request.body.jobKey}`,
            400
          )
        );
      } else {
        if (recording.jobKey !== request.body.jobKey) {
          return next(
            new ClientError("'jobKey' given did not match the database.", 400)
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
      const prevState = recording.processingState;
      if (success) {
        if (newProcessedFileKey) {
          recording.set("fileKey", newProcessedFileKey);
        }
        const nextJob = recording.getNextState();
        const complete =
          nextJob == models.Recording.finishedState(recording.type);
        recording.set({
          jobKey: null,
          processing: false,
          processingState: nextJob,
          processingEndTime: new Date().toISOString(),
        });

        // Process extra data from file processing
        if (result && result.fieldUpdates) {
          // FIXME - station matching happens in here, move it out.
          await recording.mergeUpdate(result.fieldUpdates);
        }
        await recording.save();
        if (recording.type === RecordingType.ThermalRaw) {
          if (
            complete &&
            recording.additionalMetadata &&
            "thumbnail_region" in recording.additionalMetadata
          ) {
            const region = recording.additionalMetadata["thumbnail_region"];
            const result = await recordingUtil.saveThumbnailInfo(
              recording,
              region
            );
            if (!result.hasOwnProperty("Key")) {
              log.warning(
                "Failed to upload thumbnail for %s",
                `${recording.rawFileKey}-thumb`
              );
              log.error("Reason: %s", (result as Error).message);
            }
          }
          if (complete && prevState !== RecordingProcessingState.Reprocess) {
            await recordingUtil.sendAlerts(recording.id);
          }
        }
        return response
          .status(200)
          .json({ messages: ["Processing finished."] });
      } else {
        recording.set({
          processingState:
            `${recording.processingState}.failed` as RecordingProcessingState,
          jobKey: null,
          processing: false,
        });
        await recording.save();
        return response.status(200).json({
          messages: ["Processing failed."],
        });
      }
    }
  );

  /**
   * @api {post} /api/fileProcessing/tags Add a tag to a recording
   * @apiName tagRecordingAfterFileProcessing
   * @apiGroup FileProcessing
   *
   * @apiDescription This call takes a `tag` field which contains a JSON
   * object string containing a number of fields. See /api/V1/tags for
   * more details.
   *
   * @apiParam {Number} recordingId ID of the recording that you want to tag.
   * @apiparam {JSON} tag Tag data in JSON format.
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {Number} tagId ID of the tag just added.
   *
   * @apiuse V1ResponseError
   *
   */
  app.post(
    `${apiUrl}/tags`,
    validateFields([
      middleware.parseJSON("tag", body),
      idOf(body("recordingId")),
    ]),
    fetchUnauthorizedRequiredRecordingById(body("recordingId")),
    async (request, response) => {
      const tagInstance = await recordingUtil.addTag(
        null,
        response.locals.recording,
        request.body.tag
      );
      responseUtil.send(response, {
        statusCode: 200,
        messages: ["Added new tag."],
        tagId: tagInstance.id,
      });
    }
  );

  /**
   * @api {post} /api/fileProcessing/metadata Updates the metadata for the recording
   * @apiName updateMetaData
   * @apiGroup FileProcessing
   *
   * @apiDescription This call updates the metadata for a recording
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
    validateFields([idOf(body("id")), middleware.parseJSON("metadata", body)]),
    fetchUnauthorizedRequiredRecordingById(body("id")),
    async (request: Request, response: Response) => {
      await recordingUtil.updateMetadata(
        response.locals.recording.recording,
        request.body.metadata
      );
    }
  );

  /**
   * @api {post} /api/fileProcessing/:id/tracks Add track to recording
   * @apiName PostTrack
   * @apiGroup FileProcessing
   *
   * @apiParam {JSON} data Data which defines the track (type specific).
   * @apiParam {Number} AlgorithmId Database Id of the Tracking algorithm details retrieved from
   * (#FileProcessing:Algorithm) request
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {int} trackId Unique id of the newly created track.
   *
   * @apiuse V1ResponseError
   *
   */
  app.post(
    `${apiUrl}/:id/tracks`,
    validateFields([
      idOf(param("id")),

      // FIXME - We don't currently have tracks for audio recordings, but when we do we need to widen this check.
      body("data").custom(jsonSchemaOf(ApiMinimalTrackRequestSchema)),
      idOf(body("algorithmId")),
    ]),
    fetchUnauthorizedRequiredRecordingById(param("id")),
    fetchUnauthorizedRequiredEventDetailSnapshotById(body("algorithmId")),
    async (request: Request, response) => {
      const track = await response.locals.recording.createTrack({
        data: request.body.data,
        AlgorithmId: request.body.algorithmId,
      });
      logger.warning("Create track %s", track.get({ plain: true }));
      responseUtil.send(response, {
        statusCode: 200,
        messages: ["Track added."],
        trackId: track.id,
      });
    }
  );

  /**
   * @api {delete} /api/fileProcessing/:id/tracks Delete all tracks for a recording
   * @apiName DeleteTracks
   * @apiGroup FileProcessing
   *
   * @apiUse V1ResponseSuccess
   *
   * @apiuse V1ResponseError
   *
   */
  app.delete(
    `${apiUrl}/:id/tracks`,
    validateFields([idOf(param("id"))]),
    fetchUnauthorizedRequiredRecordingById(param("id")),
    async (request: Request, response: Response) => {
      const tracks = await response.locals.recording.getTracks();
      tracks.forEach((track) => track.destroy());
      responseUtil.send(response, {
        statusCode: 200,
        messages: ["Tracks cleared."],
      });
    }
  );

  /**
   * @api {post} /api/v1/recordings/:id/tracks/:trackId/tags Add tag to track
   * @apiName PostTrackTag
   * @apiGroup FileProcessing
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
    validateFields([
      idOf(param("id")),
      idOf(param("trackId")),
      body("what").exists().isString(), // FIXME - Validate against valid tags?
      body("confidence").isFloat().toFloat(),
      middleware.parseJSON("data", body).optional(),
    ]),
    fetchUnauthorizedRequiredRecordingById(param("id")),
    fetchUnauthorizedRequiredTrackById(param("trackId")),
    async (request: Request, response: Response) => {
      const tag = await response.locals.track.addTag(
        request.body.what,
        request.body.confidence,
        true,
        request.body.data
      );
      responseUtil.send(response, {
        statusCode: 200,
        messages: ["Track tag added."],
        trackTagId: tag.id,
      });
    }
  );

  /**
   * @api {post} /algorithm Finds matching existing algorithm definition or adds a new one to the database
   * @apiName Algorithm
   * @apiGroup FileProcessing
   *
   * @apiParam {JSON} algorithm algorithm data in tag form.
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {int} algorithmId Id of the matching algorithm tag.
   *
   * @apiUse V1ResponseError
   */
  app.post(
    `${apiUrl}/algorithm`,
    [middleware.parseJSON("algorithm", body)],
    middleware.requestWrapper(async (request, response) => {
      const algorithm = await models.DetailSnapshot.getOrCreateMatching(
        "algorithm",
        request.body.algorithm
      );

      responseUtil.send(response, {
        statusCode: 200,
        messages: ["Algorithm key retrieved."],
        algorithmId: algorithm.id,
      });
    })
  );

  /**
   * @api {get} /api/v1/recordings/:id/tracks Get tracks for recording
   * @apiName GetTracks
   * @apiGroup Tracks
   * @apiDescription Get all tracks for a given recording and their tags.
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {JSON} tracks Array with elements containing id,
   * algorithm, data and tags fields.
   *
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:id/tracks`,
    param("id").isInt().toInt(),

    middleware.requestWrapper(async (request, response) => {
      const recording = await models.Recording.findOne({
        where: { id: request.params.id },
      });

      if (!recording) {
        responseUtil.send(response, {
          statusCode: 400,
          messages: ["No such recording."],
        });
        return;
      }

      const tracks = await recording.getActiveTracksTagsAndTagger();
      responseUtil.send(response, {
        statusCode: 200,
        messages: ["OK."],
        tracks: tracks.map((t) => {
          delete t.dataValues.RecordingId;
          return t;
        }),
      });
    })
  );
}
