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
import mime from "mime";
import moment from "moment-timezone";
import Sequelize, {
  Attributes,
  BelongsTo,
  CreationOptional,
  DataTypes,
  FindAttributeOptions,
  ForeignKey,
  HasMany,
  HasManyCreateAssociationMixin,
  HasManyGetAssociationsMixin,
  NonAttribute,
  Order,
  Transaction,
  WhereOptions,
} from "sequelize";
import { v4 as uuidv4 } from "uuid";
import config from "../config.js";
import _ from "lodash";
import { ModelStaticCommon } from "./index.js";
import { Tag } from "./Tag.js";
import { Device } from "./Device.js";
import { Group } from "./Group.js";
import { Track } from "./Track.js";

import { TrackTag } from "./TrackTag.js";
import { Station } from "./Station.js";
import type {
  DeviceId,
  GroupId,
  LatLng,
  RecordingId,
  StationId,
  TrackId,
  UserId,
} from "@typedefs/api/common.js";
import {
  AcceptableTag,
  RecordingProcessingState,
  RecordingType,
  TagMode,
} from "@typedefs/api/consts.js";
import type { DeviceBatteryChargeState } from "@typedefs/api/device.js";
import type {
  ApiAudioRecordingMetadataResponse,
  ApiThermalRecordingMetadataResponse,
  CacophonyIndex,
} from "@typedefs/api/recording.js";
import labelPath from "../classifications/label_paths.json" with { type: "json" };
import { locationField } from "@models/util/util.js";
import type { ApiTrackPosition } from "@typedefs/api/track.js";
import { User } from "@models/User.js";
import { MinimalTrackRequestData } from "@typedefs/api/fileProcessing.js";

const maxQueryResults = 10000;
class RecordingQueryBuilder {
  constructor() {
    return;
  }
  query: Sequelize.FindOptions<Recording>;
  init(userId: UserId, options: RecordingQueryOptions) {
    const {
      tagMode,
      tags,
      viewAsSuperUser,
      exclusive,
      hideFiltered,
      offset = 0,
      order = [
        // Sort by recordingDatetime but handle the case of the
        // timestamp being missing and fallback to sorting by id.
        [Sequelize.col("recordingDateTime"), "DESC"],
        ["id", "DESC"],
      ],
      includeAttributes = true,
    } = options;
    const where =
      typeof options.where === "string"
        ? JSON.parse(options.where)
        : (options.where ?? {});
    const limit = options.limit
      ? Math.min(options.limit, maxQueryResults)
      : 300;

    // Don't include deleted recordings
    where.deletedAt = where.deletedAt || { [Op.eq]: null };
    delete where._tagged; // remove legacy tag mode selector (if included)
    const constraints = [
      where,
      Sequelize.literal(
        RecordingQueryBuilder.handleTagMode(tagMode, tags, exclusive),
      ),
    ];
    const noArchived = { archivedAt: null } as WhereOptions<Track | TrackTag>;
    const onlyMasterModel = options.filterModel
      ? {
          used: true,
        }
      : {};
    if (hideFiltered) {
      const filteredSQL = `(
		select
			"RecordingId"
		from
			"Tracks" as "Tracks"
		where
			(("Tracks"."archivedAt" is null
				and "Tracks"."filtered" = false)
			and "Tracks"."RecordingId" = "Recording"."id")
		limit 1 ) is not null`;
      constraints.push(Sequelize.literal(filteredSQL));
    }

    const requireGroupMembership = viewAsSuperUser
      ? []
      : [
          {
            model: User,
            attributes: [] as FindAttributeOptions,
            required: true,
            where: { id: userId },
            ...(options.checkIsGroupAdmin && {
              through: { where: { admin: true } },
            }),
            // If not viewing as super user, make sure the user is a member of the recording group.
            // This may need to change if we start caring about showing everyone all public recordings.
            // However, since we're still going to be showing things as "Group centric"  We'd probably just
            // make the group public - or use a totally different query.
          },
        ];

    this.query = {
      where: {
        [Op.and]: constraints,
      },
      order,
      include: [
        {
          model: Group,
          attributes: ["groupName"],
          required: !viewAsSuperUser,
          include: requireGroupMembership,
        },
        {
          model: Station,
          attributes: ["name", "location"],
        },
        {
          model: Tag,
          attributes: Tag.userGetAttributes,
          include: [
            {
              association: "tagger",
              attributes: ["userName", "id"],
            },
          ],
        },
        {
          model: Track,
          where: noArchived,
          required: false,
          separate: true,
          attributes: ["id", "filtered", "startSeconds", "endSeconds"],
          include: [
            {
              model: TrackTag,
              where: { ...noArchived, ...onlyMasterModel },
              attributes: [
                "id",
                "what",
                "path",
                "automatic",
                "TrackId",
                "confidence",
                "UserId",
                "model",
              ],
              include: [
                {
                  model: User,
                  attributes: ["userName", "id"],
                },
              ],
              required: false,
            },
          ],
        },
        {
          model: Device,
          where: {},
          attributes: ["deviceName", "id"],
        },
      ],
      limit,
      offset,
      attributes: Recording.queryGetAttributes,
    } as Sequelize.FindOptions;

    if (!includeAttributes) {
      const recursiveDelete = (obj: Record<string, unknown>) => {
        for (const key in obj) {
          if (key === "attributes") {
            delete obj[key];
          } else if (typeof obj[key] === "object") {
            recursiveDelete(obj[key] as Record<string, unknown>);
          }
        }
      };
      recursiveDelete(this.query as Record<string, unknown>);
    }
    return this;
  }

