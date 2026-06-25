import { Device } from "@models/Device.js";
import type { LatLng } from "@typedefs/api/common.js";
import { DeviceHistory } from "@models/DeviceHistory.js";
import Sequelize, { Attributes, Op } from "sequelize";
import { Station } from "@models/Station.js";
import { initSequelize } from "@models/index.js";

import { DeviceHistorySetBy } from "@typedefs/api/device.js";
import {
  locationsAreExactlyEqual,
  removeLocationSpecificSettings,
  tryToMatchLocationToStationInGroup,
} from "@models/util/locationUtils.js";
import logging from "@log";

const locationIsZero = (location: LatLng): boolean => {
  return location.lat === 0 && location.lng === 0;
};

const handleZeroZeroLocationForDeviceAtTime = async (
  device: Device,
  fromDateTime: Date,
) => {
  // If supplied with a zero lat/lng, try to use an earlier good location.
  //  This may be wrong, but at least a recording will be assigned to a valid location.
  const existingHistory = await DeviceHistory.latestWithAnyLocationAtTime(
    device.id,
    device.GroupId,
    fromDateTime,
  );
  if (existingHistory) {
    return existingHistory;
  }
  throw new Error(
    "Invalid location provided (lat or lng is 0) and no device history exists.",
  );
};

const maybeUpdateDeviceLocationAtTime = async (
  device: Device,
  fromDateTime: Date,
  newLocation: LatLng,
): Promise<boolean> => {
  const latestDeviceLocation = device.location;
  if (
    !latestDeviceLocation ||
    (latestDeviceLocation &&
      !locationsAreExactlyEqual(latestDeviceLocation, newLocation))
  ) {
    return (
      (
        await Device.update(
          {
            location: newLocation,
          },
          {
            where: {
              id: device.id,
              // Make sure to *not* update the device location if a recording exists that came in later than this
              // config events' location, so we don't inadvertently set the location back to an earlier location.
              [Op.or]: [
                {
                  lastThermalRecordingTime: {
                    [Op.or]: [{ [Op.lt]: fromDateTime }, { [Op.eq]: null }],
                  },
                },
                {
                  lastAudioRecordingTime: {
                    [Op.or]: [{ [Op.lt]: fromDateTime }, { [Op.eq]: null }],
                  },
                },
              ],
            },
          },
        )
      )[0] !== 0
    );
  }
  return false;
};

export const postgresLocationExactlyMatches = (
  locationToCompare: LatLng,
  locationColumn = "location",
  precision: "1km" | "100m" | "10m" | "1m" | "10cm" = "1m",
) => {
  // NOTE: Using ST_SnapToGrid to basically truncate extra floating point precision we don't want to compare.
  // We still want to make sure the locations are essentially the same point in space, just processed differently.
  let tolerance;
  switch (precision) {
    case "1km":
      tolerance = 0.01;
      break;
    case "100m":
      tolerance = 0.001;
      break;
    case "10m":
      tolerance = 0.0001;
      break;
    case "1m":
      tolerance = 0.00001;
      break;
    case "10cm":
    default:
      tolerance = 0.000001;
      break;
  }
  return Sequelize.fn(
    "ST_Equals",
    Sequelize.literal(`ST_SnapToGrid("${locationColumn}", ${tolerance})`),
    Sequelize.fn(
      "ST_SnapToGrid",
      Sequelize.literal(
        `ST_SetSRID(ST_MakePoint(${locationToCompare.lng}, ${locationToCompare.lat}), 4326)::geometry`,
      ),
      tolerance,
    ),
  );
};

