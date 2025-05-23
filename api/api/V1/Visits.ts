/*
This handles creation of Visits from recordings

A visit is a all tracks that occur within eventMaxTimeSeconds of each other
A Visit is made up of many VisitEvents.
VisitEvents are distinct viewings of a species, defined by a TrackTag
A visit is assumed to be the tag that occurs the most in the visitevents

All tracks of a recording always belong to the same visit
*/

// FIXME - This file seems to be in the wrong place - this folder is full of API endpoints...

import type { Recording } from "@models/Recording.js";
import type { TrackTag } from "@models/TrackTag.js";
import type { Track } from "@models/Track.js";
import { AI_MASTER } from "@models/TrackTag.js";
import type { Moment } from "moment";
import moment from "moment";
import type { Event } from "@models/Event.js";
import type { DeviceId, StationId } from "@typedefs/api/common.js";
import { flatClassifications } from "@/classifications/classifications.js";

let visitID = 1;
const eventMaxTimeSeconds = 60 * 10;
const conflictTag = "conflicting tags";

export const META_TAGS = ["part", "poor tracking"];
export const UNIDENTIFIED_TAGS = ["unidentified", "unknown"];
export const NON_ANIMAL_TAGS = [...META_TAGS, ...UNIDENTIFIED_TAGS];

const audioBaitInterval = 60 * 10;

function sortTracks(tracks: Track[]) {
  // sort tracks in descending start time order
  tracks.sort(function (a, b) {
    const res = b.startSeconds - a.startSeconds;
    if (res == 0) {
      return b.id - a.id;
    } else {
      return res;
    }
  });
}

export const getCommonAncestorForTags = (tags: string[]): string => {
  // Find common parents of classifications.
  const classes = tags
    .map((tag) => flatClassifications[tag])
    .filter((classification) => classification !== undefined);
  const commonAncestors = new Map();
  for (const classification of classes) {
    const path = classification.path.split(".");
    while (path.length > 2) {
      path.shift();
    }
    while (path.length) {
      // Don't include all
      const piece = path.pop();
      // Only add the piece if all classes agree on it.
      const someOthersAgree = classes.some(
        (c) => c !== classification && c.path.includes(piece),
      );
      if (someOthersAgree) {
        if (commonAncestors.has(piece)) {
          commonAncestors.set(piece, commonAncestors.get(piece) + 1);
        } else {
          commonAncestors.set(piece, 1);
        }
      }
    }
  }
  let bestCount = 0;
  let bestKey = "";
  for (const [key, count] of commonAncestors) {
    if (count > bestCount) {
      bestCount = count;
      bestKey = key;
    }
  }
  return bestKey;
};
// From all tags return a single tag by precedence:
// first, this users tag, or any other humans tag, else the original AI
export function getCanonicalTrackTag(
  trackTags: TrackTag[],
): TrackTag | undefined {
  if (trackTags.length == 0) {
    return null;
  }
  const manualTags = trackTags.filter(
    (tag) => !tag.automatic && !META_TAGS.includes(tag.what),
  );
  const animalTags = manualTags.filter(
    (tag) => !NON_ANIMAL_TAGS.includes(tag.what),
  );

  // NOTE - Conflicting tags aren't actually conflicts if users agree on the super-species of the tag to some extent:
  //  i.e. Rodent + mouse shouldn't be counted as conflicting, but mammal + rodent or mammal + mouse should be.
  const uniqueTags = new Set(animalTags.map((tag) => tag.what));
  if (uniqueTags.size > 1) {
    const commonAncestor = getCommonAncestorForTags(
      Array.from(uniqueTags.values()),
    );
    const conflict = {
      what: commonAncestor === "all" ? conflictTag : commonAncestor,
      confidence: manualTags[0].confidence,
      automatic: false,
      data: { userTagsConflict: true },
    };
    return conflict as TrackTag;
  }
  const masterTag = trackTags.filter((tag) => tag.model === AI_MASTER);
  return animalTags.shift() || manualTags.shift() || masterTag.shift();
}

class DeviceSummary {
  deviceMap: DeviceVisitMap;
  lastRecTime: Moment;
  constructor() {
    this.deviceMap = {};
  }

  generateAnimalSummary(): DeviceAnimals {
    const deviceSummary: DeviceAnimals = {};
    for (const [devId, device] of Object.entries(this.deviceMap)) {
      deviceSummary[devId] = device.animalSummary();
    }
    return deviceSummary;
  }

