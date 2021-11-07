import { Application, Request, Response } from "express";
import {
  extractJwtAuthorizedUser,
  fetchAuthorizedRequiredStations,
} from "@api/extract-middleware";
import responseUtil from "@api/V1/responseUtil";

export default function (app: Application, baseUrl: string) {
  const apiUrl = `${baseUrl}/stations`;

  app.get(
    apiUrl,
    extractJwtAuthorizedUser,
    fetchAuthorizedRequiredStations,
    async (request: Request, response: Response) => {
      return responseUtil.send(response, {
        statusCode: 200,
        messages: ["TODO: Unimplmented"],
      });
    }
  );
}
