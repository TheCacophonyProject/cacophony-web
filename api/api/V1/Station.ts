import { Application, NextFunction, Request, Response } from "express";
import {
  extractJwtAuthorizedUser,
  fetchAdminAuthorizedRequiredStationById,
  fetchAuthorizedRequiredGroupById,
  fetchAuthorizedRequiredStationById,
  fetchAuthorizedRequiredStations,
  fetchAuthorizedRequiredStationsForGroup,
} from "@api/extract-middleware";
import responseUtil from "@api/V1/responseUtil";
import { validateFields } from "@api/middleware";
import { body, param, query } from "express-validator";
import { Station } from "@models/Station";
import { ApiStationResponse } from "@typedefs/api/station";
import { idOf } from "../validation-middleware";
import { jsonSchemaOf } from "@api/schema-validation";
import ApiCreateStationDataSchema from "@schemas/api/station/ApiCreateStationData.schema.json";
import {
  checkThatStationsAreNotTooCloseTogether,
  stationLocationHasChanged,
} from "@models/Group";
import models from "@models";

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
    location: {
      lat: station.location.coordinates[1],
      lng: station.location.coordinates[0],
    },
    updatedAt: station.updatedAt.toISOString(),
    lastUpdatedById: station.lastUpdatedById,
  };
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
   * @api {get} /api/v1/stations
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
   * @api {get} /api/v1/stations/:id
   * @apiName GetStationById
   * @apiGroup Station
   * @apiDescription Get a single station by id
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiQuery {Boolean} [only-active=false] By default, returns the station if it is retired or active.
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
      query("only-active").default(false).isBoolean().toBoolean(),
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
   * @api {delete} /api/v1/stations/:id
   * @apiName DeleteStationById
   * @apiGroup Station
   * @apiDescription Delete a single station by id
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:id`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("id")),
      query("view-mode").optional().equals("user"),
    ]),
    fetchAdminAuthorizedRequiredStationById(param("id")),
    async (request: Request, response: Response) => {
      await response.locals.station.destroy();
      return responseUtil.send(response, {
        statusCode: 200,
        messages: ["Deleted station"],
      });
    }
  );

  /**
   * @api {patch} /api/v1/stations/:id
   * @apiName UpdateStationById
   * @apiGroup Station
   * @apiDescription Update a single station by id.  Must be an admin of the group that owns this station.
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
        .exists()
        .custom(jsonSchemaOf(ApiCreateStationDataSchema)),
      body("from-date").isISO8601().toDate().optional(),
      body("until-date").isISO8601().toDate().optional(),
      body("retire").isBoolean().default(false),
    ]),
    fetchAdminAuthorizedRequiredStationById(param("id")),
    async (request: Request, response: Response, next: NextFunction) => {
      // We only care about non-retired stations for this query.
      const updates = response.locals["station-updates"];
      const existingStation = response.locals.station;
      const positionUpdated = stationLocationHasChanged(
        existingStation,
        updates
      );
      if (positionUpdated || request.body.fromDate) {
        // Get other active stations so that we can warn if the newly updated station
        // position is too close to another station.
        response.locals.onlyActive = true;
        await fetchAuthorizedRequiredStationsForGroup(
          response.locals.station.GroupId
        )(request, response, next);
      }
    },
    async (request: Request, response: Response) => {
      // Merge existing station with updates, filling in any missing fields.
      const updates = {
        ...mapStation(response.locals.station),
        ...response.locals["station-updates"],
        lastUpdatedById: response.locals.requestUser.id,
      };
      if (request.body.retire) {
        updates.retiredAt = new Date();
      }
      let proximityWarnings = null;
      if (response.locals.stations) {
        const { warnings } = await models.Group.addStationsToGroup(
          response.locals.requestUser.id,
          [updates],
          false,
          undefined,
          // Filter out the station we're checking against!
          response.locals.stations.filter(
            ({ id }) => id !== Number(request.params.id)
          ),
          request.body.fromDate,
          request.body.untilDate
        );
        if (warnings) {
          proximityWarnings = warnings;
        }
      } else {
        await response.locals.station.update(
          response.locals["station-updates"]
        );
      }
      const responseData: any = {
        statusCode: 200,
        messages: ["Updated station"],
      };
      if (proximityWarnings) {
        responseData.warnings = proximityWarnings;
      }
      return responseUtil.send(response, responseData);
    }
  );
}
