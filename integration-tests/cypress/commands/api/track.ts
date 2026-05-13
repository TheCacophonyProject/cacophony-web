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
import { ApiTrackTagRequest, ApiTrackTag } from "@typedefs/api/trackTag";
import { HttpStatusCode } from "@typedefs/api/consts";
import { TrackId, TrackTagId } from "@shared/api/common";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /**
       * Add a track to a recording.
       * Optionally check for a non-200 return statusCode
       * Saves the track Id against trackName
       *   Optionally set trackName=null to not save the id
       * By default recording ID is looked up by name using recordingNameOrId
       *   Optionally, use the ID provided in recordingNameOrId by specifying
       *     additionalChecks["useRawRecordingId"]=true
       * Optionally, check that returned messages[] contains additionalChecks["message"]
       */
      apiTrackAdd(
        userName: string,
        recordingNameOrId: string,
        trackName: string,
        algorithmName: string,
        data: ApiTrackDataRequest,
        algorithm: unknown,
        statusCode?: HttpStatusCode,
        additionalChecks?: { useRawRecordingId?: boolean; message?: string },
      ): Chainable<
        Cypress.Response<{
          trackId: TrackId;
          algorithmId: number;
          messages: string[];
        }>
      >;

      /**
       * Delete a track from a recording.
       * Optionally check for a non-200 return statusCode
       * By default recording ID is looked up by name using recordingNameOrId
       *   Optionally, use the ID provided in recordingNameOrId by specifying
       *     additionalChecks["useRawRecordingId"]=true
       * By default track ID is looked up by name using trackNameOrId
       *   Optionally, use the ID provided in trackNameOrId by specifying
       *     additionalChecks["useRawTrackId"]=true
       * Optionally, check that returned messages[] contains additionalChecks["message"]
       */
      apiTrackDelete(
        userName: string,
        recordingNameOrId: string,
        trackNameOrId: string,
        statusCode?: HttpStatusCode,
        additionalChecks?: {
          useRawRecordingId?: boolean;
          useRawTrackId?: boolean;
          message?: string;
        },
      ): Chainable<void>;

      /**
       * Retrieve and check a single track from a recording.
       * Calls /recording/:id/tracks/:trackId (GET)
       * Verify that the tracks data matched the expectedtracks
       * Optionally: Exclude checks on specific values by specifying them in excludeChecksOn
       * Optionally check for a non-200 return statusCode
       * By default recording ID is looked up by name using recordingNameOrId
       *   Optionally, use the ID provided in recordingNameOrId by specifying
       *     additionalChecks["useRawRecordingId"]=true
       * By default track ID is looked up by name using trackNameOrId
       *   Optionally, use the ID provided in trackNameOrId by specifying
       *     additionalChecks["useRawTrackId"]=true
       * By default tags/expectedTags within each track are sorted by confidence,
       * userName before comparison
       *   Optionally, no not sort by specifying additionalChecks["doNotSort"]=true
       * Optionally, check that returned messages[] contains additionalChecks["message"]
       */
      apiTrackCheck(
        userName: string,
        recordingNameOrId: string,
        trackNameOrId: string,
        expectedTrack: ApiTrackResponse,
        excludeCheckOn?: string[],
        statusCode?: HttpStatusCode,
        additionalChecks?: {
          useRawTrackId?: boolean;
          useRawRecordingId?: boolean;
          message?: string;
        },
      ): Chainable<void>;

      /**
       * Retrieve and check tracks from a recording.
       * Calls /recording/:id/tracks (GET)
       * Verfiy that the tracks data matched the expectedtracks
       * Optionally: Exclude checks on specific values by specifying them in excludeChecksOn
       * Optionally check for a non-200 return statusCode
       * By default recording ID is looked up by name using recordingNameOrId
       *   Optionally, use the ID provided in recordingNameOrId by specifying
       *     additionalChecks["useRawRecordingId"]=true
       * By default tracks/expectedTracks are sorted on start, end before comparison
       * By default tags/expectedTags within each track are sorted by confidence,
       * userName before comparison
       *   Optionally, no not sort by specifying additionalChecks["doNotSort"]=true
       * Optionally, check that returned messages[] contains additionalChecks["message"]
       */
      apiTracksCheck(
        userName: string,
        recordingNameOrId: string,
        expectedTracks: ApiTrackResponse[],
        excludeCheckOn?: string[],
        statusCode?: HttpStatusCode,
        additionalChecks?: {
          useRawRecordingId?: boolean;
          message?: string;
          doNotSort?: boolean;
        },
      ): Chainable<void>;

      /**
       * Add or update a track tag for a recording.
       * Optionally check for a non-200 return statusCode
       * Saves the tag Id against tagName
       *   Optionally set tagName=null to not save the id
       * By default recording ID is looked up by name using recordingNameOrId
       *   Optionally, use the ID provided in recordingNameOrId by specifying
       *     additionalChecks["useRawRecordingId"]=true
       * By default track ID is looked up by name using trackNameOrId
       *   Optionally, use the ID provided in trackNameOrId by specifying
       *     additionalChecks["useRawTrackId"]=true
       * Optionally, check that returned messages[] contains additionalChecks["message"]
       */
      apiTrackTagAdd(
        userName: string,
        recordingNameOrId: string,
        trackNameOrId: string,
        tagName: string,
        data: ApiTrackTagRequest,
        statusCode?: HttpStatusCode,
        additionalChecks?: {
          useRawRecordingId?: boolean;
          useRawTrackId?: boolean;
          message?: string;
        },
      ): Chainable<void>;

      /**
       * Add a track tag for a recording using tagJWT for access (power-tagger).
       * Optionally check for a non-200 return statusCode
       * Saves the tag Id against tagName
       *   Optionally set tagName=null to not save the id
       * By default recording ID is looked up by name using recordingNameOrId
       *   Optionally, use the ID provided in recordingNameOrId by specifying
       *     additionalChecks["useRawRecordingId"]=true
       * By default track ID is looked up by name using trackNameOrId
       *   Optionally, use the ID provided in trackNameOrId by specifying
       *     additionalChecks["useRawTrackId"]=true
       * Optionally, check that returned messages[] contains additionalChecks["message"]
       */
      apiTrackTagReplaceTag(
        userName: string,
        recordingNameOrId: string,
        trackNameOrId: string,
        tagName: string,
        data: ApiTrackTagRequest,
        statusCode?: HttpStatusCode,
        additionalChecks?: {
          useRawRecordingId?: boolean;
          useRawTrackId?: boolean;
          message?: string;
          errors?: { location: string; path: string }[];
        },
      ): Chainable<void>;

      /**
       * Delete a track tag from a recording.
       * Optionally check for a non-200 return statusCode
       * By default recording ID is looked up by name using recordingNameOrId
       *   Optionally, use the ID provided in recordingNameOrId by specifying
       *     additionalChecks["useRawRecordingId"]=true
       * By default track ID is looked up by name using trackNameOrId
       *   Optionally, use the ID provided in trackNameOrId by specifying
       *     additionalChecks["useRawTrackId"]=true
       * By default tag ID is looked up by name using tagNameOrId
       *   Optionally, use the ID provided in tagNameOrId by specifying
       *     additionalChecks["useRawTagId"]=true
       * Optionally, check that returned messages[] contains additionalChecks["message"]
       */
      apiTrackTagDelete(
        userName: string,
        recordingNameOrId: string,
        trackNameOrId: string,
        tagNameOrId: string,
        statusCode?: HttpStatusCode,
        additionalChecks?: {
          useRawRecordingId?: boolean;
          useRawTrackId?: boolean;
          useRawTagId?: boolean;
          message?: string;
        },
      ): Chainable<void>;
    }
  }
}

