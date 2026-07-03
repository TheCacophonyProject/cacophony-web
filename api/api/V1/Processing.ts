import { successResponse } from "../V1/responseUtil.js";
import { validateFields } from "../middleware.js";
import log from "@log";
import { body, oneOf, param, query } from "express-validator";
import _ from "lodash";
import {
  saveThumbnailInfo,
  sendAlerts,
  signedToken,
  updateMetadata,
} from "../V1/recordingUtil.js";
import type { Application, NextFunction, Request, Response } from "express";
import { getMask, maskMatch, trackIsMasked } from "@api/V1/trackMasking.js";
import ApiMinimalTracksRequestSchema from "@schemas/api/fileProcessing/MinimalTracksRequestData.schema.json" with { type: "json" };
import ApiMinimalTrackRequestSchema from "@schemas/api/fileProcessing/MinimalTrackRequestData.schema.json" with { type: "json" };
import ApiTrackClassifications from "@schemas/api/fileProcessing/TrackClassifications.schema.json" with { type: "json" };

import ApiThumbnailInfo from "@schemas/api/fileProcessing/ThumbnailInfo.schema.json" with { type: "json" };
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
  extractValFromRequest,
  fetchAuthorizedRequiredDeviceById,
  fetchUnauthorizedRequiredFlatRecordingById,
  fetchUnauthorizedRequiredTrackById,
  parseJSONField,
} from "@api/extract-middleware.js";
import { Track } from "@/models/Track.js";

import { DeviceHistory } from "@models/DeviceHistory.js";
import Sequelize, { Attributes, Op } from "sequelize";
import { openS3 } from "@models/util/util.js";

import type { TrackTagData } from "@/../types/api/trackTag.js";
import { DetailSnapshot } from "@models/DetailSnapshot.js";
import { AI_MASTER, TrackTag } from "@models/TrackTag.js";
import { Recording } from "@models/Recording.js";

import type {
  MinimalTrack,
  MinimalTrackRequestData,
  MinimalTracksRequestData,
} from "@/../types/api/fileProcessing.js";
import { Visit } from "@models/Visit.js";
import LabelPaths from "@/classifications/label_paths.json" with { type: "json" };
import { RecordingId, type TrackId } from "@typedefs/api/common.js";
import { ApiThermalRecordingMetadataResponse } from "@typedefs/api/recording.js";
import logging from "@log";

