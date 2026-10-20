import { Application, NextFunction, Request, Response } from "express";
import { param, query } from "express-validator";
import Sequelize, {
  FindAttributeOptions,
  Op,
  QueryTypes,
  WhereOptions,
} from "sequelize";
import {
  extractJwtAuthorizedUser,
  fetchAuthorizedRequiredFlatRecordingById,
  fetchAuthorizedRequiredGroupById,
} from "@api/extract-middleware.js";
import { isIntArray, validateFields } from "@api/middleware.js";
import { idOf, integerOf } from "@api/validation-middleware.js";
import { successResponse } from "@api/V1/responseUtil.js";
import { Visit } from "@models/Visit.js";
import { TrackTag } from "@models/TrackTag.js";
import { Station } from "@models/Station.js";
import { LocationId } from "@typedefs/api/common.js";
import { initSequelize } from "@models/index.js";
import { UnprocessableError } from "@api/customErrors.js";

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

  [Sequelize.col("Station.name"), "locationName"],
];

const sequelize = await initSequelize();

export default function (app: Application, baseUrl: string) {
  const apiUrl = `${baseUrl}/visits`;

  /**
   * @api {get} /api/v1/visits/for-recording/:recordingId Get the visits a recording is part of
   * @apiName GetVisitsForRecording
   * @apiGroup Visits
   * @apiDescription Returns the visit or visits that the recording is part of, most recent first.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Integer} recordingId Id of the recording.
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {Integer} recordingId Id of the recording.
   * @apiSuccess {Object[]} visits The visits the recording is part of.
   * @apiUse V1ResponseError
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
            attributes: [],
            as: "AiTrackTag",
          },
          {
            model: TrackTag,
            attributes: [],
            as: "HumanTrackTag",
          },
          {
            model: Station,
            attributes: [],
            as: "Station",
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
   * @api {get} /api/v1/visits/for-project/:projectId/distribution Get the number of visits per day for a project
   * @apiName GetVisitsDistribution
   * @apiGroup Visits
   * @apiDescription Returns the number of visits for each day between `from` and `until`, optionally limited
   * to particular locations.  Days with no visits are included with a count of zero.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Integer} projectId Id of the project.
   * @apiQuery {String} from ISO8601 formatted date string, start of the period.  Must not be after `until`.
   * @apiQuery {String} until ISO8601 formatted date string, end of the period.
   * @apiQuery {Integer[]} [locations] Only count visits at these location ids.
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {Object[]} distribution One entry per day, in date order.
   * @apiSuccess {String} distribution.day The day, as a date.
   * @apiSuccess {Number} distribution.itemCount Number of visits starting on that day.
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/for-project/:projectId/distribution`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("projectId")),
      query("from").exists().isISO8601().toDate(),
      query("until").exists().isISO8601().toDate(),
      query("locations")
        .optional()
        .toArray()
        .isArray({ min: 1 })
        .custom(isIntArray)
        .withMessage(
          "Must be an id, or an array of ids.  For example, 'location=32' or 'location=32&location=33&location=34'",
        ),
    ]),
    fetchAuthorizedRequiredGroupById(param("projectId")),
    async (request: Request, response: Response, next: NextFunction) => {
      const projectId = response.locals.group.id;
      const from = request.query.from as unknown as Date;
      const until = request.query.until as unknown as Date;
      const locations: LocationId[] = (
        (request.query["locations"] || []) as string[]
      ).map((locationId) => Number(locationId));

      if (until < from) {
        return next(
          new UnprocessableError("'from' date must be less than 'until' date"),
        );
      }
      const numDays = Math.ceil(
        (until.getTime() - from.getTime()) / 1000 / 60 / 60 / 24,
      );
      const result = await sequelize.query(
        `
select 
  d.day::date, 
  count(v.id)::int AS "itemCount"
from generate_series(:until - (:numDays || ' days')::interval, :until, interval '1 day') AS d(day)
left join "Visits" v
  on v."startTime" >= d.day
  and v."startTime" < d.day + interval '1 day'
  and v."GroupId" = :projectId
  ${locations.length ? `and v."StationId" in (${locations.join(",")})` : ""}  
group by d.day
order by d.day;
      `,
        {
          type: QueryTypes.SELECT,
          replacements: {
            projectId,
            until: until.toISOString(),
            from: from.toISOString(),
            numDays,
          },
        },
      );
      return successResponse(response, "Got visits distribution.", {
        distribution: result,
      });
    },
  );

  /**
   * @api {get} /api/v1/visits/for-project/:projectId Get the visits for a project
   * @apiName GetVisitsForProject
   * @apiGroup Visits
   * @apiDescription Returns the visits for a project that overlap the period between `from` and `until`,
   * most recent first.  Optionally limited to particular locations, and to visits that are, or are not,
   * classified as particular animals.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Integer} projectId Id of the project.
   * @apiQuery {String} from ISO8601 formatted date string, start of the period.
   * @apiQuery {String} until ISO8601 formatted date string, end of the period.
   * @apiQuery {Integer[]} [locations] Only include visits at these location ids.
   * @apiQuery {String[]} [tagged-with] Only include visits classified as one of these tags.  Each tag also
   * matches the more specific tags beneath it.
   * @apiQuery {String[]} [not-tagged-with] Exclude visits classified as any of these tags.  Each tag also
   * matches the more specific tags beneath it.
   * @apiQuery {Integer} [max-results=1000] Maximum number of visits to return.
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {Object[]} visits The visits found.
   * @apiUse V1ResponseError
   */

  /**
   * @api {get} /api/v1/visits/for-project/:projectId/count Get the number of visits for a project
   * @apiName GetVisitsCountForProject
   * @apiGroup Visits
   * @apiDescription Returns the number of visits that `GET /api/v1/visits/for-project/:projectId` would
   * match for the same parameters, without returning the visits themselves.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {Integer} projectId Id of the project.
   * @apiQuery {String} from ISO8601 formatted date string, start of the period.
   * @apiQuery {String} until ISO8601 formatted date string, end of the period.
   * @apiQuery {Integer[]} [locations] Only count visits at these location ids.
   * @apiQuery {String[]} [tagged-with] Only count visits classified as one of these tags.  Each tag also
   * matches the more specific tags beneath it.
   * @apiQuery {String[]} [not-tagged-with] Exclude visits classified as any of these tags.  Each tag also
   * matches the more specific tags beneath it.
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {Number} count Number of visits found.
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/for-project/:projectId{/:count}`,
    extractJwtAuthorizedUser,
    validateFields([
      idOf(param("projectId")),
      param("count").optional().equals("count"),
      query("from").exists().isISO8601().toDate(),
      query("until").exists().isISO8601().toDate(),
      integerOf(query("max-results"), 1000),
      query("locations")
        .optional()
        .toArray()
        .isArray({ min: 1 })
        .custom(isIntArray)
        .withMessage(
          "Must be an id, or an array of ids.  For example, 'locations=32' or 'locations=32&locations=33&locations=34'",
        ),
      query("tagged-with").optional().toArray().isArray({ min: 1 }),
      query("not-tagged-with").optional().toArray().isArray({ min: 1 }),
    ]),
    fetchAuthorizedRequiredGroupById(param("projectId")),
    async (request: Request, response: Response, _next: NextFunction) => {
      const countOnly = request.params.count === "count";
      const projectId = response.locals.group.id;
      const from = request.query.from as unknown as Date;
      const until = request.query.until as unknown as Date;
      const maxResults = request.query["max-results"] as unknown as number;
      const locations: LocationId[] = (
        (request.query["locations"] || []) as string[]
      ).map((locationId) => Number(locationId));
      const taggedWith = (request.query["tagged-with"] || []) as string[];
      const notTaggedWith = (request.query["not-tagged-with"] ||
        []) as string[];
      const whereAnd: WhereOptions = [
        { startTime: { [Op.lt]: until } },
        { endTime: { [Op.gte]: from } },
      ];
      if (taggedWith.length) {
        const aiPathConditions = taggedWith.map((path) =>
          sequelize.literal(
            `"AiTrackTag"."path" <@ ${sequelize.escape(path)}::ltree`,
          ),
        );

        const humanPathConditions = taggedWith.map((path) =>
          sequelize.literal(
            `"HumanTrackTag"."path" <@ ${sequelize.escape(path)}::ltree`,
          ),
        );
        whereAnd.push({
          [Op.or]: [
            {
              [Op.and]: [
                {
                  [Op.or]: humanPathConditions,
                },
                sequelize.where(sequelize.col(`AiTrackTag.path`), {
                  [Op.eq]: null,
                }),
              ],
            },
            {
              [Op.and]: [
                {
                  [Op.or]: aiPathConditions,
                },
                sequelize.where(sequelize.col(`HumanTrackTag.path`), {
                  [Op.eq]: null,
                }),
              ],
            },
          ],
        });
      }
      if (notTaggedWith.length) {
        const aiPathConditions = notTaggedWith.map((path) =>
          sequelize.literal(
            `NOT ("AiTrackTag"."path" <@ ${sequelize.escape(path)}::ltree)`,
          ),
        );

        const humanPathConditions = notTaggedWith.map((path) =>
          sequelize.literal(
            `NOT ("HumanTrackTag"."path" <@ ${sequelize.escape(path)}::ltree)`,
          ),
        );
        whereAnd.push({
          [Op.and]: [
            {
              [Op.or]: [
                sequelize.where(sequelize.col("HumanTrackTag.path"), {
                  [Op.eq]: null,
                }),
                { [Op.and]: humanPathConditions },
              ],
            },
            {
              [Op.or]: [
                sequelize.where(sequelize.col("AiTrackTag.path"), {
                  [Op.eq]: null,
                }),
                { [Op.and]: aiPathConditions },
              ],
            },
          ],
        });
      }
      const whereClause: WhereOptions = {
        GroupId: projectId,
        [Op.and]: whereAnd,
      };
      if (locations.length) {
        whereClause.StationId = { [Op.in]: locations };
      }

      if (countOnly) {
        const count = await Visit.count({
          where: whereClause,
        });
        return successResponse(response, "Got visits count.", {
          count,
        });
      }
      const visits = await Visit.findAll({
        where: whereClause,
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
          {
            model: Station,
            attributes: [],
            as: "Station",
          },
        ],
        limit: maxResults,
        order: [
          ["startTime", "DESC"],
          ["humanClassification", "asc"],
          ["aiClassification", "asc"],
        ],
        attributes: visitAttributes,
      });
      return successResponse(response, "Got visits.", {
        visits: Visit.mergeConflictingHumanVisits(visits),
      });
    },
  );
}
