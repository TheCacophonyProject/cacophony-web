// load the global Cypress types
/// <reference types="cypress" />

import { getTestName } from "../names";
import {
  convertToDate,
  DEFAULT_DATE,
  getCreds,
  makeAuthorizedRequest,
  removeUndefinedParams,
  v1ApiPath,
} from "../server";
import { logTestDescription, prettyLog } from "../descriptions";
import {
  ApiDeviceIdAndName,
  ApiRecordingColumns,
  ApiRecordingNeedsTagReturned,
  ApiRecordingSet,
  ApiRecordingStation,
  ApiTrackSet,
  TestThermalRecordingInfo,
  ApiRecordingForProcessing,
  ApiRecordingModel,
} from "../types";

import {
  HTTP_OK200,
  NOT_NULL,
  NOT_NULL_STRING,
  filtered_tags,
} from "../constants";
import { ApiRecordingResponse } from "@typedefs/api/recording";
import { ApiRecordingTagResponse } from "@typedefs/api/tag";
import { ApiTrackResponse } from "@typedefs/api/track";
import { RecordingProcessingState, RecordingType } from "@typedefs/api/consts";

const BASE_URL = Cypress.env("base-url-returned-in-links");

let lastUsedTime = DEFAULT_DATE;

Cypress.Commands.add(
  "testDeleteRecordingsInState",
  (superuser: string, type: RecordingType, state: RecordingProcessingState) => {
    cy.apiRecordingsCountCheck(
      superuser,
      {
        type: type,
        processingState: state,
      },
      undefined
    ).then((count) => {
      //query returns up to 300 entries - so run once per 300 in the count
      for (let processed = 0; processed < count; processed = processed + 300) {
        cy.testGetRecordingIdsForQuery(superuser, {
          type: type,
          processingState: state,
        }).then((recordingIds) => {
          recordingIds.forEach((recordingId) => {
            cy.apiRecordingDelete(
              superuser,
              recordingId.toString(),
              HTTP_OK200,
              {
                useRawRecordingId: true,
              }
            );
          });

          cy.log(JSON.stringify(recordingIds));
        });
      }
    });
  }
);

Cypress.Commands.add(
  "testUploadRecording",
  (
    deviceName: string,
    details: TestThermalRecordingInfo,
    recordingName: string = "recording1",
    fileName: string = "invalid.cptv",
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    const data = makeRecordingDataFromDetails(details);
    cy.apiRecordingAdd(
      deviceName,
      data,
      fileName,
      recordingName,
      statusCode,
      additionalChecks
    );
  }
);

Cypress.Commands.add(
  "testUploadRecordingOnBehalfUsingGroup",
  (
    userName: string,
    deviceName: string,
    groupName: string,
    details: TestThermalRecordingInfo,
    recordingName: string = "recording1",
    fileName: string = "invalid.cptv",
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    const data = makeRecordingDataFromDetails(details);
    cy.apiRecordingAddOnBehalfUsingGroup(
      userName,
      deviceName,
      groupName,
      data,
      recordingName,
      fileName,
      statusCode,
      additionalChecks
    );
  }
);

Cypress.Commands.add(
  "testUploadRecordingOnBehalfUsingDevice",
  (
    userName: string,
    deviceName: string,
    details: TestThermalRecordingInfo,
    recordingName: string = "recording1",
    fileName: string = "invalid.cptv",
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    const data = makeRecordingDataFromDetails(details);
    cy.apiRecordingAddOnBehalfUsingDevice(
      userName,
      deviceName,
      data,
      recordingName,
      fileName,
      statusCode,
      additionalChecks
    );
  }
);

Cypress.Commands.add(
  "testAddRecordingsAtTimes",
  (deviceName: string, times: string[]) => {
    logTestDescription(
      `Upload recordings   at ${prettyLog(times)}  to '${deviceName}'`,
      { camera: deviceName, times }
    );

    times.forEach((time) => {
      cy.testUploadRecording(deviceName, { time });
    });
  }
);