Cypress.Commands.add(
  "apiTrackAdd",
  (
    userName: string,
    recordingNameOrId = "recording1",
    trackName: string,
    algorithmName: string,
    data: ApiTrackDataRequest,
    algorithm: unknown,
    statusCode = 200,
    additionalChecks: { useRawRecordingId?: boolean; message?: string } = {},
  ) => {
    logTestDescription(`Adding track to recording ${recordingNameOrId}`, {
      recording: recordingNameOrId,
      requestData: data,
    });

    let recordingId: string;
    if (additionalChecks.useRawRecordingId === true) {
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
      statusCode,
    ).then(
      (
        response: Cypress.Response<{
          messages: string[];
          trackId: number;
          algorithmId: number;
        }>,
      ) => {
        if (statusCode == 200) {
          if (trackName !== null) {
            saveIdOnly(trackName, response.body.trackId);
          }
          if (algorithmName !== null) {
            saveIdOnly(algorithmName, response.body.algorithmId);
          }
        }

        //check for substring in _any_ of messages[]
        if (additionalChecks.message !== undefined) {
          expect(response.body.messages.join("|")).to.include(
            additionalChecks.message,
          );
        }
      },
    );
  },
);

Cypress.Commands.add(
  "apiTrackDelete",
  (
    userName: string,
    recordingNameOrId: string,
    trackNameOrId: string,
    statusCode = 200,
    additionalChecks: {
      useRawRecordingId?: boolean;
      useRawTrackId?: boolean;
      message?: string;
    } = {},
  ) => {
    logTestDescription(`Track is deleted from recording ${recordingNameOrId}`, {
      recordingName: recordingNameOrId,
      trackName: trackNameOrId,
    });

    let recordingId: string;
    if (additionalChecks.useRawRecordingId === true) {
      recordingId = recordingNameOrId;
    } else {
      recordingId = getCreds(recordingNameOrId).id.toString();
    }

    let trackId: string;
    if (additionalChecks.useRawTrackId === true) {
      trackId = trackNameOrId;
    } else {
      trackId = getCreds(trackNameOrId).id.toString();
    }

    const url = v1ApiPath(`recordings/${recordingId}/tracks/${trackId}`, {
      "soft-delete": "false",
    });

    makeAuthorizedRequestWithStatus(
      {
        method: "DELETE",
        url: url,
      },
      userName,
      statusCode,
    ).then((response: Cypress.Response<{ messages: string[] }>) => {
      if (additionalChecks["message"] !== undefined) {
        expect(response.body.messages.join("|")).to.include(
          additionalChecks["message"],
        );
      }
    });
  },
);

