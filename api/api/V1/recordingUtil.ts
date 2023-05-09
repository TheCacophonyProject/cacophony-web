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
import { Alert, AlertStatic } from "@models/Alert";
import { AI_MASTER, TrackTag } from "@models/TrackTag";
import jsonwebtoken from "jsonwebtoken";
import mime from "mime";
import moment from "moment";
import urljoin from "url-join";
import config from "@config";
import models from "@models";
import util from "./util";
import { Recording, RecordingQueryOptions } from "@models/Recording";
import { Event, QueryOptions } from "@models/Event";
import { User } from "@models/User";
import Sequelize, { Op } from "sequelize";
import {
  DeviceSummary,
  DeviceVisitMap,
  Visit,
  VisitEvent,
  VisitSummary,
} from "./Visits";
import { Station } from "@models/Station";
import modelsUtil, { locationsAreEqual } from "@models/util/util";
import { dynamicImportESM } from "@/dynamic-import-esm";
import { DetailSnapshotId } from "@models/DetailSnapshot";
import { Device } from "@models/Device";
import deviceHistory, {
  DeviceHistory,
  DeviceHistorySetBy,
} from "@models/DeviceHistory";
import { Tag } from "@models/Tag";
import { Track } from "@models/Track";
import {
  DeviceId,
  FileId,
  GroupId,
  IsoFormattedDateString,
  LatLng,
  RecordingId,
  StationId,
  TrackTagId,
  UserId,
} from "@typedefs/api/common";
import {
  AcceptableTag,
  DeviceType,
  RecordingProcessingState,
  RecordingType,
} from "@typedefs/api/consts";
import {
  ClassifierModelDescription,
  ClassifierRawResult,
  RawTrack,
  TrackClassification,
  TrackFramePosition,
} from "@typedefs/api/fileProcessing";
import { ApiRecordingTagRequest } from "@typedefs/api/tag";
import { ApiTrackPosition } from "@typedefs/api/track";
import { GetObjectOutput, ManagedUpload } from "aws-sdk/clients/s3";
import { AWSError } from "aws-sdk";
import { CptvHeader } from "cptv-decoder";
import log from "@log";
import AllModels from "@models";

let CptvDecoder;
(async () => {
  CptvDecoder = (await dynamicImportESM("cptv-decoder")).CptvDecoder;
})();

// How close is a station allowed to be to another station?
export const MIN_STATION_SEPARATION_METERS = 60;
// The radius of the station is half the max distance between stations: any recording inside the radius can
// be considered to belong to that station.
export const MAX_DISTANCE_FROM_STATION_FOR_RECORDING =
  MIN_STATION_SEPARATION_METERS / 2;

export function latLngApproxDistance(a: LatLng, b: LatLng): number {
  if (a.lat === b.lat && a.lng === b.lng) {
    return 0;
  }
  const R = 6371e3;
  // Using 'spherical law of cosines' from https://www.movable-type.co.uk/scripts/latlong.html
  const lat1 = (a.lat * Math.PI) / 180;
  const costLat1 = Math.cos(lat1);
  const sinLat1 = Math.sin(lat1);
  const lat2 = (b.lat * Math.PI) / 180;
  const deltaLng = ((b.lng - a.lng) * Math.PI) / 180;
  const part1 = Math.acos(
    sinLat1 * Math.sin(lat2) + costLat1 * Math.cos(lat2) * Math.cos(deltaLng)
  );
  return part1 * R;
}

export async function tryToMatchLocationToStationInGroup(
  location: LatLng,
  groupId: GroupId,
  activeFromDate: Date,
  lookForwards: boolean = false
): Promise<Station | null> {
  // Match the recording to any stations that the group might have:
  let stations;
  if (lookForwards) {
    stations = await models.Station.activeInGroupDuringTimeRange(
      groupId,
      activeFromDate,
      new Date(),
      lookForwards
    );
  } else {
    stations = await models.Station.activeInGroupAtTime(
      groupId,
      activeFromDate
    );
  }
  const stationDistances = [];
  for (const station of stations) {
    // See if any stations match: Looking at the location distance between this recording and the stations.
    const distanceToStation = latLngApproxDistance(station.location, location);
    stationDistances.push({ distanceToStation, station });
  }
  const validStationDistances = stationDistances.filter(
    ({ distanceToStation }) =>
      distanceToStation <= MAX_DISTANCE_FROM_STATION_FOR_RECORDING
  );

  // There shouldn't really ever be more than one station within our threshold distance,
  // since we check that stations aren't too close together when we add them.  However, on the off
  // chance we *do* get two or more valid stations for a recording, take the closest one.
  validStationDistances.sort((a, b) => {
    return b.distanceToStation - a.distanceToStation;
  });
  const closest = validStationDistances.pop();
  if (closest) {
    return closest.station;
  }
  return null;
}

