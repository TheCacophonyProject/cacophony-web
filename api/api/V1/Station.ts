import type { Application, NextFunction, Request, Response } from "express";
import {
  extractJwtAuthorizedUser,
  fetchAdminAuthorizedRequiredStationById,
  fetchAuthorizedRequiredStationById,
  fetchAuthorizedRequiredStations,
  parseJSONField,
} from "@api/extract-middleware.js";
import { successResponse } from "@api/V1/responseUtil.js";
import { validateFields } from "@api/middleware.js";
import { body, param, query } from "express-validator";
import type { Station } from "@models/Station.js";
import type {
  ApiCreateStationData,
  ApiStationResponse,
  ApiStationSettings,
} from "@typedefs/api/station.js";
import {
  booleanOf,
  idOf,
  integerOfWithDefault,
  stringOf,
} from "../validation-middleware.js";
import { jsonSchemaOf } from "@api/schema-validation.js";
import ApiUpdateStationDataSchema from "@schemas/api/station/ApiUpdateStationData.schema.json" assert { type: "json" };
import { stationLocationHasChanged } from "@models/Group.js";
import modelsInit from "@models/index.js";
import util from "@api/V1/util.js";
import { openS3 } from "@models/util/util.js";
import { streamS3Object } from "@api/V1/signedUrl.js";
import { ClientError } from "@api/customErrors.js";
import {
  latLngApproxDistance,
  MIN_STATION_SEPARATION_METERS,
} from "@models/util/locationUtils.js";
import { Op, QueryTypes } from "sequelize";
import { mapDeviceResponse } from "./Device.js";
import type { Device } from "@/models/Device.js";

