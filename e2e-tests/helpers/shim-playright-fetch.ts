import { ReadStream } from "fs";
import { APIRequestContext } from "@playwright/test";
import { JsonDocument } from "@shared/api/event";

interface PlaywrightFetchOptions {
  data?: string | Buffer | JsonDocument;
  failOnStatusCode?: boolean;
  form?: { [key: string]: string | number | boolean } | FormData;
  headers?: { [key: string]: string };
  ignoreHTTPSErrors?: boolean;
  maxRedirects?: number;
  maxRetries?: number;
  method?: string;
  multipart?:
    | FormData
    | {
        [key: string]:
          | string
          | number
          | boolean
          | ReadStream
          | {
              /**
               * File name
               */
              name: string;

              /**
               * File type
               */
              mimeType: string;

              /**
               * File content
               */
              buffer: Buffer;
            };
      };
  params?: { [key: string]: string | number | boolean } | URLSearchParams | string;
  timeout?: number;
}

const bufferToArrayBuffer = (buffer: Buffer): ArrayBuffer => {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
};

const bufferPromiseToReadableStream = (promise: Promise<Buffer>): ReadableStream<Uint8Array> => {
  return new ReadableStream({
    async start(controller) {
      try {
        const buffer = await promise;
        controller.enqueue(buffer);
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
};

export const shimPlaywrightFetch = async ({ request }: { request: APIRequestContext }) => {
  const nodeFetch = global.fetch;
  global.fetch = async (input: RequestInfo | URL, requestInit?: RequestInit): Promise<Response> => {
    if (requestInit && requestInit.body) {
      // NOTE: When running via node/playwright, request.body becomes request.data/request.multipart
      if (requestInit.body instanceof FormData) {
        // @ts-ignore
        requestInit["multipart"] = requestInit.body;
      } else {
        if (requestInit.body instanceof ArrayBuffer && Buffer !== undefined) {
          // @ts-ignore
          requestInit["data"] = Buffer.from(requestInit.body);
        } else {
          // @ts-ignore
          requestInit["data"] = requestInit.body;
        }
      }
      delete requestInit.body;
    }

    // We need to transform the input so that it matches playwright fetch requirements. (string | URL | Request)
    const apiResponse = await request.fetch(input as string, requestInit as PlaywrightFetchOptions);

    // Now change the APIResponse into a regular Response
    return {
      redirected: false,
      type: "default",
      ok: apiResponse.ok(),
      status: apiResponse.status(),
      statusText: apiResponse.statusText(),
      url: apiResponse.url(),
      headers: new Headers(apiResponse.headersArray().map(({ name, value }) => [name, value])),
      arrayBuffer: async () => {
        const buffer = await apiResponse.body();
        return bufferToArrayBuffer(buffer);
      },
      blob: async () => {
        const buffer = await apiResponse.body();
        return new Blob([bufferToArrayBuffer(buffer)]);
      },
      formData: async () => {
        // Never used
        return new FormData();
      },
      bytes: async () => {
        const buffer = await apiResponse.body();
        return new Uint8Array(bufferToArrayBuffer(buffer));
      },
      json: apiResponse.json.bind(apiResponse),
      text: apiResponse.text.bind(apiResponse),
      body: bufferPromiseToReadableStream(apiResponse.body()),
      bodyUsed: false,
      clone: () => {
        // Dummy, unused
        return {} as unknown as Response;
      },
    } as Response;
  };

  // @ts-ignore
  global.nodeFetch = nodeFetch;
};

export const restoreNodeFetch = async () => {
  // @ts-ignore
  global.fetch = global.nodeFetch;
};