  static handleTagMode(
    tagMode: AllTagModes,
    tagWhatsIn: string[],
    exclusive: boolean,
  ): SqlString {
    const tagWhats = tagWhatsIn && tagWhatsIn.length > 0 ? tagWhatsIn : null;
    if (!tagMode) {
      tagMode = tagWhats ? TagMode.Tagged : TagMode.Any;
    }

    // FIXME Seems like we're doing validation here that should be done at the API layer
    const humanSQL = 'NOT "Tags".automatic';
    const AISQL = '"Tags".automatic';
    if (Tag.acceptableTags.has(tagMode as AcceptableTag)) {
      let sqlQuery = `((${RecordingQueryBuilder.recordingTaggedWith(
        [tagMode],
        null,
        exclusive,
      )} limit 1) IS NOT NULL)`;
      if (tagWhats) {
        sqlQuery = `${sqlQuery} AND (${RecordingQueryBuilder.trackTaggedWith(
          tagWhats,
          null,
          exclusive,
        )}) IS NOT NULL`;
      }
      return sqlQuery;
    }

    switch (tagMode) {
      case TagMode.Any:
        return "";
      case TagMode.UnTagged:
        return RecordingQueryBuilder.notTagOfType(tagWhats, null, exclusive);
      case TagMode.Tagged:
        return RecordingQueryBuilder.tagOfType(tagWhats, null, exclusive);
      case TagMode.HumanTagged:
        return RecordingQueryBuilder.tagOfType(tagWhats, humanSQL, exclusive);
      case TagMode.AutomaticallyTagged:
        return RecordingQueryBuilder.tagOfType(tagWhats, AISQL, exclusive);
      case TagMode.NoHuman:
        return RecordingQueryBuilder.notTagOfType(
          tagWhats,
          humanSQL,
          exclusive,
        );
      case TagMode.AutomaticOnly:
        return `${RecordingQueryBuilder.tagOfType(
          tagWhats,
          AISQL,
          exclusive,
        )} AND ${RecordingQueryBuilder.notTagOfType(
          tagWhats,
          humanSQL,
          exclusive,
        )}`;
      case TagMode.HumanOnly:
        return `${RecordingQueryBuilder.tagOfType(
          tagWhats,
          humanSQL,
          exclusive,
        )} AND ${RecordingQueryBuilder.notTagOfType(
          tagWhats,
          AISQL,
          exclusive,
        )}`;
      case TagMode.AutomaticHuman:
        return `${RecordingQueryBuilder.tagOfType(
          tagWhats,
          humanSQL,
          exclusive,
        )} AND ${RecordingQueryBuilder.tagOfType(tagWhats, AISQL, exclusive)}`;
      default: {
        throw `invalid tag mode: ${tagMode}`;
      }
    }
  }