  // generates visits from a list of recordings in descending date time order
  generateVisits(recordings: any[], queryOffset: number) {
    for (const [i, rec] of recordings.entries()) {
      this.lastRecTime = moment(rec.recordingDateTime);
      let devVisits = this.deviceMap[rec.DeviceId];
      if (!devVisits) {
        devVisits = new DeviceVisits(
          rec.Device.deviceName,
          rec.Group.groupName,
          rec.DeviceId,
        );
        this.deviceMap[rec.DeviceId] = devVisits;
      }
      devVisits.calculateNewVisits(rec, queryOffset + i);
    }
  }
  earliestIncompleteOffset(): number | null {
    let offset = null;
    for (const device of Object.values(this.deviceMap)) {
      for (let i = device.visits.length - 1; i >= 0; i--) {
        const visit = device.visits[i];
        if (visit.complete) {
          break;
        }
        if (offset == null) {
          offset = visit.queryOffset;
        } else {
          offset = Math.min(offset, visit.queryOffset);
        }
      }
    }
    return offset;
  }
  checkForCompleteVisits() {
    for (const device of Object.values(this.deviceMap)) {
      device.checkForCompleteVisits(this.lastRecTime);
    }
  }
  markCompleted() {
    for (const device of Object.values(this.deviceMap)) {
      for (let i = device.visits.length - 1; i >= 0; i--) {
        const visit = device.visits[i];
        if (visit.complete) {
          break;
        }
        visit.completeVisit();
      }
    }
  }
  completeVisitsCount(): number {
    let visits = 0;
    for (const device of Object.values(this.deviceMap)) {
      visits += device.visits.filter((v) => v.complete).length;
    }
    return visits;
  }

  removeIncompleteVisits() {
    for (const device of Object.values(this.deviceMap)) {
      device.removeIncompleteVisits();
      if (device.visits.length == 0) {
        delete this.deviceMap[device];
      }
    }
  }
  allAudioFileIds(): Set<number> {
    const audioFileIds: Set<number> = new Set();

    for (const device of Object.values(this.deviceMap)) {
      device.audioFileIds.forEach((id) => audioFileIds.add(id));
    }
    return audioFileIds;
  }
  completeVisits(): Visit[] {
    const visits: Visit[] = [];
    for (const device of Object.values(this.deviceMap)) {
      visits.push(...device.visits.filter((v) => v.complete));
    }
    return visits;
  }
}

class VisitSummary {
  visitCount: number;
  eventCount: number;
  end: moment.Moment;
  start: moment.Moment;
  deviceName: string;
  groupName: string;
  constructor(visit: Visit) {
    this.groupName = visit.groupName;
    this.deviceName = visit.deviceName;
    this.end = moment(visit.end);
    this.start = moment(visit.start);
    this.visitCount = 1;
    this.eventCount = visit.events.length;
  }
  updateSummary(visit: Visit) {
    this.visitCount += 1;
    this.eventCount += visit.events.length;
    if (visit.start < this.start) {
      this.start = visit.start;
    }
    if (visit.end > this.end) {
      this.end = visit.end;
    }
  }
}

class DeviceVisits {
  firstVisit: Visit | null;
  startTime: Moment;
  endTime: Moment;
  audioFileIds: Set<number>;
  visitCount: number;
  eventCount: number;
  audioBait: boolean;
  visits: Visit[];
  constructor(
    // eslint-disable-next-line no-unused-vars
    public deviceName: string,
    // eslint-disable-next-line no-unused-vars
    public groupName: string,
    // eslint-disable-next-line no-unused-vars
    public id: number,
  ) {
    this.firstVisit = null;
    this.audioFileIds = new Set();
    this.visitCount = 0;
    this.eventCount = 0;
    this.audioBait = false;
    this.visits = [];
  }
  animalSummary(): AnimalSummary {
    // return a summary of the animals with visits
    const animalSummary: AnimalSummary = {};
    for (const visit of this.visits) {
      if (visit.what in animalSummary) {
        animalSummary[visit.what].updateSummary(visit);
      } else {
        animalSummary[visit.what] = new VisitSummary(visit);
      }
    }
    return animalSummary;
  }

  checkForCompleteVisits(lastRecTime: Moment) {
    //complete any visits that start at least visit interval seconds after this time
    for (let i = this.visits.length - 1; i >= 0; i--) {
      const visit = this.visits[i];
      if (visit.complete) {
        break;
      }
      visit.complete = !isWithinVisitInterval(visit.start, lastRecTime);
      if (visit.complete) {
        visit.completeVisit();
      }
    }
  }

  removeIncompleteVisits() {
    let delIndex = 0;
    for (let i = this.visits.length - 1; i >= 0; i--) {
      const visit = this.visits[i];
      if (!visit.complete) {
        delIndex = i;
      }
    }
    this.visits.splice(delIndex, this.visits.length - delIndex);
    const currentVisit = this.currentVisit();
    if (currentVisit) {
      if (this.endTime < currentVisit.end) {
        this.endTime = currentVisit.end;
      }
    }
  }

