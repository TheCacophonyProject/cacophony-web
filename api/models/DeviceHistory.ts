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

import Sequelize, {
  CreationOptional,
  DataTypes,
  ForeignKey,
  ModelAttributes,
  NonAttribute,
  Op,
} from "sequelize";
import { ModelStaticCommon } from "./index.js";
import type {
  DeviceId,
  GroupId,
  LatLng,
  SaltId,
  StationId,
} from "@typedefs/api/common.js";
import { locationField } from "@models/util/util.js";
import type {
  ApiDeviceHistorySettings,
  DeviceHistorySetBy,
} from "@typedefs/api/device.js";
import { Station } from "@models/Station.js";
import { Device } from "@models/Device.js";
import { Group } from "@models/Group.js";
import { postgresLocationExactlyMatches } from "@api/V1/deviceHistoryUpdates.js";
import { mergeSettings } from "@typedefs/client/utils.js";

export class DeviceHistory extends ModelStaticCommon<DeviceHistory> {
  declare id: CreationOptional<number>;
  declare location: CreationOptional<LatLng>;
  declare saltId: SaltId;
  declare uuid: number;
  declare deviceName: string;
  declare setBy: DeviceHistorySetBy;
  declare fromDateTime: Date;
  declare stationId: ForeignKey<StationId>;
  declare DeviceId: ForeignKey<DeviceId>;
  declare GroupId: ForeignKey<GroupId>;
  declare settings: CreationOptional<ApiDeviceHistorySettings>;
  declare Station?: NonAttribute<Station>;

  static addAssociations() {
    this.belongsTo(Device);
    this.belongsTo(Group);
    this.belongsTo(Station, {
      foreignKey: "stationId",
      targetKey: "id",
      foreignKeyConstraint: true,
    });
  }

  static async updateDeviceSettings(
    deviceId: DeviceId,
    groupId: GroupId,
    newSettings: ApiDeviceHistorySettings,
    setBy: DeviceHistorySetBy,
    fromDateTime: Date,
  ): Promise<ApiDeviceHistorySettings> {
    const currentSettingsEntry: DeviceHistory =
      await this.latestWithOrWithoutLocationAtTime(
        deviceId,
        groupId,
        fromDateTime,
      );
    if (!currentSettingsEntry) {
      throw Error(`Device may not be registered or setup in group ${groupId}`);
    }
    const currentSettings: ApiDeviceHistorySettings =
      currentSettingsEntry?.settings || ({} as ApiDeviceHistorySettings);
    const prevSetBy = currentSettingsEntry.setBy;
    const {
      settings,
      syncChanged,
      shouldUpdateExistingDeviceHistoryEntry,
      shouldCreateNewDeviceHistoryEntry,
    } = mergeSettings(currentSettings, newSettings, setBy, prevSetBy);
    // add to device history ledger.
    if (shouldCreateNewDeviceHistoryEntry) {
      const currentEntry = structuredClone(
        currentSettingsEntry.get({ plain: true }),
      );
      delete currentEntry.id;
      await DeviceHistory.create({
        ...currentEntry,
        fromDateTime,
        setBy,
        settings,
      });
    } else if (shouldUpdateExistingDeviceHistoryEntry) {
      // in place only if the device already had the settings so no change,
      // or if the previous settings were not yet applied.
      if (!syncChanged && setBy === "user") {
        await currentSettingsEntry.update({ settings, fromDateTime });
      } else {
        await currentSettingsEntry.update({ settings });
      }
    }
    return settings;
  }

  static async latestWithAnyLocationAtTime(
    deviceId: DeviceId,
    groupId: GroupId,
    atTime: Date = new Date(),
    where: Sequelize.WhereOptions = {},
  ): Promise<DeviceHistory | null> {
    // Find the latest entry before (or at) atTime
    return await this.findOne({
      where: {
        DeviceId: deviceId,
        GroupId: groupId,
        fromDateTime: { [Op.lte]: atTime },
        location: { [Op.ne]: null },
        ...where,
      },
      order: [
        ["fromDateTime", "DESC"],
        ["id", "DESC"],
      ],
    });
  }

