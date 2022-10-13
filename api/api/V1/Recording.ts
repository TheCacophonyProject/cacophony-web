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

import { jsonSchemaOf } from "@api/schema-validation";
import util from "@api/V1/util";
import config from "@config";
import log from "@log";
import models from "@models";
import { Recording } from "@models/Recording";
import { Tag } from "@models/Tag";
import { Track } from "@models/Track";
import { TrackTag } from "@models/TrackTag";
import ApiRecordingResponseSchema from "@schemas/api/recording/ApiRecordingResponse.schema.json";
import ApiRecordingUpdateRequestSchema from "@schemas/api/recording/ApiRecordingUpdateRequest.schema.json";
import ApiRecordingTagRequestSchema from "@schemas/api/tag/ApiRecordingTagRequest.schema.json";
import ApiTrackDataRequestSchema from "@schemas/api/track/ApiTrackDataRequest.schema.json";
import ApiTrackTagAttributesSchema from "@schemas/api/trackTag/ApiTrackTagAttributes.schema.json";
import {
  HttpStatusCode,
  RecordingProcessingState,
  RecordingType,
  TagMode,
} from "@typedefs/api/consts";
import {
  ApiAudioRecordingMetadataResponse,
  ApiAudioRecordingResponse,
  ApiGenericRecordingResponse,
  ApiRecordingResponse,
  ApiRecordingUpdateRequest,
  ApiThermalRecordingMetadataResponse,
  ApiThermalRecordingResponse,
} from "@typedefs/api/recording";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ApiRecordingTagResponse } from "@typedefs/api/tag";
import { ApiTrackResponse } from "@typedefs/api/track";
import {
  ApiAutomaticTrackTagResponse,
  ApiHumanTrackTagResponse,
  ApiTrackTagResponse,
} from "@typedefs/api/trackTag";
import { Application, NextFunction, Request, Response } from "express";
import { body, param, query } from "express-validator";
// @ts-ignore
import * as csv from "fast-csv";
import { Validator } from "jsonschema";
import jwt, { JwtPayload } from "jsonwebtoken";
import { Op } from "sequelize";
import LabelPaths from "../../classifications/label_paths.json";

import { AuthorizationError, ClientError, FatalError } from "../customErrors";
import {
  extractJwtAuthorisedDevice,
  extractJwtAuthorizedUser,
  fetchAuthorizedRequiredDeviceById,
  fetchAuthorizedRequiredDeviceInGroup,
  fetchAuthorizedRequiredDevices,
  fetchAuthorizedRequiredRecordingById,
  fetchUnauthorizedRequiredRecordingById,
  fetchUnauthorizedRequiredRecordingTagById,
  fetchUnauthorizedRequiredTrackById,
  parseJSONField,
} from "../extract-middleware";
import { expectedTypeOf, validateFields } from "../middleware";
import {
  anyOf,
  booleanOf,
  idOf,
  integerOf,
  stringOf,
  validNameOf,
} from "../validation-middleware";