  updateSummary(rec: any) {
    //update tally of visits and counts and start end time of the device summary
    const currentVisit = this.currentVisit();
    this.audioBait = this.audioBait || currentVisit.audioBaitDay;
    this.eventCount += rec.Tracks.length;
    if (!this.startTime || !this.endTime) {
      this.startTime = currentVisit.start;
      this.endTime = currentVisit.end;
    } else {
      if (this.startTime > currentVisit.start) {
        this.startTime = currentVisit.start;
      }

      if (this.endTime < currentVisit.end) {
        this.endTime = currentVisit.end;
      }
    }
  }
  currentVisit(): Visit | null {
    // currents visit is the visit that is actively calculated
    // the earliest in time
    return this.visits[this.visits.length - 1];
  }

  isPartOfCurrentVisit(time: Moment): boolean {
    const currentVisit = this.currentVisit();
    if (currentVisit == null) {
      return false;
    }
    return currentVisit.isPartOfVisit(time);
  }

  calculateNewVisits(rec: any, queryOffset: number): Visit[] {
    sortTracks(rec.Tracks);
    if (rec.Tracks.length == 0) {
      return this.visits;
    }
    //check earliest track in recording is within interval of current visit
    const trackPeriod = new TrackStartEnd(rec, rec.Tracks[0]);
    const currentVisit = this.currentVisit();
    if (currentVisit && currentVisit.isPartOfVisit(trackPeriod.trackStart)) {
      currentVisit.addRecording(rec, rec.Tracks);
      currentVisit.queryOffset = queryOffset;
    } else {
      if (currentVisit) {
        currentVisit.completeVisit();
      }
      const visit = new Visit(rec, queryOffset);
      this.visits.push(visit);
      this.visitCount++;
    }
    this.updateSummary(rec);
    return this.visits;
  }

  addAudioBaitEvents(events: Event[]) {
    for (const visit of this.visits) {
      visit.addAudioBaitEvents(events);
      this.addAudioFileIds(visit.audioBaitEvents);
      this.audioBait = this.audioBait || visit.audioBaitDay;
    }
  }

  addAudioFileIds(audioEvents: Event[]) {
    for (const audioEvent of audioEvents) {
      this.audioFileIds.add(audioEvent.EventDetail.details.fileId);
    }
  }
}

class Visit {
  visitID: number;
  id: number;
  events: VisitEvent[];
  what: string;
  end: Moment;
  start: Moment;
  deviceName: string;
  deviceId: DeviceId;
  stationId: StationId | null;
  groupName: string;
  audioBaitDay: boolean;
  audioBaitVisit: boolean;
  audioBaitEvents: Event[];
  complete: boolean;
  tagCount: any;
  constructor(rec: any, public queryOffset: number, tracks?: Track[]) {
    visitID += 1;
    this.tagCount = {};
    this.visitID = visitID;
    this.events = [];
    this.deviceId = rec.Device.id;
    this.stationId = rec.stationId;
    this.deviceName = rec.Device.deviceName;
    this.groupName = rec.Group.groupName;
    this.audioBaitEvents = [];
    this.audioBaitVisit = false;
    this.audioBaitDay = false;
    this.complete = false;

    this.addRecording(rec, tracks ? tracks : rec.Tracks);
  }

  mostCommonTag(): TrackTag | null {
    // from all events in a visit, get the tag with the highest occurrence that
    // isn't unidentified, preferring human tags over ai
    // returns [boolean describing if human tag, the tag]
    const tagCount = this.tagCount;
    const sortedKeys = Object.keys(tagCount).sort(function (a, b) {
      const count_a = tagCount[a];
      const count_b = tagCount[b];

      if (count_a.tag.automatic != count_b.tag.automatic) {
        // human tag takes precedence
        if (!count_a.tag.automatic) {
          return -1;
        } else {
          return 1;
        }
      }
      if (UNIDENTIFIED_TAGS.includes(count_a.tag.what)) {
        return 1;
      } else if (UNIDENTIFIED_TAGS.includes(count_b.tag.what)) {
        return -1;
      }

      return count_b.count - count_a.count;
    });
    const maxVote = sortedKeys[0];
    if (maxVote) {
      return tagCount[maxVote].tag;
    }
    return null;
  }

  completeVisit() {
    // assign the visit a tag based on the most common tag that isn't unidentified
    const trackTag = this.mostCommonTag();
    this.what = trackTag ? trackTag.what : null;
    for (const event of this.events) {
      event.assumedTag = trackTag ? trackTag.what : null;
      event.assumedIsHuman = !trackTag?.automatic;
    }
    this.complete = true;
  }