const models = await modelsInit();

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiStationsResponseSuccess {
  stations: ApiStationResponse[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiStationResponseSuccess {
  stations: ApiStationResponse;
}

export const mapStation = (station: Station): ApiStationResponse => {
  const stationResponse: ApiStationResponse = {
    name: station.name,
    id: station.id,
    groupId: station.GroupId,
    groupName: (station as any).Group.groupName,
    createdAt: station.createdAt.toISOString(),
    activeAt: station.activeAt.toISOString(),
    location: station.location,
    updatedAt: station.updatedAt.toISOString(),
    automatic: station.automatic,
  };
  if (station.lastUpdatedById) {
    stationResponse.lastUpdatedById = station.lastUpdatedById;
  }
  if (station.needsRename) {
    stationResponse.needsRename = true;
  }
  if (station.settings) {
    stationResponse.settings = station.settings;
  }
  if (station.lastAudioRecordingTime) {
    stationResponse.lastAudioRecordingTime =
      station.lastAudioRecordingTime.toISOString();
  }
  if (station.lastThermalRecordingTime) {
    stationResponse.lastThermalRecordingTime =
      station.lastThermalRecordingTime.toISOString();
  }
  if (station.lastActiveAudioTime) {
    stationResponse.lastActiveAudioTime =
      station.lastActiveAudioTime.toISOString();
  }
  if (station.lastActiveThermalTime) {
    stationResponse.lastActiveThermalTime =
      station.lastActiveThermalTime.toISOString();
  }
  if (station.retiredAt) {
    stationResponse.retiredAt = station.retiredAt.toISOString();
  }
  return stationResponse;
};

export const mapStations = (stations: Station[]): ApiStationResponse[] =>
  stations.map(mapStation);

export default function (app: Application, baseUrl: string) {
  const apiUrl = `${baseUrl}/stations`;

  /**
   * @api {get} /api/v1/stations Get stations for current user
   * @apiName GetStationsForCurrentUser
   * @apiGroup Station
   * @apiDescription List all stations that the requesting user has access to via group membership
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiQuery {Boolean} [only-active=true] Only returns non-retired stations by default
   *
   * @apiUse V1ResponseSuccess
   * @apiInterface {apiSuccess::ApiStationsResponseSuccess} stations Array of ApiStationResponse[] showing details of stations in group
   * @apiUse V1ResponseError
   */
  app.get(
    apiUrl,
    extractJwtAuthorizedUser,
    validateFields([
      query("view-mode").optional().equals("user"),
      query("only-active").default(true).isBoolean().toBoolean(),
    ]),
    fetchAuthorizedRequiredStations,
    async (request: Request, response: Response) => {
      return successResponse(response, "Got stations", {
        stations: mapStations(response.locals.stations),
      });
    },
  );

  /**
   * @api {get} /api/v1/stations/:id Get a station by id
   * @apiName GetStationById
   * @apiGroup Station
   * @apiDescription Get a single station by id
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiInterface {apiSuccess::ApiStationResponseSuccess} stations ApiStationResponse showing details of station
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:id`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      query("view-mode").optional().equals("user"),
      query("only-active").default(false).isBoolean().toBoolean(), // NOTE: Don't document this, it shouldn't be changed.
    ]),
    fetchAuthorizedRequiredStationById(param("id")),
    async (request: Request, response: Response) => {
      return successResponse(response, "Got station", {
        station: mapStation(response.locals.station),
      });
    },
  );

  /**
   * @api {post} /api/v1/stations/recordings-count Get count of recordings for multiple stations using their ids in the request body
   * @apiName GetRecordingsCountForStations
   * @apiGroup Station
   * @apiDescription Get the count of recordings associated with multiple stations using their ids in the request body
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiInterface {apiSuccess::ApiRecordingsCountResponseSuccess} counts Number of recordings associated with each station
   * @apiUse V1ResponseError
   *
   * @apiBody {Number[]} stationIds Array of station IDs
   * @apiBody {String} [from-date] Date the station should be active from
   */
  app.post(
    `${apiUrl}/recordings-count`,
    extractJwtAuthorizedUser,
    validateFields([
      body("stationIds")
        .isArray({ min: 1 })
        .withMessage("At least one station ID is required"),
      query("view-mode").optional().equals("user"),
    ]),
    async (request: Request, response: Response) => {
      const stationIds = request.body.stationIds;
      const userId = response.locals.requestUser.id;
      const sql = `
          SELECT
          R."StationId",
          COUNT(R.id) AS "count"
          FROM "Recordings" R
          INNER JOIN "Stations" S ON R."StationId" = S."id"
          AND S."id" IN (:stationIds)
          INNER JOIN "Groups" G ON S."GroupId" = G."id"
          INNER JOIN "GroupUsers" GU ON G."id" = GU."GroupId"
          INNER JOIN "Users" U ON U."id" = GU."UserId" AND U."id" = :userId
          WHERE R."deletedAt" IS NULL
          GROUP BY R."StationId";`;

      const replacements = {
        stationIds: stationIds,
        userId: userId,
      };

      const result = await models.sequelize.query<{
        StationId: number;
        count: string;
      }>(sql, {
        replacements: replacements,
        type: QueryTypes.SELECT,
      });

      return successResponse(response, "Got recordings counts", {
        counts: result.map((c) => ({
          stationId: c.StationId,
          count: parseInt(c.count),
        })),
      });
    },
  );

  /**
   * @api {get} /api/v1/stations/:id/recordings-count Get count of recordings for a station by id
   * @apiName GetRecordingsCountForStation
   * @apiGroup Station
   * @apiDescription Get the count of recordings associated with a station by its id
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiInterface {apiSuccess::ApiRecordingsCountResponseSuccess} count Number of recordings associated with the station
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:id/recordings-count`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      query("view-mode").optional().equals("user"),
    ]),
    fetchAuthorizedRequiredStationById(param("id")),
    async (request: Request, response: Response) => {
      const stationdId = response.locals.station.id;

      const count = await models.Recording.count({
        where: {
          StationId: stationdId,
          deletedAt: null,
        },
      });

      return successResponse(response, "Got recordings count", {
        count,
      });
    },
  );

  /**
   * @api {delete} /api/v1/stations/:id/reference-photo/:fileKey Delete a reference photo for a station given a fileKey
   * @apiName DeleteReferencePhotoForStation
   * @apiGroup Station
   * @apiDescription Delete a reference photo for a station by station id and photo key.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.delete(
    `${apiUrl}/:id/reference-photo/:fileKey`,
    extractJwtAuthorizedUser,
    validateFields([idOf(param("id")), param("fileKey").isString()]),
    fetchAdminAuthorizedRequiredStationById(param("id")),
    async (request: Request, response: Response, next: NextFunction) => {
      // Make sure the fileKey exists in the station settings.
      let referenceImages =
        (response.locals.station as Station).settings.referenceImages || [];
      const fileKey = request.params.fileKey.replace(/_/g, "/");
      if (!referenceImages.includes(fileKey)) {
        return next(new ClientError("Reference image not found for station"));
      }
      const s3 = openS3();
      await s3.deleteObject(fileKey);
      referenceImages = referenceImages.filter(
        (imageKey) => imageKey !== fileKey,
      );
      await response.locals.station.update({
        settings: {
          ...(response.locals.station.settings || {}),
          referenceImages,
        },
      });
      return successResponse(response, "Removed reference image from station");
    },
  );

  /**
   * @api {get} /api/v1/stations/:id/reference-photo/:fileKey Return a reference photo for a station given a fileKey
   * @apiName GetReferencePhotoForStation
   * @apiGroup Station
   * @apiDescription Get a reference photo for a station by station id and photo key.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:id/reference-photo/:fileKey`,
    extractJwtAuthorizedUser,
    validateFields([idOf(param("id")), param("fileKey").isString()]),
    fetchAuthorizedRequiredStationById(param("id")),
    async (request: Request, response: Response, next: NextFunction) => {
      // Make sure the fileKey exists in the station settings.
      const referenceImages =
        (response.locals.station as Station).settings.referenceImages || [];
      const fileKey = request.params.fileKey.replace(/_/g, "/");
      if (!referenceImages.includes(fileKey)) {
        return next(new ClientError("Reference image not found for station"));
      }
      await streamS3Object(
        request,
        response,
        fileKey,
        "reference-image.jpg",
        "image/jpeg",
        response.locals.requestUser.id,
        response.locals.station.GroupId,
      );
    },
  );

  /**
   * @api {post} /api/v1/stations/:id/reference-photo Add a reference photo to a station.
   * @apiName AddReferencePhotoToStation
   * @apiGroup Station
   * @apiDescription Add a reference photo to a station by id.  Must be an admin of the group that owns this station.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiSuccess {string} fileKey Unique fileKey of the newly added reference image.
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.post(
    `${apiUrl}/:id/reference-photo`,
    extractJwtAuthorizedUser,
    fetchAuthorizedRequiredStationById(param("id")),
    util.multipartUpload(
      "f",
      async (
        uploader,
        uploadingDevice,
        uploadingUser,
        data,
        keys,
        uploadedFileDatas,
        locals,
      ): Promise<string> => {
        console.assert(
          keys.length === 1,
          "Only expected 1 file-attachment for this end-point",
        );
        const key = keys[0];
        const station = locals.station;
        const stationSettings: ApiStationSettings = { ...station.settings };
        stationSettings.referenceImages = [
          ...(stationSettings.referenceImages || []),
          key,
        ];
        await station.update({
          settings: stationSettings,
        });
        return key;
      },
    ),
  );

  /**
   * @api {patch} /api/v1/stations/:id Update a station by id
   * @apiName UpdateStationById
   * @apiGroup Station
   * @apiDescription Update a single station by id.  Must be an admin of the group that owns this station.
   * @apiInterface {apiBody::ApiUpdateStationData} station-updates ApiUpdateStationData with updated station fields
   * @apiBody {String} [from-date] Date the station should be active from
   * @apiBody {String} [until-date] Date the station should be active until (if retiring station)
   * @apiBody {Boolean} [retire=false] Set to true to retire station `NOW`
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.patch(
    `${apiUrl}/:id`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      body("station-updates")
        .custom(jsonSchemaOf(ApiUpdateStationDataSchema))
        .optional(),
      body("from-date").isISO8601().toDate().optional(),
      body("until-date").isISO8601().toDate().optional(),
      body("retire").default(false).isBoolean().toBoolean(),
      query("only-active").default(false).isBoolean().toBoolean(), // NOTE: Don't document this, it shouldn't be changed.
    ]),
    parseJSONField(body("station-updates")),
    fetchAdminAuthorizedRequiredStationById(param("id")),
    async (request: Request, response: Response, next: NextFunction) => {
      // If a from date is set, that is the date from which the station became active.
      // If an until date is set, that is the date that the station was retired at

      // Merge existing station with updates, filling in any missing fields.
      const stationUpdates = response.locals["station-updates"];
      const possibleLocationUpdates = stationUpdates;
      const proximityWarnings = [];
      const existingStation = response.locals.station;
      const updatedLocation: ApiCreateStationData = {
        ...existingStation.location,
        ...possibleLocationUpdates,
      };
      const positionUpdated =
        possibleLocationUpdates &&
        stationLocationHasChanged(existingStation, updatedLocation);

      const activeAt = request.body["from-date"] || existingStation.activeAt;
      const retiredAt =
        request.body["until-date"] ||
        (request.body.retire && new Date()) ||
        existingStation.retiredAt === null
          ? undefined
          : existingStation.retiredAt;

      const otherActiveStationsInTimeWindow = (
        await models.Station.activeInGroupDuringTimeRange(
          existingStation.GroupId,
          activeAt,
          retiredAt,
        )
      ).filter(({ id }) => id !== existingStation.id);

      const newName = stationUpdates?.name;
      if (
        newName &&
        otherActiveStationsInTimeWindow.find(({ name }) => name === newName)
      ) {
        if (activeAt && retiredAt) {
          return next(
            new ClientError(
              `An active station with the name '${newName}' already exists between ${activeAt.toISOString()} and ${retiredAt.toISOString()}`,
            ),
          );
        } else {
          return next(
            new ClientError(
              `An active station with the name '${newName}' already exists.`,
            ),
          );
        }
      }

      if (positionUpdated) {
        for (const otherStation of otherActiveStationsInTimeWindow) {
          if (
            latLngApproxDistance(otherStation.location, updatedLocation) <
            MIN_STATION_SEPARATION_METERS
          ) {
            proximityWarnings.push(
              `Updated station location is too close to ${otherStation.name} (#${otherStation.id}) - recordings may be incorrectly matched`,
            );
          }
        }
      }

      const updates = {
        ...mapStation(response.locals.station),
        ...(stationUpdates || {}),
        lastUpdatedById: response.locals.requestUser.id,
      };
      delete updates.lat;
      delete updates.lng;
      if (positionUpdated) {
        updates.location = updatedLocation;
      }
      if (request.body.retire) {
        updates.retiredAt = new Date();
      } else if (request.body["until-date"]) {
        updates.retiredAt = request.body["until-date"];
      }
      if (request.body["from-date"]) {
        updates.activeAt = request.body["from-date"];
      }

      // If the name changed, and the station was automatically created, set automatic to false:
      if (
        updates.name !== response.locals.station.name &&
        response.locals.station.needsRename === true
      ) {
        updates.needsRename = false;
      }
      // If we update the station, it's no longer automatically created, and should not be automatically deleted if
      // there are no recordings assigned to it.
      if (response.locals.station.automatic) {
        updates.automatic = false;
      }

      await response.locals.station.update(updates);
      return successResponse(response, "Updated station", {
        ...(proximityWarnings.length && { warnings: proximityWarnings }),
      });
    },
  );

  /**
   * @api {patch} /api/v1/stations/:id/name Update station name
   * @apiName UpdateStationName
   * @apiGroup Station
   * @apiDescription Update the name of a station. Any authorized user in the group can update the station name.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Number} id Station ID
   * @apiBody {String} name New name for the station
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.patch(
    `${apiUrl}/:id/name`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      body("name").isString().trim().notEmpty().withMessage("Name is required"),
    ]),
    fetchAuthorizedRequiredStationById(param("id")),
    async (request: Request, response: Response, next: NextFunction) => {
      const station = response.locals.station;
      const newName = request.body.name;
      
      // Check if another active station in the group already has this name
      const existingStation = await models.Station.findOne({
        where: {
          GroupId: station.GroupId,
          name: newName,
          id: { [Op.ne]: station.id },
          [Op.or]: [
            { retiredAt: null },
            { retiredAt: { [Op.gt]: new Date() } },
          ],
        },
      });

      if (existingStation) {
        return next(
          new ClientError(
            `An active station with the name '${newName}' already exists in this group.`,
          ),
        );
      }

      const updates: any = {
        name: newName,
        lastUpdatedById: response.locals.requestUser.id,
      };

      // If the station was automatically created and needs renaming, update the flags
      if (station.needsRename === true) {
        updates.needsRename = false;
      }
      if (station.automatic === true) {
        updates.automatic = false;
      }

      await station.update(updates);
      
      return successResponse(response, "Updated station name");
    },
  );

  /**
   * @api {delete} /api/v1/stations/:id Delete a station by id
   * @apiName DeleteStationById
   * @apiGroup Station
   * @apiDescription Delete a single station by id.  Must be an admin of the group that owns this station.
   *
   * @apiQuery {Boolean=false} delete-recordings Optionally, delete all recordings that were associated with this station.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.delete(
    `${apiUrl}/:id`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      booleanOf(query("delete-recordings")).default(false),
      query("only-active").default(false).isBoolean().toBoolean(), // NOTE: Don't document this, it shouldn't be changed.
    ]),
    fetchAdminAuthorizedRequiredStationById(param("id")),
    async (request: Request, response: Response) => {
      // Remove stationId from DeviceHistory entries
      await models.DeviceHistory.update(
        {
          stationId: null,
        },
        {
          where: {
            stationId: Number(request.params.id),
          },
        },
      );
      // FIXME(ManageStationsV2): Should we reassign device history entries to another close-by station, or automatically
      //  create a new station for the entry, or should we just delete the entry?

      if (request.query["delete-recordings"]) {
        // Delete this station, and mark delete recordings associated with it as deleted by this user.
        const recordings = await models.Recording.findAll({
          where: {
            StationId: Number(request.params.id),
          },
          attributes: ["id"],
        });
        const deleteRecordingPromises = [];
        const deletionTime = new Date();
        for (const recording of recordings) {
          deleteRecordingPromises.push(
            recording.update({
              deletedAt: deletionTime,
              deletedBy: response.locals.requestUser.id,
            }),
          );
        }
        await Promise.all(deleteRecordingPromises);
        await response.locals.station.destroy();
        return successResponse(
          response,
          `Deleted station and ${recordings.length} associated recordings`,
        );
      } else {
        await response.locals.station.destroy();
        return successResponse(response, "Deleted station");
      }
    },
  );

  /**
   * @api {get} /api/v1/stations/:stationId/cacophony-index Get the cacophony index for a station
   * @apiName cacophony-index-Station
   * @apiGroup Station
   * @apiDescription Get a single number Cacophony Index
   * for a given station.  This number is the average of all the Cacophony Index values from a
   * given time (defaulting to 'Now'), within a given timespan (defaulting to 3 months)
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Integer} station ID of the device.
   * @apiQuery {String} [from=now] ISO8601 date string
   * @apiQuery {Integer} [window-size=2160] length of rolling window in hours.  Default is 2160 (90 days)
   * @apiQuery {Boolean} [only-active=true] Only operate if the device is active
   * @apiSuccess {Float} cacophonyIndex A number representing the average index over the period `from` minus `window-size`
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:stationId/cacophony-index`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("stationId")),
      query("from").isISO8601().toDate().default(new Date()),
      integerOfWithDefault(query("window-size"), 2160), // Default to a three month rolling window
      query("only-active").optional().isBoolean().toBoolean(),
    ]),
    fetchAdminAuthorizedRequiredStationById(param("stationId")),
    async (request: Request, response: Response) => {
      const cacophonyIndex = await models.Station.getCacophonyIndex(
        response.locals.requestUser,
        response.locals.station.id,
        request.query.from as unknown as Date, // Get the current cacophony index
        request.query["window-size"] as unknown as number,
      );
      return successResponse(response, { cacophonyIndex });
    },
  );

  /**
   * @api {get} /api/v1/stations/:stationId/cacophony-index-bulk Get the cacophony index for a station across a give range of times frames
   * @apiName cacophony-index-Station-bulk
   * @apiGroup Station
   * @apiDescription Get multiple Cacophony Index values
   * for a given station.  These numbers are the averages of all the Cacophony Index values from a
   * given time (defaulting to 'Now'), within the time frames specified by windowsize and steps.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Integer} station ID of the device.
   * @apiQuery {String} [from=now] ISO8601 date string
   * @apiQuery {Integer} [steps=7] Number of time frames to return [default=7]
   * @apiQuery {String} [interval=days] description of each time frame size
   * @apiQuery {Boolean} [only-active=true] Only operate if the device is active
   * @apiSuccess {Object} #TODO
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:stationId/cacophony-index-bulk`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("stationId")),
      query("from").isISO8601().toDate().default(new Date()),
      integerOfWithDefault(query("steps"), 7), // Default to 7 day window
      stringOf(query("interval")).default("days"),
      query("only-active").optional().isBoolean().toBoolean(),
    ]),
    fetchAdminAuthorizedRequiredStationById(param("stationId")),
    async (request: Request, response: Response) => {
      const cacophonyIndexBulk = await models.Station.getCacophonyIndexBulk(
        response.locals.requestUser,
        response.locals.station.id,
        request.query.from as unknown as Date,
        request.query.steps as unknown as number,
        request.query.interval as unknown as String,
      );
      return successResponse(response, { cacophonyIndexBulk });
    },
  );

  /**
   * @api {get} /api/v1/stations/{:stationsId}/species-count Get the species breakdown for a station
   * @apiName species-breakdown
   * @apiGroup Station
   * @apiDescription Get a species breakdown
   * for a given station, showing the proportion of recordings that are of each species.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Integer} stationId ID of the device.
   * @apiQuery {String} [from=now] ISO8601 date string
   * @apiQuery {Integer} [window-size=2160] length of window in hours going backwards in time from the `from` param.  Default is 2160 (90 days)
   * @apiQuery {Boolean} [type=audio] Type of recording to use.  Default is audio
   * @apiQuery {Boolean} [only-active=true] Only operate if the device is active
   * @apiSuccess {Object} #TODO
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:stationId/species-count`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("stationId")),
      query("from").isISO8601().toDate().default(new Date()),
      integerOfWithDefault(query("window-size"), 2160), // Default to a three month rolling window
      query("type").optional().isString().default("audio"),
      query("only-active").optional().isBoolean().toBoolean(),
    ]),
    fetchAdminAuthorizedRequiredStationById(param("stationId")),
    async function (request: Request, response: Response) {
      const speciesCount = await models.Station.getSpeciesCount(
        response.locals.requestUser,
        response.locals.station.id,
        request.query.from as unknown as Date, // Get the current cacophony index
        request.query["window-size"] as unknown as number,
        request.query.type as unknown as string,
      );
      return successResponse(response, { speciesCount });
    },
  );

  /**
   * @api {get} /api/v1/stations/{:stationId}/species-count-bulk Get the species breakdown for a station across a given range of time frames
   * @apiName species-count-Station-bulk
   * @apiGroup Station
   * @apiDescription Get a species count
   * for a given station, showing the count of recordings that are of each species across a give range of time frames
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Integer} stationId ID of the device.
   * @apiQuery {String} [from=now] ISO8601 date string
   * @apiQuery {Integer} [steps=7] Number of time frames to return [default=7]
   * @apiQuery {String} [interval=days] description of each time frame size
   * @apiQuery {Boolean} [type=audio] Type of recording to use.  Default is audio
   * @apiQuery {Boolean} [only-active=true] Only operate if the device is active
   * @apiSuccess {Object} #TODO
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:stationId/species-count-bulk`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("stationId")),
      query("from").isISO8601().toDate().default(new Date()),
      integerOfWithDefault(query("steps"), 7), // Default to 7 day window
      stringOf(query("interval")).default("days"),
      query("type").optional().isString().default("audio"),
      query("only-active").optional().isBoolean().toBoolean(),
    ]),
    fetchAdminAuthorizedRequiredStationById(param("stationId")),
    async function (request: Request, response: Response) {
      const speciesCountBulk = await models.Station.getSpeciesCountBulk(
        response.locals.requestUser,
        response.locals.station.id,
        request.query.from as unknown as Date,
        request.query.steps as unknown as number,
        request.query.interval as unknown as String,
        request.query.type as unknown as string,
      );
      return successResponse(response, { speciesCountBulk });
    },
  );

  /**
   * @api {get} /api/v1/stations/:stationId/devices List devices currently assigned to a station
   * @apiName GetDevicesForStation
   * @apiGroup Station
   *
   * @apiDescription Returns all devices whose most recent DeviceHistory entry (before now)
   * has `stationId === stationId`. In other words, they are currently located at this station.
   *
   * @apiParam {Number} stationId ID of the station
   * @apiQuery {Boolean} [only-active=true] If `true`, only return active devices
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {Object[]} devices Array of devices currently assigned
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:stationId/devices`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("stationId")),
      booleanOf(param("only-active")).default(true),
    ]),
    fetchAuthorizedRequiredStationById(param("stationId")),
    async (req: Request, res: Response) => {
      const station = res.locals.station;
      const onlyActive = req.query["only-active"] !== "false";

      // We only want devices in the same group as `station.GroupId`.
      // We'll do a single raw query that:
      //   1) finds all devices for that group,
      //   2) looks up each device’s latest deviceHistory entry,
      //   3) checks if stationId == :stationId

      const sql = `
        SELECT d.*
        FROM "Devices" d
        JOIN LATERAL (
          SELECT "stationId"
          FROM "DeviceHistory" dh
          WHERE dh."DeviceId" = d."id"
            AND dh."GroupId" = d."GroupId"
            AND dh."location" IS NOT NULL
            AND dh."fromDateTime" <= now()
          ORDER BY dh."fromDateTime" DESC
          LIMIT 1
        ) latest ON true
        WHERE d."GroupId" = :groupId
          ${onlyActive ? `AND d."active" = true` : ""}
          AND latest."stationId" = :stationId
      `;

      const devicesRaw = await models.sequelize.query(sql, {
        replacements: {
          stationId: station.id,
          groupId: station.GroupId,
        },
        type: QueryTypes.SELECT,
        mapToModel: true,
        // mapToModel requires we pass the model: Device
        model: models.Device,
      });

      // Now `devicesRaw` is an array of Device instances
      // We can map them to the standard ApiDeviceResponse format:
      const viewAsSuperUser = res.locals.viewAsSuperUser;
      const devices = (devicesRaw as Device[]).map((dev) =>
        mapDeviceResponse(dev, viewAsSuperUser),
      );

      return successResponse(res, "Got devices for station", { devices });
    },
  );
}
