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
import { initSequelize } from "@models/index.js";
import { Recording } from "@models/Recording.js";
import { mapPosition } from "@models/Recording.js";
import { Tag } from "@models/Tag.js";
import { Track } from "@models/Track.js";
import { TrackTag, TrackTagId } from "@models/TrackTag.js";
import ApiRecordingUpdateRequestSchema from "@schemas/api/recording/ApiRecordingUpdateRequest.schema.json" with { type: "json" };
import ApiRecordingTagRequestSchema from "@schemas/api/tag/ApiRecordingTagRequest.schema.json" with { type: "json" };
import ApiTrackDataRequestSchema from "@schemas/api/track/ApiTrackDataRequest.schema.json" with { type: "json" };
import ApiAlgorithmDataRequestSchema from "@schemas/api/track/AlgorithmRequest.schema.json" with { type: "json" };
import ApiTrackTagAttributesSchema from "@schemas/api/trackTag/ApiTrackTagAttributes.schema.json" with { type: "json" };
import {
  HttpStatusCode,
  RecordingProcessingState,
  RecordingType,
  TagMode,
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
import type { JwtPayload } from "jsonwebtoken";
import jwt from "jsonwebtoken";
import { FindAndCountOptions, FindAttributeOptions, Op } from "sequelize";
import LabelPaths from "../../classifications/label_paths.json" with { type: "json" };

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
  fetchAuthorizedRequiredFlatRecordingById,
  fetchAuthorizedRequiredFullRecordingById,
  fetchAuthorizedRequiredGroupByNameOrId,
  fetchUnauthorizedRequiredFlatRecordingById,
  fetchUnauthorizedRequiredFullRecordingById,
  fetchUnauthorizedRequiredRecordingTagById,
  fetchUnauthorizedRequiredTrackById,
  parseJSONField,
} from "../extract-middleware.js";
import { expectedTypeOf, isIntArray, validateFields } from "../middleware.js";
import {
  booleanOf,
  idOf,
  integerOf,
  optionalDateOf,
  stringOf,
  validNameOf,
} from "../validation-middleware.js";

import {
  addTag,
  bulkDelete,
  updateRecordingTimeBookkeeping,
  getThumbnail,
  getTrackTags,
  getTrackTagsCount,
  queryRecordings,
  signedToken,
} from "./recordingUtil.js";
import { serverErrorResponse, successResponse } from "./responseUtil.js";
import { streamS3Object } from "@api/V1/signedUrl.js";
import {
  uploadGenericRecordingFromDevice,
  uploadGenericRecordingOnBehalfOfDevice,
} from "@api/fileUploaders/uploadGenericRecording.js";
import { trackIsMasked } from "@api/V1/trackMasking.js";
import type { RecordingId, TrackId } from "@typedefs/api/common.js";
import { format } from "util";
import { asyncLocalStorage } from "@/Globals.js";
import {
  queryRecordingsInProject,
  sqlDebugOutput,
} from "./recordingsBulkQueryUtil.js";
import { openS3 } from "@models/util/util.js";
import { DetailSnapshot } from "@models/DetailSnapshot.js";
import { Group } from "@models/Group.js";
import { User } from "@models/User.js";
import { TrackTagUserData } from "@models/TrackTagUserData.js";
import { Device } from "@models/Device.js";
import { Station } from "@models/Station.js";
import { Visit } from "@models/Visit.js";
import { MinimalTrackRequestData } from "@typedefs/api/fileProcessing.js";

const sequelize = await initSequelize();

const mapTrackTag = (
  trackTag: TrackTag,
): ApiHumanTrackTagResponse | ApiAutomaticTrackTagResponse => {
  const trackTagBase: ApiTrackTagResponse = {
    confidence: trackTag.confidence,
    id: trackTag.id,
    automatic: false, // Unset
    trackId: trackTag.TrackId,
    what: trackTag.what,
    path: trackTag.path,
    model: trackTag.model,
    createdAt: trackTag.createdAt?.toISOString(),
    updatedAt: trackTag.updatedAt?.toISOString(),
  };
  if (trackTag.data) {
    trackTagBase.data = trackTag.data;
  }
  if (trackTag.TrackTagUserDatum) {
    trackTagBase.data = {
      ...(trackTagBase.data || {}),
      ...{
        gender: trackTag.TrackTagUserDatum.gender,
        maturity: trackTag.TrackTagUserDatum.maturity,
      },
    };
  }
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
  trackTags: TrackTag[],
): (ApiHumanTrackTagResponse | ApiAutomaticTrackTagResponse)[] => {
  const t = trackTags.map(mapTrackTag);
  // Make sure tags are always in some deterministic order for testing purposes.
  t.sort((a, b) => a.id - b.id);
  return t;
};

export const mapTrack = (track: Track, minimal = false): ApiTrackResponse => {
  const t: ApiTrackResponse = {
    id: track.id,
    start: track.startSeconds,
    end: track.endSeconds,
    tags: (track.TrackTags && mapTrackTags(track.TrackTags)) || [],
  };
  if (track.minFreqHz !== null) {
    t.minFreq = track.minFreqHz;
  }
  if (track.maxFreqHz !== null) {
    t.maxFreq = track.maxFreqHz;
  }
  t.filtered = track.filtered;
  if (
    !minimal &&
    track.data &&
    track.data.positions &&
    track.data.positions.length
  ) {
    t.positions = track.data.positions.map(mapPosition);
  }
  if (!minimal && track.data && track.data.tracking_score) {
    t.tracking_score = track.data.tracking_score;
  }
  return t;
};

