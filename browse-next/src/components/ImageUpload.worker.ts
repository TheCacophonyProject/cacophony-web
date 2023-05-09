import { sha1 } from "hash-wasm";
import EXIF from "exif-js";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { supportsFastBuild, createOCREngine } from "tesseract-wasm";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import type { OCREngine } from "tesseract-wasm";
import { encode } from "@jsquash/webp";
// TODO: Post the jpeg bytes to be compressed here, along with a valid api token (or possibly we request the api token once upload is ready)
// 1. Do exif decode
// 2. Do Ocr to find the possible group name.
// 3. Make cropped and resized image as jpeg (using some decent jpeg encoder, or a more advanced image format.)
// 5. Upload the "recording", and return progress every 10%?
// 6. At some stage to a sha1 hash of the file.
interface UploadJob {
  file: FileSystemFileEntry;
  canvas?: HTMLCanvasElement;
  progress: number;
}
//let ocr: OCRClient;
let ocr: OCREngine;

const filePromise = async (file: FileSystemFileEntry): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    file.file(resolve, reject);
  });
};

const processFile = async (
  fileBlob: Blob,
  canvas: HTMLCanvasElement
): Promise<{
  fileHash: string;
  derivedFile: ArrayBuffer;
  thumbFile: ArrayBuffer;
  recordingDateTime: Date;
  additionalMetadata?: Record<string, string | number>,
}> => {
  const additionalMetadata = {};
  if (!ocr) {
    let wasm;
    if (supportsFastBuild()) {
      wasm = await (
        await fetch("/tesseract/tesseract-core.wasm")
      ).arrayBuffer();
    } else {
      wasm = await (
        await fetch("/tesseract/tesseract-core-fallback.wasm")
      ).arrayBuffer();
    }
    ocr = await createOCREngine({ wasmBinary: wasm });
    const model = await (
      await fetch("/tesseract/eng.traineddata")
    ).arrayBuffer();
    await ocr.loadModel(model);
  }
  const start = performance.now();
  // TODO: Get the JPEG resolution via exif data
  // We may actually want to use the full size decoded image to

  // Okay, so based on the model, we know *exactly* where to look for the device name in the image,
  //  so that we can check it against the proxy device name, or at least ensure that it doesn't change.
  // So maybe in device table, we need an aliases field for trailcams, where we list other names it's known by?

  // When we first see a new device name from an image where no aliases are set, ask if we'd like to rename the
  // device to that devicename?

  // If GPS coords exist, and they change, cool.  But if the device itself changes, that is a problem.
  const fileBytes = await fileBlob.arrayBuffer();
  //console.log("File Bytes", fileBytes.byteLength);
  const hash = await sha1(new Uint8Array(fileBytes));
  //console.log(hash);

  // Right, so jpeg tran completely strips out exif data.  Probably explains savings.

  const exif = EXIF.readFromBinaryFile(fileBytes);
  console.log(JSON.stringify(exif, null, '\t'));
  const model = (exif.Model || "").trim();
  const width = exif.PixelXDimension;
  const height = exif.PixelYDimension;
  const dateTime = exif.DateTime;
  //console.log(JSON.stringify(exif, null, '\t'));
  let recordingDateTime = new Date();
  if (dateTime) {
    const [[year, month, day], [hour, minute, second]] = dateTime
      .split(" ")
      .map((x: string) => x.split(":").map(Number));
    recordingDateTime = new Date(year, month - 1, day, hour, minute, second);
  }

  // Maybe this should be normalised to 0..1.0 coords
  let footerHeight = 47;
  let deviceNameLeft = 1120;
  let deviceNameRight = 1570;
  let background = "black";
  let paddingY = 20;
  const ctx = canvas.getContext("2d", {
    willReadFrequently: true,
    desynchronized: true,
  });
  let textFooterHeight = 0;
  let ratio = 0;

  // TODO: Should we try and find the bottom slice if we don't have exif data, or don't recognise the model?

  if (model) {
    switch (model) {
      case "BTC-6PX": // Browning
        footerHeight = 47;
        deviceNameLeft = 1120;
        deviceNameRight = 1570;
        background = "black";
        paddingY = 20;
        // Expected width/height: 2688x1504 1:1.78723404
        break;
      case "119975": // Bushnells
        footerHeight = 108;
        deviceNameLeft = 410;
        deviceNameRight = 1500;
        background = "white";
        paddingY = 0;
        // Expected width/height: 1920x1440 1:1.3333
        break;
      case "LIF": // Exodus
        footerHeight = 146;
        deviceNameLeft = 3600;
        deviceNameRight = 4736;
        paddingY = 0;
        background = "black";
        // Expected width/height: 4736x2664 1:1.7777
        break;
      case "Ltl Acorn":
        footerHeight = 80;
        deviceNameLeft = 2640;
        deviceNameRight = 4000;
        paddingY = 0;
        background = "#dcdcdc";
        if (exif.Software && exif.Software.trim() === "V1.48") {
          // TODO - maybe some fuzziness here
          // Expected width/height: 2560x1920 1:1.333
        } else if (exif.Software && exif.Software.trim() === "V3.06A") {
          // Expected width/height: 4000x3000  4:3 1:1.333
        }
        // Actually, no device name found, so we mostly just want to trim the footer I think.
        break;
    }

    const footerLocationY = height - footerHeight;
    const textFooter = await createImageBitmap(
      fileBlob,
      deviceNameLeft,
      footerLocationY,
      deviceNameRight - deviceNameLeft,
      footerHeight
    );
    // Add padding if needed:
    if (paddingY !== 0) {
      if (ctx) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, textFooter.width, textFooter.height + paddingY);
        ctx.drawImage(textFooter, 0, paddingY / 2);
        ocr.loadImage(
          ctx.getImageData(0, 0, textFooter.width, textFooter.height + paddingY)
        );
      }
    } else {
      ocr.loadImage(textFooter);
    }
    const boxes = ocr.getTextBoxes("word");
    console.log(JSON.stringify(boxes));
    ocr.clearImage();
    ratio = height / width;
    textFooterHeight = textFooter.height;
  }
  let croppedImage;
  if (textFooterHeight !== 0) {
    croppedImage = await createImageBitmap(
      fileBlob,
      0,
      0,
      width,
      height - textFooterHeight,
      {
        resizeWidth: 1280,
        resizeHeight: Math.round(1280 * ratio),
        resizeQuality: "high",
      }
    );
  } else {
    croppedImage = await createImageBitmap(fileBlob, {
      resizeWidth: 1280,
      resizeQuality: "high",
    });
  }
  let webp;
  if (ctx) {
    ctx.drawImage(croppedImage, 0, 0);
    const imageData = ctx.getImageData(
      0,
      0,
      croppedImage.width,
      croppedImage.height
    );
    webp = await encode(imageData, {
      quality: 50, // Default is 75?
    });
    //console.log("Webp size", webp.byteLength);
  }

  let thumbWebp;
  if (ctx) {
    const w = croppedImage.height;
    const offsetX = (croppedImage.width - w) / 2;
    ctx.drawImage(croppedImage, offsetX, 0, w, w, 0, 0, 128, 128);
    const imageData = ctx.getImageData(0, 0, 128, 128);
    thumbWebp = await encode(imageData, {
      quality: 50, // Default is 75?
    });
    //console.log("Thumb Webp size", thumbWebp.byteLength);
  }

  //console.log("Took", performance.now() - start);
  return {
    fileHash: hash,
    derivedFile: webp || new ArrayBuffer(0),
    thumbFile: thumbWebp || new ArrayBuffer(0),
    additionalMetadata,
    recordingDateTime,
  };
};

let threadIndex = -1;
let canvas: HTMLCanvasElement;
self.addEventListener("message", async ({ data: { type, data } }) => {
  switch (type) {
    case "thread-id":
      threadIndex = data.threadIndex;
      canvas = data.canvas;
      self.postMessage({ type: "ack", data: { type }, threadIndex });
      break;
    case "job":
      {
        const rawFileName = data.fileName;
        const derivedFileName = rawFileName.split(".");
        derivedFileName.pop();
        derivedFileName.push("webp");
        const thumbFileName = rawFileName.split(".");
        thumbFileName.pop();
        thumbFileName[thumbFileName.length - 1] += "-thumb";
        thumbFileName.push("webp");
        const { fileHash, derivedFile, thumbFile, recordingDateTime } =
          await processFile(data.file, canvas);
        self.postMessage({
          type: "finish",
          data: {
            type,
            rawFile: data.file,
            derivedFile,
            fileHash,
            rawFileName,
            derivedFileName: derivedFileName.join("."),
            thumbFile,
            thumbFileName: thumbFileName.join("."),
            recordingDateTime,
          },
          threadIndex,
        });
      }
      break;
  }
});
self.postMessage({ type: "init" });
