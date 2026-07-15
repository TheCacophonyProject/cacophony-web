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
   * Get the distribution of visits per day over time.
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
  count(v.id) AS item_count
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
   * Retrieve the visits for a project between `from` and `until`.
   * Optionally filter by location, supply max results
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
