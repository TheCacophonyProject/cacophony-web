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
  NonAttribute,
  Op,
  Transaction,
} from "sequelize";
import { ModelStaticCommon } from "@models/index.js";
import type { GroupId, RecordingId, StationId } from "@typedefs/api/common.js";
import { Station } from "@models/Station.js";
import { Group } from "@models/Group.js";
import { Recording } from "@models/Recording.js";
import { RecordingType } from "@typedefs/api/consts.js";
import { TrackTag } from "@models/TrackTag.js";
import { Track } from "@models/Track.js";
import { DeletedRecording } from "@api/V1/recordingUtil.js";

export type VisitId = number;

export interface VisitClassification {
  path: string;
  source: "ai" | "human" | "none";
  //counts: Record<string, number>;
}

interface VisitRow {
  StationId: StationId;
  GroupId: GroupId;
  startTime: Date;
  endTime: Date;
  recordingIds: RecordingId[];
  classification: VisitClassification | null;
}

const VISIT_GAP_SECONDS = 10 * 60; // rolling window length / max gap allowed between recordings
export const VISITS_ADVISORY_LOCK_KEY = 924_001; // arbitrary constant to namespace station locks
export const VISITS_ADVISORY_LOCK_KEY_2 = 924_002; // arbitrary constant to namespace station locks

const NEGATIVE_TAGS = new Set([
  "part",
  "poor tracking",
  "unidentified",
  "unknown",
  "false-positive",
  "noise",
  "none",
]);

export class Visit extends ModelStaticCommon<Visit> {
  declare id: CreationOptional<VisitId>;

  declare startTime: Date;
  declare endTime: Date;

  declare classification: CreationOptional<VisitClassification | null>;

  // These column names intentionally match the migration ("stationId", "projectId")
  declare StationId: ForeignKey<StationId>;
  declare GroupId: ForeignKey<GroupId>;

  declare recordingIds: CreationOptional<RecordingId[]>;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare Station?: NonAttribute<Station>;
  declare Group?: NonAttribute<Group>;

  declare static associations: {
    Station: BelongsTo<Station>;
    Group: BelongsTo<Group>;
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
  }

  static createVisitsInSpan() {
    // Back fill?
    return;
  }
  /**
   * Called when a TrackTag is added and could change visit classification (and/or splitting logic).
   * Rebuilds a window around the parent recording time.
   */
  static async insertTrackTag(trackTag: TrackTag): Promise<void> {
    const recording = await this.getRecordingForTrackTag(trackTag);
    if (!recording) return;
    await this.rebuildForRecording(recording);
  }

  /**
   * Called when a TrackTag is removed/archived and could change visit classification (and/or splitting logic).
   * Rebuilds a window around the parent recording time.
   */
  static async removeTrackTag(trackTag: TrackTag): Promise<void> {
    const recording = await this.getRecordingForTrackTag(trackTag);
    if (!recording) return;
    await this.rebuildForRecording(recording);
  }

  // -----------------------
  // Implementation helpers
  // -----------------------

