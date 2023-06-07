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
  saveJobKeyByName,
  checkTreeStructuresAreEqualExcept,
  removeUndefinedParams,
  saveJWTByName,
} from "../server";
import { logTestDescription, prettyLog } from "../descriptions";
import {
  ApiRecordingSet,
  ApiRecordingNeedsTagReturned,
  ApiRecordingColumns,
} from "../types";
import { ApiRecordingColumnNames } from "../constants";
import {
  ApiAudioRecordingResponse,
  ApiRecordingResponse,
  ApiThermalRecordingResponse,
} from "@typedefs/api/recording";
import { HttpStatusCode } from "@typedefs/api/consts";
import { RecordingId } from "@typedefs/api/common";

// 1,thermalRaw,cy_rreGroup_4b6009cc,cy_rreCamera1_4b6009cc,,2021-07-18,08:13:17,-45.29115,169.30845,15.6666666666667,,,1,cat,,,http://test.site/recording/1,,"

Cypress.Commands.add(
  "processingApiPut",
  (
    userName: string,
    recordingName: string,
    success: boolean,
    result: any,
    newProcessedFileKey: string,
    statusCode: number = 200
  ) => {
    const id = getCreds(recordingName).id;
    const jobKey = getCreds(recordingName).jobKey;
    logTestDescription(`Processing 'done' for recording ${recordingName}`, {
      id,
      result,
    });
    const params = {
      id,
      jobKey,
      success,
      result: JSON.stringify(result),
      newProcessedFileKey: newProcessedFileKey,
    };

    const url = v1ApiPath("processing");
    makeAuthorizedRequestWithStatus(
      {
        method: "PUT",
        url,
        body: params,
      },
      userName,
      statusCode
    ).then((response) => {
      expect(response.status, "Check return statusCode is").to.equal(
        statusCode
      );
    });
  }
);

Cypress.Commands.add(
  "processingApiTracksPost",
  (
    userName: string,
    trackName: string,
    recordingName: string,
    data: any,
    algorithmId: number,
    statusCode: number = 200
  ) => {
    const id = getCreds(recordingName).id;
    logTestDescription(`Adding tracks for recording ${recordingName}`, {
      id,
      data,
      algorithmId: algorithmId,
    });
    const params = {
      data,
      algorithmId: algorithmId,
    };

    const url = v1ApiPath(`processing/${id.toString()}/tracks`);
    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url,
        body: params,
      },
      userName,
      statusCode
    ).then((response) => {
      expect(response.status, "Check return statusCode is").to.equal(
        statusCode
      );
      saveIdOnly(trackName, response.body.trackId);
    });
  }
);

Cypress.Commands.add(
  "processingApiTracksDelete",
  (userName: string, recordingName: string, statusCode: number = 200) => {
    const id = getCreds(recordingName).id;
    logTestDescription(`Deleting tracks from recording ${recordingName}`, {
      id: id,
    });
    const params = {};
    const url = v1ApiPath(`processing/${id.toString()}/tracks`);
    makeAuthorizedRequestWithStatus(
      {
        method: "DELETE",
        url: url,
        body: params,
      },
      userName,
      statusCode
    ).then((response) => {
      expect(response.status, "Check return statusCode is").to.equal(
        statusCode
      );
    });
  }
);

Cypress.Commands.add(
  "processingApiTracksTagsPost",
  (
    userName: string,
    trackName: string,
    recordingName: string,
    what: any,
    confidence: number,
    data: any = {},
    statusCode: number = 200
  ) => {
    const id = getCreds(recordingName).id;
    const trackId = getCreds(trackName).id;
    logTestDescription(
      `Adding tracktag '${what}' for recording ${recordingName}`,
      { id: id, trackId: trackId, what: what, confidence: confidence }
    );
    const params = {
      what: what,
      confidence: confidence,
      data: JSON.stringify(data),
    };

    const url = v1ApiPath(
      "processing/" + id.toString() + "/tracks/" + trackId.toString() + "/tags"
    );
    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: url,
        body: params,
      },
      userName,
      statusCode
    ).then((response) => {
      expect(response.status, "Check return statusCode is").to.equal(
        statusCode
      );
    });
  }
);

