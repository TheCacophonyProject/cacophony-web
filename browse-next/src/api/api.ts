import { fetch } from "./fetch";
import { API_ROOT } from "@api/root";
import type { LoadedResource, WrappedFetchResult } from "@api/types";

// TODO - Handle getting all the revision information like the current version of browse does.

type HttpMethod = "POST" | "PATCH" | "DELETE" | "GET";

const fetchJsonWithMethod = async (
  endpoint: string,
  method: HttpMethod,
  body?: object,
  abortable?: boolean
) => {
  const payload = {
    method,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  } as RequestInit;
  if (body) {
    payload.body = JSON.stringify(body);
  }
  if (endpoint.startsWith("https://")) {
    return fetch(endpoint, payload, abortable);
  }
  return fetch(`${API_ROOT}${endpoint}`, payload, abortable);
};

export default {
  url: (endpoint: string) => `${API_ROOT}${endpoint}`,
  /**
   * Returns a promise that when resolved, returns an object with a result, success boolean, and status code.
   * The result field is the JSON blob from the response body.
   * These fields can easily be resolved using object destructuring to directly assign the required information.
   * @param {string} endpoint - The cacophony API endpoint to target, for example `/api/v1/users`.
   * @param {boolean} [abortable] - Whether this is a request for the current view, and if so should be aborted when the view changes.
   * @returns {Promise<{result: *, success: boolean, status: number}>}
   */
  get: async (endpoint: string, abortable?: boolean) =>
    fetch(`${API_ROOT}${endpoint}`, { method: "GET" }, abortable),

  /**
   * Returns a promise that when resolved, returns an object with a result, success boolean, and status code.
   * The result field is the JSON blob from the response body.
   * These fields can easily be resolved using object destructuring to directly assign the required information.
   * @param {string} endpoint - The cacophony API endpoint to target, for example `/api/v1/users`.
   * @param {*} [body] - An object to go in the request body that will be sent as JSON.
   * @param {boolean} [abortable] - Whether this is a request for the current view, and if so should be aborted when the view changes.
   * @returns {Promise<{result: *, success: boolean, status: number}>}
   */
  post: async (endpoint: string, body?: object, abortable?: boolean) =>
    fetchJsonWithMethod(endpoint, "POST", body, abortable),

  /**
   * Returns a promise that when resolved, returns an object with a result, success boolean, and status code.
   * The result field is the JSON blob from the response body.
   * These fields can easily be resolved using object destructuring to directly assign the required information.
   * @param {string} endpoint - The cacophony API endpoint to target, for example `/api/v1/users`.
   * @param {*} [body] - An object to go in the request body that will be sent as Binary data.
   * @param {boolean} [abortable] - Whether this is a request for the current view, and if so should be aborted when the view changes.
   * @returns {Promise<{result: *, success: boolean, status: number}>}
   */
  postBinaryData: async (
    endpoint: string,
    body: ArrayBuffer,
    abortable?: boolean
  ) => fetch(`${API_ROOT}${endpoint}`, { method: "POST", body }, abortable),

  /**
   * Returns a promise that when resolved, returns an object with a result, success boolean, and status code.
   * The result field is the JSON blob from the response body.
   * These fields can easily be resolved using object destructuring to directly assign the required information.
   * @param {string} endpoint - The cacophony API endpoint to target, for example `/api/v1/users`.
   * @param {*} [body] - An object to go in the request body that will be sent as FormData.
   * @param {boolean} [abortable] - Whether this is a request for the current view, and if so should be aborted when the view changes.
   * @returns {Promise<{result: *, success: boolean, status: number}>} */
  postMultipartFormData: async (
    endpoint: string,
    body: FormData,
    abortable?: boolean
  ) => fetch(`${API_ROOT}${endpoint}`, { method: "POST", body }, abortable),

  /**
   * Returns a promise that when resolved, returns an object with a result, success boolean, and status code.
   * The result field is the JSON blob from the response body.
   * These fields can easily be resolved using object destructuring to directly assign the required information.
   * @param {string} endpoint - The cacophony API endpoint to target, for example `/api/v1/users`.
   * @param {*} [body] - An object to go in the request body that will be sent as JSON.
   * @param {boolean} [abortable] - Whether this is a request for the current view, and if so should be aborted when the view changes.
   * @returns {Promise<{result: *, success: boolean, status: number}>}
   */
  patch: async (endpoint: string, body: object, abortable?: boolean) =>
    fetchJsonWithMethod(endpoint, "PATCH", body, abortable),

  /**
   * Returns a promise that when resolved, returns an object with a result, success boolean, and status code.
   * The result field is the JSON blob from the response body.
   * These fields can easily be resolved using object destructuring to directly assign the required information.
   * @param {string} endpoint - The cacophony API endpoint to target, for example `/api/v1/users`.
   * @param {*} [body] - An object to go in the request body that will be sent as JSON.
   * @param {boolean} [abortable] - Whether this is a request for the current view, and if so should be aborted when the view changes.
   * @returns {Promise<{result: *, success: boolean, status: number}>}
   */
  delete: async (endpoint: string, body?: object, abortable?: boolean) =>
    fetchJsonWithMethod(endpoint, "DELETE", body, abortable),
};

export const optionalQueryString = (params: URLSearchParams) => {
  if (Array.from(params.entries()).length) {
    return `?${params}`;
  }
  return "";
};

export const unwrapLoadedResource = <T>(
  apiCall: Promise<WrappedFetchResult<T>>,
  responseKey: string
): Promise<LoadedResource<T>> => {
  return new Promise((resolve) => {
    apiCall.then((response) => {
      if (response && response.success) {
        resolve((response.result as never)[responseKey] as T);
      } else {
        resolve(false);
      }
    });
  });
};
