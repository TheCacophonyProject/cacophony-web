import type { GroupId, StationId } from "@typedefs/api/common.js";
import type { TrackId } from "@typedefs/api/common.js";
import {
  type RecordingProcessingState,
  type RecordingType,
  TagMode,
} from "@typedefs/api/consts.js";
import type { Recording } from "@models/Recording.js";
import { queryRecordingsInProject } from "@api/V1/recordingsBulkQueryUtil.js";
import {
  getCommonAncestorForTags,
  NON_ANIMAL_TAGS,
  UNIDENTIFIED_TAGS,
} from "@api/V1/Visits.js";
import modelsInit from "@models/index.js";
import { Op } from "sequelize";
import type { TrackTag } from "@models/TrackTag.js";
const models = await modelsInit();

const MINUTE = 60;
const MAX_SECS_BETWEEN_RECORDINGS = 10 * MINUTE;
const MAX_SECS_VIDEO_LENGTH = 10 * MINUTE;
const RECORDINGS_LIMIT = 2000;
const MAX_MINS_AFTER_TIME = 70;

export interface MonitoringPageCriteria2 {
  stations: StationId[];
  group: GroupId;
  searchFrom: Date;
  searchUntil: Date;
  types?: (
    | RecordingType.ThermalRaw
    | RecordingType.TrailCamVideo
    | RecordingType.TrailCamImage
  )[];
}

export async function generateVisits2(
  search: MonitoringPageCriteria2,
  logging: (message: string, time: number) => void
): Promise<[VisitDef, Recording[]][][]> {
  const from = new Date(search.searchFrom);
  from.setSeconds(
    from.getSeconds() - (MAX_SECS_BETWEEN_RECORDINGS + MAX_SECS_VIDEO_LENGTH)
  );
  const until = new Date(search.searchUntil);
  until.setMinutes(until.getMinutes() + MAX_MINS_AFTER_TIME);
  const recordings = await getRecordings2(search, from, until, logging);
  const clusters = clusterRecordings(recordings);
  // TODO: Discard any clusters that are right up against the edge of the window.
  const flatClusters = Object.values(clusters).flatMap((r) => r);
  return flatClusters.map((visit) => classifyCluster(visit));

  // For each cluster, work out the canonical tag, plus the AI tag.
  // Should we be pre-filtering the recordings in our query?
  // if (recordings.length === RECORDINGS_LIMIT) {
  //   return new ClientError(
  //       "Too many recordings to retrieve. Please reduce your page size."
  //   );
  // }
  // const groupStart = performance.now();
  // const visits = groupRecordingsIntoVisits2(
  //   recordings,
  //   search.searchFrom,
  //   search.searchUntil,
  // );
  // logging(`GROUP TIME;`, performance.now() - groupStart);
  //
  // const incompleteCutoff = new Date(until);
  // incompleteCutoff.setSeconds(incompleteCutoff.getSeconds() - MAX_SECS_BETWEEN_RECORDINGS);
  //
  // const calcTagStart = performance.now();
  // const actualVisits = [];
  // // for (const visit of visits) {
  // //   const { split } = calculateTags(visit, "Master");
  // //   if (split) {
  // //     // We need to create multiple visits from this visit, since there were multiple user tags for the period.
  // //     const userVisits = {};
  // //     for (const recording of (split as Visit2).recordings) {
  // //       const userTag = recording.Tracks.filter(
  // //         (track) =>
  // //           track.isAITagged === false &&
  // //           ![...NON_ANIMAL_TAGS, "false-positive"].includes(track.tag)
  // //       );
  // //       // In the case where there are two user tags on a single recording (multiple different animals) we'll
  // //       // generate another visit using the same recording.
  // //       if (userTag.length !== 0) {
  // //         for (const track of userTag) {
  // //           userVisits[track.tag] = userVisits[track.tag] || [];
  // //           userVisits[track.tag].push(recording);
  // //         }
  // //       }
  // //     }
  // //     for (const recording of (split as Visit2).recordings) {
  // //       const userTag = recording.tracks.filter(
  // //         (track) => track.isAITagged === false
  // //       );
  // //       if (userTag.length === 0) {
  // //         // Add the ai-only recording to all user visits
  // //         for (const visit of Object.values(userVisits)) {
  // //           (visit as VisitRecording[]).push(recording);
  // //         }
  // //       }
  // //     }
  // //     for (const visitRecordings of Object.values(userVisits)) {
  // //       const record = recordings.find(
  // //         (rec) => rec.id === visitRecordings[0].recId
  // //       );
  // //       const actualVisit = new Visit(visit.stationId, record.Station, record);
  // //       for (let i = 1; i < (visitRecordings as VisitRecording[]).length; i++) {
  // //         const record = recordings.find(
  // //           (rec) => rec.id === visitRecordings[i].recId
  // //         );
  // //         actualVisit.addRecordingIfWithinTimeLimits(record);
  // //       }
  // //       actualVisits.push(actualVisit);
  // //     }
  // //     for (const aVisit of actualVisits) {
  // //       if (aVisit.rawRecordings) {
  // //         aVisit.calculateTags("Master", true);
  // //         delete aVisit.rawRecordings;
  // //       }
  // //       aVisit.incomplete = aVisit.incomplete || aVisit.end > incompleteCutoff;
  // //     }
  // //   } else {
  // //     visit.incomplete = visit.incomplete || visit.end > incompleteCutoff;
  // //     actualVisits.push(visit);
  // //   }
  // // }
  // logging(`CALC TAGS TIME;`, performance.now() - calcTagStart);
  //
  // return actualVisits;
}