  static tagOfType(
    tagWhats: string[],
    tagTypeSql: SqlString,
    exclusive: boolean,
  ): SqlString {
    let query = `((${RecordingQueryBuilder.trackTaggedWith(
      tagWhats,
      tagTypeSql,
      exclusive,
    )}  ${tagTypeSql || !tagWhats ? "LIMIT 1) IS NOT NULL" : ")"}`;
    if (
      !tagWhats ||
      (!tagWhats && tagTypeSql) ||
      tagWhats.find((tag) => Tag.acceptableTags.has(tag as AcceptableTag))
    ) {
      query += ` OR (${RecordingQueryBuilder.recordingTaggedWith(
        tagWhats,
        tagTypeSql,
        exclusive,
      )} LIMIT 1) IS NOT NULL`;
    }
    query += ")";
    return query;
  }

  static notTagOfType(
    tagWhats: string[],
    tagTypeSql: SqlString,
    exclusive: boolean,
  ): SqlString {
    let query = `((${RecordingQueryBuilder.trackTaggedWith(
      tagWhats,
      tagTypeSql,
      exclusive,
    )} LIMIT 1) ${tagTypeSql || !tagWhats ? "IS NULL" : ""}`;
    if (
      !tagWhats ||
      (!tagWhats && tagTypeSql) ||
      tagWhats.find((tag) => Tag.acceptableTags.has(tag as AcceptableTag))
    ) {
      query += ` AND (${RecordingQueryBuilder.recordingTaggedWith(
        tagWhats,
        tagTypeSql,
        exclusive,
      )} LIMIT 1)  ${tagTypeSql || !tagWhats ? "IS NULL" : ""}`;
    }
    query += ")";
    return query;
  }

  static recordingTaggedWith(
    tags: string[],
    tagTypeSql: SqlString,
    exclusive: boolean,
  ) {
    let sql =
      'SELECT 1 FROM "Tags" WHERE "Tags"."RecordingId" = "Recording".id';
    if (tags) {
      sql += ` AND (${RecordingQueryBuilder.selectByTag(
        tags,
        exclusive,
        "detail",
      )})`;
    }
    if (tagTypeSql) {
      sql += ` AND (${tagTypeSql})`;
    }
    return sql;
  }

  static trackTaggedWith(
    tags?: string[],
    tagTypeSql?: SqlString,
    exclusive?: boolean,
  ) {
    let sql = `SELECT "Recording"."id" FROM "Tracks" INNER JOIN "TrackTags" AS "Tags" ON "Tracks"."id" = "Tags"."TrackId" WHERE "Tags".
    "archivedAt" IS NULL AND "Tracks"."RecordingId" = "Recording".id AND "Tracks"."archivedAt" IS NULL`;
    const tagsSql = tags
      ? ` AND (${RecordingQueryBuilder.selectByTag(tags, exclusive)})`
      : "";
    if (!tagTypeSql) {
      // When we're not filtering by tag type, we want override automatic tags with human tags
      if (tags) {
        const notAutomatic = `${sql} AND (NOT "Tags".automatic)`;
        const humanPreferred = `CASE WHEN (${notAutomatic} LIMIT 1) IS NOT NULL THEN (${notAutomatic} ${tagsSql} LIMIT 1) IS NOT NULL ELSE (${sql} ${tagsSql} LIMIT 1) IS NOT NULL END`;
        return humanPreferred;
      } else {
        return sql;
      }
    } else {
      sql += tagsSql;
      sql += ` AND (${tagTypeSql})`;
      return sql;
    }
  }

  static selectByTag(tags: string[], exclusive: boolean, tagPath = "what") {
    if (!tags || tags.length === 0) {
      return null;
    }

    const parts = [];
    for (const tag of tags) {
      if (tag === "interesting") {
        parts.push(
          `("Tags"."what" != 'bird' AND "Tags"."what" != 'false positive')`,
        );
      } else {
        const path = (labelPath as Record<string, string>)[tag.toLowerCase()];
        if (path) {
          parts.push(`"Tags".path ~ '${path}${exclusive ? "" : ".*"}'`);
        } else {
          // TODO: this catches tags that may have not been added to classifications but should be added
          parts.push(`"Tags"."${tagPath}" = '${tag}'`);
        }
      }
    }

    return parts.join(" OR ");
  }

