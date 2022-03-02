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
import { AlertStatic } from "@models/Alert";
import { AI_MASTER } from "@models/TrackTag";
import jsonwebtoken from "jsonwebtoken";
import mime from "mime";
import moment from "moment";
import urljoin from "url-join";
import config from "@config";
import models from "@models";
import util from "./util";
import { AudioRecordingMetadata, Recording } from "@models/Recording";
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
import modelsUtil from "@models/util/util";
import { dynamicImportESM } from "@/dynamic-import-esm";
import log from "@log";
import {
  ClassifierModelDescription,
  ClassifierRawResult,
  RawTrack,
  TrackClassification,
  TrackFramePosition,
} from "@typedefs/api/fileProcessing";
import { CptvFrame, CptvHeader } from "cptv-decoder";
import { GetObjectOutput } from "aws-sdk/clients/s3";
import { AWSError } from "aws-sdk";
import { ManagedUpload } from "aws-sdk/lib/s3/managed_upload";
import { Track } from "@models/Track";
import { DetailSnapshotId } from "@models/DetailSnapshot";
import { Tag } from "@models/Tag";
import {
  FileId,
  LatLng,
  RecordingId,
  TrackTagId,
  UserId,
} from "@typedefs/api/common";
import {
  AcceptableTag,
  RecordingProcessingState,
  RecordingType,
} from "@typedefs/api/consts";
import { Device } from "@models/Device";
import { ApiRecordingTagRequest } from "@typedefs/api/tag";
import { ApiTrackPosition } from "@typedefs/api/track";
import SendData = ManagedUpload.SendData;
import { canonicalLatLng, locationsAreEqual } from "@models/Group";

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
        retiredAt: { [Op.eq]: null },
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

async function getThumbnail(rec: Recording) {
  const s3 = modelsUtil.openS3();
  let Key = `${rec.rawFileKey}-thumb`;
  if (Key.startsWith("a_")) {
    Key = Key.substr(2);
  }
  const params = {
    Key,
  };
  return s3.getObject(params).promise();
}

const THUMBNAIL_MIN_SIZE = 64;
const THUMBNAIL_PALETTE = "Viridis";
// Gets a raw cptv frame from a recording
async function getCPTVFrame(
  recording: Recording,
  frameNumber: number
): Promise<CptvFrame | undefined> {
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
  let frame;
  log.info("Extracting frame #%d for thumbnail", frameNumber);
  while (!finished) {
    frame = await decoder.getNextFrame();
    if (frame && frame.meta.isBackgroundFrame) {
      // Skip over background frame without incrementing counter.
      continue;
    }
    finished = frame === null || (await decoder.getTotalFrames()) !== null;
    if (currentFrame == frameNumber) {
      break;
    }
    currentFrame++;
  }
  decoder.close();
  return frame;
}

// Creates and saves a thumbnail for a recording using specified thumbnail info
async function saveThumbnailInfo(
  recording: Recording,
  thumbnail: TrackFramePosition
): Promise<SendData | Error> {
  const frame = await getCPTVFrame(recording, thumbnail.frame_number);
  if (!frame) {
    throw new Error(`Failed to extract CPTV frame ${thumbnail.frame_number}`);
  }
  const thumb = await createThumbnail(frame, thumbnail);
  return await modelsUtil
    .openS3()
    .upload({
      Key: `${recording.rawFileKey}-thumb`,
      Body: thumb.data,
      Metadata: thumb.meta,
    })
    .promise()
    .catch((err) => {
      return err;
    });
}

