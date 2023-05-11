import { sha1 } from "hash-wasm";
import EXIF from "exif-js";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { supportsFastBuild, createOCREngine } from "tesseract-wasm";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import type { OCREngine } from "tesseract-wasm";
import { encode } from "@jsquash/webp";
import * as process from "process";
import { add } from "@/components/cptv-player/motion-paths.ts";

// 1. Do exif decode
// 2. Do Ocr to find the possible group name.
// 3. Make cropped and resized image as jpeg (using some decent jpeg encoder, or a more advanced image format.)

let ocr: OCREngine;

const filePromise = async (file: FileSystemFileEntry): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    file.file(resolve, reject);
  });
};

const processFile = async (
  fileBlob: Blob,
  canvas: HTMLCanvasElement
): Promise<
  | {
      fileHash: string;
      derivedFile: ArrayBuffer;
      thumbFile: ArrayBuffer;
      recordingDateTime: Date;
      additionalMetadata?: Record<string, string | number | string[]>;
      success: true;
    }
  | { success: false; reason: string }
> => {
  const additionalMetadata: Record<string, string | number | string[]> = {};
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
  // TODO: Get the JPEG resolution via exif data
  // We may actually want to use the full size decoded image to

  // Okay, so based on the model, we know *exactly* where to look for the device name in the image,
  // so that we can check it against the proxy device name, or at least ensure that it doesn't change.
  // So maybe in device table, we need an aliases field for trailcams, where we list other names it's known by?

  // When we first see a new device name from an image where no aliases are set, ask if we'd like to rename the
  // device to that devicename?

  // If GPS coords exist, and they change, cool.  But if the device itself changes, that is a problem.
  const fileBytes = await fileBlob.arrayBuffer();
  const hash = await sha1(new Uint8Array(fileBytes));
  const exif = EXIF.readFromBinaryFile(fileBytes);

  // TODO: If there's no EXIF data, then this isn't a raw trailcam image, and we should return an error
  if (!exif) {
    return {
      success: false,
      reason: "No EXIF data found",
    };
  }
  const model = (exif.Model || "").trim();
  const width = exif.PixelXDimension;
  const height = exif.PixelYDimension;

  additionalMetadata.width = width;
  additionalMetadata.height = height;

  const dateTime = exif.DateTime;
  let recordingDateTime = new Date();
  if (dateTime) {
    const [[year, month, day], [hour, minute, second]] = dateTime
      .split(" ")
      .map((x: string) => x.split(":").map(Number));
    recordingDateTime = new Date(year, month - 1, day, hour, minute, second);
  }

  // Maybe this should be normalised to 0..1.0 coords
  let footerHeight = 47;
  let background = "black";
  let paddingY = 20;
  const ctx = canvas.getContext("2d", {
    willReadFrequently: true,
    desynchronized: true,
  });
  let textFooterHeight = 0;
  let ratio = 0;

  // TODO: Should we try and find the bottom slice if we don't have exif data, or don't recognise the model?
  if (exif.ShutterSpeedValue) {
    additionalMetadata.shutterSpeed = exif.ShutterSpeedValue;
  }
  if (exif.FocalLength) {
    additionalMetadata.focalLength = exif.FocalLength;
    if (exif.FocalLengthIn35mmFilm) {
      additionalMetadata.focalLength += ` (35mm equiv: ${exif.FocalLengthIn35mmFilm})`;
    }
  }
  if (exif.ISOSpeedRatings) {
    additionalMetadata.ISO = exif.ISOSpeedRatings;
  }
  if (exif.Software) {
    if (Array.isArray(exif.Software)) {
      additionalMetadata.softwareVersion = exif.Software.map((x: number) =>
        String.fromCharCode(x)
      ).join("");
    } else {
      additionalMetadata.softwareVersion = exif.Software.trim();
    }
  }
  if (exif.FNumber) {
    additionalMetadata.fStop = exif.FNumber;
  }
  if (exif.ApertureValue) {
    additionalMetadata.aperture = exif.ApertureValue;
  }
  if (exif.ExposureTime) {
    additionalMetadata.exposureTime = exif.ExposureTime;
  }
  if (exif.Model) {
    additionalMetadata.model = exif.Model.trim();
  }
  if (exif.Make) {
    additionalMetadata.make = exif.Make.trim();
  }
  if (exif.DateTime) {
    additionalMetadata.dateTime = exif.DateTime;
  }
  if (exif.GPSInfoIFDPointer) {
    // TODO: Try to get GPS info out.
    // Exodus and Bushnells might have this
  }

  const footerTextOffsets = [];
  if (model || exif.Model) {
    switch (model) {
      case "BTC-6PX": // Browning
        footerHeight = 47;
        footerTextOffsets.push({
          left: 1120,
          right: 1570,
          label: "deviceName",
        });
        footerTextOffsets.push({
          left: 700,
          right: 790,
          label: "temperatureC",
        });
        footerTextOffsets.push({
          left: 790,
          right: 887,
          label: "inHg",
        });
        background = "black";
        paddingY = 20;
        // Expected width/height: 2688x1504 1:1.78723404
        break;
      case "119975": // Bushnell
        footerHeight = 108;
        footerTextOffsets.push({
          left: 410,
          right: 1500,
          label: "deviceName",
        });
        footerTextOffsets.push({
          left: 820,
          right: 939,
          label: "temperatureC",
        });
        background = "white";
        paddingY = 0;
        // Expected width/height: 1920x1440 1:1.3333
        break;
      case "LIF": // Exodus
        footerHeight = 146;
        footerTextOffsets.push({
          left: 3600,
          right: 4736,
          label: "deviceName",
        });
        footerTextOffsets.push({
          left: 1975,
          right: 2500,
          label: "temperature",
        });
        paddingY = 0;
        background = "black";
        // Expected width/height: 4736x2664 1:1.7777
        break;
      case "Ltl Acorn":
      case "Ltl5210 For USA":
        footerHeight = 80;
        paddingY = 0;
        if (
          additionalMetadata.softwareVersion &&
          (additionalMetadata.softwareVersion as string).startsWith("V1")
        ) {
          background = "#dddddd";
          footerTextOffsets.push({
            left: 1020,
            right: 1220,
            label: "temperatureC",
          });
        } else {
          background = "#dcdcdc";
          if (width === 4000) {
            footerTextOffsets.push({
              left: 1320,
              right: 1660,
              label: "temperatureC",
            });
          } else if (width === 2560) {
            paddingY = 15;
            footerTextOffsets.push({
              left: 1130,
              right: 1420,
              label: "temperatureC",
            });
          }
        }

        // Actually, no device name found, so we mostly just want to trim the footer I think.
        break;
      default: {
        if (exif.Make === "BUSHNEL") {
          // NOTE, only one L
          // Model is garbage sometimes:
          footerHeight = 108;
          footerTextOffsets.push({
            left: 275,
            right: 700,
            label: "deviceName",
          });
          footerTextOffsets.push({
            left: 820,
            right: 939,
            label: "temperatureC",
          });
          background = "white";
          paddingY = 0;
          delete additionalMetadata.model;
        } else {
          return {
            success: false,
            reason: `Unknown trailcam model '${model}'`,
          };
        }
      }
    }
    const footerLocationY = height - footerHeight;
    for (const { left, right, label } of footerTextOffsets) {
      const textFooter = await createImageBitmap(
        fileBlob,
        left,
        footerLocationY,
        right - left,
        footerHeight
      );
      // Add padding if needed:
      if (paddingY !== 0) {
        if (ctx) {
          ctx.fillStyle = background;
          ctx.fillRect(0, 0, textFooter.width, textFooter.height + paddingY);
          ctx.drawImage(textFooter, 0, paddingY / 2);
          ocr.loadImage(
            ctx.getImageData(
              0,
              0,
              textFooter.width,
              textFooter.height + paddingY
            )
          );
        }
      } else {
        ocr.loadImage(textFooter);
      }

      const boxes = ocr.getTextBoxes("word");
      const text = boxes
        .filter(({ confidence }: { confidence: number }) => confidence > 0.5)
        .map(({ text }: { text: string }) => text.trim())
        .filter((text: string) => text !== "")
        .join(" ");
      if (text !== "") {
        additionalMetadata[label] = text;
      }
      ocr.clearImage();
      textFooterHeight = textFooter.height;
    }
    ratio = height / width;
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
  }
  return {
    fileHash: hash,
    derivedFile: webp || new ArrayBuffer(0),
    thumbFile: thumbWebp || new ArrayBuffer(0),
    additionalMetadata,
    recordingDateTime,
    success: true,
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
        const processResult = await processFile(data.file, canvas);
        if (processResult.success) {
          const {
            fileHash,
            derivedFile,
            thumbFile,
            recordingDateTime,
            additionalMetadata,
          } = processResult;
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
              additionalMetadata,
              success: true,
            },
            threadIndex,
          });
        } else {
          self.postMessage({
            type: "finish",
            data: {
              success: false,
              reason: processResult.reason,
            },
            threadIndex,
          });
        }
      }
      break;
  }
});
self.postMessage({ type: "init" });
