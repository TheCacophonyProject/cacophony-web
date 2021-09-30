// load the global Cypress types
/// <reference types="cypress" />

import { uploadFile } from "../fileUpload";
import { getTestName } from "../names";
import {
  v1ApiPath,
  processingApiPath,
  getCreds,
  makeAuthorizedRequestWithStatus,
  saveIdOnly,
  saveJobKeyById,
  checkTreeStructuresAreEqualExcept,
  removeUndefinedParams,
} from "../server";
import { logTestDescription, prettyLog } from "../descriptions";
import { ApiRecordingSet, ApiRecordingReturned } from "../types";

Cypress.Commands.add(
  "processingApiPost",
  (
    recordingName: string,
    success: boolean,
    result: any,
    complete: boolean,
    newProcessedFileKey: string,
    statusCode: number = 200
  ) => {
    const id = getCreds(recordingName).id;
    const jobKey = getCreds(recordingName).jobKey;
    logTestDescription(`Processing 'done' for recording ${recordingName}`, {
      id: id,
      result: result,
    });
    const params = {
      id: id,
      jobKey: jobKey,
      success: success,
      result: JSON.stringify(result),
      complete: complete,
      newProcessedFileKey: newProcessedFileKey,
    };

    const url = processingApiPath("");
    cy.request({
      method: "PUT",
      url: url,
      body: params,
    }).then((response) => {
      expect(response.status, "Check return statusCode is").to.equal(
        statusCode
      );
    });
  }
);

Cypress.Commands.add(
  "processingApiCheck",
  (
    type: string,
    state: string,
    expectedRecording: any,
    excludeCheckOn: string[] = [],
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    logTestDescription(
      `Request recording ${type}  in state '${state} for processing'`,
      { type, state }
    );

    const params = {
      type,
      state,
    };
    const url = processingApiPath("", params);
    cy.log(`URL: ${url}`);
    cy.request({ url }).then((response) => {
      if (statusCode === 200) {
        if (response.body.recording !== undefined) {
          saveJobKeyById(
            response.body.recording.id,
            response.body.recording.jobKey
          );
        }
        checkTreeStructuresAreEqualExcept(
          expectedRecording,
          response.body.recording,
          excludeCheckOn
        );
      } else {
        if (additionalChecks["message"] !== undefined) {
          expect(response.body.messages).to.contain(
            additionalChecks["message"]
          );
        }
      }
    });
  }
);

Cypress.Commands.add(
  "apiRecordingAdd",
  (
    deviceName: string,
    data: ApiRecordingSet,
    fileName: string = "invalid.cptv",
    recordingName: string = "recording1",
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
      if (additionalChecks["message"] !== undefined) {
        expect(x.response.body.messages).to.contain(
          additionalChecks["message"]
        );
      }
    });
  }
);

Cypress.Commands.add(
  "apiRecordingDelete",
  (
    userName: string,
    recordingNameOrId: string,
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    logTestDescription(`Delete recording ${recordingNameOrId} `, {
      recordingName: recordingNameOrId,
    });

    let recordingId: string;
    if (additionalChecks["useRawRecordingId"] === true) {
      recordingId = recordingNameOrId;
    } else {
      recordingId = getCreds(recordingNameOrId).id.toString();
    }
    const url = v1ApiPath(`recordings/${recordingId}`);

    makeAuthorizedRequestWithStatus(
      {
        method: "DELETE",
        url: url,
      },
      userName,
      statusCode
    ).then((response) => {
      if (additionalChecks["message"] !== undefined) {
        expect(response.body.messages).to.contain(additionalChecks["message"]);
      }
    });
  }
);

Cypress.Commands.add(
  "apiRecordingCheck",
  (
    userName: string,
    recordingNameOrId: string,
    expectedRecording: ApiRecordingReturned,
    excludeCheckOn: string[] = [],
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    logTestDescription(`Check recording ${recordingNameOrId} `, {
      recordingName: recordingNameOrId,
    });

    let recordingId: string;
    if (additionalChecks["useRawRecordingId"] === true) {
      recordingId = recordingNameOrId;
    } else {
      recordingId = getCreds(recordingNameOrId).id.toString();
    }
    const url = v1ApiPath(`recordings/${recordingId}`);

    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: url,
      },
      userName,
      statusCode
    ).then((response) => {
      if (statusCode === 200) {
        expect(response.body.rawSize).to.exist;
        expect(response.body.downloadRawJWT).to.exist;
        checkTreeStructuresAreEqualExcept(
          expectedRecording,
          response.body.recording,
          excludeCheckOn
        );
      } else {
        if (additionalChecks["message"] !== undefined) {
          expect(response.body.messages).to.contain(
            additionalChecks["message"]
          );
        }
      }
    });
  }
);