  get() {
    return this.query;
  }

  addColumn(name: string) {
    if (!("attributes" in this.query)) {
      this.query.attributes = [];
    }
    (this.query.attributes as string[]).push(name);
    return this;
  }
}

// Mapping
export const mapPosition = (
  position: [number, [number, number, number, number]] | ApiTrackPosition,
): ApiTrackPosition => {
  if (Array.isArray(position)) {
    return {
      x: position[1][0],
      y: position[1][1],
      width: position[1][2] - position[1][0],
      height: position[1][3] - position[1][1],
      frameTime: position[0],
    };
  } else {
    return {
      x: position.x,
      y: position.y,
      width: position.width,
      height: position.height,
      order: position.frame_number ?? position.order,
      mass: position.mass,
      blank: position.blank,
    };
  }
};

type SqlString = string;

type AllTagModes = TagMode | AcceptableTag;
// local
const validTagModes = new Set([
  ...Object.values(TagMode),
  ...Object.values(AcceptableTag),
]);

export type RecordingQueryOptions = Partial<{
  where: SqlString | Sequelize.WhereOptions;
  tagMode: TagMode;
  tags: string[]; // AcceptableTag[]
  offset: number;
  limit: number;
  order: Sequelize.Order;
  viewAsSuperUser: boolean;
  checkIsGroupAdmin: boolean;
  hideFiltered: boolean;
  exclusive: boolean;
  includeAttributes: boolean;
  attributes: string[];
  filterModel: string | false;
}>;

const MaxProcessingRetries = 1;

// Only set during recording processing?
export type RecordingProcessingMetadata = object;

export class Recording extends ModelStaticCommon<Recording> {
  declare id: CreationOptional<RecordingId>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  // FIXME: This is nullable, but probably should have a default, or require a value.
  declare type: RecordingType;
  declare duration: number;
  declare recordingDateTime: Date;
  // FIXME: Should we just enforce a location at the DB level?
  declare location?: CreationOptional<LatLng>;

  // FIXME: Deprecate?
  declare relativeToDawn?: CreationOptional<number>;
  declare relativeToDusk?: CreationOptional<number>;
  declare version?: CreationOptional<string>;
  //

  declare additionalMetadata?: CreationOptional<
    ApiAudioRecordingMetadataResponse | ApiThermalRecordingMetadataResponse
  >;
  declare cacophonyIndex?: CreationOptional<CacophonyIndex[]>;
  declare comment?: CreationOptional<string>;
  declare public: CreationOptional<boolean>;
  // FIXME: This field shouldn't be nullable, but there are many entries in the DB for which the value is NULL
  declare uploader?: "user" | "device";
  declare uploaderId?: UserId | DeviceId;
  declare rawFileKey?: string;
  declare rawMimeType?: string;
  declare rawFileHash?: string;
  declare rawFileSize?: number;

  // TODO: Deprecate fileKey and fileSize?
  declare fileKey?: CreationOptional<string>;
  declare fileSize?: CreationOptional<number>;
  declare fileMimeType?: CreationOptional<string>;
  declare processingStartTime: CreationOptional<Date>;
  declare processingEndTime: CreationOptional<Date>;
  declare processingMeta: CreationOptional<RecordingProcessingMetadata>;
  declare processing?: CreationOptional<boolean>;
  declare processingState?: CreationOptional<RecordingProcessingState>; // Actually a string, enum is not enforced at DB level currently.
  declare passedFilter?: CreationOptional<boolean>;
  declare jobKey?: CreationOptional<string>;

  // TODO: deprecate?
  declare batteryLevel?: CreationOptional<number>;
  declare batteryCharging?: CreationOptional<DeviceBatteryChargeState>;
  declare airplaneModeOn?: CreationOptional<boolean>;
  //
  declare deletedAt?: CreationOptional<Date>;
  declare deletedBy?: CreationOptional<UserId>;
  declare redacted?: CreationOptional<boolean>;
  declare currentStateStartTime?: CreationOptional<Date>;
  declare processingFailedCount: CreationOptional<number>;

  declare DeviceId: ForeignKey<DeviceId>;
  declare GroupId: ForeignKey<GroupId>;
  declare StationId: ForeignKey<StationId>;

