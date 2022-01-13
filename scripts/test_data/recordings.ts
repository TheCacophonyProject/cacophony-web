import {
  getAdminToken,
  postBody,
  recordingDeviceUrl,
  recordingsUrl,
} from "./utils.ts";

export interface RecordingMetaData {
  type: "thermal" | "audio";
  fileHash?: string;
  fileName?: string;
  duration?: number;
  recordingDateTime?: string;
  metadata: { tracks: [number, number, number, number][] };
}

async function createDeviceRecording(
  device: number,
  data: RecordingMetaData,
  file: File,
) {
  try {
    console.log("===== createDeviceRecording =====", device);
    const token = await getAdminToken();
    // create multi-part request body for data and file
    const body = new FormData();
    body.append("data", JSON.stringify(data));
    body.append("file", file);
    console.log(body);
    const response = await fetch(
      recordingDeviceUrl(device),
      {
        method: "POST",
        headers: {
          Authorization: `${token}`,
        },
        body,
      },
    );
    console.log(response);
    if (response.ok) {
      const json = await response.json();
      console.log(json);
      return json;
    } else {
      throw new Error(
        `${response.status} ${response.url} ${response.statusText}`,
      );
    }
  } catch (error) {
    console.error(error);
    return Promise.reject(error);
  }
}

async function deleteDeviceRecording(id: number) {
  try {
    console.log("===== deleteDeviceRecording =====", id);
    const token = await getAdminToken();
    const response = await fetch(
      `${recordingsUrl}/${id}?soft-delete=false`,
      {
        method: "DELETE",
        headers: {
          Authorization: `${token}`,
        },
      },
    );
    if (response.ok) {
      const json = await response.json();
      console.log(json);
      return json;
    } else {
      throw new Error(
        `${response.status} ${response.url} ${response.statusText}`,
      );
    }
  } catch (error) {
    console.error(error);
    return Promise.reject(error);
  }
}

export { createDeviceRecording, deleteDeviceRecording };