export const postgresLocationFuzzilyMatches = (
  locationToCompare: LatLng,
  locationColumn = "location",
  precision: "1km" | "100m" | "10m" | "1m" | "10cm" = "10cm",
) => {
  // NOTE: Using ST_SnapToGrid to basically truncate extra floating point precision we don't want to compare.
  // We still want to make sure the locations are essentially the same point in space, just processed differently.
  let toleranceMeters;
  switch (precision) {
    case "1km":
      toleranceMeters = 1000;
      break;
    case "100m":
      toleranceMeters = 100;
      break;
    case "10m":
      toleranceMeters = 10;
      break;
    case "1m":
      toleranceMeters = 1;
      break;
    case "10cm":
    default:
      toleranceMeters = 0.1;
      break;
  }
  return Sequelize.where(
    Sequelize.fn(
      "ST_DWithin",
      Sequelize.cast(Sequelize.col(locationColumn), "geography"),
      Sequelize.literal(
        `ST_SetSRID(ST_MakePoint(${locationToCompare.lng}, ${locationToCompare.lat}), 4326)::geometry`,
      ),
      toleranceMeters,
    ),
    true,
  );
};

export const maybeUpdateDeviceHistoryLocation = async (
  device: Device,
  location: LatLng,
  fromDateTime: Date,
  setBy: DeviceHistorySetBy = "automatic", // If this update is due to a recording upload, it's "automatic"
): Promise<DeviceHistory> => {
  // FIXME: A station can get deleted when there are no more recordings for it (they've all been deleted).
  //  Should that station actually be "retired" and be "unretired" when more recordings come for that location?

  // A recording is being uploaded by a device, or on behalf of a device.
  // The recording can have been sitting on the device for a while - potentially prior to a device
  // getting re-registered into a different project.  We need to make sure the recording is correctly
  // attributed to the correct project.

  // Maybe first things, we just try and see what device.id this device was assigned to at the recording time?
  // There should always be *something*, either register or re-register.
  // Of course, outside of testing, we should get the correct deviceID from the actual recording metadata,
  // so maybe this is in fact redundant?  A given device id always corresponds to the same group id,
  // since when we move devices between groups we always make a new id, don't we?

  // Once we know which device we're assigning to, we want to answer the question: Is this a *new location* for this
  // device?  If it is, we want to add a new DeviceHistory entry and Station for this device/project.

  // On the other hand, if it's an existing location for this device, we want to know if the recordingDateTime
  // of this recording comes *before* the fromDateTime of the existing history entry at this location.
  // If it does, we either want to move the previous location/history entry backwards to match the recordingDateTime,
  // or we want to insert an additional history entry at that recordingDateTime.  Moving an existing entry backwards
  // in time could be incorrect if the entry has a reference image, since the orientation of the camera may not
  // match the image for this earlier recording we're uploading.

  // I don't *think* that a recording can come in before a device registration for that recording, can it?
  // What about the case where we are moving a device that didn't have any recordings at the time of moving it?
  // That could fail here, right?

  const deviceAtSuppliedTime = await DeviceHistory.getDeviceFromUuidAtTime(
    device.uuid,
    fromDateTime,
  );
  let actualDevice = device;
  if (
    deviceAtSuppliedTime &&
    deviceAtSuppliedTime.DeviceId !== actualDevice.id
  ) {
    actualDevice = await Device.findByPk(deviceAtSuppliedTime.DeviceId);
  }
  if (locationIsZero(location)) {
    return await handleZeroZeroLocationForDeviceAtTime(
      actualDevice,
      fromDateTime,
    );
  }
  let deviceHistoryEntry: DeviceHistory;
  const priorHistoryEntry = await DeviceHistory.latestWithExactLocationAtTime(
    actualDevice.id,
    actualDevice.GroupId,
    location,
    fromDateTime,
  );
  if (priorHistoryEntry) {
    if (!priorHistoryEntry.stationId) {
      logging.warning("Need to assign station");
      // TODO: We need to assign a station to this entry.
    }
    // If there's a prior history entry with the exact same location for this device,
    // we probably don't need to do anything.
    deviceHistoryEntry = priorHistoryEntry;
  }
  if (!deviceHistoryEntry) {
    // We really want to work out if we need to adjust existing entries, or insert a new one.
    // Update the device location on config change. (It gets updated elsewhere if a newer recording comes in)

    const _didUpdateDeviceLocation = await maybeUpdateDeviceLocationAtTime(
      actualDevice,
      fromDateTime,
      location,
    );
    // Find the first later history entry where there is a location, and the entry is for any time after this fromDateTime,
    // Since we didn't find a prior entry with this location.
    const laterHistoryEntry = await DeviceHistory.findOne({
      where: {
        DeviceId: actualDevice.id,
        GroupId: actualDevice.GroupId,
        stationId: { [Op.ne]: null },
        fromDateTime: { [Op.gt]: fromDateTime },
        [Op.and]: postgresLocationExactlyMatches(location),
      },
      order: [
        ["fromDateTime", "ASC"],
        ["id", "ASC"],
      ], // Get the earliest one that's later than `fromDateTime`
    });
    if (laterHistoryEntry) {
      // Back-date the later history entry to this fromDateTime
      deviceHistoryEntry = await laterHistoryEntry.update(
        {
          setBy,
          fromDateTime,
        },
        { returning: true },
      );
    }
  }
  if (deviceHistoryEntry) {
    let stationToAssign;
    if (!deviceHistoryEntry.stationId) {
      stationToAssign = await tryToMatchLocationToStationInGroup(
        location,
        actualDevice.GroupId,
        fromDateTime,
      );
      if (stationToAssign && stationToAssign.activeAt > fromDateTime) {
        // We matched a future station in this location, so it's likely this is an older recording coming in out
        // of order.  We want to back-date the existing station to this time.
        await Station.update(
          {
            activeAt: fromDateTime,
          },
          {
            where: {
              id: stationToAssign.id,
              activeAt: {
                [Op.gt]: fromDateTime,
              },
            },
          },
        );
      }
      if (!stationToAssign) {
        // Create a new automatic station.  With concurrent recording uploads from the same device/location,
        // we're in danger of creating duplicate stations, so we take a lock on the group/lat/lng to
        // prevent duplicate inserts.
        const sequelize = await initSequelize();
        await sequelize.transaction(async (transaction) => {
          // lock on a derived key from group + location to prevent duplicate inserts
          await sequelize.query(
            `SELECT pg_advisory_xact_lock(hashtext(:key))`,
            {
              transaction,
              replacements: {
                key: `${actualDevice.GroupId}:${location.lat.toFixed(6)},${location.lng.toFixed(6)}`,
              },
            },
          );
          [stationToAssign] = await Station.findOrCreate({
            where: {
              GroupId: actualDevice.GroupId,
              retiredAt: { [Op.eq]: null },
              [Op.and]: postgresLocationExactlyMatches(location),
            },
            defaults: {
              name: `New location for ${
                actualDevice.deviceName
              }_${fromDateTime.toISOString()}`,
              location,
              activeAt: fromDateTime,
              automatic: true,
              needsRename: true,
              retiredAt: null,
              GroupId: actualDevice.GroupId,
            },
            transaction,
          });
          if (stationToAssign.activeAt > fromDateTime) {
            // Backdate the station active time to this recording time.
            await stationToAssign.update(
              { activeAt: fromDateTime },
              { transaction },
            );
          }
        });
      }

      deviceHistoryEntry.stationId = stationToAssign.id;
      await deviceHistoryEntry.save();
    } else {
      // Make sure the station activeAt time is back-dated to the fromDateTime of the existing history entry.
      stationToAssign = await Station.findByPk(deviceHistoryEntry.stationId);
    }
    if (deviceHistoryEntry.fromDateTime < stationToAssign.activeAt) {
      // Now, if the device history table has updated, that can mean that the activeAt date of an automatically
      // created station may need to move back too.
      // There shouldn't be recordings that need their station id updated in this instance.
      const prevActiveAt = new Date(stationToAssign.activeAt);
      const didUpdateStation =
        (
          await Station.update(
            {
              activeAt: deviceHistoryEntry.fromDateTime,
            },
            {
              where: {
                id: stationToAssign.id,
                activeAt: {
                  [Op.gt]: deviceHistoryEntry.fromDateTime,
                },
              },
            },
          )
        )[0] !== 0;
      if (didUpdateStation) {
        logging.info(
          `Backdated existing station activeAt time to ${deviceHistoryEntry.fromDateTime} from ${prevActiveAt}`,
        );
      }
    }
    return deviceHistoryEntry;
  } else {
    // We'll want to insert an entry with this location and fromDateTime and create a station if it's missing.
    // If we are going to insert a location, then we need to match to existing stations
    // or create a new station that is active from this point in time.

    // This is a new location.  Get the previous device history entry at *any* location for this device,
    // to carry over some settings from it.
    const priorHistoryEntry =
      await DeviceHistory.latestWithOrWithoutLocationAtTime(
        actualDevice.id,
        actualDevice.GroupId,
        fromDateTime,
      );
    const newDeviceHistoryEntry: Partial<Attributes<DeviceHistory>> = {
      location,
      setBy,
      fromDateTime,
      deviceName: actualDevice.deviceName,
      DeviceId: actualDevice.id,
      GroupId: actualDevice.GroupId,
      saltId: actualDevice.saltId,
      uuid: actualDevice.uuid,
      settings: removeLocationSpecificSettings(priorHistoryEntry?.settings),
    };
    let stationToAssign = await tryToMatchLocationToStationInGroup(
      location,
      actualDevice.GroupId,
      fromDateTime,
    );
    if (stationToAssign && stationToAssign.activeAt > fromDateTime) {
      // We matched a future station in this location, so it's likely this is an older recording coming in out
      // of order.  We want to back-date the existing station to this time.
      await Station.update(
        {
          activeAt: fromDateTime,
        },
        {
          where: {
            id: stationToAssign.id,
            activeAt: {
              [Op.gt]: fromDateTime,
            },
          },
        },
      );
    }
    if (!stationToAssign) {
      // Create a new automatic station.  With concurrent recording uploads from the same device/location,
      // we're in danger of creating duplicate stations, so we take a lock on the group/lat/lng to
      // prevent duplicate inserts.
      const sequelize = await initSequelize();
      await sequelize.transaction(async (transaction) => {
        // lock on a derived key from group + location to prevent duplicate inserts
        await sequelize.query(`SELECT pg_advisory_xact_lock(hashtext(:key))`, {
          transaction,
          replacements: {
            key: `${actualDevice.GroupId}:${location.lat.toFixed(6)},${location.lng.toFixed(6)}`,
          },
        });
        [stationToAssign] = await Station.findOrCreate({
          where: {
            GroupId: actualDevice.GroupId,
            retiredAt: { [Op.eq]: null },
            [Op.and]: postgresLocationExactlyMatches(location),
          },
          defaults: {
            name: `New location for ${
              actualDevice.deviceName
            }_${fromDateTime.toISOString()}`,
            location,
            activeAt: fromDateTime,
            automatic: true,
            needsRename: true,
            retiredAt: null,
            GroupId: actualDevice.GroupId,
          },
          transaction,
        });
        if (stationToAssign.activeAt > fromDateTime) {
          // Backdate the station active time to this recording time.
          await stationToAssign.update(
            { activeAt: fromDateTime },
            { transaction },
          );
        }
      });
    }

    newDeviceHistoryEntry.stationId = stationToAssign.id;
    // Insert this location.
    return await Station.sequelize.transaction(async (transaction) => {
      // lock on a derived key from group + deviceId + saltId + uuid + location to prevent duplicate inserts
      const sequelize = await initSequelize();
      await sequelize.query(`SELECT pg_advisory_xact_lock(hashtext(:key))`, {
        transaction,
        replacements: {
          key: `${actualDevice.GroupId}:${actualDevice.id}:${actualDevice.saltId}:${actualDevice.uuid}:${location.lat.toFixed(6)},${location.lng.toFixed(6)}`,
        },
      });
      const [newDeviceHistory] = await DeviceHistory.findOrCreate({
        where: {
          GroupId: actualDevice.GroupId,
          DeviceId: actualDevice.id,
          saltId: actualDevice.saltId,
          uuid: actualDevice.uuid,
          [Op.and]: postgresLocationExactlyMatches(location),
        },
        defaults: newDeviceHistoryEntry,
        transaction,
      });
      if (!newDeviceHistory.stationId) {
        await newDeviceHistory.update({ stationId: stationToAssign.id });
      }
      return newDeviceHistory;
    });
  }
};
