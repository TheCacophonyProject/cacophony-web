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

import { Application, NextFunction, Request, Response } from "express";
import { expectedTypeOf, validateFields } from "../middleware";
import recordingUtil, {
  mapPositions,
  reportRecordings,
  reportVisits,
  signedToken,
  uploadRawRecording,
} from "./recordingUtil";
import responseUtil from "./responseUtil";
import models from "@models";
// @ts-ignore
import * as csv from "fast-csv";
import { body, param, query } from "express-validator";
import { Recording } from "@models/Recording";
import { TrackTag } from "@models/TrackTag";
import { Track } from "@models/Track";
import { Op } from "sequelize";
import jwt from "jsonwebtoken";
import config from "@config";
import { ClientError } from "../customErrors";
import log from "@log";
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
import {
  anyOf,
  booleanOf,
  idOf,
  integerOf,
  stringOf,
  validNameOf,
} from "../validation-middleware";
import util from "@api/V1/util";
import {
  ApiAudioRecordingMetadataResponse,
  ApiAudioRecordingResponse,
  ApiGenericRecordingResponse,
  ApiRecordingResponse,
  ApiRecordingUpdateRequest,
  ApiThermalRecordingMetadataResponse,
  ApiThermalRecordingResponse,
} from "@typedefs/api/recording";
import ApiRecordingResponseSchema from "@schemas/api/recording/ApiRecordingResponse.schema.json";
import ApiRecordingUpdateRequestSchema from "@schemas/api/recording/ApiRecordingUpdateRequest.schema.json";
import ApiTrackDataRequestSchema from "@schemas/api/track/ApiTrackDataRequest.schema.json";
import { Validator } from "jsonschema";
import { RecordingProcessingState, RecordingType } from "@typedefs/api/consts";
import { ApiTrackResponse } from "@typedefs/api/track";
import { Tag } from "@models/Tag";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import {
  ApiRecordingTagResponse,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ApiRecordingTagRequest,
} from "@typedefs/api/tag";
import {
  ApiAutomaticTrackTagResponse,
  ApiHumanTrackTagResponse,
  ApiTrackTagResponse,
} from "@typedefs/api/trackTag";
import { jsonSchemaOf } from "@api/schema-validation";
import ApiRecordingTagRequestSchema from "@schemas/api/tag/ApiRecordingTagRequest.schema.json";

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
    data: data as any, // FIXME - Probably returning a bit too much useless data to the front-end?
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
      trackTag.User.username;
    return trackTagBase as ApiHumanTrackTagResponse;
  }
};

const mapTrackTags = (
  trackTags: TrackTag[]
): (ApiHumanTrackTagResponse | ApiAutomaticTrackTagResponse)[] =>
  trackTags.map(mapTrackTag);

