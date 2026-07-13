import { uploadFile } from "../fileUpload";
import { getTestName } from "../names";
import {
  v1ApiPath,
  getCreds,
  makeAuthorizedRequestWithStatus,
  saveIdOnly,
  saveJobKeyByName,
  checkTreeStructuresAreEqualExcept,
  removeUndefinedParams,
} from "../server";
import { logTestDescription, prettyLog } from "../descriptions";
import { ApiRecordingSet } from "../types";
import {
  ApiAudioRecordingResponse,
  ApiRecordingProcessingJob,
  ApiRecordingResponse,
  ApiThermalRecordingResponse,
} from "@typedefs/api/recording";
import {
  HttpStatusCode,
  RecordingProcessingState,
  RecordingType,
  TagMode,
} from "@typedefs/api/consts";
import { RecordingId, TrackId } from "@typedefs/api/common";
import {
  TEMPLATE_THERMAL_RECORDING,
  TEMPLATE_TRACK,
} from "@commands/dataTemplate";
import { TestCreateRecordingData } from "@commands/api/recording-tests";
import { TestGetLocationArray } from "@commands/api/station";

// 1,thermalRaw,cy_rreGroup_4b6009cc,cy_rreCamera1_4b6009cc,,2021-07-18,08:13:17,-45.29115,169.30845,15.6666666666667,,,1,cat,,,http://test.site/recording/1,,"

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /** Check the values returned by /api/fileProcessing (get)
       * specify type and processingState (state)
       * Verify that the recording data matched the expectedRecording
       * Optionally: check for a non-200 statusCode
       * Optionally: check for a returned error message (additionalChecks.message)
       */
      processingApiCheck(
        userName: string,
        type: string,
        state: string,
        recordingName: string,
        expectedRecording: unknown,
        excludeCheckOn?: string[],
        statusCode?: HttpStatusCode,
        additionalChecks?: { message?: string },
      ): Chainable<void>;

      /** Put to /api/fileProcessing 'done' endpoint
       * recordingId and jobkey is looked up using recordingName
       * other parameters are passed to the endpoint transparently
       * Optionally: check for a non-200 statusCode
       */

      processingApiPut(
        userName: string,
        recordingName: string,
        success: boolean,
        result: unknown,
        newProcessedFileKey: string,
        statusCode?: HttpStatusCode,
      ): Chainable<void>;

      /** Post to /api/fileProcessing/algorithm
       * Add or look up algorithm matching supplied JSON algorithm
       * Returns algorithmId
       */

      processingApiAlgorithmPost(
        userName: string,
        algorithm: unknown,
      ): Chainable<number>;

      /** Post to /api/fileProcessing/:id/tracks
       * recordingId is looked up using recordingName
       * other parameters are passed to the endpoint transparently
       * Optionally: check for a non-200 statusCode
       */
      processingApiTracksPost(
        userName: string,
        trackName: string,
        recordingName: string,
        data: unknown,
        algorithmId: number,
        statusCode?: HttpStatusCode,
      ): Chainable<TrackId>;

      /** Post to /api/fileProcessing/:id/tracksAndTags
       * recordingId is looked up using recordingName
       * other parameters are passed to the endpoint transparently
       * Optionally: check for a non-200 statusCode
       */
      processingApiTracksAndTagsPost(
        userName: string,
        trackName: string,
        recordingName: string,
        data: unknown[],
        algorithmId: number,
        statusCode?: HttpStatusCode,
      ): Chainable<void>;

      /** Post to /api/fileProcessing/:id/tracks/:trackId/tagsBulk
       * recordingId is looked up using recordingName
       * other parameters are passed to the endpoint transparently
       * Optionally: check for a non-200 statusCode
       */
      processingApiTracksTagsBulkPost(
        userName: string,
        trackName: string,
        recordingName: string,
        data: unknown,
        statusCode?: HttpStatusCode,
      ): Chainable<void>;

      /** Post to /api/fileProcessing/:id/tracks/:trackId/tags
       * recordingId is looked up using recordingName
       * other parameters are passed to the endpoint transparently
       * Optionally: check for a non-200 statusCode
       */
      processingApiTracksTagsPost(
        userName: string,
        trackName: string,
        recordingName: string,
        what: unknown,
        confidence: number,
        data?: object,
        statusCode?: HttpStatusCode,
      ): Chainable<void>;

      /** Delete from /api/fileProcessing/:id/tracks
       * recordingId is looked up using recordingName
       * Optionally: add additional parameters from additionalParams
       * Optionally: check for a non-200 statusCode
       */
      processingApiTracksDelete(
        userName: string,
        recordingName: string,
        statusCode?: HttpStatusCode,
      ): Chainable<void>;

      /**
       * upload a single recording to for a particular camera using deviceId and user credentials
       * Optionally, save the id against provided recordingName
       */
      apiRecordingAddOnBehalfUsingDevice(
        userName: string,
        deviceName: string,
        details: ApiRecordingSet,
        recordingName?: string,
        fileName?: string | { filename: string; key: string }[],
        statusCode?: HttpStatusCode,
        additionalChecks?: { useRawDeviceName?: boolean },
      ): Cypress.Chainable<RecordingId>;

      /**
       * upload a single recording to for a particular camera using deviceName and groupName and user credentials
       * Optionally, save the id against provided recordingName
       */
      apiRecordingAddOnBehalfUsingGroup(
        userName: string,
        deviceName: string,
        groupName: string,
        data: ApiRecordingSet,
        recordingName?: string,
        fileName?: string | { filename: string; key: string }[],
        statusCode?: HttpStatusCode,
        additionalChecks?: {
          useRawDeviceName?: boolean;
          useRawGroupName?: boolean;
          message?: string;
        },
      ): Cypress.Chainable<RecordingId>;

      /**
       * Upload a single recording using device credentials
       * Save the provided ID against the provided recording name
       * Optionally, check for a non-200 return statusCode
       */
      apiRecordingAdd(
        deviceName: string,
        data: ApiRecordingSet,
        fileName?: string | { filename: string; key: string }[],
        recordingName?: string,
        statusCode?: number,
        additionalChecks?: { message?: string },
        filenameToUse?: string,
      ): Cypress.Chainable<RecordingId>;

      /**
       * Upload a single recording with trackTags using device credentials
       * Save the provided ID against the provided recording name
       */
      apiRecordingAddWithTracks(
        deviceName: string,
        tracks?: string[][],
        recordingDateTime?: string,
        location?: [number, number],
      ): Cypress.Chainable<RecordingId>;

      /** Get a single recording response using api/v1/recordings/{id}
       */
      apiRecordingGet(
        userName: string,
        recordingNameOrId: RecordingId,
        statusCode?: HttpStatusCode,
      ): Chainable<
        Cypress.Response<{
          recording: ApiRecordingResponse;
          rawSize?: number;
          downloadRawJWT?: string;
        }>
      >;

      apiRecordingGetFile(
        userName: string,
        recordingNameOrId: RecordingId,
        statusCode?: HttpStatusCode,
      ): Chainable<Cypress.Response<Uint8Array>>;

      /** Get a single recording using api/v1/recordings/{id}
       * Verify that the recording data matched the expectedRecording
       * Optionally: check for a non-200 statusCode
       * By default function looks up the recording Id using the recordingNameOrId supplied when
       * recording was created
       * Optionally: specify recording by id (not saved name) using additionalChecks["useRawRecordingId"] === true
       */
      apiRecordingCheck(
        userName: string,
        recordingNameOrId: string,
        expectedRecording: ApiRecordingResponse,
        excludeCheckOn?: string[],
        statusCode?: HttpStatusCode,
        additionalChecks?: { useRawRecordingId?: boolean; message?: string },
      ): Chainable<void>;

      apiRecordingDownloadCheck(
        userName: string,
        recordingNameOrId: string,
      ): Chainable<void>;

      /** Update a single recording using api/v1/recordings/{id} PATCH
       * Optionally: check for a non-200 statusCode
       * By default function looks up the recording Id using the recordingNameOrId supplied when
       * recording was created
       * Optionally: specify recording by id (not saved name) using additionalChecks["useRawRecordingId"] === true
       * Optionally: check for returned messages (additionalChecks.message)
       */
      apiRecordingUpdate(
        userName: string,
        recordingNameOrId: string,
        updates: object,
        statusCode?: HttpStatusCode,
        additionalChecks?: { useRawRecordingId?: boolean; message?: string },
      ): Chainable<void>;

      /** Get thumbnail for recording using api/v1/recordings/{id}/thumbnail
       * Verify that the recording returns a file
       * Optionally: check for a non-200 statusCode
       * By default function looks up the recording Id using the recordingNameOrId supplied when
       * recording was created
       * Optionally: specify recording by id (not saved name) using additionalChecks["useRawRecordingId"] === true
       */
      apiRecordingThumbnailCheck(
        userName: string,
        recordingNameOrId: string,
        statusCode?: HttpStatusCode,
        additionalChecks?: {
          useRawRecordingId?: boolean;
          message?: string;
          type?: "PNG";
        },
        trackName?: string,
      ): Chainable<void>;

      /** Query recordings (/api/v1/recordings) using where (query["where"]) and optional (query[...]) API parameters
       * Verify that the recording data matched the expectedRecordings
       * Optionally: check for a non-200 statusCode
       * Optionally: check returned messages for additionalChecks["message"]
       */
      apiRecordingsQueryCheck(
        userName: string,
        query: {
          where: unknown;
          order?: string;
          deleted?: boolean;
          offset?: number;
          limit?: number;
          tags?: string;
          "view-mode"?: "user";
          tagMode?: TagMode;
          countAll?: boolean;
        },
        expectedRecordings?: (
          | ApiThermalRecordingResponse
          | ApiAudioRecordingResponse
        )[],
        excludeCheckOn?: string[],
        statusCode?: HttpStatusCode,
        additionalChecks?: { message?: string; count?: number },
      ): Chainable<
        Cypress.Response<{
          messages: string[];
          rows: unknown[];
          count: number;
        }>
      >;

      /** Query recordings in a project (/api/v1/recordings/for-project/) using query parameters
       * Verify that the recording data matched the expectedRecordings
       * Optionally: check for a non-200 statusCode
       * Optionally: check returned messages for additionalChecks["message"]
       */
      apiRecordingsQueryV2Check(
        userName: string,
        projectId: number,
        query: URLSearchParams,
        expectedRecordings?: (
          | ApiThermalRecordingResponse
          | ApiAudioRecordingResponse
        )[],
        excludeCheckOn?: string[],
        statusCode?: HttpStatusCode,
        additionalChecks?: {
          message?: string;
          count?: number;
          "num-results"?: number;
        },
      ): Chainable<{
        messages: string[];
        count: number;
        "num-results": number;
        recordings: ApiRecordingResponse[];
      }>;

      /** Query recordings count (/api/v1/recordings/count) using where (query["where"]) and optional (query[...]) API parameters
       * Verify that the recording data matched the expectedCount
       * Optionally: check for a non-200 statusCode
       * Optionally: check returned messages for additionalChecks["message"]
       */
      apiRecordingsCountCheck(
        userName: string,
        query: {
          where?: unknown;
          order?: string;
          offset?: number;
          limit?: number;
          deleted?: boolean;
          type?: RecordingType;
          tagMode?: TagMode;
          processingState?: RecordingProcessingState;
        },
        expectedCount: number,
        statusCode?: HttpStatusCode,
        additionalChecks?: { message?: string },
      ): Cypress.Chainable<number>;

      /** Delete a single recording using api/v1/recordings/{id} DELETE
       * Optionally: check for a non-200 statusCode
       * By default function looks up the recording Id using the recordingNameOrId supplied when
       * recording was created
       * Optionally: specify recording by id (not saved name) using additionalChecks["useRawRecordingId"] === true
       * Optionally: add additional paramaters to request (additionalChecks["additionalParams"]={...})
       */
      apiRecordingDelete(
        userName: string,
        recordingNameOrId: string,
        statusCode?: HttpStatusCode,
        additionalChecks?: {
          useRawRecordingId?: boolean;
          message?: string;
          additionalParams?: object;
        },
      ): Chainable<void>;

      /** Undelete a single recording using api/v1/recordings/{id}/undelete GET
       * Optionally: check for a non-200 statusCode
       * By default function looks up the recording Id using the recordingNameOrId supplied when
       * recording was created
       * Optionally: specify recording by id (not saved name) using additionalChecks["useRawRecordingId"] === true
       * Optionally: add additional paramaters to request (additionalChecks["additionalParams"]={...})
       */
      apiRecordingUndelete(
        userName: string,
        recordingNameOrId: string,
        statusCode?: HttpStatusCode,
        additionalChecks?: {
          useRawRecordingId?: boolean;
          message?: string;
          additionalParams?: object;
        },
      ): Chainable<void>;

      /* Delete a single recording using api/v1/recordings/{id} DELETE
       * Optionally: check for a non-200 statusCode
       * By default function looks up the recording Id using the recordingNameOrId supplied when
       * recording was created
       * Optionally: specify recording by id (not saved name) using additionalChecks["useRawRecordingId"] === true
       * Optionally: add additional parameters to request (additionalChecks["additionalParams"]={...})
       */
      apiRecordingBulkDelete(
        userName: string,
        query: { where: unknown },
        statusCode?: HttpStatusCode,
        additionalChecks?: { message?: string; count?: number },
      ): Chainable<void>;

      /* Undelete recording using api/v1/recordings/undelete PATCH
       * Optionally: check for a non-200 statusCode
       * By default function looks up the recording Id using the recordingNameOrId supplied when
       * recording was created
       * Optionally: specify recording by id (not saved name) using additionalChecks["useRawRecordingId"] === true
       * Optionally: add additional parameters to request (additionalChecks["additionalParams"]={...})
       */
      apiRecordingBulkUndelete(
        userName: string,
        recordingIds: number[],
        statusCode?: HttpStatusCode,
        additionalChecks?: { message?: string },
      ): Chainable<void>;

      /* Mark a list of recordings (recordingIds[]) for reprocessing
       * Optionally: check for a non-200 statusCode
       * Optionally: check for a returned error message (additionalChecks["message"])
       */
      apiReprocess(
        userName: string,
        recordingIds: number[],
        statusCode?: HttpStatusCode,
        additionalChecks?: { message?: string; fail?: unknown[] },
      ): Chainable<void>;
    }
  }
}

