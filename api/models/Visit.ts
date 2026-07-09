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
  QueryTypes,
  Transaction,
} from "sequelize";
import { ModelStaticCommon } from "@models/index.js";
import {
  GroupId,
  IsoFormattedDateString,
  RecordingId,
  StationId,
  TrackId,
  TrackTagId,
} from "@typedefs/api/common.js";
import { Station } from "@models/Station.js";
import { Group } from "@models/Group.js";
import { Recording } from "@models/Recording.js";
import {
  RecordingProcessingState,
  RecordingType,
} from "@typedefs/api/consts.js";
import { TrackTag } from "@models/TrackTag.js";
import { Track } from "@models/Track.js";
import { DeletedRecording } from "@api/V1/recordingUtil.js";

export type VisitId = number;

const VISIT_GAP_SECONDS = 10 * 60; // rolling window length / max gap allowed between recordings
export const VISITS_ADVISORY_LOCK_KEY = 924_001; // arbitrary constant to namespace station locks

const UNIDENTIFIED = "all.other.unidentified";
const FALSE_POSITIVE = "all.other.falsepositive";

const NEGATIVE_TAGS = new Set([
  "all.other.part",
  "all.other.poor_tracking",
  "all.other.noise",
  "all.other.static",
  "all.other.rain",
]);

interface RawVisitRow {
  path: string;
  aiTagged: boolean;
  score: number;
  startSeconds: number;
  endSeconds: number;
  recordingStart: IsoFormattedDateString;
  recordingEnd: IsoFormattedDateString;
  confidence: number;
  trackId: TrackId | null;
  trackTagId: TrackTagId | null;
  recordingId: RecordingId;
}

interface VisitRow {
  StationId: StationId;
  GroupId: GroupId;
  startTime: Date;
  endTime: Date;
  recordingIds: RecordingId[];
  aiClassificationRecordingId: RecordingId | null;
  aiClassificationTrackTagId: TrackTagId | null;
  humanClassificationRecordingId: RecordingId | null;
  humanClassificationTrackTagId: TrackTagId | null;
}

interface VisitClassification {
  humanClassificationRecordingId: RecordingId | null; // Id of recording this visit got its best track from
  humanClassificationTrackTagId: TrackTagId | null; // Id of the track this visit got its best tag from
  humanClassificationTrackId: TrackId | null;
  humanClassification: string | null;
  aiClassificationRecordingId: RecordingId | null;
  aiClassificationTrackTagId: TrackTagId | null;
  aiClassificationTrackId: TrackId | null;
  aiClassification: string | null;
  recordingIds: [RecordingId, Date][];
  startTime: Date;
  endTime: Date;
}

const getTimespanAndRecordings = (visitRows: RawVisitRow[]) => {
  let startTime = new Date();
  let endTime = new Date(0);
  const recordingIds = new Map<RecordingId, Date>();

  for (const row of visitRows) {
    const start = new Date(row.recordingStart);
    const end = new Date(row.recordingEnd);
    if (start < startTime) {
      startTime = start;
    }
    if (end > endTime) {
      endTime = end;
    }
    recordingIds.set(row.recordingId, start);
  }
  const ids = Array.from(recordingIds);
  ids.sort((a, b) => {
    return a[1].getTime() - b[1].getTime();
  });
  return { startTime, endTime, recordingIds: ids };
};

const bestHumanClassification = (recording: {
  ai: RawVisitRow[];
  human: RawVisitRow[];
  blank: RawVisitRow[];
}) => {
  const { startTime, endTime, recordingIds } = getTimespanAndRecordings([
    ...recording.ai,
    ...recording.human,
    ...recording.blank,
  ]);
  const {
    aiClassificationRecordingId,
    aiClassification,
    aiClassificationTrackTagId,
    aiClassificationTrackId,
  } = bestAiClassification(recording.ai);
  // Cool, no splitting, just get the human class, and add all the ai recordings in too.
  const bestRow = getBestTrackRowForTag(recording.human);
  return {
    aiClassificationTrackTagId,
    aiClassification,
    aiClassificationRecordingId,
    aiClassificationTrackId,
    startTime,
    endTime,
    recordingIds,
    humanClassificationTrackTagId: bestRow.trackTagId,
    humanClassification: bestRow.path,
    humanClassificationRecordingId: bestRow.recordingId,
    humanClassificationTrackId: bestRow.trackId,
  };
};

