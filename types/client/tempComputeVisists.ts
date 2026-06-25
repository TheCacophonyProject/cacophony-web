import {
  GroupId,
  IsoFormattedDateString,
  RecordingId,
  StationId,
  TrackId,
  TrackTagId,
} from "@typedefs/api/common.js";

export interface RawVisitRow {
  path: string;
  aiTagged: boolean;
  score: number | null;
  startSeconds: number;
  endSeconds: number;
  recordingStart: IsoFormattedDateString;
  recordingEnd: IsoFormattedDateString;
  confidence: number;
  trackId: TrackId;
  trackTagId: TrackTagId;
  recordingId: RecordingId;
}

export interface VisitCandidate {
  path: string;
  count: number;
  score: number;
  recordingId: RecordingId;
  trackTagId: TrackTagId;
  trackId: TrackId;
  duration: number;
  startSeconds: number;
  endSeconds: number;
  recordingStart: Date;
  confidence: number;

  recordingIds: RecordingId[];
  startTime: Date;
  endTime: Date;
}

export interface VisitClassification {
  humanClassificationRecordingId: RecordingId | null; // Id of recording this visit got its best track from
  humanClassificationTrackTagId: TrackTagId | null; // Id of the track this visit got its best tag from
  aiClassificationRecordingId: RecordingId | null;
  aiClassificationTrackTagId: TrackTagId | null;
  aiClassification: string | null;
  humanClassification: string | null;
  recordingIds: RecordingId[];
  startTime: Date;
  endTime: Date;
}