Cypress.Commands.add(
  "processingApiPut",
  (
    userName: string,
    recordingName: string,
    success: boolean,
    result: unknown,
    newProcessedFileKey: string,
    statusCode = 200,
  ) => {
    const id = getCreds(recordingName).id;
    let jobKey = getCreds(recordingName).jobKey;
    if (!jobKey) {
      jobKey = null;
    }

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
      statusCode,
    ).then((response) => {
      expect(response.status, "Check return statusCode is").to.equal(
        statusCode,
      );
    });
  },
);

Cypress.Commands.add(
  "processingApiTracksPost",
  (
    userName: string,
    trackName: string,
    recordingName: string,
    data: unknown,
    algorithmId: number,
    statusCode = 200,
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
      statusCode,
    ).then((response: Cypress.Response<{ trackId: TrackId }>) => {
      expect(response.status, "Check return statusCode is").to.equal(
        statusCode,
      );
      saveIdOnly(trackName, response.body.trackId);
    });
  },
);

Cypress.Commands.add(
  "processingApiTracksDelete",
  (userName: string, recordingName: string, statusCode = 200) => {
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
      statusCode,
    ).then((response) => {
      expect(response.status, "Check return statusCode is").to.equal(
        statusCode,
      );
    });
  },
);

Cypress.Commands.add(
  "processingApiTracksTagsBulkPost",
  (
    userName: string,
    trackName: string,
    recordingName: string,
    data: unknown,
    statusCode = 200,
  ) => {
    const id = getCreds(recordingName).id;
    const trackId = getCreds(trackName).id;
    logTestDescription(`Adding tracktags for recording ${recordingName}`, {
      id: id,
      trackId: trackId,
      data,
    });

    const url = v1ApiPath(
      "processing/" +
        id.toString() +
        "/tracks/" +
        trackId.toString() +
        "/tags-bulk",
    );
    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: url,
        body: { data: JSON.stringify(data) },
      },
      userName,
      statusCode,
    ).then((response) => {
      expect(response.status, "Check return statusCode is").to.equal(
        statusCode,
      );
    });
  },
);

