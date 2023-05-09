import moment, { Moment } from "moment";
import models from "@models";
import { Recording } from "@models/Recording";
import {
  getCanonicalTrackTag,
  NON_ANIMAL_TAGS,
  UNIDENTIFIED_TAGS,
} from "./Visits";
import { ClientError } from "../customErrors";
import { StationId, TrackId, UserId } from "@typedefs/api/common";
import { MonitoringPageCriteria } from "@typedefs/api/monitoring";
import { Op } from "sequelize";
import { RecordingType } from "@typedefs/api/consts";
import { Station } from "@models/Station";
import { ApiTrackTagResponse } from "@typedefs/api/trackTag";
import { TrackTag } from "@models/TrackTag";
import logger from "@log";

const MINUTE = 60;
const MAX_SECS_BETWEEN_RECORDINGS = 10 * MINUTE;
const MAX_SECS_VIDEO_LENGTH = 10 * MINUTE;
const RECORDINGS_LIMIT = 2000;
const MAX_MINS_AFTER_TIME = 70;

type TagName = string;
type Count = number;

class Visit {
  rawRecordings?: Recording[];
  classification?: string;
  classificationAi?: string;
  classFromUserTag?: boolean;

  userTagsConflict?: boolean;
  incomplete?: boolean;
  timeStart?: Moment;
  timeEnd?: Moment;
  recordings: VisitRecording[];
  stationId: number;
  stationName: string;
  tracks: number;

  constructor(
    stationId: StationId,
    stationName: Station,
    recording: Recording
  ) {
    this.recordings = [];
    this.tracks = 0;
    this.stationName = stationName ? stationName.name : "";
    this.stationId = stationId || 0;

    this.rawRecordings = [recording];
    this.timeStart = moment(recording.recordingDateTime);
    this.timeEnd = moment(this.timeStart).add(recording.duration, "seconds");
  }

  stationsMatch(stationId: StationId) {
    return this.stationId == stationId;
  }

  // note this function assumes that the recording start later than recordings already included
  isRecordingInVisit(recording: Recording) {
    if (!this.timeEnd) {
      return true;
    }

    const cutoff = moment(this.timeEnd).add(
      MAX_SECS_BETWEEN_RECORDINGS,
      "seconds"
    );
    return cutoff.isAfter(recording.recordingDateTime);
  }

  addRecordingIfWithinTimeLimits(recording: Recording): boolean {
    if (!this.isRecordingInVisit(recording)) {
      return false;
    }

    this.rawRecordings.push(recording);
    this.timeEnd = moment(recording.recordingDateTime).add(
      recording.duration,
      "seconds"
    );

    return true;
  }

