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

import Sequelize from "sequelize";
import { ModelCommon, ModelStaticCommon } from "./index";
import { DeviceId, GroupId, LatLng } from "@typedefs/api/common";
import util from "./util/util";

export interface DeviceHistory
  extends Sequelize.Model,
    ModelCommon<DeviceHistory> {
  DeviceId: DeviceId;
  GroupId: GroupId;
  location: LatLng;
  fromDateTime: Date;
}

export interface DeviceHistoryStatic extends ModelStaticCommon<DeviceHistory> {}

export default function (
  sequelize: Sequelize.Sequelize,
  DataTypes
): DeviceHistoryStatic {
  const name = "DeviceHistory";

  const attributes = {
    location: util.locationField(),
    fromDateTime: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    setBy: {
      type: DataTypes.ENUM("automatic", "user", "sidekick"),
      allowNull: false,
    },
    deviceName: {
      type: DataTypes.STRING,
      allowNull: false,
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
  };

  return DeviceHistory;
}