Cypress.Commands.add(
  "processingApiTracksTagsPost",
  (
    userName: string,
    trackName: string,
    recordingName: string,
    what: unknown,
    confidence: number,
    data: object = {},
    statusCode = 200,
  ) => {
    const id = getCreds(recordingName).id;
    const trackId = getCreds(trackName).id;
    logTestDescription(
      `Adding tracktag '${what}' for recording ${recordingName}`,
      { id: id, trackId: trackId, what: what, confidence: confidence },
    );
    const params = {
      what: what,
      confidence: confidence,
      data: JSON.stringify(data),
    };

    const url = v1ApiPath(
      "processing/" + id.toString() + "/tracks/" + trackId.toString() + "/tags",
    );
    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: url,
        body: params,
      },
      userName,
      statusCode,
    ).then((response) => {
      expect(response.status, "Check return statusCode is").to.equal(
        statusCode,
      );
    });
  },
);

Cypress.Commands.add(
  "processingApiAlgorithmPost",
  (userName: string, algorithm: unknown) => {
    logTestDescription(
      `Getting id for algorithm ${JSON.stringify(algorithm)}`,
      {
        algorithm: algorithm,
      },
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
      200,
    ).then((response: Cypress.Response<{ algorithmId: number }>) => {
      cy.wrap(response.body.algorithmId);
    });
  },
);

