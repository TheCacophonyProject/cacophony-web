// load the global Cypress types
/// <reference types="cypress" />

import { getCreds } from "./server";
import { Interception } from "cypress/types/net-stubbing";
import { RecordingType } from "@typedefs/api/consts";
import { ApiRecordingSet } from "@commands/types";
//import {createTestCptvFile} from "cptv-decoder/encoder";

export function sendMultipartMessage(
  url: string,
  jwt: string,
  formData: any,
  waitOn: string,
  onComplete: any
): Cypress.Chainable<Interception> {
  const xhr = new XMLHttpRequest();
  xhr.open("POST", url);
  xhr.setRequestHeader("authorization", jwt);
  xhr.responseType = "json";
  xhr.onload = function () {
    onComplete(xhr);

    // // send request that cypress waits on to say request is completed.
    // const completedXhr = new XMLHttpRequest();
    // completedXhr.open("POST", v1ApiPath("uploadedFile"));
    // completedXhr.send(JSON.stringify(xhr.response.body));
  };
  xhr.onerror = function () {
    onComplete(xhr);
  };
  xhr.send(formData);
  return cy.wait(waitOn, { requestTimeout: 20000 });
}

// Uploads a file and data in a multipart message
// the file must be in the fixtures folder
export function uploadFile(
  url: string,
  credName: string,
  fileName: string,
  fileType: RecordingType,
  data: ApiRecordingSet,
  waitOn: string,
  statusCode: number = 200
): Cypress.Chainable<Interception> {
  const jwt = getCreds(credName).jwt;

  const doUpload = (blob: Blob, data: any) => {
    // Build up the form
    const formData = new FormData();
    formData.set("file", blob, fileName); //adding a file to the form
    formData.set("data", JSON.stringify(data));
    // Perform the request

    return sendMultipartMessage(
      url,
      jwt,
      formData,
      waitOn,
      function (xhr: any) {
        Cypress.log({
          name: "Upload debug",
          displayName: "(upload)",
          message: url,
          consoleProps: () => {
            return {
              fileName,
              fileType,
              uploader: credName,
              data,
              response: xhr.response,
            };
          },
        });

        if (statusCode === 200) {
          if (xhr.status != 200) {
            expect(
              xhr.status,
              `Check response from uploading file: ${xhr.response}`
            ).to.eq(200);
          }
        } else {
          expect(
            xhr.status,
            `Error scenario should be caught and return custom ${statusCode} error, should not cause 500 server error`
          ).to.equal(statusCode);
        }
      }
    );
  };

  // TODO - Make wasm encoder import work here
  // if (fileType === RecordingType.ThermalRaw) {
  //   return cy.wrap(createTestCptvFile({
  //     duration: data.duration || 5,
  //     hasBackgroundFrame: false,
  //     recordingDateTime: data.recordingDateTime || new Date().toISOString()
  //   })).then((testFile: Uint8Array) => {
  //     const blob = Cypress.Blob.arrayBufferToBlob(testFile, "application/x-cptv");
  //     return doUpload(blob, data);
  //   });
  //   // Create a test cptv file from data.
  // } else if (fileType === RecordingType.Audio) {
  // Get file from fixtures as binary
  return cy.fixture(fileName, "binary").then((fileBinary) => {
    // File in binary format gets converted to blob so it can be sent as Form data
    const blob = Cypress.Blob.binaryStringToBlob(fileBinary, "audio/mpeg");
    return doUpload(blob, data);
  });
  // }
}