async function getRecordings2(
  params: MonitoringPageCriteria2,
  from: Date,
  until: Date,
  logging: (message: string, time: number) => void
): Promise<Recording[]> {
  // const where: any = {
  //   duration: { [Op.gte]: 2.5 }, // Ignore our 2 second health-check recordings
  //   type: { [Op.in]: params.types },
  //   deletedAt: { [Op.eq]: null },
  //   recordingDateTime: { [Op.gt]: from, [Op.lt]: until },
  //   GroupId: params.group,
  // };
  // if (params.stations) {
  //   where.StationId = params.stations;
  // }

  // TODO: Let's use our own recording where here.

  // TODO: We can probably make visits faster by using the new bulk-query API here.
  // TODO: We may be able to improve things by filtering out false-positives from results
  // const order = [["recordingDateTime", "ASC"]];
  // const builder = await new models.Recording.queryBuilder().init(200, {
  //   where,
  //   limit: RECORDINGS_LIMIT,
  //   order,
  //   filterModel: "true",
  //   viewAsSuperUser: true,
  // });
  // const recordings = await models.Recording.findAll({...builder.get(), logging});

  // NOTE: Current visits query doesn't filter out filtered tracks (tracks that have only false-positives)
  //  I guess we do still have visits of "None" currently, and we include recordings as part of the visit that would
  //  otherwise be filtered.

  // const { recordingIds } = await queryRecordingsInProject(
  //   models,
  //   params.group,
  //   2.5,
  //   false,
  //   params.types,
  //   undefined,
  //   [],
  //   params.stations || [],
  //   [],
  //   false,
  //   [],
  //   TagMode.Any,
  //   true,
  //   false,
  //   200,
  //   from,
  //   until,
  //   0,
  //   logging,
  //   "desc"
  // );

  // TODO: If we got the limit, we need to cull back to the beginning of the earliest visit boundary.
  // Then the user is expected to adjust there from param to the earliest time and make another request, until
  // they exhaust the returned visits.  I guess it's possible that no visits complete in the time specified?
  return models.Recording.findAll({
    where: {
      // NOTE: use two-pass and recording ids if we want to exclude filtered tracks
      //id: { [Op.in]: recordingIds },
      GroupId: { [Op.in]: [params.group] },
      duration: { [Op.gte]: 2.5 },
      deletedAt: { [Op.eq]: null },
      type: { [Op.in]: params.types },
      ...(params.stations.length
        ? { StationId: { [Op.in]: params.stations } }
        : {}),
      recordingDateTime: { [Op.gte]: from, [Op.lt]: until },
    },
    attributes: ["id", "recordingDateTime"],
    include: [
      {
        model: models.Group,
        attributes: ["id", "groupName"],
      },
      {
        model: models.Track,
        required: false,
        attributes: ["id", "startSeconds", "endSeconds"],
        where: {
          archivedAt: {
            [Op.is]: null,
          },
          filtered: false,
        },
        include: [
          {
            required: false,
            model: models.TrackTag,
            attributes: [
              "what",
              "path",
              "UserId",
              "id",
              "automatic",
              "confidence",
              "model",
            ],
            include: [
              { model: models.User, attributes: ["userName", "id"] },
              {
                model: models.TrackTagUserData,
                required: false,
                attributes: ["gender", "maturity"],
              },
            ],
            where: {
              used: true,
              archivedAt: {
                [Op.is]: null,
              },
            },
          },
        ],
      },
      {
        model: models.Station,
        attributes: ["name", "id", "location"],
      },
    ],
    order: [["recordingDateTime", "desc"]],
    limit: 200,
    logging,
  });
}

