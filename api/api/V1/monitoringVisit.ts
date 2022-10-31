import moment, { Moment } from "moment";
import models from "@models";
import { Recording } from "@models/Recording";
import { getCanonicalTrackTag, UNIDENTIFIED_TAGS } from "./Visits";
import { ClientError } from "../customErrors";
import { StationId, UserId } from "@typedefs/api/common";
import { MonitoringPageCriteria } from "@typedefs/api/monitoring";
import { Op } from "sequelize";
import { RecordingType } from "@typedefs/api/consts";
import { Station } from "@models/Station";
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
    this.rawRecordings = [];
    this.tracks = 0;
    this.stationName = stationName ? stationName.name : "";
    this.stationId = stationId || 0;

    this.rawRecordings.push(recording);
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

  calculateTags(aiModel: string) {
    this.recordings = this.rawRecordings.map((rec) =>
      this.calculateTrackTags(rec, aiModel)
    );
    delete this.rawRecordings;

    const allVisitTracks = this.getAllTracks();
    this.tracks = allVisitTracks.length;

    // FIXME: In the case where a single recording has multiple animals, we have to pick only one tag to be the "visit tag"
    //  but, in the case where there are multiple recordings near to each other with different user animal tags,
    //  we should really be splitting those recordings into multiple (possibly overlapping) visits.
    const bestHumanTags = getBestGuessOverall(allVisitTracks, HUMAN_ONLY);

    if (bestHumanTags.length > 0) {
      if (bestHumanTags.length === 1) {
        this.classification = bestHumanTags[0];
        this.classFromUserTag = true;
      } else {
        return { split: this };
      }
    } else {
      const bestAiTags = getBestGuessOverall(allVisitTracks, AI_ONLY);
      this.classification = bestAiTags.length > 0 ? bestAiTags[0] : "none";
      this.classFromUserTag = false;
    }

    const aiGuess = getBestGuessFromSpecifiedAi(allVisitTracks);
    this.classificationAi = aiGuess.length > 0 ? aiGuess[0] : "none";

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
      let aiTag = [];
      if (track.TrackTags) {
        aiTag = track.TrackTags.filter((tag) => tag.data == aiModel);
      }

      newVisitRecording.tracks.push({
        tag: bestTag ? bestTag.what : null,
        isAITagged: bestTag ? bestTag.automatic : false,
        aiTag: aiTag.length > 0 ? aiTag[0].what : null,
        start: track.data ? track.data.start_s : "",
        end: track.data ? track.data.end_s : "",
      });
    }
    return newVisitRecording;
  }

  getAllTracks(): VisitTrack[] {
    const allVisitTracks: VisitTrack[] = [];
    this.recordings.forEach((recording) => {
      allVisitTracks.push(...recording.tracks);
    });
    return allVisitTracks;
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

function getBestGuessFromSpecifiedAi(tracks: VisitTrack[]): string[] {
  const counts = {};
  tracks.forEach((track) => {
    const tag = track.aiTag;
    if (tag) {
      counts[tag] = counts[tag] ? (counts[tag] += 1) : 1;
    }
  });
  return getBestGuess(Object.entries(counts));
}

function getBestGuessOverall(allTracks: VisitTrack[], isAi: boolean): string[] {
  let tracks;
  if (!isAi) {
    // Make sure we don't count user false-positive tags, unless that is the *only* user tag.
    // If a user tags one track as a cat, and two tracks as false positive, we should always say the visit was a cat!
    tracks = allTracks.filter(
      (track) => track.isAITagged === isAi && track.tag !== "false-positive"
    );
    const userNonFalsePositiveTags = allTracks.filter(
      (track) => track.isAITagged === isAi && track.tag !== "false-positive"
    );
    if (userNonFalsePositiveTags.length === 0) {
      tracks = allTracks.filter((track) => track.isAITagged === isAi);
    } else {
      tracks = userNonFalsePositiveTags;
    }
  } else {
    // For AI, first prefer non false-positive tags, but if we only have false-positives, then fall back to that.
    tracks = allTracks.filter(
      (track) => track.isAITagged === isAi && track.tag !== "false-positive"
    );
    if (tracks.length === 0) {
      tracks = allTracks.filter((track) => track.isAITagged === isAi);
    }
  }

  const counts = {};
  tracks.forEach((track) => {
    const tag = track.tag;
    if (tag) {
      counts[tag] = counts[tag] ? (counts[tag] += 1) : 1;
    }
  });

  return getBestGuess(Object.entries(counts));
}

function getBestGuess(counts: [TagName, Count][]): TagName[] {
  const animalOnlyCounts = counts.filter(
    (tc) => !UNIDENTIFIED_TAGS.includes(tc[TAG])
  );
  if (animalOnlyCounts.length > 0) {
    // there are animal tags
    const maxCount = animalOnlyCounts.reduce(
      (max, item) => Math.max(max, item[COUNT]),
      0
    );
    const tagsWithMaxCount = animalOnlyCounts
      .filter((tc) => tc[COUNT] === maxCount)
      .map((tc) => tc[TAG]);
    return tagsWithMaxCount;
  } else {
    return counts.map((tc) => tc[TAG]);
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
  tag: string;
  aiTag: string;
  isAITagged: boolean;
  start: string;
  end: string;
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
            track.isAITagged === false && track.tag !== "false-positive"
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
      for (const visit of actualVisits) {
        visit.calculateTags(search.compareAi);
        visit.markIfPossiblyIncomplete(incompleteCutoff);
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
  const where: any = {
    duration: { [Op.gte]: "0" },
    type: RecordingType.ThermalRaw,
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
