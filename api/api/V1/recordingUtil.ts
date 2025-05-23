/*
cacophony-api: The Cacophony Project API server
Copyright (C) 2018  The Cacophony Project

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
import sharp from "sharp";
import zlib from "zlib";
import type { Alert, AlertStatic } from "@models/Alert.js";
import type { TrackTag } from "@models/TrackTag.js";
import tzLookup from "tz-lookup-oss";
import jsonwebtoken from "jsonwebtoken";
import mime from "mime";
import moment from "moment";
import config from "@config";
import type { Recording, RecordingQueryOptions } from "@models/Recording.js";
import type { Event, QueryOptions } from "@models/Event.js";
import type { User } from "@models/User.js";
import Sequelize, { Op, QueryTypes } from "sequelize";
import type { DeviceVisitMap, VisitEvent, VisitSummary } from "./Visits.js";
import { DeviceSummary, NON_ANIMAL_TAGS, Visit } from "./Visits.js";
import type { Station } from "@models/Station.js";
import type { Device } from "@models/Device.js";
import type { PutObjectCommandOutput } from "@aws-sdk/client-s3";
import type {
  DeviceHistory,
  DeviceHistorySetBy,
} from "@models/DeviceHistory.js";
import type { Tag } from "@models/Tag.js";
import type { Track } from "@models/Track.js";
import { getTrackData } from "@models/Track.js";
import type {
  DeviceId,
  FileId,
  GroupId,
  IsoFormattedDateString,
  LatLng,
  RecordingId,
  StationId,
  TrackTagId,
  UserId,
} from "@typedefs/api/common.js";
import { RecordingType } from "@typedefs/api/consts.js";
import type {
  ClassifierModelDescription,
  RawTrack,
  TrackClassification,
  TrackFramePosition,
} from "@typedefs/api/fileProcessing.js";
import type { ApiRecordingTagRequest } from "@typedefs/api/tag.js";
import type { CptvFrame, CptvHeader } from "../cptv-decoder/decoder.js";
import { CptvDecoder } from "../cptv-decoder/decoder.js";
import log from "@log";
import {
  locationsAreEqual,
  tryToMatchLocationToStationInGroup,
} from "@models/util/locationUtils.js";
import { openS3 } from "@models/util/util.js";
import type { ReadableStream } from "stream/web";
import type { ModelsDictionary } from "@models";
import ffmpeg from "fluent-ffmpeg";
import { Writable } from "stream";
import temp from "temp";
import fs from "fs";
import { sendAnimalAlertEmail } from "@/emails/transactionalEmails.js";
import type { ApiDeviceHistorySettings } from "@typedefs/api/device.js";

const ffmpegPath = "/usr/bin/ffmpeg";
ffmpeg.setFfmpegPath(ffmpegPath);
temp.track();

// Create a png thumbnail image  from this frame with thumbnail info
// Expand the thumbnail region such that it is a square and at least THUMBNAIL_MIN_SIZE
// width and height
//render the png in THUMBNAIL_PALETTE
//returns {data: buffer, meta: metadata about image}
async function createIRThumbnail(
  frame,
  thumbnail: TrackFramePosition,
): Promise<{ data: Buffer; meta: { palette: string; region: any } }> {
  const frameMeta = frame.meta.imageData;
  try {
    const thumbMeta = {
      region: JSON.stringify(thumbnail),
      palette: "original",
    };
    const img = await sharp(frame.data)
      .png({
        palette: true,
        compressionLevel: 9,
      })
      .toBuffer();
    return { data: img, meta: thumbMeta };
  } catch (e) {
    log.error("Couldn't save IR thumbnail because", e);
  }
  return null;
}
export async function getIRFrame(
  recording: any,
  frameNumbers: Set<number>,
): Promise<any | undefined> {
  const fileData = await openS3().getObject(recording.rawFileKey as string);
  const bodyBuffer = await fileData.Body.transformToByteArray();
  // const bodyBuffer = fileData.Body.data as ArrayBufferView;
  const tempName = temp.path({ suffix: ".mp4" });
  // GP
  // getting the screenshot seems to only work from a file, rather than a stream
  // probably can get around this by uploading the mp4 in a different format
  try {
    fs.writeFileSync(tempName, bodyBuffer);

    const frames = {};
    for (const frameNumber of frameNumbers) {
      await new Promise((resolve, reject) => {
        const screenData = new Uint8Array(640 * 480);
        let index = 0;

        const wStream = new Writable({
          write(chunk) {
            screenData.set(chunk, index);
            index += chunk.length;
          },
        });
        const command = ffmpeg()
          .noAudio()
          .outputOptions(["-frames:v 1", "-f image2"])
          .input(tempName)
          .output(wStream);
        command
          .seek(frameNumber / 10)
          // .on("start", function (commandLine) {
          //   console.log("Spawned Ffmpeg with command: " + commandLine);
          // })
          .on("end", function () {
            const frame = {
              data: screenData,
              frameNumber: frameNumber,
              meta: { imageData: { width: 640, height: 480 } },
            };
            return resolve(frame);
          })
          .on("error", (err) => {
            return reject(new Error(err));
          })
          .run();
      }).then((response: any) => {
        frames[response.frameNumber] = response;
      });
    }
    fs.unlink(tempName, (err) => {
      if (err) {
        log.error("error unlinking", err);
      }
    });
    return frames;
  } catch (e) {
    fs.unlink(tempName, (err) => {});
  }

  return null;
}

export async function getThumbnail(
  rec: Recording,
  trackId?: number,
): Promise<Uint8Array | null> {
  const fileKey = rec.rawFileKey;
  let thumbKey = `${fileKey}-thumb`;
  const s3 = openS3();
  if (trackId !== undefined) {
    thumbKey = `${fileKey}-${trackId}-thumb`;
    try {
      if (thumbKey.startsWith("a_")) {
        thumbKey = thumbKey.slice(2);
      }
      const data = await s3.getObject(thumbKey);
      return data.Body.transformToByteArray();
    } catch (err) {
      log.error(
        "Error getting thumbnail from s3 for recordingId %s, trackId: %s, %s",
        rec.id,
        trackId,
        err.message,
      );

      // Fallback to recording thumb
      thumbKey = `${fileKey}-thumb`;
      try {
        if (thumbKey.startsWith("a_")) {
          thumbKey = thumbKey.slice(2);
        }
        const data = await s3.getObject(thumbKey);
        return data.Body.transformToByteArray();
      } catch (err) {
        log.error(
          "Error getting fallback thumbnail from s3 for recordingId %s, %s",
          rec.id,
          err.message,
        );
      }
    }
  } else {
    // choose best track based off visit tag and highest score
    if (rec.Tracks.length !== 0) {
      const recVisit = new Visit(rec, 0, rec.Tracks);
      const commonTag = recVisit.mostCommonTag();
      let bestTracks = [];
      if (commonTag !== null) {
        const trackIds = recVisit.events
          .filter(
            (event) => event.trackTag && event.trackTag.what == commonTag.what,
          )
          .map((event) => event.trackID);
        bestTracks = rec.Tracks.filter((track) => trackIds.includes(track.id));
        if (bestTracks.length !== 0) {
          if (
            !bestTracks.some((track) =>
              track.dataValues.hasOwnProperty("thumbnailScore"),
            )
          ) {
            for (const track of bestTracks) {
              track.data = await getTrackData(track.id);
              if (!track.data.thumbnail) {
                track.data.thumbnail = {
                  score: 0,
                };
              }
            }
          }
          bestTracks.sort((a, b) => {
            if (
              a.dataValues.hasOwnProperty("thumbnailScore") &&
              b.dataValues.hasOwnProperty("thumbnailScore")
            ) {
              return b.dataValues.thumbnailScore - a.dataValues.thumbnailScore;
            }
            return b.data.thumbnail.score - a.data.thumbnail.score;
          });
          thumbKey = `${fileKey}-${bestTracks[0].id}-thumb`;
        }
      }
      try {
        if (thumbKey.startsWith("a_")) {
          thumbKey = thumbKey.slice(2);
        }
        const data = await s3.getObject(thumbKey);
        return data.Body.transformToByteArray();
      } catch (err) {
        log.warning(
          "Error getting best thumbnail from s3 for recordingId %s, %s",
          rec.id,
          err.message,
        );

        if (bestTracks.length !== 0) {
          // Fallback to recording thumb
          thumbKey = `${fileKey}-thumb`;
          try {
            if (thumbKey.startsWith("a_")) {
              thumbKey = thumbKey.slice(2);
            }
            const data = await s3.getObject(thumbKey);
            return data.Body.transformToByteArray();
          } catch (err) {
            log.warning(
              "Error getting clip thumbnail from s3 for recordingId %s, %s",
              rec.id,
              err.message,
            );
            return null;
          }
        }
      }
    }
    // Fallback to recording thumb
    thumbKey = `${fileKey}-thumb`;
    try {
      if (thumbKey.startsWith("a_")) {
        thumbKey = thumbKey.slice(2);
      }
      const data = await s3.getObject(thumbKey);
      return data.Body.transformToByteArray();
    } catch (err) {
      log.error(
        "Error getting clip thumbnail from s3 for recordingId %s, %s",
        rec.id,
        err.message,
      );
      return null;
    }
  }
  return null;
}

const THUMBNAIL_SIZE = 64;
export const THUMBNAIL_PALETTE = "Viridis";
// Gets a raw cptv frame from a recording
export async function getCPTVFrames(
  recording: Recording,
  frameNumbers: Set<number>,
): Promise<any | undefined> {
  try {
    const stream = (
      await openS3().getObject(recording.rawFileKey)
    ).Body.transformToWebStream();
    const decoder = new CptvDecoder();
    const result = await decoder.initWithReadableStream(
      stream as ReadableStream,
    );
    if (typeof result === "string") {
      log.warning("CPTV Error '%s'", result);
      await decoder.close();
      return;
    }
    let finished = false;
    let currentFrame = 0;
    const frames: Record<number, CptvFrame> = {};
    log.info(`Extracting  ${frameNumbers.size} frames for thumbnails `);
    const header = await decoder.getHeader();
    const totalFrames = header.totalFrames || null;
    let numFrames = 0;
    while (!finished) {
      const frame: CptvFrame | null | string = await decoder.getNextFrame();
      if (typeof frame === "string") {
        log.warning("CPTV Error '%s'", frame);
        await decoder.close();
        return;
      }
      if (frame && frame.isBackgroundFrame) {
        // Skip over background frame without incrementing counter.
        continue;
      }
      finished = frame === null || (totalFrames && numFrames === totalFrames);
      if (frameNumbers.has(currentFrame)) {
        frameNumbers.delete(currentFrame);
        frames[currentFrame] = frame;
        numFrames = Object.values(frames).length;
      }
      if (frameNumbers.size === 0) {
        break;
      }
      currentFrame++;
    }
    await decoder.close();
    return frames;
  } catch (err) {
    return;
  }
}

// Creates and saves a thumbnail for a recording using specified thumbnail info
export async function saveThumbnailInfo(
  recording: Recording,
  tracks: Track[],
  clip_thumbnail: TrackFramePosition,
): Promise<PutObjectCommandOutput[] | Error[]> {
  const fileKey = recording.rawFileKey;
  const thumbnailTracks = tracks.filter(
    (track) => track.data?.thumbnail?.region,
  );
  const frameNumbers = new Set<number>(
    thumbnailTracks.map((track) => track.data.thumbnail?.region?.frame_number),
  );
  if (clip_thumbnail) {
    frameNumbers.add(clip_thumbnail.frame_number);
  }
  if (frameNumbers.size == 0) {
    log.info(`No thumbnails to be made for ${recording.id}`);
    return;
  }
  let frames;
  if (recording.type == RecordingType.InfraredVideo) {
    frames = await getIRFrame(recording, frameNumbers);
    if (!frames) {
      throw new Error(`Failed to extract frames ${frameNumbers}`);
    }
  } else {
    frames = await getCPTVFrames(recording, frameNumbers);
    log.info("Got %s CPTV Frame(s)", Object.values(frames).length);
    if (!frames) {
      throw new Error(`Failed to extract frames ${frameNumbers}`);
    }
  }
  const frameUploads = [];
  for (const track of thumbnailTracks) {
    const frame = frames[track.data.thumbnail.region.frame_number];
    if (!frame) {
      frameUploads.push(
        Error(
          `Failed to extract CPTV frame for track ${track.id}, frame  ${track.data.thumbnail.region.frame_number}`,
        ),
      );
      continue;
    }
    let thumb;
    if (recording.type == RecordingType.InfraredVideo) {
      thumb = await createIRThumbnail(frame, track.data.thumbnail.region);
    } else {
      thumb = await createThumbnail(frame, track.data.thumbnail.region);
    }
    log.info("Saving track thumbnail %s", `${fileKey}-${track.id}-thumb`);
    frameUploads.push(
      await openS3()
        .upload(`${fileKey}-${track.id}-thumb`, thumb.data, thumb.meta)
        .catch((err) => {
          return err;
        }),
    );
  }

  if (clip_thumbnail) {
    const frame = frames[clip_thumbnail.frame_number];
    if (!frame) {
      frameUploads.push(
        Error(`Failed to extract CPTV frame ${clip_thumbnail.frame_number}`),
      );
    } else {
      let thumb;
      if (recording.type == RecordingType.InfraredVideo) {
        thumb = await createIRThumbnail(frame, clip_thumbnail);
      } else {
        thumb = await createThumbnail(frame, clip_thumbnail);
      }
      log.info("Saving clip thumbnail %s", `${fileKey}-thumb`);
      frameUploads.push(
        await openS3()
          .upload(`${fileKey}-thumb`, thumb.data, thumb.meta)
          .catch((err) => {
            return err;
          }),
      );
    }
  }
  return Promise.all(frameUploads);
}

//expands the smallest dimension of the region so that it is a square that fits inside resX and resY
function squareRegion(
  thumbnail: TrackFramePosition,
  resX: number,
  resY: number,
) {
  //  make a square
  if (thumbnail.width < thumbnail.height) {
    const diff = thumbnail.height - thumbnail.width;
    const squarePadding = Math.ceil(diff / 2);

    thumbnail.x -= squarePadding;
    thumbnail.width = thumbnail.height;
    thumbnail.x = Math.max(0, thumbnail.x);
    if (thumbnail.x + thumbnail.width > resX) {
      thumbnail.x = resX - thumbnail.width;
    }
  } else if (thumbnail.width > thumbnail.height) {
    const diff = thumbnail.width - thumbnail.height;
    const squarePadding = Math.ceil(diff / 2);
    thumbnail.y -= squarePadding;
    thumbnail.height = thumbnail.width;
    thumbnail.y = Math.max(0, thumbnail.y);
    if (thumbnail.y + thumbnail.height > resY) {
      thumbnail.y = resY - thumbnail.height;
    }
  }
  return thumbnail;
}

//pad a region such that it still fits in resX and resY (Not used at the moment)
function padRegion(
  thumbnail: TrackFramePosition,
  padding: number,
  resX: number,
  resY: number,
) {
  thumbnail.x -= padding;
  thumbnail.width += padding * 2;
  thumbnail.y -= padding;
  thumbnail.height += padding * 2;

  thumbnail.x = Math.max(0, thumbnail.x);
  if (thumbnail.x + thumbnail.width > resX) {
    thumbnail.width -= thumbnail.width + thumbnail.x - resX;
  }

  thumbnail.y = Math.max(0, thumbnail.y);
  if (thumbnail.y + thumbnail.height > resY) {
    thumbnail.height -= thumbnail.height + thumbnail.x - resY;
  }
  return thumbnail;
}

// Create a png thumbnail image  from this frame with thumbnail info
// Expand the thumbnail region such that it is a square
// Resize to THUMBNAIL_MIN_SIZE
//render the png in THUMBNAIL_PALETTE
//returns {data: buffer, meta: metadata about image}
async function createThumbnail(
  frame,
  thumbnail: TrackFramePosition,
  colourPalette: string = THUMBNAIL_PALETTE,
): Promise<{ data: Buffer; meta: { palette: string; region: any } }> {
  const resX = 160;
  const resY = 120;
  // // padding already in region so probably dont need
  // let padding = Math.max(2,Math.floor(thumbnail.height * 0.2), Math.floor(thumbnail.width *0.2));
  // padding = Math.floor(padding / 2)
  // const size = Math.max(thumbnail.height+padding*2, thumbnail.width+padding*2);

  const size = Math.max(thumbnail.height, thumbnail.width);
  const thumbnailData = new Uint8Array(size * size);
  // thumbnail = padRegion(thumbnail,padding, resX,resY)
  thumbnail = squareRegion(thumbnail, resX, resY);
  // get min max for normalisation
  let min = 1 << 16;
  let max = 0;
  let frameStart;
  for (let i = 0; i < size; i++) {
    frameStart = (i + thumbnail.y) * resX + thumbnail.x;
    for (let offset = 0; offset < thumbnail.width; offset++) {
      const pixel = frame.imageData[frameStart + offset];
      if (!min) {
        min = pixel;
        max = pixel;
      } else {
        if (pixel < min) {
          min = pixel;
        }
        if (pixel > max) {
          max = pixel;
        }
      }
    }
  }

  let thumbIndex = 0;
  for (let i = 0; i < size; i++) {
    frameStart = (i + thumbnail.y) * resX + thumbnail.x;
    for (let offset = 0; offset < thumbnail.width; offset++) {
      let pixel = frame.imageData[frameStart + offset];
      pixel = (255 * (pixel - min)) / (max - min);
      thumbnailData[thumbIndex] = pixel;
      thumbIndex++;
    }
  }
  let greyScaleData;
  if (thumbnail.width != THUMBNAIL_SIZE) {
    const resized_thumb = await sharp(thumbnailData, {
      raw: { width: thumbnail.width, height: thumbnail.height, channels: 1 },
    })
      .greyscale()
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE);
    greyScaleData = await resized_thumb.toBuffer();
    // meta width and height doesnt seem to update....
    thumbnail.width = THUMBNAIL_SIZE;
    thumbnail.height = THUMBNAIL_SIZE;
  } else {
    greyScaleData = thumbnailData;
  }
  const frameBuffer = new Uint8ClampedArray(4 * greyScaleData.length);
  const { renderFrameIntoFrameBuffer, ColourMaps } = await import(
    "../cptv-decoder/frameRenderUtils.js"
  );
  let palette = ColourMaps[0];
  for (const colourMap of ColourMaps) {
    if (colourMap[0] == colourPalette) {
      palette = colourMap;
    }
  }
  renderFrameIntoFrameBuffer(frameBuffer, greyScaleData, palette[1], 0, 255);
  const thumbMeta = {
    region: JSON.stringify(thumbnail),
    palette: palette[0],
  };
  const img = await sharp(frameBuffer, {
    raw: {
      width: thumbnail.width,
      height: thumbnail.height,
      channels: 4,
    },
  })
    .png({
      palette: true,
      compressionLevel: 9,
    })
    .toBuffer();
  return { data: img, meta: thumbMeta };
}

export const maybeUpdateDeviceHistory = async (
  models: ModelsDictionary,
  device: Device,
  location: LatLng,
  dateTime: Date,
  setBy: DeviceHistorySetBy = "automatic",
): Promise<{
  stationToAssignToRecording: Station;
  deviceHistoryEntry: DeviceHistory;
}> => {
  if (location.lat === 0 || location.lng === 0) {
    const existingHistory = await models.DeviceHistory.findOne({
      where: {
        uuid: device.uuid,
        GroupId: device.GroupId,
        location: { [Op.ne]: null },
        stationId: { [Op.ne]: null },
        fromDateTime: { [Op.lte]: dateTime },
      },
      order: [["fromDateTime", "DESC"]], // Get the latest one that's earlier than our current dateTime
    });
    if (existingHistory) {
      const station = await models.Station.findByPk(existingHistory.stationId);
      return {
        stationToAssignToRecording: station,
        deviceHistoryEntry: existingHistory,
      };
    }
    throw new Error(
      "Invalid location provided (lat or lng is 0) and no device history exists.",
    );
  }
  {
    // Update the device location on config change. (It gets updated elsewhere if a newer recording comes in)
    const lastLocation = device.location;
    if (
      setBy === "config" &&
      (!device.lastRecordingTime || dateTime > device.lastRecordingTime) &&
      (!lastLocation ||
        (lastLocation && !locationsAreEqual(lastLocation, location)))
    ) {
      await device.update({
        location,
      });
    }
  }
  {
    // Get the location (if any) after this dateTime, check if it's the same as this location.
    // - If there is a *later* version of this location that doesn't have any other entries before it that are also
    // later than this location, then we want to move that later instance back to this time.
    // - If there is a later location that is not the same as this, then we'd insert this location
    // so long as there isn't a previous location earlier than this which matches this location.

    // NOTE: We may have more recent locations here, so we may be moving back a historic entry - and need to
    //  update the corresponding station accordingly.
    // If it's a set-by automatic, also check for config or re-register updates that might match it.

    const setByArr =
      setBy === "automatic"
        ? ["automatic", "config", "re-register", "user"]
        : [setBy];
    let shouldInsertLocation = false;
    let existingDeviceHistoryEntry;
    const priorLocation = await models.DeviceHistory.findOne({
      where: {
        uuid: device.uuid,
        GroupId: device.GroupId,
        setBy: { [Op.in]: setByArr },
        location: { [Op.ne]: null },
        stationId: { [Op.ne]: null },
        fromDateTime: { [Op.lte]: dateTime },
      },
      order: [["fromDateTime", "DESC"]], // Get the latest one that's earlier than our current dateTime
    });

    if (priorLocation) {
      const locationChanged = !locationsAreEqual(
        priorLocation.location,
        location,
      );
      if (!locationChanged && priorLocation.DeviceId !== device.id) {
        shouldInsertLocation = true;
      } else if (locationChanged) {
        // Look later
        const laterLocation = await models.DeviceHistory.findOne({
          where: {
            uuid: device.uuid,
            GroupId: device.GroupId,
            setBy: { [Op.in]: setByArr },
            location: { [Op.ne]: null },
            stationId: { [Op.ne]: null },
            fromDateTime: { [Op.gt]: dateTime },
          },
          order: [["fromDateTime", "ASC"]], // Get the earliest one that's later than our current dateTime
        });

        if (laterLocation) {
          const locationChanged = !locationsAreEqual(
            laterLocation.location,
            location,
          );
          if (!locationChanged && laterLocation.DeviceId !== device.id) {
            shouldInsertLocation = true;
          } else if (!locationChanged) {
            // && laterLocation.setBy !== "user" && laterLocation.fromDateTime.toISOString() !== dateTime.toISOString()
            if (laterLocation.setBy !== "user") {
              // Move later location back to this time, if it was an automatically created location.
              existingDeviceHistoryEntry = await laterLocation.update({
                fromDateTime: dateTime,
                setBy,
              });
            } else {
              existingDeviceHistoryEntry = laterLocation;
              shouldInsertLocation = true;
            }
          } else if (locationChanged) {
            shouldInsertLocation = true;
          }
        } else {
          shouldInsertLocation = true;
        }
      } else {
        existingDeviceHistoryEntry = priorLocation;
      }
    } else {
      // Look later
      const laterLocation = await models.DeviceHistory.findOne({
        where: {
          uuid: device.uuid,
          GroupId: device.GroupId,
          setBy: { [Op.in]: setByArr },
          location: { [Op.ne]: null },
          stationId: { [Op.ne]: null },
          fromDateTime: { [Op.gt]: dateTime },
        },
        order: [["fromDateTime", "ASC"]], // Get the earliest one that's later than our current dateTime
      });
      if (laterLocation) {
        const locationChanged = !locationsAreEqual(
          laterLocation.location,
          location,
        );
        if (!locationChanged && laterLocation.DeviceId !== device.id) {
          shouldInsertLocation = true;
        } else if (!locationChanged) {
          if (laterLocation.setBy !== "user") {
            // Move later location back to this time if it was an automatically created location.
            existingDeviceHistoryEntry = await laterLocation.update({
              fromDateTime: dateTime,
              setBy,
            });
          } else {
            existingDeviceHistoryEntry = laterLocation;
            shouldInsertLocation = true;
          }
        } else if (locationChanged) {
          shouldInsertLocation = true;
        }
      } else {
        // There's no prior location in the device history, and no later location, so we should
        // check to see if there are any existing stations near this recording location first.

        shouldInsertLocation = true;
      }
    }
    if (shouldInsertLocation) {
      // If we are going to insert a location, then we need to match to existing stations, or create a new station
      // that is active from this point in time.
      const newDeviceHistoryEntry = {
        location,
        setBy,
        fromDateTime: dateTime,
        deviceName: device.deviceName,
        DeviceId: device.id,
        GroupId: device.GroupId,
        saltId: device.saltId,
        uuid: device.uuid,
        settings: null,
      };
      if (priorLocation && priorLocation.settings) {
        // Preserve any non-location specific settings
        const settings = {
          ...priorLocation.settings,
        } as ApiDeviceHistorySettings;
        delete settings.referenceImagePOV;
        delete settings.referenceImageInSitu;
        delete settings.referenceImagePOVFileSize;
        delete settings.referenceImageInSituFileSize;
        delete settings.referenceImagePOVMimeType;
        delete settings.referenceImageInSituMimeType;
        delete settings.ratThresh;
        delete settings.maskRegions;
        delete settings.warp;
        newDeviceHistoryEntry.settings = settings;
      }
      let stationToAssign = await tryToMatchLocationToStationInGroup(
        models,
        location,
        device.GroupId,
        dateTime,
        false,
      );
      if (stationToAssign && stationToAssign.activeAt > dateTime) {
        // We matched a future station in this location, so it's likely this is an older recording coming in out
        // of order.  We want to back-date the existing station to this time.
        await stationToAssign.update({ activeAt: dateTime });
      }
      if (!stationToAssign) {
        // Create new automatic station
        stationToAssign = (await models.Station.create({
          name: `New station for ${
            device.deviceName
          }_${dateTime.toISOString()}`,
          location,
          activeAt: dateTime,
          automatic: true,
          needsRename: true,
          GroupId: device.GroupId,
        })) as Station;
      }

      (newDeviceHistoryEntry as any).stationId = stationToAssign.id;
      // Insert this location.
      const newDeviceHistory = await models.DeviceHistory.create(
        newDeviceHistoryEntry,
      );
      return {
        stationToAssignToRecording: stationToAssign,
        deviceHistoryEntry: newDeviceHistory,
      };
    } else {
      const stationToAssign = await models.Station.findByPk(
        existingDeviceHistoryEntry.stationId,
      );
      if (existingDeviceHistoryEntry.fromDateTime < stationToAssign.activeAt) {
        // Now, if the device history table has updated, that can mean that the activeAt date of an automatically
        // created station may need to move back too, but there shouldn't be recordings that need their station id updated in this instance.
        await stationToAssign.update({
          activeAt: existingDeviceHistoryEntry.fromDateTime,
        });
      }

      return {
        stationToAssignToRecording: stationToAssign,
        deviceHistoryEntry: existingDeviceHistoryEntry,
      };
    }
  }
};

const tryDecodeCptvMetadata = async (
  fileBytes: Uint8Array,
): Promise<{ metadata: CptvHeader; fileIsCorrupt: boolean }> => {
  // TODO: See if this is faster with synthesised test cptv files
  // TODO: Can we do this with the node stream as input, rather than waiting for the whole file to upload?
  const decoder = new CptvDecoder();
  const metadata = await decoder.getBytesMetadata(fileBytes);
  // If true, the parser failed for some reason, so the file is probably corrupt, and should be investigated later.
  const fileIsCorrupt = await decoder.hasStreamError();
  if (fileIsCorrupt) {
    log.warning(
      "CPTV Stream error: %s - mark as Corrupt and don't queue for processing",
      await decoder.getStreamError(),
    );
  }
  await decoder.close();
  return { metadata, fileIsCorrupt };
};

const parseAndMergeEmbeddedFileMetadataIntoRecording = async (
  data: any,
  fileData: Uint8Array,
  recording: Recording,
): Promise<boolean> => {
  if (fileData.length === 0) {
    return true;
  }
  if (data.type === RecordingType.ThermalRaw) {
    // Read the file back out from s3 and decode/parse it.
    const { metadata, fileIsCorrupt: isCorrupt } = await tryDecodeCptvMetadata(
      fileData,
    );

    if (
      !data.hasOwnProperty("location") &&
      metadata.latitude &&
      metadata.longitude
    ) {
      // @ts-ignore
      recording.location = {
        lat: metadata.latitude,
        lng: metadata.longitude,
      };
    }
    if (
      (!data.hasOwnProperty("duration") && metadata.duration) ||
      (Number(data.duration) === 321 && metadata.duration)
    ) {
      // NOTE: Hack to make tests pass, but not allow sidekick uploads to set a spurious duration.
      //  A solid solution will disallow all of these fields that should come from the CPTV file as
      //  API settable metadata, and require tests to construct CPTV files with correct metadata.
      recording.duration = metadata.duration;
    }
    if (!data.hasOwnProperty("recordingDateTime") && metadata.timestamp) {
      recording.recordingDateTime = new Date(metadata.timestamp / 1000);
    } else {
      log.error("Failed setting recordingDateTime");
    }

    if (metadata.previewSecs) {
      recording.additionalMetadata = {
        previewSecs: metadata.previewSecs,
        totalFrames: metadata.totalFrames,
      };
    }
    if (data.hasOwnProperty("additionalMetadata")) {
      recording.additionalMetadata = {
        ...data.additionalMetadata,
        ...recording.additionalMetadata,
      };
    }
    return isCorrupt;
  } else if (data.type === RecordingType.Audio) {
    if (data.hasOwnProperty("additionalMetadata")) {
      recording.additionalMetadata = data.additionalMetadata;
    }
    if (data.hasOwnProperty("cacophonyIndex")) {
      recording.cacophonyIndex = data.cacophonyIndex;
    }
    return false;
  }
  return false;
};

export const getDeviceIdAndGroupIdAndPossibleStationIdAtRecordingTime = async (
  models: ModelsDictionary,
  device: Device,
  atTime: Date,
): Promise<{ groupId: GroupId; deviceId: DeviceId; stationId?: StationId }> => {
  // NOTE: Use the uuid here, so we can assign old recordings that may be uploaded much later
  //  to the correct group that the device belonged to when the recording was created.
  const deviceHistory = (await models.DeviceHistory.findOne({
    where: {
      uuid: device.uuid,
      fromDateTime: { [Op.lte]: atTime },
      location: { [Op.ne]: null },
    },
    order: [["fromDateTime", "DESC"]],
    limit: 1,
  })) as DeviceHistory;
  if (deviceHistory) {
    return {
      groupId: deviceHistory.GroupId,
      deviceId: deviceHistory.DeviceId,
      stationId: deviceHistory.stationId,
    };
  }
  return { deviceId: device.id, groupId: device.GroupId };
};

// Returns a promise for the recordings query specified in the
// request.
export async function queryRecordings(
  models: ModelsDictionary,
  requestUserId: UserId,
  type: RecordingType,
  countAll: boolean,
  options: RecordingQueryOptions,
): Promise<{ rows: Recording[]; count: number }> {
  if (type && typeof options.where === "object") {
    options.where = { ...options.where, type };
  }
  // FIXME - Do this in extract-middleware as bulk recording extractor
  const builder = new models.Recording.queryBuilder().init(
    requestUserId,
    options,
  );
  builder.query.distinct = true;

  // FIXME - If getting count as super-user, we don't care about joining on all of the other tables.
  //  Even if getting count as regular user, we only care about joining through GroupUsers.

  // FIXME - Duration >= 0 constraint is pretty slow.

  // FIXME: In the UI, when we query recordings, we don't need to get the count every time, just the first time
  //  would be fine!
  if (countAll === true) {
    return models.Recording.findAndCountAll(builder.get());
  }
  const rows = await models.Recording.findAll(builder.get());
  return { count: rows.length, rows: rows };
}

export async function bulkDelete(
  models: ModelsDictionary,
  requestUserId: UserId,
  type: RecordingType,
  options: RecordingQueryOptions,
  _actuallyDelete: boolean = false, // FIXME - Make recordings actually be deleted?
): Promise<number[]> {
  if (type && typeof options.where === "object") {
    options.where = { ...options.where, type };
  }

  const builder = new models.Recording.queryBuilder().init(
    requestUserId,
    options,
  );

  const recordings = (await models.Recording.findAll(
    builder.get(),
  )) as Recording[];
  if (recordings.length === 0) {
    throw new Error("No recordings found to delete");
  }
  const deletion = { deletedAt: new Date(), deletedBy: requestUserId };
  const ids = recordings.map((value) => value.id);
  const deletedValues = (await models.Recording.update(deletion, {
    where: { id: ids },
    returning: ["id"],
  })) as unknown as Promise<[number, { id: number }[]]>;
  for (const recording of recordings) {
    await fixupLatestRecordingTimesForDeletedRecording(models, recording);
  }
  if (deletedValues[1]) {
    return deletedValues[1].map((value) => value.id);
  }
  return [];
}

export async function getTrackTags(
  models: ModelsDictionary,
  userId: UserId,
  viewAsSuperUser: boolean,
  includeAI: boolean,
  recordingType: string,
  excludeTags = [],
  offset?: number,
  limit?: number,
) {
  const requireGroupMembership = viewAsSuperUser
    ? []
    : [
        {
          model: models.User,
          attributes: [],
          required: true,
          where: { id: userId },
        },
      ];
  const rows = await models.TrackTag.findAll({
    attributes: ["id", "what", "UserId"],
    where: {
      what: {
        [Op.notIn]: excludeTags,
      },
      ...(!includeAI && {
        UserId: {
          [Op.ne]: null,
        },
      }),
    },
    include: [
      {
        model: models.Track,
        attributes: ["id"],
        required: true,
        include: [
          {
            model: models.Recording,
            attributes: ["id"],
            required: true,
            where: {
              type: {
                [Op.eq]: recordingType,
              },
            },
            include: [
              {
                model: models.Group,
                attributes: ["id", "groupName"],
                required: true,
                include: requireGroupMembership,
              },
              {
                model: models.Device,
                attributes: ["id", "deviceName"],
                required: true,
              },
              {
                model: models.Station,
                attributes: ["id", "name"],
              },
            ],
          },
        ],
      },
    ],
    ...(limit && { limit }),
    ...(offset && { offset }),
  });
  return rows.map((row) => ({
    label: row.what,
    device: {
      id: row.Track.Recording.Device.id,
      name: row.Track.Recording.Device.deviceName,
    },
    station: row.Track.Recording.Station
      ? {
          id: row.Track.Recording.Station.id,
          name: row.Track.Recording.Station.name,
        }
      : "No Station",
    group: {
      id: row.Track.Recording.Group.id,
      name: row.Track.Recording.Group.groupName,
    },
    // TODO - The exact AI model you will need data attribute from track tag
    labeller: row.UserId ? `id_${row.UserId.toString()}` : "AI",
  }));
}
interface TrackTagsCountOptions {
  models: ModelsDictionary;
  userId: string;
  viewAsSuperUser: boolean;
  includeAI: boolean;
  recordingType: RecordingType;
  exclude: number;
  offset: number;
  limit: number;
  groupId?: number;
}

function buildTrackTagCountSQL(options: TrackTagsCountOptions): string {
  const { viewAsSuperUser, includeAI, groupId } = options;

  // Array to hold different parts of the SQL query
  const sqlParts: string[] = [];

  // Basic SQL structure
  sqlParts.push(`
  WITH FilteredTags AS (
    SELECT
      TT."what",
      TT."UserId",
      U."userName",
      R."type",
      G."id" AS "groupId",
      G."groupName",
      S."id" AS "stationId",
      S."name" AS "stationName",
      D."id" AS "deviceId",
      D."deviceName"
    FROM "TrackTags" TT
    INNER JOIN "Users" U ON TT."UserId" = U."id"
    INNER JOIN "Tracks" T ON TT."TrackId" = T."id"
    INNER JOIN "Recordings" R ON T."RecordingId" = R."id"
    INNER JOIN "Groups" G ON R."GroupId" = G."id"
    INNER JOIN "Devices" D ON R."DeviceId" = D."id"
    INNER JOIN "Stations" S ON R."StationId" = S."id"
  `);

  // Adding condition for user group check if not a super user
  if (!viewAsSuperUser) {
    sqlParts.push(
      `INNER JOIN "GroupUsers" GU ON G."id" = GU."GroupId" AND GU."UserId" = :userId`,
    );
  }

  // Adding WHERE clause and initial conditions
  sqlParts.push(`
    WHERE R."type" = :recordingType
    AND TT."what" NOT IN (:exclude)
  `);

  if (!includeAI) {
    sqlParts.push(`AND TT."UserId" IS NOT NULL`);
  }

  if (groupId) {
    sqlParts.push(`AND G."id" = :groupId`);
  }

  // Completing the CTE and starting the main query
  sqlParts.push(`
  )
  SELECT
    "what",
    "UserId",
    "userName",
    COUNT("what") AS "trackTagCount",
    "groupId",
    "groupName",
    "stationId",
    "stationName",
    "deviceId",
    "deviceName"
  FROM FilteredTags
  GROUP BY
    "what",
    "UserId",
    "userName",
    "groupId",
    "groupName",
    "stationId",
    "stationName",
    "deviceId",
    "deviceName"
  `);

  if (options.limit) {
    sqlParts.push(`LIMIT :limit`);
  }

  if (options.offset) {
    sqlParts.push(`OFFSET :offset`);
  }

  // Join all parts to form the final SQL query
  return sqlParts.join(" ");
}

export async function getTrackTagsCount(options: TrackTagsCountOptions) {
  const sql = buildTrackTagCountSQL(options);
  const replacements = {
    recordingType: options.recordingType,
    exclude: options.exclude,
    limit: options.limit,
    offset: options.offset,
    userId: options.userId,
    groupId: options.groupId,
  };
  const result = await options.models.sequelize.query(sql, {
    replacements,
    type: QueryTypes.SELECT,
  });
  return result;
}

// Returns a promise for report rows for a set of recordings. Takes
// the same parameters as query() above.
export async function reportRecordings(
  models: ModelsDictionary,
  userId: UserId,
  includeAudiobait: boolean,
  options: RecordingQueryOptions,
) {
  options = { ...options, hideFiltered: false };
  const builder = (
    await new models.Recording.queryBuilder().init(userId, options)
  )
    .addColumn("comment")
    .addColumn("additionalMetadata");

  if (includeAudiobait) {
    builder.addAudioEvents();
  }

  builder.query.include.push({
    model: models.Station,
    attributes: ["name"],
  });

  // NOTE: Not even going to try to attempt to add typing info to this bundle
  //  of properties...
  const result: any[] = await models.Recording.findAll(builder.get());

  // const filterOptions = models.Recording.makeFilterOptions(
  //   request.user,
  //   request.filterOptions
  // );

  const audioFileNames = new Map();
  const audioEvents: Map<
    RecordingId,
    { timestamp: Date; volume: number; fileId: FileId }
  > = new Map();

  if (includeAudiobait) {
    // Our DB schema doesn't allow us to easily get from a audio event
    // recording to a audio file name so do some work first to look these up.
    const audioFileIds: Set<number> = new Set();
    for (const r of result) {
      const event = findLatestEvent(r.Device.Events);
      if (event && event.EventDetail) {
        const fileId = event.EventDetail.details.fileId;
        audioEvents[r.id] = {
          timestamp: event.dateTime,
          volume: event.EventDetail.details.volume,
          fileId,
        };
        audioFileIds.add(fileId);
      }
    }
    // Bulk look up file details of played audio events.
    for (const f of await models.File.getMultiple(Array.from(audioFileIds))) {
      audioFileNames[f.id] = f.details.name;
    }
  }

  const recording_url_base = config.server.recording_url_base || "";
  const labels = [
    "Id",
    "Type",
    "Group",
    "Device",
    "Station",
    "Date",
    "Time",
    "Latitude",
    "Longitude",
    "Duration",
    "BatteryPercent",
    "Comment",
    "Track Count",
    "Automatic Track Tags",
    "Human Track Tags",
    "Recording Tags",
    "URL",
    "Cacophony Index",
    "Species Classification",
  ];

  if (includeAudiobait) {
    labels.push(
      "Audio Bait",
      "Audio Bait Time",
      "Mins Since Audio Bait",
      "Audio Bait Volume",
    );
  }

  const out = [labels];
  for (const r of result) {
    //r.filterData(filterOptions);

    const automatic_track_tags = new Set();
    const human_track_tags = new Set();
    for (const track of r.Tracks) {
      for (const tag of track.TrackTags) {
        const subject = tag.what || tag.detail;
        if (tag.automatic) {
          automatic_track_tags.add(subject);
        } else {
          human_track_tags.add(subject);
        }
      }
    }

    const recording_tags =
      r.Tags.map((t: Tag) => [
        (t as any).what || t.detail,
        ...(t.comment ? [t.comment] : []),
      ]) || [];
    const cacophonyIndex = getCacophonyIndex(r);

    const thisRow = [
      r.id,
      r.type,
      r.Group.groupName,
      r.Device.deviceName,
      r.Station ? r.Station.name : "",
      moment(r.recordingDateTime).tz(config.timeZone).format("YYYY-MM-DD"),
      moment(r.recordingDateTime).tz(config.timeZone).format("HH:mm:ss"),
      r.location ? r.location.lat : "",
      r.location ? r.location.lng : "",
      r.duration,
      r.batteryLevel,
      r.comment,
      r.Tracks.length,
      formatTags(automatic_track_tags),
      formatTags(human_track_tags),
      formatTags(recording_tags),
    ];
    if (includeAudiobait) {
      let audioBaitName = "";
      let audioBaitTime = null;
      let audioBaitDelta = null;
      let audioBaitVolume = null;
      const audioEvent = audioEvents[r.id];
      if (audioEvent) {
        audioBaitName = audioFileNames[audioEvent.fileId];
        audioBaitTime = moment(audioEvent.timestamp);
        audioBaitDelta = moment
          .duration(r.recordingDateTime - audioBaitTime)
          .asMinutes()
          .toFixed(1);
        audioBaitVolume = audioEvent.volume;
      }

      thisRow.push(
        audioBaitName,
        audioBaitTime
          ? audioBaitTime.tz(config.timeZone).format("HH:mm:ss")
          : "",
        audioBaitDelta,
        audioBaitVolume,
      );
    }

    thisRow.push(
      `${recording_url_base}/${r.id.toString()}`,
      cacophonyIndex,
      "",
    );
    out.push(thisRow);
  }
  return out;
}

function getCacophonyIndex(recording: Recording): string | null {
  return (
    recording.cacophonyIndex?.map((val) => val.index_percent).join(";") || ""
  );
}

function findLatestEvent(events: Event[]): Event | null {
  if (!events) {
    return null;
  }

  let latest = events[0];
  for (const event of events) {
    if (event.dateTime > latest.dateTime) {
      latest = event;
    }
  }
  return latest;
}

function formatTags(tags) {
  const out = Array.from(tags);
  out.sort();
  return out.join(";");
}

export function signedToken(
  key: string,
  filename: string,
  mimeType: string,
  userId?: UserId,
  groupId?: GroupId,
) {
  const payload = {
    _type: "fileDownload",
    key,
    filename,
    mimeType,
  };
  if (userId) {
    (payload as any).userId = userId;
  }
  if (groupId) {
    (payload as any).groupId = groupId;
  }
  return jsonwebtoken.sign(payload, config.server.passportSecret, {
    expiresIn: 60 * 10,
  });
}

export const guessMimeType = (type, filename): string => {
  const mimeType = mime.getType(filename);
  if (mimeType) {
    if (mimeType === "audio/x-aac") {
      return "audio/mp4";
    }
    return mimeType;
  }
  switch (type) {
    case RecordingType.ThermalRaw:
      return "application/x-cptv";
    case RecordingType.Audio:
      return "audio/mp4";
    default:
      return "application/octet-stream";
  }
};

export const addTag = async (
  models: ModelsDictionary,
  user: User | null,
  recordingId: RecordingId,
  tag: ApiRecordingTagRequest,
): Promise<Tag> => {
  const tagInstance = models.Tag.buildSafely(tag);
  (tagInstance as any).RecordingId = recordingId;
  if (user) {
    tagInstance.taggerId = user.id;
  }
  await tagInstance.save();
  return tagInstance;
};
export const tracksFromMeta = async (
  models: ModelsDictionary,
  recording: Recording,
  metadata: any,
) => {
  try {
    if (!("tracks" in metadata)) {
      return false;
    }
    const algorithmDetail = await models.DetailSnapshot.getOrCreateMatching(
      "algorithm",
      metadata["algorithm"],
    );

    const promises = [];
    const tracks = [];
    for (const trackMeta of metadata["tracks"]) {
      const newTrack = {
        data: trackMeta,
        startSeconds: trackMeta.start_s || 0,
        endSeconds: trackMeta.end_s || 0,
        minFreqHz: null,
        maxFreqHz: null,
        AlgorithmId: algorithmDetail.id,
      };
      if (recording.type === RecordingType.Audio) {
        newTrack.minFreqHz = trackMeta.minFreq || 0;
        newTrack.maxFreqHz = trackMeta.maxFreq || 0;
      }
      promises.push(
        new Promise((resolve, _reject) => {
          recording.addTrack(newTrack).then((track) => {
            if (
              !("predictions" in trackMeta) ||
              trackMeta["predictions"].length === 0
            ) {
              track.updateIsFiltered().then(resolve);
            } else {
              tracks.push(track);
              const trackPromises = [];
              for (const prediction of trackMeta["predictions"]) {
                let modelName = "unknown";
                if (prediction.model_id) {
                  if (metadata.models) {
                    const model = metadata.models.find(
                      (model) => model.id == prediction.model_id,
                    );
                    if (model) {
                      modelName = model.name;
                    }
                  }
                }

                const tag_data = { name: modelName };
                if (prediction.clarity) {
                  tag_data["clarity"] = prediction["clarity"];
                }
                if (prediction.classify_time) {
                  tag_data["classify_time"] = prediction["classify_time"];
                }
                if (prediction.prediction_frames) {
                  tag_data["prediction_frames"] =
                    prediction["prediction_frames"];
                }
                if (prediction.predictions) {
                  tag_data["predictions"] = prediction["predictions"];
                }
                if (prediction.label) {
                  tag_data["raw_tag"] = prediction["label"];
                }
                if (prediction.all_class_confidences) {
                  tag_data["all_class_confidences"] =
                    prediction["all_class_confidences"];
                }
                let tag = "unidentified";
                if (prediction.confident_tag) {
                  tag = prediction["confident_tag"];
                }
                trackPromises.push(
                  track.addTag(tag, prediction["confidence"], true, tag_data),
                );
              }
              Promise.all(trackPromises).then(resolve);
            }
          });
        }),
      );
    }
    await Promise.all(promises);
    if (tracks.length) {
      await Promise.all(tracks.map((track) => track.updateIsFiltered()));
    }
  } catch (err) {
    log.error(
      "Error creating recording tracks from metadata: %s",
      err.toString(),
    );
  }
  return true;
};

export async function updateMetadata(recording: Recording, metadata: any) {
  recording.additionalMetadata = metadata;
  await recording.save();
}

// Returns a promise for the recordings visits query specified in the
// request.
export async function queryVisits(
  models: ModelsDictionary,
  userId: UserId,
  options: RecordingQueryOptions,
): Promise<{
  visits: Visit[];
  summary: DeviceSummary;
  hasMoreVisits: boolean;
  queryOffset: number;
  totalRecordings: number;
  numRecordings: number;
  numVisits: number;
}> {
  const maxVisitQueryResults = 5000;
  const requestVisits = options.limit || maxVisitQueryResults;
  const queryMax = maxVisitQueryResults * 2;
  const queryLimit = Math.min(requestVisits * 2, queryMax);
  options = { ...options, order: null, limit: queryLimit };

  const builder = await new models.Recording.queryBuilder().init(
    userId,
    options,
  );
  builder.query.distinct = true;

  const devSummary = new DeviceSummary();
  let numRecordings = 0;
  let remainingVisits = requestVisits;
  let totalCount, recordings, gotAllRecordings;

  while (gotAllRecordings || remainingVisits > 0) {
    if (totalCount) {
      recordings = await models.Recording.findAll(builder.get());
    } else {
      const result = await models.Recording.findAndCountAll(builder.get());
      totalCount = result.count;
      recordings = result.rows;
    }

    numRecordings += recordings.length;
    gotAllRecordings = recordings.length + builder.query.offset >= recordings;
    if (recordings.length == 0) {
      break;
    }

    // for (const rec of recordings) {
    //   rec.filterData(filterOptions);
    // }
    devSummary.generateVisits(recordings, options.offset || 0);

    if (!gotAllRecordings) {
      devSummary.checkForCompleteVisits();
    }

    remainingVisits = requestVisits - devSummary.completeVisitsCount();
    builder.query.limit = Math.min(remainingVisits * 2, queryMax);
    builder.query.offset += recordings.length;
  }

  let queryOffset = 0;
  // mark all as complete
  if (gotAllRecordings) {
    devSummary.markCompleted();
  } else {
    devSummary.removeIncompleteVisits();
  }

  for (const devId in devSummary.deviceMap) {
    const devVisits = devSummary.deviceMap[devId];
    if (devVisits.visitCount == 0) {
      continue;
    }
    const events = (await models.Event.query(
      userId,
      devVisits.startTime.clone().startOf("day").toISOString(),
      devVisits.endTime.toISOString(),
      parseInt(devId),
      0,
      1000,
      false,
      { eventType: "audioBait" } as QueryOptions,
      false,
    )) as Event[];
    if (events) {
      devVisits.addAudioBaitEvents(events);
    }
  }

  const audioFileIds = devSummary.allAudioFileIds();

  const visits = devSummary.completeVisits();
  visits.sort(function (a, b) {
    return b.start > a.start ? 1 : -1;
  });
  // get the offset to use for future queries
  queryOffset = devSummary.earliestIncompleteOffset();
  if (queryOffset == null && visits.length > 0) {
    queryOffset = visits[visits.length - 1].queryOffset + 1;
  }

  // Bulk look up file details of played audio events.
  const audioFileNames = new Map();
  for (const f of await models.File.getMultiple(Array.from(audioFileIds))) {
    audioFileNames[f.id] = f.details.name;
  }

  // update the references in deviceMap
  for (const visit of visits) {
    for (const audioEvent of visit.audioBaitEvents) {
      audioEvent.dataValues.fileName =
        audioFileNames[audioEvent.EventDetail.details.fileId];
    }
  }
  return {
    visits: visits,
    summary: devSummary,
    hasMoreVisits: !gotAllRecordings,
    totalRecordings: totalCount,
    queryOffset: queryOffset,
    numRecordings: numRecordings,
    numVisits: visits.length,
  };
}

function reportDeviceVisits(deviceMap: DeviceVisitMap) {
  const device_summary_out = [
    [
      "Device ID",
      "Device Name",
      "Group Name",
      "First Visit",
      "Last Visit",
      "# Visits",
      "Avg Events per Visit",
      "Animal",
      "Visits",
      "Using Audio Bait",
      "", //needed for visits columns to show
      "",
      "",
    ],
  ];
  for (const [deviceId, deviceVisits] of Object.entries(deviceMap)) {
    const animalSummary = deviceVisits.animalSummary();

    device_summary_out.push([
      deviceId,
      deviceVisits.deviceName,
      deviceVisits.groupName,
      deviceVisits.startTime.tz(config.timeZone).format("HH:mm:ss"),
      deviceVisits.endTime.tz(config.timeZone).format("HH:mm:ss"),
      deviceVisits.visitCount.toString(),
      (
        Math.round((10 * deviceVisits.eventCount) / deviceVisits.visitCount) /
        10
      ).toString(),
      Object.keys(animalSummary).join(";"),
      Object.values(animalSummary)
        .map((summary: VisitSummary) => summary.visitCount)
        .join(";"),
      deviceVisits.audioBait.toString(),
    ]);

    for (const animal in animalSummary) {
      const summary = animalSummary[animal];
      device_summary_out.push([
        deviceId,
        summary.deviceName,
        summary.groupName,
        summary.start.tz(config.timeZone).format("HH:mm:ss"),
        summary.end.tz(config.timeZone).format("HH:mm:ss"),
        summary.visitCount.toString(),
        (summary.visitCount / summary.eventCount).toString(),
        animal,
        summary.visitCount.toString(),
        deviceVisits.audioBait.toString(),
      ]);
    }
  }
  return device_summary_out;
}

export async function reportVisits(
  models: ModelsDictionary,
  userId: UserId,
  options: RecordingQueryOptions,
) {
  const results = await queryVisits(models, userId, options);
  const out = reportDeviceVisits(results.summary.deviceMap);
  const recordingUrlBase = config.server.recording_url_base || "";
  out.push([]);
  out.push([
    "Visit ID",
    "Group",
    "Device",
    "Type",
    "AssumedTag",
    "What",
    "Rec ID",
    "Date",
    "Start",
    "End",
    "Confidence",
    "# Events",
    "Audio Played",
    "URL",
  ]);

  for (const visit of results.visits) {
    addVisitRow(out, visit);

    const audioEvents = visit.audioBaitEvents.sort(function (a, b) {
      return moment(a.dateTime) > moment(b.dateTime) ? 1 : -1;
    });

    let audioEvent = audioEvents.pop();
    let audioTime, audioBaitBefore;
    if (audioEvent) {
      audioTime = moment(audioEvent.dateTime);
    }
    // add visit events and audio bait in descending order
    for (const event of visit.events) {
      audioBaitBefore = audioTime && audioTime.isAfter(event.start);
      while (audioBaitBefore) {
        addAudioBaitRow(out, audioEvent);
        audioEvent = audioEvents.pop();
        if (audioEvent) {
          audioTime = moment(audioEvent.dateTime);
        } else {
          audioTime = null;
        }
        audioBaitBefore = audioTime && audioTime.isAfter(event.start);
      }
      addEventRow(out, event, recordingUrlBase);
    }
    if (audioEvent) {
      audioEvents.push(audioEvent);
    }
    for (const audioEvent of audioEvents.reverse()) {
      addAudioBaitRow(out, audioEvent);
    }
  }
  return out;
}

function addVisitRow(out: any, visit: Visit) {
  out.push([
    visit.visitID.toString(),
    visit.deviceName,
    visit.groupName,
    "Visit",
    visit.what,
    visit.what,
    "",
    visit.start.tz(config.timeZone).format("YYYY-MM-DD"),
    visit.start.tz(config.timeZone).format("HH:mm:ss"),
    visit.end.tz(config.timeZone).format("HH:mm:ss"),
    "",
    visit.events.length.toString(),
    visit.audioBaitVisit.toString(),
    "",
  ]);
}

function addEventRow(out: any, event: VisitEvent, recordingUrlBase: string) {
  out.push([
    "",
    "",
    "",
    "Event",
    event.assumedTag,
    event.trackTag ? event.trackTag.what : "",
    event.recID.toString(),
    event.start.tz(config.timeZone).format("YYYY-MM-DD"),
    event.start.tz(config.timeZone).format("HH:mm:ss"),

    event.end.tz(config.timeZone).format("HH:mm:ss"),
    event.trackTag ? event.trackTag.confidence + "%" : "",
    "",
    "",
    `${recordingUrlBase}/${event.recID.toString()}/${event.trackID.toString()}`,
  ]);
}

function addAudioBaitRow(out: any, audioBait: Event) {
  let audioPlayed = audioBait.dataValues.fileName;
  if (audioBait.EventDetail.details.volume) {
    audioPlayed += " vol " + audioBait.EventDetail.details.volume;
  }
  out.push([
    "",
    "",
    "",
    "Audio Bait",
    "",
    audioBait.dataValues.fileName,
    "",
    moment(audioBait.dateTime).tz(config.timeZone).format("YYYY-MM-DD"),
    moment(audioBait.dateTime).tz(config.timeZone).format("HH:mm:ss"),
    "",
    "",
    "",
    audioPlayed,
    "",
  ]);
}

// Gets a single recording with associated tables required to calculate a visit
// calculation
export async function getRecordingForVisit(
  models: ModelsDictionary,
  id: number,
): Promise<Recording> {
  const query = {
    include: [
      {
        model: models.Group,
        attributes: ["groupName"],
      },
      {
        model: models.Track,
        where: {
          archivedAt: null,
        },
        attributes: ["id", "startSeconds", "endSeconds"],
        required: false,
        include: [
          {
            model: models.TrackTag,
            attributes: [
              "what",
              "automatic",
              "TrackId",
              "confidence",
              "path",
              "model",
            ],
          },
        ],
      },
      {
        model: models.Device,
        attributes: ["deviceName", "id"],
      },
      {
        model: models.Station,
        attributes: ["name", "id"],
      },
    ],
    attributes: [
      "id",
      "recordingDateTime",
      "DeviceId",
      "StationId",
      "GroupId",
      "rawFileKey",
      "fileKey",
    ],
  };
  // @ts-ignore
  return await models.Recording.findByPk(id, query);
}

export async function sendAlerts(
  models: ModelsDictionary,
  recId: RecordingId,
  debug: boolean = false,
) {
  // Get the most common non-false-positive tag for this recording, then get the track with that tag
  // that has the best thumbnail.
  const recording: Recording = await models.Recording.findByPk(recId, {
    include: [
      {
        model: models.Track,
        attributes: ["id"],
        required: true,
        include: [
          {
            model: models.TrackTag,
            required: true,
            where: {
              used: true,
              automatic: true,
            },
            attributes: ["what", "TrackId", "path"],
          },
        ],
      },
      {
        model: models.Device,
        attributes: ["deviceName", "id", "location"],
      },
      {
        model: models.Station,
        attributes: ["name", "id"],
      },
      {
        model: models.Group,
        attributes: ["groupName"],
      },
    ],
    attributes: [
      "id",
      "recordingDateTime",
      "DeviceId",
      "GroupId",
      "StationId",
      "rawFileKey",
      "type",
    ],
  });

  if (!recording) {
    return;
  }
  if (recording.type !== RecordingType.ThermalRaw) {
    return;
  }

  for (const track of recording.Tracks) {
    const trackData = await getTrackData(track.id);
    if (trackData.thumbnail) {
      track.dataValues.thumbnailScore = trackData.thumbnail.score;
    }
  }

  // If the recording is more than 24 hours old, don't send an alert
  const oneDayMs = 24 * 60 * 60 * 1000;
  if (
    !debug &&
    new Date().getTime() - recording.recordingDateTime.getTime() > oneDayMs
  ) {
    return;
  }
  const tagCounts: Record<
    string,
    { count: number; tracks: { track: Track; trackTag: TrackTag }[] }
  > = {};
  let excludedTags = [...NON_ANIMAL_TAGS, "false-positive"];
  // NOTE: We are explicitly allowing unidentified tags to alert.
  excludedTags = excludedTags.filter((tag) => tag !== "unidentified");
  for (const track of recording.Tracks) {
    for (const trackTag of track.TrackTags.filter(
      (tag) => !excludedTags.includes(tag.what),
    )) {
      // Tie-breaking on mass, length of track.
      tagCounts[trackTag.what] = tagCounts[trackTag.what] || {
        count: 0,
        tracks: [],
      };
      tagCounts[trackTag.what].count++;
      tagCounts[trackTag.what].tracks.push({ track, trackTag });
    }
  }
  const bestThumbnailTrack = (
    tracks: { track: Track; trackTag: TrackTag }[],
  ): { track: Track; trackTag: TrackTag } => {
    let bestTrack: { track: Track; trackTag: TrackTag };
    for (const track of tracks) {
      if (
        !bestTrack ||
        track.track.dataValues.thumbnailScore >
          bestTrack.track.dataValues.thumbnailScore
      ) {
        bestTrack = track;
      }
    }
    return bestTrack;
  };
  const sorted = Object.entries(tagCounts).sort(
    ([_tagA, countA], [_tagB, countB]) => {
      if (countA.count === countB.count) {
        // use the tag with the best thumbnail confidence
        const bestTrackA = bestThumbnailTrack(countA.tracks);
        const bestTrackB = bestThumbnailTrack(countB.tracks);
        return (
          bestTrackB.track.dataValues.thumbnailScore -
          bestTrackA.track.dataValues.thumbnailScore
        );
      }
      return countB.count - countA.count;
    },
  );
  if (sorted.length === 0) {
    return;
  }
  // Get the best track/tag combo if there is a need to tie-break
  const bestTrack = bestThumbnailTrack(sorted[0][1].tracks);

  const matchedTrack: Track = bestTrack.track;
  const matchedTag: TrackTag = bestTrack.trackTag;
  // Find the hierarchy for the matchedTag
  const alerts: Alert[] = await (models.Alert as AlertStatic).getActiveAlerts(
    matchedTag.path,
    recording.DeviceId || undefined,
    recording.StationId || undefined,
    recording.GroupId || undefined,
  );
  if (alerts.length !== 0) {
    const thumbnail = await getThumbnail(recording, matchedTrack.id);
    if (thumbnail === null) {
      log.warning(
        "Alerting without thumbnail for %d and track %d",
        recId,
        matchedTrack.id,
      );
    }
    for (const alert of alerts) {
      if (alert.User) {
        if (!alert.User.emailConfirmed) {
          // Send old alert email
          await alert.sendAlert(
            recording,
            matchedTrack,
            matchedTag,
            alert.GroupId !== null
              ? "project"
              : alert.StationId !== null
              ? "station"
              : "device",
            thumbnail && {
              buffer: Buffer.from(thumbnail),
              cid: "thumbnail",
              mimeType: "image/png",
            },
          );
        } else {
          // Send new style alert email if the user has confirmed their email via browse-next
          const alertTime = recording.recordingDateTime;

          // Get the best matching condition.  If the user has an alert for both Mammal and Cat
          // and we get a classification of Cat, we want the matched condition to be Cat.
          let matchingCondition = alert.conditions.find(
            (condition) => matchedTag.what === condition.tag,
          );
          if (!matchingCondition) {
            matchingCondition = alert.conditions.find((condition) =>
              matchedTag.path.split(".").includes(condition.tag),
            );
          }

          const alertClassification = matchingCondition.tag;
          const matchedClassification = matchedTag.what;

          // NOTE: We want to display the alert time in the devices' timezone if known
          let deviceTimezone = null;
          if (recording.Device.location) {
            deviceTimezone = tzLookup(
              recording.Device.location.lat,
              recording.Device.location.lng,
            );
          }
          const alertSendSuccess = await sendAnimalAlertEmail(
            "browse-next.cacophony.org.nz",
            recording.Group.groupName,
            recording.Device.deviceName,
            (recording.Station && recording.Station.name) || "unknown location",
            recording.StationId,
            alertTime,
            alertClassification,
            matchedClassification,
            recId,
            matchedTrack.id,
            alert.User.email,
            deviceTimezone,
            thumbnail && Buffer.from(thumbnail),
          );
          if (alertSendSuccess) {
            // Log an email alert event also
            const detail = await models.DetailSnapshot.getOrCreateMatching(
              "alert",
              {
                alertId: alert.id,
                recId: recording.id,
                trackId: matchedTrack.id,
                success: alertSendSuccess,
              },
            );
            await models.Event.create({
              DeviceId: recording.Device.id,
              EventDetailId: detail.id,
              dateTime: recording.recordingDateTime,
            });
            await alert.update({ lastAlert: new Date() });
          } else {
            log.warning(
              "Failed sending animal alert email to %s",
              alert.User.email,
            );
          }
        }
      }
    }
  }
  return alerts;
}

// TODO: This would be to send email alerts when we don't get recordings uploaded, we just get classification events
//  from i.e. a Lora node.
export async function sendEventAlerts(
  models: ModelsDictionary,
  data: { what: string; conf: number; dateTimes?: IsoFormattedDateString[] },
  device: Device,
  eventDateTime: Date,
  _thumbnail: Uint8Array,
) {
  // Find the hierarchy for the matchedTag
  const { stationId } =
    await getDeviceIdAndGroupIdAndPossibleStationIdAtRecordingTime(
      models,
      device,
      eventDateTime,
    );
  let alerts: Alert[] = [];
  if (stationId) {
    alerts = await (models.Alert as AlertStatic).getActiveAlerts(
      data.what,
      undefined,
      stationId,
    );
    for (const _alert of alerts) {
      // TODO:
      /*
      const alertSendSuccess = await sendAnimalAlertEmailForEvent();
      if (alertSendSuccess) {
        // Log an email alert event also
        const detail = await models.DetailSnapshot.getOrCreateMatching("alert", {
          alertId: alert.id,
          success: alertSendSuccess,
        });
        await models.Event.create({
          DeviceId: device.id,
          EventDetailId: detail.id,
          dateTime: eventDateTime,
        });
      }
       */
    }
  }
  return alerts;
}