export const mapTracks = async (
  tracks: Track[],
  minimal = false,
): Promise<ApiTrackResponse[]> => {
  if (!minimal) {
    // TODO: Parallelize with a pool of S3Clients
    for (const track of tracks) {
      track.data = (await Track.getTrackData(
        track.id,
      )) as MinimalTrackRequestData;
    }
  }
  const t = tracks.map((x) => mapTrack(x, minimal));
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
    recordingId: tag.RecordingId,
    version: tag.version,
    createdAt: (tag.createdAt as unknown as Date).toISOString(),
    comment: tag.comment,
  };
  if (tag.taggerId) {
    result.taggerId = tag.taggerId;
    if (tag.tagger) {
      result.taggerName = tag.tagger.userName;
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

const ifNotNull = <T>(val: T | null) => {
  if (val !== null) {
    return val;
  }
  return undefined;
};

export const mapRecordingResponse = async (
  recording: Recording,
  minimal = false,
): Promise<ApiThermalRecordingResponse | ApiAudioRecordingResponse> => {
  const cameraTypes = [RecordingType.ThermalRaw, RecordingType.InfraredVideo];
  let tracks: ApiTrackResponse[] = [];
  if (recording.Tracks) {
    tracks = await mapTracks(recording.Tracks, minimal);
  }
  try {
    const commonRecording: ApiRecordingResponse = {
      id: recording.id,
      deviceId: recording.DeviceId,
      duration: recording.duration,
      location: recording.location,
      deviceName: recording.Device?.deviceName,
      groupId: recording.GroupId,
      groupName: recording.Group?.groupName,
      processing: recording.processing || false,
      processingState: recording.processingState,
      recordingDateTime: recording.recordingDateTime?.toISOString(),
      stationName: recording.Station?.name,
      type: recording.type,
      tags: (recording.Tags && mapTags(recording.Tags)) || [],
      tracks,
    };
    const comment = ifNotNull(recording.comment);
    const stationId = ifNotNull(recording.StationId);
    const redacted = ifNotNull(recording.redacted);
    const fileHash = ifNotNull(recording.rawFileHash);
    const mimeType = ifNotNull(recording.rawMimeType);
    const status = recording.additionalMetadata?.status;
    if (comment) {
      commonRecording.comment = comment;
    }
    if (stationId) {
      commonRecording.stationId = stationId;
    }
    if (fileHash) {
      commonRecording.fileHash = fileHash;
    }
    if (mimeType) {
      commonRecording.rawMimeType = mimeType;
    }
    if (status) {
      commonRecording.status = status;
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
      if (redacted !== undefined) {
        commonRecording.redacted = redacted;
      }
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

export interface ApiTracksResponseSuccess {
  tracks: ApiTrackResponse[];
}

export interface ApiTracksResponseSuccess {
  track: ApiTrackResponse;
}

export interface ApiUpdateRecordingRequestBody {
  updates: ApiRecordingUpdateRequest;
}

export interface ApiRecordingResponseSuccess {
  recording: ApiGenericRecordingResponse;
}

export interface ApiRecordingTagRequestBody {
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
   *     "predictions":[{"model_id":1, "confident_tag":"unidentified", "confidence": 0.6, "classify_time":0.3, "classify_time": 0.6, "predictions": [[0.6,0.3,0.1]], "label":"cat", "all_class_confidences": {"cat":0.6, "rodent":0.3, "possum":0.1} }],
   *    }],
   *    "models": [{ "id": 1, "name": "inc3" }]
   * }
   */

  // FIXME: Replace with typed versions
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
    validateFields([
      // NOTE: Primarily used in testing, allows us to backdate the last connection time of an uploading device
      optionalDateOf(query("at-time")),
    ]),
    uploadGenericRecordingFromDevice(),
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
      param("groupName"),
    ),
    uploadGenericRecordingOnBehalfOfDevice(),
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
   * you don't have access to the ID the deviceName can be used instead in its
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
      booleanOf(query("only-active"), false),
    ]),
    fetchAuthorizedRequiredDeviceById(param("deviceId")),
    uploadGenericRecordingOnBehalfOfDevice(),
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
      const devices = (response.locals.devices as Device[]).filter(
        ({ deviceName }) => deviceName === targetDeviceName,
      );
      if (devices.length !== 1) {
        return next(
          new ClientError(
            `Could not find unique device with name ${targetDeviceName} - try the /api/v1/recordings/device/:deviceName/group/:groupName endpoint.`,
          ),
        );
      }
      response.locals.device = devices.pop();
      next();
    },
    uploadGenericRecordingOnBehalfOfDevice(),
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
          return Recording.isValidTagMode(value);
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

      if ("deleted" in request.query) {
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
          new BadRequestError(`Invalid recording type '${type}' supplied`),
        );
      }

      const result = await queryRecordings(
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
        },
      );

      return successResponse(response, "Completed query.", {
        limit: request.query.limit,
        offset: request.query.offset,
        count: result.count,
        rows: await Promise.all(
          result.rows.map((x) => mapRecordingResponse(x, true)),
        ),
      });
    },
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
          return Recording.isValidTagMode(value);
        }),
      query("hideFiltered").default(false).isBoolean().toBoolean(),
    ]),
    parseJSONField(query("order")),
    parseJSONField(query("where")),
    parseJSONField(query("tags")),
    async (request: Request, response: Response, next: NextFunction) => {
      return next(
        new ClientError(
          "Bulk delete is currently disabled for performance reasons",
        ),
      );

      const { viewAsSuperUser, tags = [], order, where = {} } = response.locals;
      const { tagMode, limit, offset, type, hideFiltered, exclusive } =
        request.query;
      const parsedLimit = limit ? parseInt(limit as string) : 1000;
      const limitInt = Math.min(parsedLimit, 1000);

      try {
        const values = await bulkDelete(
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
          },
        );
        return successResponse(
          response,
          `Deleted Recordings: ${JSON.stringify(values)}`,
          { ids: values },
        );
      } catch (e: unknown) {
        let message = "unknown error";
        if (e) {
          log.error(e);
          message = (e as Error).message;
        }
        return next(new ClientError(message));
      }
    },
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
      return next(
        new ClientError(
          "Bulk undelete is currently disabled for performance reasons",
        ),
      );
      const { ids } = request.body;
      const { viewAsSuperUser } = response.locals;
      const userId = response.locals.requestUser.id;
      try {
        const requireGroupMembership = viewAsSuperUser
          ? []
          : [
              {
                model: User,
                attributes: [] as FindAttributeOptions,
                required: true,
                where: { id: userId },
                through: { where: { admin: true } },
              },
            ];
        const recordingsToUndelete = await Recording.findAll({
          where: {
            id: ids,
            deletedAt: { [Op.ne]: null },
          },
          include: [
            {
              model: Group,
              attributes: [],
              required: !viewAsSuperUser,
              include: requireGroupMembership,
            },
          ],
          attributes: ["id", "type", "DeviceId", "GroupId", "StationId"],
        });
        const idsToUndelete = recordingsToUndelete.map(({ id }) => id);
        if (idsToUndelete.length === 0) {
          return next(
            new ClientError(
              "No recordings to undelete",
              HttpStatusCode.Forbidden,
            ),
          );
        }
        await Recording.update(
          { deletedAt: null, deletedBy: null },
          { where: { id: idsToUndelete } },
        );

        // FIXME: Need to fixup visits for each of these recordings.

        // For each set of recordings to delete or undelete, we need to get the unique stations and devices,
        // and then fixup the latest recording times for each device and station and group.
        const uniqueByStation = new Map();
        const uniqueByDevice = new Map();
        const uniqueByGroup = new Map();
        for (const recording of recordingsToUndelete) {
          const stationKey = `${recording.StationId}_${recording.type}`;
          const deviceKey = `${recording.DeviceId}_${recording.type}`;
          const groupKey = `${recording.GroupId}_${recording.type}`;
          if (!uniqueByStation.has(stationKey)) {
            uniqueByStation.set(stationKey, recording);
          }
          if (!uniqueByDevice.has(deviceKey)) {
            uniqueByDevice.set(deviceKey, recording);
          }
          if (!uniqueByGroup.has(groupKey)) {
            uniqueByGroup.set(groupKey, recording);
          }
        }
        const fixups = [];
        for (const recording of uniqueByStation.values()) {
          fixups.push(updateRecordingTimeBookkeeping(recording));
        }
        for (const recording of uniqueByDevice.values()) {
          fixups.push(updateRecordingTimeBookkeeping(recording));
        }
        for (const recording of uniqueByGroup.values()) {
          fixups.push(updateRecordingTimeBookkeeping(recording));
        }
        if (fixups.length) {
          await Promise.all(fixups);
        }
        return successResponse(response, `Recordings Restored: ${ids}`);
      } catch (e) {
        log.error(e);
        return next(
          new ClientError(
            "Unable to restore recordings",
            HttpStatusCode.Unprocessable,
          ),
        );
      }
    },
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
            { count: 101 },
          );
        }
      },
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
          return Recording.isValidTagMode(value);
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
          new BadRequestError(`Invalid recording type '${type}' supplied`),
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
      if ("deleted" in request.query) {
        if (deleted) {
          options.where.deletedAt = { [Op.ne]: null };
        } else {
          options.where.deletedAt = { [Op.eq]: null };
        }
      }

      if (type && typeof options.where === "object") {
        options.where = { ...options.where, type };
      }
      const builder = new Recording.queryBuilder().init(user.id, options);

      // FIXME: Are we ever actually a `findAndCountAll` context where distinct: true makes sense?
      (builder.query as FindAndCountOptions<Recording>).distinct = true;
      try {
        const count = await Recording.count(builder.get());
        return successResponse(response, "Completed query.", { count });
      } catch (e: unknown) {
        let message = "unknown error";
        if (e) {
          log.error(e);
          message = (e as Error).message;
        }
        return next(new ClientError(message));
      }
    },
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
   * @apiSuccess {String} rows.labeler Name of the user who created the track tag or AI.
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
        response.locals.requestUser.id,
        response.locals.viewAsSuperUser,
        Boolean(request.query.includeAI),
        request.query.type.toString(),
        response.locals.exclude,
        request.query.offset && parseInt(request.query.offset as string),
        request.query.limit && parseInt(request.query.limit as string),
      );
      return successResponse(response, "Completed query.", {
        rows: result,
      });
    },
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
    fetchAuthorizedRequiredFullRecordingById(param("id")),
    async (request: Request, response: Response) => {
      const recordingItem = response.locals.recording as Recording;
      const recording = await mapRecordingResponse(response.locals.recording);
      if (request.query["requires-signed-url"]) {
        let rawJWT: string;
        let cookedJWT: string;
        let rawSize: number;
        let cookedSize: number;
        if (recordingItem.fileKey) {
          cookedJWT = signedToken(
            recordingItem.fileKey,
            recordingItem.getFileName(),
            recordingItem.fileMimeType,
            response.locals.requestUser.id,
            recordingItem.GroupId,
          );
          if (
            "cookedSize" in recordingItem &&
            typeof recordingItem.fileSize === "number"
          ) {
            cookedSize = recordingItem.fileSize;
          } else {
            cookedSize = await util.getS3ObjectFileSize(recordingItem.fileKey);
          }
        }
        if (recordingItem.rawFileKey) {
          rawJWT = signedToken(
            recordingItem.rawFileKey,
            recordingItem.getRawFileName(),
            recordingItem.rawMimeType,
            response.locals.requestUser.id,
            recordingItem.GroupId,
          );
          if (
            "rawFileSize" in recordingItem &&
            typeof recordingItem.rawFileSize === "number"
          ) {
            rawSize = recordingItem.rawFileSize;
          } else {
            rawSize = await util.getS3ObjectFileSize(recordingItem.rawFileKey);
          }
        }
        const payload: {
          recording: ApiRecordingResponse;
          rawSize?: number;
          fileSize?: number;
          downloadFileJWT?: string;
          downloadRawJWT?: string;
        } = {
          recording,
        };
        if (rawSize) {
          payload.rawSize = rawSize;
        }
        if (cookedSize) {
          payload.fileSize = cookedSize;
        }
        if (cookedJWT) {
          payload.downloadFileJWT = cookedJWT;
        }
        if (rawJWT) {
          payload.downloadRawJWT = rawJWT;
        }
        return successResponse(response, payload);
      } else {
        return successResponse(response, {
          recording,
        });
      }
    },
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
    },
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
    fetchAuthorizedRequiredFlatRecordingById(param("id")),
    async (request: Request, response: Response, next: NextFunction) => {
      const recordingItem = response.locals.recording;
      const fileKey = recordingItem.rawFileKey;
      const fileMimeType = recordingItem.rawMimeType;
      const fileSize = recordingItem.rawFileSize;
      if (!fileKey) {
        return next(new ClientError("Recording has no raw file key."));
      }
      let fileExt = "raw";
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
      return streamS3Object(
        request,
        response,
        fileKey,
        fileName,
        fileMimeType || "application/octet-stream",
        response.locals.requestUser.id,
        recordingItem.GroupId,
        fileSize,
      );
    },
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
    async (request: Request, response: Response, next: NextFunction) => {
      if (!request.query.trackId) {
        await fetchUnauthorizedRequiredFullRecordingById(param("id"))(
          request,
          response,
          next,
        );
      } else {
        // If we're looking for a specific track thumbnail, we don't need the full recording.
        await fetchUnauthorizedRequiredFlatRecordingById(param("id"))(
          request,
          response,
          next,
        );
      }
    },
    async (request: Request, response: Response, next: NextFunction) => {
      const rec = response.locals.recording;
      const fileKey = rec.rawFileKey;
      const mimeType = "image/png";
      //const ext = "png";

      if (!fileKey) {
        return next(new ClientError("Rec has no raw file key."));
      }
      let trackId: TrackId;
      //let filename: string;
      if (request.query.trackId) {
        trackId = request.query.trackId as unknown as number;
        //filename = `${rec.id}-${trackId}-thumb.${ext}`;
      }
      // else {
      //   filename = `${rec.id}-thumb.${ext}`;
      // }

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
      const data = await getThumbnail(rec, trackId);
      if (data) {
        response.setHeader(
          "Content-disposition",
          //"attachment; filename=" + filename,
          "inline",
        );
        response.setHeader("Content-type", mimeType);
        response.setHeader("Content-Length", data.length);
        response.write(data, "binary");
        return response.end(null, "binary");
      } else {
        // FIXME - if the thumbnail doesn't exist, lets create it, even if the request takes a while.
        return next(new ClientError("No thumbnail exists"));
      }
    },
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
    fetchAuthorizedRequiredFlatRecordingById(param("id")),
    async (request: Request, response: Response) => {
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
        const trackIds = (await recording.getTracks()).map(({ id }) => id);
        for (const trackId of trackIds) {
          const trackTags = await TrackTag.findAll({
            where: {
              TrackId: trackId,
            },
          });
          for (const trackTag of trackTags) {
            await util
              .deleteS3Object(`/TrackTag/${trackTag.id}`)
              .catch((err) => {
                log.warning(err);
              });
          }
          await util.deleteS3Object(`/Track/${trackId}`).catch((err) => {
            log.warning(err);
          });
        }

        try {
          await recording.destroy({ force: true });
          deleted = true;
        } catch (_e) {
          // ..
        }
        if (deleted) {
          // Delete thumbs
          await util.deleteS3Object(thumbKey).catch((err) => {
            log.warning(err);
          });
          // NOTE: There can be other thumbnails related to appending tracks, so delete those too.
          if (deleted && rawFileKey) {
            await util.deleteS3Object(rawFileKey).catch((err) => {
              log.warning(err);
            });
            for (const trackId of trackIds) {
              await util
                .deleteS3Object(`${rawFileKey}-${trackId}-thumb`)
                .catch((err) => {
                  log.warning(err);
                });
            }
          }
        }
        if (deleted && fileKey) {
          await util.deleteS3Object(fileKey).catch((err) => {
            log.warning(err);
          });
        }
      }
      await Promise.all([
        updateRecordingTimeBookkeeping(recording),
        Visit.rebuildForRecording(recording),
      ]);
      if (softDelete) {
        return successResponse(response, "Deleted recording.");
      } else {
        return successResponse(response, "Hard deleted recording.");
      }
    },
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
   * @apiBody {JSON} [updates] Data containing attributes for tag.
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
    fetchAuthorizedRequiredFlatRecordingById(param("id")),
    parseJSONField(body("updates")),
    async (_request: Request, response: Response) => {
      await response.locals.recording.update(
        response.locals.updates as ApiRecordingUpdateRequest,
      );
      // NOTE: Updates via this API cannot update keys that are used to determine Visit membership,
      //  therefore, we don't need to recalculate Visits after this call.
      return successResponse(response, "Updated recording.");
    },
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
    (_request: Request, response: Response, next: NextFunction) => {
      // Make sure we restrict this to deleted recordings
      response.locals.deleted = true;
      next();
    },
    fetchAuthorizedRequiredFlatRecordingById(param("id")),
    async (_request: Request, response: Response) => {
      const recording = response.locals.recording;
      await recording.update({
        deletedAt: null,
        deletedBy: null,
      });
      await Promise.all([
        updateRecordingTimeBookkeeping(recording),
        Visit.rebuildForRecording(recording),
      ]);
      return successResponse(response, "Undeleted recording.");
    },
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
      body("algorithm")
        .optional()
        .custom(jsonSchemaOf(ApiAlgorithmDataRequestSchema)),
    ]),
    parseJSONField(body("data")),
    parseJSONField(body("algorithm")),
    fetchAuthorizedRequiredFlatRecordingById(param("id")),
    async (_request: Request, response: Response) => {
      const algorithm = response.locals.algorithm
        ? response.locals.algorithm
        : "{'status': 'User added.'}";
      const algorithmDetail = await DetailSnapshot.getOrCreateMatching(
        "algorithm",
        algorithm,
      );
      const data = {
        userId: response.locals.requestUser.id,
        ...response.locals.data,
      };
      let trackId: TrackId = 1;
      let algorithmId = 1;
      const deviceId = response.locals.recording.DeviceId;
      const groupId = response.locals.recording.GroupId;
      const atTime = response.locals.recording.recordingDateTime;
      const positions = data.positions;
      let discardMaskedTrack = false;
      if (
        positions &&
        response.locals.recording.type === RecordingType.ThermalRaw
      ) {
        discardMaskedTrack = await trackIsMasked(
          deviceId,
          groupId,
          atTime,
          positions,
        );
      }
      if (!discardMaskedTrack) {
        const newTrack: {
          startSeconds: number;
          endSeconds: number;
          minFreqHz: number | null;
          maxFreqHz: number | null;
          data: unknown;
          AlgorithmId: number;
        } = {
          startSeconds: data.start_s || 0,
          endSeconds: data.end_s || 0,
          minFreqHz: null,
          maxFreqHz: null,
          data,
          AlgorithmId: algorithmDetail.id,
        };
        if (response.locals.recording.type === RecordingType.Audio) {
          newTrack.minFreqHz = data.minFreq || 0;
          newTrack.maxFreqHz = data.maxFreq || 0;
        }
        const track = await response.locals.recording.addTrack(newTrack);
        await Track.saveTrackData(track.id, data);
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
    },
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
    fetchAuthorizedRequiredFullRecordingById(param("id")),
    async (_request: Request, response: Response) => {
      const tracks = await mapTracks(response.locals.recording.Tracks || []);
      return successResponse(response, "OK.", {
        tracks,
      });
    },
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
    fetchAuthorizedRequiredFlatRecordingById(param("id")),
    fetchUnauthorizedRequiredTrackById(param("trackId")),
    async (_request: Request, response: Response) => {
      const track = response.locals.track;
      const trackMeta = await Track.getTrackData(track.id);
      if (Object.keys(trackMeta).length !== 0) {
        track.data = trackMeta;
      }
      track.TrackTags = await TrackTag.findAll({
        where: {
          TrackId: track.id,
        },
        include: [
          {
            model: TrackTagUserData,
            attributes: ["gender", "maturity"],
            required: false,
          },
        ],
      });
      for (const tag of track.TrackTags || []) {
        tag.data = await Track.getTrackTagData(tag.id);
      }
      return successResponse(response, "OK.", {
        track: mapTrack(track),
      });
    },
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
      query("soft-delete").default(true).isBoolean().toBoolean(),
    ]),
    fetchAuthorizedRequiredFlatRecordingById(param("id")),
    fetchUnauthorizedRequiredTrackById(param("trackId")),
    async (request: Request, response: Response, next: NextFunction) => {
      // Make sure the track belongs to the recording (this could
      // probably be one query)
      const track = response.locals.track as Track;
      if (track.RecordingId === response.locals.recording.id) {
        if (request.query["soft-delete"]) {
          await response.locals.track.archive();
        } else {
          await openS3()
            .deleteObject(`Track/${track.id}`)
            .catch((e) => log.warning(e));
          const trackTags = await TrackTag.findAll({
            where: {
              TrackId: track.id,
            },
          });
          for (const trackTag of trackTags) {
            await openS3()
              .deleteObject(`TrackTag/${trackTag.id}`)
              .catch((e) => log.warning(e));
          }
          await track.destroy();
        }
        return successResponse(response, "Track deleted.");
      } else {
        return next(new ClientError("No such track."));
      }
    },
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
    fetchAuthorizedRequiredFlatRecordingById(param("id")),
    fetchUnauthorizedRequiredTrackById(param("trackId")),
    parseJSONField(body("data")),
    async (_request: Request, response: Response, next: NextFunction) => {
      // Make sure track actually belongs to the recording we have permissions for.
      if (response.locals.track.RecordingId === response.locals.recording.id) {
        return next();
      } else {
        return next(
          new FatalError("Track does not belong to specified recording"),
        );
      }
    },
    async (request: Request, response: Response, next: NextFunction) => {
      const requestUser = response.locals.requestUser;
      if (request.body.what === "unknown") {
        request.body.what = "unidentified";
      }
      const path =
        request.body.what in LabelPaths
          ? (LabelPaths as Record<string, string>)[request.body.what]
          : null;
      try {
        const newTag = TrackTag.build({
          what: request.body.what,
          confidence: request.body.confidence,
          automatic: request.body.automatic, // FIXME: Should always be false when called by a user
          UserId: requestUser.id,
          TrackId: response.locals.track.id,
          path,
          used: true,
        }) as TrackTag;
        const tag = await response.locals.track.replaceTag(
          newTag,
          response.locals.data,
        );
        if (tag) {
          // FIXME(static-visits): Can we make this a cheaper patch to the existing visit?
          //  Just check if there's not already a user tag for this visit first, and if not, this becomes the
          //  classification for this visit.
          await Visit.rebuildForRecording(response.locals.recording);
          return successResponse(response, "Track tag added.", {
            trackTagId: tag.id,
          });
        } else {
          // FIXME - should probably not be success, 304 not changed?
          return successResponse(response, "Tag already exists.");
        }
      } catch (_e) {
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
    ...replaceTrackTagParams,
  );

  // TODO: Do any external API consumers use this legacy endpoint, or can it be removed?
  app.post(
    `${apiUrl}/:id/tracks/:trackId/replaceTag`,
    ...replaceTrackTagParams,
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
    fetchAuthorizedRequiredFlatRecordingById(param("id")),
    fetchUnauthorizedRequiredTrackById(param("trackId")),
    async (request: Request, response: Response, next: NextFunction) => {
      if (response.locals.track.RecordingId === response.locals.recording.id) {
        try {
          const track: Track = response.locals.track;
          // FIXME: This should have tests, if it is being used by anyone.
          const existingData = await Track.getTrackData(track.id);
          const updatedData = { ...existingData, ...request.body.data };
          await Promise.all([
            Track.saveTrackData(track.id, updatedData),
            track.update({
              minFreqHz: updatedData.minFreq || null,
              maxFreqHz: updatedData.maxFreq || null,
              startSeconds: updatedData.start_s || null,
              endSeconds: updatedData.end_s || null,
            }),
          ]);
          return successResponse(response, "Track data updated.");
        } catch (e) {
          return next(
            new FatalError(`Server error updating track data: ${e.toString()}`),
          );
        }
      } else {
        return next(
          new ClientError("Track does not belong to specified recording"),
        );
      }
    },
  );

  /**
   * @api {patch} /api/v1/recordings/:id/tracks/:trackId/tags/:tagId
   * Updates a Track Tag with new request body
   * @apiDescription Adds or Replaces track tag based off:
   * if tag already exists for this user, ignore request
   * Add tag if it is an additional tag e.g. "Part"
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
    fetchAuthorizedRequiredFlatRecordingById(param("id")),
    fetchUnauthorizedRequiredTrackById(param("trackId")),
    parseJSONField(body("data")),
    async (request: Request, response: Response, next: NextFunction) => {
      if (response.locals.track.RecordingId !== response.locals.recording.id) {
        return next(
          new ClientError("Track does not belong to specified recording"),
        );
      }
      try {
        await response.locals.track.updateTag(
          request.params.tagId,
          request.body.updates,
        );
        await Visit.rebuildForRecording(response.locals.recording);
        return successResponse(response, "Tag has been updated.");
      } catch (_e) {
        return next(new FatalError("Server error replacing tag."));
      }
    },
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
    fetchAuthorizedRequiredFlatRecordingById(param("id")),
    fetchUnauthorizedRequiredTrackById(param("trackId")),
    async (_request: Request, response: Response) => {
      await response.locals.track.unarchive();
      // FIXME(static-visits): recalc
      await Visit.rebuildForRecording(response.locals.recording);
      return successResponse(response, "Undeleted track.");
    },
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
      body("data").isJSON().optional(),
    ]),
    // FIXME - JSON schema for allowed data? At least a limit to how many
    // chars etc?
    parseJSONField(body("data")),
    async (request: Request, response: Response, next: NextFunction) => {
      if (request.body.tagJWT) {
        return next();
      } else {
        await fetchAuthorizedRequiredFlatRecordingById(param("id"))(
          request,
          response,
          next,
        );
      }
    },
    async (request: Request, response: Response, next: NextFunction) => {
      let track: Track;
      const trackId = request.params.trackId as unknown as TrackId;
      const recordingId = request.params.id as unknown as RecordingId;
      if (trackId === 1 && request.body.automatic) {
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
            config.server.passportSecret,
          ) as JwtPayload;
          if (
            jwtDecoded._type === "tagPermission" &&
            jwtDecoded.recordingId === recordingId
          ) {
            track = await Track.findByPk(trackId);
          } else {
            return next(
              new AuthorizationError(
                "JWT does not have permissions to tag this recording",
              ),
            );
          }
        } catch (_e) {
          return next(new AuthorizationError("Failed to verify JWT."));
        }
      } else {
        // Otherwise, just check that the user can update this track.
        track = await (response.locals.recording as Recording).getTrack(
          trackId,
        );
      }
      if (!track) {
        return next(new ClientError("Track does not exist"));
      }
      // Ensure track belongs to this recording.
      if (track.RecordingId !== recordingId) {
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
        response.locals.requestUser.id,
      );

      // FIXME(static-visits): recalc
      return successResponse(response, "Track tag added.", {
        trackTagId: tag.id,
      });
    },
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
    fetchAuthorizedRequiredFlatRecordingById(param("id")),
    async (request: Request, response: Response, next: NextFunction) => {
      let track: Track;
      const trackId = request.params.trackId as unknown as TrackId;
      const recordingId = request.params.id as unknown as RecordingId;
      const trackTagId = request.params.trackTagId as unknown as TrackTagId;
      if (request.query.tagJWT) {
        // If there's a tagJWT, then we don't need to check the users'
        // recording update permissions.
        const tagJWT = request.query.tagJWT as string;
        try {
          const jwtDecoded = jwt.verify(
            tagJWT,
            config.server.passportSecret,
          ) as JwtPayload;
          if (
            jwtDecoded._type === "tagPermission" &&
            jwtDecoded.recordingId === recordingId
          ) {
            track = await Track.findByPk(trackId);
          } else {
            return next(
              new AuthorizationError(
                "JWT does not have permissions to tag this recording",
              ),
            );
          }
        } catch (_e) {
          return next(new AuthorizationError("Failed to verify JWT."));
        }
      } else {
        track = await response.locals.recording.getTrack(trackId);
      }
      if (!track) {
        return next(new AuthorizationError("Track does not exist"));
      }
      // Ensure track belongs to this recording.
      if (track.RecordingId !== response.locals.recording.id) {
        return next(
          new AuthorizationError("Track does not belong to recording"),
        );
      }

      const tag = await track.getTrackTag(trackTagId);
      if (!tag) {
        return next(new AuthorizationError("No such track tag."));
      }
      try {
        // Try to remove additional data from object storage
        await openS3().deleteObject(`TrackTag/${tag.id}`);
      } catch (_e) {
        // No tag data to delete.
      }

      await tag.destroy();
      await track.updateIsFiltered();
      // FIXME(static-visits): recalc
      await Visit.rebuildForRecording(response.locals.recording);
      return successResponse(response, "Track tag deleted.");
    },
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
    fetchAuthorizedRequiredFlatRecordingById(param("id")),
    fetchUnauthorizedRequiredRecordingTagById(param("tagId")),
    async (_request: Request, response: Response) => {
      await response.locals.tag.destroy();
      return successResponse(response, "Deleted tag.");
    },
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
    fetchAuthorizedRequiredFlatRecordingById(param("id")),
    parseJSONField(body("tag")),
    async (_request: Request, response: Response) => {
      const tagInstance = await addTag(
        response.locals.requestUser,
        response.locals.recording.id,
        response.locals.tag,
      );
      return successResponse(response, "Added new tag.", {
        tagId: tagInstance.id,
      });
    },
  );

  /**
   * @api {get} /api/v1/recordings/for-project/:projectId
   * Bulk query recordings by project
   * @apiName BulkQueryRecordingsInProject
   * @apiGroup Recordings
   *
   * @apiUse V1UserAuthorizationHeader
   * @apiParam {Integer} projectId Project id to query
   * @apiQuery {String="user"} [view-mode] Allow a super-user to view as a
   * regular user
   * @apiQuery {Boolean} [debug] Output SQL debug information as an HTML response.
   * @apiQuery {Number} [max-results] Max number of records to be returned.
   * @apiQuery {String} [tag-mode] Only return recordings with specific types of tags. Valid values:
   * <ul>
   * <li>any: match recordings with any (or no) tag
   * <li>untagged: match only recordings with no tags
   * <li>tagged: match only recordings which have been tagged
   * <li>no-human: match only recordings which are untagged or have been automatically tagged
   * <li>automatic-only: match only recordings which have been automatically tagged
   * <li>human-only: match only recordings which have been manually tagged
   * <li>automatic+human: match only recordings which have been both automatically & manually tagged
   * </ul>
   * @apiQuery {String[]} [tagged-with] Animal track-tags you want to match on
   * @apiQuery {String[]} [labelled-with] Recording labels you want to filter on, e.g 'cool'
   * @apiQuery {String} [from] Iso formatted date string for earliest recordingDateTime to query
   * @apiQuery {String} [until] Iso formatted date string for latest recordingDateTime to query
   * @apiQuery {Number} [duration] Filter out recordings that are less than `duration`
   * @apiQuery {Boolean} [include-false-positives] Recordings consisting of only false-positives are filtered out by default; set this value to `true` to include them
   * @apiQuery {Boolean} [time-sensitive] We'd rather get back some results in a reasonable time, than get all the results we asked for.
   * @apiQuery {Number[]} [devices] Include only recordings that belong to any of the `DeviceId`s supplied
   * @apiQuery {Boolean} [sub-class-tags] `true` by default, setting this to `false` will turn off hierarchical animal tag matching.
   * @apiQuery {Boolean} [include-deleted] `false` by default, setting this to `true` will include deleted recordings in the query.
   * @apiQuery {Boolean} [with-total-count] `false` by default, setting this to `true` will return a total count for the query along with recordings.
   * @apiQuery {String} [processing-state] Return only recordings matching a given processing state
   * @apiQuery {Number[]} [locations] Include only recordings that are located within any of the `LocationId`s supplied
   * @apiQuery {String[]} [types] Include only recordings that match of one of the `RecordingType`s supplied
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/for-project/:projectId`,
    extractJwtAuthorizedUser,
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
      query("devices")
        .optional()
        .toArray()
        .isArray({ min: 1 })
        .custom(isIntArray)
        .withMessage(
          "Must be an id, or an array of ids.  For example, 'devices=32' or 'devices=32&devices=33&devices=34'",
        ),
      booleanOf(query("include-false-positives"), false),
      booleanOf(query("sub-class-tags"), true),
      booleanOf(query("include-deleted"), false),
      booleanOf(query("time-sensitive"), false),
      booleanOf(query("status-recordings"), false),
      booleanOf(query("count-only"), false),
      query("tag-mode")
        .default(TagMode.Any)
        .isString()
        .custom((value: string) => {
          const allowedTagModes = [
            TagMode.Any,
            TagMode.UnTagged,
            TagMode.Tagged,
            TagMode.HumanOnly,
            TagMode.NoHuman,
            TagMode.HumanTagged,
            TagMode.AutomaticallyTagged,
            TagMode.AutomaticOnly,
            TagMode.AutomaticHumanUrlSafe,
          ];
          const invalidTagMode = !allowedTagModes.includes(value as TagMode);
          if (invalidTagMode) {
            throw new Error(format("Invalid tag mode '%s'.", value));
          }
          return true;
        }),
      integerOf(query("max-results"), 200),
      query("processing-state")
        .optional()
        .isString()
        .custom((value: string) => {
          const invalidProcessingState = !Object.values(
            RecordingProcessingState,
          ).includes(value as RecordingProcessingState);
          if (invalidProcessingState) {
            throw new Error(format("Invalid processing state '%s'.", value));
          }
          return true;
        }),
      query("locations")
        .optional()
        .toArray()
        .isArray({ min: 1 })
        .custom(isIntArray)
        .withMessage(
          "Must be an id, or an array of ids.  For example, 'locations=32' or 'locations=32&locations=33&locations=34'",
        ),
      query("types")
        .optional()
        .toArray()
        .isArray({ min: 1 })
        .custom((value: string[]) => {
          const allowedTypes = [...Object.values(RecordingType), "thermal"];
          const invalidTypes = value.filter(
            (type) => !allowedTypes.includes(type),
          );
          if (invalidTypes.length) {
            throw new Error(
              format(
                "Invalid recording type(s) '%s'.",
                invalidTypes.join("', '"),
              ),
            );
          }
          return true;
        }),
    ]),
    fetchAuthorizedRequiredGroupByNameOrId(param("projectId")),
    //fetchUnauthorizedRequiredGroupByNameOrId(param("projectId")),
    async (request: Request, response: Response, _next: NextFunction) => {
      // TODO: Allow this API to be used for retrieving the latest status recording.
      try {
        const query = request.query;
        const projectId = response.locals.group.id;
        // Return a max of 200 recordings at once
        let limit = Math.min(query["max-results"] as unknown as number, 1000);
        let tagMode = query["tag-mode"] as TagMode;
        const taggedWith =
          tagMode === TagMode.UnTagged
            ? []
            : (query["tagged-with"] as string[]) || [];
        if (tagMode === TagMode.Any && taggedWith.length !== 0) {
          tagMode = TagMode.Tagged;
        }
        const labelledWith = (query["labelled-with"] as string[]) || [];
        const subClassTags = query["sub-class-tags"] as unknown as boolean;
        const countOnly = query["count-only"] as unknown as boolean;
        const types = ((query["types"] as string[]) || []).map((x) => {
          if (x === "thermal") {
            return "thermalRaw";
          }
          return x;
        }) as RecordingType[];
        const includeDeletedRecordings = query[
          "include-deleted"
        ] as unknown as boolean;
        const statusRecordingsOnly = query[
          "status-recordings"
        ] as unknown as boolean;
        const locations = ((query.locations || []) as string[]).map(Number);
        const devices = ((query.devices || []) as string[]).map(Number);
        const minDuration = query.duration as unknown as number;
        const includeFalsePositives =
          (query["include-false-positives"] as unknown as boolean) ||
          taggedWith.includes("false-positive");
        const includeFilteredTracks =
          includeFalsePositives || tagMode === TagMode.UnTagged;
        const processingState = query["processing-state"] as unknown as
          | RecordingProcessingState
          | undefined;
        let fromDate = query.from as unknown as Date | undefined;
        const untilDate = query.until as unknown as Date | undefined;

        // NOTE: The query strategy used here is to do two passes:
        //  The first to find recordings that match the tag constraints, and the second to query those recordings getting
        //  *all* tags and labels associated with each recording, not just those that match the constraints.
        //  This turns out to be a *lot* faster than having inline sub-queries checking the constraints in an inner loop.
        //  The only downside of this approach is that you don't know ahead of time how many records will be returned
        //  for the query.  If this limit is important, you can always re-query until the desired number is met, or you
        //  run out of results for the query.  In practice for our front-end code, the number of items returned is not
        //  important, because we'll just ask for more when we need them to display.

        const sqlPasses: string[] = [];
        const sqlTimings: number[] = [];
        const now = performance.now();
        const startTime = performance.now();
        const timeLimitForRequest = 1500;
        const queryIsTimeSensitive = query[
          "time-sensitive"
        ] as unknown as boolean;

        const loggingFn =
          (sqlPasses: string[], sqlTimings: number[]) =>
          (message: string, time: number) => {
            const store = asyncLocalStorage.getStore();
            const dbQueryCount = store?.get("queryCount") as number;
            const dbQueryTime = store?.get("queryTime") as number;
            store?.set("queryCount", dbQueryCount + 1);
            store?.set("queryTime", dbQueryTime + time);
            if (query.debug) {
              sqlPasses.push(
                sqlFormat(message.replace("Executed (default): ", ""), {
                  language: "postgresql",
                }),
              );
              sqlTimings.push(time);
            }
          };
        const logging = query.debug
          ? loggingFn(sqlPasses, sqlTimings)
          : undefined;
        const latestDate = (a: Date, b: Date): Date => {
          if (a > b) {
            return new Date(a);
          }
          return new Date(b);
        };
        const dateTimeMinusThreeMonths = (date: Date): Date => {
          const d = new Date(date);
          d.setDate(d.getDate() - 90);
          return d;
        };
        // NOTE: On large projects with lots of recordings over longer time-spans, this will always get slow if we request
        //  recordings over "All time".  To help with this, we start with a smaller timespan and progressively widen it
        //  until we get the number of `limit` to return.  Typically a window of up to 3 months seems to remain responsive.

        let fromDateTime: Date;
        let untilDateTime: Date;
        // NOTE: Earliest time in Cacophony DB
        const earliestAllowedDate = new Date("2017-11-01 17:06:58.015 +1300");
        if (!untilDate) {
          // NOTE: In order to do less queries when an until date isn't supplied,
          //  we do an initial query with a limit of 1 where we find the latest result for the query.
          const rec = await queryRecordingsInProject(
            sequelize,
            projectId,
            minDuration,
            statusRecordingsOnly,
            includeDeletedRecordings,
            types,
            processingState,
            devices,
            locations,
            taggedWith,
            subClassTags,
            labelledWith,
            tagMode,
            includeFilteredTracks,
            1,
            undefined,
            undefined,
            logging,
          );
          if (rec.length === 0) {
            return successResponse(response, "Got recordings", {
              recordings: [],
            });
          } else {
            untilDateTime = new Date(rec[0].recordingDateTime);
            untilDateTime.setMinutes(untilDateTime.getMinutes() + 1);
          }
        } else {
          untilDateTime = new Date(untilDate);
        }
        if (!fromDate) {
          const rec = await queryRecordingsInProject(
            sequelize,
            projectId,
            minDuration,
            statusRecordingsOnly,
            includeDeletedRecordings,
            types,
            processingState,
            devices,
            locations,
            taggedWith,
            subClassTags,
            labelledWith,
            tagMode,
            includeFilteredTracks,
            1,
            undefined,
            undefined,
            logging,
            "ASC",
          );
          if (rec.length === 0) {
            fromDateTime = new Date(earliestAllowedDate);
          } else {
            fromDateTime = new Date(rec[0].recordingDateTime);
          }
          fromDate = fromDateTime;
        } else {
          fromDateTime = new Date(fromDate);
        }

        const accumulatedRecordingIds = [];
        const requestedLimit = limit;

        fromDateTime = latestDate(
          fromDateTime,
          dateTimeMinusThreeMonths(untilDateTime),
        );
        let timeLimitReached = false;

        while (accumulatedRecordingIds.length < requestedLimit) {
          const recordings = await queryRecordingsInProject(
            sequelize,
            projectId,
            minDuration,
            statusRecordingsOnly,
            includeDeletedRecordings,
            types,
            processingState,
            devices,
            locations,
            taggedWith,
            subClassTags,
            labelledWith,
            tagMode,
            includeFilteredTracks,
            limit,
            fromDateTime,
            untilDateTime,
            logging,
          );
          timeLimitReached =
            performance.now() - startTime > timeLimitForRequest;
          if (
            queryIsTimeSensitive &&
            accumulatedRecordingIds.length !== 0 &&
            timeLimitReached
          ) {
            // If we already have some results, prefer returning a limited list rather than make the user wait even longer
            // for us to reach our number of max requested recordings (limit)
            log.warning(
              "Aborting with some results to hit responsiveness deadline",
            );
            break;
          }
          if (recordings.length === 0 && fromDateTime <= fromDate) {
            break;
          }
          if (recordings.length !== 0) {
            limit -= recordings.length;
            const earliestRecordingTime = new Date(
              recordings[recordings.length - 1].recordingDateTime,
            );
            accumulatedRecordingIds.push(...recordings.map(({ id }) => id));
            untilDateTime = earliestRecordingTime; //
            fromDateTime = latestDate(
              fromDate,
              dateTimeMinusThreeMonths(untilDateTime),
            );
          } else {
            untilDateTime = fromDateTime;
            fromDateTime = latestDate(
              fromDate,
              dateTimeMinusThreeMonths(fromDateTime),
            );
          }
          if (fromDateTime.getTime() === untilDateTime.getTime()) {
            // Reached limit, won't match on "recordingDateTime" ?= fromDateTime && "recordingDateTime" < untilDateTime
            break;
          }
        }
        if (countOnly) {
          return successResponse(response, "Got recording count", {
            recordings: [],
            count: accumulatedRecordingIds.length,
          });
        }
        // NOTE: Finally, just query for the recordings we want by their ids.
        let fullRecordings: Recording[] = [];
        if (accumulatedRecordingIds.length) {
          fullRecordings = await Recording.findAll({
            where: {
              id: { [Op.in]: accumulatedRecordingIds },
            },
            include: [
              {
                model: Track,
                required: false,
                attributes: ["id", "startSeconds", "endSeconds"],
                where: {
                  archivedAt: {
                    [Op.is]: null,
                  },
                  ...(!includeFalsePositives && { filtered: false }),
                },
                include: [
                  {
                    required: false,
                    model: TrackTag,
                    attributes: [
                      "what",
                      "path",
                      "UserId",
                      "id",
                      "model",
                      "automatic",
                      "confidence",
                    ],
                    include: [
                      { model: User, attributes: ["userName"] },
                      {
                        model: TrackTagUserData,
                        required: false,
                        attributes: ["gender", "maturity"],
                      },
                    ],
                    where: {
                      used: true,
                      archivedAt: {
                        [Op.is]: null,
                      },
                    },
                  },
                ],
              },
              {
                model: Station,
                attributes: ["name"],
              },
              {
                model: Group,
                attributes: ["groupName"],
              },
              {
                model: Device,
                attributes: ["deviceName"],
              },
              {
                model: Tag,
                attributes: [
                  "detail",
                  "taggerId",
                  "id",
                  "comment",
                  "createdAt",
                ],
              },
            ],
            attributes: [
              "id",
              "recordingDateTime",
              "DeviceId",
              "duration",
              "location",
              "GroupId",
              "processingState",
              "additionalMetadata",
              "StationId",
              "type",
              ...(types.length === 0 || types.includes(RecordingType.Audio)
                ? ["batteryLevel", "cacophonyIndex", "redacted"]
                : []),
            ],
            order: [["recordingDateTime", "desc"]],
            logging,
          });
        }
        const recs = fullRecordings.map((x) => mapRecordingResponse(x, true));
        const sequelizeTime = performance.now() - now;
        if (!query.debug) {
          return successResponse(response, "Got recordings", {
            recordings: await Promise.all(recs),
          });
        } else {
          return response
            .status(200)
            .send(
              sqlDebugOutput(
                query,
                recs.length,
                sqlTimings,
                sqlPasses,
                sequelizeTime,
              ),
            );
        }
      } catch (_e) {
        return successResponse(response, "Got recordings", {
          recordings: [],
        });
      }
    },
  );
};
