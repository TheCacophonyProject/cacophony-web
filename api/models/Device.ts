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
import {
  Attributes,
  BelongsTo,
  CreationOptional,
  DataTypes,
  Error,
  ForeignKey,
  HasMany,
  NonAttribute,
  Transaction,
} from "sequelize";
import Sequelize, { QueryTypes } from "sequelize";
import { ModelStaticCommon } from "./index.js";
import { Group } from "./Group.js";
import logger from "../logging.js";
import { RecordingType } from "@typedefs/api/consts.js";
import type {
  DeviceId,
  GroupId,
  LatLng,
  SaltId,
  ScheduleId,
} from "@typedefs/api/common.js";
import { Station, TimeInterval } from "@models/Station.js";
import {
  removeLocationSpecificSettings,
  tryToMatchLocationToStationInGroup,
} from "@models/util/locationUtils.js";
import { locationField } from "@models/util/util.js";
import { ClientError, CustomError } from "@api/customErrors.js";
import { Recording } from "@models/Recording.js";
import { DeviceHistory } from "@models/DeviceHistory.js";
import { Event } from "@models/Event.js";
import { Schedule } from "@models/Schedule.js";
import { Alert } from "@models/Alert.js";
import {
  ApiDeviceHistorySettings,
  DeviceHistorySetBy,
} from "@typedefs/api/device.js";
const Op = Sequelize.Op;

const maxDate = (a?: Date, b?: Date): Date | undefined => {
  if (!a && !b) {
    return undefined;
  }
  if (!a && b) {
    return b;
  }
  if (!b && a) {
    return a;
  }
  if (a > b) {
    return a;
  }
  return b;
};
const minDate = (a?: Date, b?: Date): Date | undefined => {
  if (!a && !b) {
    return undefined;
  }
  if (!a && b) {
    return b;
  }
  if (!b && a) {
    return a;
  }
  if (a < b) {
    return a;
  }
  return b;
};

export class Device extends ModelStaticCommon<Device> {
  declare id: CreationOptional<DeviceId>;

  // FIXME: Several of these "creation optional" attributes should in fact be
  // supplied on creation, but the current DB schema has these columns as NULLable,
  // and we should fix the schema.
  declare deviceName: CreationOptional<string>;
  declare saltId: CreationOptional<SaltId>;
  declare uuid: CreationOptional<number>;
  declare active: CreationOptional<boolean>; // Default true
  declare public: CreationOptional<boolean>; // Default false

  declare lastConnectionTime: CreationOptional<Date>;
  declare lastThermalRecordingTime: CreationOptional<Date>;
  declare lastAudioRecordingTime: CreationOptional<Date>;
  declare earliestThermalRecordingTime: CreationOptional<Date>;
  declare earliestAudioRecordingTime: CreationOptional<Date>;
  declare password: CreationOptional<string>;
  declare location: CreationOptional<LatLng>;

  declare GroupId: ForeignKey<GroupId>;
  declare ScheduleId: ForeignKey<ScheduleId>;
  declare Group: NonAttribute<Group>;
  declare Events?: NonAttribute<Event[]>;

  declare static associations: {
    Group: BelongsTo<Group>;
    Events: HasMany<Event>;
  };

  static addAssociations() {
    this.hasMany(Recording);
    this.hasMany(Event);
    this.belongsTo(Group);
    this.belongsTo(Schedule);
    this.hasMany(Alert);
    this.hasMany(DeviceHistory);
  }

  // Fields that are directly settable by the API.
  static apiSettableFields = ["location", "newConfig"];

  static async freeDeviceName(deviceName: string, groupId: GroupId) {
    const device = await this.findOne({
      where: { deviceName, GroupId: groupId },
    });
    return device === null;
  }