interface VisitRecording {
  recId: number;
  start: string;
  tracks: VisitTrack[];
  processingState: RecordingProcessingState;
}

interface VisitTrack {
  // this is the overriding tag that we have given this event
  // e.g. if it was unidentified but grouped under a cat visit
  // assumedTag would be "cat"
  id: TrackId;
  tag: string;
  aiTag: string;
  isAITagged: boolean;
  start: string;
  end: string;
  mass: number; // For tie-breaking purposes with AI only visits
  userTagsConflict?: boolean;
}

interface VisitDef {
  classification: string;
  classificationAi: string;
  classFromUserTag: boolean;
  userTagsConflict?: boolean;
}
type TagName = string;
const getBestGuessFromAi = (
  tracks: VisitTrack[]
): [TagName, VisitTrack[]][] => {
  return getBestGuess2(
    Object.entries(
      tracks.reduce((acc, track) => {
        const tag = track.aiTag;
        if (tag) {
          acc[tag] = acc[tag] || [];
          acc[tag].push(track);
        }
        return acc;
      }, {})
    )
  );
};

const classifyCluster = (
  recordings: Recording[]
): [VisitDef, Recording[]][] => {
  // Get all the tracks of all the recordings.
  // Get the canonical track for each recording, and then get the canonical tag for each visit.
  const visitRecordings = recordings.map(calculateTrackTags2);
  const allVisitTracks = visitRecordings.flatMap(
    (recording) => recording.tracks
  );
  const bestHumanTags = getBestUserGuess(allVisitTracks);
  let classification: string;
  let userTagsConflict: boolean;
  let classificationAi: string;

  // No human tags, just rely on AI.
  if (bestHumanTags.length === 0) {
    // Easy AI case
    const bestAiTags = getBestAiGuess(allVisitTracks);
    if (bestAiTags.length > 1) {
      // Tie-break based on the average mass of the track in question.
      let bestMass = -1;
      let bestTag = "none";
      for (const [tag, tracks] of bestAiTags) {
        const mass = tracks.reduce((a, { mass }) => a + (mass || 0), 0);
        if (mass > bestMass) {
          bestMass = mass;
          bestTag = tag;
        }
      }
      classification = bestTag;
    } else {
      classification = bestAiTags.length > 0 ? bestAiTags[0][0] : "none";
    }
    classificationAi = classification;
    return [
      [
        {
          classificationAi,
          classification,
          classFromUserTag: false,
        },
        recordings,
      ],
    ];
  } else {
    if (bestHumanTags.length === 1) {
      // Easy human case
      let classFromUserTag: boolean;
      const bestHumanTag = bestHumanTags[0];
      const bestAiTags = getBestAiGuess(allVisitTracks);
      classificationAi = bestAiTags.length > 0 ? bestAiTags[0][0] : "none";
      if (
        ![...NON_ANIMAL_TAGS, "false-positive"].includes(bestHumanTag[0]) ||
        [...NON_ANIMAL_TAGS, "false-positive", "none"].includes(
          classificationAi
        )
      ) {
        // Only prefer human tags for visit labels if they're not false-positives *or* the only AI tags are nothing/false-positive type tags.
        classification = bestHumanTag[0];
        classFromUserTag = true;
        if (bestHumanTags[0][1].some((tag) => tag.userTagsConflict)) {
          userTagsConflict = true;
        }
      } else {
        // Use AI tags instead for visit.
        classFromUserTag = false;
        classificationAi = bestHumanTag[0];
      }
      return [
        [
          {
            classificationAi,
            classification,
            classFromUserTag,
            ...(userTagsConflict ? { userTagsConflict } : {}),
          },
          recordings,
        ],
      ];
    } else {
      // TODO: Split this into more visits and recurse.  May have to do re-clustering.
      // For each unique human tag, make a new set of recordings that excludes recordings that have
      // any other human tag.  Check that those recordings still cluster, and then classify them.
    }
  }
};