Cypress.Commands.add(
  "processingApiCheck",
  (
    userName: string,
    type: string,
    state: string,
    recordingName: string,
    expectedRecording: unknown,
    excludeCheckOn: string[] = [],
    statusCode = 200,
    additionalChecks: { message?: string } = {},
  ) => {
    logTestDescription(
      `Request recording ${type}  in state '${state} for processing'`,
      { type, state },
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
      statusCode,
    ).then(
      (
        response: Cypress.Response<{
          recording: ApiRecordingProcessingJob;
          messages: string[];
        }>,
      ) => {
        if (statusCode === 200) {
          if (response.body.recording !== undefined) {
            saveJobKeyByName(recordingName, response.body.recording.jobKey);
          }
          if (expectedRecording === undefined) {
            expect(
              response.body.recording,
              "Expect response to contain no recordings",
            ).to.be.undefined;
          } else {
            expect(
              response.body.recording,
              "Expect response to contain a recording",
            ).to.exist;
          }
          checkTreeStructuresAreEqualExcept(
            expectedRecording,
            response.body.recording,
            excludeCheckOn,
          );
        } else {
          if (additionalChecks.message !== undefined) {
            expect(response.body.messages.join("|")).to.include(
              additionalChecks.message,
            );
          }
        }
      },
    );
  },
);

