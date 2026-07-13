import {
  v1ApiPath,
  getCreds,
  makeAuthorizedRequestWithStatus,
  checkTreeStructuresAreEqualExcept,
  saveIdOnly,
} from "../server";
import { logTestDescription } from "../descriptions";
import {
  ApiRecordingTagRequest,
  ApiRecordingTagResponse,
} from "@typedefs/api/tag";
import { ApiRecordingResponse } from "@shared/api/recording";
import { TagId } from "@shared/api/common";
import { HttpStatusCode } from "@shared/api/consts";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /**
       * Add a tag to a recording.
       * Optionally check for a non-200 return statusCode
       * Saves the tag Id against tagName
       *   Optionally set tagName=null to not save the id
       * By default recording ID is looked up by name using recordingNameOrId
       *   Optionally, use the ID provided in recordingNameOrId by specifying
       *     additionalChecks["useRawRecordingId"]=true
       * Optionally, check that returned messages[] contains additionalChecks["message"]
       */
      apiRecordingTagAdd(
        userName: string,
        recordingNameOrId: string,
        tagName: string,
        data: ApiRecordingTagRequest,
        statusCode?: HttpStatusCode,
        additionalChecks?: { useRawRecordingId?: boolean; message?: string },
      ): Chainable<{ tagId: TagId }>;

      /**
       * Delete a tag from a recording.
       * Optionally check for a non-200 return statusCode
       * By default recording ID is looked up by name using recordingNameOrId
       *   Optionally, use the ID provided in recordingNameOrId by specifying
       *     additionalChecks["useRawRecordingId"]=true
       * By default tag ID is looked up by name using tagNameOrId
       *   Optionally, use the ID provided in tagNameOrId by specifying
       *     additionalChecks["useRawTagId"]=true
       * Optionally, check that returned messages[] contains additionalChecks["message"]
       */
      apiRecordingTagDelete(
        userName: string,
        recordingNameOrId: string,
        tagNameOrId: string,
        statusCode?: HttpStatusCode,
        additionalChecks?: {
          useRawRecordingId?: boolean;
          useRawTagId?: boolean;
          message?: string;
        },
      ): Chainable<void>;

      /**
       * Check recording tags match expected
       * Calls /recording/:id (GET) but only checks the tags component of returned data
       * Optionally check for a non-200 return statusCode
       * By default recording ID is looked up by name using recordingNameOrId
       *   Optionally, use the ID provided in recordingNameOrId by specifying
       *     additionalChecks["useRawRecordingId"]=true
       * Optionally, check that returned messages[] contains additionalChecks["message"]
       */
      testRecordingTagCheck(
        userName: string,
        recordingNameOrId: string,
        expectedTags: ApiRecordingTagResponse[],
        excludeCheckOn?: string[],
        statusCode?: HttpStatusCode,
        additionalChecks?: { useRawRecordingId?: boolean; message?: string },
      ): Chainable<void>;
    }
  }
}

Cypress.Commands.add(
  "apiRecordingTagAdd",
  (
    userName: string,
    recordingNameOrId = "recording1",
    tagName: string,
    data: ApiRecordingTagRequest,
    statusCode = 200,
    additionalChecks: { useRawRecordingId?: boolean; message?: string } = {},
  ) => {
    logTestDescription(`Adding tag to recording ${recordingNameOrId}`, {
      recording: recordingNameOrId,
      requestData: data,
    });

    let recordingId: string;
    if (additionalChecks.useRawRecordingId === true) {
      recordingId = recordingNameOrId;
    } else {
      recordingId = getCreds(recordingNameOrId).id.toString();
    }

    const url = v1ApiPath(`recordings/${recordingId}/tags`);

    const params = { tag: data };

    makeAuthorizedRequestWithStatus(
      {
        method: "POST",
        url: url,
        body: params,
      },
      userName,
      statusCode,
    ).then(
      (response: Cypress.Response<{ messages: string[]; tagId: TagId }>) => {
        if (statusCode == 200) {
          if (tagName !== null) {
            cy.wrap(response.body);
            saveIdOnly(tagName, response.body.tagId);
          }
        }

        if (additionalChecks.message !== undefined) {
          expect(response.body.messages).to.contain(additionalChecks.message);
        }
      },
    );
  },
);

Cypress.Commands.add(
  "apiRecordingTagDelete",
  (
    userName: string,
    recordingNameOrId: string,
    tagNameOrId: string,
    statusCode = 200,
    additionalChecks: {
      useRawRecordingId?: boolean;
      useRawTagId?: boolean;
      message?: string;
    } = {},
  ) => {
    logTestDescription(`Tag deleted from recording ${recordingNameOrId} `, {
      recordingName: recordingNameOrId,
    });

    let recordingId: string;
    if (additionalChecks.useRawRecordingId === true) {
      recordingId = recordingNameOrId;
    } else {
      recordingId = getCreds(recordingNameOrId).id.toString();
    }

    let tagId: string;
    if (additionalChecks.useRawTagId === true) {
      tagId = tagNameOrId;
    } else {
      tagId = getCreds(tagNameOrId).id.toString();
    }

    const url = v1ApiPath(`recordings/${recordingId}/tags/${tagId}`);

    makeAuthorizedRequestWithStatus(
      {
        method: "DELETE",
        url: url,
      },
      userName,
      statusCode,
    ).then((response: Cypress.Response<{ messages: string[] }>) => {
      if (additionalChecks.message !== undefined) {
        expect(response.body.messages).to.contain(additionalChecks.message);
      }
    });
  },
);

Cypress.Commands.add(
  "testRecordingTagCheck",
  (
    userName: string,
    recordingNameOrId: string,
    expectedTags: ApiRecordingTagResponse[],
    excludeCheckOn: string[] = [],
    statusCode = 200,
    additionalChecks: { useRawRecordingId?: boolean; message?: string } = {},
  ) => {
    logTestDescription(`Check recording ${recordingNameOrId} `, {
      recordingName: recordingNameOrId,
    });

    let recordingId: string;
    if (additionalChecks.useRawRecordingId === true) {
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
      statusCode,
    ).then(
      (
        response: Cypress.Response<{
          messages: string[];
          recording: ApiRecordingResponse;
        }>,
      ) => {
        if (statusCode === 200) {
          checkTreeStructuresAreEqualExcept(
            expectedTags,
            response.body.recording.tags,
            excludeCheckOn,
          );
        } else {
          if (additionalChecks.message !== undefined) {
            expect(response.body.messages).to.contain(additionalChecks.message);
          }
        }
      },
    );
  },
);