Cypress.Commands.add(
  "testUserTagRecording",
  (recordingId: number, trackIndex: number, tagger: string, tag: string) => {
    logTestDescription(`User '${tagger}' tags recording as '${tag}'`, {
      recordingId,
      trackIndex,
      tagger,
      tag,
    });

    makeAuthorizedRequest(
      {
        method: "GET",
        url: v1ApiPath(`recordings/${recordingId}/tracks`),
      },
      tagger
    ).then((response) => {
      makeAuthorizedRequest(
        {
          method: "POST",
          url: v1ApiPath(
            `recordings/${recordingId}/tracks/${response.body.tracks[trackIndex].id}/replaceTag`
          ),
          body: { what: tag, confidence: 0.7, automatic: false },
        },
        tagger
      );
    });
  }
);

Cypress.Commands.add(
  "thenUserTagAs",
  { prevSubject: true },
  (subject, tagger: string, tag: string) => {
    cy.testUserTagRecording(subject, 0, tagger, tag);
  }
);

Cypress.Commands.add(
  "testAddRecordingThenUserTag",
  (
    deviceName: string,
    details: TestThermalRecordingInfo,
    tagger: string,
    tag: string
  ) => {
    cy.testUploadRecording(deviceName, details).then((recordingId) => {
      cy.testUserTagRecording(recordingId, 0, tagger, tag);
    });
  }
);

function makeRecordingDataFromDetails(
  details: TestThermalRecordingInfo
): ApiRecordingSet {
  const data: ApiRecordingSet = {
    type: RecordingType.ThermalRaw,
    recordingDateTime: "",
    duration: 12,
    comment: "uploaded by cypress",
  };

  if (details.duration) {
    data.duration = details.duration;
  }

  data.recordingDateTime = getDateForRecordings(details).toISOString();

  if (!details.noTracks) {
    const model = details.model ? details.model : "Master";
    addTracksToRecording(data, model, details.tracks, details.tags);
  }

  if (details.lat && details.lng) {
    data.location = [details.lat, details.lng];
  }
  if (details.processingState) {
    data.processingState = details.processingState as RecordingProcessingState;
  }
  return data;
}

function getDateForRecordings(details: TestThermalRecordingInfo): Date {
  let date = lastUsedTime;

  if (details.time) {
    date = convertToDate(details.time);
  } else if (details.minsLater || details.secsLater) {
    let secs = 0;
    if (details.minsLater) {
      secs += details.minsLater * 60;
    }
    if (details.secsLater) {
      secs += details.secsLater;
    }
    date = new Date(date.getTime() + secs * 1000);
  } else {
    // add a minute anyway so we don't get two overlapping recordings on the same camera
    const MINUTE = 60;
    date = new Date(date.getTime() + MINUTE * 1000);
  }

  lastUsedTime = date;
  return date;
}

function addTracksToRecording(
  data: ApiRecordingSet,
  model: string,
  trackDetails?: ApiTrackSet[],
  tags?: string[]
): void {
  data.metadata = {
    algorithm: { tracker_version: 10 },
    models: [
      {
        id: 1,
        name: model,
      },
    ],
    tracks: [],
  };

  if (tags && !trackDetails) {
    trackDetails = tags.map((confident_tag) => ({
      predictions: [
        {
          confident_tag: confident_tag,
          confidence: 0.9,
          model_id: 1,
        },
      ],
      start_s: undefined,
      end_s: undefined,
    }));
  }

  if (trackDetails) {
    let count = 0;
    data.metadata.tracks = trackDetails.map((track) => {
      const tag = track.predictions[0].confident_tag
        ? track.predictions[0].confident_tag
        : "possum";
      return {
        start_s: track.start_s || 2 + count * 10,
        end_s: track.end_s || 8 + count * 10,
        predictions: [
          {
            model_id: 1,
            confident_tag: tag,
            confidence: 0.9,
          },
        ],
      };
    });
    count++;
  } else {
    data.metadata.tracks.push({
      start_s: 2,
      end_s: 8,
      predictions: [
        {
          model_id: 1,
          confident_tag: "possum",
          confidence: 0.5,
        },
      ],
    });
  }
}