const recordingIsInVisit = (recording: Recording, visit: Visit2): boolean => {
  return false;
};

interface Visit2 {
  start: Date;
  end: Date;
  stationId: StationId;
  stationName: string;
  recordings: Recording[];
  incomplete: boolean;
}

const newVisitWithRecording = (recording: Recording): Visit2 => {
  const start = new Date(recording.recordingDateTime);
  const end = new Date(recording.recordingDateTime);
  end.setSeconds(end.getSeconds() + recording.duration);
  return {
    start,
    end,
    recordings: [recording],
    stationId: recording.StationId,
    stationName: recording.Station.name,
    incomplete: false,
  };
};

function groupRecordingsIntoVisits2(
  recordings: Recording[],
  start: Date,
  end: Date
  //isLastPage: boolean
): Visit2[] {
  const visitsByStation: Record<StationId, Visit2> = {};
  const visitsStartingInPeriod: Visit2[] = [];
  const earlierVisits: Visit2[] = [];

  for (const recording of recordings) {
    const stationId = recording.StationId;
    const currentVisit: Visit2 = visitsByStation[stationId];
    if (!currentVisit || !recordingIsInVisit(recording, currentVisit)) {
      if (end >= recording.recordingDateTime) {
        // start a new visit
        //const newVisit = new Visit(stationId, recording.Station, recording);
        // we want to keep adding recordings to this visit even if first recording is
        // before the search period
        const newVisit = newVisitWithRecording(recording);

        // I think there must be a much better way to accomplish this!

        // TODO: I think we can simplify this clustering code massively.
        if (newVisit.start > start) {
          visitsStartingInPeriod.push(newVisit);
        } else {
          // First recording for this visit is actually before the time period.
          // Therefore this visit isn't really part of this time period but some of its recordings are

          // But if totally missing from the list user may wonder where recordings are so return visit anyway
          // (only relevant to the last page which shows the earliest recordings)
          newVisit.incomplete = true;
          earlierVisits.push(newVisit);
        }
        visitsByStation[recording.StationId] = newVisit;
      }
    }
  }

  // if (isLastPage) {
  //   const overlappingVisits = earlierVisits.filter((visit) =>
  //     visit.end > start
  //   );
  //   return [...overlappingVisits, ...visitsStartingInPeriod];
  // }
  return visitsStartingInPeriod;
}

const getBestAiGuess = (allTracks: VisitTrack[]): [TagName, VisitTrack[]][] => {
  const tracks: VisitTrack[] = aiTracks(allTracks);
  const counts: Record<string, VisitTrack[]> = tracks.reduce((acc, track) => {
    const tag = track.tag;
    if (tag) {
      acc[tag] = acc[tag] || [];
      acc[tag].push(track);
    }
    return acc;
  }, {});
  const countBreakdown = Object.entries(counts);
  return getBestGuess2(countBreakdown);
};

