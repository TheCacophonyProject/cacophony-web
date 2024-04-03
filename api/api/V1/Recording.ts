/*
cacophony-api: The Cacophony Project API server
Copyright (C) 2018  The Cacophony Project

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import { jsonSchemaOf } from "@api/schema-validation.js";
import util from "@api/V1/util.js";
import config from "@config";
import log from "@log";
import { format as sqlFormat } from "sql-formatter";
import modelsInit from "@models/index.js";
import type { Recording } from "@models/Recording.js";
import { mapPosition } from "@models/Recording.js";
import type { Tag } from "@models/Tag.js";
import type { Track } from "@models/Track.js";
import type { TrackTag } from "@models/TrackTag.js";
import ApiRecordingUpdateRequestSchema from "@schemas/api/recording/ApiRecordingUpdateRequest.schema.json" assert { type: "json" };
import ApiRecordingTagRequestSchema from "@schemas/api/tag/ApiRecordingTagRequest.schema.json" assert { type: "json" };
import ApiTrackDataRequestSchema from "@schemas/api/track/ApiTrackDataRequest.schema.json" assert { type: "json" };
import ApiTrackTagAttributesSchema from "@schemas/api/trackTag/ApiTrackTagAttributes.schema.json" assert { type: "json" };
import { TagMode } from "@typedefs/api/consts.js";
import {
  HttpStatusCode,
  RecordingProcessingState,
  RecordingType,
} from "@typedefs/api/consts.js";
import type {
  ApiAudioRecordingMetadataResponse,
  ApiAudioRecordingResponse,
  ApiGenericRecordingResponse,
  ApiRecordingResponse,
  ApiRecordingUpdateRequest,
  ApiThermalRecordingResponse,
} from "@typedefs/api/recording.js";
import type {
  ApiRecordingTagRequest,
  ApiRecordingTagResponse,
} from "@typedefs/api/tag.js";
import type { ApiTrackResponse } from "@typedefs/api/track.js";
import type {
  ApiAutomaticTrackTagResponse,
  ApiHumanTrackTagResponse,
  ApiTrackTagResponse,
} from "@typedefs/api/trackTag.js";
import type { Application, NextFunction, Request, Response } from "express";
import { body, param, query } from "express-validator";
// @ts-ignore
import * as csv from "fast-csv";
import type { JwtPayload } from "jsonwebtoken";
import jwt from "jsonwebtoken";
import sequelize, { Op } from "sequelize";
import LabelPaths from "../../classifications/label_paths.json" assert { type: "json" };

import {
  AuthorizationError,
  BadRequestError,
  ClientError,
  FatalError,
} from "../customErrors.js";
import {
  extractJwtAuthorisedDevice,
  extractJwtAuthorizedUser,
  fetchAuthorizedRequiredDeviceById,
  fetchAuthorizedRequiredDeviceInGroup,
  fetchAuthorizedRequiredDevices,
  fetchAuthorizedRequiredGroupByNameOrId,
  fetchAuthorizedRequiredRecordingById,
  fetchUnauthorizedRequiredGroupByNameOrId,
  fetchUnauthorizedRequiredRecordingById,
  fetchUnauthorizedRequiredRecordingTagById,
  fetchUnauthorizedRequiredTrackById,
  parseJSONField,
} from "../extract-middleware.js";
import { expectedTypeOf, isIntArray, validateFields } from "../middleware.js";
import {
  anyOf,
  booleanOf,
  idOf,
  integerOf,
  stringOf,
  validNameOf,
} from "../validation-middleware.js";

import {
  addTag,
  bulkDelete,
  getThumbnail,
  getTrackTags,
  getTrackTagsCount,
  queryRecordings,
  queryVisits,
  reportRecordings,
  reportVisits,
  signedToken,
} from "./recordingUtil.js";
import { serverErrorResponse, successResponse } from "./responseUtil.js";
import { streamS3Object } from "@api/V1/signedUrl.js";
import fs from "fs/promises";
import {
  uploadGenericRecordingFromDevice,
  uploadGenericRecordingOnBehalfOfDevice,
} from "@api/fileUploaders/uploadGenericRecording.js";
import { trackIsMasked } from "@api/V1/trackMasking.js";
import type { TrackId } from "@typedefs/api/common.js";
import { format } from "util";
import { asyncLocalStorage } from "@/Globals.js";
import Sequelize from "sequelize";

const models = await modelsInit();

const mapTrackTag = (
  trackTag: TrackTag
): ApiHumanTrackTagResponse | ApiAutomaticTrackTagResponse => {
  let data = trackTag?.data;
  if (data && typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch (e) {
      // ...
    }
  }

  const trackTagBase: ApiTrackTagResponse = {
    confidence: trackTag.confidence,
    createdAt: trackTag.createdAt?.toISOString(),
    data: data as any, // FIXME - Probably returning a bit too much useless
    // data to the front-end?
    id: trackTag.id,
    automatic: false, // Unset
    trackId: trackTag.TrackId,
    updatedAt: trackTag.updatedAt?.toISOString(),
    what: trackTag.what,
    path: trackTag.path,
  };
  if (trackTag.automatic) {
    (trackTagBase as ApiAutomaticTrackTagResponse).automatic = true;
    return trackTagBase as ApiAutomaticTrackTagResponse;
  } else {
    (trackTagBase as ApiHumanTrackTagResponse).automatic = false;
    (trackTagBase as ApiHumanTrackTagResponse).userId = trackTag.UserId;
    if (trackTag.User) {
      (trackTagBase as ApiHumanTrackTagResponse).userName =
        trackTag.User.userName;
    }
    return trackTagBase as ApiHumanTrackTagResponse;
  }
};

const mapTrackTags = (
  trackTags: TrackTag[]
): (ApiHumanTrackTagResponse | ApiAutomaticTrackTagResponse)[] => {
  const t = trackTags.map(mapTrackTag);
  // Make sure tags are always in some deterministic order for testing purposes.
  t.sort((a, b) => a.id - b.id);
  return t;
};

export const mapTrack = (track: Track): ApiTrackResponse => {
  const t: ApiTrackResponse = {
    id: track.id,
    start: track.data.start_s,
    end: track.data.end_s,
    tags: (track.TrackTags && mapTrackTags(track.TrackTags)) || [],
    automatic: track.data.automatic ?? true,
    ...(track.data.minFreq && { minFreq: track.data.minFreq }),
    ...(track.data.maxFreq && { maxFreq: track.data.maxFreq }),
    filtered: track.filtered,
  };
  if (track.data.positions && track.data.positions.length) {
    t.positions = track.data.positions.map(mapPosition);
  }
  return t;
};

export const mapTracks = (tracks: Track[]): ApiTrackResponse[] => {
  const t = tracks.map(mapTrack);
  // Sort tracks by start time
  t.sort((a, b) => a.start - b.start);
  return t;
};

const mapTag = (tag: Tag): ApiRecordingTagResponse => {
  const result: ApiRecordingTagResponse = {
    automatic: tag.automatic,
    confidence: tag.confidence,
    detail: tag.detail,
    id: tag.id,
    recordingId: tag.recordingId,
    version: tag.version,
    createdAt: (tag.createdAt as unknown as Date).toISOString(),
    comment: tag.comment,
  };
  if (tag.taggerId) {
    result.taggerId = tag.taggerId;
    if ((tag as any).tagger) {
      result.taggerName = (tag as any).tagger.userName;
    }
  }
  if (tag.startTime !== null && tag.startTime !== undefined) {
    result.startTime = tag.startTime;
  }
  if (tag.duration !== null && tag.duration !== undefined) {
    result.duration = tag.duration;
  }
  return result;
};

const mapTags = (tags: Tag[]): ApiRecordingTagResponse[] => tags.map(mapTag);

const ifNotNull = (val: any | null) => {
  if (val !== null) {
    return val;
  }
  return undefined;
};

const mapRecordingResponse = (
  recording: Recording
): ApiThermalRecordingResponse | ApiAudioRecordingResponse => {
  const cameraTypes = [
    RecordingType.ThermalRaw,
    RecordingType.TrailCamVideo,
    RecordingType.TrailCamImage,
    RecordingType.InfraredVideo,
  ];
  try {
    const commonRecording: ApiRecordingResponse = {
      id: recording.id,
      deviceId: recording.DeviceId,
      duration: recording.duration,
      location: recording.location,
      deviceName: recording.Device?.deviceName,
      groupId: recording.GroupId,
      groupName: recording.Group?.groupName,
      processingState: recording.processingState,
      recordingDateTime: recording.recordingDateTime?.toISOString(),
      stationName: recording.Station?.name,
      type: recording.type,
      tags: (recording.Tags && mapTags(recording.Tags)) || [],
      tracks: (recording.Tracks && mapTracks(recording.Tracks)) || [],
    };
    const comment = ifNotNull(recording.comment);
    const stationId = ifNotNull(recording.StationId);
    const redacted = ifNotNull(recording.redacted);
    const processing = ifNotNull(recording.processing);
    const fileHash = ifNotNull(recording.rawFileHash);
    const mimeType = ifNotNull(recording.rawMimeType);
    if (comment) {
      commonRecording.comment = comment;
    }
    if (stationId) {
      commonRecording.stationId = stationId;
    }
    if (redacted !== undefined) {
      commonRecording.redacted = redacted;
    }
    if (fileHash) {
      commonRecording.fileHash = fileHash;
    }
    if (mimeType) {
      commonRecording.rawMimeType = mimeType;
    }
    if (processing !== undefined) {
      commonRecording.processing = processing;
    }

    if (cameraTypes.includes(recording.type)) {
      const additionalMetadata = ifNotNull(recording.additionalMetadata);
      if (additionalMetadata) {
        return {
          ...commonRecording,
          type: recording.type,
          additionalMetadata,
        } as ApiThermalRecordingResponse;
      }
      return {
        ...commonRecording,
        type: recording.type,
      } as ApiThermalRecordingResponse;
    } else if (recording.type === RecordingType.Audio) {
      return {
        ...commonRecording,
        fileMimeType: ifNotNull(recording.fileMimeType),
        additionalMetadata:
          recording.additionalMetadata as ApiAudioRecordingMetadataResponse, // TODO - strip and map metadata?
        airplaneModeOn: ifNotNull(recording.airplaneModeOn),
        batteryCharging: ifNotNull(recording.batteryCharging),
        batteryLevel: ifNotNull(recording.batteryLevel),
        relativeToDawn: ifNotNull(recording.relativeToDawn),
        relativeToDusk: ifNotNull(recording.relativeToDusk),
        cacophonyIndex: ifNotNull(recording.cacophonyIndex),
        version: recording.version,
        type: recording.type,
      };
    }
  } catch (e) {
    log.error("%s", e);
  }
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiTracksResponseSuccess {
  tracks: ApiTrackResponse[];
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiTracksResponseSuccess {
  track: ApiTrackResponse;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiUpdateRecordingRequestBody {
  updates: ApiRecordingUpdateRequest;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiRecordingResponseSuccess {
  recording: ApiGenericRecordingResponse;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiRecordingTagRequestBody {
  tag: ApiRecordingTagRequest;
}

export default (app: Application, baseUrl: string) => {
  const apiUrl = `${baseUrl}/recordings`;

  /**
   * @apiDefine RecordingMetaData
   *
   * @apiBody {JSON} data[metadata] recording tracks and predictions:
   * <ul>
   * <li>(REQUIRED) tracks - array of track JSON, each track should have
   *   <ul>
   *    <li> positions - array of track positions
   *    a position is
   *          <ul>
   *            <li> x -  left coordinate
   *            <li> y - top coordinate
   *            <li> width - region width
   *            <li> height - region height
   *            <li> mass - mass (count of non zero pixels in the filtered image of this track)
   *            <li> frame_number
   *            <li> blank - if this is a blank match i.e. from  kalman filter
   *          </ul>
   *    <li> start_s - start time of track in seconds
   *    <li> end_s - end time of track in seconds
   *    <li> predictions - array of prediction info for each model
   *    a prediction object:
   *    <ul>
   *      <li> model_id - reference to a model defined in the models section
   *      <li>(OPTIONAL) confident_tag - if present create a track tag from this
   *      <li>(OPTIONAL) confidence - confidence between 0 - 1 of the prediction
   *      <li>(OPTIONAL) clarity - confidence between 0 - 1 of the prediction
   *      <li>(OPTIONAL) classify_time - time in seconds taken to classify
   *      <li>(OPTIONAL) prediction_frames - frames used in the predictions
   *      <li>(OPTIONAL) predictions - array of prediction confidences for each prediction e.g. [[0,1,99,0,0,0]]
   *      <li>(OPTIONAL) label - the classified label (this may be different to the confident_tag)
   *      <li>(OPTIONAL) all_class_confidences - dictionary of confidence per class
   *  </ul>
   *  <li> models - array of models used
   *    a model object:
   *    <ul>
   *      <li> id - id of model used for tracks to reference
   *      <li> name - friendly name given to the model
   *    </ul>
   *  <li>  algorithm(OPTIONAL) - dictionary describing algorithm, model_name should be present
   * </ul>
   * @apiParamExample {JSON} Example recording track metadata:
   * {
   *  "algorithm": {
   *     "model_name": "resnet-wallaby"
   *    },
   *   "tracks": [{
   *     "positions":[{"x":1, "y":10, "frame_number":20, "mass": 25, "blank": false}],
   *     "start_s": 10,
   *     "end_s": 22.2,
   *     "predictions":[{"model_id":1, "confident_tag":"unidentified", "confidence": 0.6, "classify_time":0.3, "classify_time": 0.6, "prediction_frames": [[0,2,3,4,5,10,12]], "predictions": [[0.6,0.3,0.1]], "label":"cat", "all_class_confidences": {"cat":0.6, "rodent":0.3, "possum":0.1} }],
   *    }],
   *    "models": [{ "id": 1, "name": "inc3" }]
   * }
   */

  /**
   * @apiDefine RecordingParams
   *
   * @apiBody {JSON} data Metadata about the recording.   Valid tags are:
   * <ul>
   * <li>(REQUIRED) type: 'thermalRaw', or 'audio'
   * <li>fileHash - Optional sha1 hexadecimal formatted hash of the file to be uploaded
   * <li>duration
   * <li>recordingDateTime
   * <li>location
   * <li>version
   * <li>batteryCharging
   * <li>batteryLevel
   * <li>airplaneModeOn
   * <li>additionalMetadata
   * <li>comment
   * <li>processingState - Initial processing state to set recording at
   * </ul>
   * @apiBody {File} file Recording file to upload
   */

  /**
   * @api {post} /api/v1/recordings Add a new recording
   * @apiName PostRecording
   * @apiGroup Recordings
   * @apiDescription Uploads a device's own recording to the server.
   *
   * @apiUse V1DeviceAuthorizationHeader
   *
   * @apiUse RecordingParams
   *
   * @apiUse RecordingMetaData
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {Number} recordingId ID of the recording.
   * @apiUse V1ResponseError
   */
  app.post(
    apiUrl,
    extractJwtAuthorisedDevice,
    async (request, response, next) =>
      uploadGenericRecordingFromDevice(models)(request, response, next)
  );

  /**
   * @api {post} /api/v1/recordings/device/:deviceName/group/:groupName Add a new recording on behalf of device using group
   * @apiName PostRecordingOnBehalfUsingGroup
   * @apiGroup Recordings
   * @apiDescription Called by a user to upload raw thermal video on behalf of a
   * device. The user must have permission to view videos from the device or the
   * call will return an error.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {String} deviceName name of device to add recording for
   * @apiParam {String} groupName name of group to add recording for
   * @apiUse RecordingParams
   *
   * @apiUse RecordingMetaData
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {Number} recordingId ID of the recording.
   * @apiuse V1ResponseError
   */

  app.post(
    `${apiUrl}/device/:deviceName/group/:groupName`,
    extractJwtAuthorizedUser,
    validateFields([
      validNameOf(param("groupName")),
      validNameOf(param("deviceName")),

      // Default to also allowing inactive devices to have uploads on
      // their behalf
      query("only-active").default(false).isBoolean().toBoolean(),
    ]),
    fetchAuthorizedRequiredDeviceInGroup(
      param("deviceName"),
      param("groupName")
    ),
    async (request, response, next) =>
      uploadGenericRecordingOnBehalfOfDevice(models)(request, response, next)
  );

  /**
   * @api {post} /api/v1/recordings/device/:deviceId
   * Add a new recording on behalf of device
   * @apiName PostRecordingOnBehalf
   * @apiGroup Recordings
   * @apiDescription Called by a user to upload raw thermal video on behalf of a
   * device. The user must have permission to view videos from the device or the
   * call will return an error.
   *
   * @apiParam {Integer} deviceId ID of the device to upload on behalf of. If
   * you don't have access to the ID the deviceName can be used instead in it's
   * place.
   * @apiQuery {Boolean} [only-active=false] operate only on active devices
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse RecordingParams
   *
   * @apiUse RecordingMetaData
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {Number} recordingId ID of the recording.
   * @apiuse V1ResponseError
   */

  app.post(
    `${apiUrl}/device/:deviceId`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("deviceId")),
      // Default to also allowing inactive devices to have uploads on their
      // behalf
      query("only-active").default(false).isBoolean().toBoolean(),
    ]),
    fetchAuthorizedRequiredDeviceById(param("deviceId")),
    async (request, response, next) =>
      uploadGenericRecordingOnBehalfOfDevice(models)(request, response, next)
  );

  /**
   * @api {post} /api/v1/recordings/:deviceName Legacy upload on behalf of a device
   * @apiName PostRecordingOnBehalfLegacy
   * @apiGroup Recordings
   * @apiDeprecated use now (#Recordings:PostRecordingOnBehalf)
   *
   * @apiDescription Called by a user to upload raw thermal video on
   * behalf of a device. This endpoint can only be used if a device's
   * name is unique across all groups. It should not be used for new code.
   *
   * @apiUse V1UserAuthorizationHeader
   * @apiParam {Integer} deviceName
   * @apiUse RecordingParams
   *
   * @apiUse RecordingMetaData
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {Number} recordingId ID of the recording.
   * @apiuse V1ResponseError
   */
  app.post(
    `${apiUrl}/:deviceName`,
    extractJwtAuthorizedUser,
    validateFields([validNameOf(param("deviceName"))]),
    fetchAuthorizedRequiredDevices,
    (request: Request, response: Response, next: NextFunction) => {
      const targetDeviceName = request.params.deviceName;
      const devices = response.locals.devices.filter(
        ({ deviceName }) => deviceName === targetDeviceName
      );
      if (devices.length !== 1) {
        return next(
          new ClientError(
            `Could not find unique device with name ${targetDeviceName} - try the /api/v1/recordings/device/:deviceName/group/:groupName endpoint.`
          )
        );
      }
      response.locals.device = devices.pop();
      next();
    },
    async (request, response, next) =>
      uploadGenericRecordingOnBehalfOfDevice(models)(request, response, next)
  );

  // FIXME - Should we just delete this now?
  /**
   * @api {get} /api/v1/recordings/visits
   * Query available recordings and generate visits
   * @apiName QueryVisits
   * @apiGroup Recordings
   *
   * @apiParam {string} view-mode (Optional) - can be set to "user"
   *
   * @apiUse V1UserAuthorizationHeader
   * @apiUse BaseQueryParams
   * @apiUse RecordingOrder
   * @apiUse MoreQueryParams
   * @apiUse V1ResponseSuccessQuery
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/visits`,
    extractJwtAuthorizedUser,
    validateFields([
      query("view-mode").optional().equals("user"),
      query("type").optional().isIn(["thermalRaw", "audio"]),
      query("processingState")
        .optional()
        .isIn(Object.values(RecordingProcessingState)),
      query("where").isJSON().optional(),
      integerOf(query("offset")).optional(),
      integerOf(query("limit")).optional(),
      query("order").isJSON().optional(),
      query("tags").isJSON().optional(),
      query("tagMode")
        .optional()
        .custom((value) => {
          return models.Recording.isValidTagMode(value);
        }),
      query("filterOptions").isJSON().optional(),
    ]),
    parseJSONField(query("order")),
    parseJSONField(query("where")),
    parseJSONField(query("tags")),
    parseJSONField(query("filterOptions")), // FIXME - this doesn't seem to be used.
    async (request: Request, response: Response) => {
      const { viewAsSuperUser, where, tags = [] } = response.locals;
      const { tagMode, offset, limit } = request.query;
      const result = await queryVisits(models, response.locals.requestUser.id, {
        viewAsSuperUser,
        where,
        tagMode: tagMode as TagMode,
        tags,
        offset: offset && parseInt(offset as string),
        limit: limit && parseInt(limit as string),
      });
      return successResponse(response, "Completed query.", {
        limit: request.query.limit,
        offset: request.query.offset,
        numRecordings: result.numRecordings,
        numVisits: result.numVisits,
        queryOffset: result.queryOffset,
        totalRecordings: result.totalRecordings,
        hasMoreVisits: result.hasMoreVisits,
        visits: result.visits,
        summary: result.summary.generateAnimalSummary(),
      });
    }
  );

  /**
   * @api {get} /api/v1/recordings Query available recordings
   * @apiName QueryRecordings
   * @apiGroup Recordings
   *
   * @apiUse V1UserAuthorizationHeader
   * @apiQuery {String="user"} [view-mode] Allow a super-user to view as a
   * regular user
   * @apiQuery {Boolean} [deleted=false] Include only deleted recordings
   * @apiQuery {Boolean} [exclusive=false] Include only top level tagged recording (not children)
   * @apiQuery {Boolean} [countAll=true] Count all query matches rather than just number of results (as much as the limit parameter)
   * @apiQuery {JSON} [order] Whether the recording should be ascending or descending in time
   * @apiInterface {apiQuery::RecordingProcessingState} [processingState] Current processing state of recordings
   * @apiInterface {apiQuery::RecordingType} [type] Type of recordings
   * @apiUse BaseQueryParams
   * @apiUse MoreQueryParams
   * @apiUse V1ResponseSuccessQuery
   * @apiUse V1ResponseError
   */
  app.get(
    apiUrl,
    extractJwtAuthorizedUser,
    validateFields([
      query("view-mode").optional().equals("user"),
      query("type").optional().isIn(Object.values(RecordingType)),
      query("processingState")
        .optional()
        .isIn(Object.values(RecordingProcessingState)),
      query("where").isJSON().optional(),
      integerOf(query("offset")).optional(),
      integerOf(query("limit")).optional(),
      query("order").isJSON().optional(),
      query("tags").isJSON().optional(),
      query("deleted").default(false).isBoolean().toBoolean(),
      query("exclusive").default(false).isBoolean().toBoolean(),
      query("tagMode")
        .optional()
        .custom((value) => {
          return models.Recording.isValidTagMode(value);
        }),
      query("filterModel").optional(),
      query("hideFiltered").default(false).isBoolean().toBoolean(),
      query("countAll").default(true).isBoolean().toBoolean(),
    ]),
    parseJSONField(query("order")),
    parseJSONField(query("where")),
    parseJSONField(query("tags")),
    async (request: Request, response: Response, next: NextFunction) => {
      const { viewAsSuperUser, tags = [], order, where = {} } = response.locals;
      const {
        tagMode,
        limit,
        offset,
        type,
        hideFiltered,
        countAll,
        exclusive,
        deleted,
        filterModel,
      } = request.query;

      if (request.query.hasOwnProperty("deleted")) {
        if (deleted) {
          where.deletedAt = { [Op.ne]: null };
        } else {
          where.deletedAt = { [Op.eq]: null };
        }
      }
      const useFilteredModel: string | false =
        (filterModel && (filterModel as string)) || false;

      if (
        type &&
        !Object.values(RecordingType).includes(type as RecordingType)
      ) {
        return next(
          new BadRequestError(`Invalid recording type '${type}' supplied`)
        );
      }
      // eslint-disable-next-line no-undef
      const result = await queryRecordings(
        models,
        response.locals.requestUser.id,
        type as RecordingType,
        Boolean(countAll),
        {
          viewAsSuperUser,
          where,
          tags,
          order,
          tagMode: tagMode as TagMode,
          limit: limit && parseInt(limit as string),
          offset: offset && parseInt(offset as string),
          hideFiltered: !!hideFiltered,
          exclusive: !!exclusive,
          filterModel: useFilteredModel,
        }
      );

      return successResponse(response, "Completed query.", {
        limit: request.query.limit,
        offset: request.query.offset,
        count: result.count,
        rows: result.rows.map(mapRecordingResponse),
      });
    }
  );

  /**
   * @api {delete} /api/v1/recordings Deletes Recordings based on query
   * @apiName QueryRecordings
   * @apiGroup Recordings
   *
   * @apiUse V1UserAuthorizationHeader
   * @apiQuery {String="user"} [view-mode] Allow a super-user to view as a
   * regular user
   * @apiQuery {Boolean} [exclusive=false] Include only top level tagged recording (not children)
   * @apiQuery {JSON} [order] Whether the recording should be ascending or descending in time
   * @apiInterface {apiQuery::RecordingProcessingState} [processingState] Current processing state of recordings
   * @apiInterface {apiQuery::RecordingType} [type] Type of recordings
   * @apiUse BaseQueryParams
   * @apiUse MoreQueryParams
   * @apiUse V1ResponseSuccessQuery
   * @apiUse V1ResponseError
   */
  app.delete(
    apiUrl,
    extractJwtAuthorizedUser,
    validateFields([
      query("view-mode").optional().equals("user"),
      query("type").optional().isIn(Object.values(RecordingType)),
      query("processingState")
        .optional()
        .isIn(Object.values(RecordingProcessingState)),
      query("where").isJSON().optional(),
      integerOf(query("offset")).optional(),
      integerOf(query("limit")).optional(),
      query("order").isJSON().optional(),
      query("tags").isJSON().optional(),
      query("exclusive").default(false).isBoolean().toBoolean(),
      query("tagMode")
        .optional()
        .custom((value) => {
          return models.Recording.isValidTagMode(value);
        }),
      query("hideFiltered").default(false).isBoolean().toBoolean(),
    ]),
    parseJSONField(query("order")),
    parseJSONField(query("where")),
    parseJSONField(query("tags")),
    async (request: Request, response: Response, next: NextFunction) => {
      const { viewAsSuperUser, tags = [], order, where = {} } = response.locals;
      const { tagMode, limit, offset, type, hideFiltered, exclusive } =
        request.query;
      const parsedLimit = limit ? parseInt(limit as string) : 1000;
      const limitInt = Math.min(parsedLimit, 1000);

      try {
        const values = await bulkDelete(
          models,
          response.locals.requestUser.id,
          type as RecordingType,
          {
            viewAsSuperUser,
            where,
            tags,
            order,
            tagMode: tagMode as TagMode,
            limit: limitInt,
            offset: offset && parseInt(offset as string),
            hideFiltered: !!hideFiltered,
            exclusive: !!exclusive,
            checkIsGroupAdmin: true,
          }
        );
        return successResponse(
          response,
          `Deleted Recordings: ${JSON.stringify(values)}`,
          { ids: values }
        );
      } catch (e) {
        log.error(e);
        return next(new ClientError(e.message));
      }
    }
  );

  /**
   * @api {patch} /api/v1/recordings/undelete Restores previously deleted Recordings.
   * @apiName UndeleteRecordings
   * @apiGroup Recordings
   *
   * @apiUse V1UserAuthorizationHeader
   * @apiBody {String[]} [ids] Array of recording ids to undelete
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.patch(
    `${apiUrl}/undelete`,
    extractJwtAuthorizedUser,
    validateFields([body("ids").isArray()]),
    parseJSONField(query("ids")),
    async (request: Request, response: Response, next: NextFunction) => {
      let { ids } = request.body;
      const { viewAsSuperUser } = response.locals;
      const userId = response.locals.requestUser.id;
      try {
        const requireGroupMembership = viewAsSuperUser
          ? []
          : [
              {
                model: models.User,
                attributes: [],
                required: true,
                where: { id: userId },
                through: { where: { admin: true } },
              },
            ];

        ids = (
          await models.Recording.findAll({
            where: {
              id: ids,
              deletedAt: { [Op.ne]: null },
            },
            include: [
              {
                model: models.Group,
                attributes: [],
                required: !viewAsSuperUser,
                include: requireGroupMembership,
              },
            ],
            attributes: ["id"],
          })
        ).map((r) => r.id);
        if (ids.length === 0) {
          return next(
            new ClientError(
              "No recordings to undelete",
              HttpStatusCode.Forbidden
            )
          );
        }

        await models.Recording.update(
          { deletedAt: null, deletedBy: null },
          { where: { id: ids } }
        );
        return successResponse(response, `Recordings Restored: ${ids}`);
      } catch (e) {
        log.error(e);
        return next(
          new ClientError(
            "Unable to restore recordings",
            HttpStatusCode.Unprocessable
          )
        );
      }
    }
  );

  if (config.server.loggerLevel === "debug") {
    app.get(
      `${apiUrl}/long-running-query`,
      extractJwtAuthorizedUser,
      validateFields([
        query("seconds").default(20).isNumeric(),
        query("succeed").default(true).isBoolean().toBoolean(),
      ]),
      async (request: Request, response: Response, _next: NextFunction) => {
        const timeout = Number(request.query.seconds);
        await new Promise((resolve, _reject) => {
          setTimeout(resolve, timeout * 1000);
        });
        if (request.query.succeed) {
          return successResponse(response, "Completed query.", { count: 101 });
        } else {
          return serverErrorResponse(
            request,
            response,
            new Error("Timed out."),
            { count: 101 }
          );
        }
      }
    );
  }

  /**
   * @api {get} /api/v1/recordings/count Query available recording count
   * @apiName QueryRecordingsCount
   * @apiGroup Recordings
   *
   * @apiUse V1UserAuthorizationHeader
   * @apiQuery {String="user"} [view-mode] Allow a super-user to view as a
   * regular user
   * @apiQuery {Boolean} [deleted=false] Include only deleted recordings
   * @apiQuery {Boolean} [checkIsGroupAdmin=false] Check if user is admin of group
   * @apiInterface {apiQuery::RecordingProcessingState} [processingState]
   * Current processing state of recordings
   * @apiInterface {apiQuery::RecordingType} [type] Type of recordings
   * @apiUse BaseQueryParams
   * @apiUse MoreQueryParams
   * @apiUse V1ResponseSuccessQuery
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/count`,
    extractJwtAuthorizedUser,
    validateFields([
      query("view-mode").optional().equals("user"),
      query("type").optional().isIn(Object.values(RecordingType)),
      query("processingState")
        .optional()
        .isIn(Object.values(RecordingProcessingState)),
      query("where").isJSON().optional(),
      integerOf(query("offset")).optional(),
      integerOf(query("limit")).optional(),
      query("order").isJSON().optional(),
      query("tags").isJSON().optional(),
      query("deleted").default(false).isBoolean().toBoolean(),
      query("exclusive").default(false).isBoolean().toBoolean(),
      query("checkIsGroupAdmin").default(true).isBoolean().toBoolean(),
      query("tagMode")
        .optional()
        .custom((value) => {
          return models.Recording.isValidTagMode(value);
        }),
      query("hideFiltered").default(false).isBoolean().toBoolean(),
      query("countAll").default(true).isBoolean().toBoolean(),
    ]),
    parseJSONField(query("order")),
    parseJSONField(query("where")),
    parseJSONField(query("tags")),
    async (request: Request, response: Response, next: NextFunction) => {
      const user = response.locals.requestUser;
      const { viewAsSuperUser, tags = [], order, where = {} } = response.locals;
      const {
        tagMode,
        limit,
        offset,
        type,
        hideFiltered,
        exclusive,
        checkIsGroupAdmin,
        deleted,
      } = request.query;
      if (
        type &&
        !Object.values(RecordingType).includes(type as RecordingType)
      ) {
        return next(
          new BadRequestError(`Invalid recording type '${type}' supplied`)
        );
      }
      const options = {
        viewAsSuperUser,
        where,
        tags,
        order,
        tagMode: tagMode as TagMode,
        limit: limit && parseInt(limit as string),
        offset: offset && parseInt(offset as string),
        hideFiltered: !!hideFiltered,
        exclusive: !!exclusive,
        checkIsGroupAdmin:
          response.locals.viewAsSuperUser && user.hasGlobalRead()
            ? false
            : !!checkIsGroupAdmin,
        includeAttributes: false,
      };
      if (request.query.hasOwnProperty("deleted")) {
        if (deleted) {
          options.where.deletedAt = { [Op.ne]: null };
        } else {
          options.where.deletedAt = { [Op.eq]: null };
        }
      }

      if (type && typeof options.where === "object") {
        options.where = { ...options.where, type };
      }
      const builder = await new models.Recording.queryBuilder().init(
        user.id,
        options
      );
      builder.query.distinct = true;
      try {
        const count = await models.Recording.count(builder.get());
        return successResponse(response, "Completed query.", { count });
      } catch (e) {
        log.error(e);
        return next(new ClientError(e.message));
      }
    }
  );

  /**
   * @api {get} /api/v1/recordings/needs-tag Get a random recording that needs
   * human tagging applied.
   * @apiName NeedsTag
   * @apiGroup Recordings
   * @apiDescription Parameters are as per GET /api/V1/recordings. On
   * success (status 200), the response body will contain JSON
   * formatted details of the selected recordings.
   *
   * @apiUse V1UserAuthorizationHeader
   * @apiParam {Integer} [deviceId] Optional deviceId to bias returned recording
   * to.
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/needs-tag`,
    extractJwtAuthorizedUser,
    validateFields([idOf(query("deviceId")).optional()]),
    async (request: Request, response: Response) => {
      // NOTE: We only return the minimum set of fields we need to play
      // back
      //  a recording, show tracks in the UI, and have the user add a tag.
      //  Generate a short-lived JWT token for each recording we return, keyed
      //  to that recording.  Only return a single recording at a time.

      let result;
      if (!request.query.deviceId) {
        result = await models.Recording.getRecordingWithUntaggedTracks();
      } else {
        // NOTE: Optionally, the returned recordings can be biased to be
        // from
        //  a preferred deviceId, to handle the case where we'd like a
        //  series of random recordings to tag constrained to a single
        //  device.
        result = await models.Recording.getRecordingWithUntaggedTracks(
          Number(request.query.deviceId)
        );
      }
      // FIXME - should be a mapped recording?
      return successResponse(response, "Completed query.", {
        rows: [result],
      });
    }
  );

  /**
   * @api {get} /api/v1/recordings/track-tags
   * Get all track tags for a particular type of recording (thermal/audio)
   * @apiName TrackTags
   * @apiGroup Tracks
   * @apiDescription On success (status 200), the response body will contain rows of track tags.
   *
   * @apiUse V1UserAuthorizationHeader
   * @apiQuery {apiQuery::RecordingType="thermalRaw"} [type] Type of recordings
   * @apiQuery {Boolean="false"} [includeAI] Include tags from AI
   * @apiQuery {String="user"} [view-mode] Allow a super-user to view as a regular user
   * @apiQuery {String[]} [exclude] Exclude the given tags from the query
   * @apiQuery {Number} [offset] Zero-based page number. Use '0' to get the first page.  Each page has 'limit' number of records.
   * @apiQuery {Number} [limit] Max number of records to be returned.
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {Object[]} rows List of track tags.
   * @apiSuccess {String} rows.label Name of the track tag.
   * @apiSuccess {String} rows.labeller Name of the user who created the track tag or AI.
   * @apiSuccess {Object} rows.group Group of the track tag.
   * @apiSuccess {String} rows.group.id Id of the group.
   * @apiSuccess {String} rows.group.name Name of the group.
   * @apiSuccess {String} rows.station Station of the track tag.
   * @apiSuccess {String} rows.station.id Id of the station.
   * @apiSuccess {String} rows.station.name Name of the station.
   * @apiSuccess {String} rows.device Device of the track tag.
   * @apiSuccess {String} rows.device.id Id of the device.
   * @apiSuccess {String} rows.device.name Name of the device.
   *
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/track-tags`,
    extractJwtAuthorizedUser,
    validateFields([
      query("exclude").default([]).optional().isArray(),
      query("includeAI").default(false).isBoolean(),
      integerOf(query("offset")).optional(),
      integerOf(query("limit").optional()),
      query("type")
        .default("thermalRaw")
        .optional()
        .isIn(Object.values(RecordingType)),
      query("view-mode").optional().equals("user"),
    ]),
    parseJSONField(query("exclude")),
    parseJSONField(query("includeAI")),
    async (request: Request, response: Response) => {
      const result = await getTrackTags(
        models,
        response.locals.requestUser.id,
        response.locals.viewAsSuperUser,
        Boolean(request.query.includeAI),
        request.query.type.toString(),
        response.locals.exclude,
        request.query.offset && parseInt(request.query.offset as string),
        request.query.limit && parseInt(request.query.limit as string)
      );
      return successResponse(response, "Completed query.", {
        rows: result,
      });
    }
  );

  /**
   * @api {get} /api/v1/recordings/report
   * Generate report for a set of recordings
   * @apiName Report
   * @apiGroup Recordings
   * @apiDescription Parameters are as per GET /api/V1/recordings. On
   * success (status 200), the response body will contain CSV
   * formatted details of the selected recordings.
   *
   * @apiUse V1UserAuthorizationHeader
   * @apiParam {String} [jwt] Signed JWT as produced by the
   * [Token](#api-Authentication-Token) endpoint
   * @apiParam {string} [type] Optional type of report either recordings or
   * visits. Recordings is default.
   * @apiUse BaseQueryParams
   * @apiUse RecordingOrder
   * @apiUse MoreQueryParams
   * @apiQuery {Boolean} [exclusive=false] Include only top level tagged recording (not children)
   * @apiParam {boolean} [audiobait] To add audiobait to a recording query set
   * this to true.
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/report`,
    extractJwtAuthorizedUser,
    validateFields([
      query("type").isString().optional().isIn(["recordings", "visits"]),
      query("where").isJSON().optional(),
      query("jwt").optional(),
      integerOf(query("offset")).optional(),
      integerOf(query("limit")).optional(),
      query("audiobait").isBoolean().optional(),
      query("order").isJSON().optional(),
      query("tags").isJSON().optional(),
      query("exclusive").default(false).isBoolean().toBoolean(),
      query("tagMode")
        .optional()
        .custom((value) => {
          return models.Recording.isValidTagMode(value);
        }),
      query("view-mode").optional().equals("user"),
      query("deleted").default(false).isBoolean().toBoolean(),
      // middleware.parseJSON("filterOptions", query).optional(),
    ]),
    parseJSONField(query("order")),
    parseJSONField(query("where")),
    parseJSONField(query("tags")),
    async (request: Request, response: Response) => {
      // FIXME - deprecate and generate report client-side from other
      // available API data.
      if (request.query.hasOwnProperty("deleted")) {
        if (request.query.deleted) {
          response.locals.where.deletedAt = { [Op.ne]: null };
        } else {
          response.locals.where.deletedAt = { [Op.eq]: null };
        }
      }

      // 10 minute timeout because the query can take a while to run
      // when the result set is large.
      const { viewAsSuperUser, where, order, tags = [] } = response.locals;
      const { tagMode, offset, limit, audioBait, exclusive } = request.query;
      const options = {
        viewAsSuperUser,
        where,
        tags,
        tagMode: tagMode as TagMode,
        offset: offset && parseInt(offset as string),
        limit: limit && parseInt(limit as string),
      };

      let rows;
      if (request.query.type == "visits") {
        rows = await reportVisits(
          models,
          response.locals.requestUser.id,
          options
        );
      } else {
        rows = await reportRecordings(
          models,
          response.locals.requestUser.id,
          Boolean(audioBait),
          {
            ...options,
            order,
            exclusive: Boolean(exclusive),
          }
        );
      }
      response.status(HttpStatusCode.Ok).set({
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=recordings.csv",
      });
      csv.writeToStream(response, rows);
    }
  );

  /**
   * @api {get} /api/v1/recordings/:id Get a recording
   * @apiName GetRecording
   * @apiGroup Recordings
   *
   * @apiUse MetaDataAndJWT
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   *
   * @apiParam {Integer} id Id of the recording to get.
   * @apiQuery {Boolean} [deleted=false] Whether or not to only include deleted
   * recordings.
   * @apiQuery {Boolean} [requires-signed-url=true] Whether or not to return a signed url with the recording data.
   * @apiSuccess {int} fileSize the number of bytes in recording file.
   * @apiSuccess {int} rawSize the number of bytes in raw recording file.
   * @apiSuccess {String} downloadFileJWT JSON Web Token to use to download the
   * recording file.
   * @apiSuccess {String} downloadRawJWT JSON Web Token to use to download
   * the raw recording data.
   * @apiInterface {apiSuccess::ApiRecordingResponseSuccess} recording The
   * recording data.
   *
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:id`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      query("deleted").default(false).isBoolean().toBoolean(),
      query("requires-signed-url").default(true).isBoolean().toBoolean(),
    ]),
    fetchAuthorizedRequiredRecordingById(param("id")),
    async (request: Request, response: Response) => {
      const recordingItem = response.locals.recording;
      const recording = mapRecordingResponse(response.locals.recording);
      if (request.query["requires-signed-url"]) {
        let rawJWT;
        let cookedJWT;
        let rawSize;
        let cookedSize;
        if (recordingItem.fileKey) {
          cookedJWT = signedToken(
            recordingItem.fileKey,
            recordingItem.getFileName(),
            recordingItem.fileMimeType,
            response.locals.requestUser.id,
            recordingItem.groupId
          );
          cookedSize =
            recordingItem.fileSize ||
            (await util.getS3ObjectFileSize(recordingItem.fileKey));
        }
        if (recordingItem.rawFileKey) {
          rawJWT = signedToken(
            recordingItem.rawFileKey,
            recordingItem.getRawFileName(),
            recordingItem.rawMimeType,
            response.locals.requestUser.id,
            recordingItem.GroupId
          );
          rawSize =
            recordingItem.rawFileSize ||
            (await util.getS3ObjectFileSize(recordingItem.rawFileKey));
        }
        return successResponse(response, {
          recording,
          rawSize: rawSize,
          fileSize: cookedSize,
          downloadFileJWT: cookedJWT,
          downloadRawJWT: rawJWT,
        });
      } else {
        return successResponse(response, {
          recording,
        });
      }
    }
  );

  /**
   * @api {get} /api/v1/recordings/track-tags/count Get track tag counts
   * @apiName GetTrackTagCounts
   * @apiGroup Tracks
   * @apiDescription Fetches track tag counts grouped by tag, group, station, and user.
   *                 Filters can be applied to narrow down the results.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam (Query) {String} [type=thermalRaw] Type of recordings (thermalRaw/audio).
   * @apiParam (Query) {Boolean} [includeAI=false] Include AI tags.
   * @apiParam (Query) {String} [view-mode] View mode. Allows a super-user to view as a regular user.
   * @apiParam (Query) {String[]} [exclude] Exclude specified tags.
   * @apiParam (Query) {Number} [offset] Zero-based page number. Use '0' to get the first page.
   * @apiParam (Query) {Number} [limit] Max number of records to be returned.
   * @apiParam (Query) {Number} [groupId] Optional group ID to filter results by a specific group.
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {Object[]} rows List of track tag counts.
   * @apiSuccess {String} rows.label Name of the track tag.
   * @apiSuccess {Number} rows.userId User ID of the user who tagged or AI.
   * @apiSuccess {Object} rows.group Group details.
   * @apiSuccess {Number} rows.group.id ID of the group.
   * @apiSuccess {String} rows.group.name Name of the group.
   * @apiSuccess {Object} rows.station Station details.
   * @apiSuccess {Number} rows.station.id ID of the station.
   * @apiSuccess {String} rows.station.name Name of the station.
   * @apiSuccess {Object} rows.device Device details.
   * @apiSuccess {Number} rows.device.id ID of the device.
   * @apiSuccess {String} rows.device.name Name of the device.
   *
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/track-tags/count`,
    extractJwtAuthorizedUser,
    validateFields([
      query("exclude").default([]).optional().isArray(),
      query("includeAI").default(false).isBoolean(),
      integerOf(query("offset")).optional(),
      integerOf(query("limit").optional()),
      query("type")
        .default("thermalRaw")
        .optional()
        .isIn(Object.values(RecordingType)),
      query("view-mode").optional().equals("user"),
      integerOf(query("groupId")).optional(), // Added validation for groupId
    ]),
    parseJSONField(query("exclude")),
    parseJSONField(query("includeAI")),
    async (request: Request, response: Response) => {
      const result = await getTrackTagsCount({
        models: models,
        userId: response.locals.requestUser.id,
        viewAsSuperUser: response.locals.viewAsSuperUser,
        includeAI: Boolean(request.query.includeAI),
        recordingType: request.query.type.toString() as RecordingType,
        exclude: response.locals.exclude,
        offset:
          request.query.offset && parseInt(request.query.offset as string),
        limit: request.query.limit && parseInt(request.query.limit as string),
        groupId:
          request.query.groupId && parseInt(request.query.groupId as string), // Added groupId
      });
      return successResponse(response, "Completed query.", {
        rows: result,
      });
    }
  );
  /**
   * @api {get} /api/v1/recordings/raw/:id Get a raw recording stream
   * @apiName GetRecordingRawFile
   * @apiGroup Recordings
   *
   * @apiUse MetaDataAndJWT
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   *
   * @apiParam {Integer} id Id of the recording to get.
   * @apiQuery {Boolean} [deleted=false] Whether or not to include deleted
   * recordings.
   * @apiSuccess {file} file Raw data stream of the file.
   *
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/raw/:id/:useArchival?`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      param("useArchival").optional(),
      query("deleted").default(false).isBoolean().toBoolean(),
    ]),
    fetchAuthorizedRequiredRecordingById(param("id")),
    async (request: Request, response: Response, next: NextFunction) => {
      // NOTE: If the recording type is trailcam, then actually want to return "derived" rather than "raw" files, unless
      //  the useArchival param is present
      const useArchival = request.params.useArchival === "archive";
      const recordingItem = response.locals.recording;
      let fileKey = recordingItem.rawFileKey;
      let fileMimeType = recordingItem.rawMimeType;
      let fileSize = recordingItem.rawFileSize;
      if (
        !useArchival &&
        (recordingItem.type === RecordingType.TrailCamImage ||
          recordingItem.type === RecordingType.TrailCamVideo)
      ) {
        fileKey = recordingItem.fileKey;
        fileMimeType = recordingItem.fileMimeType;
        fileSize = recordingItem.fileSize;
      }
      if (!fileKey) {
        return next(new ClientError("Recording has no raw file key."));
      }
      let fileExt: string = "raw";
      switch (fileMimeType) {
        case "audio/ogg":
          fileExt = "ogg";
          break;
        case "audio/wav":
          fileExt = "wav";
          break;
        case "audio/mp4":
          fileExt = "m4a";
          break;
        case "video/mp4":
          fileExt = "m4v";
          break;
        case "audio/mpeg":
          fileExt = "mp3";
          break;
        case "image/webp":
          fileExt = "webp";
          break;
        case "image/jpeg":
        case "image/jpg":
          fileExt = "jpg";
          break;
        case "application/x-cptv":
          fileExt = "cptv";
          break;
      }
      const time = recordingItem.recordingDateTime
        ?.toISOString()
        .replace(/:/g, "_")
        .replace(".", "_");
      const fileName = `${recordingItem.id}@${time}.${fileExt}`;

      if (config.server.isLocalDev && fileMimeType === "application/x-cptv") {
        const file = await fs.readFile("./debug-files/2-second-status.cptv");
        response.setHeader(
          "Content-disposition",
          "attachment; filename=" + fileName
        );
        response.setHeader(
          "Content-type",
          fileMimeType || "application/octet-stream"
        );
        response.setHeader("Content-Length", file.byteLength);
        response.write(file, "binary");
        return response.end(null, "binary");
      }
      return streamS3Object(
        request,
        response,
        fileKey,
        fileName,
        fileMimeType || "application/octet-stream",
        response.locals.requestUser.id,
        recordingItem.GroupId,
        fileSize
      );
    }
  );

  /**
   * @api {get} /api/v1/recordings/:id/thumbnail
   * Gets a thumbnail png for this recording
   * @apiName RecordingThumbnail
   * @apiGroup Recordings
   * @apiDescription Gets a thumbnail png for this recording in Viridis palette
   *
   * @apiParam {Integer} id Id of the recording to get the thumbnail for.
   * @apiParam {Integer} Optional trackId of recording to get thumbnail of.
   * @apiQuery {Boolean} [deleted=false] Whether or not to only include deleted
   * recordings.
   * @apiSuccess {file} file Raw data stream of the png.
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:id/thumbnail`,
    validateFields([
      idOf(param("id")),
      query("trackId").optional().isInt().toInt(),
      query("deleted").default(false).isBoolean().toBoolean(),
    ]),
    fetchUnauthorizedRequiredRecordingById(param("id")),
    async (request: Request, response: Response, next: NextFunction) => {
      const rec = response.locals.recording;
      const fileKey = rec.rawFileKey;
      let mimeType = "image/png";
      let ext = "png";
      if (
        rec.type === RecordingType.TrailCamVideo ||
        rec.type === RecordingType.TrailCamImage
      ) {
        mimeType = "image/webp";
        ext = "webp";
      }

      if (!fileKey) {
        return next(new ClientError("Rec has no raw file key."));
      }
      let trackId;
      let filename;
      if (request.query.trackId) {
        trackId = request.query.trackId as unknown as number;
        filename = `${rec.id}-${trackId}-thumb.${ext}`;
      } else {
        filename = `${rec.id}-thumb.${ext}`;
      }

      /*
      NOTE: Enable to serve a dummy thumbnail in debug mode - but will cause tests to fail.
      if (config.server.loggerLevel === "debug") {
        // Return a placeholder thumbnail in debug.
        const thumb = await fs.readFile("./debug-files/dummy-thumb.png");
        response.setHeader(
            "Content-disposition",
            "attachment; filename=" + filename
        );
        response.setHeader("Content-type", mimeType);
        response.setHeader("Content-Length", thumb.byteLength);
        response.write(thumb, "binary");
        return response.end(null, "binary");
      }
       */
      try {
        const data = await getThumbnail(rec, trackId);
        response.setHeader(
          "Content-disposition",
          "attachment; filename=" + filename
        );
        response.setHeader("Content-type", mimeType);
        response.setHeader("Content-Length", data.length);
        response.write(data, "binary");
        return response.end(null, "binary");
      } catch (err) {
        // FIXME - if the thumbnail doesn't exist, lets create it, even if the request takes a while.
        log.error(
          "Error getting thumbnail from s3 %s: %s",
          rec.id,
          err.message
        );
        return next(new ClientError("No thumbnail exists"));
      }
    }
  );

  /**
   * @api {delete} /api/v1/recordings/:id Delete an existing recording
   * @apiName DeleteRecording
   * @apiGroup Recordings
   *
   * @apiUse V1UserAuthorizationHeader
   * @apiParam {Integer} id Id of the recording to delete.
   * @apiQuery {Boolean} [soft-delete=true] Pass false to actually permanently
   * delete this recording, otherwise by default it will just be marked as
   * deleted and hidden from the UI.
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.delete(
    `${apiUrl}/:id`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      query("soft-delete").default(true).isBoolean().toBoolean(),
    ]),
    fetchAuthorizedRequiredRecordingById(param("id")),
    async (request: Request, response: Response) => {
      // FIXME - If this is the *last* recording for a station, and the station is automatic, remove the station,
      //  and the corresponding DeviceHistory entry. (Do we need to worry about undelete then?)
      let softDelete = false;
      const recording: Recording = response.locals.recording;
      if (request.query["soft-delete"]) {
        recording.deletedAt = new Date();
        recording.deletedBy = response.locals.requestUser.id;
        await recording.save();
        softDelete = true;
      } else {
        let deleted = false;
        const rawFileKey = recording.rawFileKey;
        const fileKey = recording.fileKey;
        const thumbKey = `${rawFileKey}-thumb`;
        try {
          await recording.destroy({ force: true });
          deleted = true;
        } catch (e) {
          // ..
        }
        if (deleted && rawFileKey) {
          await util.deleteS3Object(rawFileKey).catch((err) => {
            log.warning(err);
          });
        }
        if (deleted && fileKey) {
          await util.deleteS3Object(fileKey).catch((err) => {
            log.warning(err);
          });
        }
        if (deleted && thumbKey) {
          // TODO: There can be other thumbnails related to appending tracks, and we should probably delete those too.
          await util.deleteS3Object(thumbKey).catch((err) => {
            log.warning(err);
          });
        }
      }
      // Check if there are any more device recordings.  If not, set lastRecordingTime to null,
      // so that the device will appear as deletable.
      const latestRecording = await models.Recording.findOne({
        where: { DeviceId: recording.DeviceId, deletedAt: null },
        order: [["recordingDateTime", "DESC"]],
      });
      const device = recording.Device;
      if (!latestRecording) {
        await device.update({
          lastRecordingTime: null,
        });
      } else if (latestRecording.recordingDateTime > device.lastRecordingTime) {
        await device.update({
          lastRecordingTime: latestRecording.recordingDateTime,
        });
      }
      if (softDelete) {
        return successResponse(response, "Deleted recording.");
      } else {
        return successResponse(response, "Hard deleted recording.");
      }
    }
  );

  /**
   * @api {patch} /api/v1/recordings/:id Update an existing recording
   * @apiName UpdateRecording
   * @apiGroup Recordings
   * @apiDescription This call is used for updating some selected fields of a previously
   * submitted recording.
   *
   * @apiUse V1UserAuthorizationHeader

   * @apiParam {Integer} id Id of the recording to update.
   * @apiBody {JSON} [updates] Data containg attributes for tag.
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.patch(
    `${apiUrl}/:id`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      body("updates").custom(jsonSchemaOf(ApiRecordingUpdateRequestSchema)),
    ]),
    fetchAuthorizedRequiredRecordingById(param("id")),
    parseJSONField(body("updates")),
    async (request: Request, response: Response) => {
      await response.locals.recording.update(
        response.locals.updates as ApiRecordingUpdateRequest
      );
      return successResponse(response, "Updated recording.");
    }
  );

  /**
   * @api {patch} /api/v1/recordings/:id/undelete
   * Undelete an existing soft-deleted recording
   * @apiName UndeleteRecording
   * @apiGroup Recordings
   * @apiDescription This call is used for updating deletedAt and deletedBy
   fields of a previously
   * soft-deleted recording.
   *
   * @apiUse V1UserAuthorizationHeader

   * @apiParam {Integer} id Id of the recording to undelete.
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.patch(
    `${apiUrl}/:id/undelete`,
    extractJwtAuthorizedUser,
    validateFields([idOf(param("id"))]),
    (request: Request, response: Response, next: NextFunction) => {
      // Make sure we restrict this to deleted recordings
      response.locals.deleted = true;
      next();
    },
    fetchAuthorizedRequiredRecordingById(param("id")),
    async (request: Request, response: Response) => {
      const recording = response.locals.recording;
      await recording.update({
        deletedAt: null,
        deletedBy: null,
      });
      const device = await models.Device.findByPk(recording.DeviceId);
      if (
        (device && device.lastRecordingTime === null) ||
        recording.recordingDateTime > device.lastRecordingTime
      ) {
        await device.update({ lastRecordingTime: recording.recordingDateTime });
      }
      return successResponse(response, "Undeleted recording.");
    }
  );

  /**
   * @api {post} /api/v1/recordings/:id/tracks
   * Add new track to recording
   * @apiName PostTrack
   * @apiGroup Tracks
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Integer} id Id of the recording to add the track to.
   *
   * @apiBody {JSON} data Data which defines the track (type specific).
   * @apiBody {JSON} [algorithm] Description of algorithm that generated track
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {Integer} trackId Unique id of the newly created track.
   * @apiSuccess {Integer} algorithmId Id of tracking algorithm used
   *
   * @apiUse V1ResponseError
   */
  app.post(
    `${apiUrl}/:id/tracks`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      body("data").custom(jsonSchemaOf(ApiTrackDataRequestSchema)),
      anyOf(
        body("algorithm").isJSON().optional(),
        body("algorithm").isArray().optional()
      ),
    ]),
    parseJSONField(body("data")),
    parseJSONField(body("algorithm")),
    fetchAuthorizedRequiredRecordingById(param("id")),
    async (_request: Request, response: Response) => {
      const algorithm = response.locals.algorithm
        ? response.locals.algorithm
        : "{'status': 'User added.'}";
      const algorithmDetail = await models.DetailSnapshot.getOrCreateMatching(
        "algorithm",
        algorithm
      );
      const data = {
        userId: response.locals.requestUser.id,
        ...response.locals.data,
      };
      let trackId: TrackId = 1;
      let algorithmId: number = 1;

      const deviceId = response.locals.recording.DeviceId;
      const groupId = response.locals.recording.GroupId;
      const atTime = response.locals.recording.recordingDateTime;
      const positions = data.positions;
      let discardMaskedTrack = false;
      if (positions) {
        discardMaskedTrack = await trackIsMasked(
          models,
          deviceId,
          groupId,
          atTime,
          positions
        );
      }
      if (!discardMaskedTrack) {
        const track = await response.locals.recording.createTrack({
          data,
          AlgorithmId: algorithmDetail.id,
        });
        await track.updateIsFiltered();
        trackId = track.id;
        algorithmId = track.AlgorithmId;
      }
      // If it gets filtered out, we can just give it a trackId of 1, and then just not do anything when you try to add
      // trackTags to tag id 1.
      return successResponse(response, "Track added.", {
        trackId,
        algorithmId,
      });
    }
  );

  /**
   * @api {get} /api/v1/recordings/:id/tracks
   * Get tracks for recording
   * @apiName GetTracks
   * @apiGroup Tracks
   * @apiDescription Get all tracks for a given recording and their tags.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Integer} id Id of the recording
   *
   * @apiUse V1ResponseSuccess
   * @apiInterface {apiSuccess::ApiTracksResponseSuccess} tracks
   *
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:id/tracks`,
    extractJwtAuthorizedUser,
    validateFields([idOf(param("id"))]),
    fetchAuthorizedRequiredRecordingById(param("id")),
    async (request: Request, response: Response) => {
      const tracks =
        await response.locals.recording.getActiveTracksTagsAndTagger();
      return successResponse(response, "OK.", { tracks: mapTracks(tracks) });
    }
  );

  /**
   * @api {get} /api/v1/recordings/:id/tracks/:trackId
   * Get track for recording
   * @apiName GetTrack
   * @apiGroup Tracks
   * @apiDescription Get track for a given recording and track id.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Integer} id Id of the recording
   * @apiParam {Integer} trackId Id of the track
   *
   * @apiUse V1ResponseSuccess
   * @apiInterface {apiSuccess::ApiTrackResponseSuccess} tracks
   *
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:id/tracks/:trackId`,
    extractJwtAuthorizedUser,
    validateFields([idOf(param("id")), idOf(param("trackId"))]),
    fetchAuthorizedRequiredRecordingById(param("id")),
    fetchUnauthorizedRequiredTrackById(param("trackId")),
    async (request: Request, response: Response) => {
      const track = await response.locals.recording.getTrack(
        request.params.trackId
      );
      return successResponse(response, "OK.", {
        track: mapTrack(track),
      });
    }
  );

  /**
   * @api {delete} /api/v1/recordings/:id/tracks/:trackId
   * Remove track from recording
   * @apiName DeleteTrack
   * @apiGroup Tracks
   *
   * @apiParam {Integer} id Id of the recording
   * @apiParam {Integer} trackId id of the recording track to remove
   * @apiQuery {Boolean} [soft-delete=true] Pass false to actually permanently
   * delete this recording, otherwise by default it will just be marked as
   * deleted and hidden from the UI.
   *
   * @apiUse V1UserAuthorizationHeader
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.delete(
    `${apiUrl}/:id/tracks/:trackId`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      idOf(param("trackId")),
      query("soft-delete").default(false).isBoolean().toBoolean(),
    ]),
    fetchAuthorizedRequiredRecordingById(param("id")),
    fetchUnauthorizedRequiredTrackById(param("trackId")),
    async (request: Request, response: Response, next: NextFunction) => {
      // Make sure the track belongs to the recording (this could
      // probably be one query)
      if (
        (response.locals.track as Track).RecordingId ===
        response.locals.recording.id
      ) {
        if (request.query["soft-delete"]) {
          await response.locals.track.archive();
        } else {
          await response.locals.track.destroy();
        }
        return successResponse(response, "Track deleted.");
      } else {
        return next(new ClientError("No such track."));
      }
    }
  );

  const replaceTrackTagParams = [
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      idOf(param("trackId")),
      stringOf(body("what")),
      body("confidence").isFloat().toFloat(),
      body("automatic").isBoolean().toBoolean(),
      body("data").isJSON().optional(),
    ]),
    fetchAuthorizedRequiredRecordingById(param("id")),
    fetchUnauthorizedRequiredTrackById(param("trackId")),
    parseJSONField(body("data")),
    async (request: Request, response: Response, next: NextFunction) => {
      // Make sure track actually belongs to the recording we have permissions for.
      if (response.locals.track.RecordingId === response.locals.recording.id) {
        return next();
      } else {
        return next(
          new FatalError("Track does not belong to specified recording")
        );
      }
    },
    async (request: Request, response: Response, next: NextFunction) => {
      const requestUser = response.locals.requestUser;
      if (request.body.what === "unknown") {
        request.body.what = "unidentified";
      }
      const path =
        request.body.what in LabelPaths ? LabelPaths[request.body.what] : null;
      const newTag = models.TrackTag.build({
        what: request.body.what,
        confidence: request.body.confidence,
        automatic: request.body.automatic,
        data: response.locals.data || "",
        UserId: requestUser.id,
        TrackId: response.locals.track.id,
        path,
        used: true,
      }) as TrackTag;
      try {
        const tag = await response.locals.track.replaceTag(newTag);
        if (tag) {
          return successResponse(response, "Track tag added.", {
            trackTagId: tag.id,
          });
        } else {
          // FIXME - should probably not be success
          return successResponse(response, "Tag already exists.");
        }
      } catch (e) {
        return next(new FatalError("Server error replacing tag."));
      }
    },
  ];

  /**
   * @api {post} /api/v1/recordings/:id/tracks/:trackId/replace-tag
   * Adds/Replaces a Track Tag
   * @apiDescription Adds or Replaces track tag based off:
   * if tag already exists for this user, ignore request
   * Add tag if it is an additional tag e.g. :Part
   * Add tag if this user hasn't already tagged this track
   * Replace existing tag, if user has an existing animal tag
   * @apiName PostTrackTag
   * @apiGroup Tracks
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Integer} id Id of the recording
   * @apiParam {Integer} trackId id of the recording track to tag
   *
   * @apiBody {String} what Object/event to tag.
   * @apiBody {Number} confidence Tag confidence score.
   * @apiBody {Boolean} automatic "true" if tag is machine generated, "false"
   * otherwise.
   * @apiBody {JSON} [data] Data Additional tag data.
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {int} trackTagId Unique id of the newly created track tag.
   *
   * @apiUse V1ResponseError
   */
  app.post(
    `${apiUrl}/:id/tracks/:trackId/replace-tag`,
    ...replaceTrackTagParams
  );

  app.post(
    `${apiUrl}/:id/tracks/:trackId/replaceTag`,
    ...replaceTrackTagParams
  );

  /**
   * @api {patch} /api/v1/recordings/:id/tracks/:trackId/update-data
   * Updates a Track's Data
   * @apiDescription Updates the "data" column of the specified track.
   * @apiName PutTrackData
   * @apiGroup Tracks
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Integer} id Id of the recording
   * @apiParam {Integer} trackId Id of the recording track to update
   *
   * @apiInterface {apiBody::ApiTrackDataRequest} data Object containing the
   * new data object to replace the existing one.
   * @apiBody {JSON} data The new data object to replace the existing one.
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {String} message Success message.
   *
   * @apiUse V1ResponseError
   */
  app.patch(
    `${apiUrl}/:id/tracks/:trackId/update-data`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      idOf(param("trackId")),
      body("data").custom(jsonSchemaOf(ApiTrackDataRequestSchema)),
    ]),
    fetchAuthorizedRequiredRecordingById(param("id")),
    fetchUnauthorizedRequiredTrackById(param("trackId")),
    async (request: Request, response: Response, next: NextFunction) => {
      if (response.locals.track.RecordingId === response.locals.recording.id) {
        try {
          const track: Track = response.locals.track;

          await track.update({
            data: { ...track.data, ...request.body.data },
          });
          return successResponse(response, "Track data updated.");
        } catch (e) {
          return next(
            new FatalError(`Server error updating track data: ${e.toString()}`)
          );
        }
      } else {
        return next(
          new FatalError("Track does not belong to specified recording")
        );
      }
    }
  );

  /**
   * @api {patch} /api/v1/recordings/:id/tracks/:trackId/tags/:tagId
   * Updates a Track Tag with new request body
   * @apiDescription Adds or Replaces track tag based off:
   * if tag already exists for this user, ignore request
   * Add tag if it is an additional tag e.g. :Part"
   * Add tag if this user hasn't already tagged this track
   * Replace existing tag, if user has an existing animal tag
   * @apiName PatchTrackTag
   * @apiGroup Tracks
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Integer} id Id of the recording
   * @apiParam {Integer} trackId id of the recording track to tag
   * @apiParam {Integer} tagId id of the track tag
   *
   * @apiInterface {apiBody::ApiRecordingUpdateRequestBody} updates Object
   * containing the fields to update and their new values.
   * @apiBody {JSON} [updates] Data containing attributes for tag.
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {int} trackTagId Unique id of the newly created track tag.
   *
   * @apiUse V1ResponseError
   */
  app.patch(
    `${apiUrl}/:id/tracks/:trackId/tags/:tagId`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      idOf(param("trackId")),
      idOf(param("tagId")),
      body("updates").custom(jsonSchemaOf(ApiTrackTagAttributesSchema)),
    ]),
    fetchAuthorizedRequiredRecordingById(param("id")),
    fetchUnauthorizedRequiredTrackById(param("trackId")),
    parseJSONField(body("data")),
    // FIXME - extract valid track for trackId on recording with id
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        await response.locals.track.updateTag(
          request.params.tagId,
          request.body.updates
        );
        return successResponse(response, "Tag has been updated.");
      } catch (e) {
        return next(new FatalError("Server error replacing tag."));
      }
    }
  );

  /**
   * @api {patch} /api/v1/recordings/:id/tracks/:trackId/undelete
   * Undelete an existing soft-deleted track
   * @apiName UndeleteTrack
   * @apiGroup Recordings
   * @apiDescription This call is used for updating archived of a previously
   * soft-deleted track.
   *
   * @apiUse V1UserAuthorizationHeader

   * @apiParam {Integer} id Id of the recording.
   * @apiParam {Integer} trackId id of the recording track to undelete.
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.patch(
    `${apiUrl}/:id/tracks/:trackId/undelete`,
    extractJwtAuthorizedUser,
    validateFields([idOf(param("id")), idOf(param("trackId"))]),
    fetchAuthorizedRequiredRecordingById(param("id")),
    fetchUnauthorizedRequiredTrackById(param("trackId")),
    async (request: Request, response: Response) => {
      await response.locals.track.unarchive();
      return successResponse(response, "Undeleted track.");
    }
  );

  /**
   * @api {post} /api/v1/recordings/:id/tracks/:trackId/tags
   * Add tag to track
   * @apiName PostTrackTag
   * @apiGroup Tracks
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Integer} id Id of the recording
   * @apiParam {Integer} trackId id of the recording track to tag
   *
   * @apiBody {String} what Object/event to tag.
   * @apiBody {Number} confidence Tag confidence score.
   * @apiBody {Boolean} automatic "true" if tag is machine generated, "false"
   * otherwise.
   * @apiBody {String} [tagJWT] JWT token to tag a recording/track that the user
   * would not otherwise have permission to view.
   * @apiBody {JSON} [data] Data Additional tag data.
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {int} trackTagId Unique id of the newly created track tag.
   *
   * @apiUse V1ResponseError
   */
  app.post(
    `${apiUrl}/:id/tracks/:trackId/tags`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      idOf(param("trackId")),
      stringOf(body("what")),
      body("confidence").isFloat().toFloat(),
      booleanOf(body("automatic")),
      body("tagJWT").optional().isString(),
      anyOf(
        body("data").isJSON().optional(),
        body("data").isObject().optional()
      ),
    ]),
    // FIXME - JSON schema for allowed data? At least a limit to how many
    // chars etc?
    parseJSONField(body("data")),
    async (request: Request, response: Response, next: NextFunction) => {
      if (request.body.tagJWT) {
        return next();
      } else {
        await fetchAuthorizedRequiredRecordingById(param("id"))(
          request,
          response,
          next
        );
      }
    },
    async (request: Request, response: Response, next: NextFunction) => {
      let track;

      if (Number(request.params.trackId) === 1 && request.body.automatic) {
        // NOTE: Dummy track that was masked out by mask regions.
        // Just succeed here so that processing doesn't break when trying to add tags.
        return successResponse(response, "Track tag added.", {
          trackTagId: 1,
        });
      }

      if (request.body.tagJWT) {
        // If there's a tagJWT, then we don't need to check the users'
        // recording update permissions.
        const tagJWT = request.body.tagJWT;
        try {
          const jwtDecoded = jwt.verify(
            tagJWT,
            config.server.passportSecret
          ) as JwtPayload;
          if (
            jwtDecoded._type === "tagPermission" &&
            jwtDecoded.recordingId === request.params.id
          ) {
            track = await models.Track.findByPk(request.params.trackId);
          } else {
            return next(
              new AuthorizationError(
                "JWT does not have permissions to tag this recording"
              )
            );
          }
        } catch (e) {
          return next(new AuthorizationError("Failed to verify JWT."));
        }
      } else {
        // Otherwise, just check that the user can update this track.
        track = await response.locals.recording.getTrack(
          request.params.trackId
        );
      }
      if (!track) {
        return next(new ClientError("Track does not exist"));
      }
      // Ensure track belongs to this recording.
      if (track.RecordingId !== request.params.id) {
        return next(new ClientError("Track does not belong to recording"));
      }
      if (request.body.what === "unknown") {
        request.body.what = "unidentified";
      }
      const tag = await track.addTag(
        request.body.what,
        request.body.confidence,
        request.body.automatic,
        response.locals.data || "",
        response.locals.requestUser.id
      );
      return successResponse(response, "Track tag added.", {
        trackTagId: tag.id,
      });
    }
  );

  /**
   * @api {delete} /api/v1/recordings/:id/tracks/:trackId/tags/:trackTagId
   * Delete a track tag
   * @apiName DeleteTrackTag
   * @apiGroup Tracks
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.delete(
    `${apiUrl}/:id/tracks/:trackId/tags/:trackTagId`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      idOf(param("trackId")),
      idOf(param("trackTagId")),
      query("tagJWT").isString().optional(),
    ]),
    fetchAuthorizedRequiredRecordingById(param("id")),
    async (request: Request, response: Response, next: NextFunction) => {
      let track;
      if (request.query.tagJWT) {
        // If there's a tagJWT, then we don't need to check the users'
        // recording update permissions.
        const tagJWT = request.query.tagJWT as string;
        try {
          const jwtDecoded = jwt.verify(
            tagJWT,
            config.server.passportSecret
          ) as JwtPayload;
          if (
            jwtDecoded._type === "tagPermission" &&
            jwtDecoded.recordingId === request.params.id
          ) {
            track = await models.Track.findByPk(request.params.trackId);
          } else {
            return next(
              new AuthorizationError(
                "JWT does not have permissions to tag this recording"
              )
            );
          }
        } catch (e) {
          return next(new AuthorizationError("Failed to verify JWT."));
        }
      } else {
        // FIXME - fetch in middleware
        // Otherwise, just check that the user can update this track.
        track = await response.locals.recording.getTrack(
          request.params.trackId
        );
      }
      if (!track) {
        return next(new AuthorizationError("Track does not exist"));
      }
      // Ensure track belongs to this recording.
      if (track.RecordingId !== request.params.id) {
        return next(
          new AuthorizationError("Track does not belong to recording")
        );
      }

      const tag = await track.getTrackTag(request.params.trackTagId);
      if (!tag) {
        return next(new AuthorizationError("No such track tag."));
      }

      await tag.destroy();
      await track.updateIsFiltered();
      return successResponse(response, "Track tag deleted.");
    }
  );

  /**
   * @api {delete} /api/v1/recordings/:id/tags/:tagId
   * Delete an existing recording tag
   * @apiName DeleteRecordingTag
   * @apiGroup Recordings
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.delete(
    `${apiUrl}/:id/tags/:tagId`,
    extractJwtAuthorizedUser,
    validateFields([idOf(param("id")), idOf(param("tagId"))]),
    fetchAuthorizedRequiredRecordingById(param("id")),
    fetchUnauthorizedRequiredRecordingTagById(param("tagId")),
    async (request: Request, response: Response) => {
      await response.locals.tag.destroy();
      return successResponse(response, "Deleted tag.");
    }
  );

  /**
   * @api {post} /api/v1/recordings/:id/tags
   * Add a new recording tag
   * @apiName AddRecordingTag
   * @apiGroup Recordings
   *
   * @apiUse V1UserAuthorizationHeader
   * @apiParam {Integer} id Recording id to add tag to
   * @apiInterface {apiBody::ApiRecordingTagRequestBody} tag
   *
   * @apiSuccess {Integer} tagId id of the newly created tag
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.post(
    `${apiUrl}/:id/tags`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      body("tag")
        .exists()
        .withMessage(expectedTypeOf("ApiRecordingTagRequest"))
        .bail()
        .custom(jsonSchemaOf(ApiRecordingTagRequestSchema)),
    ]),
    fetchAuthorizedRequiredRecordingById(param("id")),
    parseJSONField(body("tag")),
    async (request: Request, response: Response) => {
      const tagInstance = await addTag(
        models,
        response.locals.requestUser,
        response.locals.recording,
        response.locals.tag
      );
      return successResponse(response, "Added new tag.", {
        tagId: tagInstance.id,
      });
    }
  );

  app.get(
    `${apiUrl}/for-project/:projectId`,
    //extractJwtAuthorizedUser,
    validateFields([
      idOf(param("projectId")),
      query("view-mode").optional().equals("user"),
      query("tagged-with").optional().toArray().isArray({ min: 1 }),
      query("labelled-with").optional().toArray().isArray({ min: 1 }),
      query("from").optional().isISO8601().toDate(),
      query("until").optional().isISO8601().toDate(),
      query("debug").optional(),
      query("duration")
        .default(2.5)
        .isFloat()
        .toFloat()
        .withMessage(expectedTypeOf("float")),
      query("include-false-positives").default(false).isBoolean().toBoolean(),
      query("devices")
        .optional()
        .toArray()
        .isArray({ min: 1 })
        .custom(isIntArray)
        .withMessage(
          "Must be an id, or an array of ids.  For example, '32' or '[32, 33, 34]'"
        ),
      query("sub-class-tags").default(true).isBoolean().toBoolean(),
      query("tag-mode")
        .default(TagMode.Any)
        .isString()
        .custom((value: string) => {
          const allowedTagModes = [
            TagMode.Any,
            TagMode.UnTagged,
            TagMode.Tagged,
          ];
          const invalidTagMode = !allowedTagModes.includes(value as TagMode);
          if (invalidTagMode) {
            throw new Error(format("Invalid tag mode '%s'.", invalidTagMode));
          }
          return true;
        }),
      query("locations")
        .optional()
        .toArray()
        .isArray({ min: 1 })
        .custom(isIntArray)
        .withMessage(
          "Must be an id, or an array of ids.  For example, '32' or '[32, 33, 34]'"
        ),
      query("types")
        .optional()
        .toArray()
        .isArray({ min: 1 })
        .custom((value: any[]) => {
          const allowedTypes = Object.values(RecordingType);
          const invalidTypes = value.filter(
            (type) => !allowedTypes.includes(type)
          );
          if (invalidTypes.length) {
            throw new Error(
              format(
                "Invalid recording type(s) '%s'.",
                invalidTypes.join("', '")
              )
            );
          }
          return true;
        }),
    ]),
    //fetchAuthorizedRequiredGroupByNameOrId(param("projectId")),
    fetchUnauthorizedRequiredGroupByNameOrId(param("projectId")),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = request.query;
        const queryJSON = JSON.stringify(query, null, "\t");
        const hasTimeBound = query.from && query.until;
        const taggedWith = (query["tagged-with"] as string[]) || [];
        const labelledWith = (query["labelled-with"] as string[]) || [];
        const timeBound = {
          [Op.and]: [
            { [Op.gte]: query.from || new Date() },
            { [Op.lt]: query.until || new Date() },
          ],
        };
        const recordingsWhere: any = {
          deletedAt: { [Op.eq]: null },
          GroupId: response.locals.group.id,
          redacted: false,
          duration: { [Op.gte]: query.duration },
          [Op.and]: [],
        };
        if (query.types) {
          recordingsWhere.type = { [Op.in]: query.types };
        }
        if (query.devices && query.devices.length) {
          recordingsWhere.DeviceId = { [Op.in]: query.devices };
        }
        if (query.locations && query.locations.length) {
          recordingsWhere.StationId = { [Op.in]: query.locations };
        }
        if (hasTimeBound) {
          recordingsWhere.recordingDateTime = timeBound;
        }
        const tagged =
          query["tag-mode"] !== TagMode.UnTagged;
        const labelled = labelledWith.length !== 0;
        if (!tagged) {
          recordingsWhere[Op.and].push({
            [Op.or]: [
              sequelize.where(sequelize.col('"Tracks".id'), Op.eq, null),
              sequelize.where(
                sequelize.col('"Tracks->TrackTags".id'),
                Op.eq,
                null
              ),
            ],
          });
        } else if (taggedWith.length !== 0) {
          // TODO: Should we include other tag modes for completeness vs old API?
          // TagMode any or Tagged.
          recordingsWhere[Op.and].push({
            [Op.or]: [
              sequelize.where(sequelize.col('"Tracks->TrackTags".what'), {
                [Op.in]: taggedWith,
              }),
              ...(query["sub-class-tags"]
                ? taggedWith.map((tag) =>
                    sequelize.where(
                      sequelize.col('"Tracks->TrackTags".path'),
                      "~",
                      `*.${tag}.*`
                    )
                  )
                : []),
            ],
          });
        }
        if (labelled) {
          recordingsWhere[Op.and].push(
            sequelize.where(sequelize.col('"Tags".detail'), {
              [Op.in]: labelledWith,
            })
          );
        }

        // TODO: We want to return other trackTags, not just the ones that match the search
        //  HMM: This could be a challenge, how do you do this without sub-queries?  Maybe you don't, you just query again
        //  with recordingId in (set).  Should still be fast.
        const includeFilteredTracks =
          query["tag-mode"] === TagMode.Any && query["include-false-positives"]
            ? undefined
            : !tagged;
        const getInclude = (getAttributes: boolean) => {
          const include = [
          {
            model: models.Tag,
            attributes: getAttributes
              ? ["detail", "taggerId", "id", "comment", "createdAt"]
              : [],
            required: labelled,
          },
          {
            model: models.Track,
            // TODO: Don't include all the jsonb track data i.e positions
            attributes: getAttributes ? ["id", "data"] : [],
            required: tagged,
            where: {
              archivedAt: {
                [Op.is]: null,
              },
              // TODO: Check this gets removed from SQL in the case of include-false-positives
              // Filter false positives should not function when we have tags specified, right?
              // FIXME: Or track is null
              // trackInclude.where[Op.or] = {
              //   TrackId: { [Op.is]: null },
              // };
              filtered: includeFilteredTracks,
            },
            include: [
              {
                model: models.TrackTag,
                attributes: getAttributes
                  ? [
                      "what",
                      "path",
                      "UserId",
                      "id",
                      "automatic",
                    ]
                  : [],
                subQuery: false,
                required: tagged,
                include: getAttributes
                  ? [{ model: models.User, attributes: ["userName"] }]
                  : [],
                where: {
                  used: true,
                  archivedAt: {
                    [Op.is]: null,
                  },
                },
              },
            ],
          },
        ];
          if (getAttributes) {
            (include as any[]).push( { model: models.Station, attributes: getAttributes ? ["name"] : [] },
                {
                  model: models.Group,
                  attributes: getAttributes ? ["groupName"] : [],
                },
                {
                  model: models.Device,
                  attributes: getAttributes ? ["deviceName"] : [],
            });
          }
          return include;
        };

        let sqlFirstPass = "";
        let sqlSecondPass = "";
        let timingFirstPass = 0;
        let timingSecondPass = 0;
        const now = performance.now();

        // TODO: Only load thumbnails when recordings come into view in the browse UI.

        // TODO: If the limit is important, it seems like we could just query again here with adjusted date range
        //  until we get the number of records we're looking for?
        const { rows: recordings, count } =
          await models.Recording.findAndCountAll({
            where: recordingsWhere,
            limit: 200,
            include: getInclude(false),
            // NOTE: Turning off sub-queries here and forcing an inner join is important, as it makes queries > 10X faster.
            // Also note that this means we won't get back our `limit` recordings but it's better to do lots of smaller
            // fast incremental date range queries on the front-end rather than blocking on longer queries.
            subQuery: false,
            attributes: ["id"],
            order: [["recordingDateTime", "desc"]],
            logging: (message, time) => {
              const store = asyncLocalStorage.getStore() as Map<string, any>;
              const dbQueryCount = store?.get("queryCount");
              const dbQueryTime = store?.get("queryTime");
              store?.set("queryCount", dbQueryCount + 1);
              store?.set("queryTime", dbQueryTime + time);
              sqlFirstPass = sqlFormat(
                message.replace("Executed (default): ", ""),
                {
                  language: "postgresql",
                }
              );
              timingFirstPass = time;
            },
          } as any);
        const recordingIds = recordings.map(({ id }) => id);
        // Now get all the recordings in the date range
        const fullRecordings = await models.Recording.findAll({
          where: {
            id: { [Op.in]: recordingIds },
          },
          include: getInclude(true),
          // NOTE: Turning off sub-queries here and forcing an inner join is important, as it makes queries > 10X faster.
          // Also note that this means we won't get back our `limit` recordings but it's better to do lots of smaller
          // fast incremental date range queries on the front-end rather than blocking on longer queries.
          subQuery: false,
          attributes: [
            "id",
            "recordingDateTime",
            "DeviceId",
            "duration",
            "location",
            "GroupId",
            "processingState",
            "StationId",
            "type",
          ],
          order: [["recordingDateTime", "desc"]],
          logging: (message, time) => {
            const store = asyncLocalStorage.getStore() as Map<string, any>;
            const dbQueryCount = store?.get("queryCount");
            const dbQueryTime = store?.get("queryTime");
            store?.set("queryCount", dbQueryCount + 1);
            store?.set("queryTime", dbQueryTime + time);
            sqlSecondPass = sqlFormat(
              message.replace("Executed (default): ", ""),
              {
                language: "postgresql",
              }
            );
            timingSecondPass = time;
          },
        });
        const recs = fullRecordings.map(mapRecordingResponse);
        console.log(recs);
        const sequelizeTime = performance.now() - now;
        if (!query.debug) {
          return successResponse(response, "Got recordings", {
            recordings: recs,
            count,
          });
        } else {
          return response.status(200).send(`
          <!DOCTYPE html>
          <body style="background-color: black">
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css">
          <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>

          <!-- and it's easy to individually load additional languages -->
          <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/sql.min.js"></script>
            <h1 style="color: white;">${
              recs.length
            } recordings / ${count}, DB: ${
            timingFirstPass + timingSecondPass
          }ms (1st ${timingFirstPass}, 2nd ${timingSecondPass}), Sequelize: ${Math.round(
            sequelizeTime - (timingFirstPass + timingSecondPass)
          )}ms</h1>
            <pre style="background: black;" class="language-json theme-atom-one-dark"><code class="code">${queryJSON}</code></pre>
            <div style="position: relative">
              <pre style="background: black;" class="language-sql theme-atom-one-dark"><code class="code">${sqlFirstPass}</code></pre>
              <button class="btn" style="position: absolute; right: 20px; top: 20px;">Copy</button>
            </div>
            <div style="position: relative">
              <pre style="background: black;" class="language-sql theme-atom-one-dark"><code class="code">${sqlSecondPass}</code></pre>
              <button class="btn" style="position: absolute; right: 20px; top: 20px;">Copy</button>
            </div>
          </body>
          <script>
            hljs.highlightAll();
            const btns = document.querySelectorAll(".btn");
            const copyContent = async (text) => {
              try {
                await navigator.clipboard.writeText(text);
                console.log('Content copied to clipboard');
              } catch (err) {
                console.error('Failed to copy: ', err);
              }
            }
            for (const btn of btns) {
              btn.addEventListener("click", async (e) => {              
                const text = e.target.parentNode.querySelector(".code").innerText;               
                await copyContent(text);
              });
            }
          </script>
          </html>
        `);
        }
      } catch (e) {
        console.log(e);
        return successResponse(response, "Got recordings", {
          recordings: [],
        });
      }
    }
  );
};