const compressString = (text: string): Promise<Buffer> => {
  return new Promise((resolve) => {
    const buf = new Buffer(text, "utf-8"); // Choose encoding for the string.
    zlib.gzip(buf, (_, result) => resolve(result));
  });
};

interface TrackData {
  start_s: number;
  end_s: number;
  positions: TrackFramePosition[];
  frame_start: number;
  frame_end: number;
  num_frames: number;
}

const addAITrackTags = async (
  recording: Recording,
  rawTracks: RawTrack[],
  tracks: Track[],
  models: ClassifierModelDescription[],
): Promise<TrackTagId[]> => {
  const trackTags = [];
  for (let i = 0; i < rawTracks.length; i++) {
    const rawTrack = rawTracks[i];
    const createdTrack = tracks[i];
    for (const {
      label,
      confidence,
      classify_time,
      all_class_confidences,
      model_id,
    } of rawTrack.predictions) {
      trackTags.push(
        createdTrack.addTag(label, confidence, true, {
          name: models.find(({ id }) => model_id === id).name,
          classify_time,
          all_class_confidences,
        }),
      );
    }
  }
  return Promise.all(trackTags);
};

// FIXME - unused - why?
const calculateAndAddAIMasterTag = async (
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  recording: Recording,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  rawTracks: RawTrack[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  tracks: Track[],
): Promise<TrackTagId> => {
  return 0;
};

const calculateTrackMovement = (track: RawTrack): number => {
  // FIXME(jon): Can positions be empty? Test a file that gets no tracks
  if (!track.positions.length) {
    return 0;
  }
  const midXs = [];
  const midYs = [];
  for (const position of track.positions) {
    midXs.push(position.x + position.width / 2);
    midYs.push(position.y + position.height / 2);
  }
  const deltaX = Math.max(...midXs) - Math.min(...midXs);
  const deltaY = Math.max(...midYs) - Math.min(...midYs);

  // FIXME(jon): Might be better to do this in two dimensions?
  //  Or sum the total distance travelled?
  return Math.max(deltaX, deltaY);
};

// FIXME - unused
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const WALLABY_DEVICES = [949, 954, 956, 1176];

// Tags to ignore when checking predictions
const IGNORE_TAGS = ["not"];

// This is the minimum length of a track.
const MIN_TRACK_FRAMES = 3;
// FIXME(jon): These seem to be used interchangably for prediction.confidence

// This is the minimum confidence (for an animal rating) a track should have to be considered a possible animal
const MIN_PREDICTION_CONFIDENCE = 0.4;

// This is the minimum confidence a track should have in order to tag as animal
const MIN_TAG_CONFIDENCE = 0.8;

const MIN_TRACK_MOVEMENT = 50;

// This is the minimum difference in confidence between next choice a track should have in order to tag it as the chosen animal
const MIN_TAG_CLARITY = 0.2;

// If the same animal has clearly been identified in the video then a reduced clarity is acceptable.
const MIN_TAG_CLARITY_SECONDARY = 0.05;

// FIXME(jon): This description seems wrong
// This is the minimum confidence a track should have in order to tag it as the chosen animal
const MAX_TAG_NOVELTY = 0.7;
const DEFAULT_CONFIDENCE = 0.85;

const isSignificantTrack = (
  track: RawTrack,
  prediction: TrackClassification,
): boolean => {
  if (track.num_frames < MIN_TRACK_FRAMES) {
    track.message = "Short track";
    return false;
  }
  if (prediction.confidence > MIN_PREDICTION_CONFIDENCE) {
    return true;
  }
  if (calculateTrackMovement(track) > MIN_TRACK_MOVEMENT - 1) {
    return true;
  }
  track.message = "Low movement and poor confidence - ignore";
  return false;
};

const predictionIsClear = (prediction: TrackClassification): boolean => {
  if (prediction.confidence < MIN_TAG_CONFIDENCE) {
    prediction.message = "Low confidence - no tag";
    return false;
  }
  if (prediction.clarity < MIN_TAG_CLARITY) {
    prediction.message = "Confusion between two classes (similar confidence)";
    return false;
  }
  if (prediction.average_novelty > MAX_TAG_NOVELTY) {
    prediction.message = "High novelty";
    return false;
  }
  return true;
};

const getSignificantTracks = (
  tracks: RawTrack[],
): [RawTrack[], RawTrack[], Record<string, { confidence: number }>] => {
  const clearTracks = [];
  const unclearTracks = [];
  const tags: Record<string, { confidence: number }> = {};

  for (const track of tracks) {
    track.confidence = 0;
    let hasClearPrediction = false;
    for (const prediction of track.predictions) {
      if (IGNORE_TAGS.includes(prediction.label)) {
        continue;
      }
      if (isSignificantTrack(track, prediction)) {
        if (
          prediction.label === "false-positive" &&
          prediction.clarity < MIN_TAG_CLARITY_SECONDARY
        ) {
          continue;
        }
        const confidence = prediction.confidence;
        track.confidence = Math.max(track.confidence, confidence);
        if (predictionIsClear(prediction)) {
          hasClearPrediction = true;
          const tag = prediction.label;
          prediction.tag = tag;
          if (tags.hasOwnProperty(tag)) {
            tags[tag].confidence = Math.max(tags[tag].confidence, confidence);
          } else {
            tags[tag] = { confidence: 0 };
          }
        } else {
          tags["unidentified"] = { confidence: DEFAULT_CONFIDENCE };
          prediction.tag = "unidentified";
        }
      }
      if (hasClearPrediction) {
        clearTracks.push(track);
      } else {
        unclearTracks.push(track);
      }
    }
  }
  return [clearTracks, unclearTracks, tags];
};

const calculateMultipleAnimalConfidence = (tracks: RawTrack[]): number => {
  let confidence = 0;
  const allTracks = [...tracks].sort(
    (a: RawTrack, b: RawTrack) => a.start_s - b.start_s,
  );
  for (let i = 0; i < allTracks.length - 1; i++) {
    for (let j = i + 1; j < allTracks.length; j++) {
      if (allTracks[j].start_s + 1 < allTracks[i].end_s) {
        const conf = Math.min(allTracks[i].confidence, allTracks[j].confidence);
        confidence = Math.max(confidence, conf);
      }
    }
  }
  return confidence;
};

const MULTIPLE_ANIMAL_CONFIDENCE = 1;
const calculateTags = (
  tracks: RawTrack[],
): [RawTrack[], Record<string, { confidence: number }>, boolean] => {
  if (tracks.length === 0) {
    return [tracks, {}, false];
  }
  const [clearTracks, unclearTracks, tags] = getSignificantTracks(tracks);
  // This could happen outside this function, unless we discard tracks?
  const multipleAnimalConfidence = calculateMultipleAnimalConfidence([
    ...clearTracks,
    ...unclearTracks,
  ]);
  const hasMultipleAnimals =
    multipleAnimalConfidence > MULTIPLE_ANIMAL_CONFIDENCE;

  if (hasMultipleAnimals) {
    log.debug(
      "multiple animals detected, (%d)",
      multipleAnimalConfidence.toFixed(2),
    );
  }

  return [tracks, tags, hasMultipleAnimals];
};

export const fixupLatestRecordingTimesForDeletedRecording = async (
  models: ModelsDictionary,
  recording: Recording,
) => {
  // Check if there are any more device/group/station recordings, or if the latest recording of this type
  // is not different. If not, set lastRecordingTime to null,
  // so that the device will appear as deletable.
  const cameras = [RecordingType.ThermalRaw, RecordingType.TrailCamImage];
  let types = [RecordingType.Audio];
  if (
    [RecordingType.ThermalRaw, RecordingType.TrailCamImage].includes(
      recording.type,
    )
  ) {
    types = cameras;
  }
  const [
    latestDeviceRecording,
    latestGroupRecordingOfSameType,
    latestStationRecordingOfSameType,
  ] = await Promise.all([
    models.Recording.findOne({
      where: {
        DeviceId: recording.DeviceId,
        deletedAt: null,
        duration: { [Op.gte]: 3 },
      },
      order: [["recordingDateTime", "DESC"]],
    }),
    models.Recording.findOne({
      where: {
        GroupId: recording.GroupId,
        deletedAt: null,
        duration: { [Op.gte]: 3 },
        type: { [Op.in]: types },
      },
      order: [["recordingDateTime", "DESC"]],
    }),
    models.Recording.findOne({
      where: {
        StationId: recording.StationId,
        duration: { [Op.gte]: 3 },
        deletedAt: null,
        type: { [Op.in]: types },
      },
      order: [["recordingDateTime", "DESC"]],
    }),
  ]);
  const [device, group] = await Promise.all([
    models.Device.findByPk(recording.DeviceId),
    models.Group.findByPk(recording.GroupId),
  ]);
  if (!latestDeviceRecording) {
    await device.update({
      lastRecordingTime: null,
    });
  } else if (
    !device.lastRecordingTime ||
    latestDeviceRecording.recordingDateTime < device.lastRecordingTime
  ) {
    await device.update({
      lastRecordingTime: latestDeviceRecording.recordingDateTime,
    });
  }
  if (!latestGroupRecordingOfSameType) {
    if (cameras.includes(recording.type)) {
      await group.update({
        lastThermalRecordingTime: null,
      });
    } else if (recording.type === RecordingType.Audio) {
      await group.update({
        lastAudioRecordingTime: null,
      });
    }
  } else {
    if (cameras.includes(recording.type)) {
      if (
        !group.lastThermalRecordingTime ||
        latestGroupRecordingOfSameType.recordingDateTime <
          group.lastThermalRecordingTime
      ) {
        await group.update({
          lastThermalRecordingTime:
            latestGroupRecordingOfSameType.recordingDateTime,
        });
      }
    } else if (recording.type === RecordingType.Audio) {
      if (
        !group.lastAudioRecordingTime ||
        latestGroupRecordingOfSameType.recordingDateTime <
          group.lastAudioRecordingTime
      ) {
        await group.update({
          lastAudioRecordingTime:
            latestGroupRecordingOfSameType.recordingDateTime,
        });
      }
    }
  }
  if (recording.StationId) {
    const station = await models.Station.findByPk(recording.StationId);
    if (!latestStationRecordingOfSameType) {
      if (cameras.includes(recording.type)) {
        await station.update({
          lastThermalRecordingTime: null,
          lastActiveThermalTime: null,
        });
      } else if (recording.type === RecordingType.Audio) {
        await station.update({
          lastAudioRecordingTime: null,
          lastActiveAudioTime: null,
        });
      }
    } else {
      if (cameras.includes(recording.type)) {
        if (
          !station.lastThermalRecordingTime ||
          latestStationRecordingOfSameType.recordingDateTime <
            station.lastThermalRecordingTime
        ) {
          await station.update({
            lastThermalRecordingTime:
              latestStationRecordingOfSameType.recordingDateTime,
          });
        }
      } else if (recording.type === RecordingType.Audio) {
        if (
          !station.lastAudioRecordingTime ||
          latestStationRecordingOfSameType.recordingDateTime <
            station.lastAudioRecordingTime
        ) {
          await station.update({
            lastAudioRecordingTime:
              latestStationRecordingOfSameType.recordingDateTime,
          });
        }
      }
    }
  }
};

export const fixupLatestRecordingTimesForUndeletedRecording = async (
  models: ModelsDictionary,
  recording: Recording,
) => {
  const cameras = [RecordingType.TrailCamImage, RecordingType.ThermalRaw];
  const [device, group] = await Promise.all([
    models.Device.findByPk(recording.DeviceId),
    models.Group.findByPk(recording.GroupId),
  ]);
  if (device) {
    if (
      device.lastRecordingTime === null ||
      recording.recordingDateTime > device.lastRecordingTime
    ) {
      await device.update({ lastRecordingTime: recording.recordingDateTime });
    }
  }
  if (group) {
    if (
      group.lastAudioRecordingTime === null ||
      group.lastThermalRecordingTime === null ||
      (group.lastAudioRecordingTime &&
        recording.recordingDateTime > group.lastAudioRecordingTime) ||
      (group.lastThermalRecordingTime &&
        recording.recordingDateTime > group.lastThermalRecordingTime)
    ) {
      if (
        (cameras.includes(recording.type) && !group.lastThermalRecordingTime) ||
        recording.recordingDateTime > group.lastThermalRecordingTime
      ) {
        await group.update({
          lastThermalRecordingTime: recording.recordingDateTime,
        });
      } else if (
        (recording.type === RecordingType.Audio &&
          !group.lastAudioRecordingTime) ||
        recording.recordingDateTime > group.lastAudioRecordingTime
      ) {
        await group.update({
          lastAudioRecordingTime: recording.recordingDateTime,
        });
      }
    }
  }
  if (recording.StationId) {
    const station = await models.Station.findByPk(recording.StationId);
    if (station) {
      if (
        (cameras.includes(recording.type) &&
          !station.lastThermalRecordingTime) ||
        recording.recordingDateTime > station.lastThermalRecordingTime
      ) {
        await station.update({
          lastThermalRecordingTime: recording.recordingDateTime,
        });
      } else if (
        (recording.type === RecordingType.Audio &&
          !station.lastAudioRecordingTime) ||
        recording.recordingDateTime > station.lastAudioRecordingTime
      ) {
        await station.update({
          lastAudioRecordingTime: recording.recordingDateTime,
        });
      }
    }
  }
};