Cypress.Commands.add(
  "apiRecordingAddOnBehalfUsingGroup",
  (
    userName: string,
    deviceName: string,
    groupName: string,
    data: ApiRecordingSet,
    recordingName: string,
    fileName: string = "invalid.cptv",
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    logTestDescription(
      `Upload recording on behalf using group${prettyLog(
        recordingName
      )}  to '${deviceName}'`,
      { camera: deviceName, requestData: data }
    );

    //look up device Id for this devicename unless we're asked not to
    let fullDeviceName: string;
    if (additionalChecks["useRawDeviceName"] === true) {
      fullDeviceName = deviceName;
    } else {
      fullDeviceName = getTestName(deviceName);
    }
    let fullGroupName: string;
    if (additionalChecks["useRawGroupName"] === true) {
      fullGroupName = groupName;
    } else {
      fullGroupName = getTestName(groupName);
    }

    const url = v1ApiPath(
      "recordings/device/" + fullDeviceName + "/group/" + fullGroupName
    );
    const fileType = data["type"];

    uploadFile(
      url,
      userName,
      fileName,
      fileType,
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
  "apiRecordingAddOnBehalfUsingDevice",
  (
    userName: string,
    deviceName: string,
    data: ApiRecordingSet,
    recordingName: string = "recording1",
    fileName: string = "invalid.cptv",
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    logTestDescription(
      `Upload recording on behalf using device ${prettyLog(
        recordingName
      )}  to '${deviceName}' using '${userName}'`,
      { camera: deviceName, requestData: data }
    );

    //look up device Id for this devicename unless we're asked not to
    let deviceId: string;
    if (additionalChecks["useRawDeviceName"] === true) {
      deviceId = deviceName;
    } else {
      deviceId = getCreds(deviceName).id.toString();
    }

    const url = v1ApiPath("recordings/device/" + deviceId);
    const fileType = data["type"];

    uploadFile(
      url,
      userName,
      fileName,
      fileType,
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
  "apiRecordingsQueryCheck",
  (
    userName: string,
    query: any,
    expectedRecordings: ApiRecordingReturned[] = undefined,
    excludeCheckOn: string[] = [],
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    const params = removeUndefinedParams(query);
    params["where"] = JSON.stringify(query["where"]);

    logTestDescription(
      `Query recordings where '${JSON.stringify(params["where"])}'`,
      { user: userName, params: params }
    );

    const url = v1ApiPath("recordings", params);
    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: url,
      },
      userName,
      statusCode
    ).then((response) => {
      if (statusCode === 200) {
        checkTreeStructuresAreEqualExcept(
          expectedRecordings,
          response.body.rows,
          excludeCheckOn
        );
      } else {
        if (additionalChecks["message"] !== undefined) {
          expect(response.body.messages).to.contain(
            additionalChecks["message"]
          );
        }
      }
    });
  }
);

Cypress.Commands.add(
  "apiRecordingsCountCheck",
  (
    userName: string,
    query: any,
    expectedCount: number,
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    const params = removeUndefinedParams(query);
    params["where"] = JSON.stringify(query["where"]);

    logTestDescription(
      `Query recording count where '${JSON.stringify(params["where"])}'`,
      { user: userName, params: params }
    );

    const url = v1ApiPath("recordings/count", params);
    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: url,
      },
      userName,
      statusCode
    ).then((response) => {
      if (statusCode === 200) {
        expect(response.body.count, "Recording count should be").to.equal(
          expectedCount
        );
        cy.wrap(response.body.count);
      } else {
        if (additionalChecks["message"] !== undefined) {
          expect(response.body.messages).to.contain(
            additionalChecks["message"]
          );
        }
      }
    });
  }
);

Cypress.Commands.add(
  "apiReprocess",
  (
    userName: string,
    recordingIds: number[],
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    logTestDescription(
      `Mark recordings for reprocess '${JSON.stringify(recordingIds)}'`,
      { user: userName, recordingIds: recordingIds }
    );
    const params = { recordings: recordingIds };

    const url = v1ApiPath("reprocess");
    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: url,
        body: params,
      },
      userName,
      statusCode
    ).then((response) => {
      if (additionalChecks["message"] !== undefined) {
        expect(response.body.messages).to.contain(additionalChecks["message"]);
      }
    });
  }
);

///////
type IsoFormattedDateString = string;

interface TrackData {
  start_s?: number;
  end_s?: number;
  confident_tag?: string;
  confidence?: number;
}

interface AlgorithmMetadata {
  model_name?: string;
}

interface ThermalRecordingMetaData {
  algorithm?: AlgorithmMetadata;
  tracks: TrackData[];
}

interface ThermalRecordingData {
  type: "thermalRaw";
  recordingDateTime: IsoFormattedDateString;
  duration: number;
  comment?: string;
  batteryLevel?: number;
  batteryCharging?: string;
  airplaneModeOn?: boolean;
  version?: string;
  additionalMetadata?: JSON;
  metadata?: ThermalRecordingMetaData;
  location?: number[];
  processingState?: string;
}

function makeRecordingDataFromDetails(
    details: ApiThermalRecordingInfo
): ThermalRecordingData {
  const data: ThermalRecordingData = {
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

function getDateForRecordings(details: ApiThermalRecordingInfo): Date {
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
    data: ThermalRecordingData,
    model: string,
    trackDetails?: ApiTrackInfo[],
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
    trackDetails = tags.map((tag) => ({ tag }));
  }

  if (trackDetails) {
    let count = 0;
    data.metadata.tracks = trackDetails.map((track) => {
      const tag = track.tag ? track.tag : "possum";
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
          confident_tag: "possum",
          confidence: 0.5,
        },
      ],
    });
  }
}


Cypress.Commands.add(
    "apiCheckDeviceHasRecordings",
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