Cypress.Commands.add(
  "processingApiAlgorithmPost",
  (userName: string, algorithm: any) => {
    logTestDescription(
      `Getting id for algorithm ${JSON.stringify(algorithm)}`,
      {
        algorithm: algorithm,
      }
    );
    const params = {
      algorithm: JSON.stringify(algorithm),
    };

    const url = v1ApiPath("processing/algorithm");
    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: url,
        body: params,
      },
      userName,
      200
    ).then((response) => {
      cy.wrap(response.body.algorithmId);
    });
  }
);

Cypress.Commands.add(
  "processingApiCheck",
  (
    userName: string,
    type: string,
    state: string,
    recordingName: string,
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
    const url = v1ApiPath("processing", params);
    cy.log(`URL: ${url}`);
    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: url,
      },
      userName,
      statusCode
    ).then((response) => {
      if (statusCode === 200) {
        if (response.body.recording !== undefined) {
          saveJobKeyByName(recordingName, response.body.recording.jobKey);
        }
        if (expectedRecording === undefined) {
          expect(
            response.body.recording,
            "Expect response to contain no recordings"
          ).to.be.undefined;
        } else {
          expect(
            response.body.recording,
            "Expect response to contain a recording"
          ).to.exist;
        }
        checkTreeStructuresAreEqualExcept(
          expectedRecording,
          response.body.recording,
          excludeCheckOn
        );
      } else {
        if (additionalChecks["message"] !== undefined) {
          expect(response.body.messages.join("|")).to.include(
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
    fileName: string | { filename: string; key: string }[] = "invalid.cptv",
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
      data.type,
      data,
      "@addRecording",
      statusCode
    ).then((p) => {
      const x = p as unknown as {
        recordingId: RecordingId;
        statusCode: HttpStatusCode;
        messages: string[];
      };
      cy.wrap(x.recordingId);
      if (recordingName !== null && statusCode === HttpStatusCode.Ok) {
        saveIdOnly(recordingName, x.recordingId);
      }
      if (additionalChecks["message"] !== undefined) {
        expect(x.messages.join("|")).to.include(additionalChecks["message"]);
      }
    });
  }
);

Cypress.Commands.add(
  "apiRecordingUpdate",
  (
    userName: string,
    recordingNameOrId: string,
    updates: any,
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    logTestDescription(`Update recording ${recordingNameOrId}`, {
      recording: recordingNameOrId,
      updates: updates,
    });

    let recordingId: string;
    if (additionalChecks["useRawRecordingId"] === true) {
      recordingId = recordingNameOrId;
    } else {
      recordingId = getCreds(recordingNameOrId).id.toString();
    }

    const url = v1ApiPath(`recordings/${recordingId}`);

    const params = {
      updates: JSON.stringify(updates),
    };

    makeAuthorizedRequestWithStatus(
      {
        method: "PATCH",
        url: url,
        body: params,
      },
      userName,
      statusCode
    ).then((response) => {
      if (additionalChecks["message"] !== undefined) {
        expect(response.body.messages.join("|")).to.include(
          additionalChecks["message"]
        );
      }
    });
  }
);

Cypress.Commands.add(
  "apiRecordingGet",
  (userName: string, recordingId: RecordingId, statusCode: number = 200) => {
    const url = v1ApiPath(`recordings/${recordingId}`);
    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url,
      },
      userName,
      statusCode
    ).then((response) => {
      cy.wrap(response);
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
    const additionalParams = additionalChecks["additionalParams"];
    logTestDescription(`Delete recording ${recordingNameOrId} `, {
      recordingName: recordingNameOrId,
    });

    let recordingId: string;
    if (additionalChecks["useRawRecordingId"] === true) {
      recordingId = recordingNameOrId;
    } else {
      recordingId = getCreds(recordingNameOrId).id.toString();
    }
    const url = v1ApiPath(`recordings/${recordingId}`, additionalParams);

    makeAuthorizedRequestWithStatus(
      {
        method: "DELETE",
        url: url,
      },
      userName,
      statusCode
    ).then((response) => {
      if (additionalChecks["message"] !== undefined) {
        expect(response.body.messages.join("|")).to.include(
          additionalChecks["message"]
        );
      }
    });
  }
);

Cypress.Commands.add(
  "apiRecordingUndelete",
  (
    userName: string,
    recordingNameOrId: string,
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    const additionalParams = additionalChecks["additionalParams"];
    logTestDescription(`Undelete recording ${recordingNameOrId} `, {
      recordingName: recordingNameOrId,
    });

    let recordingId: string;
    if (additionalChecks["useRawRecordingId"] === true) {
      recordingId = recordingNameOrId;
    } else {
      recordingId = getCreds(recordingNameOrId).id.toString();
    }
    const url = v1ApiPath(`recordings/${recordingId}/undelete`);

    makeAuthorizedRequestWithStatus(
      {
        method: "PATCH",
        url: url,
        body: additionalParams,
      },
      userName,
      statusCode
    ).then((response) => {
      if (additionalChecks["message"] !== undefined) {
        expect(response.body.messages.join("|")).to.include(
          additionalChecks["message"]
        );
      }
    });
  }
);

Cypress.Commands.add(
  "apiRecordingBulkDelete",
  (
    userName: string,
    query: any,
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
        method: "DELETE",
        url: url,
      },
      userName,
      statusCode
    ).then((response) => {
      if (additionalChecks["message"] !== undefined) {
        expect(response.body.messages.join("|")).to.include(
          additionalChecks["message"]
        );
      }
      if (additionalChecks["count"] !== undefined) {
        expect(response.body.count, "Count should be: ").to.equal(
          additionalChecks["count"]
        );
      }
    });
  }
);

