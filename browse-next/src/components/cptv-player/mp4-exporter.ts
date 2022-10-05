import type { H264MP4Encoder } from "@/assets/h264-mp4-encoder";
import HME from "@/assets/h264-mp4-encoder.js";
let encoder: H264MP4Encoder;
onmessage = async ({ data }) => {
  switch (data.type) {
    case "initEncoder":
      {
        encoder = await HME.createH264MP4Encoder();
        encoder.width = data.data.width;
        encoder.height = data.data.height;
        encoder.frameRate = data.data.frameRate;
        encoder.quantizationParameter = 10;
        encoder.speed = 0;
        encoder.groupOfPictures = 1;
        encoder.initialize();
        postMessage({ type: data.type });
      }
      break;
    case "encodeFrame":
      {
        encoder && encoder.addFrameRgba(data.data);
        postMessage({ type: data.type });
      }
      break;
    case "finishEncode":
      {
        if (encoder) {
          encoder.finalize();
          const uint8Array = encoder.FS.readFile(encoder.outputFilename);
          encoder.delete();
          postMessage({ type: data.type, data: uint8Array });
        } else {
          postMessage(data);
        }
      }
      break;
    default:
      postMessage(data);
      return;
  }
};
