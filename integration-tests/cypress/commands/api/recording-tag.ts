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
import { ApiRecordingTagRequest } from "@typedefs/api/tag";

Cypress.Commands.add(
  "apiRecordingTagAdd",
  (
    userName: string,
    recordingNameOrId: string = "recording1",
    tagName: string,
    data: ApiRecordingTagRequest,
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    logTestDescription(
      `Adding tag to recording ${recordingNameOrId}`,
      { recording: recordingNameOrId, requestData: data }
    );

    let recordingId: string;
    if (additionalChecks["useRawRecordingId"] === true) {
      recordingId = recordingNameOrId;
    } else {
      recordingId = getCreds(recordingNameOrId).id.toString();
    }

    const url = v1ApiPath(`recordings/${recordingId}/tags`);

    const params = {tag: data};

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
        if (tagName !== null) {
          saveIdOnly(tagName, response.body.tagId);
        }
      }

      if (additionalChecks["message"] !== undefined) {
        expect(response.body.messages).to.contain(additionalChecks["message"]);
      }
    });
  }
);

Cypress.Commands.add(
  "apiRecordingTagDelete",
  (
    userName: string,
    recordingNameOrId: string,
    tagNameOrId: string,
    statusCode: number = 200,
    additionalChecks: any = {}
  ) => {
    logTestDescription(`Delete tag from recording ${recordingNameOrId} `, {
      recordingName: recordingNameOrId,
    });

    let recordingId: string;
    if (additionalChecks["useRawRecordingId"] === true) {
      recordingId = recordingNameOrId;
    } else {
      recordingId = getCreds(recordingNameOrId).id.toString();
    }

    let tagId: string;
    if (additionalChecks["useRawTagId"] === true) {
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
      statusCode
    ).then((response) => {
      if (additionalChecks["message"] !== undefined) {
        expect(response.body.messages).to.contain(additionalChecks["message"]);
      }
    });
  }
);

Cypress.Commands.add(
  "testRecordingTagCheck",
  (
    userName: string,
    recordingNameOrId: string,
    expectedTags: any[],
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
        checkTreeStructuresAreEqualExcept(
          expectedTags,
          response.body.recording.tags,
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