Cypress.Commands.add(
  "apiRecordingAdd",
  (
    deviceName: string,
    data: ApiRecordingSet,
    fileName: string | { filename: string; key: string }[] = "invalid.cptv",
    recordingName = "recording1",
    statusCode = 200,
    additionalChecks: { message?: string } = {},
    filenameToUse?: string,
  ) => {
    logTestDescription(
      `Upload recording ${recordingName}  to '${deviceName}'`,
      { camera: deviceName, requestData: data },
    );

    const url = v1ApiPath("recordings");

    if (!("fileHash" in data)) {
      data.fileHash = null;
    }
    uploadFile(
      url,
      deviceName,
      fileName,
      data.type,
      data,
      "@addRecording",
      statusCode,
      filenameToUse,
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
      if (additionalChecks.message !== undefined) {
        expect(x.messages.join("|")).to.include(additionalChecks.message);
      }
    });
  },
);

Cypress.Commands.add(
  "processingApiTracksAndTagsPost",
  (
    userName: string,
    trackName: string,
    recordingName: string,
    data: unknown[],
    algorithmId: number,
    statusCode = 200,
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

    const url = v1ApiPath(`processing/${id.toString()}/tracks-and-tags`);
    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url,
        body: params,
      },
      userName,
      statusCode,
    ).then((response: Cypress.Response<{ trackIds: TrackId[] }>) => {
      expect(response.status, "Check return statusCode is").to.equal(
        statusCode,
      );
      let i = 0;
      for (const trackId of response.body.trackIds) {
        i++;
        let name = trackName;
        if (response.body.trackIds.length > 1) {
          name = `${name}-${i}`;
        }
        saveIdOnly(name, trackId);
      }
    });
  },
);

Cypress.Commands.add(
  "apiRecordingAddWithTracks",
  (
    deviceName: string,
    tracks?: string[][],
    recordingDateTime?: string,
    location?: [number, number],
  ) => {
    const data = TestCreateRecordingData(TEMPLATE_THERMAL_RECORDING);
    data.duration = 15.6666666666667;
    data.recordingDateTime = recordingDateTime || "2021-07-17T20:13:17.248Z";
    data.location = location || TestGetLocationArray(1);
    while (data.metadata.tracks.length) {
      data.metadata.tracks.pop();
    }
    if (tracks) {
      for (const track of tracks) {
        const trackT = JSON.parse(JSON.stringify(TEMPLATE_TRACK));
        trackT.start_s = 2;
        trackT.end_s = 5;
        const prediction = trackT.predictions.pop();
        for (const tag of track) {
          const trackTag = JSON.parse(JSON.stringify(prediction));
          trackTag.confident = true;
          trackTag.tag = tag;
          trackTag.confidence = 90;
          trackT.predictions.push(trackTag);
        }
        data.metadata.tracks.push(trackT);
      }
      if (!tracks.length) {
        // If there was an empty array passed, create a track with no tags
        const trackT = JSON.parse(JSON.stringify(TEMPLATE_TRACK));
        trackT.start_s = 2;
        trackT.end_s = 5;
        trackT.predictions.pop();
        data.metadata.tracks.push(trackT);
      }
    }
    logTestDescription(`Upload recording with tracks to '${deviceName}'`, {
      camera: deviceName,
      requestData: data,
      tracks,
    });

    const url = v1ApiPath("recordings");
    uploadFile(
      url,
      deviceName,
      "invalid.cptv",
      "thermalRaw",
      data,
      "@addRecording",
      200,
    ).then((p) => {
      const response = p as unknown as { recordingId: RecordingId };
      cy.wrap(response.recordingId);
    });
  },
);

Cypress.Commands.add(
  "apiRecordingUpdate",
  (
    userName: string,
    recordingNameOrId: string,
    updates: object,
    statusCode = 200,
    additionalChecks: { useRawRecordingId?: boolean; message?: string } = {},
  ) => {
    logTestDescription(`Update recording ${recordingNameOrId}`, {
      recording: recordingNameOrId,
      updates: updates,
    });

    let recordingId: string;
    if (additionalChecks.useRawRecordingId === true) {
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
      statusCode,
    ).then((response: Cypress.Response<{ messages: string[] }>) => {
      if (additionalChecks.message !== undefined) {
        expect(response.body.messages.join("|")).to.include(
          additionalChecks.message,
        );
      }
    });
  },
);

Cypress.Commands.add(
  "apiRecordingGet",
  (userName: string, recordingId: RecordingId, statusCode = 200) => {
    const url = v1ApiPath(`recordings/${recordingId}`);
    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url,
      },
      userName,
      statusCode,
    ).then(
      (response: Cypress.Response<{ recording: ApiRecordingResponse }>) => {
        cy.wrap(response);
      },
    );
  },
);