Cypress.Commands.add(
  "apiRecordingBulkUndelete",
  (
    userName: string,
    recordingIds: number[],
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    logTestDescription(`Undelete recordings: ${recordingIds} `, {
      ids: recordingIds,
    });
    const url = v1ApiPath(`recordings/undelete`);

    makeAuthorizedRequestWithStatus(
      {
        method: "patch",
        url: url,
        body: { ids: recordingIds },
      },
      userName,
      statusCode
    ).then((response) => {
      if (additionalChecks["message"] !== undefined) {
        expect(response.body.messages.join("|")).to.include(
          additionalChecks["message"]
        );
      }
    });
  }
);

Cypress.Commands.add(
  "apiRecordingCheck",
  (
    userName: string,
    recordingNameOrId: string,
    expectedRecording: ApiRecordingResponse,
    excludeCheckOn: string[] = [],
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    logTestDescription(`Check recording ${recordingNameOrId} `, {
      recordingName: recordingNameOrId,
    });

    let recordingId: RecordingId;
    if (additionalChecks["useRawRecordingId"] === true) {
      recordingId = recordingNameOrId as unknown as RecordingId;
    } else {
      recordingId = getCreds(recordingNameOrId).id;
    }
    cy.apiRecordingGet(userName, recordingId as RecordingId, statusCode).then(
      (response) => {
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
            expect(response.body.messages.join("|")).to.include(
              additionalChecks["message"]
            );
          }
        }
      }
    );
  }
);