Cypress.Commands.add(
  "testGetRecordingIdsForQuery",
  (userName: string, where: any) => {
    const user = getCreds(userName);
    const params = {
      where: JSON.stringify(removeUndefinedParams(where)),
    };
    const fullUrl = v1ApiPath("recordings", params);
    cy.request({
      url: fullUrl,
      headers: user.headers,
    }).then((response) => {
      let recordingIds = [];
      const recordings = response.body.rows;
      recordingIds = recordings.map((recording: any) => recording.id);
      cy.wrap(recordingIds);
    });
  }
);

Cypress.Commands.add(
  "testCheckDeviceHasRecordings",
  (userName, deviceName, count) => {
    const user = getCreds(userName);
    const camera = getCreds(deviceName);
    const params = {
      where: JSON.stringify({ DeviceId: camera.id }),
    };
    const fullUrl = v1ApiPath("recordings", params);

    cy.request({
      url: fullUrl,
      headers: user.headers,
    }).then((request) => {
      expect(request.body.count).to.equal(count);
    });
  }
);

export function checkRecording(
  userName: string,
  recordingId: number,
  checkFunction: any
) {
  cy.log(`recording id is ${recordingId}`);
  makeAuthorizedRequest(
    {
      url: v1ApiPath(`recordings`),
    },
    userName
  ).then((response) => {
    let recordings = response.body.rows;
    if (recordingId !== 0) {
      recordings = recordings.filter((x: any) => x.id == recordingId);
    }
    if (recordings.length > 0) {
      checkFunction(recordings[0]);
    } else {
      expect(recordings.length).equal(1);
    }
  });
}

export function addSeconds(initialTime: Date, secondsToAdd: number): Date {
  const AS_MILLISECONDS = 1000;
  return new Date(initialTime.getTime() + secondsToAdd * AS_MILLISECONDS);
}

export function TestCreateRecordingData(
  template: ApiRecordingSet
): ApiRecordingSet {
  return JSON.parse(JSON.stringify(template));
}

export function TestCreateExpectedProcessingData(
  template: ApiRecordingForProcessing,
  recordingName: string,
  recording: ApiRecordingSet
): ApiRecordingForProcessing {
  const expected = JSON.parse(JSON.stringify(template));
  expected.id = getCreds(recordingName).id;
  expected.duration = recording.duration;

  // NOTE: Locations are currently provided as Y,X (lat, long), but stored raw as X,Y (long, lat)
  expected.location = {
    coordinates: [recording.location[1], recording.location[0]],
    type: "Point",
    crs: {
      type: "name",
      properties: {
        name: NOT_NULL_STRING,
      },
    },
  };
  expected.recordingDateTime = recording.recordingDateTime;
  return expected;
}

export function TestCreateExpectedNeedsTagData(
  template: ApiRecordingNeedsTagReturned,
  recordingName: string,
  deviceName: string,
  inputRecording: any
): ApiRecordingNeedsTagReturned {
  const expected = JSON.parse(JSON.stringify(template));
  const deviceId = getCreds(deviceName).id;

  expected.DeviceId = deviceId;
  expected.RecordingId = getCreds(recordingName).id;
  expected.duration = inputRecording.duration;
  expected.recordingJWT = NOT_NULL_STRING;
  expected.tagJWT = NOT_NULL_STRING;
  expected.tracks = [];
  inputRecording.metadata.tracks.forEach((track: any) => {
    expected.tracks.push({
      trackId: NOT_NULL,
      id: NOT_NULL,
      start: track.start_s,
      end: track.end_s,
      needsTagging: true,
      positions: positionResponseFromSet(track.positions),
      numFrames: track.num_frames,
    });
  });

  return expected;
}