Cypress.Commands.add(
  "apiRecordingGetFile",
  (userName: string, recordingId: RecordingId, statusCode = 200) => {
    const url = v1ApiPath(`recordings/raw/${recordingId}`);
    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url,
        encoding: null,
      },
      userName,
      statusCode,
    ).then((response: Cypress.Response<Uint8Array>) => {
      cy.wrap(response);
    });
  },
);

Cypress.Commands.add(
  "apiRecordingDelete",
  (
    userName: string,
    recordingNameOrId: string,
    statusCode = 200,
    additionalChecks: {
      useRawRecordingId?: boolean;
      message?: string;
      additionalParams?: object;
    } = {},
  ) => {
    const additionalParams = additionalChecks.additionalParams;
    logTestDescription(`Delete recording ${recordingNameOrId} `, {
      recordingName: recordingNameOrId,
    });

    let recordingId: string;
    if (additionalChecks.useRawRecordingId === true) {
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
      statusCode,
    ).then((response: Cypress.Response<{ messages: string[] }>) => {
      if (additionalChecks.message !== undefined) {
        expect(response.body.messages.join("|")).to.include(
          additionalChecks.message,
        );
      }
    });
  },
);

Cypress.Commands.add(
  "apiRecordingUndelete",
  (
    userName: string,
    recordingNameOrId: string,
    statusCode = 200,
    additionalChecks: {
      useRawRecordingId?: boolean;
      message?: string;
      additionalParams?: object;
    } = {},
  ) => {
    const additionalParams = additionalChecks.additionalParams;
    logTestDescription(`Undelete recording ${recordingNameOrId} `, {
      recordingName: recordingNameOrId,
    });

    let recordingId: string;
    if (additionalChecks.useRawRecordingId === true) {
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
      statusCode,
    ).then((response: Cypress.Response<{ messages: string[] }>) => {
      if (additionalChecks.message !== undefined) {
        expect(response.body.messages.join("|")).to.include(
          additionalChecks.message,
        );
      }
    });
  },
);

Cypress.Commands.add(
  "apiRecordingBulkDelete",
  (
    userName: string,
    query: { where: unknown },
    statusCode = 200,
    additionalChecks: { message?: string; count?: number } = {},
  ) => {
    const params = removeUndefinedParams(query);
    params["where"] = JSON.stringify(query["where"]);

    logTestDescription(
      `Query recordings where '${JSON.stringify(params["where"])}'`,
      { user: userName, params: params },
    );

    const url = v1ApiPath("recordings", params);
    makeAuthorizedRequestWithStatus(
      {
        method: "DELETE",
        url: url,
      },
      userName,
      statusCode,
    ).then(
      (response: Cypress.Response<{ messages: string[]; count: number }>) => {
        if (additionalChecks.message !== undefined) {
          expect(response.body.messages.join("|")).to.include(
            additionalChecks.message,
          );
        }
        if (additionalChecks.count !== undefined) {
          expect(response.body.count, "Count should be: ").to.equal(
            additionalChecks.count,
          );
        }
      },
    );
  },
);

Cypress.Commands.add(
  "apiRecordingBulkUndelete",
  (
    userName: string,
    recordingIds: number[],
    statusCode = 200,
    additionalChecks: { message?: string } = {},
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
      statusCode,
    ).then((response: Cypress.Response<{ messages: string[] }>) => {
      if (additionalChecks.message !== undefined) {
        expect(response.body.messages.join("|")).to.include(
          additionalChecks.message,
        );
      }
    });
  },
);

Cypress.Commands.add(
  "apiRecordingDownloadCheck",
  (userName: string, recordingNameOrId: string) => {
    logTestDescription(
      `Check downloaded recording hash for ${recordingNameOrId} `,
      {
        recordingName: recordingNameOrId,
      },
    );
    const recordingId: RecordingId = getCreds(recordingNameOrId).id;
    cy.apiRecordingGet(userName, recordingId as RecordingId, 200).then(
      (response) => {
        expect(response.body.rawSize).to.exist;
        expect(response.body.downloadRawJWT).to.exist;
        const rawSize = response.body.rawSize;
        cy.apiRecordingGetFile(userName, recordingId as RecordingId).then(
          (response) => {
            expect(response.body.byteLength).to.equal(rawSize);
          },
        );
      },
    );
  },
);

