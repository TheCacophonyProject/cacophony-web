/// <reference path="../../../support/index.d.ts" />
import {
  // HTTP_Unprocessable,
  // HTTP_BadRequest,
  // HTTP_Unprocessable,
  // HTTP_Forbidden,
  // HTTP_OK200,
  NOT_NULL
} from "../../../commands/constants";

import { ApiRecordingReturned, ApiRecordingSet } from "../../../commands/types";

import { getCreds } from "../../../commands/server";

import {
  TestCreateExpectedRecordingData,
  TestCreateRecordingData,
} from "../../../commands/api/recording-tests";

//TODO: workaround for issue 81 - imprecise locations by default.  Remove when fixed.
const EXCLUDE_IDS = [
  "[].Tracks[].TrackTags[].TrackId",
  "[].Tracks[].id",
  "[].location.coordinates",
];

//TODO: DeviceId is here but not in Recording (get).  Inconsistent.  Remove here or add there
const templateExpectedRecording: ApiRecordingReturned = {
  Device: {devicename: "cy_raCamera1_f9a1b6a1", id: 844},
  DeviceId: NOT_NULL,
  Group: {groupname: "cy_raGroup_f9a1b6a1"},
  GroupId: 504,
  Station: null,
  StationId: null,
  Tags: [],
  Tracks: [{
    TrackTags: [{what: "cat", automatic: true, TrackId: 1, confidence: 0.9, UserId: null, data: "master", User: null}],
    data: {start_s: 2, end_s: 5},
    id: 1
  }],
  batteryLevel: null,
  duration: 15.6666666666667,
  fileMimeType: null,
  id: 1264,
  location: {type: "Point", coordinates: []},
  processing: null,
  processingState: "FINISHED",
  rawFileKey: NOT_NULL,
  rawMimeType: "application/x-cptv",
  recordingDateTime: "2021-07-17T20:13:17.248Z",
  type: "thermalRaw"
};

//TODO: Issue ##. Several parameters not propogated to returned recordings query (but present in /recording (get)).  Commented out here
//Either fix API to be consistent or remove this comment and remove commented lines below
const templateRecording1: ApiRecordingSet = {
  type: "thermalRaw",
  fileHash: null,
  duration: 15.6666666666667,
  recordingDateTime: "2021-07-17T20:13:17.248Z",
  location: [-45.29115, 169.30845],
//  version: "345",
//  batteryCharging: null,
  batteryLevel: null,
//  airplaneModeOn: null,
//  additionalMetadata: {
//    algorithm: 31143,
//    previewSecs: 5,
//    totalFrames: 141,
//  },
  metadata: {
    algorithm: { model_name: "master" },
    tracks: [{ start_s: 2, end_s: 5, confident_tag: "cat", confidence: 0.9 }],
  },
//  comment: "This is a comment",
  processingState: "FINISHED",
};

const templateRecording2: ApiRecordingSet = {
  type: "thermalRaw",
  fileHash: null,
  duration: 40,
  recordingDateTime: "2021-01-01T00:00:00.000Z",
  location: [-45, 169],
  version: "346",
  batteryCharging: null,
  batteryLevel: null,
  airplaneModeOn: null,
  additionalMetadata: {
    algorithm: 31144,
    previewSecs: 6,
    totalFrames: 142,
  },
  metadata: {
    algorithm: { model_name: "master" },
    tracks: [{ start_s: 1, end_s: 3, confident_tag: "possum", confidence: 0.8 }],
  },
  comment: "This is a comment2",
  processingState: "CORRUPT",
};

const templateRecording3: ApiRecordingSet = {
 type: "audio",
  fileHash: null,
  duration: 60,
  recordingDateTime: "2021-08-24T01:35:00.000Z",
  relativeToDawn: null,
  relativeToDusk: -17219,
  location: [-43.53345, 172.64745],
  version: "1.8.1",
  batteryCharging: "DISCHARGING",
  batteryLevel: 87,
  airplaneModeOn: false,
  additionalMetadata: {
    normal: "0",
    "SIM IMEI": "990006964660319",
    analysis: {
      cacophony_index: [
        { end_s: 20, begin_s: 0, index_percent: 80.8 },
        { end_s: 40, begin_s: 20, index_percent: 77.1 },
        { end_s: 60, begin_s: 40, index_percent: 71.6 },
      ],
      species_identify: [],
      cacophony_index_version: "2020-01-20_A",
      processing_time_seconds: 50.7,
      species_identify_version: "2021-02-01",
    },
    "SIM state": "SIM_STATE_READY",
    "Auto Update": false,
    "Flight Mode": false,
    "Phone model": "SM-G900V",
    amplification: 1.0721460589601806,
    SimOperatorName: "Verizon",
    "Android API Level": 23,
    "Phone manufacturer": "samsung",
    "App has root access": false,
  },
  comment: null,
  processingState: "analyse",
};

