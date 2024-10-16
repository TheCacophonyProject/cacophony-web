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

import bcrypt from "bcrypt";
import { format } from "util";
import type { FindOptions } from "sequelize";
import Sequelize from "sequelize";
import type {
  ModelCommon,
  ModelsDictionary,
  ModelStaticCommon,
} from "./index.js";
import type { User } from "./User.js";
import type { Group } from "./Group.js";
import type { Event } from "./Event.js";
import logger from "../logging.js";
import { DeviceType } from "@typedefs/api/consts.js";
import type {
  DeviceId,
  GroupId,
  LatLng,
  ScheduleId,
  UserId,
} from "@typedefs/api/common.js";
import type { Station } from "@models/Station.js";
import { tryToMatchLocationToStationInGroup } from "@models/util/locationUtils.js";
import { locationField } from "@models/util/util.js";
import { ClientError } from "@api/customErrors.js";

const Op = Sequelize.Op;

export interface Device extends Sequelize.Model, ModelCommon<Device> {
  id: DeviceId;
  addUser: (userId: UserId, options: any) => any;
  deviceName: string;
  groupName: string;
  saltId: number;
  uuid: number;
  active: boolean;
  public: boolean;
  lastConnectionTime: Date | null;
  lastRecordingTime: Date | null;
  password?: string;
  location?: LatLng;
  heartbeat: Date | null;
  nextHeartbeat: Date | null;
  comparePassword: (password: string) => Promise<boolean>;
  reRegister: (
    models: ModelsDictionary,
    deviceName: string,
    group: Group,
    newPassword: string,
    reassign?: boolean
  ) => Promise<Device | false>;
  Group: Group;
  GroupId: number;
  ScheduleId: ScheduleId;
  kind: DeviceType;
  getEvents: (options: FindOptions) => Promise<Event[]>;
  getGroup: () => Promise<Group>;
  updateHeartbeat: (
    models: ModelsDictionary,
    nextHeartbeat: Date
  ) => Promise<boolean>;
}

export interface DeviceStatic extends ModelStaticCommon<Device> {
  freeDeviceName: (name: string, id: GroupId) => Promise<boolean>;
  getFromId: (id: DeviceId) => Promise<Device>;
  findDevice: (
    deviceID?: DeviceId,
    deviceName?: string,
    groupName?: string,
    password?: string
  ) => Promise<Device>;
  wherePasswordMatches: (
    devices: Device[],
    password: string
  ) => Promise<Device>;
  getFromNameAndPassword: (name: string, password: string) => Promise<Device>;
  allWithName: (name: string) => Promise<Device[]>;
  getFromNameAndGroup: (name: string, groupName: string) => Promise<Device>;
  getCacophonyIndex: (
    authUser: User,
    deviceId: Device,
    from: Date,
    windowSize: number
  ) => Promise<number>;
  getCacophonyIndexBulk: (
    authUser: User,
    deviceId: Device,
    from: Date,
    steps: number,
    interval: String
  ) => Promise<{ deviceId: DeviceId; from: string; cacophonyIndex: number }[]>;
  getCacophonyIndexHistogram: (
    authUser: User,
    deviceId: DeviceId,
    from: Date,
    windowSize: number
  ) => Promise<{ hour: number; index: number }[]>;
  getSpeciesCount: (
    authUser: User,
    deviceId: DeviceId,
    from: Date,
    windowSize: number,
    recordingType: string
  ) => Promise<{ what: string; count: number }[]>;
  getSpeciesCountBulk: (
    authUser: User,
    deviceId: DeviceId,
    from: Date,
    steps: number,
    interval: String,
    recordingType: string
  ) => Promise<
    { deviceId: DeviceId; from: string; what: string; count: number }[]
  >;
  getDaysActive: (
    authUser: any,
    deviceId: any,
    from: any,
    windowSizeInHours: any
  ) => Promise<number>;
  stoppedDevices: () => Promise<Device[]>;
}

