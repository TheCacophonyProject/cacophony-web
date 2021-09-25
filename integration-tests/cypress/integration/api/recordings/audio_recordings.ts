/// <reference path="../../../support/index.d.ts" />
import {
  HTTP_Unprocessable,
  HTTP_BadRequest,
  //HTTP_Forbidden,
  //HTTP_OK200,
} from "../../../commands/constants";

const EXCLUDE_IDS = [
  ".Tracks[].TrackTags[].TrackId",
  ".Tracks[].id",
//TODO: workaround for issue 81 - imprecise locations by default.  Remove when fixed.
  ".location.coordinates",
//TODO: workaround for issue 88, inconsistent mime type for audio (audio/mpeg vs video/mp4)
  ".rawMimeType"
];
import {
  ApiRecordingReturned,
  ApiRecordingSet,
  ApiLocation,
} from "../../../commands/types";

import {
  TestCreateExpectedRecordingData,
  TestCreateRecordingData,
} from "../../../commands/api/recording-tests";

const templateExpectedRecording: ApiRecordingReturned = {
  // TODO: Issue 87.  Filehash missing on returned values
  // fileHash: null,
  id: 204771,
  rawMimeType:"audio/mp4",
  //rawMimeType: "video/mp4",
  fileMimeType: null,
  processingState: "FINISHED",
  duration: 60,
  recordingDateTime: "2021-08-24T01:35:00.000Z",
  relativeToDawn: null,
  relativeToDusk: -17219,
  location: { type: "Point", coordinates: [-43.53345, 172.64745] },
  version: "1.8.1",
  batteryLevel: 87,
  batteryCharging: "DISCHARGING",
  airplaneModeOn: false,
  type: "audio",
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
  GroupId: 389,
  StationId: null,
  comment: null,
  processing: null,
  Group: { groupname: "mattb-audio" },
  Station: null,
  Tags: [],
  Tracks: [],
  Device: { devicename: "mattb-s5", id: 2023 },
};

const templateRecording: ApiRecordingSet = {
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
  processingState: "FINISHED",
};