  declare Tracks?: NonAttribute<Track[]>;
  declare Device?: NonAttribute<Device>;
  declare Group?: NonAttribute<Group>;
  declare Station?: NonAttribute<Station>;
  declare Tags?: NonAttribute<Tag[]>;

  declare static associations: {
    Station?: BelongsTo<Station>;
    Group?: BelongsTo<Group>;
    Device?: BelongsTo<Device>;
    Tags?: HasMany<Tag>;
    Tracks?: HasMany<Track>;
  };

  declare getTags: HasManyGetAssociationsMixin<Tag>;
  declare getTracks: HasManyGetAssociationsMixin<Track>;
  declare createTrack: HasManyCreateAssociationMixin<Track, "RecordingId">;

  static addAssociations() {
    this.belongsTo(Group);
    this.belongsTo(Device);

    // FIXME: Does this imply that if the station is deleted, any recordings are also deleted?
    this.belongsTo(Station);
    this.hasMany(Tag);
    this.hasMany(Track);
  }

  // Attributes returned in recording query results.
  static queryGetAttributes = [
    "id",
    "type",
    "recordingDateTime",
    "rawMimeType",
    "rawFileSize",
    "fileMimeType",
    "processingState",
    "duration",
    "location",
    "batteryLevel",
    "DeviceId",
    "GroupId",
    "StationId",
    "rawFileKey",
    "cacophonyIndex",
    "processing",
    "comment",
    "additionalMetadata",
    "redacted",
  ];

  // Attributes returned when looking up a single recording.
  static userGetAttributes = Object.freeze([
    "id",
    "rawMimeType",
    "rawFileSize",
    "fileMimeType",
    "processingState",
    "duration",
    "recordingDateTime",
    "relativeToDawn",
    "relativeToDusk",
    "location",
    "version",
    "batteryLevel",
    "batteryCharging",
    "airplaneModeOn",
    "type",
    "additionalMetadata",
    "GroupId",
    "StationId",
    "fileKey",
    "comment",
    "processing",
  ]);

  // Fields that can be provided when uploading new recordings.
  static apiSettableFields = Object.freeze([
    "type",
    "duration",
    "recordingDateTime",
    "relativeToDawn",
    "relativeToDusk",
    "location",
    "version",
    "batteryCharging",
    "batteryLevel",
    "airplaneModeOn",
    "additionalMetadata",
    "cacophonyIndex",
    "processingMeta", // FIXME - Check this
    "comment",
    "StationId",
  ]);

  static processingStates = Object.freeze({
    irRaw: [
      RecordingProcessingState.ReTrack,
      RecordingProcessingState.Tracking,
      RecordingProcessingState.AnalyseThermal,
      RecordingProcessingState.Finished,
    ],
    thermalRaw: [
      RecordingProcessingState.ReTrack,
      RecordingProcessingState.TrackAndAnalyse,
      RecordingProcessingState.Tracking,
      RecordingProcessingState.AnalyseThermal,
      RecordingProcessingState.Finished,
    ],
    audio: [
      RecordingProcessingState.Analyse,
      RecordingProcessingState.Finished,
    ],
  });

  static uploadedState(type: RecordingType) {
    if (type == RecordingType.Audio) {
      return RecordingProcessingState.Analyse;
    } else {
      return RecordingProcessingState.TrackAndAnalyse;
    }
  }
  static processingAttributes = [
    "id",
    "type",
    "jobKey",
    "rawFileKey",
    "rawMimeType",
    "fileKey",
    "fileMimeType",
    "processingState",
    "processingMeta",
    "GroupId",
    "DeviceId",
    "StationId",
    "recordingDateTime",
    "duration",
    "location",
    "processing",
    "processingFailedCount",
    [Sequelize.json("additionalMetadata.metadataSource"), "metadataSource"],
  ];

  static buildSafely(fields: Record<string, unknown>): Recording {
    return Recording.build(
      _.pick(fields, Recording.apiSettableFields),
    ) as Recording;
  }

  static isValidTagMode(mode: TagMode) {
    return validTagModes.has(mode);
  }