const NULL_TRACK_ID = 1;

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
    validateFields([
      oneOf([
        [
          idOf(query("id")).optional(),
          query("type").equals(RecordingType.Audio),
          query("state")
            .toArray()
            .isIn([
              RecordingProcessingState.Reprocess,
              RecordingProcessingState.Analyse,
              RecordingProcessingState.Finished,
            ]),
        ],
        [
          idOf(query("id")).optional(),
          query("type").isIn([
            RecordingType.InfraredVideo,
            RecordingType.ThermalRaw,
          ]),
          query("state")
            .toArray()
            .isIn([
              RecordingProcessingState.Reprocess,
              RecordingProcessingState.AnalyseThermal,
              RecordingProcessingState.TrackAndAnalyse,
              RecordingProcessingState.Tracking,
              RecordingProcessingState.ReTrack,
            ]),
        ],
      ]),
    ]),
    async (request: Request, response: Response) => {
      const type = request.query.type as RecordingType;
      const states = request.query.state as RecordingProcessingState[];
      let suppliedRecordingIdInTest;
      if (request.query.id) {
        suppliedRecordingIdInTest = Number(request.query.id) as RecordingId;
      }
      const recording = await Recording.getOneForProcessing(
        type,
        states,
        suppliedRecordingIdInTest,
      );
      if (recording === null) {
        log.debug(
          "No file to be processed for '%s' in state(s) '%s'.",
          type,
          states.join("', '"),
        );
        return response.status(HttpStatusCode.OkNoContent).json();
      } else {
        const rawJWT = signedToken(
          recording.rawFileKey,
          recording.getRawFileName(),
          recording.rawMimeType,
        );
        const rec = recording.dataValues;
        if (rec.location) {
          // Some versions of postgres seem to put this in.
          delete (rec.location as unknown as { crs: unknown }).crs;
        }
        return successResponse(response, {
          recording: rec,
          rawJWT,
        });
      }
    },
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
      const recording = await Recording.findByPk(request.body.id);
      if (!recording) {
        return next(
          new ClientError(
            `Recording ${request.body.id} not found for jobKey ${request.body.jobKey}`,
          ),
        );
      } else {
        if (recording.jobKey !== request.body.jobKey) {
          return next(
            new ClientError("'jobKey' given did not match the database."),
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
          const complete = nextJob === RecordingProcessingState.Finished;
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
          if (
            complete &&
            (prevState !== RecordingProcessingState.TrackAndAnalyse ||
              recording.type === RecordingType.Audio)
          ) {
            tracks = (await recording.getTracks()) || [];
          }
          if (
            complete &&
            prevState !== RecordingProcessingState.TrackAndAnalyse
          ) {
            // NOTE: If we already calculated "filtered" in trackAndAnalyse, we don't need to do it here.
            for (const track of tracks) {
              track.data = (await Track.getTrackData(
                track.id,
              )) as MinimalTrackRequestData;
              // FIXME: Not even sure we need "filtered" anymore, it's not used on browse-next, is probably a legacy browse thing.
              await track.updateIsFiltered();
            }
          }
          if (complete && recording.type === RecordingType.Audio) {
            const group = await recording.getGroup();
            // If unspecified in group settings, always hard delete audio recordings that have human speech detected.
            // TODO: Probably worth logging this for false-positives, in the case where the user hasn't made a clear
            //  choice?
            const shouldFilter = group.settings?.filterHuman ?? true;
            // If group filters out human audio, delete the file
            if (shouldFilter) {
              let hasHuman = false;
              for (const t of tracks) {
                const tags = await t.getTrackTags();
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
            prevState !== RecordingProcessingState.TrackAndAnalyse &&
            (recording.type === RecordingType.ThermalRaw ||
              recording.type === RecordingType.InfraredVideo)
          ) {
            // NOTE: If the clip_thumbnail isn't defined, we'll just use the
            // existing clip thumbnail from the initial upload process.
            const results = await saveThumbnailInfo(
              recording,
              tracks as { id: TrackId; data: MinimalTrackRequestData }[],
              recording.additionalMetadata?.thumbnail_region,
            );
            if (results) {
              for (const result of results) {
                if (result instanceof Error) {
                  log.warning(
                    "Failed to upload thumbnail for %s",
                    `${recording.rawFileKey}-thumb`,
                  );
                  log.error("Reason: %s", result.message);
                }
              }
            }
          }
          const twentyFourHoursMs = 24 * 60 * 60 * 1000;
          const recordingAgeMs =
            new Date().getTime() - recording.recordingDateTime.getTime();
          if (
            complete &&
            prevState !== RecordingProcessingState.Reprocess &&
            recording.uploader === "device" &&
            recording.type === RecordingType.ThermalRaw &&
            recordingAgeMs < twentyFourHoursMs
          ) {
            // FIXME: Maybe since we *just* created thumbnails, we don't need to pull them out again to send the alert
            //  we can just use what we already have in scope.
            await sendAlerts(recording);
          }

          if (complete && recording.type === RecordingType.ThermalRaw) {
            if (!recording.StationId) {
              logging.warning(
                `Can't find location id for recording ${recording.id}, weird`,
              );
            } else {
              const addSeconds = (startDate: Date, secs: number) => {
                const result = new Date(startDate);
                result.setSeconds(result.getSeconds() + secs);
                return result;
              };
              // Check that this is the *last* of the thermal recordings to be processed for this location, for
              // the visit window
              const otherRecordingsQueued = await Recording.findOne({
                where: {
                  id: { [Op.ne]: recording.id },
                  StationId: recording.StationId,
                  processingState: {
                    [Op.ne]: RecordingProcessingState.Finished,
                  },
                  deletedAt: null,
                  recordingDateTime: {
                    [Op.and]: [
                      {
                        [Op.lt]: addSeconds(
                          recording.recordingDateTime,
                          recording.duration + 600,
                        ),
                      },
                      {
                        [Op.gte]: addSeconds(
                          recording.recordingDateTime,
                          -1200,
                        ),
                      },
                    ],
                  },
                  type: RecordingType.ThermalRaw,
                },
                attributes: ["id"],
              });
              if (!otherRecordingsQueued) {
                await Visit.rebuildForRecording(recording);
              }
            }
          }
        } catch (e) {
          log.error("Failed to save recording: %s", e);
        }
        return successResponse(response, "Processing finished.");
      } else {
        if (!recording.isFailed()) {
          recording.processingState =
            `${recording.processingState}.failed` as RecordingProcessingState;
        }
        recording.processingFailedCount += 1;
        await recording.save();

        // TODO: Occasionally look at all the recordings that have been finished in the last x minutes,
        //  and check to see if any of them don't have a corresponding visit.  If there are some, rebuild those visits.
        //  This could initially be a cron-job, and if it finds any then we have a logic issue with our
        //  "only process visits once all pending processing recordings are done" logic.

        return successResponse(response, "Processing failed.");
      }
    },
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
    },
  );

  /**
   * @api {post} /api/v1/:id/tracks-and-tags Add tracks and tags to a recording
   * @apiName PostTracksAndTags
   * @apiGroup Processing
   *
   * Requires super-admin user credentials
   *
   * @apiParam {JSON} data Data which defines the tracks and tags (type specific).
   * @apiParam {Number} AlgorithmId Database ID of the Tracking algorithm details retrieved from
   * (#FileProcessing:Algorithm) request
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {int[]} trackIds of the newly created track.
   *
   * @apiUse V1ResponseError
   *
   */
  app.post(
    `${apiUrl}/:id/tracks-and-tags`,
    extractJwtAuthorisedSuperAdminUser,
    validateFields([
      idOf(param("id")),
      body("data").custom(jsonSchemaOf(ApiMinimalTracksRequestSchema)),
      idOf(body("algorithmId")),
    ]),
    parseJSONField(body("data")),
    async (request: Request, response: Response, next: NextFunction) => {
      const recordingId = request.params.id as unknown as RecordingId;
      const recording = await Recording.findByPk(recordingId);
      if (!recording) {
        return next(
          new AuthorizationError(
            `Could not find a Recording with an id of '${recordingId}'`,
          ),
        );
      }
      const data = response.locals.data as MinimalTracksRequestData;
      const trackIds: number[] = [];
      const tracks = [];

      const deviceId = recording.DeviceId;
      const groupId = recording.GroupId;
      const atTime = recording.recordingDateTime;

      const mask = await getMask(deviceId, groupId, atTime);
      for (const trackData of data) {
        const isMasked = mask && maskMatch(mask, trackData.positions);

        if (isMasked) {
          continue;
        }
        const track = prepareTrackToSave(
          recording,
          trackData,
          request.body.algorithmId,
        );
        tracks.push(track);
      }
      const trackTags = [];
      const trackTagData = [];
      const trackDataPromises = [];
      // NOTE: We set whether the track is filtered up front:
      const modelTracks = await Track.bulkCreate(tracks);
      const tracksAndData = [];
      for (let i = 0; i < modelTracks.length; i++) {
        const trackData = data[i];
        trackIds.push(modelTracks[i].id);

        // FIXME: Check if this is correct for Audio
        for (const pred of trackData.predictions) {
          const modelName = pred.name;
          const used = modelName === AI_MASTER;
          let confidence = pred.confidence;
          // confidence will always be over 50 if it was already put in the 0-100 range
          if (confidence <= 1) {
            confidence = Math.round(100 * confidence);
          }
          const predData = pred as TrackTagData;
          if (!pred.confident) {
            predData.raw_tag = pred.tag;
            pred.tag = "unidentified";
          }
          const what = pred.tag;
          const path =
            what in LabelPaths
              ? (LabelPaths as Record<string, string>)[what]
              : `all.${what.replace(" ", "_")}`;
          const tag = {
            TrackId: modelTracks[i].id,
            what,
            confidence: pred.confidence,
            automatic: true,
            path,
            model: modelName,
            UserId: null,
            used,
          } as TrackTag;
          trackTags.push(tag);
          trackTagData.push(predData);
        }

        delete trackData.predictions;
        tracksAndData.push({
          id: modelTracks[i].id,
          data: trackData,
        });
        trackDataPromises.push(
          Track.saveTrackData(modelTracks[i].id, trackData),
        );
      }

      const modelTrackTags = await TrackTag.bulkCreate(trackTags);
      if (
        recording.type === RecordingType.ThermalRaw &&
        recording.additionalMetadata
      ) {
        // NOTE: If the clip_thumbnail isn't defined, we'll just use the
        // existing clip thumbnail from the initial upload process.
        const results = await saveThumbnailInfo(
          recording,
          tracksAndData,
          (recording.additionalMetadata as ApiThermalRecordingMetadataResponse)
            .thumbnail_region,
        );
        if (results) {
          for (const result of results) {
            if (result instanceof Error) {
              log.warning(
                "Failed to upload thumbnail for %s",
                `${recording.rawFileKey}-thumb`,
              );
              log.error("Reason: %s", result.message);
            }
          }
        }
      }

      for (let i = 0; i < modelTrackTags.length; i++) {
        const modelTrackTag = modelTrackTags[i];
        if (modelTrackTag.model) {
          // Save the additional Track metadata to object storage
          trackDataPromises.push(
            Track.saveTrackTagData(modelTrackTag.id, trackTagData[i]),
          );
        }
      }
      await Promise.all(trackDataPromises);
      // TODO: Also send alerts, since we have the thumbnails?
      return successResponse(response, "Tracks added.", { trackIds });
    },
  );

  const isTrackMasked = async (
    recording: Recording,
    trackData: MinimalTrackRequestData,
  ): Promise<boolean> => {
    const deviceId = recording.DeviceId;
    const groupId = recording.GroupId;
    const atTime = recording.recordingDateTime;
    if (recording.type === RecordingType.ThermalRaw) {
      const positions = trackData && trackData.positions;
      if (positions) {
        return trackIsMasked(deviceId, groupId, atTime, positions);
      }
    }
    return false;
  };

  const prepareTrackToSave = (
    recording: Recording,
    trackData: MinimalTrackRequestData,
    algorithmId: number,
  ): MinimalTrack => {
    let trackIsFiltered = true;
    {
      // Calculate up front if the track is filtered.
      const tags = [];
      for (const pred of trackData.predictions) {
        const predData = pred as TrackTagData;
        if (!pred.confident) {
          predData.raw_tag = pred.tag;
          pred.tag = "unidentified";
        }
        tags.push({
          what: pred.tag,
          modelName: pred.name,
        });
      }

      const masterTag = tags.find((tag) => tag.modelName === AI_MASTER);
      if (masterTag) {
        trackIsFiltered = TrackTag.filteredTags.some(
          (filteredTag) => filteredTag === masterTag.what,
        );
      }
    }

    const newTrack: MinimalTrack = {
      AlgorithmId: algorithmId,
      startSeconds: trackData.start_s,
      endSeconds: trackData.end_s,
      minFreqHz: null,
      maxFreqHz: null,
      thumbnailScore: null,
      RecordingId: recording.id,
      filtered: trackIsFiltered,
    };
    if (recording.type === RecordingType.Audio) {
      newTrack.minFreqHz = trackData.minFreq || 0;
      newTrack.maxFreqHz = trackData.maxFreq || 0;
    }
    if (trackData.thumbnail?.score) {
      newTrack.thumbnailScore = trackData.thumbnail.score;
    }
    delete trackData.start_s;
    delete trackData.end_s;
    return newTrack;
  };

  const addTrack = async (
    recording: Recording,
    trackData: MinimalTrackRequestData,
    algorithmId: number,
  ): Promise<number> => {
    const discardMaskedTrack = await isTrackMasked(recording, trackData);
    if (discardMaskedTrack) {
      return 1;
    }
    const newTrack: Partial<Attributes<Track>> = {
      AlgorithmId: algorithmId,
      startSeconds: trackData.start_s || 0,
      endSeconds: trackData.end_s || 0,
      minFreqHz: null,
      maxFreqHz: null,
      RecordingId: recording.id,
    };
    // FIXME: Do we really want to delete predictions?
    delete trackData.predictions;
    if (recording.type === RecordingType.Audio) {
      newTrack.minFreqHz = trackData.minFreq || 0;
      newTrack.maxFreqHz = trackData.maxFreq || 0;
    }
    const track = await recording.addTrack(newTrack, trackData);
    return track.id;
  };
  /**
   * @api {post} /api/v1/processing/:id/tracks Add track to recording
   * @apiName PostTrack
   * @apiGroup Processing
   * @apiDeprecated Use /api/v1/processing/:id/tracksAndTags
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
      const recordingId = request.params.id as unknown as RecordingId;
      const recording = await Recording.findByPk(recordingId);
      if (!recording) {
        return next(
          new AuthorizationError(
            `Could not find a Recording with an id of '${request.params.id}'`,
          ),
        );
      }
      const data = response.locals.data;

      const trackId = await addTrack(recording, data, request.body.algorithmId);
      // If it gets filtered out, we can just give it a trackId of 1, and then just not do anything when you try to add
      // trackTags to tag id 1.
      return successResponse(response, "Track added.", {
        trackId,
      });
    },
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
        const trackTags = await TrackTag.findAll({
          where: {
            TrackId: track.id,
          },
        });
        for (const trackTag of trackTags) {
          promises.push(openS3().deleteObject(`TrackTag/${trackTag.id}`));
        }
        promises.push(openS3().deleteObject(`Track/${track.id}`));
        promises.push(track.destroy());
      }
      await Promise.allSettled(promises);
      return successResponse(response, "Tracks cleared.");
    },
  );

  /**
   * @api {post} /api/v1/processing/:id/tracks/:trackId/tags Add tag to track
   * @apiName PostTrackTag
   * @apiGroup Processing
   * @apiDeprecated Use /api/v1/processing/:id/tracks/:trackId/tags-bulk

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
          false,
        );
        return successResponse(response, "Track tag added.", {
          trackTagId: tag.id,
        });
      }
      // Returns without creating track if this is a masked out track.
      return successResponse(response, "Track tag added.", {
        trackTagId: 1,
      });
    },
  );

  /**
   * @api {post} /api/v1/processing/:id/tracks/:trackId/tags-bulk Add tags to track
   * @apiName PostTrackTagsBulk
   * @apiGroup Processing
   *
   * Requires super-admin user credentials
   *
   * @apiParam {JSON} data Describing track tags.
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {int[]} trackTagIds Unique ids of the newly created track tags.
   *
   * @apiUse V1ResponseError
   */
  app.post(
    `${apiUrl}/:id/tracks/:trackId/tags-bulk`,
    extractJwtAuthorisedSuperAdminUser,
    validateFields([
      idOf(param("id")),
      idOf(param("trackId")),
      body("data").custom(jsonSchemaOf(ApiTrackClassifications)),
    ]),
    parseJSONField(body("data")),
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
    async (_request: Request, response: Response) => {
      if (!response.locals.skip) {
        const trackTags: TrackTag[] = [];
        const trackTagData = [];
        for (const pred of response.locals.data) {
          const modelName = pred.name;
          const used = modelName === AI_MASTER;
          let confidence = pred.confidence;
          // confidence will always be over 50 if it was already put in the 0-100 range
          if (confidence < 1) {
            confidence = Math.round(100 * confidence);
          }
          const predData = pred as TrackTagData;
          if (!pred.confident) {
            predData.raw_tag = pred.tag;
            pred.tag = "unidentified";
          }

          const what = pred.tag;
          const path =
            what in LabelPaths
              ? (LabelPaths as Record<string, string>)[what]
              : `all.${what.replace(" ", "_")}`;
          const tag = {
            TrackId: response.locals.track.id,
            what,
            path,
            confidence: pred.confidence,
            automatic: true,
            model: modelName,
            UserId: null,
            used,
          } as TrackTag;
          trackTags.push(tag);
          trackTagData.push(predData);
        }

        const trackTagIds = [];
        const modelTrackTags = await TrackTag.bulkCreate(trackTags);
        const trackTagDataPromises = [];
        for (let i = 0; i < modelTrackTags.length; i++) {
          const modelTrackTag = modelTrackTags[i];
          trackTagIds.push(modelTrackTag.id);
          if (modelTrackTag.model) {
            // Save the additional Track metadata to object storage
            trackTagDataPromises.push(
              Track.saveTrackTagData(modelTrackTag.id, trackTagData[i]),
            );
          }
        }
        await Promise.all(trackTagDataPromises);

        return successResponse(response, "Track tags added.", {
          trackTagIds: trackTagIds,
        });
      } else {
        // Returns without creating track if this is a masked out track.
        return successResponse(response, "Track tags added.", {
          trackTagIds: 1,
        });
      }
    },
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
      const algorithm = await DetailSnapshot.getOrCreateMatching(
        "algorithm",
        response.locals.algorithm,
      );
      return successResponse(response, "Algorithm key retrieved.", {
        algorithmId: algorithm.id,
      });
    },
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
    },
  );

  /**
   * @api {post} /api/fileProcessing/:id/tracks/:trackId/thumbnailInfo Update thumbnail info for a track, this will not regenerate the thumbnail (this will be done post processing)
   * @apiName UpdateTrackThumbnail
   * @apiGroup Processing
   *
   * @apiParam {JSON} data Data which defines the thumbnail info.
   *
   * @apiUse V1ResponseSuccess
   * @apiuse V1ResponseError
   *
   */
  app.post(
    `${apiUrl}/:id/tracks/:trackId/thumbnailInfo`,
    extractJwtAuthorisedSuperAdminUser,
    validateFields([
      idOf(param("id")),
      idOf(param("trackId")),
      body("data").custom(jsonSchemaOf(ApiThumbnailInfo)),
    ]),
    fetchUnauthorizedRequiredFlatRecordingById(param("id")),
    fetchUnauthorizedRequiredTrackById(param("trackId")),
    parseJSONField(body("data")),
    async (_request: Request, response) => {
      const existingData = (await Track.getTrackData(
        response.locals.track.id,
      )) as MinimalTrackRequestData;
      existingData.thumbnail = response.locals.data;
      await Track.saveTrackData(response.locals.track.id, existingData);
      return successResponse(response, "Track updated");
    },
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
      let d: MinimalTrackRequestData;
      const { data, filtered, AlgorithmId, thumbnailScore } = response.locals
        .track as Track;
      const oldData = (await Track.getTrackData(
        response.locals.track.id,
      )) as MinimalTrackRequestData;
      if (Object.keys(oldData).length === 0) {
        d = data;
      } else {
        d = oldData;
      }
      const archivedDataCopy: {
        AlgorithmId: number;
        archivedAt: Date;
        filtered: boolean;
        startSeconds: number;
        endSeconds: number;
        minFreqHz: number | null;
        maxFreqHz: number | null;
        thumbnailScore: number | null;
      } = {
        AlgorithmId,
        filtered,
        startSeconds: d.start_s || 0,
        endSeconds: d.end_s || 0,
        minFreqHz: null,
        maxFreqHz: null,
        archivedAt: new Date(),
        thumbnailScore,
      };
      if (response.locals.recording.type === RecordingType.Audio) {
        archivedDataCopy.minFreqHz = d.minFreq || 0;
        archivedDataCopy.maxFreqHz = d.maxFreq || 0;
      }
      await (response.locals.recording as Recording).addTrack(archivedDataCopy);
      const newData = response.locals.data;
      const update: {
        startSeconds: number;
        endSeconds: number;
        minFreqHz: number | null;
        maxFreqHz: number | null;
      } = {
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
      await Track.saveTrackData(response.locals.track.id, newData);

      return successResponse(response, "Track updated");
    },
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
      const deviceHistoryEntry: DeviceHistory = await DeviceHistory.findOne({
        where: {
          DeviceId: device.id,
          GroupId: device.GroupId,
          fromDateTime: { [Op.lte]: atTime },
        },
        order: [
          ["fromDateTime", "DESC"],
          ["id", "DESC"],
        ],
        attributes: [
          "DeviceId",
          "fromDateTime",
          "location",
          [
            Sequelize.fn(
              "json_build_object",
              "ratThresh",
              Sequelize.literal(`"DeviceHistory"."settings"#>'{ratThresh}'`),
            ),
            "settings",
          ],
        ],
      });
      return successResponse(response, "Got device history", {
        deviceHistoryEntry,
      });
    },
  );
}
