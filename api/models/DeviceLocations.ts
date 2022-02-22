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
import { DeviceId } from "@typedefs/api/common";
import util from "./util/util";

export interface DeviceLocations
  extends Sequelize.Model,
    ModelCommon<DeviceLocations> {
  DeviceId: DeviceId;
  location: { type: "Point"; coordinates: [number, number] };
  fromDateTime: Date;
}

export interface DeviceLocationsStatic
  extends ModelStaticCommon<DeviceLocations> {}

export default function (
  sequelize: Sequelize.Sequelize,
  DataTypes
): DeviceLocationsStatic {
  const name = "DeviceLocations";

  const attributes = {
    location: util.locationField(),
    fromDateTime: {
      type: DataTypes.DATE,
    },
    setBy: {
      type: DataTypes.ENUM("automatic", "user", "sidekick"),
    },
  };

  const DeviceLocations = sequelize.define(
    name,
    attributes
  ) as unknown as DeviceLocationsStatic;

  //---------------
  // CLASS METHODS
  //---------------
  DeviceLocations.addAssociations = function (models) {
    models.DeviceLocations.belongsTo(models.Device);
  };

  return DeviceLocations;
}
