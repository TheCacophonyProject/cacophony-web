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

export interface VisitClassification {
  humanClassificationRecordingId: RecordingId | null; // Id of recording this visit got its best track from
  humanClassificationTrackTagId: TrackTagId | null; // Id of the track this visit got its best tag from
  humanClassificationTrackId: TrackId | null;
  humanClassification: string | null;
  aiClassificationRecordingId: RecordingId | null;
  aiClassificationTrackTagId: TrackTagId | null;
  aiClassificationTrackId: TrackId | null;
  aiClassification: string | null;
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

const getTimespanAndRecordings = (visitRows: RawVisitRow[]) => {
  let startTime = new Date();
  let endTime = new Date(0);
  const recordingIds = new Set<RecordingId>();

  for (const row of visitRows) {
    const start = new Date(row.recordingStart);
    const end = new Date(row.recordingEnd);
    if (start < startTime) {
      startTime = start;
    }
    if (end > endTime) {
      endTime = end;
    }

    recordingIds.add(row.recordingId);
  }
  const ids = Array.from(recordingIds);
  ids.sort();
  return { startTime, endTime, recordingIds: ids };
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
    aiClassificationRecordingId: bestAiRow.recordingId,
    aiClassification: bestAiRow.path,
    aiClassificationTrackTagId: bestAiRow.trackTagId,
    aiClassificationTrackId: bestAiRow.trackId,
  };
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
  const tags = new Map<string, RawVisitRow[]>();
  let mostFrequent = 0;
  for (const row of rows) {
    const item = tags.get(row.path) || [];
    item.push(row);
    tags.set(row.path, item);
  }
  let bestRows = [] as RawVisitRow[];
  let bestRow;
  for (const rows of tags.values()) {
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
    if (rows.length > mostFrequent) {
      mostFrequent = rows.length;
      bestRows = rows;
      bestRow = getBestTrackRowForTag(rows);
    }
  }
  return bestRows;
};

const getBestTrackRowForTag = (rows: RawVisitRow[]) => {
  // NOTE: All the rows passed in here have the same tag.
  // Pick the row with the highest score,
  let bestRow = rows[0];
  for (const row of rows.slice(1)) {
    if (row.score > bestRow.score) {
      bestRow = row;
    } else if (row.score === bestRow.score) {
      const rowA = row.endSeconds - row.startSeconds;
      const rowB = bestRow.endSeconds - row.startSeconds;
      if (rowA > rowB) {
        bestRow = row;
      }
    }
  }
  return bestRow;
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
      if (!row.trackId) {
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
      const items = humanRowsByPath.get(row.path) || [];
      items.push(row);
      humanRowsByPath.set(row.path, items);
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
        recordingIds.includes(row.recordingId),
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

export const makeRawVisitRows = (
  items: [string, "human" | "ai", number?][][][],
): RawVisitRow[] => {
  const rows: RawVisitRow[] = [];
  const initialStartTime = new Date("2026-01-02T00:00:00.000Z");
  let recId = 1;
  let trackId = 1;
  let trackTagId = 1;
  for (const item of items) {
    const startTime = new Date(initialStartTime);
    startTime.setMinutes(startTime.getMinutes() + 2 * (recId - 1));
    const endTime = new Date(startTime);
    endTime.setSeconds(endTime.getSeconds() + item.length * 20);
    let i = 0;
    if (item.length) {
      for (const track of item) {
        // NOTE: we don't handle tracks without tags, that's not really a thing that's possible
        for (const [tag, tagger, score] of track) {
          rows.push({
            trackId,
            trackTagId,
            path: tag,
            confidence: 0.9,
            startSeconds: i * 10,
            endSeconds: (i + 1) * 10,
            aiTagged: tagger === "ai",
            score: score || -1000,
            recordingStart: startTime.toISOString(),
            recordingEnd: endTime.toISOString(),
            recordingId: recId,
          });
          i++;
          trackTagId++;
        }
        trackId++;
      }
    } else {
      // No tracks, but add recording anyway
      rows.push({
        trackId: null,
        trackTagId: null,
        path: "none",
        confidence: 0.9,
        startSeconds: i * 10,
        endSeconds: (i + 1) * 10,
        aiTagged: true,
        score: -1000,
        recordingStart: startTime.toISOString(),
        recordingEnd: endTime.toISOString(),
        recordingId: recId,
      });
    }
    recId++;
  }
  return rows;
};
