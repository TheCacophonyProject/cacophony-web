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

export type DeviceHistorySetBy =
  | "automatic"
  | "user"
  | "config"
  | "register"
  | "re-register";

export interface DeviceHistorySettings {
  referenceImagePOV?: string; // S3 Key for a device reference image
  referenceImagePOVFileSize?: number;

  referenceImageInSitu?: string; // S3 Key for a device reference image
  referenceImageInSituFileSize?: number;
  warp?: {
    dimensions?: { width: number; height: number };
    origin: [number, number];
    topLeft: [number, number];
    topRight: [number, number];
    bottomLeft: [number, number];
    bottomRight: [number, number];
  };
  maskPolygons?: {
    points: [number, number];
    exclude?: boolean;
    label?: string;
  }[];
}

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
  settings?: DeviceHistorySettings;
}

export interface DeviceHistoryStatic extends ModelStaticCommon<DeviceHistory> {}

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

  return DeviceHistory;
}
