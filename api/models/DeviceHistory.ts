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

import type Sequelize from "sequelize";
import type { ModelCommon, ModelStaticCommon } from "./index.js";
import type {
  DeviceId,
  GroupId,
  LatLng,
  StationId,
} from "@typedefs/api/common.js";
import { locationField } from "@models/util/util.js";
import type { ApiDeviceHistorySettings } from "@typedefs/api/device.js";
import { Op } from "sequelize";

export type DeviceHistorySetBy =
  | "automatic"
  | "user"
  | "config"
  | "register"
  | "re-register";

export interface DeviceHistory
  extends Sequelize.Model,
    ModelCommon<DeviceHistory> {
  DeviceId: DeviceId;
  GroupId: GroupId;
  stationId?: StationId;
  location: LatLng;
  fromDateTime: Date;
  saltId: number;
  uuid: number;
  setBy: DeviceHistorySetBy;
  settings?: ApiDeviceHistorySettings;
}

export interface DeviceHistoryStatic extends ModelStaticCommon<DeviceHistory> {
  updateDeviceSettings(
    deviceId: DeviceId,
    groupId: GroupId,
    newSettings: ApiDeviceHistorySettings,
    setBy: DeviceHistorySetBy
  ): Promise<ApiDeviceHistorySettings>;
}

export default function (
  sequelize: Sequelize.Sequelize,
  DataTypes
): DeviceHistoryStatic {
  const name = "DeviceHistory";

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
        "re-register"
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

  const DeviceHistory = sequelize.define(name, attributes, {
    freezeTableName: true,
    createdAt: false, // Don't create createdAt
    updatedAt: false, // Don't create updatedAt
  }) as unknown as DeviceHistoryStatic;

  // We don't have a primary key for this model
  DeviceHistory.removeAttribute("id");

  //---------------
  // CLASS METHODS
  //---------------
  DeviceHistory.addAssociations = function (models) {
    models.DeviceHistory.belongsTo(models.Device);
    models.DeviceHistory.belongsTo(models.Group);
    models.DeviceHistory.belongsTo(models.Station, {
      foreignKey: "stationId",
      targetKey: "id",
      foreignKeyConstraint: true,
    });
  };

  DeviceHistory.updateDeviceSettings = async function (
    deviceId: DeviceId,
    groupId: GroupId,
    newSettings: ApiDeviceHistorySettings,
    setBy: DeviceHistorySetBy
  ): Promise<ApiDeviceHistorySettings> {
    const currentSettingsEntry: DeviceHistory = await this.findOne({
      where: {
        DeviceId: deviceId,
        GroupId: groupId,
      },
      order: [["fromDateTime", "DESC"]],
    });

    const currentSettings: ApiDeviceHistorySettings =
      currentSettingsEntry?.settings ?? ({} as ApiDeviceHistorySettings);
    const { settings, changed } = mergeSettings(
      currentSettings,
      newSettings,
      setBy
    );

    // add to device history ledger
    if (changed) {
      await this.create({
        ...currentSettingsEntry.get({ plain: true }),
        DeviceId: deviceId,
        GroupId: groupId,
        fromDateTime: new Date(),
        setBy,
        settings,
      });
    }

    return settings;
  };

  return DeviceHistory;
}
// Function to merge settings using "Last Write Wins"
function mergeSettings(
  currentSettings: ApiDeviceHistorySettings,
  incomingSettings: ApiDeviceHistorySettings,
  setBy: DeviceHistorySetBy
): { settings: ApiDeviceHistorySettings; changed: boolean } {
  const mergedSettings: ApiDeviceHistorySettings = { ...currentSettings };

  let changed = false;
  for (const key in incomingSettings) {
    if (incomingSettings.hasOwnProperty(key)) {
      const incomingValue = incomingSettings[key];

      // If the current settings do not have this key, add it
      if (!currentSettings.hasOwnProperty(key)) {
        mergedSettings[key] = incomingValue;
        changed = true;
        continue;
      }

      const currentSetting = currentSettings[key];

      if (incomingValue.updated && currentSetting.updated) {
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
  }

  // Set synced based on setBy
  mergedSettings.synced = setBy === "automatic";

  return { settings: mergedSettings, changed };
}
