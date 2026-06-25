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
import { Alert } from "@models/Alert.js";
import tzLookup from "tz-lookup-oss";
import jsonwebtoken from "jsonwebtoken";
import mime from "mime";
import config from "@config";
import type { RecordingQueryOptions } from "@models/Recording.js";
import { Recording } from "@models/Recording.js";
import { Event } from "@models/Event.js";
import { User } from "@models/User.js";
import {
  Attributes,
  FindAndCountOptions,
  FindAttributeOptions,
  Op,
  QueryTypes,
  Transaction,
} from "sequelize";
import { getCanonicalTrackTag, NON_ANIMAL_TAGS } from "./tagUtil.js";
import { Station } from "@models/Station.js";
import { Device } from "@models/Device.js";
import type { PutObjectCommandOutput } from "@aws-sdk/client-s3";
import { DeviceHistory } from "@models/DeviceHistory.js";
import { Tag } from "@models/Tag.js";
import { Track } from "@models/Track.js";
import { TrackTag } from "@models/TrackTag.js";
import {
  renderFrameIntoFrameBuffer,
  ColourMaps,
} from "@api/cptv-decoder/frameRenderUtils.js";
import type {
  DeviceId,
  GroupId,
  IsoFormattedDateString,
  RecordingId,
  StationId,
  TrackId,
  UserId,
} from "@typedefs/api/common.js";
import { RecordingType } from "@typedefs/api/consts.js";
import type {
  MinimalTrackRequestData,
  RecordingDataSuppliedMetadata,
  TrackFramePosition,
} from "@typedefs/api/fileProcessing.js";
import type { ApiRecordingTagRequest } from "@typedefs/api/tag.js";
import type { CptvFrame } from "../cptv-decoder/decoder.js";
import { CptvDecoder } from "../cptv-decoder/decoder.js";
import log from "@log";
import { openS3 } from "@models/util/util.js";
import type { ReadableStream } from "stream/web";
import { initSequelize } from "@models/index.js";
import ffmpeg from "fluent-ffmpeg";
import { Writable } from "stream";
import temp from "temp";
import fs from "fs";
import { sendAnimalAlertEmail } from "@/emails/transactionalEmails.js";
import { DetailSnapshot } from "@models/DetailSnapshot.js";
import { Group } from "@models/Group.js";
import type {
  ApiAudioRecordingMetadataResponse,
  ApiThermalRecordingMetadataResponse,
} from "@typedefs/api/recording.js";
import { Visit } from "@models/Visit.js";
import { TrackTagData } from "@typedefs/api/trackTag.js";

const ffmpegPath = "/usr/bin/ffmpeg";
ffmpeg.setFfmpegPath(ffmpegPath);
temp.track();

