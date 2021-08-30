// load the global Cypress types
/// <reference types="cypress" />

import { uploadFile } from "../fileUpload";
import { getTestName } from "../names";
import {
  v1ApiPath,
  getCreds,
  DEFAULT_DATE,
  makeAuthorizedRequest,
  saveIdOnly,
} from "../server";
import { logTestDescription, prettyLog } from "../descriptions";
import { convertToDate } from "../server";
import {
  TestThermalRecordingInfo,
  ApiTrackSet,
  ApiRecordingData,
} from "../types";

let lastUsedTime = DEFAULT_DATE;

Cypress.Commands.add(
  "apiRecordingAdd",
  (
    deviceName: string,
    data: ApiRecordingData,
    fileName: string="invalid.cptv",
    recordingName: string="recording1",
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    logTestDescription(
      `Upload recording ${recordingName}  to '${deviceName}'`,
      { camera: deviceName, requestData: data }
    );

    const url = v1ApiPath("recordings");

    uploadFile(
      url,
      deviceName,
      fileName,
      data["type"],
      data,
      "@addRecording",
      statusCode
    ).then((x) => {
      cy.wrap(x.response.body.recordingId);
      if (recordingName !== null) {
        saveIdOnly(recordingName, x.response.body.recordingId);
      }
    });
  }
);

Cypress.Commands.add(
  "testUploadRecording",
  (
    deviceName: string,
    details: TestThermalRecordingInfo,
    log: boolean = true,
    recordingName: string = "recording1"
  ) => {
    const data = makeRecordingDataFromDetails(details);
    cy.apiRecordingAdd(deviceName, data, "invalid.cptv", recordingName);

  }
);

Cypress.Commands.add(
  "apiRecordingAddOnBehalfUsingGroup",
  (
    userName: string,
    deviceName: string,
    groupName: string,
    data: ApiRecordingData,
    recordingName: string,
    fileName: string = "invalid.cptv",
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {

    logTestDescription(
      `Upload recording on behalf using group${prettyLog(
        recordingName
      )}  to '${deviceName}'`,
      { camera: deviceName, requestData: data },
    );

    const url = v1ApiPath(
      "recordings/device/" +
        getTestName(deviceName) +
        "/group/" +
        getTestName(groupName)
    );
    const fileType = "application/cptv";

    uploadFile(url, userName, fileName, fileType, data, "@addRecording", statusCode).then(
      (x) => {
        cy.wrap(x.response.body.recordingId);
        if (recordingName !== null) {
          saveIdOnly(recordingName, x.response.body.recordingId);
        }
      }
    );
  }
);

Cypress.Commands.add(
  "apiRecordingAddOnBehalfUsingDevice",
  (
    deviceName: string,
    userName: string,
    details: TestThermalRecordingInfo,
    log: boolean = true,
    recordingName: string = "recording1"
  ) => {
    const data = makeRecordingDataFromDetails(details);

    logTestDescription(
      `Upload recording on behalf using device ${prettyLog(
        details
      )}  to '${deviceName}' using '${userName}'`,
      { camera: deviceName, requestData: data },
      log
    );
    const fileName = "invalid.cptv";
    const deviceId = getCreds(deviceName).id;
    const url = v1ApiPath("recordings/device/" + deviceId);
    const fileType = "application/cptv";

    uploadFile(url, userName, fileName, fileType, data, "@addRecording").then(
      (x) => {
        cy.wrap(x.response.body.recordingId);
        if (recordingName !== null) {
          saveIdOnly(recordingName, x.response.body.recordingId);
        }
      }
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
      cy.testUploadRecording(deviceName, { time }, false);
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
): ApiRecordingData {
  const data: ApiRecordingData = {
    type: "thermalRaw",
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
    data.processingState = details.processingState;
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
  data: ApiRecordingData,
  model: string,
  trackDetails?: ApiTrackSet[],
  tags?: string[]
): void {
  data.additionalMetadata = {
    algorithm: {
      model_name: model,
    },
    tracks: [],
  };

  if (tags && !trackDetails) {
    trackDetails = tags.map((confident_tag) => ({ confident_tag, start_s:undefined, end_s: undefined }));
  }

  if (trackDetails) {
    let count = 0;
    data.additionalMetadata.tracks = trackDetails.map((track) => {
      const tag = track.confident_tag ? track.confident_tag : "possum";
      return {
        start_s: track.start_s || 2 + count * 10,
        end_s: track.end_s || 8 + count * 10,
        confident_tag: tag,
        confidence: 0.9,
      };
    });
    count++;
  } else {
    data.additionalMetadata.tracks.push({
      start_s: 2,
      end_s: 8,
      confident_tag: "possum",
      confidence: 0.5,
    });
  }
}

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
      recordings = recordings.filter((x) => x.id == recordingId);
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