Cypress.Commands.add(
  "apiRecordingCheck",
  (
    userName: string,
    recordingNameOrId: string,
    expectedRecording: ApiRecordingResponse,
    excludeCheckOn: string[] = [],
    statusCode = 200,
    additionalChecks: { useRawRecordingId?: boolean; message?: string } = {},
  ) => {
    logTestDescription(`Check recording ${recordingNameOrId} `, {
      recordingName: recordingNameOrId,
    });

    let recordingId: RecordingId;
    if (additionalChecks.useRawRecordingId === true) {
      recordingId = recordingNameOrId as unknown as RecordingId;
    } else {
      recordingId = getCreds(recordingNameOrId).id;
    }
    cy.apiRecordingGet(userName, recordingId as RecordingId, statusCode).then(
      (
        response: Cypress.Response<{
          rawSize?: number;
          downloadRawJWT?: string;
          recording: ApiRecordingResponse;
          messages: string[];
        }>,
      ) => {
        if (statusCode === 200) {
          if (
            response.body.recording.processingState !==
            RecordingProcessingState.Corrupt
          ) {
            expect(response.body.rawSize, "rawSize").to.exist;
            expect(response.body.downloadRawJWT).to.exist;
          }
          checkTreeStructuresAreEqualExcept(
            expectedRecording,
            response.body.recording,
            [
              ...excludeCheckOn,
              ".tracks[].tags[].createdAt",
              ".tracks[].tags[].updatedAt",
            ],
          );
        } else {
          if (additionalChecks.message !== undefined) {
            expect(response.body.messages.join("|")).to.include(
              additionalChecks.message,
            );
          }
        }
      },
    );
  },
);

Cypress.Commands.add(
  "apiRecordingThumbnailCheck",
  (
    userName: string,
    recordingNameOrId: string,
    statusCode = 200,
    additionalChecks: {
      useRawRecordingId?: boolean;
      message?: string;
      type?: "PNG";
    } = {},
    trackName?: string,
  ) => {
    logTestDescription(
      `Check thumbnail for recording ${recordingNameOrId} and trackId ${trackName}`,
      {
        recordingName: recordingNameOrId,
      },
    );

    let recordingId: string;
    if (additionalChecks.useRawRecordingId === true) {
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
      statusCode,
    ).then((response: Cypress.Response<{ messages?: string[] } | string>) => {
      if (statusCode === 200) {
        expect(
          (response.body as string).length,
          "Returned file has length>0",
        ).to.be.gt(0);
        if (additionalChecks.type === "PNG") {
          expect(
            (response.body as string).slice(1, 4),
            "Expect PNG file signature",
          ).to.equal("PNG");
        }
      } else {
        if (additionalChecks.message !== undefined) {
          expect(
            (response.body as { messages: string[] }).messages.join("|"),
          ).to.include(additionalChecks.message);
        }
      }
    });
  },
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
    statusCode = 200,
    additionalChecks: {
      useRawDeviceName?: boolean;
      useRawGroupName?: boolean;
      message?: string;
    } = {},
  ) => {
    logTestDescription(
      `Upload recording on behalf using group${prettyLog(
        recordingName,
      )}  to '${deviceName}'`,
      { camera: deviceName, requestData: data },
    );

    //look up device Id for this deviceName unless we're asked not to
    let fullDeviceName: string;
    if (additionalChecks.useRawDeviceName === true) {
      fullDeviceName = deviceName;
    } else {
      fullDeviceName = getTestName(deviceName);
    }
    let fullGroupName: string;
    if (additionalChecks.useRawGroupName === true) {
      fullGroupName = groupName;
    } else {
      fullGroupName = getTestName(groupName);
    }

    const url = v1ApiPath(
      "recordings/device/" + fullDeviceName + "/group/" + fullGroupName,
    );
    const fileType = data["type"];

    uploadFile(
      url,
      userName,
      fileName,
      fileType,
      data,
      "@addRecording",
      statusCode,
    ).then((p) => {
      const x = p as unknown as { recordingId: RecordingId };
      cy.wrap(x.recordingId);
      if (recordingName !== null) {
        saveIdOnly(recordingName, x.recordingId);
      }
    });
  },
);

Cypress.Commands.add(
  "apiRecordingAddOnBehalfUsingDevice",
  (
    userName: string,
    deviceName: string,
    data: ApiRecordingSet,
    recordingName = "recording1",
    fileName: string | { filename: string; key: string }[] = "invalid.cptv",
    statusCode = 200,
    additionalChecks: { useRawDeviceName?: boolean } = {},
  ) => {
    logTestDescription(
      `Upload recording on behalf using device ${prettyLog(
        recordingName,
      )}  to '${deviceName}' using '${userName}'`,
      { camera: deviceName, requestData: data },
    );

    //look up device Id for this deviceName unless we're asked not to
    let deviceId: string;
    if (additionalChecks.useRawDeviceName === true) {
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
      statusCode,
    ).then((p) => {
      const x = p as unknown as { recordingId: RecordingId };
      cy.wrap(x.recordingId);
      if (recordingName !== null) {
        saveIdOnly(recordingName, x.recordingId);
      }
    });
  },
);