  calculateTags(aiModel: string, dontSplit: boolean = false) {
    this.recordings = (this.rawRecordings || []).map((rec) =>
      this.calculateTrackTags(rec, aiModel)
    );

    const allVisitTracks = this.getAllTracks();
    this.tracks = allVisitTracks.length;
    const bestHumanTags = getBestGuessOverall(allVisitTracks, HUMAN_ONLY);
    if (bestHumanTags.length > 0) {
      if (bestHumanTags.length === 1) {
        const classification = bestHumanTags[0];
        const bestAiTags = getBestGuessOverall(allVisitTracks, AI_ONLY);
        const aiClassification =
          bestAiTags.length > 0 ? bestAiTags[0][0] : "none";
        if (
          ![...NON_ANIMAL_TAGS, "false-positive"].includes(classification[0]) ||
          [...NON_ANIMAL_TAGS, "false-positive", "none"].includes(
            aiClassification
          )
        ) {
          // Only prefer human tags for visit labels if they're not false-positives *or* the only AI tags are nothing/false-positive type tags.
          this.classification = bestHumanTags[0][0];
          this.classFromUserTag = true;
          if (bestHumanTags[0][1].some((tag) => tag.userTagsConflict)) {
            this.userTagsConflict = true;
          }
        } else {
          // Use AI tags instead for visit.
          this.classification = aiClassification;
          this.classFromUserTag = false;
        }
      } else {
        if (dontSplit) {
          this.classification = bestHumanTags[0][0];
          //this.userTagsConflict = true;
          this.classFromUserTag = true;
          return { split: false };
        }
        return { split: this, rawRecordings: this.rawRecordings };
      }
    } else {
      const bestAiTags = getBestGuessOverall(allVisitTracks, AI_ONLY);
      if (bestAiTags.length > 1) {
        // Tie-break based on the average mass of the track in question.
        let bestMass = -1;
        let bestTag;
        for (const [tag, tracks] of bestAiTags) {
          const mass = tracks.reduce((a, { mass }) => a + (mass || 0), 0);
          if (mass > bestMass) {
            bestMass = mass;
            bestTag = tag;
          }
        }
        this.classification = bestTag;
      } else {
        this.classification = bestAiTags.length > 0 ? bestAiTags[0][0] : "none";
      }

      this.classFromUserTag = false;
    }

    delete this.rawRecordings;
    const aiGuess = getBestGuessFromSpecifiedAi(allVisitTracks);
    if (aiGuess.length > 1) {
      // Tie-break based on the average mass of the track in question.
      let bestMass = -1;
      let bestTag;
      for (const [tag, tracks] of aiGuess) {
        const mass = tracks.reduce((a, { mass }) => a + (mass || 0), 0);
        if (mass > bestMass) {
          bestMass = mass;
          bestTag = tag;
        }
      }
      this.classificationAi = bestTag;
    } else {
      this.classificationAi = aiGuess.length > 0 ? aiGuess[0][0] : "none";
    }

    return { split: false };
  }

  calculateTrackTags(recording, aiModel: string): VisitRecording {
    const newVisitRecording: VisitRecording = {
      recId: recording.id,
      start: recording.recordingDateTime,
      tracks: [],
    };
    for (const track of (recording as any).Tracks) {
      const bestTag = getCanonicalTrackTag(track.TrackTags);
      const aiTag: ApiTrackTagResponse = (track.TrackTags || []).find(
        (tag) => tag.data === aiModel && tag.automatic
      );

      const thisTrack: VisitTrack = {
        id: track.id,
        tag: bestTag ? bestTag.what : null,
        isAITagged: bestTag ? bestTag.automatic : false,
        aiTag: (aiTag && aiTag.what) || null,
        start: track.data ? track.data.start_s : "",
        end: track.data ? track.data.end_s : "",
        mass:
          (track.positions &&
            track.positions.reduce((a, { mass }) => a + (mass || 0), 0)) ||
          0,
      };
      if (
        bestTag &&
        bestTag.data &&
        typeof bestTag.data === "object" &&
        bestTag.data.userTagsConflict
      ) {
        thisTrack.userTagsConflict = true;
        if (bestTag.what === "") {
          thisTrack.tag = "conflicting tags";
        }
      }

      newVisitRecording.tracks.push(thisTrack);
    }
    return newVisitRecording;
  }

  getAllTracks(): VisitTrack[] {
    return this.recordings.flatMap((recording) => recording.tracks);
  }

  markIfPossiblyIncomplete(cutoff: Moment) {
    this.incomplete =
      this.incomplete || !this.timeEnd || this.timeEnd.isAfter(cutoff);
  }
}

const TAG = 0;
const COUNT = 1;

const HUMAN_ONLY = false;
const AI_ONLY = true;

function getBestGuessFromSpecifiedAi(
  tracks: VisitTrack[]
): [TagName, VisitTrack[]][] {
  const counts = {};
  tracks.forEach((track) => {
    const tag = track.aiTag;
    if (tag) {
      counts[tag] = counts[tag] || [];
      counts[tag].push(track);
    }
  });
  return getBestGuess(Object.entries(counts));
}