const getMostFrequentTaggedRows = (rows: RawVisitRow[]) => {
  if (rows.length === 0) {
    return rows;
  }
  const tags = new Map<string, RawVisitRow[]>();
  let mostFrequent = 0;
  for (const row of rows) {
    const item = tags.get(row.path) || [];
    item.push(row);
    tags.set(row.path, item);
  }
  let bestRows = [] as RawVisitRow[];
  let bestRow;
  // NOTE: If we have 3 unidentified tracks and one possum, we should choose the possum.
  for (const [path, rows] of tags.entries()) {
    if (bestRow && mostFrequent === rows.length) {
      const newBestRow = getBestTrackRowForTag([
        getBestTrackRowForTag(rows),
        bestRow,
      ]);
      if (newBestRow !== bestRow) {
        bestRow = newBestRow;
        bestRows = rows;
      }
    }
    if (rows.length > mostFrequent || bestRow.path === UNIDENTIFIED) {
      if (
        (mostFrequent === 0 && path === UNIDENTIFIED) ||
        path !== UNIDENTIFIED
      ) {
        mostFrequent = rows.length;
        bestRows = rows;
        bestRow = getBestTrackRowForTag(rows);
      }
    }
  }
  return bestRows;
};

const getBestTrackRowForTag = (rows: RawVisitRow[]) => {
  // Pick the row with the highest score,
  if (rows.length === 0) {
    return undefined;
  }
  const duration = (r: RawVisitRow) => r.endSeconds - r.startSeconds;
  const maxDuration = Math.max(...rows.map((r) => duration(r)));
  const confidence = (c: number) => {
    if (c > 1) {
      return c;
    }
    return c / 100;
  };
  const score = (r: RawVisitRow) => {
    // This formulation seems to work well for tie-breaking.
    return r.score * confidence(r.confidence) * (duration(r) / maxDuration);
  };
  let bestRow = rows[0];
  let bestScore = score(bestRow);
  for (const row of rows.slice(1)) {
    const candidateScore = score(row);
    if (bestRow.path === UNIDENTIFIED && row.path !== UNIDENTIFIED) {
      bestRow = row;
      bestScore = candidateScore;
    } else if (
      (candidateScore > bestScore &&
        row.path !== UNIDENTIFIED &&
        bestRow.path !== UNIDENTIFIED) ||
      (bestRow.path === UNIDENTIFIED && row.path !== UNIDENTIFIED) ||
      (bestRow.path === UNIDENTIFIED && candidateScore > bestScore)
    ) {
      bestRow = row;
      bestScore = candidateScore;
    } else if (candidateScore === bestScore) {
      const rowA = row.endSeconds - row.startSeconds;
      const rowB = bestRow.endSeconds - row.startSeconds;
      if (rowA > rowB) {
        bestRow = row;
        bestScore = candidateScore;
      }
    }
  }
  return bestRow;
};

const bestAiClassification = (
  ai: RawVisitRow[],
  blankRows: RawVisitRow[] = [],
): VisitClassification => {
  const { startTime, endTime, recordingIds } = getTimespanAndRecordings([
    ...ai,
    ...blankRows,
  ]);

  // best AI is most frequent tag in `ai`, followed by score and duration.
  const bestAiRow = getBestTrackRowForTag(getMostFrequentTaggedRows(ai));
  return {
    humanClassification: null,
    humanClassificationRecordingId: null,
    humanClassificationTrackTagId: null,
    humanClassificationTrackId: null,
    startTime,
    endTime,
    recordingIds,
    aiClassificationRecordingId: bestAiRow ? bestAiRow.recordingId : null,
    aiClassification: bestAiRow ? bestAiRow.path : null,
    aiClassificationTrackTagId: bestAiRow ? bestAiRow.trackTagId : null,
    aiClassificationTrackId: bestAiRow ? bestAiRow.trackId : null,
  };
};