const getBestGuessOverall2 = (
  allTracks: VisitTrack[],
  isAi: boolean
): [TagName, VisitTrack[]][] => {
  const tracks: VisitTrack[] = isAi
    ? aiTracks(allTracks)
    : userTracks(allTracks);
  const counts: Record<string, VisitTrack[]> = tracks.reduce((acc, track) => {
    const tag = track.tag;
    if (tag) {
      acc[tag] = acc[tag] || [];
      acc[tag].push(track);
    }
    return acc;
  }, {});

  const countBreakdown = Object.entries(counts);
  const bestGuess = getBestGuess2(countBreakdown);
  if (!isAi && bestGuess.length > 1) {
    // We may be able to tie-break best guesses for multiple human tags that have the same ancestor.
    // Add hierarchical tag parents here, so that if a user tags a track with mustelid, and another with
    // stoat, the best guess tag will be the common ancestor.
    const allTrackTags: any[] = [];
    for (const track of tracks) {
      allTrackTags.push({
        id: track.id,
        automatic: track.isAITagged,
        what: track.tag,
      });
    }
    const commonUserTag = getCanonicalTrackTag2(allTrackTags as TrackTag[]);
    if (commonUserTag && commonUserTag.what in counts) {
      return getBestGuess2(
        Object.entries(counts).filter(([key]) => key === commonUserTag.what)
      );
    }
  }
  return bestGuess;
};

const aiTracks = (allTracks: VisitTrack[]): VisitTrack[] => {
  // For AI, first prefer non false-positive tags, but if we only have false-positives, then fall back to that.
  const aiNonFalsePositiveTracks = allTracks.filter(
    (track) => track.isAITagged && !NON_THING_TAGS.includes(track.tag)
  );
  if (aiNonFalsePositiveTracks.length === 0) {
    return allTracks.filter((track) => track.isAITagged);
  }
  return aiNonFalsePositiveTracks;
};

const userTracks = (allTracks: VisitTrack[]): VisitTrack[] => {
  // Make sure we don't count user false-positive tags, unless that is the *only* user tag.
  // If a user tags one track as a cat, and two tracks as false positive, we should always say the visit was a cat!
  const userNonFalsePositiveTags = allTracks.filter(
    (track) =>
      !track.isAITagged && track.tag && !NON_THING_TAGS.includes(track.tag)
  );
  if (userNonFalsePositiveTags.length === 0) {
    return allTracks.filter((track) => !track.isAITagged && track.tag);
  }
  return userNonFalsePositiveTags;
};

const getBestUserGuess = (
  allTracks: VisitTrack[]
): [TagName, VisitTrack[]][] => {
  const tracks: VisitTrack[] = userTracks(allTracks);
  const counts: Record<string, VisitTrack[]> = tracks.reduce((acc, track) => {
    const tag = track.tag;
    if (tag) {
      acc[tag] = acc[tag] || [];
      acc[tag].push(track);
    }
    return acc;
  }, {});

  const countBreakdown = Object.entries(counts);
  const bestGuess = getBestGuess2(countBreakdown);
  if (bestGuess.length > 1) {
    // We may be able to tie-break best guesses for multiple human tags that have the same ancestor.
    // Add hierarchical tag parents here, so that if a user tags a track with mustelid, and another with
    // stoat, the best guess tag will be the common ancestor.
    const allTrackTags: any[] = [];
    for (const track of tracks) {
      allTrackTags.push({
        id: track.id,
        automatic: track.isAITagged,
        what: track.tag,
      });
    }
    const commonUserTag = getCanonicalTrackTag2(allTrackTags as TrackTag[]);
    if (commonUserTag && commonUserTag.what in counts) {
      return getBestGuess2(
        Object.entries(counts).filter(([key]) => key === commonUserTag.what)
      );
    }
  }
  return bestGuess;
};
const TAG = 0;
const COUNT = 1;

function getBestGuess2(
  counts: [TagName, VisitTrack[]][]
): [TagName, VisitTrack[]][] {
  const animalOnlyCounts = counts.filter(
    (tc) => !UNIDENTIFIED_TAGS.includes(tc[TAG])
  );
  if (animalOnlyCounts.length > 0) {
    // there are animal tags
    const maxCount = animalOnlyCounts.reduce(
      (max, item) => Math.max(max, item[COUNT].length),
      0
    );
    const tagsWithMaxCount = animalOnlyCounts.filter(
      (tc) => tc[COUNT].length === maxCount
    );
    return tagsWithMaxCount;
  } else {
    return counts;
  }
}
const NON_THING_TAGS = [...NON_ANIMAL_TAGS, "false-positive"];