export async function tryToMatchRecordingToStation(
  recording: Recording,
  stations?: Station[]
): Promise<Station | null> {
  // If the recording does not yet have a location, return
  if (!recording.location) {
    return null;
  }

  // Match the recording to any stations that the group might have:
  if (!stations) {
    const group = await models.Group.getFromId(recording.GroupId);
    stations = await group.getStations({
      where: {
        activeAt: { [Op.lte]: recording.recordingDateTime },
        retiredAt: {
          [Op.or]: [
            { [Op.eq]: null },
            { [Op.gt]: recording.recordingDateTime },
          ],
        },
      },
    });
  }
  const stationDistances = [];
  for (const station of stations) {
    // See if any stations match: Looking at the location distance between this recording and the stations.
    const distanceToStation = latLngApproxDistance(
      station.location,
      recording.location
    );
    stationDistances.push({ distanceToStation, station });
  }
  const validStationDistances = stationDistances.filter(
    ({ distanceToStation }) =>
      distanceToStation <= MAX_DISTANCE_FROM_STATION_FOR_RECORDING
  );

  // There shouldn't really ever be more than one station within our threshold distance,
  // since we check that stations aren't too close together when we add them.  However, on the off
  // chance we *do* get two or more valid stations for a recording, take the closest one.
  validStationDistances.sort((a, b) => {
    return b.distanceToStation - a.distanceToStation;
  });
  const closest = validStationDistances.pop();
  if (closest) {
    return closest.station;
  }
  return null;
}

async function getThumbnail(rec: Recording, trackId?: number) {
  let thumbKey: string;
  let fileKey = rec.rawFileKey;
  if (
    rec.type === RecordingType.TrailCamImage ||
    rec.type == RecordingType.TrailCamVideo
  ) {
    fileKey = rec.fileKey;
  }
  if (trackId) {
    thumbKey = `${fileKey}-${trackId}-thumb`;
  } else {
    const thumbedTracks = rec.Tracks.filter((track) => track.data?.thumbnail);
    if (thumbedTracks.length > 0) {
      // choose best track based off visit tag and highest score
      const recVisit = new Visit(rec, 0, thumbedTracks);
      const commonTag = recVisit.mostCommonTag();
      const trackIds = recVisit.events
        .filter((event) => event.trackTag.what == commonTag.what)
        .map((event) => event.trackID);
      const bestTracks = rec.Tracks.filter((track) =>
        trackIds.includes(track.id)
      );

      // sort by area
      bestTracks.sort(function (a, b) {
        return a.data.thumbnail.width * a.data.thumbnail.height >
          b.data.thumbnail.width * b.data.thumbnail.height
          ? 1
          : -1;
      });
      thumbKey = `${fileKey}-${bestTracks[0].id}-thumb`;
    } else {
      thumbKey = `${fileKey}-thumb`;
    }
  }

  const s3 = modelsUtil.openS3();
  if (thumbKey.startsWith("a_")) {
    thumbKey = thumbKey.slice(2);
  }
  const params = {
    Key: thumbKey,
  };
  return s3.getObject(params).promise();
}

const THUMBNAIL_SIZE = 64;
export const THUMBNAIL_PALETTE = "Viridis";
// Gets a raw cptv frame from a recording
export async function getCPTVFrames(
  recording: Recording,
  frameNumbers: Set<number>
): Promise<any | undefined> {
  const fileData: GetObjectOutput | AWSError = await modelsUtil
    .openS3()
    .getObject({
      Key: recording.rawFileKey,
    })
    .promise()
    .catch((err) => {
      return err;
    });
  //work around for error in cptv-decoder
  //best to use createReadStream() from s3 when cptv-decoder has support
  if (fileData instanceof Error) {
    return;
  }
  const data = new Uint8Array(
    (fileData as GetObjectOutput).Body as ArrayBufferLike
  );
  const { CptvDecoder } = await dynamicImportESM("cptv-decoder");
  const decoder = new CptvDecoder();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const meta = await decoder.getBytesMetadata(data);
  const result = await decoder.initWithLocalCptvFile(data);
  if (!result) {
    decoder.close();
    return;
  }
  let finished = false;
  let currentFrame = 0;
  const frames = {};
  let frame;
  log.info(`Extracting  ${frameNumbers.size} frames for thumbnails `);
  while (!finished) {
    frame = await decoder.getNextFrame();
    if (frame && frame.meta.isBackgroundFrame) {
      // Skip over background frame without incrementing counter.
      continue;
    }
    finished = frame === null || (await decoder.getTotalFrames()) !== null;
    if (frameNumbers.has(currentFrame)) {
      frameNumbers.delete(currentFrame);
      frames[currentFrame] = frame;
    }
    if (frameNumbers.size == 0) {
      break;
    }
    currentFrame++;
  }
  decoder.close();
  return frames;
}