const mapTrack = (track: Track): ApiTrackResponse => ({
  id: track.id,
  start: track.data.start_s,
  end: track.data.end_s,
  tags: (track.TrackTags && mapTrackTags(track.TrackTags)) || [],
  positions: mapPositions(track.data.positions),
  filtered: track.filtered,
});

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
      result.taggerName = (tag as any).tagger.username;
    }
  }
  if (tag.startTime !== undefined) {
    result.startTime = tag.startTime;
  }
  if (tag.duration !== undefined) {
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
  const commonRecording: ApiRecordingResponse = {
    id: recording.id,
    deviceId: recording.DeviceId,
    duration: recording.duration,
    location: recording.location && {
      lat: (recording.location as { coordinates: [number, number] })
        .coordinates[1],
      lng: (recording.location as { coordinates: [number, number] })
        .coordinates[0],
    },
    rawMimeType: recording.rawMimeType,
    comment: ifNotNull(recording.comment),
    deviceName: recording.Device?.devicename,
    groupId: recording.GroupId,
    groupName: recording.Group?.groupname,
    processing: recording.processing || false,
    processingState: recording.processingState,
    recordingDateTime: recording.recordingDateTime,
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
      type: recording.type,
      version: recording.version,
    };
  }
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiTracksResponseSuccess {
  tracks: ApiTrackResponse[];
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
   *<ul>
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
   *</ul>
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
   * @apiDescription Uploads a device's own raw thermal video to the server.  It currently
   * supports raw thermal video but will eventually support all recording types.
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
   * @apiDescription Called by a user to upload raw thermal video on behalf of a device.
   * The user must have permission to view videos from the device or the call will return an
   * error.
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

      // Default to also allowing inactive devices to have uploads on their behalf
      query("only-active").default(false).isBoolean().toBoolean(),
    ]),
    fetchAuthorizedRequiredDeviceInGroup(
      param("deviceName"),
      param("groupName")
    ),
    uploadRawRecording
  );

  /**
   * @api {post} /api/v1/recordings/device/:deviceId Add a new recording on behalf of device
   * @apiName PostRecordingOnBehalf
   * @apiGroup Recordings
   * @apiDescription Called by a user to upload raw thermal video on behalf of a device.
   * The user must have permission to view videos from the device or the call will return an
   * error.
   *
   * @apiParam {Integer} deviceId ID of the device to upload on behalf of. If you don't have access to the ID the devicename can be used instead in it's place.
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
      // Default to also allowing inactive devices to have uploads on their behalf
      query("only-active").default(false).isBoolean().toBoolean(),
    ]),
    fetchAuthorizedRequiredDeviceById(param("deviceId")),
    uploadRawRecording
  );

  /**
   * @api {post} /api/v1/recordings/:deviceName Legacy upload on behalf of
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
      response.locals.device = devices[0];
      next();
    },
    uploadRawRecording
  );

  // FIXME - Should we just delete this now?
  /**
   * @api {get} /api/v1/recordings/visits Query available recordings and generate visits
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
      const result = await recordingUtil.queryVisits(
        response.locals.requestUser.id,
        response.locals.viewAsSuperUser,
        response.locals.where,
        request.query.tagMode,
        response.locals.tags || [],
        request.query.offset && parseInt(request.query.offset as string),
        request.query.limit && parseInt(request.query.limit as string)
      );
      responseUtil.send(response, {
        statusCode: 200,
        messages: ["Completed query."],
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
   * @apiQuery {String="user"} [view-mode] Allow a super-user to view as a regular user
   * @apiQuery {Boolean} [deleted=false] Include only deleted recordings
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

    async (request: Request, response: Response) => {
      // FIXME Stop allowing arbitrary where queries
      const where = response.locals.where || {};
      if (request.query.hasOwnProperty("deleted")) {
        if (request.query.deleted) {
          where.deletedAt = { [Op.ne]: null };
        } else {
          where.deletedAt = { [Op.eq]: null };
        }
      }

      const result = await recordingUtil.query(
        response.locals.requestUser.id,
        response.locals.viewAsSuperUser,
        where,
        request.query.tagMode,
        response.locals.tags || [],
        request.query.limit && parseInt(request.query.limit as string),
        request.query.offset && parseInt(request.query.offset as string),
        response.locals.order,
        request.query.type as RecordingType,
        request.query.hideFiltered ? true : false
      );
      responseUtil.send(response, {
        statusCode: 200,
        messages: ["Completed query."],
        limit: request.query.limit,
        offset: request.query.offset,
        count: result.count,
        rows: result.rows.map(mapRecordingResponse),
      });
    }
  );

  /**
   * @api {get} /api/v1/recordings/count Query available recording count
   * @apiName QueryRecordingsCount
   * @apiGroup Recordings
   *
   * @apiUse V1UserAuthorizationHeader
   * @apiQuery {String="user"} [view-mode] Allow a super-user to view as a regular user
   * @apiQuery {Boolean} [deleted=false] Include only deleted recordings
   * @apiInterface {apiQuery::RecordingProcessingState} [processingState] Current processing state of recordings
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
      query("tagMode")
        .optional()
        .custom((value) => {
          return models.Recording.isValidTagMode(value);
        }),
    ]),
    parseJSONField(query("order")),
    parseJSONField(query("where")),
    parseJSONField(query("tags")),
    async (request: Request, response: Response) => {
      const user = response.locals.requestUser;

      // FIXME - Is this redundant now?
      let userWhere = request.query.where || {};
      if (typeof userWhere === "string") {
        try {
          userWhere = JSON.parse(userWhere);
        } catch (e) {
          responseUtil.send(response, {
            statusCode: 400,
            messages: ["Malformed JSON"],
          });
        }
      }
      if (request.query.hasOwnProperty("deleted")) {
        if (request.query.deleted) {
          (userWhere as any).deletedAt = { [Op.ne]: null };
        } else {
          (userWhere as any).deletedAt = { [Op.eq]: null };
        }
      }
      const countQuery = {
        where: {
          [Op.and]: [
            userWhere, // User query
          ],
        },
        include: [
          {
            model: models.Group,
            include: [
              {
                model: models.User,
                where: {
                  [Op.and]: [{ id: user.id }],
                },
              },
            ],
            required: true,
          },
        ],
      };
      if (response.locals.viewAsSuperUser && user.hasGlobalRead()) {
        // Dont' filter on user if the user has global read permissions.
        delete countQuery.include[0].include;
      }
      const count = await models.Recording.count(countQuery);
      responseUtil.send(response, {
        statusCode: 200,
        messages: ["Completed query."],
        count,
      });
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
   * @apiParam {Integer} [deviceId] Optional deviceId to bias returned recording to.
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/needs-tag`,
    extractJwtAuthorizedUser,
    validateFields([idOf(query("deviceId")).optional()]),
    async (request: Request, response: Response) => {
      // NOTE: We only return the minimum set of fields we need to play back
      //  a recording, show tracks in the UI, and have the user add a tag.
      //  Generate a short-lived JWT token for each recording we return, keyed
      //  to that recording.  Only return a single recording at a time.
      //
      let result;
      if (!request.query.deviceId) {
        result = await models.Recording.getRecordingWithUntaggedTracks();
      } else {
        // NOTE: Optionally, the returned recordings can be biased to be from
        //  a preferred deviceId, to handle the case where we'd like a series
        //  of random recordings to tag constrained to a single device.
        result = await models.Recording.getRecordingWithUntaggedTracks(
          Number(request.query.deviceId)
        );
      }
      responseUtil.send(response, {
        statusCode: 200,
        messages: ["Completed query."],
        // FIXME - should be a mapped recording?
        rows: [result],
      });
    }
  );

  /**
   * @api {get} /api/v1/recordings/report Generate report for a set of recordings
   * @apiName Report
   * @apiGroup Recordings
   * @apiDescription Parameters are as per GET /api/V1/recordings. On
   * success (status 200), the response body will contain CSV
   * formatted details of the selected recordings.
   *
   * @apiUse V1UserAuthorizationHeader
   * @apiParam {String} [jwt] Signed JWT as produced by the [Token](#api-Authentication-Token) endpoint
   * @apiParam {string} [type] Optional type of report either recordings or visits. Recordings is default.
   * @apiUse BaseQueryParams
   * @apiUse RecordingOrder
   * @apiUse MoreQueryParams
   * @apiParam {boolean} [audiobait] To add audiobait to a recording query set this to true.
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
      query("tagMode")
        .optional()
        .custom((value) => {
          return models.Recording.isValidTagMode(value);
        }),
      query("view-mode").optional().equals("user"),
      query("deleted").default(false).isBoolean().toBoolean(),
      //middleware.parseJSON("filterOptions", query).optional(),
    ]),
    parseJSONField(query("order")),
    parseJSONField(query("where")),
    parseJSONField(query("tags")),
    async (request: Request, response: Response) => {
      // FIXME - deprecate and generate report client-side from other available API data.
      if (request.query.hasOwnProperty("deleted")) {
        if (request.query.deleted) {
          response.locals.where.deletedAt = { [Op.ne]: null };
        } else {
          response.locals.where.deletedAt = { [Op.eq]: null };
        }
      }

      // 10 minute timeout because the query can take a while to run
      // when the result set is large.
      let rows;
      if (request.query.type == "visits") {
        rows = await reportVisits(
          response.locals.requestUser.id,
          response.locals.viewAsSuperUser,
          response.locals.where,
          request.query.tagMode,
          response.locals.tags || [],
          request.query.offset && parseInt(request.query.offset as string),
          request.query.limit && parseInt(request.query.limit as string)
        );
      } else {
        rows = await reportRecordings(
          response.locals.requestUser.id,
          response.locals.viewAsSuperUser,
          response.locals.where,
          request.query.tagMode,
          response.locals.tags || [],
          request.query.offset && parseInt(request.query.offset as string),
          request.query.limit && parseInt(request.query.limit as string),
          response.locals.order,
          Boolean(request.query.audiobait)
        );
      }
      response.status(200).set({
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
   * @apiQuery {Boolean} [deleted=false] Whether or not to only include deleted recordings.
   * @apiSuccess {int} fileSize the number of bytes in recording file.
   * @apiSuccess {int} rawSize the number of bytes in raw recording file.
   * @apiSuccess {String} downloadFileJWT JSON Web Token to use to download the
   * recording file.
   * @apiSuccess {String} downloadRawJWT JSON Web Token to use to download
   * the raw recording data.
   * @apiInterface {apiSuccess::ApiRecordingResponseSuccess} recording The recording data.
   *
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:id`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      query("deleted").default(false).isBoolean().toBoolean(),
    ]),
    fetchAuthorizedRequiredRecordingById(param("id")),
    async (request: Request, response: Response) => {
      const recordingItem = response.locals.recording;
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
      const recording = mapRecordingResponse(response.locals.recording);

      if (!config.productionEnv) {
        const JsonSchema = new Validator();
        console.assert(
          JsonSchema.validate(recording, ApiRecordingResponseSchema).valid
        );
      }

      responseUtil.send(response, {
        statusCode: 200,
        messages: [],
        recording,
        rawSize: rawSize,
        fileSize: cookedSize,
        downloadFileJWT: cookedJWT,
        downloadRawJWT: rawJWT,
      });
    }
  );

  /**
   * @api {get} /api/v1/recordings/:id/thumbnail Gets a thumbnail png for this recording
   * @apiName RecordingThumbnail
   * @apiGroup Recordings
   * @apiDescription Gets a thumbnail png for this recording in Viridis palette
   *
   * @apiParam {Integer} id Id of the recording to get the thumbnail for.
   * @apiQuery {Boolean} [deleted=false] Whether or not to only include deleted recordings.
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
    async (request: Request, response: Response) => {
      const rec = response.locals.recording;
      const mimeType = "image/png";
      const filename = `${rec.id}-thumb.png`;

      if (!rec.rawFileKey) {
        throw new ClientError("Rec has no raw file key.");
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
          log.error(
            "Error getting thumbnail from s3 %s: %s",
            rec.id,
            err.message
          );
          return responseUtil.send(response, {
            statusCode: 400,
            messages: ["No thumbnail exists"],
          });
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
   * @apiQuery {Boolean} [soft-delete=true] Pass false to actually permanently delete this recording, otherwise by default
   * it will just be marked as deleted and hidden from the UI.
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
      if (request.query["soft-delete"]) {
        const recording: Recording = response.locals.recording;
        recording.deletedAt = new Date();
        recording.deletedBy = response.locals.requestUser.id;
        await recording.save();
        responseUtil.send(response, {
          statusCode: 200,
          messages: ["Deleted recording."],
        });
      } else {
        let deleted = false;
        const recording: Recording = response.locals.recording;
        const rawFileKey = recording.rawFileKey;
        const fileKey = recording.fileKey;
        try {
          await recording.destroy();
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
        responseUtil.send(response, {
          statusCode: 200,
          messages: ["Hard deleted recording."],
        });
      }
    }
  );

  /**
   * @api {patch} /api/v1/recordings/:id Update an existing recording
   * @apiName UpdateRecording
   * @apiGroup Recordings
   * @apiDescription This call is used for updating fields of a previously
   * submitted recording.
   *
   * @apiUse V1UserAuthorizationHeader

   * @apiParam {Integer} id Id of the recording to update.
   * @apiInterface {apiBody::ApiRecordingUpdateRequestBody} updates Object containing the fields to update and their new values.
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
      // FIXME - If update includes location, rematch stations.  Maybe this should
      //  be part of the setter for location, but might be too magic?
      await response.locals.recording.update(
        response.locals.updates as ApiRecordingUpdateRequest
      );
      return responseUtil.send(response, {
        statusCode: 200,
        messages: ["Updated recording."],
      });
    }
  );

  /**
   * @api {patch} /api/v1/recordings/:id/undelete Undelete an existing soft-deleted recording
   * @apiName UndeleteRecording
   * @apiGroup Recordings
   * @apiDescription This call is used for updating deletedAt and deletedBy fields of a previously
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
      return responseUtil.send(response, {
        statusCode: 200,
        messages: ["Undeleted recording."],
      });
    }
  );

  /**
   * @api {post} /api/v1/recordings/:id/tracks Add new track to recording
   * @apiName PostTrack
   * @apiGroup Tracks
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Integer} id Id of the recording to add the track to.
   * @apiParam {JSON} data Data which defines the track (type specific).
   * @apiParam {JSON} [algorithm] Description of algorithm that generated track
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {Integer} trackId Unique id of the newly created track.
   * @apiSuccess {Integer} algorithmId Id of tracking algorithm used
   *
   * @apiUse V1ResponseError
   *
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

      const track = await response.locals.recording.createTrack({
        data: response.locals.data,
        AlgorithmId: algorithmDetail.id,
      });
      await track.updateIsFiltered();

      responseUtil.send(response, {
        statusCode: 200,
        messages: ["Track added."],
        trackId: track.id,
        algorithmId: track.AlgorithmId,
      });
    }
  );

  /**
   * @api {get} /api/v1/recordings/:id/tracks Get tracks for recording
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
      responseUtil.send(response, {
        statusCode: 200,
        messages: ["OK."],
        tracks: mapTracks(tracks),
      });
    }
  );

  /**
   * @api {delete} /api/v1/recordings/:id/tracks/:trackId Remove track from recording
   * @apiName DeleteTrack
   * @apiGroup Tracks
   *
   * @apiParam {Integer} id Id of the recording
   * @apiParam {Integer} trackId id of the recording track to remove
   *
   * @apiUse V1UserAuthorizationHeader
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   *
   */
  app.delete(
    `${apiUrl}/:id/tracks/:trackId`,
    extractJwtAuthorizedUser,
    validateFields([idOf(param("id")), idOf(param("trackId"))]),
    fetchAuthorizedRequiredRecordingById(param("id")),
    fetchUnauthorizedRequiredTrackById(param("trackId")),
    async (request, response) => {
      // Make sure the track belongs to the recording (this could probably be one query)
      if (
        (response.locals.track as Track).RecordingId ===
        response.locals.recording.id
      ) {
        await response.locals.track.destroy();
        responseUtil.send(response, {
          statusCode: 200,
          messages: ["Track deleted."],
        });
      } else {
        responseUtil.send(response, {
          statusCode: 400,
          messages: ["No such track."],
        });
      }
    }
  );

  /**
   * @api {post} /api/v1/recordings/:id/tracks/:trackId/replaceTag  Adds/Replaces  a Track Tag
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
   * @apiBody {Boolean} automatic "true" if tag is machine generated, "false" otherwise.
   * @apiBody {JSON} [data] Data Additional tag data.
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {int} trackTagId Unique id of the newly created track tag.
   *
   * @apiUse V1ResponseError
   *
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
    async (request: Request, response: Response) => {
      const requestUser = response.locals.requestUser;
      const newTag = models.TrackTag.build({
        what: request.body.what,
        confidence: request.body.confidence,
        automatic: request.body.automatic,
        data: response.locals.data || "",
        UserId: requestUser.id,
        TrackId: response.locals.track.id,
      }) as TrackTag;
      try {
        const tag = await response.locals.track.replaceTag(newTag);
        if (tag) {
          responseUtil.send(response, {
            statusCode: 200,
            messages: ["Track tag added."],
            trackTagId: tag.id,
          });
        } else {
          responseUtil.send(response, {
            statusCode: 200,
            messages: ["Tag already exists."],
          });
        }
      } catch (e) {
        log.warning("Failure replacing tag: %s", e);
        responseUtil.send(response, {
          statusCode: 500,
          messages: ["Server error replacing tag."],
        });
      }
    }
  );

  /**
   * @api {post} /api/v1/recordings/:id/tracks/:trackId/tags Add tag to track
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
   * @apiBody {Boolean} automatic "true" if tag is machine generated, "false" otherwise.
   * @apiBody {String} [tagJWT] JWT token to tag a recording/track that the user would not otherwise have permission to view.
   * @apiBody {JSON} [data] Data Additional tag data.
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {int} trackTagId Unique id of the newly created track tag.
   *
   * @apiUse V1ResponseError
   *
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
    // FIXME - JSON schema for allowed data? At least a limit to how many chars etc?
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
    async (request: Request, response: Response) => {
      let track;
      if (request.body.tagJWT) {
        // If there's a tagJWT, then we don't need to check the users' recording
        // update permissions.
        track = await loadTrackForTagJWT(request, response);
      } else {
        // Otherwise, just check that the user can update this track.
        track = await response.locals.recording.getTrack(
          request.params.trackId
        );
        if (!track) {
          responseUtil.send(response, {
            statusCode: 403,
            messages: ["No such track."],
          });
          return;
        }
      }
      const tag = await track.addTag(
        request.body.what,
        request.body.confidence,
        request.body.automatic,
        response.locals.data || "",
        response.locals.requestUser.id
      );
      responseUtil.send(response, {
        statusCode: 200,
        messages: ["Track tag added."],
        trackTagId: tag.id,
      });
    }
  );

  /**
   * @api {delete} /api/v1/recordings/:id/tracks/:trackId/tags/:trackTagId Delete a track tag
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
    async (request, response) => {
      let track;
      if (request.query.tagJWT) {
        // If there's a tagJWT, then we don't need to check the users' recording
        // update permissions.
        track = await loadTrackForTagJWT(request, response);
      } else {
        // FIXME - fetch in middleware
        // Otherwise, just check that the user can update this track.
        track = await response.locals.recording.getTrack(
          request.params.trackId
        );
      }
      if (!track) {
        responseUtil.send(response, {
          statusCode: 400,
          messages: ["No such track."],
        });
        return;
      }

      const tag = await track.getTrackTag(request.params.trackTagId);
      if (!tag) {
        responseUtil.send(response, {
          statusCode: 400,
          messages: ["No such track tag."],
        });
        return;
      }

      await tag.destroy();
      await track.updateIsFiltered();
      responseUtil.send(response, {
        statusCode: 200,
        messages: ["Track tag deleted."],
      });
    }
  );

  /**
   * @api {delete} /api/v1/recordings/:id/tags/:tagId Delete an existing recording tag
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
      responseUtil.send(response, {
        statusCode: 200,
        messages: ["Deleted tag."],
      });
    }
  );

  /**
   * @api {post} /api/v1/recordings/:id/tags Add a new recording tag
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
      responseUtil.send(response, {
        statusCode: 200,
        messages: ["Added new tag."],
        tagId: tagInstance.id,
      });
    }
  );

  // FIXME - This function doesn't belong here
  async function loadTrackForTagJWT(request, response): Promise<Track> {
    let jwtDecoded;
    const tagJWT = request.body.tagJWT || request.query.tagJWT;
    try {
      jwtDecoded = jwt.verify(tagJWT, config.server.passportSecret);
      if (
        jwtDecoded._type === "tagPermission" &&
        jwtDecoded.recordingId === request.params.id
      ) {
        const track = await models.Track.findByPk(request.params.trackId);
        if (!track) {
          responseUtil.send(response, {
            statusCode: 403,
            messages: ["Track does not exist"],
          });
          return;
        }
        // Ensure track belongs to this recording.
        if (track.RecordingId !== request.params.id) {
          responseUtil.send(response, {
            statusCode: 403,
            messages: ["Track does not belong to recording"],
          });
          return;
        }
        return track;
      } else {
        responseUtil.send(response, {
          statusCode: 403,
          messages: ["JWT does not have permissions to tag this recording"],
        });
        return;
      }
    } catch (e) {
      responseUtil.send(response, {
        statusCode: 403,
        messages: ["Failed to verify JWT."],
      });
      return;
    }
  }
};