const isConflictingTag = (tag: TrackTag): boolean => {
  return (
    tag && tag.data && typeof tag.data === "object" && tag.data.userTagsConflict
  );
};

const calculateTrackTags2 = (recording: Recording): VisitRecording => {
  return {
    recId: recording.id,
    start: recording.recordingDateTime.toISOString(),
    processingState: recording.processingState,
    tracks: (recording.Tracks || []).map((track) => {
      const bestTag = getCanonicalTrackTag2(track.TrackTags || []);
      return {
        id: track.id,
        tag: bestTag?.what || null,
        isAITagged: bestTag ? bestTag.automatic : false,
        aiTag:
          (track.TrackTags || []).find((tag) => tag.automatic)?.what || null,
        start: track.data ? track.data.start_s : "",
        end: track.data ? track.data.end_s : "",
        mass:
          (track.data &&
            track.data.positions &&
            track.data.positions.reduce((a, { mass }) => a + (mass || 0), 0)) ||
          0,
        ...(isConflictingTag(bestTag) ? { userTagsConflict: true } : {}),
      };
    }),
  };
};

const clusterRecordings = (
  recordings: Recording[]
): Record<StationId, Recording[][]> => {
  // Does reduce have deterministic order?
  return recordings.reduce((acc, recording) => {
    acc[recording.StationId] = acc[recording.StationId] || [];
    const prevCluster = last(acc[recording.StationId]) as Recording[];
    const prevRecording = prevCluster && last(prevCluster);
    // We're iterating through the recordings from newest to oldest.
    if (
      prevRecording &&
      (prevRecording as Recording).recordingDateTime <
        endTimePlusVisitOffset(recording)
    ) {
      // Append existing cluster if recording end is less than 10 mins before the beginning of the last one.
      prevCluster.push(recording);
    } else {
      // Start a new cluster
      acc[recording.StationId].push([recording]);
    }
    return acc;
  }, {});
};

const getCanonicalTrackTag2 = (trackTags: TrackTag[]): TrackTag | null => {
  if (trackTags.length == 0) {
    return null;
  }
  const animalTags = trackTags.filter(
    (tag) => !tag.automatic && !NON_ANIMAL_TAGS.includes(tag.what)
  );

  // NOTE - Conflicting tags aren't actually conflicts if users agree on the super-species of the tag to some extent:
  //  i.e. Rodent + mouse shouldn't be counted as conflicting, but mammal + rodent or mammal + mouse should be.
  const uniqueUserTags = new Set(animalTags.map((tag) => tag.what));
  if (uniqueUserTags.size > 1) {
    const commonAncestor = getCommonAncestorForTags(
      Array.from(uniqueUserTags.values())
    );
    const conflict = {
      what: commonAncestor === "all" ? "conflicting tags" : commonAncestor,
      confidence: animalTags[0].confidence,
      automatic: false,
      data: { userTagsConflict: true },
    };
    if (conflict.what === "") {
      conflict.what = "conflicting tags";
    }
    return conflict as TrackTag;
  }
  const masterTag = trackTags.filter((tag) => tag.automatic);
  return animalTags.shift() || masterTag.shift() || null;
};

const endTimePlusVisitOffset = (recording: Recording): Date => {
  const start = endTime(recording);
  start.setSeconds(start.getSeconds() + 60 * 10);
  return start;
};

const endTime = (recording: Recording): Date => {
  const end = new Date(recording.recordingDateTime);
  end.setSeconds(end.getSeconds() + recording.duration);
  return end;
};
const calculateTags = (
  visit: Visit2,
  ai: string
): { split: Visit2 } | undefined => {
  return;
};

const last = <T>(arr: T[]): T | undefined => {
  if (arr.length) {
    return arr[arr.length - 1];
  }
  return undefined;
};