export default function (
  sequelize: Sequelize.Sequelize,
  DataTypes
): DeviceStatic {
  const name = "Device";

  const attributes = {
    deviceName: {
      type: DataTypes.STRING,
      unique: true,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    location: locationField(),
    lastConnectionTime: {
      type: DataTypes.DATE,
    },
    lastRecordingTime: {
      type: DataTypes.DATE,
    },
    public: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    saltId: {
      type: DataTypes.INTEGER,
    },
    uuid: {
      type: DataTypes.INTEGER,
    },
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false,
    },
    kind: {
      type: DataTypes.ENUM,
      values: Object.values(DeviceType),
      defaultValue: DeviceType.Unknown,
    },
    heartbeat: {
      type: DataTypes.DATE,
    },
    nextHeartbeat: {
      type: DataTypes.DATE,
    },
  };

  const options = {
    hooks: {
      beforeCreate: beforeModify,
      beforeUpdate: beforeModify,
      beforeUpsert: beforeModify,
    },
  };

  const Device = sequelize.define(
    name,
    attributes,
    options
  ) as unknown as DeviceStatic;

  //---------------
  // CLASS METHODS
  //---------------
  const models = sequelize.models;

  Device.addAssociations = function (models) {
    models.Device.hasMany(models.Recording);
    models.Device.hasMany(models.Event);
    models.Device.belongsTo(models.Group);
    models.Device.belongsTo(models.Schedule);
    models.Device.hasMany(models.Alert);
    models.Device.hasMany(models.DeviceHistory);
  };

  Device.freeDeviceName = async function (deviceName, groupId) {
    const device = await this.findOne({
      where: { deviceName, GroupId: groupId },
    });
    return device === null;
  };

  Device.getFromId = async function (id) {
    return this.findByPk(id);
  };

  Device.findDevice = async function (
    deviceID,
    deviceName,
    groupName,
    password
  ) {
    // attempts to find a unique device by groupName, then deviceId (deviceName if int),
    // then deviceName, finally password
    let model = null;
    if (deviceID && deviceID > 0) {
      model = this.findByPk(deviceID);
    } else if (groupName) {
      model = await this.getFromNameAndGroup(deviceName, groupName);
    } else {
      const models = await this.allWithName(deviceName);
      //check for deviceName being id
      deviceID = parseExactInt(deviceName);
      if (deviceID) {
        model = this.findByPk(deviceID);
      }

      //check for distinct name
      if (model == null) {
        if (models.length == 1) {
          model = models[0];
        }
      }

      //check for device match from password
      if (model == null && password) {
        model = await this.wherePasswordMatches(models, password);
      }
    }
    return model;
  };

  Device.wherePasswordMatches = async function (devices, password) {
    // checks if there is a unique deviceName and password match, else returns null
    const validDevices = [];
    let passwordMatch = false;
    for (let i = 0; i < devices.length; i++) {
      passwordMatch = await devices[i].comparePassword(password);
      if (passwordMatch) {
        validDevices.push(devices[i]);
      }
    }
    if (validDevices.length == 1) {
      return validDevices[0];
    } else {
      if (validDevices.length > 1) {
        throw new Error(
          format("Multiple devices match %s and supplied password", name)
        );
      }
      return null;
    }
  };

  Device.getFromNameAndPassword = async function (name, password) {
    const devices = await this.allWithName(name);
    return this.wherePasswordMatches(devices, password);
  };

  Device.allWithName = async function (name) {
    return this.findAll({ where: { deviceName: name } });
  };

  Device.stoppedDevices = async function () {
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 25);
    return this.findAll({
      where: {
        lastConnectionTime: {
          [Op.and]: [{ [Op.lt]: oneDayAgo }, { [Op.ne]: null }],
        },
      },
      include: [
        {
          model: models.Group,
        },
      ],
    });
  };

  Device.getFromNameAndGroup = async function (deviceName, groupName) {
    return this.findOne({
      where: { deviceName },
      include: [
        {
          model: models.Group,
          where: { groupName },
        },
      ],
    });
  };

  Device.getCacophonyIndex = async function (
    authUser,
    device,
    from,
    windowSizeInHours
  ) {
    windowSizeInHours = Math.abs(windowSizeInHours);
    const windowEndTimestampUtc = Math.ceil(from.getTime() / 1000);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [result, _] = (await sequelize.query(
      `select round((avg(scores))::numeric, 2) as index from
    (select
      (jsonb_array_elements("cacophonyIndex")->>'index_percent')::float as scores
  from
	"Recordings"
where
	"DeviceId" = ${device.id}
	and "type" = 'audio'
	and "recordingDateTime" at time zone 'UTC' between (to_timestamp(${windowEndTimestampUtc}) at time zone 'UTC' - interval '${windowSizeInHours} hours') and to_timestamp(${windowEndTimestampUtc}) at time zone 'UTC') as cacophonyIndex`
    )) as [{ index: number }[], unknown];
    const index = result[0].index;
    if (index !== null) {
      return Number(index);
    }
    return index;
  };

  Device.getCacophonyIndexBulk = async function (
    authUser,
    device,
    from,
    steps,
    interval
  ): Promise<{ deviceId: DeviceId; from: string; cacophonyIndex: number }[]> {
    const counts = [];
    let stepSizeInMs;
    switch (interval) {
      case "hours":
        stepSizeInMs = 60 * 60 * 1000;
        break;
      case "days":
        stepSizeInMs = 24 * 60 * 60 * 1000;
        break;
      case "weeks":
        stepSizeInMs = 7 * 24 * 60 * 60 * 1000;
        break;
      case "months": {
        const currMonthDays = new Date(
          from.getFullYear(),
          from.getMonth() + 1,
          0
        ).getDate();
        stepSizeInMs = currMonthDays * 24 * 60 * 60 * 1000;
        break;
      }
      case "years": {
        const currYearDays = new Date(from.getFullYear(), 11, 31).getDate();
        stepSizeInMs = currYearDays * 24 * 60 * 60 * 1000;
        break;
      }
      default:
        throw new Error(`Invalid interval: ${interval}`);
    }
    const stepSizeInHours = stepSizeInMs / (60 * 60 * 1000);

    for (let i = 0; i < steps; i++) {
      const windowEnd = new Date(from.getTime() - i * stepSizeInMs);
      const result = await Device.getCacophonyIndex(
        authUser,
        device,
        windowEnd,
        stepSizeInHours
      );
      counts.push({
        deviceId: device.id,
        from: windowEnd.toISOString(),
        cacophonyIndex: result,
      });
    }
    return counts;
  };

  Device.getCacophonyIndexHistogram = async function (
    authUser,
    deviceId,
    from,
    windowSizeInHours
  ): Promise<{ hour: number; index: number }[]> {
    windowSizeInHours = Math.abs(windowSizeInHours);
    // We need to take the time down to the previous hour, so remove 1 second
    const windowEndTimestampUtc = Math.ceil(from.getTime() / 1000);
    // Get a spread of 24 results with each result falling into an hour bucket.

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [results, _] = (await sequelize.query(`select
	hour,
	round((avg(scores))::numeric, 2) as index
from
(select
	date_part('hour', "recordingDateTime") as hour,
	(jsonb_array_elements("cacophonyIndex")->>'index_percent')::float as scores
from
	"Recordings"
where
	"DeviceId" = ${deviceId}
	and "type" = 'audio'
	and "recordingDateTime" at time zone 'UTC' between (to_timestamp(${windowEndTimestampUtc}) at time zone 'UTC' - interval '${windowSizeInHours} hours') and to_timestamp(${windowEndTimestampUtc}) at time zone 'UTC'
) as cacophonyIndex
group by hour
order by hour;
`)) as [{ hour: number; index: number }[], unknown];
    // TODO(jon): Do we want to validate that there is enough data in a given hour
    //  to get a reasonable index histogram?
    return results.map((item) => ({
      hour: Number(item.hour),
      index: Number(item.index),
    }));
  };

  Device.getSpeciesCount = async function (
    authUser,
    deviceId,
    from,
    windowSizeInHours,
    recordingType
  ): Promise<{ what: string; count: number }[]> {
    windowSizeInHours = Math.abs(windowSizeInHours);
    // We need to take the time down to the previous hour, so remove 1 second
    const windowEndTimestampUtc = Math.ceil(from.getTime() / 1000);
    // Get a spread of 24 results with each result falling into an hour bucket.

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [results, _] =
      (await sequelize.query(`SELECT tt.what, count(*) as count 
      FROM "Recordings" r 
      JOIN "Tracks" t ON r.id = t."RecordingId" 
      JOIN "TrackTags" tt ON t.id = tt."TrackId" 
      WHERE r."DeviceId" = ${deviceId} 
      AND r."type" = '${recordingType}'
      AND r."recordingDateTime" at time zone 'UTC' between (to_timestamp(${windowEndTimestampUtc}) at time zone 'UTC' - interval '${windowSizeInHours} hours') and to_timestamp(${windowEndTimestampUtc}) at time zone 'UTC'
      GROUP BY tt.what;
    `)) as [{ what: string; count: number }[], unknown];

    return results.map((item) => ({
      what: String(item.what),
      count: Number(item.count),
    }));
  };

  Device.getSpeciesCountBulk = async function (
    authUser,
    deviceId,
    from,
    steps,
    interval,
    recordingType
  ): Promise<
    { deviceId: DeviceId; from: string; what: string; count: number }[]
  > {
    const counts = [];
    let stepSizeInMs;
    switch (interval) {
      case "hours":
        stepSizeInMs = 60 * 60 * 1000;
        break;
      case "days":
        stepSizeInMs = 24 * 60 * 60 * 1000;
        break;
      case "weeks":
        stepSizeInMs = 7 * 24 * 60 * 60 * 1000;
        break;
      case "months": {
        const currMonthDays = new Date(
          from.getFullYear(),
          from.getMonth() + 1,
          0
        ).getDate();
        stepSizeInMs = currMonthDays * 24 * 60 * 60 * 1000;
        break;
      }
      case "years": {
        const currYearDays = new Date(from.getFullYear(), 11, 31).getDate();
        stepSizeInMs = currYearDays * 24 * 60 * 60 * 1000;
        break;
      }
      default:
        throw new Error(`Invalid interval: ${interval}`);
    }
    const stepSizeInHours = stepSizeInMs / (60 * 60 * 1000);
    for (let i = 0; i < steps; i++) {
      const windowEnd = new Date(from.getTime() - i * stepSizeInMs);
      const result = await Device.getSpeciesCount(
        authUser,
        deviceId,
        windowEnd,
        stepSizeInHours,
        recordingType
      );
      counts.push(
        ...result.map((item) => ({
          deviceId: deviceId,
          from: windowEnd.toISOString(),
          what: item.what,
          count: item.count,
        }))
      );
    }
    return counts;
  };

  Device.getDaysActive = async function (
    authUser,
    deviceId,
    from,
    windowSizeInHours
  ): Promise<number> {
    windowSizeInHours = Math.abs(windowSizeInHours);
    const windowEndTimestampUtc = Math.ceil(from.getTime() / 1000);
    const timezoneOffset = from.getTimezoneOffset() * 60;
    const query = `
      SELECT DISTINCT DATE("recordingDateTime" AT TIME ZONE 'UTC' AT TIME ZONE INTERVAL '${timezoneOffset} seconds') as DATE
      FROM "Recordings"
      WHERE "recordingDateTime" at time zone 'UTC' between (to_timestamp(${windowEndTimestampUtc}) at time zone 'UTC' - interval '${windowSizeInHours} hours') and to_timestamp(${windowEndTimestampUtc}) at time zone 'UTC'
      AND "DeviceId" = ${deviceId}
      ORDER BY DATE DESC
    `;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [results, _] = (await sequelize.query(query)) as [
      { date: string; has_recordings: boolean }[],
      unknown
    ];

    const eventQuery = `
      SELECT DISTINCT DATE("dateTime" AT TIME ZONE 'UTC' AT TIME ZONE INTERVAL '${timezoneOffset} seconds') as DATE
      FROM "Events"
      WHERE "dateTime" at time zone 'UTC' between (to_timestamp(${windowEndTimestampUtc}) at time zone 'UTC' - interval '${windowSizeInHours} hours') and to_timestamp(${windowEndTimestampUtc}) at time zone 'UTC'
      AND "DeviceId" = ${deviceId}
      ORDER BY DATE DESC
    `;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [eventResults, __] = (await sequelize.query(eventQuery)) as [
      { date: string; has_recordings: boolean }[],
      unknown
    ];
    const activeDates = new Set();
    results.forEach((item) => activeDates.add(item.date));
    eventResults.forEach((item) => activeDates.add(item.date));
    return activeDates.size;
  };

  // Fields that are directly settable by the API.
  Device.apiSettableFields = ["location", "newConfig"];

  //------------------
  // INSTANCE METHODS
  //------------------

  Device.prototype.getJwtDataValues = function () {
    return {
      id: this.getDataValue("id"),
      _type: "device",
    };
  };

  Device.prototype.comparePassword = function (password) {
    const device = this;
    return new Promise(function (resolve, reject) {
      bcrypt.compare(password, device.password, function (err, isMatch) {
        if (err) {
          reject(err);
        } else {
          resolve(isMatch);
        }
      });
    });
  };

  // Will register as a new device
  Device.prototype.reRegister = async function (
    models: ModelsDictionary,
    newName: string,
    newGroup: Group,
    newPassword: string,
    reassign = false
  ): Promise<Device | false> {
    let newDevice: Device;
    const now = new Date();
    let stationToAssign;
    // NOTE: As far as we're aware this API is only called directly
    //  from the device, and assumes the device is connected, so we will set the
    //  lastConnectionTime on the device we create/update.

    const deviceIsMovingBetweenGroups = newGroup.id !== this.GroupId;
    let shouldDeleteExistingDevice = false;
    if (this.location) {
      // NOTE: This needs to happen outside the transaction to succeed.
      stationToAssign = await tryToMatchLocationToStationInGroup(
        models,
        this.location,
        newGroup.id,
        now
      );
    }
    try {
      await sequelize.transaction(
        {
          isolationLevel:
            Sequelize.Transaction.ISOLATION_LEVELS.REPEATABLE_READ,
        },
        async (t) => {
          const deviceHasRecordingsInCurrentGroup =
            !!(await models.Recording.findOne({
              where: {
                DeviceId: this.id,
                GroupId: this.GroupId,
                deletedAt: null,
              },
              transaction: t,
            }));
          const conflictingDevice = await models.Device.findOne({
            where: {
              deviceName: newName,
              GroupId: newGroup.id,
            },
            transaction: t,
          });
          // NOTE: If we're moving a device back into the same group as a conflicting device,
          //  we really want to *become* that device, and inherit all its recording history.
          if (reassign) {
            let newKind = this.kind;
            if (conflictingDevice !== null) {
              if (conflictingDevice.kind !== newKind) {
                if (conflictingDevice.kind === DeviceType.Hybrid) {
                  newKind = conflictingDevice.kind;
                }
                if (
                  (conflictingDevice.kind === DeviceType.Audio &&
                    newKind === DeviceType.Thermal) ||
                  (conflictingDevice.kind === DeviceType.Thermal &&
                    newKind === DeviceType.Audio)
                ) {
                  newKind = DeviceType.Hybrid;
                }
                if (
                  newKind === DeviceType.Unknown &&
                  conflictingDevice.kind !== DeviceType.Unknown
                ) {
                  newKind = conflictingDevice.kind;
                }
              }
            }
            if (deviceIsMovingBetweenGroups) {
              // If the device in the old group has recordings, set it inactive, otherwise it's safe to delete it from
              // the group that we're moving it from.
              if (deviceHasRecordingsInCurrentGroup) {
                await this.update({ active: false }, { transaction: t });
              } else {
                shouldDeleteExistingDevice = true;
              }
              if (
                conflictingDevice !== null &&
                conflictingDevice.id !== this.id &&
                !conflictingDevice.active
              ) {
                // There's an inactive device in the destination group with the same name.
                // We want to *become* that device and set it active.
                await conflictingDevice.update(
                  {
                    password: newPassword,
                    // This could be a replacement device, so overwrite the old saltId and uuid
                    saltId: this.saltId,
                    uuid: this.uuid,
                    lastConnectionTime: now,
                    location: this.location,
                    kind: newKind,
                    active: true,
                  },
                  { transaction: t }
                );
                newDevice = conflictingDevice;
              } else {
                // Just create the new device in the destination group.
                newDevice = (await models.Device.create(
                  {
                    deviceName: newName,
                    GroupId: newGroup.id,
                    password: newPassword,
                    saltId: this.saltId,
                    uuid: this.uuid,
                    lastConnectionTime: now,
                    location: this.location,
                    kind: this.kind,
                  },
                  {
                    transaction: t,
                  }
                )) as Device;
              }
            } else {
              // Device is being reassigned to the same group it's currently in.
              if (conflictingDevice !== null) {
                // Create a new device in the new group, which becomes the existing device, inheriting its history.
                await conflictingDevice.update(
                  {
                    password: newPassword,
                    // This could be a replacement device, so overwrite the old saltId and uuid
                    saltId: this.saltId,
                    uuid: this.uuid,
                    // NOTE: As far as we're aware this API is only called directly
                    //  from the device, and assumes the device is connected.
                    lastConnectionTime: now,
                    location: this.location,
                    kind: newKind,
                    active: true,
                  },
                  { transaction: t }
                );
                shouldDeleteExistingDevice = false;
                newDevice = conflictingDevice;
              } else {
                newDevice = (await models.Device.create(
                  {
                    deviceName: newName,
                    GroupId: newGroup.id,
                    password: newPassword,
                    saltId: this.saltId,
                    uuid: this.uuid,
                    // NOTE: As far as we're aware this API is only called directly
                    //  from the device, and assumes the device is connected.
                    lastConnectionTime: now,
                    location: this.location,
                    kind: this.kind,
                  },
                  {
                    transaction: t,
                  }
                )) as Device;
              }
            }
          } else {
            if (conflictingDevice !== null) {
              throw new ClientError(
                `A device with the name '${newName}' already exists in '${newGroup.groupName}'`
              );
            }
            if (deviceHasRecordingsInCurrentGroup) {
              await this.update({ active: false }, { transaction: t });
            } else {
              // We can safely delete the existing device.
              shouldDeleteExistingDevice = true;
            }
            // We need to either find an existing station for this DeviceHistory entry, or create a new one:
            // NOTE: When a device is re-registered it keeps the last known location.
            newDevice = (await models.Device.create(
              {
                deviceName: newName,
                GroupId: newGroup.id,
                password: newPassword,
                saltId: this.saltId,
                uuid: this.uuid,
                // NOTE: As far as we're aware this API is only called directly
                //  from the device, and assumes the device is connected.
                lastConnectionTime: now,
                location: this.location,
                kind: this.kind,
              },
              {
                transaction: t,
              }
            )) as Device;
          }

          const newDeviceHistoryEntry = {
            GroupId: newGroup.id,
            DeviceId: newDevice.id,
            location: this.location,
            fromDateTime: now,
            setBy: "re-register",
            deviceName: newName,
            uuid: newDevice.uuid,
            saltId: newDevice.saltId,
          };

          if (this.location && !stationToAssign) {
            // Create new automatic station
            stationToAssign = (await models.Station.create(
              {
                name: `New station for ${newName}_${now.toISOString()}`,
                location: this.location,
                activeAt: now,
                automatic: true,
                needsRename: true,
                GroupId: newGroup.id,
              },
              { transaction: t }
            )) as Station;
          }
          if (stationToAssign) {
            (newDeviceHistoryEntry as any).stationId = stationToAssign.id;
          }

          await models.DeviceHistory.create(newDeviceHistoryEntry, {
            transaction: t,
          });
          // NOTE: Special case: If the device is moving out of the `new` group,
          //  we delete the old device and all its recordings
          const group = await models.Group.findByPk(this.GroupId, {
            transaction: t,
          });
          if (group && group.groupName === "new") {
            // Delete every recording properly
            await models.Recording.update(
              { deletedAt: new Date() },
              { where: { DeviceId: this.id }, transaction: t }
            );
            await this.destroy({ transaction: t });
          } else if (shouldDeleteExistingDevice) {
            await this.destroy({ transaction: t });
          }
        }
      );
    } catch (e) {
      logger.error("Failed to re-register device %s: %s", this.deviceName, e);
      return false;
    }
    return newDevice;
  };

  Device.prototype.updateHeartbeat = async function (
    models: ModelsDictionary,
    nextHeartbeat: Date
  ) {
    const now = new Date();
    if (this.location && this.kind !== DeviceType.Unknown) {
      // Find the station the device was in, update its lastActiveTime.
      const station = await tryToMatchLocationToStationInGroup(
        models,
        this.location,
        this.GroupId,
        now
      );
      if (station) {
        if (this.kind === DeviceType.Thermal) {
          await station.update({ lastActiveThermalTime: now });
        } else if (this.kind === DeviceType.Audio) {
          await station.update({ lastActiveAudioTime: now });
        }
      }
    }

    return this.update({
      lastConnectionTime: now,
      nextHeartbeat: nextHeartbeat,
      heartbeat: now,
    });
  };

  return Device;
}

function parseExactInt(value) {
  const iValue = parseInt(value);
  if (value === iValue.toString()) {
    return Number(iValue);
  } else {
    return null;
  }
}

/********************/
/* Validation methods */
/********************/

async function beforeModify(device: Device): Promise<void> | undefined {
  if (device.changed("password")) {
    device.password = await bcrypt.hash(device.password, 10);
  }
}