  static async stoppedDevices() {
    const oneDayAgo = new Date();
    const twoDaysAgo = new Date();
    const audioOnlyDeviceIds: { DeviceId: DeviceId }[] =
      await this.sequelize.query(
        `
    select "DeviceId" from (
      select
      distinct on
      ("Events"."DeviceId") *
      from
      "Events"
      inner join "DetailSnapshots" on
      "DetailSnapshots".id = "Events"."EventDetailId"
      where
      "DetailSnapshots".type = 'config'
      order by
      "DeviceId",
      "Events"."createdAt" desc
    ) as latest_device_configs where 
    latest_device_configs.details->'audio-recording'->>'audio-mode' = 'AudioOnly';
    `,
        {
          type: QueryTypes.SELECT,
        },
      );

    oneDayAgo.setHours(oneDayAgo.getHours() - 25);
    twoDaysAgo.setHours(twoDaysAgo.getHours() - 48);
    const stoppedThermalDevices = await this.findAll({
      where: {
        lastConnectionTime: {
          [Op.and]: [{ [Op.lt]: oneDayAgo }, { [Op.ne]: null }],
        },
        id: { [Op.notIn]: audioOnlyDeviceIds.map((d) => d.DeviceId) },
      },
      include: [
        {
          model: Group,
        },
      ],
    });
    const stoppedAudioOnlyDevices = await this.findAll({
      where: {
        lastConnectionTime: {
          [Op.and]: [{ [Op.lt]: twoDaysAgo }, { [Op.ne]: null }],
        },
        id: { [Op.in]: audioOnlyDeviceIds.map((d) => d["DeviceId"]) },
      },
      include: [
        {
          model: Group,
        },
      ],
    });
    return [...stoppedAudioOnlyDevices, ...stoppedThermalDevices];
  }

  static async getCacophonyIndex(
    device: Device,
    from: Date,
    windowSizeInHours: number,
  ) {
    windowSizeInHours = Math.abs(windowSizeInHours);
    const windowEndTimestampUtc = Math.ceil(from.getTime() / 1000);

    const [result, _] = (await this.sequelize.query(
      `select round((avg(scores))::numeric, 2) as index from
    (select
      (jsonb_array_elements("cacophonyIndex")->>'index_percent')::float as scores
  from
	"Recordings"
where
	"DeviceId" = ${device.id}
	and "type" = 'audio'
	and "recordingDateTime" at time zone 'UTC' between (to_timestamp(${windowEndTimestampUtc}) at time zone 'UTC' - interval '${windowSizeInHours} hours') and to_timestamp(${windowEndTimestampUtc}) at time zone 'UTC') as cacophonyIndex`,
    )) as [{ index: number }[], unknown];
    const index = result[0].index;
    if (index !== null) {
      return Number(index);
    }
    return index;
  }