const computeVisits = (rows: RawVisitRow[]) => {
  /*
Visit computation logic:
We have a bunch of classifications for different tracks over a set of recordings. (`RawVisitRow[]`)
Some classifications are made by AI (`aiTagged` == true), and some by humans (`aiTagged` == false).
For each *unique* human classification, we want to emit one visit.
That visit needs to include the start and end times of the recordings that make up the set of
recordings that comprise the visit.
A human-classified visit should also include any AI-classified recordings where the AI classification
doesn't match another human visit classification.
A human-classified visit should also include any AI-classified recordings where the AI classification matches the
human classification of the visit.

If there are no human classifications, there will be only one visit created for the set of recordings,
and this is calculated by taking the most frequent AI classification.
If there are an equal number of different AI classifications, tie-breaking is performed by sorting
on the `score` property of each `RawVisitRow`.

Another requirement: recordingIds for each visit should be sorted by startTime, ascending.
*/
  if (!rows || rows.length === 0) {
    return [];
  }

  const results: VisitClassification[] = [];
  const uniqueHumanTags = new Set<string>();
  const humanRows: RawVisitRow[] = [];
  const aiRows: RawVisitRow[] = [];
  const blankRows: RawVisitRow[] = [];
  // NOTE: other recordings with no tracks will be merged in later, and distributed to all visits emitted by this function.
  for (const row of rows) {
    if (row.aiTagged) {
      if (!row.trackId || row.path === FALSE_POSITIVE) {
        blankRows.push(row);
      } else {
        aiRows.push(row);
      }
    } else if (!row.aiTagged) {
      uniqueHumanTags.add(row.path);
      humanRows.push(row);
    }
  }
  if (uniqueHumanTags.size === 0) {
    results.push(bestAiClassification(aiRows, blankRows));
  } else if (uniqueHumanTags.size === 1) {
    results.push(
      bestHumanClassification({
        ai: aiRows,
        human: humanRows,
        blank: blankRows,
      }),
    );
  } else {
    // Get the rows that have human classifications grouped by recording.
    // If multiple human classifications are on the same recording, but on different tracks of that recording,
    // then return a VisitClassification for each human classification containing the recording the human classification
    // is from, plus the recordings for any other human classifications that have the same tag/classification.
    // Then assign AI-only tagged recordings to each human visit classification, as long as the best AI tag for the recording
    // is not the same as that of another human visit classification.  In that case, only assign the AI tagged recording
    // to the human visit classification that its best tag is for.

    const humanRowsByPath = new Map<string, RawVisitRow[]>();
    for (const row of humanRows) {
      if (row.path !== UNIDENTIFIED) {
        const items = humanRowsByPath.get(row.path) || [];
        items.push(row);
        humanRowsByPath.set(row.path, items);
      }
    }
    const uniqueHuman = Array.from(uniqueHumanTags);
    for (const [path, entries] of humanRowsByPath.entries()) {
      const trackIds = entries.map((entry) => entry.trackId);
      const otherHumanTags = uniqueHuman.filter((t) => t !== path);
      const trackIdsForOtherHumanTags = otherHumanTags.flatMap((t) => {
        return (humanRowsByPath.get(t) || []).map((entry) => entry.trackId);
      });
      // For each recording that isn't tagged with `path`, if it's not also
      // tagged with some other human path, we can add its AI row to this visit.

      const applicableAiRows = aiRows.filter((row) => {
        if (trackIds.includes(row.trackId)) {
          return false;
        }
        return !trackIdsForOtherHumanTags.includes(row.trackId);
      });
      const { startTime, endTime, recordingIds } = getTimespanAndRecordings([
        ...entries,
        ...applicableAiRows,
        ...blankRows,
      ]);

      const bestHumanRow = getBestTrackRowForTag(entries);

      const humanVisitAiRows = aiRows.filter((row) =>
        recordingIds.some((r) => r[0] === row.recordingId),
      );

      const bestAiForVisit = bestAiClassification(
        humanVisitAiRows.length > 0 ? humanVisitAiRows : aiRows,
      );

      results.push({
        humanClassification: bestHumanRow.path,
        humanClassificationRecordingId: bestHumanRow.recordingId,
        humanClassificationTrackTagId: bestHumanRow.trackTagId,
        humanClassificationTrackId: bestHumanRow.trackId,
        aiClassification: bestAiForVisit.aiClassification,
        aiClassificationRecordingId: bestAiForVisit.aiClassificationRecordingId,
        aiClassificationTrackTagId: bestAiForVisit.aiClassificationTrackTagId,
        aiClassificationTrackId: bestAiForVisit.aiClassificationTrackId,
        startTime,
        endTime,
        recordingIds,
      });
    }
  }

  // NOTE: This sorting can be removed in production, we don't care about
  // the order visits are inserted in the DB.
  // Sort classifications by startTime
  results.sort((a, b) => {
    const startTime = a.startTime.getTime() - b.startTime.getTime();
    if (startTime === 0) {
      // Tie-break on classification.
      if (a.humanClassification && b.humanClassification) {
        if (a.humanClassification === b.humanClassification) {
          return a.humanClassificationRecordingId! >
            b.humanClassificationRecordingId!
            ? -1
            : 1;
        }
        return b.humanClassification > a.humanClassification ? -1 : 1;
      } else {
        if (a.humanClassification && !b.humanClassification) {
          return -1;
        } else {
          return 1;
        }
      }
    } else {
      return startTime;
    }
  });

  return results;
};

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
                [Op.lt]: rebuildUntil,
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

  static mergeConflictingHumanVisits(visits: Visit[]) {
    // Check if there are any visits that multiple different
    // human track tags on the same trackId, maybe postprocess API output.
    //for (const visit of visits) {
    // TODO
    //}
    return visits;
  }

  private static rebuildStationWindowInternal(
    stationId: StationId,
    groupId: GroupId,
    from: Date,
    until: Date,
  ): (transaction: Transaction) => Promise<Visit[]> {
    return async (transaction: Transaction) => {
      if (until <= from) {
        return [];
      }
      // Serialize rebuilds per station to avoid interleaving delete/insert windows.
      await this.sequelize.query(
        `SELECT pg_advisory_xact_lock(:k, :stationId);`,
        {
          transaction,
          replacements: { k: VISITS_ADVISORY_LOCK_KEY, stationId },
        },
      );
      // TODO: Ideally we don't delete, if one exists then we extend?
      await this.destroy({
        where: {
          StationId: stationId,
          GroupId: groupId,
          [Op.and]: [
            { startTime: { [Op.lt]: until } },
            { endTime: { [Op.gte]: from } },
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
      AND r."processingState" = '${RecordingProcessingState.Finished}'
      AND r."StationId" = :stationId
      AND r."GroupId" = :groupId
      AND r."duration" >= 3      
      AND r."recordingDateTime" is not null
      AND r."recordingDateTime" >= :queryFrom
      AND r."recordingDateTime" < :queryUntil
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
      const rowsToInsert: VisitRow[] = [];
      for (const island of islands) {
        const recordingIds = island.recordingIds as RecordingId[];
        const classifications = await this.computeVisitClassifications(
          recordingIds,
          transaction,
        );
        // We still want to be able to cluster recordings that have no tags ai or human.
        if (classifications.length > 0) {
          for (const classification of classifications) {
            rowsToInsert.push({
              StationId: island.stationId as StationId,
              GroupId: island.groupId as GroupId,
              startTime: new Date(classification.startTime),
              endTime: new Date(classification.endTime),
              recordingIds: classification.recordingIds.map((r) => r[0]),
              aiClassificationTrackTagId:
                classification.aiClassificationTrackTagId,
              aiClassificationRecordingId:
                classification.aiClassificationRecordingId,
              humanClassificationTrackTagId:
                classification.humanClassificationTrackTagId,
              humanClassificationRecordingId:
                classification.humanClassificationRecordingId,
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
    const rows = (await this.sequelize.query(
      `
      SELECT
        tt."path" AS path,
        tt."automatic" AS "aiTagged",
        tt."id" as "trackTagId",
        tt."confidence" as "confidence",
        greatest(-1000, t."thumbnailScore") as score,
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
        type: QueryTypes.SELECT,
      },
    )) as unknown as RawVisitRow[];
    const visits = computeVisits(rows);
    {
      // Handle recordings without tracks.
      const allVisitRecordingIds = new Set(
        visits.flatMap((v) => v.recordingIds.map((r) => r[0])),
      );
      const recordingIdsWithoutTracks = [];
      // Add any recordingIds that didn't come back from the query (these were recordings with no tracks).
      // We also want to adjust the start/end time of each visit accordingly.
      for (const recordingId of recordingIds) {
        if (!allVisitRecordingIds.has(recordingId)) {
          recordingIdsWithoutTracks.push(recordingId);
        }
      }
      if (recordingIdsWithoutTracks.length > 0) {
        // We need to get the start and end times of these recordings.
        const result = (await this.sequelize.query(
          `
              select 
              id, 
              "recordingDateTime" as "startTime",
              "recordingDateTime" + ("duration" || ' seconds')::interval as "endTime"
              from "Recordings"
              where id in (:recordingIds);
            `,
          {
            transaction,
            replacements: { recordingIds: recordingIdsWithoutTracks },
            type: QueryTypes.SELECT,
          },
        )) as unknown as {
          id: RecordingId;
          startTime: IsoFormattedDateString;
          endTime: IsoFormattedDateString;
        }[];
        if (result.length > 0) {
          // Add these recordings to all visits,
          // adjust the start and end times.
          const startTime = new Date(
            Math.min(...result.map((r) => new Date(r.startTime).getTime())),
          );
          const endTime = new Date(
            Math.max(...result.map((r) => new Date(r.endTime).getTime())),
          );
          const recordingIdsWithStartTimes = result.map((r) => [
            r.id,
            new Date(r.startTime),
          ]) as [RecordingId, Date][];
          for (const visit of visits) {
            visit.recordingIds.push(...recordingIdsWithStartTimes);
            visit.recordingIds.sort((a, b) => a[1].getTime() - b[1].getTime());
            if (startTime < visit.startTime) {
              visit.startTime = startTime;
            }
            if (endTime > visit.endTime) {
              visit.endTime = endTime;
            }
          }
        }
      }
    }
    return visits;
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
