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
  NonAttribute,
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
import type { ApiDeviceHistorySettings } from "@typedefs/api/device.js";
import { Station } from "@models/Station.js";
import { Op } from "sequelize";
import { Device } from "@models/Device.js";
import { Group } from "@models/Group.js";

export type DeviceHistorySetBy =
  | "automatic"
  | "user"
  | "config"
  | "register"
  | "re-register";

export class DeviceHistory extends ModelStaticCommon<DeviceHistory> {
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
  ): Promise<ApiDeviceHistorySettings> {
    const currentSettingsEntry: DeviceHistory = await this.latest(
      deviceId,
      groupId,
    );
    if (!currentSettingsEntry) {
      throw Error(
        `Device may not be registered or setup in group ${groupId}/with location`,
      );
    }
    const currentSettings: ApiDeviceHistorySettings =
      currentSettingsEntry?.settings || ({} as ApiDeviceHistorySettings);

    const { settings, changed } = mergeSettings(
      currentSettings,
      newSettings,
      setBy,
    );

    const synced = setBy === "automatic";
    // add to device history ledger
    if (
      changed &&
      (!("synced" in currentSettings) || currentSettings.synced || synced)
    ) {
      await this.create({
        ...currentSettingsEntry.get({ plain: true }),
        fromDateTime: new Date(),
        setBy,
        settings,
      });
    } else {
      // in place only if the device already had the settings so no change,
      // or if the previous settings were not yet applied.
      await this.update(
        { settings },
        {
          where: {
            fromDateTime: { [Op.eq]: currentSettingsEntry.fromDateTime },
            DeviceId: deviceId,
            GroupId: groupId,
          },
        },
      );
    }
    return settings;
  }

  static async latest(
    deviceId: DeviceId,
    groupId: GroupId,
    atTime: Date = new Date(),
    where: Sequelize.WhereOptions = {},
  ): Promise<DeviceHistory | null> {
    // Find the closest entry before (or at) atTime
    const before = await this.findOne({
      where: {
        DeviceId: deviceId,
        GroupId: groupId,
        fromDateTime: { [Op.lte]: atTime },
        location: { [Op.ne]: null },
        ...where,
      },
      order: [["fromDateTime", "DESC"]],
    });

    // Find the closest entry after (or at) atTime
    const after = await this.findOne({
      where: {
        DeviceId: deviceId,
        GroupId: groupId,
        fromDateTime: { [Op.gte]: atTime },
        location: { [Op.ne]: null },
        ...where,
      },
      order: [["fromDateTime", "ASC"]],
    });

    // If both exist, choose the one with the smallest difference to atTime.
    if (before && after) {
      const diffBefore = atTime.getTime() - before.fromDateTime.getTime();
      const diffAfter = after.fromDateTime.getTime() - atTime.getTime();

      return diffBefore <= diffAfter ? before : after;
    }

    // If only one exists, return that one.
    return before || after;
  }

  static async getEarliestFromDateTimeForDeviceAtCurrentLocation(
    deviceId: DeviceId,
    groupId: GroupId,
    atTime: Date = new Date(),
  ): Promise<Date | null> {
    const currentSettingsEntry: DeviceHistory = await this.latest(
      deviceId,
      groupId,
      atTime,
    );
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
        order: [["fromDateTime", "ASC"]],
      });
      if (earliestEntry) {
        return earliestEntry.fromDateTime;
      }
      return currentSettingsEntry.fromDateTime;
    }
    return null;
  }
}
export const init = (sequelizeInstance: Sequelize.Sequelize) => {
  const attributes = {
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
  // We don't have a primary key.
  DeviceHistory.removeAttribute("id");

  return DeviceHistory;
};

// Function to merge settings using "Last Write Wins"
function mergeSettings(
  currentSettings: ApiDeviceHistorySettings,
  incomingSettings: ApiDeviceHistorySettings,
  setBy: DeviceHistorySetBy,
): { settings: ApiDeviceHistorySettings; changed: boolean } {
  // FIXME: This function is currently untested and very likely broken.
  const mergedSettings: ApiDeviceHistorySettings = { ...currentSettings };

  let changed = false;
  for (const [key, value] of Object.entries(incomingSettings)) {
    const incomingValue = value;

    // If the current settings do not have this key, add it
    if (!(key in currentSettings)) {
      mergedSettings[key] = incomingValue;
      changed = true;
      continue;
    }

    const currentSetting = currentSettings[key];

    if (
      currentSetting !== null &&
      incomingValue !== null &&
      typeof currentSetting === "object" &&
      typeof incomingValue === "object" &&
      "updated" in incomingValue &&
      "updatedAt" in currentSetting &&
      incomingValue.updated &&
      currentSetting.updated
    ) {
      const currentUpdated = new Date(currentSetting.updated);
      const incomingUpdated = new Date(incomingValue.updated);

      if (incomingUpdated > currentUpdated) {
        mergedSettings[key] = incomingValue;
        if (incomingValue !== currentSetting) {
          changed = true;
        }
      }
    } else {
      mergedSettings[key] = incomingValue;
      if (incomingValue !== currentSetting) {
        changed = true;
      }
    }
  }

  // Set synced based on setBy
  mergedSettings.synced = setBy === "automatic";

  return { settings: mergedSettings, changed };
}
