import { Application, Request, Response } from "express";
import {
  extractJwtAuthorizedUser,
  fetchAdminAuthorizedRequiredStationById,
  fetchAuthorizedRequiredStationById,
  fetchAuthorizedRequiredStations,
  parseJSONField,
} from "@api/extract-middleware";
import responseUtil from "@api/V1/responseUtil";
import { validateFields } from "@api/middleware";
import { body, param, query } from "express-validator";
import { Station } from "@models/Station";
import {
  ApiCreateStationData,
  ApiStationResponse,
} from "@typedefs/api/station";
import { booleanOf, idOf } from "../validation-middleware";
import { jsonSchemaOf } from "@api/schema-validation";
import ApiUpdateStationDataSchema from "@schemas/api/station/ApiUpdateStationData.schema.json";
import { stationLocationHasChanged } from "@models/Group";
import models from "@models";
import {
  latLngApproxDistance,
  MIN_STATION_SEPARATION_METERS,
} from "@api/V1/recordingUtil";

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
    groupName: (station as any).Group.groupname,
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
      return responseUtil.send(response, {
        statusCode: 200,
        messages: ["Got stations"],
        stations: mapStations(response.locals.stations),
      });
    }
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
      return responseUtil.send(response, {
        statusCode: 200,
        messages: ["Got station"],
        station: mapStation(response.locals.station),
      });
    }
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
    async (request: Request, response: Response) => {
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
          retiredAt
        )
      ).filter(({ id }) => id !== existingStation.id);

      const newName = stationUpdates?.name;
      if (
        newName &&
        otherActiveStationsInTimeWindow.find(({ name }) => name === newName)
      ) {
        responseUtil.send(response, {
          statusCode: 400,
          messages: [
            `An active station with the name ${newName} already exists between ${activeAt.toISOString()} and ${retiredAt.toISOString()}`,
          ],
        });
      }

      if (positionUpdated) {
        for (const otherStation of otherActiveStationsInTimeWindow) {
          if (
            latLngApproxDistance(otherStation.location, updatedLocation) <
            MIN_STATION_SEPARATION_METERS
          ) {
            proximityWarnings.push(
              `Updated station location is too close to ${otherStation.name} (#${otherStation.id}) - recordings may be incorrectly matched`
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
      const responseData: any = {
        statusCode: 200,
        messages: ["Updated station"],
      };
      if (proximityWarnings.length) {
        responseData.warnings = proximityWarnings;
      }
      responseUtil.send(response, responseData);
    }
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
        }
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
            })
          );
        }
        await Promise.all(deleteRecordingPromises);
        await response.locals.station.destroy();
        return responseUtil.send(response, {
          statusCode: 200,
          messages: [
            `Deleted station and ${recordings.length} associated recordings`,
          ],
        });
      } else {
        await response.locals.station.destroy();
        return responseUtil.send(response, {
          statusCode: 200,
          messages: ["Deleted station"],
        });
      }
    }
  );
}