export interface VisitRow {
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

const reduceTrackTags = (
  acc: Record<string, VisitCandidate>,
  item: RawVisitRow,
) => {
  const accItem = acc[item.path] || {
    count: 0,
    path: item.path,
    score: -1000,
    recordingId: -1,
    trackId: -1,
    trackTagId: -1,
    duration: 0,
    startSeconds: 0,
    endSeconds: 0,
    recordingStart: new Date(),
    confidence: 0,

    recordingIds: [],
    startTime: new Date(),
    endTime: new Date(0),
  };
  accItem.count += 1;
  if (!accItem.recordingIds.includes(item.recordingId)) {
    accItem.recordingIds.push(item.recordingId);
  }
  const score = item.score || -999;
  if (score > accItem.score) {
    accItem.score = score;
    accItem.trackId = item.trackId;
    accItem.trackTagId = item.trackTagId;
    accItem.recordingId = item.recordingId;
    accItem.duration = item.endSeconds - item.startSeconds;
    accItem.confidence = item.confidence;
    accItem.startSeconds = item.startSeconds;
    accItem.endSeconds = item.endSeconds;
    const start = new Date(item.recordingStart);
    const end = new Date(item.recordingEnd);
    if (start < accItem.startTime) {
      accItem.startTime = start;
    }
    if (end > accItem.endTime) {
      accItem.endTime = end;
    }
  }
  acc[item.path] = accItem;
  return acc;
};

// If there is more than one user tag for a visit - for different animals,
// we need to split the visit into multiple visits.  Possibly this should count
// rat and ship-rat etc as the same thing.

// Also, it's probably nonsensical to have visits of "Vehicle" etc.
// Maybe even some forms of bird or insect doesn't make sense for a visit.
// Maybe visits should only be over mammal classifications?

// TODO: For AI visits, we probably also care about track tag confidence?

const sortByScoreAndFrequency =
  (forAi: boolean) =>
  (
    a: {
      count: number;
      score: number;
      duration: number;
      confidence: number;
    },
    b: {
      count: number;
      score: number;
      duration: number;
      confidence: number;
    },
  ) => {
    // TODO: Maybe also tie-break on track duration?  Longer tracks are more likely to be of a higher-quality?
    //  We could outright filter out too-short tracks, once this algorithm has parity with the runtime version.
    // TODO: Also incorporate confidence, maybe filter out low confidence?  Maybe could filter in initial SQL query?
    if (a.count === b.count) {
      if (b.score === a.score) {
        return b.duration - a.duration;
      }
      return b.score - a.score;
    }
    return b.count - a.count;
  };

export const computeVisitsOld = (rows: RawVisitRow[]) => {
  const classification: VisitClassification = {
    startTime: new Date(),
    endTime: new Date(0),
    humanClassificationRecordingId: null,
    aiClassificationRecordingId: null,
    humanClassificationTrackTagId: null,
    aiClassificationTrackTagId: null,
    aiClassification: null,
    humanClassification: null,
    recordingIds: [],
  };
  if (!rows || rows.length === 0) {
    return [classification];
  }

  const humanCandidates = Object.values(
    rows
      .filter((r) => !r.aiTagged) //  && !NEGATIVE_TAGS.has(r.path)
      .reduce(reduceTrackTags, {}),
  ).sort(sortByScoreAndFrequency(false));

  if (humanCandidates.length > 1) {
    // If there are multiple human candidates, we need to split
    console.log("MULTIPLE HUMAN CANDIDATES");
  }
  const aiCandidates = Object.values(
    rows
      .filter((r) => r.aiTagged) //  && !NEGATIVE_TAGS.has(r.path)
      .reduce(reduceTrackTags, {}),
  ).sort(sortByScoreAndFrequency(true));

  // TODO: Visit splitting logic.  If there are multiple different human tags for these recordings, make a visit
  //  for each different human tag that contains the recordings with that human tag, and every other ai-only tagged
  //  recording.
  if (humanCandidates[0]) {
    const visit = humanCandidates[0];
    classification.humanClassificationRecordingId = visit.recordingId;
    classification.humanClassificationTrackTagId = visit.trackTagId;
    classification.humanClassification = visit.path;
    if (aiCandidates[0]) {
      const visit = aiCandidates[0];
      classification.aiClassificationRecordingId = visit.recordingId;
      classification.aiClassificationTrackTagId = visit.trackTagId;
      classification.aiClassification = visit.path;
    }
    classification.startTime = visit.startTime;
    classification.endTime = visit.endTime;
    classification.recordingIds = visit.recordingIds;
  } else if (aiCandidates[0]) {
    const visit = aiCandidates[0];
    classification.aiClassification = visit.path;
    classification.aiClassificationRecordingId = visit.recordingId;
    classification.aiClassificationTrackTagId = visit.trackTagId;
    classification.startTime = visit.startTime;
    classification.endTime = visit.endTime;
    classification.recordingIds = visit.recordingIds;
  }
  console.log("HERE", classification);
  return [classification];
};

const sortVisitRows = (a: RawVisitRow, b: RawVisitRow) => {
  const diff =
    new Date(a.recordingStart).getTime() - new Date(b.recordingStart).getTime();
  if (diff === 0) {
    return a.recordingId - b.recordingId;
  }
  return diff;
};

export const computeVisits = (rows: RawVisitRow[]) => {
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
    // TODO: When we have no tracks on a set of recordings, and therefore
    //  no rows, we still want to make a null classification/ visit island
    const classification: VisitClassification = {
      startTime: new Date(),
      endTime: new Date(0),
      humanClassificationRecordingId: null,
      aiClassificationRecordingId: null,
      humanClassificationTrackTagId: null,
      aiClassificationTrackTagId: null,
      aiClassification: null,
      humanClassification: null,
      recordingIds: [],
    };
    return [classification];
  }

  const humanRowsByPath = new Map<string, RawVisitRow[]>();
  const aiRowsByPath = new Map<string, RawVisitRow[]>();

  for (const row of rows) {
    if (!row.aiTagged) {
      const list = humanRowsByPath.get(row.path) || [];
      list.push(row);
      humanRowsByPath.set(row.path, list);
    } else {
      const list = aiRowsByPath.get(row.path) || [];
      list.push(row);
      aiRowsByPath.set(row.path, list);
    }
  }

  const humanPaths = Array.from(humanRowsByPath.keys());
  const results: VisitClassification[] = [];