  static processingStateOrClause(states: RecordingProcessingState[]) {
    return [
      {
        processingState: { [Op.in]: states },
        [Op.or]: [
          {
            // Ready to be processed
            processing: { [Op.is]: Sequelize.literal("distinct from true") },
          },
          {
            // Set to processing but older than 30mins, means processing job was abandoned.
            currentStateStartTime: {
              [Op.lt]: Sequelize.literal("NOW() - INTERVAL '30 minutes'"),
            },
            processing: true,
            processingFailedCount: { [Op.lt]: MaxProcessingRetries },
          },
        ],
      },
      {
        // Retry a failed recording, if failed more than 12 hours ago
        processingFailedCount: { [Op.lte]: MaxProcessingRetries },
        currentStateStartTime: {
          [Op.lt]: Sequelize.literal("NOW() - INTERVAL '12 hours'"),
        },
        processingState: {
          [Op.in]: states.map((state) => `${state}.failed`),
        },
      },
    ];
  }

  /**
   * Return a recording for processing under a transaction
   * and sets the processingStartTime and jobKey for recording
   * arguments given.
   */
  static async getOneForProcessing(
    type: RecordingType,
    states: RecordingProcessingState[],
    suppliedRecordingIdInTest?: RecordingId,
  ) {
    let where: WhereOptions<Recording> = {
      type: type,
      deletedAt: { [Op.eq]: null },
      [Op.or]: Recording.processingStateOrClause(states),
    };
    let sortOrder: Order = [
      Sequelize.literal(
        `("Recording"."processing" is distinct from true) desc`,
      ),
      ["processingFailedCount", "ASC NULLS FIRST"], // only do these after all others
      ["isRecent", "DESC"],
      ["uploader", "DESC NULLS LAST"],
      ["processingState", "asc"], // If we ask for 'analyse' or 'trackAndAnalyse', prioritise 'analyse'
      ["recordingDateTime", "asc"],
      ["id", "asc"], // Adding another order is a "fix" for a bug in postgresql causing the query to be slow
    ];
    const attributes: FindAttributeOptions = [
      "id",
      [
        Sequelize.literal(
          `"Recording"."recordingDateTime" > now() - interval '1 day'`,
        ),
        "isRecent",
      ],
    ];
    if (type === RecordingType.ThermalRaw) {
      sortOrder = [
        ...sortOrder.slice(0, 2),
        // We only care about hasAlert if the recording is less than 24 hours old, and only for thermal recordings.
        ["hasAlert", "DESC"],
        ...sortOrder.slice(2),
      ];
      attributes.push([
        Sequelize.literal(`case
                when "Recording"."recordingDateTime" > now() - interval '1 day' then
                  (
                    exists (
                      select 1
                      from "Alerts" a
                      where a."StationId" = "Recording"."StationId"
                    )
                    or exists (
                      select 1
                      from "Alerts" a
                      where a."DeviceId" = "Recording"."DeviceId"
                    )
                  )
                else false
              end`),
        "hasAlert",
      ]);
    }
    return await this.sequelize.transaction(
      async (transaction: Transaction) => {
        let recording: Recording | null;
        if (states.includes(RecordingProcessingState.Finished)) {
          // When there is a new user-created audio track, we want to pick it up and classify it, even though
          // the user will be adding a human tag to it.
          recording = await this.findOne({
            subQuery: false,
            where: {
              ...where,
              [Op.and]: Sequelize.literal(
                ` not exists(select 1 from "TrackTags" where "automatic" = true and "TrackId"= "Tracks"."id" limit 1)`,
              ),
            },
            include: [
              {
                model: Track,
                where: {
                  archivedAt: null,
                  createdAt: {
                    [Op.gt]: Sequelize.literal("NOW() - INTERVAL '1 day'"),
                  },
                },
                attributes: [],
              },
            ],
            attributes,
            order: sortOrder,
            skipLocked: true,
            lock: transaction.LOCK.UPDATE,
            transaction,
          });
        }
        if (
          !suppliedRecordingIdInTest &&
          !recording &&
          (!states.includes(RecordingProcessingState.Finished) ||
            states.length > 1)
        ) {
          if (type == RecordingType.Audio) {
            states = states.filter(
              (state) => state !== RecordingProcessingState.Finished,
            );
            where = {
              ...where,
              [Op.or]: Recording.processingStateOrClause(states),
            };
          }
          // Look for regular recordings to be processed, *not* audio recordings that are finished with no track-tags
          recording = await this.findOne({
            subQuery: false,
            where,
            attributes,
            order: sortOrder,
            skipLocked: true,
            lock: transaction.LOCK.UPDATE,
            transaction,
          });
        }
        if (recording === null) {
          return null;
        }
        const id = suppliedRecordingIdInTest || recording.id;
        const actualRecording = await this.findOne({
          where: { id },
          attributes: [
            "id",
            "type",
            "jobKey",
            "rawFileKey",
            "rawMimeType",
            "fileKey",
            "fileMimeType",
            "processingState",
            "processingMeta",
            "GroupId",
            "DeviceId",
            "StationId",
            "recordingDateTime",
            "duration",
            "location",
            "processing",
            "processingFailedCount",
            [
              Sequelize.literal(`"additionalMetadata"->>'metadataSource'`),
              "metadataSource",
            ],
          ],
          transaction,
        });
        const now = new Date();
        if (!actualRecording.processingStartTime) {
          actualRecording.processingStartTime = now;
        }
        if (actualRecording.isFailed()) {
          actualRecording.unsetProcessingFailureState();
        }

        if (actualRecording.processing) {
          actualRecording.processingFailedCount += 1;
        }
        actualRecording.currentStateStartTime = now;
        actualRecording.processingEndTime = null;
        actualRecording.jobKey = uuidv4();
        actualRecording.processing = true;
        await actualRecording.save({
          transaction,
        });
        return actualRecording;
      },
    );
  }