  static async getSpeciesCount(
    deviceId: DeviceId,
    from: Date,
    windowSizeInHours: number,
    recordingType: RecordingType,
  ): Promise<{ what: string; count: number }[]> {
    windowSizeInHours = Math.abs(windowSizeInHours);
    // We need to take the time down to the previous hour, so remove 1 second
    const windowEndTimestampUtc = Math.ceil(from.getTime() / 1000);
    // Get a spread of 24 results with each result falling into an hour bucket.

    const [results, _] = (await this.sequelize
      .query(`SELECT tt.what, count(*) as count 
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
  }

  static async getSpeciesCountBulk(
    deviceId: DeviceId,
    from: Date,
    steps: number,
    interval: TimeInterval,
    recordingType: RecordingType,
  ): Promise<
    { deviceId: DeviceId; from: string; what: string; count: number }[]
  > {
    const counts: {
      deviceId: DeviceId;
      from: string;
      what: string;
      count: number;
    }[] = [];
    let stepSizeInMs: number;
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
          0,
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
        throw new CustomError(`Invalid interval: ${interval}`);
    }
    const stepSizeInHours = stepSizeInMs / (60 * 60 * 1000);
    for (let i = 0; i < steps; i++) {
      const windowEnd = new Date(from.getTime() - i * stepSizeInMs);
      const result = await Device.getSpeciesCount(
        deviceId,
        windowEnd,
        stepSizeInHours,
        recordingType,
      );
      counts.push(
        ...result.map((item) => ({
          deviceId: deviceId,
          from: windowEnd.toISOString(),
          what: item.what,
          count: item.count,
        })),
      );
    }
    return counts;
  }

  static async getDaysActive(
    deviceId: DeviceId,
    from: Date,
    windowSizeInHours: number,
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

    const [results, _] = (await this.sequelize.query(query)) as [
      { date: string; has_recordings: boolean }[],
      unknown,
    ];

    const eventQuery = `
      SELECT DISTINCT DATE("dateTime" AT TIME ZONE 'UTC' AT TIME ZONE INTERVAL '${timezoneOffset} seconds') as DATE
      FROM "Events"
      WHERE "dateTime" at time zone 'UTC' between (to_timestamp(${windowEndTimestampUtc}) at time zone 'UTC' - interval '${windowSizeInHours} hours') and to_timestamp(${windowEndTimestampUtc}) at time zone 'UTC'
      AND "DeviceId" = ${deviceId}
      ORDER BY DATE DESC
    `;

    const [eventResults, __] = (await this.sequelize.query(eventQuery)) as [
      { date: string; has_recordings: boolean }[],
      unknown,
    ];
    const activeDates = new Set();
    results.forEach((item) => activeDates.add(item.date));
    eventResults.forEach((item) => activeDates.add(item.date));
    return activeDates.size;
  }

  //------------------
  // INSTANCE METHODS
  //------------------

  getJwtDataValues() {
    return {
      id: this.id,
      _type: "device",
    };
  }

  minTimeForRecordingType(
    type: RecordingType,
    fromTime?: Date,
  ): Date | undefined {
    const cacophonyEpoch = new Date();
    cacophonyEpoch.setFullYear(2010, 0, 0);
    cacophonyEpoch.setHours(0, 0, 0);
    const earliestDeviceTime =
      type === RecordingType.ThermalRaw
        ? this.earliestThermalRecordingTime
        : this.earliestAudioRecordingTime;
    return maxDate(fromTime || cacophonyEpoch, earliestDeviceTime);
  }

  maxTimeForRecordingType(
    type: RecordingType,
    untilTime?: Date,
  ): Date | undefined {
    const latestDeviceTime =
      type === RecordingType.ThermalRaw
        ? this.lastThermalRecordingTime
        : this.lastAudioRecordingTime;
    return minDate(untilTime || new Date(), latestDeviceTime);
  }

  comparePassword(password: string): Promise<boolean> {
    const thisPassword = this.password;
    return new Promise((resolve, reject) => {
      bcrypt.compare(password, thisPassword, (err: Error, isMatch: boolean) => {
        if (err) {
          reject(err);
        } else {
          resolve(isMatch);
        }
      });
    });
  }

  // Will register as a new device
  async reRegister(
    newName: string,
    newGroup: Group,
    newPassword: string,
    reassign = false,
    fromDateTime?: Date,
  ): Promise<Device | false> {
    let newDevice: Device;
    const now = fromDateTime || new Date();
    let stationToAssign: Station;
    // NOTE: As far as we're aware this API is only called directly
    //  from the device, and assumes the device is connected, so we will set the
    //  lastConnectionTime on the device we create/update.
    const deviceIsMovingBetweenGroups = newGroup.id !== this.GroupId;

    const latestHistory = await DeviceHistory.latestWithAnyLocationAtTime(
      this.id,
      this.GroupId,
    );
    let originalSettings: ApiDeviceHistorySettings | null = null;
    if (latestHistory && latestHistory.settings) {
      originalSettings = latestHistory.settings;
    }

    if (this.location) {
      // NOTE: This needs to happen outside the transaction to succeed.
      stationToAssign = await tryToMatchLocationToStationInGroup(
        this.location,
        newGroup.id,
        now,
      );
    }
    try {
      await Device.sequelize.transaction(
        {
          isolationLevel:
            Sequelize.Transaction.ISOLATION_LEVELS.REPEATABLE_READ,
        },
        async (transaction: Transaction) => {
          const conflictingDevice = await Device.findOne({
            where: {
              deviceName: newName,
              GroupId: newGroup.id,
            },
            transaction,
          });
          // NOTE: If we're moving a device back into the same group as a conflicting device,
          //  we really want to *become* that device, and inherit all its recording history.
          if (reassign) {
            if (deviceIsMovingBetweenGroups) {
              await this.update({ active: false }, { transaction });
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
                    active: true,
                  },
                  { transaction },
                );
                newDevice = conflictingDevice;
              } else {
                // Just create the new device in the destination group.
                newDevice = await Device.create(
                  {
                    deviceName: newName,
                    GroupId: newGroup.id,
                    password: newPassword,
                    saltId: this.saltId,
                    uuid: this.uuid,
                    lastConnectionTime: now,
                    location: this.location,
                  },
                  {
                    transaction,
                  },
                );
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
                    active: true,
                  },
                  { transaction },
                );
                newDevice = conflictingDevice;
              } else {
                newDevice = await Device.create(
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
                  },
                  {
                    transaction,
                  },
                );
              }
            }
          } else {
            if (conflictingDevice !== null) {
              throw new ClientError(
                `A device with the name '${newName}' already exists in '${newGroup.groupName}'`,
              );
            }
            await this.update({ active: false }, { transaction });
            // We need to either find an existing station for this DeviceHistory entry, or create a new one:
            // NOTE: When a device is re-registered it keeps the last known location.
            newDevice = await Device.create(
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
              },
              {
                transaction,
              },
            );
          }

          let settings: ApiDeviceHistorySettings | null = null;
          if (!conflictingDevice) {
            if (deviceIsMovingBetweenGroups) {
              settings = removeLocationSpecificSettings(originalSettings);
            } else {
              settings = originalSettings;
            }
          }
          const newDeviceHistoryEntry: Partial<Attributes<DeviceHistory>> = {
            GroupId: newGroup.id,
            DeviceId: newDevice.id,
            location: this.location,
            fromDateTime: now,
            setBy: "re-register" as DeviceHistorySetBy,
            deviceName: newName,
            uuid: newDevice.uuid,
            saltId: newDevice.saltId,
            stationId: null,
            settings,
          };

          if (this.location && !stationToAssign) {
            // Create new automatic station
            stationToAssign = await Station.create(
              {
                name: `New location for ${newName}_${now.toISOString()}`,
                location: this.location,
                activeAt: now,
                automatic: true,
                needsRename: true,
                GroupId: newGroup.id,
              },
              { transaction },
            );
          }
          if (stationToAssign) {
            newDeviceHistoryEntry.stationId = stationToAssign.id;
          }

          await DeviceHistory.create(newDeviceHistoryEntry, {
            transaction,
          });
        },
      );
    } catch (e: unknown) {
      if (e instanceof Error) {
        logger.error(
          "Failed to re-register device %s: %s",
          this.deviceName,
          e as Error,
        );
      }
      return false;
    }
    return newDevice;
  }
}

export const init = (sequelizeInstance: Sequelize.Sequelize) => {
  const attributes = {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,

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
    lastThermalRecordingTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastAudioRecordingTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    earliestThermalRecordingTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    earliestAudioRecordingTime: {
      type: DataTypes.DATE,
      allowNull: true,
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
  };

  const beforeModify = async (device: Device): Promise<void> | undefined => {
    if (device.changed("password")) {
      device.password = await bcrypt.hash(device.password, 10);
    }
  };

  Device.init(attributes, {
    sequelize: sequelizeInstance,
    tableName: "Devices",
    name: {
      singular: "Device",
      plural: "Devices",
    },
    hooks: {
      beforeCreate: beforeModify,
      beforeUpdate: beforeModify,
      beforeUpsert: beforeModify,
    },
  });

  return Device;
};