// Creates and saves a thumbnail for a recording using specified thumbnail info
async function saveThumbnailInfo(
  recording: Recording,
  tracks: Track[],
  clip_thumbnail: TrackFramePosition
): Promise<ManagedUpload.SendData[] | Error[]> {
  let fileKey = recording.rawFileKey;
  if (
    recording.type === RecordingType.TrailCamImage ||
    recording.type == RecordingType.TrailCamVideo
  ) {
    fileKey = recording.fileKey;
  }
  const thumbnailTracks = tracks.filter(
    (track) => track.data?.thumbnail?.region
  );
  const frameNumbers = new Set<number>(
    thumbnailTracks.map((track) => track.data.thumbnail?.region?.frame_number)
  );
  if (clip_thumbnail) {
    frameNumbers.add(clip_thumbnail.frame_number);
  }
  if (frameNumbers.size == 0) {
    log.warning(`No thumbnails to be made for ${recording.id}`);
    return;
  }
  const frames = await getCPTVFrames(recording, frameNumbers);
  const frameUploads = [];
  for (const track of thumbnailTracks) {
    const frame = frames[track.data.thumbnail.region.frame_number];
    if (!frame) {
      frameUploads.push(
        Error(
          `Failed to extract CPTV frame for track ${track.id}, frame  ${track.data.thumbnail.region.frame_number}`
        )
      );
      continue;
    }
    const thumb = await createThumbnail(frame, track.data.thumbnail.region);
    frameUploads.push(
      await modelsUtil
        .openS3()
        .upload({
          Key: `${fileKey}-${track.id}-thumb`,
          Body: thumb.data,
          Metadata: thumb.meta,
        })
        .promise()
        .catch((err) => {
          return err;
        })
    );
  }

  if (clip_thumbnail) {
    const frame = frames[clip_thumbnail.frame_number];
    if (!frame) {
      frameUploads.push(
        Error(`Failed to extract CPTV frame ${clip_thumbnail.frame_number}`)
      );
    } else {
      const thumb = await createThumbnail(frame, clip_thumbnail);
      console.log("saving", `${fileKey}-thumb`);
      frameUploads.push(
        await modelsUtil
          .openS3()
          .upload({
            Key: `${fileKey}-thumb`,
            Body: thumb.data,
            Metadata: thumb.meta,
          })
          .promise()
          .catch((err) => {
            return err;
          })
      );
    }
  }
  return Promise.all(frameUploads);
}

//expands the smallest dimension of the region so that it is a square that fits inside resX and resY
function squareRegion(
  thumbnail: TrackFramePosition,
  resX: number,
  resY: number
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
  resY: number
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
  thumbnail: TrackFramePosition
): Promise<{ data: Buffer; meta: { palette: string; region: any } }> {
  const frameMeta = frame.meta.imageData;
  const resX = frameMeta.width;
  const resY = frameMeta.height;

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
      const pixel = frame.data[frameStart + offset];
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
      let pixel = frame.data[frameStart + offset];
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
  const { renderFrameIntoFrameBuffer, ColourMaps } = await dynamicImportESM(
    "cptv-decoder"
  );
  let palette = ColourMaps[0];
  for (const colourMap of ColourMaps) {
    if (colourMap[0] == THUMBNAIL_PALETTE) {
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
  device: Device,
  location: LatLng,
  dateTime: Date,
  setBy: DeviceHistorySetBy = "automatic"
): Promise<{
  stationToAssignToRecording: Station;
  deviceHistoryEntry: DeviceHistory;
}> => {
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
        location
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
            location
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
          location
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
      };
      let stationToAssign = await tryToMatchLocationToStationInGroup(
        location,
        device.GroupId,
        dateTime,
        false
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
        newDeviceHistoryEntry
      );
      return {
        stationToAssignToRecording: stationToAssign,
        deviceHistoryEntry: newDeviceHistory,
      };
    } else {
      const stationToAssign = await models.Station.findByPk(
        existingDeviceHistoryEntry.stationId
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
  fileBytes: Uint8Array
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
      await decoder.getStreamError()
    );
  }
  decoder.close();
  return { metadata, fileIsCorrupt };
};

