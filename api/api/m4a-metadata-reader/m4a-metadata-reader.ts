import loadWasm, { M4aReaderContext } from "./m4a_metadata.js";
import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";
export const tryReadingM4aMetadata = async (
  stream
): Promise<Record<string, any> | string> => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  await loadWasm(
    fs.readFileSync(path.join(__dirname, "./m4a_metadata_bg.wasm"))
  );
  const readerContext = M4aReaderContext.newWithReadableStream(
    stream.getReader()
  );
  const result = await readerContext.getMetadata();
  if (typeof result === "object") {
    if (result.longitude) {
      result.longitude = parseFloat(result.longitude);
    }
    if (result.latitude) {
      result.latitude = parseFloat(result.latitude);
    }
    if (result.locTimestamp) {
      result.locTimestamp = parseInt(result.locTimestamp);
    }
    if (result.recordingDateTime) {
      result.recordingDateTime = new Date(result.recordingDateTime);
    }
    if (result.deviceId) {
      result.deviceId = parseInt(result.deviceId);
    }
    if (result.locAccuracy) {
      result.locAccuracy = parseInt(result.locAccuracy);
    }
    if (result.duration) {
      result.duration = parseInt(result.duration);
    }
  }
  readerContext.free();
  return result;
};