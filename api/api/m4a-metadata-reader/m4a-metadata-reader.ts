import loadWasm, { InitOutput, M4aReaderContext } from "./m4a_metadata.js";
import fs from "fs";
import { fileURLToPath } from "url";
import { ReadableStream } from "stream/web";
import path from "path";

let wasmLoaded: undefined | InitOutput;

export const tryReadingM4aMetadata = async (
  stream: ReadableStream,
): Promise<Record<string, object | unknown> | string> => {
  if (!wasmLoaded) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    wasmLoaded = await loadWasm(
      fs.readFileSync(path.join(__dirname, "./m4a_metadata_bg.wasm")),
    );
  }
  const readerContext = M4aReaderContext.newWithReadableStream(
    stream.getReader(),
  );
  try {
    const result = (await readerContext.getMetadata()) as Record<
      string,
      string | number | Date
    >;
    if (typeof result === "object") {
      if (result.longitude) {
        result.longitude = parseFloat(result.longitude.toString());
      }
      if (result.latitude) {
        result.latitude = parseFloat(result.latitude.toString());
      }
      if (result.locTimestamp) {
        result.locTimestamp = parseInt(result.locTimestamp.toString());
      }
      if (result.recordingDateTime) {
        result.recordingDateTime = new Date(
          result.recordingDateTime.toString(),
        );
      }
      if (result.deviceId) {
        result.deviceId = parseInt(result.deviceId.toString());
      }
      if (result.locAccuracy) {
        result.locAccuracy = parseFloat(result.locAccuracy.toString());
      }
      if (result.duration) {
        result.duration = parseFloat(result.duration.toString());
      }
    }
    return result;
  } catch (_e) {
    return "Error reading metadata";
  } finally {
    readerContext.free();
  }
};
