import { Application, Request, Response } from "express";
import {
  extractJwtAuthorizedUser,
  fetchAuthorizedRequiredStationById,
  fetchAuthorizedRequiredStations,
} from "@api/extract-middleware";
import responseUtil from "@api/V1/responseUtil";
import { validateFields } from "@api/middleware";
import { param, query } from "express-validator";
import { Station } from "@models/Station";
import { ApiStationResponse } from "@typedefs/api/station";
import { idOf } from "../validation-middleware";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiStationsResponseSuccess {
  stations: ApiStationResponse[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiStationResponseSuccess {
  stations: ApiStationResponse;
}

const mapStation = (station: Station): ApiStationResponse => {
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
}