function getBestGuessOverall(
  allTracks: VisitTrack[],
  isAi: boolean
): [TagName, VisitTrack[]][] {
  let tracks: VisitTrack[];
  const nonThingTags = [...NON_ANIMAL_TAGS, "false-positive"];
  if (!isAi) {
    // Make sure we don't count user false-positive tags, unless that is the *only* user tag.
    // If a user tags one track as a cat, and two tracks as false positive, we should always say the visit was a cat!
    const userNonFalsePositiveTags = allTracks.filter(
      (track) =>
        !track.isAITagged && track.tag && !nonThingTags.includes(track.tag)
    );
    if (userNonFalsePositiveTags.length === 0) {
      tracks = allTracks.filter((track) => !track.isAITagged && track.tag);
    } else {
      tracks = userNonFalsePositiveTags;
    }
  } else {
    // For AI, first prefer non false-positive tags, but if we only have false-positives, then fall back to that.
    tracks = allTracks.filter(
      (track) => track.isAITagged && !nonThingTags.includes(track.tag)
    );
    if (tracks.length === 0) {
      tracks = allTracks.filter((track) => track.isAITagged);
    }
  }

  const counts: Record<string, VisitTrack[]> = {};
  tracks.forEach((track) => {
    const tag = track.tag;
    if (tag) {
      counts[tag] = counts[tag] || [];
      counts[tag].push(track);
    }
  });

  const countBreakdown = Object.entries(counts);
  const bestGuess = getBestGuess(countBreakdown);
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
    const commonUserTag = getCanonicalTrackTag(allTrackTags as TrackTag[]);
    if (commonUserTag && commonUserTag.what in counts) {
      return getBestGuess(
        Object.entries(counts).filter(([key]) => key === commonUserTag.what)
      );
    }
  }
  return bestGuess;
}

