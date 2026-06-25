/*
cacophony-api: The Cacophony Project API server
Copyright (C) 2026  The Cacophony Project

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
import Sequelize, {
  BelongsTo,
  CreationOptional,
  DataTypes,
  ForeignKey,
  HasOne,
  NonAttribute,
  Op,
  Transaction,
} from "sequelize";
import { ModelStaticCommon } from "@models/index.js";
import type {
  GroupId,
  RecordingId,
  StationId,
  TrackId,
  TrackTagId,
} from "@typedefs/api/common.js";
import { Station } from "@models/Station.js";
import { Group } from "@models/Group.js";
import { Recording } from "@models/Recording.js";
import { RecordingType } from "@typedefs/api/consts.js";
import { TrackTag } from "@models/TrackTag.js";
import { Track } from "@models/Track.js";
import { DeletedRecording } from "@api/V1/recordingUtil.js";
import logging from "@log";
import {
  computeVisits,
  RawVisitRow,
  VisitClassification,
  VisitRow,
} from "@typedefs/client/tempComputeVisists.js";

export type VisitId = number;

const VISIT_GAP_SECONDS = 10 * 60; // rolling window length / max gap allowed between recordings
export const VISITS_ADVISORY_LOCK_KEY = 924_001; // arbitrary constant to namespace station locks

const NEGATIVE_TAGS = new Set([
  "all.other.part",
  "all.other.poor_tracking",
  "all.other.unidentified",
  "all.other.falsepositive",
  "all.other.noise",
  "all.other.static",
  "all.other.rain",
]);

export class Visit extends ModelStaticCommon<Visit> {
  declare id: CreationOptional<VisitId>;

  declare startTime: Date;
  declare endTime: Date;

  declare StationId: ForeignKey<StationId>;
  declare GroupId: ForeignKey<GroupId>;
  declare aiClassificationRecordingId: ForeignKey<RecordingId | null>;
  declare aiClassificationTrackTagId: ForeignKey<TrackTagId | null>;
  declare humanClassificationRecordingId: ForeignKey<RecordingId | null>;
  declare humanClassificationTrackTagId: ForeignKey<TrackTagId | null>;

  declare recordingIds: CreationOptional<RecordingId[]>;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare Station?: NonAttribute<Station>;
  declare Group?: NonAttribute<Group>;
  declare AiRecording?: NonAttribute<Recording>;
  declare AiTrackTag?: NonAttribute<TrackTag>;
  declare HumanRecording?: NonAttribute<Recording>;
  declare HumanTrackTag?: NonAttribute<TrackTag>;
  declare aiClassification: NonAttribute<string | null>;
  declare humanClassification: NonAttribute<string | null>;

  declare static associations: {
    Station: BelongsTo<Station>;
    Group: BelongsTo<Group>;
    AiRecording: HasOne<Recording>;
    AiTrackTag: HasOne<TrackTag>;
    HumanRecording: HasOne<Recording>;
    HumanTrackTag: HasOne<TrackTag>;
  };

  static addAssociations() {
    this.belongsTo(Station, {
      foreignKey: "StationId",
      as: "Station",
    });
    this.belongsTo(Group, {
      foreignKey: "GroupId",
      as: "Group",
    });
    this.belongsTo(Recording, {
      foreignKey: "aiClassificationRecordingId",
      as: "AiRecording",
    });
    this.belongsTo(TrackTag, {
      foreignKey: "aiClassificationTrackTagId",
      as: "AiTrackTag",
    });
    this.belongsTo(Recording, {
      foreignKey: "humanClassificationRecordingId",
      as: "HumanRecording",
    });
    this.belongsTo(TrackTag, {
      foreignKey: "humanClassificationTrackTagId",
      as: "HumanTrackTag",
    });
  }

  /**
   * Called when a TrackTag is added and could change visit classification (and/or splitting logic).
   * Rebuilds a window around the parent recording time.
   */
  static async insertTrackTag(trackTag: TrackTag): Promise<Visit[]> {
    const recording = await this.getRecordingForTrackTag(trackTag);
    if (!recording) {
      return [];
    }
    await this.rebuildForRecording(recording);
  }

  /**
   * Called when a TrackTag is removed/archived and could change visit classification (and/or splitting logic).
   * Rebuilds a window around the parent recording time.
   */
  static async removeTrackTag(trackTag: TrackTag): Promise<Visit[]> {
    const recording = await this.getRecordingForTrackTag(trackTag);
    if (!recording) {
      return [];
    }
    return await this.rebuildForRecording(recording);
  }

  // -----------------------
  // Implementation helpers
  // -----------------------

  static async rebuildForRecording(
    recording: Recording | DeletedRecording,
    transaction?: Transaction,
  ): Promise<Visit[]> {
    if (recording.type !== RecordingType.ThermalRaw) {
      return;
    }
    // Constraints / guardrails to be aware of:
    // - recording may be deleted (deletedAt set) or missing StationId (legacy/unknown location)
    // - duration may be tiny (health-check recordings) and should probably be ignored
    // - concurrent rebuilds for the same station can interleave without locking

    const stationId = recording.StationId as StationId;
    const groupId = recording.GroupId as GroupId;
    if (!stationId) {
      return;
    }

    // Heuristic: ignore 2s-ish health checks (consistent with monitoring visit generation)
    if (recording.duration < 3) {
      return;
    }

    const recStart = new Date(recording.recordingDateTime);
    const recEnd = this.recordingEndTime(recording);
    // We really want to greedily expand the visit window until the start/end are not intersecting our bounds - i.e.
    // until we find a 10 minute gap.
    // So, start with recording padded out with 10 minutes of buffer on either side.
    // Then, if there is a recording closer than 10mins from the start or end of the window, expand it.
    // Keep expanding until we find a 10 minute gap.
    let rebuildFrom: Date = new Date(
      recStart.getTime() - VISIT_GAP_SECONDS * 1000,
    );
    let rebuildUntil: Date = new Date(
      recEnd.getTime() + VISIT_GAP_SECONDS * 1000,
    );
    let boundsAreExpanding = true;
    while (boundsAreExpanding) {
      const recs = await Recording.findAll({
        attributes: ["recordingDateTime", "duration"],
        where: {
          StationId: stationId,
          type: RecordingType.ThermalRaw,
          GroupId: recording.GroupId,
          recordingDateTime: {
            [Op.and]: [
              {
                [Op.gte]: rebuildFrom,
                [Op.lte]: rebuildUntil, // FIXME: Is this correct, or do we want one end open?
              },
            ],
          },
        },
        order: [["recordingDateTime", "ASC"]],
        transaction,
      });

      if (recs.length === 0) {
        return;
      }
      const gapMs = VISIT_GAP_SECONDS * 1000;

      const firstStartMs = recs[0].recordingDateTime.getTime();
      const lastStartMs = recs[recs.length - 1].recordingDateTime.getTime();
      const lastEndMs = lastStartMs + recs[recs.length - 1].duration * 1000;

      const neededFrom = new Date(firstStartMs - gapMs);
      const neededUntil = new Date(lastEndMs + gapMs);

      const changed =
        rebuildFrom.getTime() !== neededFrom.getTime() ||
        rebuildUntil.getTime() !== neededUntil.getTime();

      if (changed) {
        rebuildFrom = neededFrom;
        rebuildUntil = neededUntil;
      } else {
        boundsAreExpanding = false;
        break;
      }
    }
    return await this.rebuildStationWindow(
      stationId,
      groupId,
      rebuildFrom,
      rebuildUntil,
      transaction,
    );
  }

  private static recordingEndTime(
    recording: Recording | DeletedRecording,
  ): Date {
    const end = new Date(recording.recordingDateTime);
    end.setTime(end.getTime() + recording.duration * 1000);
    return end;
  }

  private static async getRecordingForTrackTag(
    trackTag: TrackTag,
  ): Promise<Recording | null> {
    if (!trackTag?.TrackId) {
      return null;
    }
    const track = await Track.findByPk(trackTag.TrackId, {
      attributes: ["id", "RecordingId"],
      include: [
        {
          model: Recording,
          attributes: [
            "id",
            "StationId",
            "GroupId",
            "recordingDateTime",
            "duration",
            "deletedAt",
          ],
        },
      ],
    });

    const rec =
      (track && (track as unknown as { Recording?: Recording }).Recording) ||
      null;
    if (!rec) {
      return null;
    }
    if (rec.deletedAt) {
      return null;
    }
    if (!rec.StationId) {
      return null;
    }
    return rec;
  }

  private static rebuildStationWindowInternal(
    stationId: StationId,
    groupId: GroupId,
    from: Date,
    until: Date,
  ): (transaction: Transaction) => Promise<Visit[]> {
    return async (transaction: Transaction) => {
      // Serialize rebuilds per station to avoid interleaving delete/insert windows.
      await this.sequelize.query(
        `SELECT pg_advisory_xact_lock(:k, :stationId);`,
        {
          transaction,
          replacements: { k: VISITS_ADVISORY_LOCK_KEY, stationId },
        },
      );
      // TODO: Ideally we don't delete, if one exists then we extend?
      // 1) Delete any existing visits that overlap the rebuild window.
      // FIXME: Make range only be open on one side
      await this.destroy({
        where: {
          StationId: stationId,
          [Op.and]: [
            { startTime: { [Op.lt]: until } },
            { endTime: { [Op.gt]: from } },
          ],
        },
        transaction,
      });

      // FIXME: Make range only be open on one side
      // FIXME: We're expanding the range again?!
      // 2) Pull recordings in a slightly wider range so that visit boundaries are correct
      // near the edge of [from, until].
      const queryFrom = new Date(from.getTime() - VISIT_GAP_SECONDS * 1000);
      const queryUntil = new Date(until.getTime() + VISIT_GAP_SECONDS * 1000);
      // Gaps & islands: derive visit_group, then aggregate each group into visit bounds + membership.
      const [islands] = (await this.sequelize.query(
        `
WITH ordered AS (
  SELECT r."id"                                                                   AS recording_id,
         r."StationId"                                                            AS station_id,
         r."GroupId"                                                              AS group_id,
         r."recordingDateTime"                                                    AS start_time,
         (r."recordingDateTime" + (r."duration" || ' seconds')::interval)         AS end_time,
         LAG(r."recordingDateTime" + (r."duration" || ' seconds')::interval)
         OVER (PARTITION BY r."StationId" ORDER BY r."recordingDateTime", r."id") AS prev_end_time
    FROM "Recordings" r
    WHERE r."deletedAt" IS NULL
      AND r.type = '${RecordingType.ThermalRaw}'
      AND r."StationId" = :stationId
      AND r."GroupId" = :groupId
      AND r."duration" >= 3      
      AND r."recordingDateTime" is not null
      AND r."recordingDateTime" >= :queryFrom
      AND r."recordingDateTime" <= :queryUntil
),
flagged AS (
  SELECT *,
    CASE
      WHEN prev_end_time IS NULL THEN 1
      WHEN start_time > prev_end_time + (:gapSeconds || ' seconds')::interval
        THEN 1
      ELSE 0
      END AS is_new_visit
  FROM ordered
),
grouped AS (
  SELECT *,
  SUM(is_new_visit) OVER (
    PARTITION BY station_id
    ORDER BY start_time, recording_id
    ROWS UNBOUNDED PRECEDING
  ) AS visit_group
  FROM flagged
)
SELECT station_id                                                AS "stationId",
       MAX(group_id)                                             as "groupId",
       MIN(start_time)                                           AS "startTime",
       MAX(end_time)                                             AS "endTime",
       jsonb_agg(recording_id ORDER BY start_time, recording_id) AS "recordingIds"
FROM grouped
GROUP BY station_id, visit_group
HAVING MIN(start_time) < :until
   AND MAX(end_time) > :from
ORDER BY MIN(start_time) ASC;
`,
        {
          transaction,
          replacements: {
            stationId,
            groupId,
            queryFrom,
            queryUntil,
            from,
            until,
            gapSeconds: VISIT_GAP_SECONDS,
          },
        },
      )) as unknown as [
        {
          groupId: GroupId;
          stationId: StationId;
          startTime: Date;
          endTime: Date;
          recordingIds: RecordingId[];
        }[],
        unknown,
      ];

      if (!islands || islands.length === 0) {
        return;
      }

      // Compute classification outside SQL (can be as simple or as sophisticated as you like).

      // Are we actually wanting to insert multiple visits for a time range, or just
      // a single visit based on a recording passed in?  For back-fill, inserting multiple sounds useful...

      const rowsToInsert: VisitRow[] = [];
      for (const island of islands) {
        const recordingIds = island.recordingIds as RecordingId[];

        // TODO: In the event that we have more than one human classification for the window,
        //  we want to split the visit appropriately.

        // TODO: What is the current behaviour with path hierarchies for visits?
        //  We need to replicate that.
        const classifications = await this.computeVisitClassifications(
          recordingIds,
          transaction,
        );

        // We still want to be able to cluster recordings that have no tags ai or human.
        if (classifications.length > 0) {
          for (const classification of classifications) {
            rowsToInsert.push({
              ...classification,
              StationId: island.stationId as StationId,
              GroupId: island.groupId as GroupId,
              startTime: new Date(classification.startTime),
              endTime: new Date(classification.endTime),
              recordingIds: classification.recordingIds,
            });
          }
        } else {
          rowsToInsert.push({
            StationId: island.stationId as StationId,
            GroupId: island.groupId as GroupId,
            startTime: island.startTime,
            endTime: island.endTime,
            recordingIds,
            aiClassificationTrackTagId: null,
            aiClassificationRecordingId: null,
            humanClassificationTrackTagId: null,
            humanClassificationRecordingId: null,
          });
        }
      }
      return await this.bulkCreate(rowsToInsert as unknown as Visit[], {
        transaction,
      });
    };
  }

  private static async rebuildStationWindow(
    stationId: StationId,
    groupId: GroupId,
    from: Date,
    until: Date,
    transaction?: Transaction,
  ): Promise<Visit[]> {
    if (from >= until) {
      return;
    }

    // NOTE: Initially we'll just always rebuild the visit that the recording is part of.

    // TODO: Adding or removing a tag from a recording is potentially a lot cheaper than rebuilding the visit window.
    //  We should prefer to do that if the existing visit window is correct. Maybe we update the generatedAt column then,
    //  or maybe we do have an updatedAt column.   Or just go back to createdAt and updatedAt?
    //  In the case where we're just adding or removing a tag, we want to grab the visit row based on the recordingIds.

    // TODO: What's the cheapest way to backfill the visits table initially?

    if (transaction) {
      return await this.rebuildStationWindowInternal(
        stationId,
        groupId,
        from,
        until,
      )(transaction);
    } else {
      return await this.sequelize.transaction(async (transaction) => {
        // FIXME: Might need to plumb this lock right up to all callers of this, and have it as a
        //  higher level transaction.
        return await this.rebuildStationWindowInternal(
          stationId,
          groupId,
          from,
          until,
        )(transaction);
      });
    }
  }

  private static async computeVisitClassifications(
    recordingIds: RecordingId[],
    transaction: Transaction,
  ): Promise<VisitClassification[]> {
    // Aggregate tag counts across the visit.
    // We join TrackTags -> Track -> Recording, filtering on visit recordings.
    // NOTE: TrackTag schema includes archivedAt; exclude archived tags.
    const excludedPaths = `'${Array.from(NEGATIVE_TAGS.values()).join("','")}'`;
    const [rows] = (await this.sequelize.query(
      `
      SELECT
        tt."path" AS path,
        tt."automatic" AS "aiTagged",
        tt."id" as "trackTagId",
        tt."confidence" as "confidence",
        t."thumbnailScore" as score,
        t."startSeconds" as "startSeconds",
        t."endSeconds" as "endSeconds",
        t."id" as "trackId",
        t."RecordingId" as "recordingId",
        r."recordingDateTime" as "recordingStart",
        (r."recordingDateTime" + (r."duration" || ' seconds')::interval) as "recordingEnd"
      FROM "TrackTags" tt
      JOIN "Tracks" t ON t."id" = tt."TrackId"
      JOIN "Recordings" r on t."RecordingId" = r."id"  
      WHERE
        tt."archivedAt" IS NULL
        AND tt.used
        -- Is this line worthwhile?
        AND tt.path not in (${excludedPaths})
        AND t."archivedAt" IS NULL
        AND t."RecordingId" IN (:recordingIds);
      `,
      {
        transaction,
        replacements: { recordingIds },
      },
    )) as unknown as [RawVisitRow[], unknown];
    logging.warning(`${JSON.stringify(rows, null, 2)}`);
    return computeVisits(rows);
  }
}

export const init = (sequelizeInstance: Sequelize.Sequelize) => {
  const attributes = {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    startTime: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    endTime: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    aiClassificationRecordingId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    aiClassificationTrackTagId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    humanClassificationRecordingId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    humanClassificationTrackTagId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    StationId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    GroupId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    recordingIds: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [] as RecordingId[],
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal("NOW()"),
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal("NOW()"),
    },
  };

  Visit.init(attributes, {
    sequelize: sequelizeInstance,
    tableName: "Visits",
    name: {
      singular: "Visit",
      plural: "Visits",
    },
  });

  return Visit;
};
