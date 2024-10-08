import { getCreds } from "./server";
import { HttpStatusCode, RecordingType } from "@typedefs/api/consts";
import { ApiRecordingSet } from "@commands/types";
import { RecordingId } from "@typedefs/api/common";
//import {createTestCptvFile} from "cptv-decoder/encoder";

export function sendMultipartMessage(
  url: string,
  jwt: string,
  formData: any,
  waitOn: string,
  onComplete: any
) {
  //: Cypress.Chainable<Interception>
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
  xhr.onerror = function (err) {
    Cypress.log({
      name: "Upload error",
      message: { xhr, err },
    });
    onComplete(xhr);
  };
  xhr.send(formData);
  //return cy.wait(waitOn, { requestTimeout: 20000 });
}

// Uploads a file and data in a multipart message
// the file must be in the fixtures folder
export function uploadFile(
  url: string,
  credName: string,
  fileName: string | { filename: string; key: string }[],
  fileType: RecordingType | string,
  data: ApiRecordingSet | Record<string, string | string[] | number>,
  waitOn: string,
  statusCode: number = 200,
  fileNameToUse?: string
): Cypress.Chainable<
  Promise<{
    recordingId: RecordingId;
    messages: string[];
    statusCode: HttpStatusCode;
  }>
> {
  const jwt = getCreds(credName).jwt;
  const doUpload = (
    blob: Blob | { fileBlob: Blob; filename: string; key: string }[],
    data: any,
    resolve
  ) => {
    // Build up the form
    const formData = new FormData();
    formData.set("data", JSON.stringify(data));
    if (!Array.isArray(blob)) {
      formData.set("file", blob, fileNameToUse || (fileName as string)); //adding a file to the form
    } else {
      for (const item of blob) {
        formData.set(item.key, item.fileBlob, item.filename);
      }
    }
    // Perform the request

    return sendMultipartMessage(
      url,
      jwt,
      formData,
      waitOn,
      function (xhr: XMLHttpRequest) {
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
        Cypress.log({
          name: "Upload complete",
          message: xhr.status,
        });
        if (statusCode === 200) {
          if (xhr.status != 200) {
            expect(xhr.status, "Check response from uploading file").to.eq(200);
          }
        } else {
          expect(
            xhr.status,
            `Error scenario should be caught and return custom ${statusCode} error, should not cause 500 server error`
          ).to.equal(statusCode);
        }

        resolve({ ...xhr.response, statusCode });
      }
    );
  };

  const getMimeTypeFromFileName = (fileName: string): string => {
    const ext = fileName.split(".").pop();
    let mimeType = "application/octet-stream";
    switch (ext) {
      case "mp4":
        mimeType = "video/mp4";
        break;
      case "m4a":
        mimeType = "audio/mp4";
        break;
      case "mp3":
        mimeType = "audio/mpeg";
        break;
      case "cptv":
        mimeType = "application/x-cptv";
        break;
      case "webp":
        mimeType = "image/webp";
        break;
      case "jpg":
      case "jpeg":
        mimeType = "image/jpeg";
        break;
      case "ogg":
        mimeType = "audio/ogg";
        break;
      case "wav":
        mimeType = "audio/wav";
        break;
    }
    return mimeType;
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
  let uploadPromise: Promise<any>;
  if (Array.isArray(fileName)) {
    uploadPromise = new Promise((resolve, reject) => {
      const blobs = {};
      for (const item of fileName) {
        cy.fixture(item.filename, "binary").then((fileBinary) => {
          // File in binary format gets converted to blob so it can be sent as Form data
          const blob = Cypress.Blob.binaryStringToBlob(
            fileBinary,
            getMimeTypeFromFileName(item.filename)
          );
          blobs[item.filename] = { ...item, fileBlob: blob };
          if (Object.keys(blobs).length === fileName.length) {
            doUpload(Object.values(blobs), data, resolve);
          }
        });
      }
    });
  } else {
    uploadPromise = new Promise((resolve, reject) => {
      cy.fixture(fileName, "binary").then((fileBinary) => {
        // File in binary format gets converted to blob so it can be sent as Form data
        const blob = Cypress.Blob.binaryStringToBlob(
          fileBinary,
          getMimeTypeFromFileName(fileName)
        );
        doUpload(blob, data, resolve);
      });
    });
  }
  return cy.wrap(uploadPromise) as Cypress.Chainable<
    Promise<{
      recordingId: RecordingId;
      messages: string[];
      statusCode: HttpStatusCode;
    }>
  >;

  // }
}
