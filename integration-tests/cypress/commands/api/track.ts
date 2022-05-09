// load the global Cypress types
/// <reference types="cypress" />

import {
  v1ApiPath,
  getCreds,
  makeAuthorizedRequestWithStatus,
  checkTreeStructuresAreEqualExcept,
  saveIdOnly,
  sortArrayOnTwoKeys,
} from "../server";
import { logTestDescription } from "../descriptions";
import { ApiTrackDataRequest, ApiTrackResponse } from "@typedefs/api/track";
import {
  ApiTrackTagRequest,
  ApiHumanTrackTagResponse,
  ApiAutomaticTrackTagResponse,
} from "@typedefs/api/trackTag";

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
    logTestDescription(`Adding track to recording ${recordingNameOrId}`, {
      recording: recordingNameOrId,
      requestData: data,
    });

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
      if (statusCode == 200) {
        if (trackName !== null) {
          saveIdOnly(trackName, response.body.trackId);
        }
        if (algorithmName !== null) {
          saveIdOnly(algorithmName, response.body.algorithmId);
        }
      }

      //check for substring in _any_ of messages[]
      if (additionalChecks["message"] !== undefined) {
        expect(response.body.messages.join("|")).to.include(
          additionalChecks["message"]
        );
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
      recordingName: recordingNameOrId,
      trackName: trackNameOrId,
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
        expect(response.body.messages.join("|")).to.include(
          additionalChecks["message"]
        );
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
    let sortTracks: ApiTrackResponse[];
    let sortExpectedTracks: ApiTrackResponse[];
    let sortTags: ApiHumanTrackTagResponse[] | ApiAutomaticTrackTagResponse[];
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
        //sort tracks
        if (additionalChecks["doNotSort"] === true) {
          sortTracks = response.body.tracks;
          sortExpectedTracks = expectedTracks;
        } else {
          sortTracks = sortArrayOnTwoKeys(response.body.tracks, "start", "end");
          sortExpectedTracks = sortArrayOnTwoKeys(
            expectedTracks,
            "start",
            "end"
          );
          sortTracks.forEach((track: ApiTrackResponse) => {
            sortTags = sortArrayOnTwoKeys(track.tags, "confidence", "userName");
            track.tags = sortTags;
          });
          sortExpectedTracks.forEach((track: ApiTrackResponse) => {
            sortTags = sortArrayOnTwoKeys(track.tags, "confidence", "userName");
            track.tags = sortTags;
          });
        }

        checkTreeStructuresAreEqualExcept(
          sortExpectedTracks,
          sortTracks,
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
  "apiTrackTagReplaceTag",
  (
    userName: string,
    recordingNameOrId: string,
    trackNameOrId: string,
    tagName: string,
    data: ApiTrackTagRequest,
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    logTestDescription(`Adding tracktag to track ${trackNameOrId}`, {
      recordinmg: recordingNameOrId,
      track: trackNameOrId,
      requestData: data,
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

    const url = v1ApiPath(
      `recordings/${recordingId}/tracks/${trackId}/replaceTag`
    );

    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: url,
        body: data,
      },
      userName,
      statusCode
    ).then((response) => {
      if (statusCode == 200) {
        if (tagName !== null) {
          saveIdOnly(tagName, response.body.trackTagId);
        }
      }

      if (additionalChecks["message"] !== undefined) {
        expect(response.body.messages.join("|")).to.include(
          additionalChecks["message"]
        );
      }
    });
  }
);

Cypress.Commands.add(
  "apiTrackTagAdd",
  (
    userName: string,
    recordingNameOrId: string,
    trackNameOrId: string,
    tagName: string,
    data: ApiTrackTagRequest,
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    logTestDescription(`Adding tracktag to track ${trackNameOrId}`, {
      recording: recordingNameOrId,
      track: trackNameOrId,
      requestData: data,
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

    const url = v1ApiPath(`recordings/${recordingId}/tracks/${trackId}/tags`);

    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: url,
        body: data,
      },
      userName,
      statusCode
    ).then((response) => {
      if (statusCode == 200) {
        if (tagName !== null) {
          saveIdOnly(tagName, response.body.trackTagId);
        }
      }

      if (additionalChecks["message"] !== undefined) {
        expect(response.body.messages.join("|")).to.include(
          additionalChecks["message"]
        );
      }
    });
  }
);

Cypress.Commands.add(
  "apiTrackTagDelete",
  (
    userName: string,
    recordingNameOrId: string,
    trackNameOrId: string,
    tagNameOrId: string,
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    logTestDescription(`Delete tracktag from recording ${recordingNameOrId} `, {
      recordingName: recordingNameOrId,
      trackName: trackNameOrId,
      tagName: tagNameOrId,
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

    let tagId: string;
    if (additionalChecks["useRawTagId"] === true) {
      tagId = tagNameOrId;
    } else {
      tagId = getCreds(tagNameOrId).id.toString();
    }

    const url = v1ApiPath(
      `recordings/${recordingId}/tracks/${trackId}/tags/${tagId}`
    );

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