Cypress.Commands.add(
  "apiTrackCheck",
  (
    userName: string,
    recordingNameOrId: string,
    trackNameOrId: string,
    expectedTrack: ApiTrackResponse,
    excludeCheckOn: string[] = [],
    statusCode = 200,
    additionalChecks: {
      useRawTrackId?: boolean;
      useRawRecordingId?: boolean;
      message?: string;
    } = {},
  ) => {
    let sortTags: ApiTrackTag[];
    logTestDescription(`Check tracks for recording ${recordingNameOrId} `, {
      recordingName: recordingNameOrId,
    });

    let recordingId: string;
    if (additionalChecks.useRawRecordingId === true) {
      recordingId = recordingNameOrId;
    } else {
      recordingId = getCreds(recordingNameOrId).id.toString();
    }
    let trackId: string;
    if (additionalChecks.useRawTrackId === true) {
      trackId = trackNameOrId;
    } else {
      trackId = getCreds(trackNameOrId).id.toString();
    }

    const url = v1ApiPath(`recordings/${recordingId}/tracks/${trackId}`);

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
          track: ApiTrackResponse;
          messages: string[];
        }>,
      ) => {
        if (statusCode === 200) {
          const track = response.body.track;
          //sort tracks
          if (additionalChecks["doNotSort"] !== true) {
            sortTags = sortArrayOnTwoKeys(track.tags, "confidence", "userName");
            track.tags = sortTags;
            sortTags = sortArrayOnTwoKeys(
              expectedTrack.tags,
              "confidence",
              "userName",
            );
            expectedTrack.tags = sortTags;
          }

          checkTreeStructuresAreEqualExcept(
            expectedTrack,
            track,
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
  "apiTracksCheck",
  (
    userName: string,
    recordingNameOrId: string,
    expectedTracks: ApiTrackResponse[],
    excludeCheckOn: string[] = [],
    statusCode = 200,
    additionalChecks: {
      useRawRecordingId?: boolean;
      message?: string;
      doNotSort?: boolean;
    } = {},
  ) => {
    let sortTracks: ApiTrackResponse[];
    let sortExpectedTracks: ApiTrackResponse[];
    let sortTags: ApiTrackTag[];
    logTestDescription(`Check tracks for recording ${recordingNameOrId} `, {
      recordingName: recordingNameOrId,
    });

    let recordingId: string;
    if (additionalChecks.useRawRecordingId === true) {
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
      statusCode,
    ).then(
      (
        response: Cypress.Response<{
          tracks: ApiTrackResponse[];
          messages: string[];
        }>,
      ) => {
        if (statusCode === 200) {
          //sort tracks
          if (additionalChecks.doNotSort === true) {
            sortTracks = response.body.tracks;
            sortExpectedTracks = expectedTracks;
          } else {
            sortTracks = sortArrayOnTwoKeys(
              response.body.tracks,
              "start",
              "end",
            );
            sortExpectedTracks = sortArrayOnTwoKeys(
              expectedTracks,
              "start",
              "end",
            );
            sortTracks.forEach((track: ApiTrackResponse) => {
              sortTags = sortArrayOnTwoKeys(
                track.tags,
                "confidence",
                "userName",
              );
              track.tags = sortTags;
            });
            sortExpectedTracks.forEach((track: ApiTrackResponse) => {
              sortTags = sortArrayOnTwoKeys(
                track.tags,
                "confidence",
                "userName",
              );
              track.tags = sortTags;
            });
          }

          checkTreeStructuresAreEqualExcept(
            sortExpectedTracks,
            sortTracks,
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
  "apiTrackTagReplaceTag",
  (
    userName: string,
    recordingNameOrId: string,
    trackNameOrId: string,
    tagName: string,
    data: ApiTrackTagRequest,
    statusCode = 200,
    additionalChecks: {
      useRawRecordingId?: boolean;
      useRawTrackId?: boolean;
      message?: string;
    } = {},
  ) => {
    logTestDescription(`Adding tracktag to track ${trackNameOrId}`, {
      recordinmg: recordingNameOrId,
      track: trackNameOrId,
      requestData: data,
    });

    let recordingId: string;
    if (additionalChecks.useRawRecordingId === true) {
      recordingId = recordingNameOrId;
    } else {
      recordingId = getCreds(recordingNameOrId).id.toString();
    }
    let trackId: string;
    if (additionalChecks.useRawTrackId === true) {
      trackId = trackNameOrId;
    } else {
      trackId = getCreds(trackNameOrId).id.toString();
    }

    const url = v1ApiPath(
      `recordings/${recordingId}/tracks/${trackId}/replace-tag`,
    );

    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: url,
        body: data,
      },
      userName,
      statusCode,
    ).then(
      (
        response: Cypress.Response<{
          trackTagId: TrackTagId;
          messages: string[];
        }>,
      ) => {
        if (statusCode == 200) {
          if (tagName !== null) {
            saveIdOnly(tagName, response.body.trackTagId);
          }
        }

        if (additionalChecks.message !== undefined) {
          expect(response.body.messages.join("|")).to.include(
            additionalChecks.message,
          );
        }
      },
    );
  },
);

Cypress.Commands.add(
  "apiTrackTagAdd",
  (
    userName: string,
    recordingNameOrId: string,
    trackNameOrId: string,
    tagName: string,
    data: ApiTrackTagRequest,
    statusCode = 200,
    additionalChecks: {
      useRawRecordingId?: boolean;
      useRawTrackId?: boolean;
      message?: string;
    } = {},
  ) => {
    logTestDescription(`Adding tracktag to track ${trackNameOrId}`, {
      recording: recordingNameOrId,
      track: trackNameOrId,
      requestData: data,
    });

    let recordingId: string;
    if (additionalChecks.useRawRecordingId === true) {
      recordingId = recordingNameOrId;
    } else {
      recordingId = getCreds(recordingNameOrId).id.toString();
    }
    let trackId: string;
    if (additionalChecks.useRawTrackId === true) {
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
      statusCode,
    ).then(
      (
        response: Cypress.Response<{
          trackTagId: TrackTagId;
          messages: string[];
        }>,
      ) => {
        if (statusCode == 200) {
          if (tagName !== null) {
            saveIdOnly(tagName, response.body.trackTagId);
          }
        }

        if (additionalChecks.message !== undefined) {
          expect(response.body.messages.join("|")).to.include(
            additionalChecks.message,
          );
        }
      },
    );
  },
);

Cypress.Commands.add(
  "apiTrackTagDelete",
  (
    userName: string,
    recordingNameOrId: string,
    trackNameOrId: string,
    tagNameOrId: string,
    statusCode: number = HttpStatusCode.Ok,
    additionalChecks: {
      useRawRecordingId?: boolean;
      useRawTrackId?: boolean;
      useRawTagId?: boolean;
      message?: string;
    } = {},
  ) => {
    logTestDescription(
      `tracktag is deleted from recording ${recordingNameOrId} `,
      {
        recordingName: recordingNameOrId,
        trackName: trackNameOrId,
        tagName: tagNameOrId,
      },
    );

    let recordingId: string;
    if (additionalChecks.useRawRecordingId === true) {
      recordingId = recordingNameOrId;
    } else {
      recordingId = getCreds(recordingNameOrId).id.toString();
    }

    let trackId: string;
    if (additionalChecks.useRawTrackId === true) {
      trackId = trackNameOrId;
    } else {
      trackId = getCreds(trackNameOrId).id.toString();
    }

    let tagId: string;
    if (additionalChecks.useRawTagId === true) {
      tagId = tagNameOrId;
    } else {
      tagId = getCreds(tagNameOrId).id.toString();
    }

    const url = v1ApiPath(
      `recordings/${recordingId}/tracks/${trackId}/tags/${tagId}`,
    );

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