const parseAndMergeEmbeddedFileMetadataIntoRecording = async (
  data: any,
  fileData: Uint8Array,
  recording: Recording
): Promise<boolean> => {
  if (fileData.length === 0) {
    return true;
  }
  if (data.type === RecordingType.ThermalRaw) {
    // Read the file back out from s3 and decode/parse it.
    const { metadata, fileIsCorrupt: isCorrupt } = await tryDecodeCptvMetadata(
      fileData
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

const getDeviceIdAndGroupIdAndPossibleStationIdAtRecordingTime = async (
  device: Device,
  atTime: Date
): Promise<{ groupId: GroupId; deviceId: DeviceId; stationId?: StationId }> => {
  // NOTE: Use the uuid here, so we can assign old recordings that may be uploaded much later
  //  to the correct group that the device belonged to when the recording was created.
  const deviceHistory = (await models.DeviceHistory.findOne({
    where: {
      uuid: device.uuid,
      fromDateTime: { [Op.lte]: atTime },
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
  log.error("Missing entry in DeviceHistory table for device #%s", device.id);
  return { deviceId: device.id, groupId: device.GroupId };
};

export const uploadRawRecording = util.multipartUpload(
  "raw",
  async (
    uploader: "device" | "user",
    uploadingDevice: Device,
    uploadingUser: User | null,
    data: any,
    keys: string[],
    uploadedFileDatas: { key: string; data: Uint8Array; filename: string }[]
  ): Promise<Recording> => {
    const recording = models.Recording.buildSafely(data);
    // Add the filehash if present
    if (data.fileHash) {
      recording.rawFileHash = data.fileHash;
    }
    const uploadedFileDataRaw = uploadedFileDatas.find(({ key }) =>
      key.startsWith("raw")
    );
    recording.rawFileSize = uploadedFileDataRaw.data.length;
    recording.rawFileKey = uploadedFileDataRaw.key;
    recording.rawMimeType = guessRawMimeType(
      data.type,
      uploadedFileDataRaw.filename
    );
    if (uploadedFileDatas.length !== 1) {
      const uploadedFileDataNonRaw = uploadedFileDatas.find(({ key }) =>
        key.startsWith("web")
      );
      // Add the non-raw derived file details.
      recording.fileKey = uploadedFileDataNonRaw.key;
      recording.fileSize = uploadedFileDataNonRaw.data.length;
      recording.fileMimeType = guessRawMimeType(
        data.type,
        uploadedFileDataNonRaw.filename
      );
    }

    if (uploader === "device") {
      recording.DeviceId = uploadingDevice.id;
      if (typeof uploadingDevice.public === "boolean") {
        recording.public = uploadingDevice.public;
      }
    }
    recording.uploader = uploader;
    recording.uploaderId =
      uploader === "device" ? uploadingDevice.id : (uploadingUser as User).id;
    let deviceId: DeviceId;
    let groupId: DeviceId;
    // Check if the file is corrupt and use file metadata if it can be parsed.
    const uploadedFileData = uploadedFileDataRaw.data;

    const fileIsCorrupt = await parseAndMergeEmbeddedFileMetadataIntoRecording(
      data,
      uploadedFileData,
      recording
    );
    const cameraTypes = [
      RecordingType.ThermalRaw,
      RecordingType.InfraredVideo,
      RecordingType.TrailCamImage,
      RecordingType.TrailCamVideo,
    ];
    const recordingLocation = recording.location;
    if (recordingLocation) {
      const { stationToAssignToRecording, deviceHistoryEntry } =
        await maybeUpdateDeviceHistory(
          uploadingDevice,
          recordingLocation,
          recording.recordingDateTime
        );
      recording.StationId = stationToAssignToRecording.id;

      {
        // Update station lastRecordingTimes if needed.
        if (
          recording.type === RecordingType.Audio &&
          (!stationToAssignToRecording.lastAudioRecordingTime ||
            recording.recordingDateTime >
              stationToAssignToRecording.lastAudioRecordingTime)
        ) {
          stationToAssignToRecording.lastAudioRecordingTime =
            recording.recordingDateTime;
          await stationToAssignToRecording.save();
        } else if (
          cameraTypes.includes(recording.type) &&
          (!stationToAssignToRecording.lastThermalRecordingTime ||
            recording.recordingDateTime >
              stationToAssignToRecording.lastThermalRecordingTime)
        ) {
          stationToAssignToRecording.lastThermalRecordingTime =
            recording.recordingDateTime;
          await stationToAssignToRecording.save();
        }
      }
      deviceId = deviceHistoryEntry.DeviceId;
      groupId = deviceHistoryEntry.GroupId;
    }

    if (!deviceId && !groupId) {
      // Check what group the uploading device (or the device embedded in the recording) was part of at the time the recording was made.
      const { deviceId: d, groupId: g } =
        await getDeviceIdAndGroupIdAndPossibleStationIdAtRecordingTime(
          uploadingDevice,
          recording.recordingDateTime
        );
      deviceId = d;
      groupId = g;
    }

    recording.DeviceId = deviceId;
    recording.GroupId = groupId;

    {
      // Update the device location and lastRecordingTime from the recording data,
      // if the recording time is *later* than the last recording time, or there
      // is no last recording time
      if (
        !uploadingDevice.lastRecordingTime ||
        uploadingDevice.lastRecordingTime < recording.recordingDateTime
      ) {
        await uploadingDevice.update({
          location: recording.location,
          lastRecordingTime: recording.recordingDateTime,
        });

        // Update the group lastRecordingTimes too:
        const group = await uploadingDevice.getGroup();
        // Update the last recording time for the group if necessary, to give us a quick and easy way
        // to see which groups have new recordings, and of what kind.
        if (
          cameraTypes.includes(recording.type) &&
          (!group.lastThermalRecordingTime ||
            group.lastThermalRecordingTime < recording.recordingDateTime)
        ) {
          await group.update({
            lastThermalRecordingTime: recording.recordingDateTime,
          });
        } else if (
          recording.type === RecordingType.Audio &&
          (!group.lastAudioRecordingTime ||
            group.lastAudioRecordingTime < recording.recordingDateTime)
        ) {
          group.lastAudioRecordingTime = recording.recordingDateTime;
          await group.update({
            lastAudioRecordingTime: recording.recordingDateTime,
          });
        }
      }
      if (uploadingDevice.kind === DeviceType.Unknown) {
        // If this is the first recording we've gotten from a device, we can set its type.
        const typeMappings = {
          [RecordingType.Audio]: "audio",
          [RecordingType.ThermalRaw]: "thermal",
          [RecordingType.TrailCamVideo]: "trailcam",
          [RecordingType.TrailCamImage]: "trailcam",
          [RecordingType.InfraredVideo]: "trapcam",
        };
        const deviceType = typeMappings[recording.type];
        await uploadingDevice.update({ kind: deviceType });
      }
    }

    // We need to reconcile the recording state in the DB to run these next bits.
    await recording.save();
    {
      let tracked = false;
      if (data.metadata) {
        tracked = await tracksFromMeta(recording, data.metadata);
      }
      if (data.processingState) {
        // NOTE: If the processingState field is present when a recording is uploaded, this means that the recording
        //  has already been processed, and we are supplying the processing results with the recording.
        //  This *only* happens from the test suite, and exists solely for testing purposes.
        recording.processingState = data.processingState;
      } else {
        // NOTE: During testing, even if the file is corrupt, it won't be marked as such if a concrete processingState
        //  is supplied.  This would ideally get fixed once we are always uploading valid files during testing.

        // FIXME - This logic still looks a little suspect.
        if (!fileIsCorrupt) {
          if (tracked && recording.type === RecordingType.ThermalRaw) {
            recording.processingState = RecordingProcessingState.AnalyseThermal;
            // already have done tracking pi skip to analyse state
          } else if (
            recording.type !== RecordingType.TrailCamImage &&
            recording.type !== RecordingType.TrailCamVideo
          ) {
            recording.processingState = models.Recording.uploadedState(
              data.type as RecordingType
            );
          } else {
            // Trailcam and others
            recording.processingState = RecordingProcessingState.Finished;
          }
        } else {
          // Mark the recording as corrupt for future investigation, and so it doesn't get picked up by the pipeline.
          recording.processingState = RecordingProcessingState.Corrupt;
        }
      }
    }
    const recordingHasFinishedProcessing =
      recording.processingState ===
      models.Recording.finishedState(data.type as RecordingType);
    const promises = [recording.save()] as Promise<any>[];
    if (recordingHasFinishedProcessing) {
      // NOTE: Should only occur during testing.
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;
      const recordingAgeMs =
        new Date().getTime() - recording.recordingDateTime.getTime();
      if (uploader === "device" && recordingAgeMs < twentyFourHoursMs) {
        // Alerts should only be sent for uploading devices.
        promises.push(sendAlerts(recording.id));
      }
    }
    await Promise.all(promises);
    return recording;
  }
);

// Returns a promise for the recordings query specified in the
// request.
async function query(
  requestUserId: UserId,
  type: RecordingType,
  countAll: boolean,
  options: RecordingQueryOptions
): Promise<{ rows: Recording[]; count: number }> {
  if (type && typeof options.where === "object") {
    options.where = { ...options.where, type };
  }
  // FIXME - Do this in extract-middleware as bulk recording extractor
  const builder = new models.Recording.queryBuilder().init(
    requestUserId,
    options
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

async function bulkDelete(
  requestUserId: UserId,
  type: RecordingType,
  options: RecordingQueryOptions,
  actuallyDelete: boolean = false // FIXME - Make recordings actually be deleted?
): Promise<number[]> {
  if (type && typeof options.where === "object") {
    options.where = { ...options.where, type };
  }

  const builder = new models.Recording.queryBuilder().init(
    requestUserId,
    options
  );

  const values = await models.Recording.findAll<Recording>(builder.get());
  if (values.length === 0) {
    throw new Error("No recordings found to delete");
  }
  const deletion = { deletedAt: new Date(), deletedBy: requestUserId };
  const ids = values.map((value) => value.id);
  const deletedValues = (await models.Recording.update(deletion, {
    where: { id: ids },
    returning: ["id"],
  })) as unknown as Promise<[number, { id: number }[]]>;
  if (deletedValues[1]) {
    return deletedValues[1].map((value) => value.id);
  }
  return [];
}

export async function getTrackTags(
  userId: UserId,
  viewAsSuperUser: boolean,
  includeAI: boolean,
  recordingType: string,
  excludeTags = [],
  offset?: number,
  limit?: number
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

// Returns a promise for report rows for a set of recordings. Takes
// the same parameters as query() above.
export async function reportRecordings(
  userId: UserId,
  includeAudiobait: boolean,
  options: RecordingQueryOptions
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
  ];

  if (includeAudiobait) {
    labels.push(
      "Audio Bait",
      "Audio Bait Time",
      "Mins Since Audio Bait",
      "Audio Bait Volume"
    );
  }
  labels.push("URL", "Cacophony Index", "Species Classification");

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

    const recording_tags = r.Tags.map((t) => t.what || t.detail);

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
        audioBaitVolume
      );
    }

    thisRow.push(urljoin(recording_url_base, r.id.toString()), cacophonyIndex);
    out.push(thisRow);
  }
  return out;
}

function getCacophonyIndex(recording: Recording): string | null {
  return recording.cacophonyIndex?.map((val) => val.index_percent).join(";");
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
  groupId?: GroupId
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

function guessRawMimeType(type, filename) {
  const mimeType = mime.getType(filename);
  if (mimeType) {
    return mimeType;
  }
  switch (type) {
    case RecordingType.ThermalRaw:
      return "application/x-cptv";
    case RecordingType.Audio:
      return "audio/mpeg";
    default:
      return "application/octet-stream";
  }
}

// FIXME(jon): This should really be a method on Recording?
const addTag = async (
  user: User | null,
  recording: Recording,
  tag: ApiRecordingTagRequest
): Promise<Tag> => {
  const tagInstance = models.Tag.buildSafely(tag);
  (tagInstance as any).RecordingId = recording.id;
  if (user) {
    tagInstance.taggerId = user.id;
  }
  await tagInstance.save();
  return tagInstance;
};

async function tracksFromMeta(recording: Recording, metadata: any) {
  try {
    if (!("tracks" in metadata)) {
      return false;
    }
    const algorithmDetail = await models.DetailSnapshot.getOrCreateMatching(
      "algorithm",
      metadata["algorithm"]
    );

    for (const trackMeta of metadata["tracks"]) {
      const track = await recording.createTrack({
        data: trackMeta,
        AlgorithmId: algorithmDetail.id,
      });
      if (
        !("predictions" in trackMeta) ||
        trackMeta["predictions"].length == 0
      ) {
        await track.updateIsFiltered();
        continue;
      }
      for (const prediction of trackMeta["predictions"]) {
        let modelName = "unknown";
        if (prediction.model_id) {
          if (metadata.models) {
            const model = metadata.models.find(
              (model) => model.id == prediction.model_id
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
          tag_data["prediction_frames"] = prediction["prediction_frames"];
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
        await track.addTag(tag, prediction["confidence"], true, tag_data);
      }
    }
  } catch (err) {
    log.error(
      "Error creating recording tracks from metadata: %s",
      err.toString()
    );
  }
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function updateMetadata(recording: any, metadata: any) {
  throw new Error("recordingUtil.updateMetadata is unimplemented!");
}

// Returns a promise for the recordings visits query specified in the
// request.
async function queryVisits(
  userId: UserId,
  options: RecordingQueryOptions
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
    options
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
    const events = await models.Event.query(
      userId,
      devVisits.startTime.clone().startOf("day").toISOString(),
      devVisits.endTime.toISOString(),
      parseInt(devId),
      0,
      1000,
      false,
      { eventType: "audioBait" } as QueryOptions
    );
    if (events.rows) {
      devVisits.addAudioBaitEvents(events.rows);
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
  userId: UserId,
  options: RecordingQueryOptions
) {
  const results = await queryVisits(userId, options);
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
    urljoin(recordingUrlBase, event.recID.toString(), event.trackID.toString()),
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
async function getRecordingForVisit(id: number): Promise<Recording> {
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
        attributes: [
          "id",
          [
            Sequelize.fn(
              "json_build_object",
              "start_s",
              Sequelize.literal(`"Tracks"."data"#>'{start_s}'`),
              "end_s",
              Sequelize.literal(`"Tracks"."data"#>'{end_s}'`)
            ),
            "data",
          ],
        ],
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
              [Sequelize.json("data.name"), "data"],
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

async function sendAlerts(recId: RecordingId) {
  const recording = await getRecordingForVisit(recId);
  const recVisit = new Visit(recording, 0);
  recVisit.completeVisit();
  let matchedTrack;
  let matchedTag: TrackTag;
  // find any ai master tags that match the visit tag.

  // Currently we only send one alert per recording.
  for (const track of recording.Tracks) {
    matchedTag = track.TrackTags.find(
      (tag) => tag.data === AI_MASTER && recVisit.what === tag.what
    );
    if (matchedTag) {
      matchedTrack = track;
      break;
    }
  }
  if (!matchedTag) {
    return;
  }
  // Find the hierarchy for the matchedTag
  const alerts: Alert[] = await (models.Alert as AlertStatic).getActiveAlerts(
    matchedTag.path,
    recording.DeviceId || undefined,
    recording.StationId || undefined
  );

  if (alerts.length > 0) {
    let thumbnail;
    try {
      thumbnail = await getThumbnail(recording, matchedTrack.id);
    } catch (e) {
      try {
        thumbnail = await getThumbnail(recording);
      } catch (e) {
        log.warning(
          "Alerting without thumbnail for %d and track %d",
          recId,
          matchedTrack.id
        );
      }
    }
    for (const alert of alerts) {
      await alert.sendAlert(
        recording,
        matchedTrack,
        matchedTag,
        alert.StationId !== null ? "station" : "device",
        thumbnail && {
          buffer: thumbnail.Body as Buffer,
          cid: "thumbnail",
          mimeType: "image/png",
        }
      );
    }
  }
  return alerts;
}

export async function sendEventAlerts(
  data: { what: string; conf: number; dateTimes?: IsoFormattedDateString[] },
  device: Device,
  eventDateTime: Date,
  thumbnail: Uint8Array
) {
  // Find the hierarchy for the matchedTag
  const { stationId } =
    await getDeviceIdAndGroupIdAndPossibleStationIdAtRecordingTime(
      device,
      eventDateTime
    );
  let alerts: Alert[] = [];
  if (stationId) {
    alerts = await (models.Alert as AlertStatic).getActiveAlerts(
      data.what,
      undefined,
      stationId
    );
    for (const alert of alerts) {
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

const addTracksToRecording = async (
  recording: Recording,
  tracks: RawTrack[],
  trackingAlgorithmId: DetailSnapshotId
): Promise<Track[]> => {
  const createTracks = [];
  for (const {
    positions,
    start_s,
    end_s,
    frame_start,
    frame_end,
    num_frames,
  } of tracks) {
    const limitedTrack: TrackData = {
      // TODO do we need id in the front-end?
      start_s,
      end_s,
      frame_start,
      frame_end,
      num_frames,
      positions,
    };
    createTracks.push(
      recording.createTrack({
        data: limitedTrack,
        AlgorithmId: trackingAlgorithmId, // FIXME Should *tracks* have an algorithm id, or rather should it be on the TrackTag?
      })
    );
  }
  return await Promise.all(createTracks);
};

const addAITrackTags = async (
  recording: Recording,
  rawTracks: RawTrack[],
  tracks: Track[],
  models: ClassifierModelDescription[]
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
        })
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
  tracks: Track[]
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
  prediction: TrackClassification
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
  tracks: RawTrack[]
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
    (a: RawTrack, b: RawTrack) => a.start_s - b.start_s
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
  tracks: RawTrack[]
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
      multipleAnimalConfidence.toFixed(2)
    );
  }

  return [tracks, tags, hasMultipleAnimals];
};

export const finishedProcessingRecording = async (
  recording: Recording,
  classifierResult: ClassifierRawResult,
  prevState: RecordingProcessingState
): Promise<void> => {
  // See if we should tag the recording as having multiple animals
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_, tags, hasMultipleAnimals] = calculateTags(classifierResult.tracks);
  if (hasMultipleAnimals) {
    await addTag(null, recording, {
      detail: AcceptableTag.MultipleAnimals,
      confidence: 1,
    });
  }

  // See if we should tag the recording as false-positive (with no tracks) (or missed tracks?)

  // TODO(jon): Do we need to stringify this?
  const algorithm = await models.DetailSnapshot.getOrCreateMatching(
    "algorithm",
    classifierResult.algorithm
  );
  // Add any tracks
  const tracks = await addTracksToRecording(
    recording,
    classifierResult.tracks,
    algorithm.id
  );

  // Add tags for those tracks
  // FIXME - unused
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const trackTags = await addAITrackTags(
    recording,
    classifierResult.tracks,
    tracks,
    classifierResult.models
  );

  // Calculate the AI_MASTER tag from the tracks provided, and add that
  // FIXME - unused
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const masterTrackTagId = await calculateAndAddAIMasterTag(
    recording,
    classifierResult.tracks,
    tracks
  );

  for (const track of tracks) {
    await track.updateIsFiltered();
  }

  // Add additionalMetadata to recording:
  // model name + classify time (total?)
  // algorithm - tracking_algorithm
  // tracking_time
  // thumbnail_region

  // Save metadata about classification:
  await modelsUtil
    .openS3()
    .upload({
      Key: `${recording.rawFileKey}-classifier-metadata`,
      Body: await compressString(JSON.stringify(classifierResult)),
    })
    .promise()
    .catch((err) => {
      return err;
    });

  // Save a thumbnail if there was one
  // method typescript will need to change
  // const results = await saveThumbnailInfo(
  //   recording,
  //   classifierResult.tracks,
  //   classifierResult.thumbnail_region
  // );
  // for(const result of results){
  //   if (result instanceof Error) {
  //     log.warning(
  //       "Failed to upload thumbnail for %s",
  //       `${recording.rawFileKey}-thumb`
  //     );
  //     log.error("Reason: %s", result.message);
  //   }
  // }

  if (prevState !== RecordingProcessingState.Reprocess) {
    await sendAlerts(recording.id);
  }
};

// Mapping
export const mapPosition = (position: any): ApiTrackPosition => {
  if (Array.isArray(position)) {
    return {
      x: position[1][0],
      y: position[1][1],
      width: position[1][2] - position[1][0],
      height: position[1][3] - position[1][1],
      frameTime: position[0],
    };
  } else {
    return {
      x: position.x,
      y: position.y,
      width: position.width,
      height: position.height,
      order: position.frame_number ?? position.order,
      mass: position.mass,
      blank: position.blank,
    };
  }
};

export default {
  query,
  bulkDelete,
  addTag,
  tracksFromMeta,
  updateMetadata,
  queryVisits,
  saveThumbnailInfo,
  sendAlerts,
  getThumbnail,
  signedToken,
};