  static async latestWithOrWithoutLocationAtTime(
    deviceId: DeviceId,
    groupId: GroupId,
    atTime: Date,
    where: Sequelize.WhereOptions = {},
  ): Promise<DeviceHistory | null> {
    // Find the latest entry before (or at) atTime
    return await this.findOne({
      where: {
        DeviceId: deviceId,
        GroupId: groupId,
        fromDateTime: { [Op.lte]: atTime },
        ...where,
      },
      order: [
        ["fromDateTime", "DESC"],
        ["id", "DESC"],
      ],
    });
  }

  static async latestWithExactLocationAtTime(
    deviceId: DeviceId,
    groupId: GroupId,
    location: LatLng,
    atTime: Date,
    where: Sequelize.WhereOptions = {},
  ): Promise<DeviceHistory | null> {
    // Find the latest entry before (or at) atTime at a given location
    return await this.findOne({
      where: {
        DeviceId: deviceId,
        GroupId: groupId,
        fromDateTime: { [Op.lte]: atTime },
        location: { [Op.ne]: null },
        [Op.and]: postgresLocationExactlyMatches(location),
        ...where,
      },
      order: [
        ["fromDateTime", "DESC"],
        ["id", "DESC"],
      ],
    });
  }

  static async getDeviceFromUuidAtTime(
    uuid: number,
    atTime: Date,
  ): Promise<DeviceHistory | null> {
    return await this.findOne({
      where: {
        uuid,
        fromDateTime: { [Op.lte]: atTime },
      },
      order: [
        ["fromDateTime", "DESC"],
        ["id", "DESC"],
      ],
    });
  }

  static async getEarliestFromDateTimeForDeviceAtCurrentLocation(
    deviceId: DeviceId,
    groupId: GroupId,
    atTime: Date = new Date(),
  ): Promise<Date | null> {
    const currentSettingsEntry: DeviceHistory =
      await this.latestWithAnyLocationAtTime(deviceId, groupId, atTime);
    if (currentSettingsEntry) {
      const earliestEntry = await this.findOne({
        where: [
          {
            DeviceId: deviceId,
            GroupId: groupId,
            fromDateTime: { [Op.lt]: atTime },
          },
          this.sequelize.where(
            Sequelize.fn("ST_X", Sequelize.col("location")),
            {
              [Op.eq]: currentSettingsEntry.location.lng,
            },
          ),
          this.sequelize.where(
            Sequelize.fn("ST_Y", Sequelize.col("location")),
            {
              [Op.eq]: currentSettingsEntry.location.lat,
            },
          ),
        ] as Sequelize.WhereOptions,
        order: [
          ["fromDateTime", "ASC"],
          ["id", "ASC"],
        ],
      });
      if (earliestEntry) {
        return earliestEntry.fromDateTime;
      }
      return currentSettingsEntry.fromDateTime;
    }
    return null;
  }

  static async getDeviceLocationAtTime(
    deviceUuid: DeviceId,
    atTime: Date = new Date(),
  ): Promise<LatLng | null> {
    const before = await this.findOne({
      where: {
        uuid: deviceUuid,
        fromDateTime: { [Op.lte]: atTime },
        location: { [Op.ne]: null },
      },
      order: [
        ["fromDateTime", "DESC"],
        ["id", "DESC"],
      ],
    });
    return before ? before.location : null;
  }
}
export const init = (sequelizeInstance: Sequelize.Sequelize) => {
  const attributes: ModelAttributes = {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    location: locationField(),
    fromDateTime: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    setBy: {
      type: DataTypes.ENUM(
        "automatic",
        "user",
        "config",
        "register",
        "re-register",
      ),
      allowNull: false,
    },
    deviceName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    saltId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    uuid: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    stationId: {
      type: DataTypes.INTEGER,
    },
    settings: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
    },
  };
  DeviceHistory.init(attributes, {
    sequelize: sequelizeInstance,
    tableName: "DeviceHistory",
    freezeTableName: true,
    createdAt: false,
    updatedAt: false,
  });

  return DeviceHistory;
};