  addRecording(rec: any, tracks: Track[]) {
    for (const track of tracks) {
      const taggedAs = getCanonicalTrackTag(track.TrackTags || []);
      const event = new VisitEvent(rec, track, null, taggedAs);
      this.addEvent(event);
    }
  }

  addAudioBaitEvents(allEvents: Event[]) {
    // add all audio bait events that occur within audioBaitInterval of this visit
    // and before the end of the visit

    const newEvents = allEvents.filter(
      (e) => !this.audioBaitEvents.find((existing) => e.id == existing.id),
    );
    const startDay = this.start.clone().startOf("day");
    const endDay = this.start.clone().endOf("day");
    const audioBaitDay = newEvents.some(
      (e) =>
        moment(e.dateTime).isAfter(startDay) &&
        moment(e.dateTime).isBefore(endDay),
    );
    this.audioBaitDay = this.audioBaitDay || audioBaitDay;

    const recEvents = newEvents.filter(
      (e) =>
        Math.abs(moment(e.dateTime).diff(this.start, "seconds")) <=
        audioBaitInterval,
    );
    if (recEvents.length > 0) {
      this.audioBaitVisit = true;
      this.audioBaitEvents.push(...recEvents);
    }
  }

  isPartOfVisit(eTime: Moment): boolean {
    return isWithinVisitInterval(this.start, eTime);
  }

  updateTagCount(event: VisitEvent) {
    if (!event.trackTag) {
      return;
    }
    const key = `${event.trackTag.automatic ? "ai" : "human"}-${
      event.trackTag.what
    }`;
    if (key in this.tagCount) {
      this.tagCount[key].count += 1;
    } else {
      this.tagCount[key] = { tag: event.trackTag, count: 1 };
    }
  }

  addEvent(event: VisitEvent): VisitEvent {
    //add a new event to this visit and update start, end and tagcount accordingly
    this.updateTagCount(event);
    this.events.push(event);

    if (!this.end || event.end.isAfter(this.end)) {
      this.end = event.end;
    }
    if (!this.start || event.start.isBefore(this.start)) {
      this.start = event.start;
    }
    return event;
  }
}

class VisitEvent {
  // this is the overriding tag that we have given this event
  // e.g. if it was unidentified but grouped under a cat visit
  // assumedTag woudl be "cat"
  assumedTag: string;
  assumedIsHuman: boolean;
  recID: number;
  recStart: Moment;
  trackID: number;
  start: Moment;
  end: Moment;
  audioBaitDay: boolean;
  audioBaitEvents: Event[];
  audioBaitVisit: boolean;
  trackTag: TrackTag;
  constructor(rec: Recording, track: Track, tag: TrackTag, taggedAs: TrackTag) {
    const trackTimes = new TrackStartEnd(rec, track);
    this.audioBaitDay = false;
    this.audioBaitVisit = false;
    this.recID = rec.id;
    this.audioBaitEvents = [];
    this.recStart = trackTimes.recStart;
    this.trackID = track.id;
    if (taggedAs) {
      this.trackTag = taggedAs;
    } else {
      this.trackTag = null;
    }
    if (tag) {
      this.assumedTag = tag.what;
    }
    this.start = trackTimes.trackStart;
    this.end = trackTimes.trackEnd;
  }
}

class TrackStartEnd {
  recStart: Moment;
  trackStart: Moment;
  trackEnd: Moment;
  constructor(rec: Recording, track: Track) {
    this.recStart = moment(rec.recordingDateTime);
    this.trackStart = moment(rec.recordingDateTime);
    this.trackEnd = moment(rec.recordingDateTime);
    if (
      track.hasOwnProperty("startSeconds") &&
      track.hasOwnProperty("endSeconds")
    ) {
      this.trackStart = this.trackStart.add(track.startSeconds * 1000, "ms");
      this.trackEnd = this.trackEnd.add(track.endSeconds * 1000, "ms");
    } else {
      this.trackStart = this.recStart;
      this.trackEnd = this.recStart;
    }
  }
}

function isWithinVisitInterval(firstTime: Moment, secondTime: Moment): boolean {
  const secondsDiff = Math.abs(firstTime.diff(secondTime, "seconds"));
  return secondsDiff <= eventMaxTimeSeconds;
}
interface DeviceAnimals {
  [key: number]: AnimalSummary;
}
interface DeviceVisitMap {
  [key: number]: DeviceVisits;
}
interface AnimalSummary {
  [key: string]: VisitSummary;
}
export default function () {
  console.log("");
}
export {
  VisitSummary,
  DeviceVisitMap,
  DeviceAnimals,
  DeviceSummary,
  DeviceVisits,
  Visit,
  VisitEvent,
  TrackStartEnd,
  isWithinVisitInterval,
};