  static nextState(
    processingState: RecordingProcessingState,
  ): RecordingProcessingState {
    if (processingState == RecordingProcessingState.Reprocess) {
      return RecordingProcessingState.Finished;
    } else if (processingState == RecordingProcessingState.ReTrack) {
      return RecordingProcessingState.Analyse;
    } else if (processingState == RecordingProcessingState.TrackAndAnalyse) {
      return RecordingProcessingState.Finished;
    } else if (processingState == RecordingProcessingState.Analyse) {
      return RecordingProcessingState.Finished;
    } else if (processingState == RecordingProcessingState.Tracking) {
      return RecordingProcessingState.Analyse;
    }
    return processingState;
  }

  //------------------
  // INSTANCE METHODS
  //------------------
  isFailed(): boolean {
    return this.processingState.endsWith(".failed");
  }

  unfailedState(): RecordingProcessingState {
    if (!this.isFailed()) {
      return this.processingState;
    }
    const state = (this.processingState as string).replace(
      ".failed",
      "",
    ) as RecordingProcessingState;
    if (
      !Object.values(RecordingProcessingState)
        .map((v) => v as string)
        .includes(state)
    ) {
      throw new Error(
        `Attempted to set invalid failed processing state: ${state}`,
      );
    }
    return state;
  }

  getNextState(): RecordingProcessingState {
    return Recording.nextState(this.unfailedState());
  }

  getFileBaseName(): string {
    return moment(new Date(this.recordingDateTime))
      .tz(config.timeZone)
      .format("YYYYMMDD-HHmmss");
  }

  getRawFileName() {
    return this.getFileBaseName() + this.getRawFileExt();
  }

  getFileName() {
    return this.getFileBaseName() + this.getFileExt();
  }

  getRawFileExt() {
    if (this.rawMimeType == "application/x-cptv") {
      return ".cptv";
    }
    const ext = mime.getExtension(this.rawMimeType);
    if (ext) {
      return "." + ext;
    }
    switch (this.type) {
      case "thermalRaw":
        return ".cptv";
      case "audio":
        return ".mpga";
      default:
        return "";
    }
  }

  getFileExt() {
    if (this.fileMimeType == "application/x-cptv") {
      return ".cptv";
    }
    const ext = mime.getExtension(this.fileMimeType);
    if (ext) {
      return "." + ext;
    }
    return "";
  }