function getBestGuess(
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

interface VisitRecording {
  recId: number;
  start: string;
  tracks: VisitTrack[];
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

export async function generateVisits(
  userId: UserId,
  search: MonitoringPageCriteria,
  viewAsSuperAdmin: boolean
): Promise<Visit[] | ClientError> {
  const search_start = moment(search.pageFrom).subtract(
    MAX_SECS_BETWEEN_RECORDINGS + MAX_SECS_VIDEO_LENGTH,
    "seconds"
  );
  const search_end = moment(search.pageUntil).add(
    MAX_MINS_AFTER_TIME,
    "minutes"
  );

  const recordings = await getRecordings(
    userId,
    search,
    search_start,
    search_end,
    viewAsSuperAdmin
  );
  if (recordings.length === RECORDINGS_LIMIT) {
    return new ClientError(
      "Too many recordings to retrieve. Please reduce your page size."
    );
  }

  const visits = groupRecordingsIntoVisits(
    recordings,
    moment(search.pageFrom),
    moment(search.pageUntil),
    search.page === search.pagesEstimate
  );

  const incompleteCutoff = moment(search_end).subtract(
    MAX_SECS_BETWEEN_RECORDINGS,
    "seconds"
  );

  const actualVisits = [];
  for (const visit of visits) {
    const { split } = visit.calculateTags(search.compareAi);
    if (split) {
      // We need to create multiple visits from this visit, since there were multiple user tags for the period.
      const userVisits = {};
      for (const recording of (split as Visit).recordings) {
        const userTag = recording.tracks.filter(
          (track) =>
            track.isAITagged === false &&
            ![...NON_ANIMAL_TAGS, "false-positive"].includes(track.tag)
        );
        // In the case where there are two user tags on a single recording (multiple different animals) we'll
        // generate another visit using the same recording.
        if (userTag.length !== 0) {
          for (const track of userTag) {
            userVisits[track.tag] = userVisits[track.tag] || [];
            userVisits[track.tag].push(recording);
          }
        }
      }
      for (const recording of (split as Visit).recordings) {
        const userTag = recording.tracks.filter(
          (track) => track.isAITagged === false
        );
        if (userTag.length === 0) {
          // Add the ai-only recording to all user visits
          for (const visit of Object.values(userVisits)) {
            (visit as VisitRecording[]).push(recording);
          }
        }
      }
      for (const visitRecordings of Object.values(userVisits)) {
        const record = recordings.find(
          (rec) => rec.id === visitRecordings[0].recId
        );
        const actualVisit = new Visit(visit.stationId, record.Station, record);
        for (let i = 1; i < (visitRecordings as VisitRecording[]).length; i++) {
          const record = recordings.find(
            (rec) => rec.id === visitRecordings[i].recId
          );
          actualVisit.addRecordingIfWithinTimeLimits(record);
        }
        actualVisits.push(actualVisit);
      }
      for (const aVisit of actualVisits) {
        if (aVisit.rawRecordings) {
          aVisit.calculateTags(search.compareAi, true);
          delete aVisit.rawRecordings;
        }
        aVisit.markIfPossiblyIncomplete(incompleteCutoff);
      }
    } else {
      visit.markIfPossiblyIncomplete(incompleteCutoff);
      actualVisits.push(visit);
    }
  }

  return actualVisits.reverse();
}

async function getRecordings(
  userId: UserId,
  params: MonitoringPageCriteria,
  from: Moment,
  until: Moment,
  viewAsSuperUser: boolean
) {
  const types = [];
  const allowedTypes = [
    RecordingType.Audio,
    RecordingType.ThermalRaw,
    RecordingType.TrailCamImage,
    RecordingType.TrailCamVideo,
  ];
  for (const type of params.types) {
    if (allowedTypes.includes(type)) {
      types.push(type);
    }
  }
  const where: any = {
    duration: { [Op.gte]: "3" }, // Ignore our 2 second health-check recordings
    type: { [Op.in]: types },
    deletedAt: { [Op.eq]: null },
    recordingDateTime: { [Op.gt]: from, [Op.lt]: until },
  };
  if (params.stations) {
    where.StationId = params.stations;
  }
  if (params.groups) {
    where.GroupId = params.groups;
  }
  const order = [["recordingDateTime", "ASC"]];
  const builder = await new models.Recording.queryBuilder().init(userId, {
    where,
    limit: RECORDINGS_LIMIT,
    order,
    viewAsSuperUser,
  });

  return models.Recording.findAll(builder.get());
}

function groupRecordingsIntoVisits(
  recordings: Recording[],
  start: Moment,
  end: Moment,
  isLastPage: boolean
): Visit[] {
  const currentVisitForStation: { [key: number]: Visit } = {};
  const visitsStartingInPeriod: Visit[] = [];
  const earlierVisits: Visit[] = [];

  recordings.forEach((rec) => {
    const recording = rec as any;
    const stationId = recording.StationId || 0;
    const currentVisit: Visit = currentVisitForStation[rec.StationId];
    const matchingVisit =
      currentVisit && currentVisit.stationsMatch(stationId)
        ? currentVisit
        : null;
    if (!matchingVisit || !matchingVisit.addRecordingIfWithinTimeLimits(rec)) {
      if (end.isSameOrAfter(rec.recordingDateTime)) {
        // start a new visit
        const newVisit = new Visit(stationId, recording.Station, rec);
        // we want to keep adding recordings to this visit even if first recording is
        // before the search period
        currentVisitForStation[rec.StationId] = newVisit;

        if (newVisit.timeStart.isAfter(start)) {
          visitsStartingInPeriod.push(newVisit);
        } else {
          // First recording for this visit is actually before the time period.
          // Therefore this visit isn't really part of this time period but some of its recordings are

          // But if totally missing from the list user may wonder where recordings are so return visit anyway
          // (only relevant to the last page which shows the earliest recordings)
          newVisit.incomplete = true;
          earlierVisits.push(newVisit);
        }
      }
    }
  });

  if (isLastPage) {
    const overlappingVisits = earlierVisits.filter((visit) =>
      visit.timeEnd.isAfter(start)
    );
    return [...overlappingVisits, ...visitsStartingInPeriod];
  }
  return visitsStartingInPeriod;
}