import recordingUtil, {
  getTrackTags,
  mapPosition,
  reportRecordings,
  reportVisits,
  signedToken,
  uploadRawRecording,
} from "./recordingUtil";
import { successResponse } from "./responseUtil";
import { streamS3Object } from "@api/V1/signedUrl";

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
  };
  if (trackTag.automatic) {
    (trackTagBase as ApiAutomaticTrackTagResponse).automatic = true;
    return trackTagBase as ApiAutomaticTrackTagResponse;
  } else {
    (trackTagBase as ApiHumanTrackTagResponse).automatic = false;
    (trackTagBase as ApiHumanTrackTagResponse).userId = trackTag.UserId;
    (trackTagBase as ApiHumanTrackTagResponse).userName =
      trackTag.User.userName;
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

const mapTrack = (track: Track): ApiTrackResponse => {
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

const mapTracks = (tracks: Track[]): ApiTrackResponse[] => {
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
  if (tag.what) {
    result.what = tag.what;
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
  try {
    const commonRecording: ApiRecordingResponse = {
      id: recording.id,
      deviceId: recording.DeviceId,
      duration: recording.duration,
      location: recording.location,
      rawMimeType: recording.rawMimeType,
      comment: ifNotNull(recording.comment),
      deviceName: recording.Device?.deviceName,
      groupId: recording.GroupId,
      groupName: recording.Group?.groupName,
      processing: recording.processing || false,
      processingState: recording.processingState,
      recordingDateTime: recording.recordingDateTime?.toISOString(),
      stationId: ifNotNull(recording.StationId),
      stationName: recording.Station?.name,
      type: recording.type,
      fileHash: recording.rawFileHash,
      tags: recording.Tags && mapTags(recording.Tags),
      tracks: recording.Tracks && mapTracks(recording.Tracks),
    };
    if (recording.type === RecordingType.ThermalRaw) {
      return {
        ...commonRecording,
        type: recording.type,
        additionalMetadata:
          recording.additionalMetadata as ApiThermalRecordingMetadataResponse, // TODO - strip and map metadata?
      };
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
        type: recording.type,
        version: recording.version,
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
   * @apiuse V1ResponseError
   */
  app.post(apiUrl, extractJwtAuthorisedDevice, uploadRawRecording);

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
    uploadRawRecording
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
    uploadRawRecording
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
    uploadRawRecording
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
      const result = await recordingUtil.queryVisits(
        response.locals.requestUser.id,
        {
          viewAsSuperUser,
          where,
          tagMode: tagMode as TagMode,
          tags,
          offset: offset && parseInt(offset as string),
          limit: limit && parseInt(limit as string),
        }
      );
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
      query("hideFiltered").default(false).isBoolean().toBoolean(),
      query("countAll").default(true).isBoolean().toBoolean(),
    ]),
    parseJSONField(query("order")),
    parseJSONField(query("where")),
    parseJSONField(query("tags")),

    async (request: Request, response: Response) => {
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
      } = request.query;

      if (request.query.hasOwnProperty("deleted")) {
        if (deleted) {
          where.deletedAt = { [Op.ne]: null };
        } else {
          where.deletedAt = { [Op.eq]: null };
        }
      }

      const result = await recordingUtil.query(
        response.locals.requestUser.id,
        type as RecordingType,
        countAll ? true : false,
        {
          viewAsSuperUser,
          where,
          tags,
          order,
          tagMode: tagMode as TagMode,
          limit: limit && parseInt(limit as string),
          offset: offset && parseInt(offset as string),
          hideFiltered: hideFiltered ? true : false,
          exclusive: exclusive ? true : false,
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
        const values = await recordingUtil.bulkDelete(
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
            hideFiltered: hideFiltered ? true : false,
            exclusive: exclusive ? true : false,
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
   * @apiName QueryRecordings
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

      const options = {
        viewAsSuperUser,
        where,
        tags,
        order,
        tagMode: tagMode as TagMode,
        limit: limit && parseInt(limit as string),
        offset: offset && parseInt(offset as string),
        hideFiltered: hideFiltered ? true : false,
        exclusive: exclusive ? true : false,
        checkIsGroupAdmin:
          response.locals.viewAsSuperUser && user.hasGlobalRead()
            ? false
            : checkIsGroupAdmin
            ? true
            : false,
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
      integerOf(query("limit").default(50000)),
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
        rows = await reportVisits(response.locals.requestUser.id, options);
      } else {
        rows = await reportRecordings(
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
      if (!config.productionEnv) {
        const JsonSchema = new Validator();
        console.assert(
          JsonSchema.validate(recording, ApiRecordingResponseSchema).valid
        );
      }
      if (request.query["requires-signed-url"]) {
        let rawJWT;
        let cookedJWT;
        let rawSize;
        let cookedSize;
        if (recordingItem.fileKey) {
          cookedJWT = signedToken(
            recordingItem.fileKey,
            recordingItem.getFileName(),
            recordingItem.fileMimeType
          );
          cookedSize =
            recordingItem.fileSize ||
            (await util.getS3ObjectFileSize(recordingItem.fileKey));
        }
        if (recordingItem.rawFileKey) {
          rawJWT = signedToken(
            recordingItem.rawFileKey,
            recordingItem.getRawFileName(),
            recordingItem.rawMimeType
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
    `${apiUrl}/raw/:id`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      query("deleted").default(false).isBoolean().toBoolean(),
    ]),
    fetchAuthorizedRequiredRecordingById(param("id")),
    async (request: Request, response: Response, next: NextFunction) => {
      const recordingItem = response.locals.recording;
      if (!recordingItem.rawFileKey) {
        return next(new ClientError("Recording has no raw file key."));
      }
      let fileExt: string = "raw";
      switch (recordingItem.rawMimeType) {
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
        case "application/x-cptv":
          fileExt = "cptv";
          break;
      }
      const time = recordingItem.recordingDateTime
        ?.toISOString()
        .replace(/:/g, "_")
        .replace(".", "_");
      return await streamS3Object(
        request,
        response,
        recordingItem.rawFileKey,
        `${recordingItem.id}@${time}.${fileExt}`,
        recordingItem.rawMimeType || "application/octet-stream"
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
   * @apiQuery {Boolean} [deleted=false] Whether or not to only include deleted
   * recordings.
   *
   * @apiSuccess {file} file Raw data stream of the png.
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:id/thumbnail`,
    validateFields([
      idOf(param("id")),
      query("deleted").default(false).isBoolean().toBoolean(),
    ]),
    fetchUnauthorizedRequiredRecordingById(param("id")),
    async (request: Request, response: Response, next: NextFunction) => {
      const rec = response.locals.recording;
      const mimeType = "image/png";
      const filename = `${rec.id}-thumb.png`;

      if (!rec.rawFileKey) {
        return next(new ClientError("Rec has no raw file key."));
      }

      recordingUtil
        .getThumbnail(rec)
        .then((data) => {
          response.setHeader(
            "Content-disposition",
            "attachment; filename=" + filename
          );
          response.setHeader("Content-type", mimeType);
          response.setHeader("Content-Length", data.ContentLength);
          response.write(data.Body, "binary");
          return response.end(null, "binary");
        })
        .catch((err) => {
          // FIXME - if the thumbnail doesn't exist, lets create it, even if the request takes a while.
          log.error(
            "Error getting thumbnail from s3 %s: %s",
            rec.id,
            err.message
          );
          return next(new ClientError("No thumbnail exists"));
        });
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

      if (request.query["soft-delete"]) {
        const recording: Recording = response.locals.recording;
        recording.deletedAt = new Date();
        recording.deletedBy = response.locals.requestUser.id;

        await recording.save();
        return successResponse(response, "Deleted recording.");
      } else {
        let deleted = false;
        const recording: Recording = response.locals.recording;
        const rawFileKey = recording.rawFileKey;
        const fileKey = recording.fileKey;
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
          await util.deleteS3Object(`${rawFileKey}-thumb`).catch((err) => {
            log.warning(err);
          });
        }
        if (deleted && fileKey) {
          await util.deleteS3Object(fileKey).catch((err) => {
            log.warning(err);
          });
        }
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
      await response.locals.recording.update({
        deletedAt: null,
        deletedBy: null,
      });
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
    async (request: Request, response: Response) => {
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

      const track = await response.locals.recording.createTrack({
        data,
        AlgorithmId: algorithmDetail.id,
      });
      await track.updateIsFiltered();

      return successResponse(response, "Track added.", {
        trackId: track.id,
        algorithmId: track.AlgorithmId,
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

  /**
   * @api {post} /api/v1/recordings/:id/tracks/:trackId/replaceTag
   * Adds/Replaces a Track Tag
   * @apiDescription Adds or Replaces track tag based off:
   * if tag already exists for this user, ignore request
   * Add tag if it is an additional tag e.g. :Part"
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
    `${apiUrl}/:id/tracks/:trackId/replaceTag`,
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
    // FIXME - extract valid track for trackId on recording with id
    async (request: Request, response: Response, next: NextFunction) => {
      const requestUser = response.locals.requestUser;
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
   * @apiBody {JSON} [updates] Data containg attributes for tag.
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
   * @apiInterface {apiBody::ApiRecordingTagRequest} tag
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
      const tagInstance = await recordingUtil.addTag(
        response.locals.requestUser,
        response.locals.recording,
        response.locals.tag
      );
      return successResponse(response, "Added new tag.", {
        tagId: tagInstance.id,
      });
    }
  );
};