Cypress.Commands.add(
  "apiRecordingNeedsTagCheck",
  (
    userName: string,
    deviceNameOrId: string,
    recordingName: string,
    expectedRecordings: ApiRecordingNeedsTagReturned[],
    excludeCheckOn: string[] = [],
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    logTestDescription(
      `Check recording needs-tag, biased to ${deviceNameOrId} `,
      {
        device: deviceNameOrId,
      }
    );

    let params: any = {};
    if (deviceNameOrId !== undefined) {
      if (additionalChecks["useRawDeviceId"] === true) {
        params = { deviceId: deviceNameOrId };
      } else {
        params = { deviceId: getCreds(deviceNameOrId).id.toString() };
      }
    }
    const url = v1ApiPath(`recordings/needs-tag`, params);

    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: url,
      },
      userName,
      statusCode
    ).then((response) => {
      let expectedRecording: ApiRecordingNeedsTagReturned;
      if (statusCode === 200) {
        if (expectedRecordings.length > 0) {
          //Store the tagJWT against the recordingName so we can tag later
          if (recordingName !== null) {
            saveIdOnly(recordingName, response.body.rows[0].RecordingId);
            saveJWTByName(recordingName, response.body.rows[0].tagJWT);
          }

          if (additionalChecks["doNotValidate"] != true) {
            //find returned recording in expectedRecordings
            let recordingIds = "";
            expectedRecordings.forEach((recording) => {
              recordingIds =
                recordingIds + recording.RecordingId.toString() + ", ";
              if (recording.RecordingId == response.body.rows[0].RecordingId) {
                expectedRecording = recording;
              }
            });
            expect(
              expectedRecording,
              `Recording ID ${response.body.rows[0].RecordingId} should be in list (${recordingIds})`
            ).to.exist;

            //Verify result matches expected
            checkTreeStructuresAreEqualExcept(
              expectedRecording,
              response.body.rows[0],
              excludeCheckOn
            );
          }
        } else {
          //TODO: Issue 100 workaround. Remove when fixed
          //expect(response.body.rows.length,"Expect no returned recordings").to.equal(0);
          expect(
            response.body.rows[0].RecordingId,
            "Expect dummy recording with id of 0"
          ).to.equal(0);
        }
      } else {
        if (additionalChecks["message"] !== undefined) {
          expect(response.body.messages.join("|")).to.include(
            additionalChecks["message"]
          );
        }
      }
    });
  }
);

