import { fetch } from "./fetch";

export let API_ROOT = import.meta.env.VITE_API;
if (API_ROOT === "CURRENT_HOST") {
  // In production, use whatever the current host is, since it should be proxying the api
  API_ROOT = "";
}

// TODO - Handle getting all the revision information like the current version of browse does.

type HttpMethod = "POST" | "PATCH" | "DELETE" | "GET";

const fetchJsonWithMethod = async (
  endpoint: string,
  method: HttpMethod,
  body?: object,
  abortable?: boolean
) => {
  const payload = {
    method: method,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  };
  if (body) {
    (payload as any).body = JSON.stringify(body);
  }
  console.log(`${API_ROOT}${endpoint}`, payload);
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
   * @param {*} [body] - An object to go in the request body that will be sent as JSON.
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
    fetchJsonWithMethod(endpoint, "PATCH", body),

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