// Create a png thumbnail image from this frame with thumbnail info
// Expand the thumbnail region such that it is a square,
// and at least THUMBNAIL_MIN_SIZE width and height
// render the png in THUMBNAIL_PALETTE
async function createIRThumbnail(
  frame: IRFrame,
  thumbnail: TrackFramePosition,
): Promise<ThumbnailData> {
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

export interface IRFrame {
  data: Uint8Array;
  frameNumber: number;
  meta: { imageData: { width: number; height: number } };
}

export async function getIRFrame(
  recording: Recording,
  frameNumbers: Set<number>,
): Promise<Record<number, IRFrame> | undefined> {
  const fileData = await openS3().getObject(recording.rawFileKey as string);
  const bodyBuffer = await fileData.Body.transformToByteArray();
  // const bodyBuffer = fileData.Body.data as ArrayBufferView;
  const tempName = temp.path({ suffix: ".mp4" });
  // GP
  // getting the screenshot seems to only work from a file, rather than a stream
  // probably can get around this by uploading the mp4 in a different format
  try {
    fs.writeFileSync(tempName, bodyBuffer);
    const frames: Record<number, IRFrame> = {};
    for (const frameNumber of frameNumbers) {
      await new Promise((resolve: (frame: IRFrame) => void, reject) => {
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
          .on("end", () => {
            const frame = {
              data: screenData,
              frameNumber: frameNumber,
              meta: { imageData: { width: 640, height: 480 } },
            };
            return resolve(frame);
          })
          .on("error", (err) => {
            return reject(new Error(err.message));
          })
          .run();
      }).then((response: IRFrame): void => {
        frames[response.frameNumber] = response;
      });
    }
    fs.unlink(tempName, (err) => {
      if (err) {
        log.error("error unlinking", err);
      }
    });
    return frames;
  } catch (_e) {
    fs.unlink(tempName, (_err) => {
      return;
    });
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
    } catch (err: unknown) {
      if (err instanceof Error) {
        log.error(
          "Error getting thumbnail from s3 for recordingId %s, trackId: %s, %s",
          rec.id,
          trackId,
          err.message,
        );
      }

      // Fallback to recording thumb
      thumbKey = `${fileKey}-thumb`;
      try {
        if (thumbKey.startsWith("a_")) {
          thumbKey = thumbKey.slice(2);
        }
        const data = await s3.getObject(thumbKey);
        return data.Body.transformToByteArray();
      } catch (err: unknown) {
        if (err instanceof Error) {
          log.error(
            "Error getting fallback thumbnail from s3 for recordingId %s, %s",
            rec.id,
            err.message,
          );
        }
      }
    }
  } else {
    // choose the best track for a thumbnail
    if (rec.Tracks.length !== 0) {
      const trackTags: Record<
        string,
        {
          count: number;
          tracks: Record<TrackId, Track>;
        }
      > = {};
      for (const track of rec.Tracks) {
        if (track.TrackTags && track.TrackTags.length !== 0) {
          const canonicalTag = getCanonicalTrackTag(track.TrackTags);
          if (canonicalTag) {
            const trackTag = canonicalTag.what;
            trackTags[trackTag] = trackTags[trackTag] || {
              count: 0,
              tracks: {},
            };
            trackTags[trackTag].count += 1;
            trackTags[trackTag].tracks[track.id] = track as Track;
          }
        }
      }
      let commonTag: string | null = null;
      const sortedTags = Object.entries(trackTags).sort(
        (a, b) => a[1].count - b[1].count,
      );
      let bestTracks: Track[] = [];
      if (sortedTags.length !== 0) {
        commonTag = sortedTags[0][0];
        bestTracks = Object.values(sortedTags[0][1].tracks);
      }

      if (commonTag !== null && bestTracks.length !== 0) {
        if (!bestTracks.some((track) => !!track.thumbnailScore)) {
          for (const track of bestTracks) {
            track.data = (await Track.getTrackData(
              track.id,
            )) as MinimalTrackRequestData;
            track.thumbnailScore = track.data.thumbnail?.score || 0;
          }
        }
        bestTracks.sort((a, b) => {
          return b.thumbnailScore - a.thumbnailScore;
        });
        thumbKey = `${fileKey}-${bestTracks[0].id}-thumb`;
      }
      try {
        if (thumbKey.startsWith("a_")) {
          thumbKey = thumbKey.slice(2);
        }
        const data = await s3.getObject(thumbKey);
        return data.Body.transformToByteArray();
      } catch (err: unknown) {
        if (err instanceof Error) {
          log.warning(
            "Error getting best thumbnail from s3 for recordingId %s, %s",
            rec.id,
            err.message,
          );
        }

        if (bestTracks.length !== 0) {
          // Fallback to recording thumb
          thumbKey = `${fileKey}-thumb`;
          try {
            if (thumbKey.startsWith("a_")) {
              thumbKey = thumbKey.slice(2);
            }
            const data = await s3.getObject(thumbKey);
            return data.Body.transformToByteArray();
          } catch (err: unknown) {
            if (err instanceof Error) {
              log.warning(
                "Error getting clip thumbnail from s3 for recordingId %s, %s",
                rec.id,
                err.message,
              );
            }
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
    } catch (err: unknown) {
      if (err instanceof Error) {
        log.error(
          "Error getting clip thumbnail from s3 for recordingId %s, %s",
          rec.id,
          err.message,
        );
      }
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
): Promise<Record<number, CptvFrame> | undefined> {
  let decoder: CptvDecoder;
  try {
    const stream = (
      await openS3().getObject(recording.rawFileKey)
    ).Body.transformToWebStream();
    decoder = new CptvDecoder();
    const result = await decoder.initWithReadableStream(
      stream as ReadableStream,
    );
    if (typeof result === "string") {
      log.warning("CPTV Error '%s'", result);
      return;
    }
    let finished = false;
    let currentFrame = 0;
    const frames: Record<number, CptvFrame> = {};
    log.info(`Extracting  ${frameNumbers.size} frames for thumbnails `);
    const header = await decoder.getHeader();
    const totalFrames = header.totalFrames || null;
    while (!finished) {
      const frame: CptvFrame | null | string = await decoder.getNextFrame();
      if (typeof frame === "string") {
        log.warning("CPTV Error '%s'", frame);
        return;
      }
      if (frame && frame.isBackgroundFrame) {
        // Skip over background frame without incrementing counter.
        continue;
      }
      finished =
        frame === null || (totalFrames && currentFrame - 1 === totalFrames);
      if (frameNumbers.has(currentFrame)) {
        frameNumbers.delete(currentFrame);
        frames[currentFrame] = frame;
      }
      if (frameNumbers.size === 0) {
        break;
      }
      currentFrame++;
    }
    return frames;
  } catch (_err) {
    log.warning(`CPTV thumbnail read error: ${_err}`);
    return;
  } finally {
    if (decoder && decoder.close) {
      await decoder.close();
    }
  }
}
export interface ThumbnailData {
  data: Buffer;
  meta: { palette: string; region: string };
}
// Creates and saves a thumbnail for a recording using specified thumbnail info
export async function saveThumbnailInfo(
  recording: Recording,
  tracks: { id: TrackId; data: MinimalTrackRequestData }[],
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
  let frames: Record<number, CptvFrame> | Record<number, IRFrame> | undefined;
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
    const frame = frames[track.data.thumbnail?.region?.frame_number];
    if (!frame) {
      frameUploads.push(
        Error(
          `Failed to extract CPTV frame for track ${track.id}, frame  ${track.data.thumbnail?.region?.frame_number}`,
        ),
      );
      continue;
    }
    let thumb: ThumbnailData;
    if (recording.type == RecordingType.InfraredVideo) {
      thumb = await createIRThumbnail(
        frame as IRFrame,
        track.data.thumbnail?.region,
      );
    } else {
      thumb = await createThumbnail(
        frame as CptvFrame,
        track.data.thumbnail?.region,
      );
    }
    log.info("Saving track thumbnail %s", `${fileKey}-${track.id}-thumb`);
    frameUploads.push(
      openS3()
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
      let thumb: ThumbnailData;
      if (recording.type == RecordingType.InfraredVideo) {
        thumb = await createIRThumbnail(frame as IRFrame, clip_thumbnail);
      } else {
        thumb = await createThumbnail(frame as CptvFrame, clip_thumbnail);
      }
      log.info("Saving clip thumbnail %s", `${fileKey}-thumb`);
      frameUploads.push(
        openS3()
          .upload(`${fileKey}-thumb`, thumb.data, thumb.meta)
          .catch((err) => {
            return err;
          }),
      );
    }
  }
  return Promise.all(frameUploads);
}

function distributeSize(
  c: number,
  size: number,
  maxDim: number,
): { left: number; right: number } {
  let left;
  let right;
  const maxD = Math.floor(size / 2);
  if (c <= maxDim / 2) {
    // Distribute "left" first.
    left = Math.max(0, c - maxD);
    right = Math.min(maxDim, c + (size - (c - left)));
  } else {
    // Distribute "right" first
    right = Math.min(maxDim, c + maxD);
    left = Math.max(0, c - (size - (right - c)));
  }
  return {
    left,
    right,
  };
}
// expands the smallest dimension of the region so that it is a square that fits inside resX and resY
function squareRegion(
  thumbnail: TrackFramePosition,
  resX: number,
  resY: number,
) {
  const size = Math.min(resY, Math.max(thumbnail.width, thumbnail.height));
  // Get the center, and make the smallest possible square around it:
  const centerX = Math.floor(thumbnail.x + thumbnail.width / 2);
  const centerY = Math.floor(thumbnail.y + thumbnail.height / 2);

  const x = distributeSize(centerX, size, resX);
  const y = distributeSize(centerY, size, resY);
  return {
    x: x.left,
    y: y.left,
    width: x.right - x.left,
    height: y.right - y.left,
  };
}

// Create a png thumbnail image from this frame with thumbnail info
// Expand the thumbnail region such that it is a square
// Resize to THUMBNAIL_MIN_SIZE
// render the png in THUMBNAIL_PALETTE
export async function createThumbnail(
  frame: CptvFrame,
  thumbnail: TrackFramePosition,
  colourPalette: string = THUMBNAIL_PALETTE,
): Promise<ThumbnailData> {
  const resX = 160;
  const resY = 120;
  thumbnail = squareRegion(thumbnail, resX, resY);
  const size = Math.min(resY, Math.max(thumbnail.height, thumbnail.width));
  const thumbnailData = new Uint8Array(size * size);
  // get min max for normalisation
  let min = 1 << 16;
  let max = 0;
  for (let i = 0; i < size; i++) {
    const frameStart = (i + thumbnail.y) * resX + thumbnail.x;
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
    const frameStart = (i + thumbnail.y) * resX + thumbnail.x;
    for (let offset = 0; offset < thumbnail.width; offset++) {
      let pixel = frame.imageData[frameStart + offset];
      pixel = (255 * (pixel - min)) / (max - min);
      thumbnailData[thumbIndex] = pixel;
      thumbIndex++;
    }
  }
  let greyScaleData: Uint8Array;
  if (thumbnail.width != THUMBNAIL_SIZE) {
    const resized_thumb = sharp(thumbnailData, {
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

export const getDeviceIdAndGroupIdAndPossibleStationIdAtRecordingTime = async (
  device: Device,
  atTime: Date,
): Promise<{ groupId: GroupId; deviceId: DeviceId; stationId?: StationId }> => {
  // NOTE: Use the uuid here, so we can assign old recordings that may be uploaded much later
  //  to the correct group that the device belonged to when the recording was created.
  const deviceHistory = (await DeviceHistory.findOne({
    where: {
      uuid: device.uuid,
      fromDateTime: { [Op.lte]: atTime },
      location: { [Op.ne]: null },
    },
    order: [
      ["fromDateTime", "DESC"],
      ["id", "DESC"],
    ],
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

export async function queryRecordings(
  requestUserId: UserId,
  type: RecordingType,
  countAll: boolean,
  options: RecordingQueryOptions,
): Promise<{ rows: Recording[]; count: number }> {
  if (type && typeof options.where === "object") {
    options.where = { ...options.where, type };
  }
  const builder = new Recording.queryBuilder().init(requestUserId, options);
  (builder.query as FindAndCountOptions).distinct = true;

  // FIXME - If getting count as super-user, we don't care about joining on all of the other tables.
  //  Even if getting count as regular user, we only care about joining through GroupUsers.

  // FIXME - Duration >= 0 constraint is pretty slow.

  // FIXME: In the UI, when we query recordings, we don't need to get the count every time, just the first time
  //  would be fine!
  if (countAll === true) {
    return Recording.findAndCountAll(builder.get());
  }
  const rows = await Recording.findAll(builder.get());
  return { count: rows.length, rows: rows };
}

export async function updateRecordingTimeBookkeepingForBulkDeletedRecordings(
  recordings: DeletedRecording[],
  transaction?: Transaction,
): Promise<void> {
  // For each set of recordings to delete or undelete, we need to get the unique stations and devices,
  // and then fixup the latest recording times for each device and station and group.
  const uniqueByStation = new Map();
  const uniqueByDevice = new Map();
  const uniqueByGroup = new Map();
  for (const recording of recordings) {
    const stationKey = `${recording.StationId}_${recording.type}`;
    const deviceKey = `${recording.DeviceId}_${recording.type}`;
    const groupKey = `${recording.GroupId}_${recording.type}`;
    if (!uniqueByStation.has(stationKey)) {
      uniqueByStation.set(stationKey, recording);
    }
    if (!uniqueByDevice.has(deviceKey)) {
      uniqueByDevice.set(deviceKey, recording);
    }
    if (!uniqueByGroup.has(groupKey)) {
      uniqueByGroup.set(groupKey, recording);
    }
  }
  const fixups = [];
  for (const recording of uniqueByStation.values()) {
    fixups.push(updateRecordingTimeBookkeeping(recording, false, transaction));
  }
  for (const recording of uniqueByDevice.values()) {
    fixups.push(updateRecordingTimeBookkeeping(recording, false, transaction));
  }
  for (const recording of uniqueByGroup.values()) {
    fixups.push(updateRecordingTimeBookkeeping(recording, false, transaction));
  }
  if (fixups.length) {
    await Promise.all(fixups);
  }
}

export interface DeletedRecording {
  id: number;
  GroupId: GroupId;
  StationId: StationId;
  DeviceId: DeviceId;
  type: RecordingType;
  recordingDateTime: Date;
  duration: number;
}

export async function bulkDelete(
  requestUserId: UserId,
  type: RecordingType,
  options: RecordingQueryOptions,
  _actuallyDelete = false, // FIXME - Make recordings actually be deleted?
): Promise<RecordingId[]> {
  if (type && typeof options.where === "object") {
    options.where = { ...options.where, type };
  }

  const builder = new Recording.queryBuilder().init(requestUserId, options);
  const recordings = (await Recording.findAll(builder.get())) as Recording[];
  if (recordings.length === 0) {
    throw new Error("No recordings found to delete");
  }
  const deletion = { deletedAt: new Date(), deletedBy: requestUserId };
  const ids = recordings.map((value) => value.id);

  const deletedRecordings = (await Recording.update(deletion, {
    where: { id: ids, deletedAt: { [Op.eq]: null } },
    returning: [
      "id",
      "DeviceId",
      "StationId",
      "GroupId",
      "type",
      "recordingDateTime",
      "duration",
    ],
  })) as unknown as [number, DeletedRecording[]];
  if (deletedRecordings[0] !== 0) {
    await updateRecordingTimeBookkeepingForBulkDeletedRecordings(
      deletedRecordings[1],
    );
    for (const recording of deletedRecordings[1]) {
      await Visit.rebuildForRecording(recording);
    }
    return deletedRecordings[1].map((value: { id: RecordingId }) => value.id);
  }
  return [];
}

export async function getTrackTags(
  userId: UserId,
  viewAsSuperUser: boolean,
  includeAI: boolean,
  recordingType: string,
  excludeTags: string[] = [],
  offset?: number,
  limit?: number,
) {
  const requireGroupMembership = viewAsSuperUser
    ? []
    : [
        {
          model: User,
          attributes: [] as FindAttributeOptions,
          required: true,
          where: { id: userId },
        },
      ];
  const rows = await TrackTag.findAll({
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
        model: Track,
        attributes: ["id"],
        required: true,
        include: [
          {
            model: Recording,
            attributes: ["id"],
            required: true,
            where: {
              type: {
                [Op.eq]: recordingType,
              },
            },
            include: [
              {
                model: Group,
                attributes: ["id", "groupName"],
                required: true,
                include: requireGroupMembership,
              },
              {
                model: Device,
                attributes: ["id", "deviceName"],
                required: true,
              },
              {
                model: Station,
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
    labeler: row.UserId ? `id_${row.UserId.toString()}` : "AI",
  }));
}
interface TrackTagsCountOptions {
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

  // Adding condition for user group check if not a superuser
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
  const sequelize = await initSequelize();
  return await sequelize.query(sql, {
    replacements,
    type: QueryTypes.SELECT,
  });
}

export function signedToken(
  key: string,
  filename: string,
  mimeType: string,
  userId?: UserId,
  groupId?: GroupId,
) {
  const payload: {
    _type: "fileDownload";
    key: string;
    filename: string;
    mimeType: string;
    userId?: UserId;
    groupId?: GroupId;
  } = {
    _type: "fileDownload",
    key,
    filename,
    mimeType,
  };
  if (userId) {
    payload.userId = userId;
  }
  if (groupId) {
    payload.groupId = groupId;
  }
  return jsonwebtoken.sign(payload, config.server.passportSecret, {
    expiresIn: 60 * 10,
  });
}

export const guessMimeType = (
  type: RecordingType,
  filename: string,
): string => {
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
  user: User | null,
  recordingId: RecordingId,
  tag: ApiRecordingTagRequest,
): Promise<Tag> => {
  const tagInstance = Tag.buildSafely(tag);
  tagInstance.RecordingId = recordingId;
  if (user) {
    tagInstance.taggerId = user.id;
  }
  await tagInstance.save();
  return tagInstance;
};
export const tracksFromMeta = async (
  recording: Recording,
  metadata: RecordingDataSuppliedMetadata,
) => {
  try {
    if (!("tracks" in metadata)) {
      return false;
    }
    const algorithmDetail = await DetailSnapshot.getOrCreateMatching(
      "algorithm",
      metadata.algorithm,
    );

    const promises = [];
    const tracks: Track[] = [];
    for (const trackMeta of metadata.tracks) {
      const newTrack: Partial<Attributes<Track>> = {
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
          recording.addTrack(newTrack, trackMeta).then((track) => {
            if (!trackMeta.predictions || trackMeta.predictions.length === 0) {
              track.updateIsFiltered().then(resolve);
            } else {
              tracks.push(track);
              const trackPromises = [];
              for (const prediction of trackMeta.predictions) {
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
                } else if (prediction.model_used) {
                  // This is really only true in testing, where we don't know the id up front of the "Master" model,
                  // so we just say that we're using the "Master" model when we submit the test tracks.
                  modelName = prediction.model_used;
                }

                // FIXME: Nail down what the classifier actually outputs, or just make this a generic black box.
                const tag_data: TrackTagData = { name: modelName };
                if (prediction.clarity) {
                  tag_data.clarity = prediction.clarity;
                }
                if (prediction.classify_time) {
                  tag_data.classify_time = prediction.classify_time;
                }
                //GP 2025 Dec dont think we are using this at all
                // if (prediction.predictions) {
                //   tag_data["predictions"] = prediction["predictions"];
                // }

                if (prediction.all_class_confidences) {
                  tag_data.all_class_confidences =
                    prediction.all_class_confidences;
                }
                let tag = "unidentified";
                if (prediction.confident_tag) {
                  tag = prediction.confident_tag;
                }
                if (prediction.label) {
                  tag_data.raw_tag = prediction.label;
                } else {
                  tag_data.raw_tag = prediction.tag;
                }
                if (prediction.confident) {
                  tag = prediction.tag;
                }

                trackPromises.push(
                  track.addTag(tag, prediction.confidence, true, tag_data),
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

export async function updateMetadata(
  recording: Recording,
  metadata:
    | ApiAudioRecordingMetadataResponse
    | ApiThermalRecordingMetadataResponse,
) {
  recording.additionalMetadata = metadata;
  await recording.save();
}
export async function sendAlerts(
  recOrRecId: Recording | RecordingId,
  debug = false,
) {
  let recId: RecordingId;
  if (typeof recOrRecId !== "number") {
    // Check for alerts on this recording.
    const hasAnyAlerts = await Alert.findOne({
      attributes: ["id"],
      where: {
        [Op.or]: [
          {
            StationId: (recOrRecId as Recording).StationId,
          },
          {
            GroupId: (recOrRecId as Recording).GroupId,
          },
          {
            DeviceId: (recOrRecId as Recording).DeviceId,
          },
        ],
      },
    });
    if (!hasAnyAlerts) {
      return;
    }
    recId = (recOrRecId as Recording).id;
  } else {
    recId = recOrRecId as RecordingId;
  }
  // Get the most common non-false-positive tag for this recording, then get the track with that tag
  // that has the best thumbnail.
  const recording = await Recording.findByPk(recId, {
    include: [
      {
        model: Track,
        attributes: ["id", "thumbnailScore"],
        required: true,
        include: [
          {
            model: TrackTag,
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
        model: Device,
        attributes: ["deviceName", "id", "location"],
      },
      {
        model: Station,
        attributes: ["name", "id"],
      },
      {
        model: Group,
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
    if (!track.thumbnailScore) {
      const trackData = (await Track.getTrackData(
        track.id,
      )) as MinimalTrackRequestData;
      track.thumbnailScore = trackData.thumbnail?.score || 0;
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

  // FIXME: Logic for getting best thumbnail for a recording duplicated with thumbnail endpoint
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
        track.track.thumbnailScore > bestTrack.track.thumbnailScore
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
          bestTrackB.track.thumbnailScore - bestTrackA.track.thumbnailScore
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
  if (!matchedTag.path) {
    matchedTag.path = "";
    log.error("Path missing for matched tag %s", matchedTag.what);
  }
  // Find the hierarchy for the matchedTag
  const alerts: Alert[] = await Alert.getActiveAlerts(
    matchedTag.path,
    recording.DeviceId,
    recording.StationId || 0, // NOTE: Sometimes during testing, recording.StationId is null, since the station
    // hasn't yet been added to the recording.
    recording.GroupId,
  );
  if (alerts.length !== 0) {
    const thumbnail = await getThumbnail(recording, matchedTrack.id);
    if (thumbnail === null) {
      log.warning(
        "Alerting without thumbnail for %d and track %d",
        recOrRecId,
        matchedTrack.id,
      );
    }
    for (const alert of alerts) {
      if (alert.User) {
        if (!alert.User.emailConfirmed) {
          // FIXME: Remove this?
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
          // Send a new style alert email if the user has confirmed their email via browse-next
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
            if (!matchingCondition) {
              return;
            }
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
            recording.Group.groupName,
            recording.Device.deviceName,
            (recording.Station && recording.Station.name) || "unknown location",
            recording.StationId,
            alertTime,
            alertClassification,
            matchedClassification,
            recording.id,
            matchedTrack.id,
            alert.User.email,
            deviceTimezone,
            thumbnail && Buffer.from(thumbnail),
          );
          if (alertSendSuccess) {
            // Log an email alert event also
            const detail = await DetailSnapshot.getOrCreateMatching("alert", {
              alertId: alert.id,
              recId: recording.id,
              trackId: matchedTrack.id,
              success: alertSendSuccess,
            });
            await Event.create({
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

export async function _sendEventAlerts(
  data: { what: string; conf: number; dateTimes?: IsoFormattedDateString[] },
  device: Device,
  eventDateTime: Date,
  _thumbnail: Uint8Array,
) {
  // TODO: This would be to send email alerts when we don't get recordings uploaded, we just get classification events
  //  from i.e. a Lora node.

  // Find the hierarchy for the matchedTag
  const { stationId } =
    await getDeviceIdAndGroupIdAndPossibleStationIdAtRecordingTime(
      device,
      eventDateTime,
    );
  let alerts: Alert[] = [];
  if (stationId) {
    alerts = await Alert.getActiveAlerts(
      data.what,
      device.id,
      stationId,
      device.GroupId,
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

export const updateRecordingTimeBookkeeping = async (
  recording: Recording,
  isNewUploadFromDevice = false,
  transaction?: Transaction,
) => {
  // Check if there are any more device/group/station recordings or if the latest recording of this type
  // is not different. If not, set lastRecordingTime to null so that the device will appear as deletable.
  const earliestColName =
    recording.type === RecordingType.ThermalRaw
      ? "earliestThermalRecordingTime"
      : "earliestAudioRecordingTime";
  const lastColName =
    recording.type === RecordingType.ThermalRaw
      ? "lastThermalRecordingTime"
      : "lastAudioRecordingTime";
  const lastActiveColName =
    recording.type === RecordingType.ThermalRaw
      ? "lastActiveThermalTime"
      : "lastActiveAudioTime";

  const updates = [
    // Update device
    Recording.sequelize.query(
      `
        UPDATE "Devices" d
        SET
          "${earliestColName}" = x."${earliestColName}",
          "${lastColName}" = x."${lastColName}"
        FROM (
        SELECT
         (
           SELECT r."recordingDateTime"
           FROM "Recordings" r
           WHERE r."DeviceId" = :deviceId
             AND r."deletedAt" IS NULL             
             AND r."type" = :type
             AND r."recordingDateTime" is not null
           ORDER BY r."recordingDateTime" ASC
           LIMIT 1
         ) AS "${earliestColName}",
         (
           SELECT r."recordingDateTime"
           FROM "Recordings" r
           WHERE r."DeviceId" = :deviceId
             AND r."deletedAt" IS NULL        
             AND r."type" = :type            
             AND r."recordingDateTime" is not null
           ORDER BY r."recordingDateTime" DESC
           LIMIT 1
         ) AS "${lastColName}"
        ) x
        WHERE d."id" = :deviceId
  `,
      {
        replacements: { deviceId: recording.DeviceId, type: recording.type },
        type: QueryTypes.UPDATE,
        transaction,
      },
    ),
    Recording.sequelize.query(
      `
        UPDATE "Groups" g
        SET
          "${earliestColName}" = x."${earliestColName}",
          "${lastColName}" = x."${lastColName}"
        FROM (
          SELECT
            (
              SELECT r."recordingDateTime"
              FROM "Recordings" r
              WHERE r."GroupId" = :groupId
                AND r."deletedAt" IS NULL                
                AND r."type" = :type
                AND r."recordingDateTime" is not null
              ORDER BY r."recordingDateTime" ASC
              LIMIT 1
            ) AS "${earliestColName}",
            (
              SELECT r."recordingDateTime"
              FROM "Recordings" r
              WHERE r."GroupId" = :groupId
                AND r."deletedAt" IS NULL                
                AND r."type" = :type
                AND r."recordingDateTime" is not null
              ORDER BY r."recordingDateTime" DESC
              LIMIT 1
            ) AS "${lastColName}"
        ) x
        WHERE g."id" = :groupId
        `,
      {
        replacements: { groupId: recording.GroupId, type: recording.type },
        type: QueryTypes.UPDATE,
        transaction,
      },
    ),
  ];

  if (isNewUploadFromDevice) {
    // Update station
    updates.push(
      Recording.sequelize.query(
        `
        UPDATE "Stations" s
        SET
          "${earliestColName}" = x."${earliestColName}",
          "${lastColName}" = x."${lastColName}",
          "${lastActiveColName}" = NOW()
        FROM (
          SELECT
            (
              SELECT r."recordingDateTime"
              FROM "Recordings" r
              WHERE r."StationId" = :stationId
                AND r."deletedAt" IS NULL
                AND r."type" = :type            
                AND r."recordingDateTime" is not null
              ORDER BY r."recordingDateTime" ASC
              LIMIT 1
            ) AS "${earliestColName}",
            (
              SELECT r."recordingDateTime"
              FROM "Recordings" r
              WHERE r."StationId" = :stationId
                AND r."deletedAt" IS NULL
                AND r."type" = :type            
                AND r."recordingDateTime" is not null
              ORDER BY r."recordingDateTime" DESC
              LIMIT 1
            ) AS "${lastColName}"
        ) x
        WHERE s."id" = :stationId
        `,
        {
          replacements: {
            stationId: recording.StationId,
            type: recording.type,
          },
          type: QueryTypes.UPDATE,
          transaction,
        },
      ),
    );
  } else {
    updates.push(
      Recording.sequelize.query(
        `
        UPDATE "Stations" s
        SET
          "${earliestColName}" = x."${earliestColName}",
          "${lastColName}" = x."${lastColName}"
        FROM (
          SELECT
            (
              SELECT r."recordingDateTime"
              FROM "Recordings" r
              WHERE r."StationId" = :stationId
                AND r."deletedAt" IS NULL
                AND r."type" = :type                
                AND r."recordingDateTime" is not null
              ORDER BY r."recordingDateTime" ASC
              LIMIT 1
            ) AS "${earliestColName}",
            (
              SELECT r."recordingDateTime"
              FROM "Recordings" r
              WHERE r."StationId" = :stationId
                AND r."deletedAt" IS NULL
                AND r."type" = :type                
                AND r."recordingDateTime" is not null
              ORDER BY r."recordingDateTime" DESC
              LIMIT 1
            ) AS "${lastColName}"
        ) x
        WHERE s."id" = :stationId
        `,
        {
          replacements: {
            stationId: recording.StationId,
            type: recording.type,
          },
          type: QueryTypes.UPDATE,
          transaction,
        },
      ),
    );
  }
  // TODO: Check if this will correctly NULL out times if there are no recordings.
  return Promise.all(updates);
};