  if (humanPaths.length > 0) {
    for (const h of humanPaths) {
      const visitRows: RawVisitRow[] = [];
      const hRows = humanRowsByPath.get(h)!;
      visitRows.push(...hRows);

      // I don't think this is quite correct.
      for (const [a, aRows] of aiRowsByPath) {
        if (a === h || !humanRowsByPath.has(a)) {
          visitRows.push(...aRows);
        }
      }

      visitRows.sort(sortVisitRows);
      let minStart = new Date(visitRows[0].recordingStart);
      let maxEnd = new Date(visitRows[0].recordingEnd);
      const recordingIds = new Set<RecordingId>();

      for (const row of visitRows) {
        const start = new Date(row.recordingStart);
        const end = new Date(row.recordingEnd);
        if (start < minStart) {
          minStart = start;
        }
        if (end > maxEnd) {
          maxEnd = end;
        }
        recordingIds.add(row.recordingId);
      }

      let bestHumanRow: RawVisitRow | null = null;
      for (const row of hRows) {
        if (
          !bestHumanRow ||
          (row.score !== null &&
            bestHumanRow.score !== null &&
            row.score > bestHumanRow.score)
        ) {
          bestHumanRow = row;
        }
      }

      let bestAiRow: RawVisitRow | null = null;
      for (const row of visitRows) {
        if (row.aiTagged) {
          if (
            !bestAiRow ||
            (row.score !== null &&
              bestAiRow.score !== null &&
              row.score > bestAiRow.score)
          ) {
            bestAiRow = row;
          }
        }
      }

      const classification: VisitClassification = {
        startTime: minStart,
        endTime: maxEnd,
        humanClassificationRecordingId: bestHumanRow
          ? bestHumanRow.recordingId
          : null,
        humanClassificationTrackTagId: bestHumanRow
          ? bestHumanRow.trackTagId
          : null,
        aiClassificationRecordingId: bestAiRow ? bestAiRow.recordingId : null,
        aiClassificationTrackTagId: bestAiRow ? bestAiRow.trackTagId : null,
        aiClassification: bestAiRow ? bestAiRow.path : null,
        humanClassification: h,
        recordingIds: Array.from(recordingIds),
      };
      results.push(classification);
    }
  } else if (aiRowsByPath.size) {
    const mostFrequentAiClassification = {
      count: 0,
      rows: [] as RawVisitRow[],
    };
    let bestAiRow: RawVisitRow | null = null;
    for (const entries of aiRowsByPath.values()) {
      if (entries.length > mostFrequentAiClassification.count) {
        mostFrequentAiClassification.count = entries.length;
        mostFrequentAiClassification.rows = entries;
      }
    }
    for (const row of mostFrequentAiClassification.rows) {
      if (
        !bestAiRow ||
        (row.score !== null &&
          bestAiRow.score !== null &&
          row.score > bestAiRow.score)
      ) {
        bestAiRow = row;
      }
    }
    const visitRows = mostFrequentAiClassification.rows.sort(sortVisitRows);
    let minStart = new Date();
    let maxEnd = new Date(0);
    const recordingIds = new Set<RecordingId>();

    for (const row of visitRows) {
      const start = new Date(row.recordingStart);
      const end = new Date(row.recordingEnd);
      if (start < minStart) {
        minStart = start;
      }
      if (end > maxEnd) {
        maxEnd = end;
      }
      recordingIds.add(row.recordingId);
    }

    results.push({
      startTime: minStart,
      endTime: maxEnd,
      humanClassificationRecordingId: null,
      humanClassificationTrackTagId: null,
      humanClassification: null,
      aiClassificationRecordingId: bestAiRow!.recordingId,
      aiClassificationTrackTagId: bestAiRow!.trackTagId,
      aiClassification: bestAiRow!.path,
      recordingIds: Array.from(recordingIds),
    });
  }

  // NOTE: This sorting can be removed in production, we don't care about
  // the order visits are inserted in the DB.
  // Sort classifications by startTime
  results.sort((a, b) => {
    const startTime = b.startTime.getTime() - a.startTime.getTime();
    if (startTime === 0) {
      // Tie-break on classification.
      if (a.humanClassification && b.humanClassification) {
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
