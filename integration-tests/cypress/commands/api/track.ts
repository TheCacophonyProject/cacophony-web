// load the global Cypress types
/// <reference types="cypress" />

import {
  v1ApiPath,
  getCreds,
  makeAuthorizedRequestWithStatus,
  checkTreeStructuresAreEqualExcept,
  saveIdOnly
} from "../server";
import { logTestDescription } from "../descriptions";
import { ApiTrackDataRequest, ApiTrackResponse } from "@typedefs/api/track";

Cypress.Commands.add(
  "apiTrackAdd",
  (
    userName: string,
    recordingNameOrId: string = "recording1",
    trackName: string,
    algorithmName: string,
    data: ApiTrackDataRequest,
    algorithm: any,
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    logTestDescription(
      `Adding track to recording ${recordingNameOrId}`,
      { recording: recordingNameOrId, requestData: data }
    );

    let recordingId: string;
    if (additionalChecks["useRawRecordingId"] === true) {
      recordingId = recordingNameOrId;
    } else {
      recordingId = getCreds(recordingNameOrId).id.toString();
    }

    const url = v1ApiPath(`recordings/${recordingId}/tracks`);

    const params = {
         data: JSON.stringify(data),
         algorithm: JSON.stringify(algorithm),
    };

    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: url,
        body: params,
       },
      userName,
      statusCode
    ).then((response) => {
      if(statusCode==200) {
        if (trackName !== null) {
          saveIdOnly(trackName, response.body.trackId);
        }
        if (algorithmName !== null) {
          saveIdOnly(algorithmName, response.body.algorithmId);
        }
      }

      if (additionalChecks["message"] !== undefined) {
        expect(response.body.messages).to.contain(additionalChecks["message"]);
      }
    });
  }
);

Cypress.Commands.add(
  "apiTrackDelete",
  (
    userName: string,
    recordingNameOrId: string,
    trackNameOrId: string,
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    logTestDescription(`Delete track from recording ${recordingNameOrId} `, {
      recordingName: recordingNameOrId, trackName: trackNameOrId
    });

    let recordingId: string;
    if (additionalChecks["useRawRecordingId"] === true) {
      recordingId = recordingNameOrId;
    } else {
      recordingId = getCreds(recordingNameOrId).id.toString();
    }

    let trackId: string;
    if (additionalChecks["useRawTrackId"] === true) {
      trackId = trackNameOrId;
    } else {
      trackId = getCreds(trackNameOrId).id.toString();
    }

    const url = v1ApiPath(`recordings/${recordingId}/tracks/${trackId}`);

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
  "apiTrackCheck",
  (
    userName: string,
    recordingNameOrId: string,
    expectedTracks: ApiTrackResponse[],
    excludeCheckOn: string[] = [],
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    logTestDescription(`Check tracks for recording ${recordingNameOrId} `, {
      recordingName: recordingNameOrId,
    });

    let recordingId: string;
    if (additionalChecks["useRawRecordingId"] === true) {
      recordingId = recordingNameOrId;
    } else {
      recordingId = getCreds(recordingNameOrId).id.toString();
    }
    const url = v1ApiPath(`recordings/${recordingId}/tracks`);

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
          expectedTracks,
          response.body.tracks,
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

 });