Cypress.Commands.add(
  "apiRecordingsQueryCheck",
  (
    userName: string,
    query: { where: unknown; order?: string; deleted?: boolean },
    expectedRecordings: (
      | ApiAudioRecordingResponse
      | ApiThermalRecordingResponse
    )[] = undefined,
    excludeCheckOn: string[] = [],
    statusCode = 200,
    additionalChecks: { message?: string; count?: number } = {},
  ) => {
    const params = removeUndefinedParams(query);
    params.where = JSON.stringify(query.where);

    logTestDescription(
      `Query recordings where '${JSON.stringify(params.where)}'`,
      { user: userName, params: params, expected: expectedRecordings },
    );

    const url = v1ApiPath("recordings", params);
    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: url,
      },
      userName,
      statusCode,
    ).then(
      (
        response: Cypress.Response<{
          messages: string[];
          rows: unknown[];
          count: number;
        }>,
      ) => {
        if (statusCode === 200) {
          checkTreeStructuresAreEqualExcept(
            expectedRecordings,
            response.body.rows,
            excludeCheckOn,
          );
        }
        if (additionalChecks.message !== undefined) {
          expect(response.body.messages.join("|")).to.include(
            additionalChecks.message,
          );
        }
        if (additionalChecks.count !== undefined) {
          expect(response.body.count, "Count should be: ").to.equal(
            additionalChecks.count,
          );
        }
        cy.wrap(response.body.rows);
      },
    );
  },
);

Cypress.Commands.add(
  "apiRecordingsQueryV2Check",
  (
    userName: string,
    projectId: number,
    query: URLSearchParams,
    expectedRecordings: (
      | ApiAudioRecordingResponse
      | ApiThermalRecordingResponse
    )[] = undefined,
    excludeCheckOn: string[] = [],
    statusCode = 200,
    additionalChecks: {
      message?: string;
      count?: number;
      "num-results"?: number;
    } = {},
  ) => {
    logTestDescription(`Query recordings where '${query}'`, {
      user: userName,
      params: query,
      expected: expectedRecordings,
    });

    const url = `${v1ApiPath(`recordings/for-project/${projectId}`)}?${query}`;
    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: url,
      },
      userName,
      statusCode,
    ).then(
      (
        response: Cypress.Response<{
          messages: string[];
          count: number;
          "num-results": number;
          recordings: ApiRecordingResponse[];
        }>,
      ) => {
        if (
          statusCode === 200 &&
          expectedRecordings &&
          expectedRecordings.length
        ) {
          checkTreeStructuresAreEqualExcept(
            expectedRecordings,
            response.body.recordings,
            excludeCheckOn,
          );
        }
        if (additionalChecks.message !== undefined) {
          expect(response.body.messages.join("|")).to.include(
            additionalChecks.message,
          );
        }
        if (additionalChecks.count !== undefined) {
          expect(response.body.count, "Count should be: ").to.equal(
            additionalChecks.count,
          );
        }
        if (additionalChecks["num-results"] !== undefined) {
          expect(
            response.body.recordings.length,
            "Num results should be: ",
          ).to.equal(additionalChecks["num-results"]);
        }
        cy.wrap(response.body);
      },
    );
  },
);

Cypress.Commands.add(
  "apiRecordingsCountCheck",
  (
    userName: string,
    query: { where: unknown },
    expectedCount: number,
    statusCode = 200,
    additionalChecks: { message?: string } = {},
  ) => {
    const params = removeUndefinedParams(query);
    if (query.where) {
      params["where"] = JSON.stringify(query.where);
    }

    logTestDescription(
      `Query recording count where '${JSON.stringify(params["where"])}'`,
      { user: userName, params: params },
    );

    const url = v1ApiPath("recordings/count", params);
    makeAuthorizedRequestWithStatus(
      {
        method: "GET",
        url: url,
      },
      userName,
      statusCode,
    ).then(
      (response: Cypress.Response<{ messages: string[]; count: number }>) => {
        if (statusCode === 200) {
          if (expectedCount !== undefined) {
            expect(response.body.count, "Recording count should be").to.equal(
              expectedCount,
            );
          }
          cy.wrap(response.body.count);
        } else {
          if (additionalChecks.message !== undefined) {
            expect(response.body.messages.join("|")).to.include(
              additionalChecks.message,
            );
          }
        }
      },
    );
  },
);

Cypress.Commands.add(
  "apiReprocess",
  (
    userName: string,
    recordingIds: number[],
    statusCode = 200,
    additionalChecks: { message?: string; fail?: unknown[] } = {},
  ) => {
    logTestDescription(
      `Mark recordings for reprocess '${JSON.stringify(recordingIds)}'`,
      { user: userName, recordingIds: recordingIds },
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
      statusCode,
    ).then(
      (response: Cypress.Response<{ messages: string[]; fail: unknown[] }>) => {
        if (additionalChecks.message !== undefined) {
          expect(response.body.messages.join("|")).to.include(
            additionalChecks.message,
          );
        }
        if (additionalChecks.fail !== undefined) {
          expect(
            response.body.fail.length,
            "Number of fail expected to be",
          ).to.equal(additionalChecks.fail.length);
          additionalChecks.fail.forEach((fail) => {
            expect(response.body.fail).to.contain(fail);
          });
        }
      },
    );
  },
);