export function TestCreateExpectedRecordingColumns(
  recordingName: string,
  deviceName: string,
  groupName: string,
  stationName: string,
  inputRecording: ApiRecordingSet
): ApiRecordingColumns {
  const inputTrackData = inputRecording.metadata;
  const expected: ApiRecordingColumns = {};

  expected.Id = getCreds(recordingName).id.toString();
  expected.Type = inputRecording.type;
  expected.Group = getTestName(groupName);
  expected.Device = getTestName(deviceName);
  if (stationName !== undefined) {
    expected.Station = getTestName(stationName);
  } else {
    // This will be an automatically generated name
    expected.Station = NOT_NULL_STRING;
  }
  expected.Date = new Date(inputRecording.recordingDateTime).toLocaleDateString(
    "en-CA"
  );
  expected.Time = new Date(
    inputRecording.recordingDateTime
  ).toLocaleTimeString();
  expected.Latitude = inputRecording.location[0].toString();
  expected.Longitude = inputRecording.location[1].toString();
  expected.Duration = inputRecording.duration.toString();
  expected.BatteryPercent = (inputRecording.batteryLevel || "").toString();
  expected.Comment = inputRecording.comment || "";
  if (inputTrackData !== undefined && inputTrackData.tracks !== undefined) {
    expected["Track Count"] = inputTrackData.tracks.length.toString();
    expected["Automatic Track Tags"] = inputTrackData.tracks
      .map((track) =>
        track.predictions.map((prediction) => prediction.confident_tag)
      )
      .join(";");
  } else {
    expected["Track Count"] = "0";
    expected["Automatic Track Tags"] = "";
  }
  expected["Human Track Tags"] = "";
  expected["Recording Tags"] = "";
  expected.URL =
    BASE_URL + "/recording/" + getCreds(recordingName).id.toString();
  if (inputRecording && inputRecording.cacophonyIndex) {
    expected["Cacophony Index"] = inputRecording.cacophonyIndex
      .map((ci: any) => ci.index_percent)
      .join(";");
  } else {
    expected["Cacophony Index"] = "";
  }
  expected["Species Classification"] = ""; //FIXME PATRICK - remove once this depracted column gone

  return expected;
}

export function TestCreateExpectedRecordingData<T extends ApiRecordingResponse>(
  template: T,
  recordingName: string,
  deviceName: string,
  groupName: string,
  stationName: string,
  inputRecording: any
): T {
  const inputTrackData = inputRecording.metadata;
  const expected = JSON.parse(JSON.stringify(template));
  const device: ApiDeviceIdAndName = {
    id: getCreds(deviceName).id,
    deviceName: getTestName(deviceName),
  };

  const group = {
    id: getCreds(groupName).id,
    groupName: getTestName(groupName),
  };

  if (stationName) {
    expected.stationId = getCreds(stationName).id;
    expected.stationName = getTestName(stationName);
  } else {
    // Ignored
    expected.stationId = NOT_NULL;
    expected.stationName = NOT_NULL_STRING;
  }

  expected.id = getCreds(recordingName).id;
  expected.deviceId = device.id;
  expected.deviceName = device.deviceName;
  expected.groupId = group.id;
  expected.groupName = group.groupName;
  expected.type = inputRecording.type;
  if (inputRecording.type == RecordingType.ThermalRaw) {
    expected.rawMimeType = "application/x-cptv";
  } else {
    expected.rawMimeType = "audio/mpeg";
  }
  if (inputRecording.duration !== undefined) {
    expected.duration = inputRecording.duration;
  }
  if (inputRecording.recordingDateTime !== undefined) {
    expected.recordingDateTime = inputRecording.recordingDateTime;
  }
  if (inputRecording.version !== undefined) {
    expected.version = inputRecording.version;
  }
  if (inputRecording.comment !== undefined) {
    expected.comment = inputRecording.comment;
  }
  if (inputRecording.batteryLevel !== undefined) {
    expected.batteryLevel = inputRecording.batteryLevel;
  }
  if (inputRecording.batteryCharging !== undefined) {
    expected.batteryCharging = inputRecording.batteryCharging;
  }
  if (inputRecording.airplaneModeOn !== undefined) {
    expected.airplaneModeOn = inputRecording.airplaneModeOn;
  }
  if (inputRecording.relativeToDusk !== undefined) {
    expected.relativeToDusk = inputRecording.relativeToDusk;
  }
  if (inputRecording.relativeToDawn !== undefined) {
    expected.relativeToDawn = inputRecording.relativeToDawn;
  }
  if (inputRecording.fileMimeType !== undefined) {
    expected.fileMimeType = inputRecording.fileMimeType;
  }
  if (inputRecording.cacophonyIndex !== undefined) {
    expected.cacophonyIndex = inputRecording.cacophonyIndex;
  }
  if (inputRecording.additionalMetadata !== undefined) {
    expected.additionalMetadata = JSON.parse(
      JSON.stringify(inputRecording.additionalMetadata)
    );
  }

  if (expected.type === RecordingType.ThermalRaw) {
    // Even if we don't pass additionalMetadata, some will be populated by cptv parsing.
    if (!expected.additionalMetadata) {
      expected.additionalMetadata = {};
    }
    if (!expected.additionalMetadata.totalFrames) {
      expected.additionalMetadata.totalFrames = NOT_NULL;
    }
    if (!expected.additionalMetadata.previewSecs) {
      expected.additionalMetadata.previewSecs = NOT_NULL;
    }
  }

  if (inputRecording.location !== undefined) {
    expected.location = {
      lat: inputRecording.location[0],
      lng: inputRecording.location[1],
    };
  }
  //expected.Station = station;

  //filtered unless we get a valid tag

  expected.tags = [] as ApiRecordingTagResponse[];
  expected.tracks = [] as ApiTrackResponse[];
  if (inputTrackData) {
    expected.tracks = trackResponseFromSet(
      inputTrackData.tracks,
      inputTrackData.models
    );
  }

  //TODO: add handling of stations
  //TODO: add handling of per-recording tags
  //TODO: add handling of manual tags
  return removeUndefinedParams(expected);
}

