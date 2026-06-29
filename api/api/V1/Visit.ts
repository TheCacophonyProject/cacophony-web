import type { Application, NextFunction, Request, Response } from "express";
import { param, query } from "express-validator";
import Sequelize, { FindAttributeOptions, Op } from "sequelize";
import {
  extractJwtAuthorizedUser,
  fetchAuthorizedRequiredFlatRecordingById,
  fetchAuthorizedRequiredGroupById,
  fetchAuthorizedRequiredStationById,
} from "@api/extract-middleware.js";
import { validateFields } from "@api/middleware.js";
import { idOf } from "@api/validation-middleware.js";
import { successResponse } from "@api/V1/responseUtil.js";
import { Visit } from "@models/Visit.js";
import { TrackTag } from "@models/TrackTag.js";
import visits from "@typedefs/client/Visits.js";

const visitAttributes: FindAttributeOptions = [
  "startTime",
  "endTime",
  "recordingIds",
  ["GroupId", "projectId"],
  ["StationId", "locationId"],

  [Sequelize.col("HumanTrackTag.path"), "humanClassification"],
  "humanClassificationRecordingId",
  [Sequelize.col("HumanTrackTag.TrackId"), "humanClassificationTrackId"],

  [Sequelize.col("AiTrackTag.path"), "aiClassification"],
  "aiClassificationRecordingId",
  [Sequelize.col("AiTrackTag.TrackId"), "aiClassificationTrackId"],
];

export default function (app: Application, baseUrl: string) {
  const apiUrl = `${baseUrl}/visits`;

  /**
   * Retrieve all visits for a given station within a time window.
   *
   * Returns visits that overlap the requested [from, until] window:
   *   startTime < until AND endTime > from
   */
  app.get(
    `${apiUrl}/for-station/:stationId`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("stationId")),
      query("from").exists().isISO8601().toDate(),
      query("until").exists().isISO8601().toDate(),
    ]),
    fetchAuthorizedRequiredStationById(param("stationId")),
    async (request: Request, response: Response, _next: NextFunction) => {
      const stationId = response.locals.station.id;
      const from = request.query.from as unknown as Date;
      const until = request.query.until as unknown as Date;
      const visits = await Visit.findAll({
        where: {
          StationId: stationId,
          [Op.and]: [
            { startTime: { [Op.lt]: until } },
            { endTime: { [Op.gte]: from } },
          ],
        },
        include: [
          {
            model: TrackTag,
            attributes: [["path", "aiClassification"]],
            as: "AiTrackTag",
          },
          {
            model: TrackTag,
            attributes: [["path", "humanClassification"]],
            as: "HumanTrackTag",
          },
        ],
        order: [
          ["startTime", "DESC"],
          ["humanClassification", "asc"],
          ["aiClassification", "asc"],
        ],
        attributes: visitAttributes,
      });

      return successResponse(response, "Completed query.", {
        stationId,
        from: from.toISOString(),
        until: until.toISOString(),
        visits: Visit.mergeConflictingHumanVisits(visits),
      });
    },
  );

  /**
   * Retrieve the visit(s) that a single recording is part of.
   *
   * Finds all visits where recordingIds JSONB array contains recordingId.
   */
  app.get(
    `${apiUrl}/for-recording/:recordingId`,
    extractJwtAuthorizedUser,
    validateFields([idOf(param("recordingId"))]),
    fetchAuthorizedRequiredFlatRecordingById(param("recordingId")),
    async (_request: Request, response: Response, _next: NextFunction) => {
      const recordingId = response.locals.recording.id;
      const visits = await Visit.findAll({
        where: {
          StationId: response.locals.recording.StationId,
          recordingIds: {
            [Op.contains]: [recordingId],
          },
        },
        include: [
          {
            model: TrackTag,
            attributes: [["path", "aiClassification"]],
            as: "AiTrackTag",
          },
          {
            model: TrackTag,
            attributes: [["path", "humanClassification"]],
            as: "HumanTrackTag",
          },
        ],
        order: [
          ["startTime", "DESC"],
          ["humanClassification", "asc"],
          ["aiClassification", "asc"],
        ],
        attributes: visitAttributes,
      });
      return successResponse(response, "Completed query.", {
        recordingId,
        visits: Visit.mergeConflictingHumanVisits(visits),
      });
    },
  );

  /**
   * Retrieve the visits for a project between `from` and `until`.
   */
  app.get(
    `${apiUrl}/for-project/:projectId`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("projectId")),
      query("from").exists().isISO8601().toDate(),
      query("until").exists().isISO8601().toDate(),
    ]),
    fetchAuthorizedRequiredGroupById(param("projectId")),
    async (request: Request, response: Response, _next: NextFunction) => {
      const projectId = response.locals.group.id;
      const from = request.query.from as unknown as Date;
      const until = request.query.until as unknown as Date;
      const visits = await Visit.findAll({
        where: {
          GroupId: projectId,
          [Op.and]: [
            { startTime: { [Op.lt]: until } },
            { endTime: { [Op.gte]: from } },
          ],
        },
        include: [
          {
            model: TrackTag,
            attributes: [],
            as: "AiTrackTag",
          },
          {
            model: TrackTag,
            attributes: [],
            as: "HumanTrackTag",
          },
        ],
        order: [
          ["startTime", "DESC"],
          ["humanClassification", "asc"],
          ["aiClassification", "asc"],
        ],
        attributes: visitAttributes,
      });
      return successResponse(response, "Completed query.", {
        visits: Visit.mergeConflictingHumanVisits(visits),
      });
    },
  );
}