Cypress.Commands.add(
  "apiRecordingThumbnailCheck",
  (
    userName: string,
    recordingNameOrId: string,
    statusCode: number = 200,
    additionalChecks: any = {},
    trackName?: string
  ) => {
    logTestDescription(
      `Check thumbnail for recording ${recordingNameOrId} and trackId ${trackName}`,
      {
        recordingName: recordingNameOrId,
      }
    );

    let recordingId: string;
    if (additionalChecks["useRawRecordingId"] === true) {
      recordingId = recordingNameOrId;
    } else {
      recordingId = getCreds(recordingNameOrId).id.toString();
    }

    let url = v1ApiPath(`recordings/${recordingId}/thumbnail`);
    if (trackName) {
      const trackId = getCreds(trackName).id.toString();
      url = `${url}/?trackId=${trackId}`;
    }

    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: url,
      },
      userName,
      statusCode
    ).then((response) => {
      if (statusCode === 200) {
        expect(response.body.length, "Returned file has length>0").to.be.gt(0);
        if (additionalChecks["type"] == "PNG") {
          expect(
            response.body.slice(1, 4),
            "Expect PNG file signature"
          ).to.equal("PNG");
        }
      } else {
        if (additionalChecks["message"] !== undefined) {
          expect(response.body.messages.join("|")).to.include(
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
    fileName: string | { filename: string; key: string }[] = "invalid.cptv",
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    logTestDescription(
      `Upload recording on behalf using group${prettyLog(
        recordingName
      )}  to '${deviceName}'`,
      { camera: deviceName, requestData: data }
    );

    //look up device Id for this deviceName unless we're asked not to
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
    ).then((p) => {
      const x = p as unknown as { recordingId: RecordingId };
      cy.wrap(x.recordingId);
      if (recordingName !== null) {
        saveIdOnly(recordingName, x.recordingId);
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
    fileName: string | { filename: string; key: string }[] = "invalid.cptv",
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    logTestDescription(
      `Upload recording on behalf using device ${prettyLog(
        recordingName
      )}  to '${deviceName}' using '${userName}'`,
      { camera: deviceName, requestData: data }
    );

    //look up device Id for this deviceName unless we're asked not to
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
    ).then((p) => {
      const x = p as unknown as { recordingId: RecordingId };
      cy.wrap(x.recordingId);
      if (recordingName !== null) {
        saveIdOnly(recordingName, x.recordingId);
      }
    });
  }
);

Cypress.Commands.add(
  "apiRecordingsQueryCheck",
  (
    userName: string,
    query: any,
    expectedRecordings: (
      | ApiAudioRecordingResponse
      | ApiThermalRecordingResponse
    )[] = undefined,
    excludeCheckOn: string[] = [],
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    const params = removeUndefinedParams(query);
    params["where"] = JSON.stringify(query["where"]);

    logTestDescription(
      `Query recordings where '${JSON.stringify(params["where"])}'`,
      { user: userName, params: params, expected: expectedRecordings }
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
      }
      if (additionalChecks["message"] !== undefined) {
        expect(response.body.messages.join("|")).to.include(
          additionalChecks["message"]
        );
      }
      if (additionalChecks["count"] !== undefined) {
        expect(response.body.count, "Count should be: ").to.equal(
          additionalChecks["count"]
        );
      }
    });
  }
);

Cypress.Commands.add(
  "apiRecordingsReportCheck",
  (
    userName: string,
    query: any,
    expectedResults: ApiRecordingColumns[] = [],
    excludeCheckOn: string[] = [],
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    const params = removeUndefinedParams(query);
    params["where"] = JSON.stringify(query["where"]);

    logTestDescription(
      `Generate report for recordings where '${JSON.stringify(
        params["where"]
      )}'`,
      { user: userName, params: params }
    );

    const url = v1ApiPath("recordings/report", params);
    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: url,
      },
      userName,
      statusCode
    ).then((response) => {
      if (statusCode === 200) {
        const allrows = response.body.split(/\r?\n/);
        const columns = allrows[0].split(",");
        const rows = allrows.slice(1);

        expect(JSON.stringify(columns), "CSV columns match expected").to.equal(
          JSON.stringify(ApiRecordingColumnNames)
        );

        expect(
          rows.length,
          `Expect ${expectedResults.length} results to be returned`
        ).to.equal(expectedResults.length);

        for (let count = 0; count < expectedResults.length; count++) {
          const columns = rows[count].split(",");
          for (
            let column = 0;
            column < ApiRecordingColumnNames.length;
            column++
          ) {
            if (excludeCheckOn.indexOf(ApiRecordingColumnNames[column]) == -1) {
              expect(
                columns[column],
                `Row ${count}, ${ApiRecordingColumnNames[column]} should be`
              ).to.equal(
                expectedResults[count][ApiRecordingColumnNames[column]]
              );
            }
          }
        }
      } else {
        if (additionalChecks["message"] !== undefined) {
          expect(response.body.messages.join("|")).to.include(
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
    if (query["where"]) {
      params["where"] = JSON.stringify(query["where"]);
    }

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
        if (expectedCount !== undefined) {
          expect(response.body.count, "Recording count should be").to.equal(
            expectedCount
          );
        }
        cy.wrap(response.body.count);
      } else {
        if (additionalChecks["message"] !== undefined) {
          expect(response.body.messages.join("|")).to.include(
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
        expect(response.body.messages.join("|")).to.include(
          additionalChecks["message"]
        );
      }
      if (additionalChecks["fail"] !== undefined) {
        expect(
          response.body.fail.length,
          "Number of fail expected to be"
        ).to.equal(additionalChecks["fail"].length);
        additionalChecks["fail"].forEach((fail: any) => {
          expect(response.body.fail).to.contain(fail);
        });
      }
    });
  }
);