  _reduceLatLonPrecision(latLng: LatLng, precision: number): LatLng {
    const resolution = (precision * 360) / 40000000;
    const half_resolution = resolution / 2;
    const reducePrecision = (val: number) => {
      val = val - (val % resolution);
      if (val > 0) {
        val += half_resolution;
      } else {
        val -= half_resolution;
      }
      return val;
    };
    return {
      lat: reducePrecision(latLng.lat),
      lng: reducePrecision(latLng.lng),
    };
  }

  unsetProcessingFailureState() {
    if (!this.isFailed()) {
      return false;
    }
    this.processingState = this.unfailedState();
  }
  // retry processing this recording
  async retryFailed() {
    this.unsetProcessingFailureState();
    await this.update({
      processingState: this.processingState,
    });
    return true;
  }

  // reprocess a recording and set all active tracks to archived
  async reprocess() {
    const tags = await this.getTags();
    if (tags.length > 0) {
      const meta = this.additionalMetadata || {};
      meta.oldTags = {
        ...((meta.oldTags || []) as Tag[]),
        ...tags.map((tag) => tag.dataValues),
      };
      this.additionalMetadata = meta;
      await this.save();
    }
    await Tag.destroy({
      where: {
        RecordingId: this.id,
      },
    });
    // FIXME: Should all be in a transaction
    const tracks = await this.getTracks();
    await Promise.all(tracks.map(async (track) => track.archiveTags()));
    await this.update({
      processingStartTime: null,
      processingEndTime: null,
      processing: false,
      processingFailedCount: 0,
      processingState: RecordingProcessingState.Reprocess,
    });
  }

  // Return a specific track for the recording.
  async getTrack(trackId: TrackId): Promise<Track | null> {
    const track = await Track.findByPk(trackId);
    if (!track) {
      return null;
    }

    // Ensure track belongs to this recording.
    if (track.RecordingId !== this.id) {
      return null;
    }
    return track;
  }

  async addTrack(
    trackData: Partial<Attributes<Track>>,
    trackMetadata?: MinimalTrackRequestData,
  ): Promise<Track> {
    const track = await this.createTrack(trackData);
    await Track.saveTrackData(track.id, trackMetadata);
    return track;
  }

  static queryBuilder = RecordingQueryBuilder;
}
export const init = (sequelizeInstance: Sequelize.Sequelize) => {
  const attributes = {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,

    // recording metadata.
    type: DataTypes.STRING,
    duration: DataTypes.FLOAT,
    recordingDateTime: DataTypes.DATE,
    location: locationField(),
    relativeToDawn: DataTypes.INTEGER,
    relativeToDusk: DataTypes.INTEGER,
    version: DataTypes.STRING,
    additionalMetadata: DataTypes.JSONB,
    cacophonyIndex: DataTypes.JSONB,
    comment: DataTypes.STRING,
    deletedAt: DataTypes.DATE,
    deletedBy: DataTypes.INTEGER,
    redacted: DataTypes.BOOLEAN,
    public: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    // Raw file data.
    rawFileKey: DataTypes.STRING,
    rawMimeType: DataTypes.STRING,
    rawFileHash: DataTypes.STRING,
    rawFileSize: DataTypes.INTEGER,

    // Processing fields. Fields set by and for the processing.
    fileKey: DataTypes.STRING,
    fileSize: DataTypes.INTEGER,
    fileMimeType: DataTypes.STRING,
    processingStartTime: DataTypes.DATE,
    processingEndTime: DataTypes.DATE,
    processing: DataTypes.BOOLEAN,
    processingMeta: DataTypes.JSONB,
    processingState: DataTypes.STRING,
    passedFilter: DataTypes.BOOLEAN,
    jobKey: DataTypes.STRING,

    // Battery relevant fields.
    batteryLevel: DataTypes.DOUBLE,
    batteryCharging: DataTypes.STRING,
    airplaneModeOn: DataTypes.BOOLEAN,
    processingFailedCount: DataTypes.INTEGER,
    currentStateStartTime: DataTypes.DATE,

    // Uploader info:
    uploader: DataTypes.ENUM("device", "user"),
    uploaderId: DataTypes.INTEGER,
  };
  Recording.init(attributes, {
    sequelize: sequelizeInstance,
    tableName: "Recordings",
    name: {
      singular: "Recording",
      plural: "Recordings",
    },
  });
  return Recording;
};

const Op = Sequelize.Op;