function positionResponseFromSet(positions) {
  const tps = [];
  positions.forEach((tp) => {
    const newTp = {};
    newTp["x"] = tp.x;
    newTp["y"] = tp.y;
    newTp["width"] = tp.width;
    newTp["height"] = tp.height;
    newTp["order"] = tp.frame_number;
    tps.push(newTp);
  });

  return tps;
}

export function predictionResponseFromSet(
  predictions,
  models: ApiRecordingModel[]
) {
  const tps = [];
  if (predictions) {
    predictions.forEach((tp) => {
      const newTp = {};
      const model_id = tp.model_id;
      let model_name = null;
      models.forEach((model) => {
        if (model.id == model_id) {
          model_name = model.name;
        }
      });
      newTp["name"] = model_name;
      newTp["clarity"] = tp.clarity;
      newTp["raw_tag"] = tp.label;
      newTp["predictions"] = tp.predictions;
      newTp["prediction_frames"] = tp.prediction_frames;
      newTp["all_class_confidences"] = tp.all_class_confidences;
      tps.push(newTp);
    });
  }
  return tps;
}

export function trackResponseFromSet(
  tracks: ApiTrackSet[],
  models: ApiRecordingModel[]
) {
  const expected: ApiTrackResponse[] = [];
  if (tracks) {
    tracks.forEach((track: any) => {
      let filtered = true;
      const tpos = positionResponseFromSet(track.positions);
      const tpreddata = predictionResponseFromSet(track.predictions, models);

      const newTrack: ApiTrackResponse = {
        id: -99,
        tags: [],
        start: track.start_s,
        end: track.end_s,
        positions: tpos,
        filtered: false,
        automatic: true,
      };
      if (
        track.predictions &&
        track.predictions.length &&
        track.predictions[0].confident_tag !== undefined
      ) {
        if (filtered_tags.indexOf(track.predictions[0].confident_tag) === -1) {
          filtered = false;
        }
        newTrack.tags = [
          {
            what: track.predictions[0].confident_tag,
            automatic: true,
            trackId: -99,
            data: tpreddata[0],
            confidence: track.predictions[0].confidence,
            id: 0,
          },
        ];
      }
      newTrack.filtered = filtered;
      expected.push(newTrack);
    });
  }
  return expected;
}