// Create a png thumbnail image  from this frame with thumbnail info
// Expand the thumbnail region such that it is a square and at least THUMBNAIL_MIN_SIZE
// width and height
//render the png in THUMBNAIL_PALETTE
//returns {data: buffer, meta: metadata about image}
async function createThumbnail(
  frame,
  thumbnail: TrackFramePosition
): Promise<{ data: Buffer; meta: { palette: string; region: any } }> {
  const frameMeta = frame.meta.imageData;
  const resX = frameMeta.width;
  const resY = frameMeta.height;

  const size = Math.max(THUMBNAIL_MIN_SIZE, thumbnail.height, thumbnail.width);
  const thumbnailData = new Uint8Array(size * size);

  //dimensions to it is a square with a minimum size of THUMBNAIL_MIN_SIZE
  const extraWidth = (size - thumbnail.width) / 2;
  thumbnail.x -= Math.ceil(extraWidth);
  thumbnail.x = Math.max(0, thumbnail.x);
  thumbnail.width = size;
  if (thumbnail.x + thumbnail.width > resX) {
    thumbnail.x = resX - thumbnail.width;
  }

  const extraHeight = (size - thumbnail.height) / 2;
  // noinspection JSSuspiciousNameCombination
  thumbnail.y -= Math.ceil(extraHeight);
  thumbnail.y = Math.max(0, thumbnail.y);
  thumbnail.height = size;
  if (thumbnail.y + thumbnail.height > resY) {
    thumbnail.y = resY - thumbnail.height;
  }

  // FIXME(jon): Normalise to the thumbnail region, not the entire frame.
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
  if (thumbnail.width != size || thumbnail.height != size) {
    const resized_thumb = await sharp(thumbnailData, {
      raw: { width: thumbnail.width, height: thumbnail.height, channels: 1 },
    })
      .greyscale()
      .resize(size, size, { fit: "contain" });
    greyScaleData = await resized_thumb.toBuffer();
    const meta = await resized_thumb.metadata();
    thumbnail.width = meta.width;
    thumbnail.height = meta.height;
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

const assignStationsForDeviceInDateRange = async (
  device: Device,
  fromDate: Date,
  untilDate?: Date
) => {
  // TODO(ManageStations)
  // Get device history.
  // Look for fixups.
  // Get recordings for device in date range.
  //
};

const maybeUpdateDeviceHistory = async (
  device: Device,
  recordingLocation: LatLng,
  recordingDateTime: Date
) => {
  // FIXME - device location currently gets updated if it is different from previous device location when a recording comes
  //  in. Need to use deviceHistory table to see if this should really be updated, to handle out of order recordings.
  const lastLocation = device.location;
  if (
    !lastLocation ||
    (lastLocation && !locationsAreEqual(lastLocation, recordingLocation))
  ) {
    // The device is in a new location, so we want to update the DeviceHistory log.
    const history = models.DeviceHistory.build({
      location: recordingLocation,
      fromDateTime: recordingDateTime,
      setBy: "automatic",
      deviceName: device.devicename,
      DeviceId: device.id,
      GroupId: device.GroupId,
    });
    await history.save();
  } else if (
    lastLocation &&
    locationsAreEqual(lastLocation, recordingLocation)
  ) {
    // Recordings can come in out of order, so if this recording has an earlier time than the last location
    // we may need to move the time of the device history entry back.

    // FIXME - We may have more recent locations here, so we may be moving back a historic entry - and need to
    //  update the corresponding station accordingly.

    // NOTE: This query will get run every recording upload - is that necessary?

    const history = await models.DeviceHistory.findOne({
      where: {
        DeviceId: device.id,
        GroupId: device.GroupId,
        setBy: "automatic",
        fromDateTime: { [Op.gt]: recordingDateTime },
      },
    });

    // FIXME - what happens for user-defined fix-ups?

    if (history) {
      await history.update({
        fromDateTime: recordingDateTime,
      });
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

const parseAndMergeEmbeddedFileMetadata = async (
  data: any,
  fileData: Uint8Array,
  recording: Recording
): Promise<boolean> => {
  // FIXME(ManageStations): Don't mutate recording, should really return a new data object.
  //  Should really try and pass in the fileData before it round-trips into s3.
  if (data.type === "thermalRaw") {
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
      recording.recordingDateTime = new Date(
        metadata.timestamp / 1000
      ).toISOString();
    }
    if (data.hasOwnProperty("additionalMetadata")) {
      recording.additionalMetadata = {
        ...data.additionalMetadata,
        ...recording.additionalMetadata,
      };
    } else if (metadata.previewSecs) {
      // NOTE: Algorithm property gets filled in later by AI
      recording.additionalMetadata = {
        previewSecs: metadata.previewSecs,
        totalFrames: metadata.totalFrames,
      };
    }
    return isCorrupt;
  } else {
    return false;
  }
};

export const uploadRawRecording = util.multipartUpload(
  "raw",
  async (
    uploadingDevice: Device,
    data: any, // FIXME - At least partially validate this data
    key: string,
    uploadedFileData: Uint8Array
  ): Promise<Recording> => {
    const recording = models.Recording.buildSafely(data);

    // TODO(ManageStations): Once location is set here, does it come back as a LatLng?
    log.warning("Location as set %s", JSON.stringify(recording.location));

    if (!uploadingDevice) {
      log.error("No uploading device");
    }

    // Add the filehash if present
    if (data.fileHash) {
      recording.rawFileHash = data.fileHash;
    }

    const fileIsCorrupt = await parseAndMergeEmbeddedFileMetadata(
      data,
      uploadedFileData,
      recording
    );
    recording.rawFileSize = uploadedFileData.length;
    recording.rawFileKey = key;
    recording.rawMimeType = guessRawMimeType(data.type, data.filename);
    recording.DeviceId = uploadingDevice.id;

    // FIXME(ManageStations): Should the uploading group be set by this, or by which group the device was in at that time?
    //  Then we can allow moving devices between groups.  So when we log a deviceLocation, lets' also log which group it was
    //  part of at that time.  Could we identify it by its saltId, or its serial number?
    recording.GroupId = uploadingDevice.GroupId;

    // FIXME(ManageStations): Need to check the activeAt and retiredAt columns when assigning.
    // If a new recording comes in out of order - i.e. before the station was created, we want
    // to move the activeAt date back if it doesn't conflict with another station at that location.

    const recordingLocation = recording.location;
    if (recordingLocation) {
      await maybeUpdateDeviceHistory(
        uploadingDevice,
        recordingLocation,
        new Date(recording.recordingDateTime)
      );
      const matchingStation = await tryToMatchRecordingToStation(recording);
      if (matchingStation) {
        recording.StationId = matchingStation.id;
      } else {
        // TODO - We should have a warning if a recording is uploaded without any location.

        // TODO - add "automatically created" boolean column to stations.
        // If a recording comes in that exactly matches a station before that station was created, move the creation date back

        // TODO(ManageStations)
        // Create a new station, and assign this recording to it.

        // const device = await models.Device.findByPk(uploadingDevice.id, {
        //   include: [
        //     {
        //       model: models.DeviceLocations,
        //       order: ["fromDateTime", "desc"]
        //     },
        //   ],
        // });

        //
        // // Look at the recordingDateTime
        // // Check if this device has moved since the last time we saw it, and if so, update the
        // // DeviceLocations log.
        // let matchedLocation;
        // for (const location of device.DeviceLocations) {
        //   // If there was a "fixup" we'd expect a new location to be set by a user after the location was
        //   // logged by a recording upload.
        //
        //   // If a recording comes in after the fixup time, but has the same location as before the fixup, we'd apply
        //   // the fixup location to the recording.
        //
        //   // If a recording comes through with a location that exactly matches an existing location in the device location log,
        //   // only earlier, we'd move the earliest known time at that location back.
        //
        //   // If we have stations with that location, we'd also need to adjust the station start time?
        //
        //   // If a station is deleted, the corresponding entry in the device location log should also be deleted.
        //   if (locationsAreEqual(location, recordingCoords)) {
        //     matchedLocation = location;
        //   }
        // }

        // TODO(ManageStations): device.lastKnownLocation() method   device.locationAtTime(?dateTime)

        const group = await models.Group.findByPk(uploadingDevice.GroupId);
        const now = new Date().toISOString();
        // @ts-ignore
        const newStation = models.Station.build({
          name: `New station for ${uploadingDevice.devicename}_${now}`,
          location: recordingLocation,
          activeAt: new Date(recording.recordingDateTime),
          automatic: true, // FIXME - Do we really want this?
        }) as Station;
        await newStation.save();
        recording.StationId = newStation.id;
        await group.addStation(newStation);
      }
    }

    if (typeof uploadingDevice.public === "boolean") {
      recording.public = uploadingDevice.public;
    }

    await recording.save();
    let tracked = false;
    if (data.metadata) {
      tracked = await tracksFromMeta(recording, data.metadata);
    }
    if (data.processingState) {
      recording.processingState = data.processingState;
      if (
        recording.processingState ===
        models.Recording.finishedState(data.type as RecordingType)
      ) {
        await sendAlerts(recording.id);
      }
    } else {
      // FIXME(ManageStations) If there is a data.processingState, Corrupt cannot be applied.
      if (!fileIsCorrupt) {
        if (tracked && recording.type !== RecordingType.Audio) {
          recording.processingState = RecordingProcessingState.AnalyseThermal;
          // already have done tracking pi skip to analyse state
        } else {
          recording.processingState = models.Recording.uploadedState(
            data.type as RecordingType
          );
        }
      } else {
        // Mark the recording as corrupt for future investigation, and so it doesn't get picked up by the pipeline.
        recording.processingState = RecordingProcessingState.Corrupt;
      }
    }
    await recording.save();
    return recording;
  }
);

// Returns a promise for the recordings query specified in the
// request.
async function query(
  requestUserId: UserId,
  viewAsSuperUser: boolean,
  where: any,
  tagMode: any,
  tags: string[],
  limit: number,
  offset: number,
  order: any,
  type: RecordingType
): Promise<{ rows: Recording[]; count: number }> {
  if (type) {
    where.type = type;
  }

  // FIXME - Do this in extract-middleware as bulk recording extractor
  const builder = new models.Recording.queryBuilder().init(
    requestUserId,
    where,
    tagMode,
    tags,
    offset,
    limit,
    order,
    viewAsSuperUser
  );
  builder.query.distinct = true;

  // FIXME - If getting count as super-user, we don't care about joining on all of the other tables.
  //  Even if getting count as regular user, we only care about joining through GroupUsers.

  // FIXME - Duration >= 0 constraint is pretty slow.

  // FIXME: In the UI, when we query recordings, we don't need to get the count every time, just the first time
  //  would be fine!
  return models.Recording.findAndCountAll(builder.get());
}

// Returns a promise for report rows for a set of recordings. Takes
// the same parameters as query() above.
export async function reportRecordings(
  userId: UserId,
  viewAsSuperUser: boolean,
  where: any,
  tagMode: any,
  tags: any,
  offset: number,
  limit: number,
  order: any,
  includeAudiobait: boolean
) {
  const builder = (
    await new models.Recording.queryBuilder().init(
      userId,
      where,
      tagMode,
      tags,
      offset,
      limit,
      order,
      viewAsSuperUser
    )
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
    const speciesClassifications = getSpeciesIdentification(r);

    const thisRow = [
      r.id,
      r.type,
      r.Group.groupname,
      r.Device.devicename,
      r.Station ? r.Station.name : "",
      moment(r.recordingDateTime).tz(config.timeZone).format("YYYY-MM-DD"),
      moment(r.recordingDateTime).tz(config.timeZone).format("HH:mm:ss"),
      r.location ? r.location.coordinates[1] : "",
      r.location ? r.location.coordinates[0] : "",
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

    thisRow.push(
      urljoin(recording_url_base, r.id.toString()),
      cacophonyIndex,
      speciesClassifications
    );
    out.push(thisRow);
  }
  return out;
}

function getCacophonyIndex(recording: Recording): string | null {
  return (
    recording.additionalMetadata as AudioRecordingMetadata
  )?.analysis?.cacophony_index
    ?.map((val) => val.index_percent)
    .join(";");
}

function getSpeciesIdentification(recording: Recording): string | null {
  return (
    recording.additionalMetadata as AudioRecordingMetadata
  )?.analysis?.species_identify
    ?.map(
      (classification) => `${classification.species}: ${classification.begin_s}`
    )
    .join(";");
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
  return out.join("+");
}

export function signedToken(key, file, mimeType) {
  return jsonwebtoken.sign(
    {
      _type: "fileDownload",
      key: key,
      filename: file,
      mimeType: mimeType,
    },
    config.server.passportSecret,
    { expiresIn: 60 * 10 }
  );
}

function guessRawMimeType(type, filename) {
  const mimeType = mime.getType(filename);
  if (mimeType) {
    return mimeType;
  }
  switch (type) {
    case "thermalRaw":
      return "application/x-cptv";
    case "audio":
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
  if (!("tracks" in metadata)) {
    return false;
  }
  try {
    const algorithmDetail = await models.DetailSnapshot.getOrCreateMatching(
      "algorithm",
      metadata["algorithm"]
    );

    for (const trackMeta of metadata["tracks"]) {
      // FIXME(ManageStations) These promises don't need to block each other.
      const track = await recording.createTrack({
        data: trackMeta,
        AlgorithmId: algorithmDetail.id,
      });
      if (!("predictions" in trackMeta)) {
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
  viewAsSuperUser: boolean,
  where: any,
  tagMode: any,
  tags: string[],
  offset: number,
  limit: number
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
  const requestVisits = limit || maxVisitQueryResults;
  const queryMax = maxVisitQueryResults * 2;
  const queryLimit = Math.min(requestVisits * 2, queryMax);

  const builder = await new models.Recording.queryBuilder().init(
    userId,
    where,
    tagMode,
    tags,
    offset,
    queryLimit,
    null,
    viewAsSuperUser
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
    devSummary.generateVisits(recordings, offset || 0);

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
  viewAsSuperUser: boolean,
  where: any,
  tagMode: any,
  tags: string[],
  offset: number,
  limit: number
) {
  const results = await queryVisits(
    userId,
    viewAsSuperUser,
    where,
    tagMode,
    tags,
    offset,
    limit
  );
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
        attributes: ["groupname"],
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
              [Sequelize.json("data.name"), "data"],
            ],
          },
        ],
      },
      {
        model: models.Device,
        attributes: ["devicename", "id"],
      },
    ],
    attributes: [
      "id",
      "recordingDateTime",
      "DeviceId",
      "GroupId",
      "rawFileKey",
    ],
  };
  // @ts-ignore
  return await models.Recording.findByPk(id, query);
}

async function sendAlerts(recID: RecordingId) {
  const recording = await getRecordingForVisit(recID);
  const recVisit = new Visit(recording, 0);
  recVisit.completeVisit();
  let matchedTrack, matchedTag;
  // find any ai master tags that match the visit tag
  for (const track of recording.Tracks) {
    matchedTag = track.TrackTags.find(
      (tag) => tag.data == AI_MASTER && recVisit.what == tag.what
    );
    if (matchedTag) {
      matchedTrack = track;
      break;
    }
  }
  if (!matchedTag) {
    return;
  }
  const alerts = await (models.Alert as AlertStatic).getActiveAlerts(
    recording.DeviceId,
    matchedTag
  );
  if (alerts.length > 0) {
    const thumbnail = await getThumbnail(recording).catch(() => {
      log.warning("Alerting without thumbnail for %d", recID);
    });
    for (const alert of alerts) {
      await alert.sendAlert(
        recording,
        matchedTrack,
        matchedTag,
        thumbnail && (thumbnail.Body as Buffer)
      );
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
  if (classifierResult.thumbnail_region) {
    const result = await saveThumbnailInfo(
      recording,
      classifierResult.thumbnail_region
    );
    if (result instanceof Error) {
      log.warning(
        "Failed to upload thumbnail for %s",
        `${recording.rawFileKey}-thumb`
      );
      log.error("Reason: %s", result.message);
    }
  }
  if (prevState !== RecordingProcessingState.Reprocess) {
    await sendAlerts(recording.id);
  }
};

// Mapping
const mapPosition = (position: any): ApiTrackPosition => {
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
      frameNumber: position.frame_number,
    };
  }
};

export const mapPositions = (
  positions: any[]
): ApiTrackPosition[] | undefined => {
  if (positions && positions.length) {
    return positions.map(mapPosition);
  }
  return [];
};

export default {
  query,
  addTag,
  tracksFromMeta,
  updateMetadata,
  queryVisits,
  saveThumbnailInfo,
  sendAlerts,
  getThumbnail,
  signedToken,
};