  static async rebuildForRecording(
    recording: Recording | DeletedRecording,
    transaction?: Transaction,
  ): Promise<void> {
    return;
    if (recording.type !== RecordingType.ThermalRaw) {
      return;
    }
    // Constraints / guardrails to be aware of:
    // - recording may be deleted (deletedAt set) or missing StationId (legacy/unknown location)
    // - duration may be tiny (health-check recordings) and should probably be ignored
    // - concurrent rebuilds for the same station can interleave without locking

    const stationId = recording.StationId as StationId;
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
          // FIXME: Test with GroupId constraint also
          recordingDateTime: {
            [Op.and]: [
              {
                [Op.gte]: rebuildFrom,
                [Op.lte]: rebuildUntil,
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
    await this.rebuildStationWindow(
      stationId,
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
    if (!trackTag?.TrackId) return null;

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
    if (!rec) return null;
    if (rec.deletedAt) return null;
    if (!rec.StationId) return null;
    return rec;
  }

  private static rebuildStationWindowInternal(
    stationId: number,
    from: Date,
    until: Date,
  ): (transaction: Transaction) => Promise<void> {
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

      // FIXME: We're expanding the range again?!
      // 2) Pull recordings in a slightly wider range so that visit boundaries are correct
      // near the edge of [from, until].
      const queryFrom = new Date(from.getTime() - VISIT_GAP_SECONDS * 1000);
      const queryUntil = new Date(until.getTime() + VISIT_GAP_SECONDS * 1000);
      // Gaps & islands: derive visit_group, then aggregate each group into visit bounds + membership.

      // FIXME: Also add GroupId in where clause
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
        const classification = await this.computeVisitClassification(
          recordingIds,
          transaction,
        );

        rowsToInsert.push({
          StationId: island.stationId as StationId,
          GroupId: island.groupId as GroupId,
          startTime: new Date(island.startTime),
          endTime: new Date(island.endTime),
          recordingIds,
          classification,
        });
      }
      await this.bulkCreate(rowsToInsert as unknown as Visit[], {
        transaction,
      });
    };
  }

  private static async rebuildStationWindow(
    stationId: StationId,
    from: Date,
    until: Date,
    transaction?: Transaction,
  ): Promise<void> {
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
      await this.rebuildStationWindowInternal(
        stationId,
        from,
        until,
      )(transaction);
    } else {
      await this.sequelize.transaction(async (transaction) => {
        // FIXME: Might need to plumb this lock right up to all callers of this, and have it as a
        //  higher level transaction.
        await this.rebuildStationWindowInternal(
          stationId,
          from,
          until,
        )(transaction);
      });
    }
  }

  private static async computeVisitClassification(
    recordingIds: RecordingId[],
    transaction: Transaction,
  ): Promise<VisitClassification> {
    return {
      path: "none",
      source: "none",
      //counts: {},
    };

    // Aggregate tag counts across the visit.
    // We join TrackTags -> Track -> Recording, filtering on visit recordings.
    // NOTE: TrackTag schema includes archivedAt; exclude archived tags.
    const [rows] = (await this.sequelize.query(
      `
      SELECT
        tt."what" AS what,
        tt."automatic" AS automatic,
        COUNT(*)::int AS count
      FROM "TrackTags" tt
      JOIN "Tracks" t ON t."id" = tt."TrackId"
      WHERE
        tt."archivedAt" IS NULL
        AND tt.used
        AND t."archivedAt" IS NULL
        AND t."RecordingId" IN (:recordingIds)
      GROUP BY tt."what", tt."automatic"
      ORDER BY COUNT(*) DESC;
      `,
      {
        transaction,
        replacements: { recordingIds },
      },
    )) as unknown as [
      { what: string; automatic: boolean; count: number }[],
      unknown,
    ];

    if (!rows || rows.length === 0) {
      return {
        path: "none",
        source: "none",
        //counts: {},
      };
    }

    const human = rows
      .filter(
        (r) => r.automatic === false && r.what && !NEGATIVE_TAGS.has(r.what),
      )
      .sort((a, b) => b.count - a.count);
    const ai = rows
      .filter(
        (r) => r.automatic === true && r.what && !NEGATIVE_TAGS.has(r.what),
      )
      .sort((a, b) => b.count - a.count);

    const bestHuman = human[0] || null;
    const bestAi = ai[0] || null;

    const counts: Record<string, { human: number; ai: number }> = {};
    for (const r of rows) {
      if (!r.what) continue;
      if (!counts[r.what]) counts[r.what] = { human: 0, ai: 0 };
      if (r.automatic) counts[r.what].ai += r.count;
      else counts[r.what].human += r.count;
    }

    if (bestHuman) {
      return {
        path: bestHuman.what,
        source: "human",
        //counts,
      };
    }
    if (bestAi) {
      return {
        path: bestAi.what,
        source: "ai",
        //counts,
      };
    }
    return {
      path: "none",
      source: "none",
      //counts,
    };
  }
}

export const init = (sequelizeInstance: Sequelize.Sequelize) => {
  const attributes = {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
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
    classification: {
      type: DataTypes.JSONB,
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