const recording1 = TestCreateRecordingData(templateRecording1);
let expectedRecording1: ApiRecordingReturned;
const recording2 = TestCreateRecordingData(templateRecording2);
let expectedRecording2: ApiRecordingReturned;
const recording3 = TestCreateRecordingData(templateRecording3);
let expectedRecording3: ApiRecordingReturned;

describe("Recordings query using where", () => {
  before(() => {
    cy.testCreateUserGroupAndDevice("rqGroupAdmin", "rqGroup", "rqCamera1");
    cy.apiDeviceAdd("rqCamera1b", "rqGroup");
    cy.apiUserAdd("rqGroupMember");
    cy.apiUserAdd("rqDeviceAdmin");
    cy.apiUserAdd("rqDeviceMember");
    cy.apiGroupUserAdd("rqGroupAdmin", "rqGroupMember", "rqGroup", true);
    cy.apiDeviceUserAdd("rqGroupAdmin", "rqDeviceAdmin", "rqCamera1", true);
    cy.apiDeviceUserAdd("rqGroupAdmin", "rqDeviceMember", "rqCamera1", true);

    cy.testCreateUserGroupAndDevice("rqGroup2Admin", "rqGroup2", "rqCamera2");

    //define intercept here to allow adding recordings in before() - normally done in beforeEach
    cy.intercept("POST", "recordings").as("addRecording");

    //add some recordings to query
    cy.apiRecordingAdd("rqCamera1", recording1, undefined, "rqRecording1").then(() => {
        expectedRecording1 = TestCreateExpectedRecordingData( templateExpectedRecording, "rqRecording1", "rqCamera1", "rqGroup", null, recording1);
        cy.log(JSON.stringify(expectedRecording1));
    });
    cy.apiRecordingAdd("rqCamera1", recording2, undefined, "rqRecording2").then(() => {
        expectedRecording2 = TestCreateExpectedRecordingData( templateExpectedRecording, "rqRecording2", "rqCamera1", "rqGroup", null, recording2);
    });
    cy.apiRecordingAdd("rqCamera1", recording3, undefined, "rqRecording3").then(() => {
        expectedRecording3 = TestCreateExpectedRecordingData( templateExpectedRecording, "rqRecording3", "rqCamera1", "rqGroup", null, recording3);
    });
  });

  it("Group admin can query device's recordings", () => {

    cy.log("Check recording can be viewed correctly");
    cy.apiRecordingsQueryCheck( "rqGroupAdmin", {where: {id: getCreds("rqRecording1").id}}, [expectedRecording1], EXCLUDE_IDS);
    cy.log("Check recording count can be viewed correctly");
    cy.apiRecordingsCountCheck( "rqGroupAdmin", {where: {id: getCreds("rqRecording1").id}}, 1);

  });

  it.skip("Group member can query device's recordings", () => {});
  
  it.skip("Device admin can query device's recordings", () => {});
    
  it.skip("Device member can query device's recordings", () => {});
  
  it.skip("Device member can query device's recordings", () => {});
    
  it.skip("Non member cannot view devices recordings", () => {});
    
  it.skip("Can handle no returned matches", () => {});
    
  it.skip("Paging works as expected", () => {});
  
  it.skip("Can query by all vali single parameters", () => {});
    
  it.skip("Can query by multiple parameters", () => {});

  it.skip("Can limit query by tags and tagmode", () => {});

  it.skip("Can specify location precision", () => {});

  it.skip("Super-admin can view as user", () => {});

  it.skip("Can handle invalid queries", () => {});

  it.skip("Can handle invalid parameters", () => {});
  
});