describe("Recordings - audio recording parameter tests", () => {
  before(() => {
    cy.testCreateUserGroupAndDevice("rarGroupAdmin", "rarGroup", "rarDevice1");
    cy.apiDeviceAdd("rarDevice1b", "rarGroup");
    cy.apiUserAdd("rarGroupMember");
    cy.apiUserAdd("rarDeviceAdmin");
    cy.apiUserAdd("rarDeviceMember");
    cy.apiGroupUserAdd("rarGroupAdmin", "rarGroupMember", "rarGroup", true);
    cy.apiDeviceUserAdd("rarGroupAdmin", "rarDeviceAdmin", "rarDevice1", true);
    cy.apiDeviceUserAdd("rarGroupAdmin", "rarDeviceMember", "rarDevice1", true);

    cy.testCreateUserGroupAndDevice(
      "rarGroup2Admin",
      "rarGroup2",
      "rarDevice2"
    );
  });

  it("Can upload an audio recording", () => {
    const recording1 = TestCreateRecordingData(templateRecording);
    let expectedRecording1: ApiRecordingReturned;

    cy.log("Add recording as device");
    cy.apiRecordingAdd(
      "rarDevice1",
      recording1,
      "60sec-audio.mp4",
      "rarRecording1"
    ).then(() => {
      expectedRecording1 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording1",
        "rarDevice1",
        "rarGroup",
        null,
        recording1
      );
      cy.log("Check recording can be viewed correctly");
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording1",
        expectedRecording1,
        EXCLUDE_IDS
      );
    });

    cy.log("Delete recording");
    cy.apiRecordingDelete("rarGroupAdmin", "rarRecording1");

    cy.log("Check recording no longer exists");
    cy.apiRecordingCheck(
      "rarGroupAdmin",
      "rarRecording1",
      undefined,
      [],
      HTTP_BadRequest
    );
  });

  it("Duration handled correctly", () => {
    cy.log("Uses supplied duration");
    const recording2 = TestCreateRecordingData(templateRecording);
    let expectedRecording2: ApiRecordingReturned;

    recording2.duration = 45;
    cy.apiRecordingAdd(
      "rarDevice1",
      recording2,
      "60sec-audio.mp4",
      "rarRecording2"
    ).then(() => {
      expectedRecording2 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording2",
        "rarDevice1",
        "rarGroup",
        null,
        recording2
      );
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording2",
        expectedRecording2,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording2");
    });
  });

  //TODO: confirm audio files do not have duration embedded?
  it.skip("Can read duration from file if not supplied", () => {
    cy.log("Takes duration from recording if not specified");
    const recording13 = TestCreateRecordingData(templateRecording);
    let expectedRecording13: ApiRecordingReturned;

    delete recording13.duration;
    cy.apiRecordingAdd(
      "rarDevice1",
      recording13,
      "60sec-audio.mp4",
      "rarRecording13"
    ).then(() => {
      expectedRecording13 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording13",
        "rarDevice1",
        "rarGroup",
        null,
        recording13
      );
      expectedRecording13.duration = 60;
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording13",
        expectedRecording13,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording13");
    });
  });

  //TODO: Invalid duration causes server error.  Should be caught with 4xx
  it.skip("Handles invalid duration correctly", () => {
    cy.log("Invalid duration rejected correctly");
    const recording14 = TestCreateRecordingData(templateRecording);

    recording14.duration = -99;
    cy.apiRecordingAdd(
      "rarDevice1",
      recording14,
      "60sec-audio.mp4",
      "rarRecording14",
      HTTP_Unprocessable
    );
  });

  it("RecordingDateTime takes correct values", () => {
    //can specify recordingDateTime
    const recording15 = TestCreateRecordingData(templateRecording);
    let expectedRecording15: ApiRecordingReturned;

    recording15.recordingDateTime = new Date().toISOString();
    cy.apiRecordingAdd(
      "rarDevice1",
      recording15,
      "60sec-audio.mp4",
      "rarRecording15"
    ).then(() => {
      expectedRecording15 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording15",
        "rarDevice1",
        "rarGroup",
        null,
        recording15
      );
      expectedRecording15.recordingDateTime = recording15.recordingDateTime;
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording15",
        expectedRecording15,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording15");
    });

    //can have blank recordingDateTime
    const recording16 = TestCreateRecordingData(templateRecording);
    let expectedRecording16: ApiRecordingReturned;

    recording16.recordingDateTime = null;
    cy.apiRecordingAdd(
      "rarDevice1",
      recording16,
      "60sec-audio.mp4",
      "rarRecording16"
    ).then(() => {
      expectedRecording16 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording16",
        "rarDevice1",
        "rarGroup",
        null,
        recording16
      );
      expectedRecording16.recordingDateTime = recording16.recordingDateTime;
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording16",
        expectedRecording16,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording16");
    });
  });

  //TODO: confirm audio files do not have dateTime embedded?
  it.skip("Can read recordingDateTime from file if not provided", () => {
    const recording7 = TestCreateRecordingData(templateRecording);
    let expectedRecording7: ApiRecordingReturned;

    delete recording7.recordingDateTime;
    cy.apiRecordingAdd(
      "rarDevice1",
      recording7,
      "60sec-audio.mp4",
      "rarRecording7"
    ).then(() => {
      expectedRecording7 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording7",
        "rarDevice1",
        "rarGroup",
        null,
        recording7
      );
      expectedRecording7.recordingDateTime = "2021-03-18T17:36:46.555Z";
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording7",
        expectedRecording7,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording7");
    });
  });

  //TODO: Fails - issue 80
  it.skip("Invalid recordingDateTime handled correctly", () => {
    const recording8 = TestCreateRecordingData(templateRecording);
    recording8.recordingDateTime = "BadTimeValue";
    cy.apiRecordingAdd(
      "rarDevice1",
      recording8,
      "60sec-audio.mp4",
      "rarRecording8",
      HTTP_Unprocessable
    );
  });

  //TODO: issue 81.  Locations at following locations cause server error:
  //Grenwich meridian at equator (0 deg long, 0 deg lat)
  //North and south poles (+/-90 deg lat)
  //International date line (+/-180 deg)
  //Locations retunred inaccurately (rounded to 100m) - issue 82
  it.skip("Location parameters processed correctly", () => {
    //locations 0-180 degrees long and 0-89 lat accepted
    const recording11 = TestCreateRecordingData(templateRecording);
    let expectedRecording11: ApiRecordingReturned;
    recording11.location = [89.0001, 179.0001];

    cy.apiRecordingAdd(
      "rarDevice1",
      recording11,
      "60sec-audio.mp4",
      "rarRecording11"
    ).then(() => {
      expectedRecording11 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording11",
        "rarDevice1",
        "rarGroup",
        null,
        recording11
      );
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording11",
        expectedRecording11,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording11");
    });

    //TODO Fails: Issue 81.  Locations on south pole or international date line cause server error
    //locations 180 degrees long (international date line west)
    const recording12 = TestCreateRecordingData(templateRecording);
    let expectedRecording12: ApiRecordingReturned;
    recording12.location = [89, 180];
    cy.apiRecordingAdd(
      "rarDevice1",
      recording12,
      "60sec-audio.mp4",
      "rarRecording12"
    ).then(() => {
      expectedRecording12 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording12",
        "rarDevice1",
        "rarGroup",
        null,
        recording12
      );
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording12",
        expectedRecording12,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording12");
    });

    //locations -179 to 0 degrees long and -89 to 0 lat accepted
    const recording13 = TestCreateRecordingData(templateRecording);
    let expectedRecording13: ApiRecordingReturned;
    recording13.location = [-89, -179];
    cy.apiRecordingAdd(
      "rarDevice1",
      recording13,
      "60sec-audio.mp4",
      "rarRecording13"
    ).then(() => {
      expectedRecording13 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording13",
        "rarDevice1",
        "rarGroup",
        null,
        recording13
      );
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording13",
        expectedRecording13,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording13");
    });

    //locations 181 to 360 degrees long (equivalent to -0 to -180 deg long)
    const recording14 = TestCreateRecordingData(templateRecording);
    let expectedRecording14: ApiRecordingReturned;
    recording14.location = [-89, 359];
    cy.apiRecordingAdd(
      "rarDevice1",
      recording14,
      "60sec-audio.mp4",
      "rarRecording14"
    ).then(() => {
      expectedRecording14 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording14",
        "rarDevice1",
        "rarGroup",
        null,
        recording14
      );
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording14",
        expectedRecording14,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording14");
    });

    //locations 360 degrees
    const recording15 = TestCreateRecordingData(templateRecording);
    let expectedRecording15: ApiRecordingReturned;
    recording15.location = [90, 360];
    cy.apiRecordingAdd(
      "rarDevice1",
      recording15,
      "60sec-audio.mp4",
      "rarRecording15"
    ).then(() => {
      expectedRecording15 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording15",
        "rarDevice1",
        "rarGroup",
        null,
        recording15
      );
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording15 ",
        expectedRecording15,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording15");
    });

    //locations 0 degrees - equator on meridian
    const recording16 = TestCreateRecordingData(templateRecording);
    let expectedRecording16: ApiRecordingReturned;
    recording16.location = { type: "Point", coordinates: [0, 0] };
    cy.apiRecordingAdd(
      "rarDevice1",
      recording16,
      "60sec-audio.mp4",
      "rarRecording16"
    ).then(() => {
      expectedRecording16 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording16",
        "rarDevice1",
        "rarGroup",
        null,
        recording16
      );
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording16 ",
        expectedRecording16,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording16");
    });

    //locations -180 degrees international date line east
    const recording17 = TestCreateRecordingData(templateRecording);
    let expectedRecording17: ApiRecordingReturned;
    recording17.location = [-89, -180];
    cy.apiRecordingAdd(
      "rarDevice1",
      recording17,
      "60sec-audio.mp4",
      "rarRecording17"
    ).then(() => {
      expectedRecording17 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording17",
        "rarDevice1",
        "rarGroup",
        null,
        recording17
      );
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording17",
        expectedRecording17,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording17");
    });
  });

  //TODO: Issue 81.  Bad locations cause server error (not caught with error code)
  it.skip("Invalid locations handled correctly", () => {
    const recording18 = TestCreateRecordingData(templateRecording);
    recording18.location = [-91, 20];
    cy.apiRecordingAdd(
      "rarDevice1",
      recording18,
      "60sec-audio.mp4",
      "rarRecording18",
      HTTP_Unprocessable
    );

    const recording19 = TestCreateRecordingData(templateRecording);
    recording19.location = [-20, 361];
    cy.apiRecordingAdd(
      "rarDevice2",
      recording19,
      "60sec-audio.mp4",
      "rarRecording19",
      HTTP_Unprocessable
    );

    const recording20 = TestCreateRecordingData(templateRecording);
    recording20.location = "NotAValidValue" as unknown as ApiLocation;
    cy.apiRecordingAdd(
      "rarDevice3",
      recording20,
      "60sec-audio.mp4",
      "rarRecording20",
      HTTP_Unprocessable
    );
  });

  it("Version handled correctly", () => {
    //can specify version
    const recording21 = TestCreateRecordingData(templateRecording);
    let expectedRecording21: ApiRecordingReturned;

    recording21.version = "A valid version string";
    cy.apiRecordingAdd(
      "rarDevice1",
      recording21,
      "60sec-audio.mp4",
      "rarRecording21"
    ).then(() => {
      expectedRecording21 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording21",
        "rarDevice1",
        "rarGroup",
        null,
        recording21
      );
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording21",
        expectedRecording21,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording21");
    });

    //blank version
    const recording22 = TestCreateRecordingData(templateRecording);
    let expectedRecording22: ApiRecordingReturned;

    recording22.version = null;
    cy.apiRecordingAdd(
      "rarDevice1",
      recording22,
      "60sec-audio.mp4",
      "rarRecording22"
    ).then(() => {
      expectedRecording22 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording22",
        "rarDevice1",
        "rarGroup",
        null,
        recording22
      );
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording22",
        expectedRecording22,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording22");
    });

    //no version
    const recording23 = TestCreateRecordingData(templateRecording);
    let expectedRecording23: ApiRecordingReturned;

    delete recording23.version;
    cy.apiRecordingAdd(
      "rarDevice1",
      recording23,
      "60sec-audio.mp4",
      "rarRecording23"
    ).then(() => {
      expectedRecording23 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording23",
        "rarDevice1",
        "rarGroup",
        null,
        recording23
      );
      expectedRecording23.version = null;
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording23",
        expectedRecording23,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording23");
    });
  });

  it("Comments handled correctly", () => {
    //can specify comments
    const recording24 = TestCreateRecordingData(templateRecording);
    let expectedRecording24: ApiRecordingReturned;

    recording24.comment = "A valid comment string";
    cy.apiRecordingAdd(
      "rarDevice1",
      recording24,
      "60sec-audio.mp4",
      "rarRecording24"
    ).then(() => {
      expectedRecording24 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording24",
        "rarDevice1",
        "rarGroup",
        null,
        recording24
      );
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording24",
        expectedRecording24,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording24");
    });

    //blank comments
    const recording25 = TestCreateRecordingData(templateRecording);
    let expectedRecording25: ApiRecordingReturned;

    recording25.comment = null;
    cy.apiRecordingAdd(
      "rarDevice1",
      recording25,
      "60sec-audio.mp4",
      "rarRecording25"
    ).then(() => {
      expectedRecording25 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording25",
        "rarDevice1",
        "rarGroup",
        null,
        recording25
      );
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording25",
        expectedRecording25,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording25");
    });

    //no comment (optional)
    const recording26 = TestCreateRecordingData(templateRecording);
    let expectedRecording26: ApiRecordingReturned;

    delete recording26.comment;
    cy.apiRecordingAdd(
      "rarDevice1",
      recording26,
      "60sec-audio.mp4",
      "rarRecording26"
    ).then(() => {
      expectedRecording26 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording26",
        "rarDevice1",
        "rarGroup",
        null,
        recording26
      );
      expectedRecording26.comment = null;
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording26",
        expectedRecording26,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording26");
    });
  });

  it("File hash accepted correctly", () => {
    cy.log("Correct file hash accepted");
    const recording27 = TestCreateRecordingData(templateRecording);
    let expectedRecording27: ApiRecordingReturned;

    recording27.fileHash = "c5d369b40ef6c1cde4a2cfb4eb74ab6a2aa0a1bf"; //shasum output for 60sec-audio.mp4
    cy.apiRecordingAdd(
      "rarDevice1",
      recording27,
      "60sec-audio.mp4",
      "rarRecording27"
    ).then(() => {
      expectedRecording27 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording27",
        "rarDevice1",
        "rarGroup",
        null,
        recording27
      );
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording27",
        expectedRecording27,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording27");
    });

    cy.log("Incorrect file hash rejected");
    const recording28 = TestCreateRecordingData(templateRecording);

    recording28.fileHash = "1111111111111111111111111111111111111111"; //invalid shasum
    cy.apiRecordingAdd(
      "rarDevice1",
      recording28,
      "60sec-audio.mp4",
      "rarRecording28",
      HTTP_BadRequest,
      { message: "Uploaded file integrity check failed, please retry." }
    );

    cy.log("Blank hash accepted");
    const recording29 = TestCreateRecordingData(templateRecording);
    let expectedRecording29: ApiRecordingReturned;

    recording29.fileHash = null;
    cy.apiRecordingAdd(
      "rarDevice1",
      recording29,
      "60sec-audio.mp4",
      "rarRecording29"
    ).then(() => {
      expectedRecording29 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording29",
        "rarDevice1",
        "rarGroup",
        null,
        recording29
      );
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording29",
        expectedRecording29,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording29");
    });

    cy.log("No hash accepted");
    const recording30 = TestCreateRecordingData(templateRecording);
    let expectedRecording30: ApiRecordingReturned;

    recording30.fileHash = null;
    cy.apiRecordingAdd(
      "rarDevice1",
      recording30,
      "60sec-audio.mp4",
      "rarRecording30"
    ).then(() => {
      expectedRecording30 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording30",
        "rarDevice1",
        "rarGroup",
        null,
        recording30
      );
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording30",
        expectedRecording30,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording30");
    });
  });

  it("Additional metadata handled correctly", () => {
    cy.log("Any data accepted in additonalMetadata");
    const recording31 = TestCreateRecordingData(templateRecording);
    let expectedRecording31: ApiRecordingReturned;

    recording31.additionalMetadata = { ICanSetAnyKey: "ToAnyValue" };
    cy.apiRecordingAdd(
      "rarDevice1",
      recording31,
      "60sec-audio.mp4",
      "rarRecording31"
    ).then(() => {
      expectedRecording31 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording31",
        "rarDevice1",
        "rarGroup",
        null,
        recording31
      );
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording31",
        expectedRecording31,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording31");
    });

    cy.log("Can handle lot of additionalMetadata");
    const recording32 = TestCreateRecordingData(templateRecording);
    let expectedRecording32: ApiRecordingReturned;

    for (let count = 1; count < 200; count++) {
      recording32.additionalMetadata["key" + count.toString()] =
        "value" + count.toString();
    }
    cy.apiRecordingAdd(
      "rarDevice1",
      recording32,
      "60sec-audio.mp4",
      "rarRecording32"
    ).then(() => {
      expectedRecording32 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording32",
        "rarDevice1",
        "rarGroup",
        null,
        recording32
      );
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording32",
        expectedRecording32,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording32");
    });

    cy.log("Can handle empty additionalMetadata");
    const recording33 = TestCreateRecordingData(templateRecording);
    let expectedRecording33: ApiRecordingReturned;

    recording33.additionalMetadata = {};
    cy.apiRecordingAdd(
      "rarDevice1",
      recording33,
      "60sec-audio.mp4",
      "rarRecording33"
    ).then(() => {
      expectedRecording33 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording33",
        "rarDevice1",
        "rarGroup",
        null,
        recording33
      );
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording33",
        expectedRecording33,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording33");
    });
  });

  it.skip("Extracts additional metadata from recording if not provided", () => {
    const recording34 = TestCreateRecordingData(templateRecording);
    let expectedRecording34: ApiRecordingReturned;

    delete recording34.additionalMetadata;
    cy.apiRecordingAdd(
      "rarDevice1",
      recording34,
      "60sec-audio.mp4",
      "rarRecording34"
    ).then(() => {
      expectedRecording34 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording34",
        "rarDevice1",
        "rarGroup",
        null,
        recording34
      );
      expectedRecording34.additionalMetadata = {
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
      };

      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording34",
        expectedRecording34,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording34");
    });
  });

  //battery charging, level
  it("Battery charging state accepted and returned correctly", () => {
    cy.log("Battery discharging");
    const recording35 = TestCreateRecordingData(templateRecording);
    let expectedRecording35: ApiRecordingReturned;
    recording35.batteryLevel = 30;
    recording35.batteryCharging = "DISCHARGING";

    cy.apiRecordingAdd(
      "rarDevice1",
      recording35,
      "60sec-audio.mp4",
      "rarRecording35"
    ).then(() => {
      expectedRecording35 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording35",
        "rarDevice1",
        "rarGroup",
        null,
        recording35
      );
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording35",
        expectedRecording35,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording35");
    });

    cy.log("Battery charging");
    const recording36 = TestCreateRecordingData(templateRecording);
    let expectedRecording36: ApiRecordingReturned;
    recording36.batteryLevel = 32;
    recording36.batteryCharging = "CHARGING";

    cy.apiRecordingAdd(
      "rarDevice1",
      recording36,
      "60sec-audio.mp4",
      "rarRecording36"
    ).then(() => {
      expectedRecording36 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording36",
        "rarDevice1",
        "rarGroup",
        null,
        recording36
      );
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording36",
        expectedRecording36,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording36");
    });

    cy.log("Battery data null");
    const recording37 = TestCreateRecordingData(templateRecording);
    let expectedRecording37: ApiRecordingReturned;
    recording37.batteryLevel = null;
    recording37.batteryCharging = null;

    cy.apiRecordingAdd(
      "rarDevice1",
      recording37,
      "60sec-audio.mp4",
      "rarRecording37"
    ).then(() => {
      expectedRecording37 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording37",
        "rarDevice1",
        "rarGroup",
        null,
        recording37
      );
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording37",
        expectedRecording37,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording37");
    });

    cy.log("Battery data fields absent (optional)");
    const recording38 = TestCreateRecordingData(templateRecording);
    let expectedRecording38: ApiRecordingReturned;
    delete recording38.batteryLevel;
    delete recording38.batteryCharging;

    cy.apiRecordingAdd(
      "rarDevice1",
      recording38,
      "60sec-audio.mp4",
      "rarRecording38"
    ).then(() => {
      expectedRecording38 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording38",
        "rarDevice1",
        "rarGroup",
        null,
        recording38
      );
      expectedRecording38.batteryLevel = null;
      expectedRecording38.batteryCharging = null;
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording38",
        expectedRecording38,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording38");
    });
  });

  //TODO: No validation in API on battery status fields
  it.skip("Invalid battery charging data rejected correctly", () => {
    cy.log("Invalid charge level");
    const recording43 = TestCreateRecordingData(templateRecording);
    recording43.batteryLevel = "NotAValidValue" as unknown as number;
    cy.apiRecordingAdd(
      "rarDevice1",
      recording43,
      "60sec-audio.mp4",
      "rarRecording43",
      HTTP_Unprocessable
    );

    cy.log("Invalid charge state");
    const recording44 = TestCreateRecordingData(templateRecording);
    recording44.batteryCharging = "NotAValidValue";
    cy.apiRecordingAdd(
      "rarDevice1",
      recording44,
      "60sec-audio.mp4",
      "rarRecording44",
      HTTP_Unprocessable
    );
  });

  //airplanemode
  it("Airplanemode accepted and returned correctly", () => {
    cy.log("airplanemode on");
    const recording39 = TestCreateRecordingData(templateRecording);
    let expectedRecording39: ApiRecordingReturned;
    recording39.airplaneModeOn = true;

    cy.apiRecordingAdd(
      "rarDevice1",
      recording39,
      "60sec-audio.mp4",
      "rarRecording39"
    ).then(() => {
      expectedRecording39 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording39",
        "rarDevice1",
        "rarGroup",
        null,
        recording39
      );
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording39",
        expectedRecording39,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording39");
    });

    cy.log("airplanemode off");
    const recording40 = TestCreateRecordingData(templateRecording);
    let expectedRecording40: ApiRecordingReturned;
    recording40.airplaneModeOn = false;

    cy.apiRecordingAdd(
      "rarDevice1",
      recording40,
      "60sec-audio.mp4",
      "rarRecording40"
    ).then(() => {
      expectedRecording40 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording40",
        "rarDevice1",
        "rarGroup",
        null,
        recording40
      );
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording40",
        expectedRecording40,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording40");
    });

    cy.log("airplanemode null");
    const recording41 = TestCreateRecordingData(templateRecording);
    let expectedRecording41: ApiRecordingReturned;
    recording41.airplaneModeOn = null;

    cy.apiRecordingAdd(
      "rarDevice1",
      recording41,
      "60sec-audio.mp4",
      "rarRecording41"
    ).then(() => {
      expectedRecording41 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording41",
        "rarDevice1",
        "rarGroup",
        null,
        recording41
      );
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording41",
        expectedRecording41,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording41");
    });

    cy.log("airplanemode not provided (optional)");
    const recording42 = TestCreateRecordingData(templateRecording);
    let expectedRecording42: ApiRecordingReturned;
    delete recording42.airplaneModeOn;

    cy.apiRecordingAdd(
      "rarDevice1",
      recording42,
      "60sec-audio.mp4",
      "rarRecording42"
    ).then(() => {
      expectedRecording42 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording42",
        "rarDevice1",
        "rarGroup",
        null,
        recording42
      );
      expectedRecording42.airplaneModeOn = null;
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording42",
        expectedRecording42,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording42");
    });
  });

  //TODO: Invalid airplane mode causes server error
  it.skip("Invalid airplane mode data rejected correctly", () => {
    const recording45 = TestCreateRecordingData(templateRecording);
    recording45.airplaneModeOn = "NotAValidValue" as unknown as boolean;
    cy.apiRecordingAdd(
      "rarDevice1",
      recording45,
      "60sec-audio.mp4",
      "rarRecording45",
      HTTP_Unprocessable
    );
  });

  //relative to dawn, dusk
  it("Relative to dawn, dusk take valid values", () => {
    cy.log("Daytime values");
    const recording46 = TestCreateRecordingData(templateRecording);
    let expectedRecording46: ApiRecordingReturned;
    recording46.relativeToDawn = 21600;
    recording46.relativeToDusk = -21600;

    cy.apiRecordingAdd(
      "rarDevice1",
      recording46,
      "60sec-audio.mp4",
      "rarRecording46"
    ).then(() => {
      expectedRecording46 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording46",
        "rarDevice1",
        "rarGroup",
        null,
        recording46
      );
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording46",
        expectedRecording46,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording46");
    });

    cy.log("Nighttime values");
    const recording47 = TestCreateRecordingData(templateRecording);
    let expectedRecording47: ApiRecordingReturned;
    recording47.relativeToDawn = -21600;
    recording47.relativeToDusk = 21600;

    cy.apiRecordingAdd(
      "rarDevice1",
      recording47,
      "60sec-audio.mp4",
      "rarRecording47"
    ).then(() => {
      expectedRecording47 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording47",
        "rarDevice1",
        "rarGroup",
        null,
        recording47
      );
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording47",
        expectedRecording47,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording47");
    });

    cy.log("Max / min values");
    const recording48 = TestCreateRecordingData(templateRecording);
    let expectedRecording48: ApiRecordingReturned;
    recording48.relativeToDawn = -86399;
    recording48.relativeToDusk = 863992;

    cy.apiRecordingAdd(
      "rarDevice1",
      recording48,
      "60sec-audio.mp4",
      "rarRecording48"
    ).then(() => {
      expectedRecording48 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording48",
        "rarDevice1",
        "rarGroup",
        null,
        recording48
      );
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording48",
        expectedRecording48,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording48");
    });

    cy.log("Zero values");
    const recording49 = TestCreateRecordingData(templateRecording);
    let expectedRecording49: ApiRecordingReturned;
    recording49.relativeToDawn = 0;
    recording49.relativeToDusk = 0;

    cy.apiRecordingAdd(
      "rarDevice1",
      recording49,
      "60sec-audio.mp4",
      "rarRecording49"
    ).then(() => {
      expectedRecording49 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording49",
        "rarDevice1",
        "rarGroup",
        null,
        recording49
      );
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording49",
        expectedRecording49,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording49");
    });

    cy.log("Null values");
    const recording50 = TestCreateRecordingData(templateRecording);
    let expectedRecording50: ApiRecordingReturned;
    recording50.relativeToDawn = null;
    recording50.relativeToDusk = null;

    cy.apiRecordingAdd(
      "rarDevice1",
      recording50,
      "60sec-audio.mp4",
      "rarRecording50"
    ).then(() => {
      expectedRecording50 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording50",
        "rarDevice1",
        "rarGroup",
        null,
        recording50
      );
      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording50",
        expectedRecording50,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording50");
    });

    cy.log("Not provided (optional)");
    const recording51 = TestCreateRecordingData(templateRecording);
    let expectedRecording51: ApiRecordingReturned;
    delete recording51.relativeToDawn;
    delete recording51.relativeToDusk;

    cy.apiRecordingAdd(
      "rarDevice1",
      recording51,
      "60sec-audio.mp4",
      "rarRecording51"
    ).then(() => {
      expectedRecording51 = TestCreateExpectedRecordingData(
        templateExpectedRecording,
        "rarRecording51",
        "rarDevice1",
        "rarGroup",
        null,
        recording51
      );
      expectedRecording51.relativeToDawn = null;
      expectedRecording51.relativeToDusk = null;

      cy.apiRecordingCheck(
        "rarGroupAdmin",
        "rarRecording51",
        expectedRecording51,
        EXCLUDE_IDS
      );
      cy.apiRecordingDelete("rarGroupAdmin", "rarRecording51");
    });
  });

  //TODO: Invalid relativeToDawn/Dusk causes server error
  it.skip("Invalid relativeToDawn/dusk data rejected correctly", () => {
    cy.log("Invalid relativeToDawn");
    const recording52 = TestCreateRecordingData(templateRecording);
    recording52.relativeToDawn = "NotAValidValue" as unknown as number;
    cy.apiRecordingAdd(
      "rarDevice1",
      recording52,
      "60sec-audio.mp4",
      "rarRecording52",
      HTTP_Unprocessable
    );

    cy.log("Invalid relativeToDusk");
    const recording53 = TestCreateRecordingData(templateRecording);
    recording53.relativeToDusk = "NotAValidValue" as unknown as number;
    cy.apiRecordingAdd(
      "rarDevice1",
      recording53,
      "60sec-audio.mp4",
      "rarRecording53",
      HTTP_Unprocessable
    );
  });

  //Note: Processing state tested in processing test suite
});
