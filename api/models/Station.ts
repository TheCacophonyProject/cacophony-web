/*
cacophony-api: The Cacophony Project API server
Copyright (C) 2020  The Cacophony Project

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

import Sequelize, { BuildOptions, ModelAttributes } from "sequelize";
import { ModelCommon, ModelStaticCommon } from "./index";
import util from "./util/util";
import { GroupId, LatLng, StationId, UserId } from "@typedefs/api/common";
import { ApiStationSettings } from "@typedefs/api/station";

// Station data as supplied to API on creation.
export interface CreateStationData {
  name: string;
  lat: number;
  lng: number;
}

export interface Station extends Sequelize.Model, ModelCommon<Station> {
  id: StationId;
  name: string;
  location: LatLng;
  lastUpdatedById: UserId | null;
  lastThermalRecordingTime: Date | null;
  lastAudioRecordingTime: Date | null;
  createdAt: Date;
  updatedAt: Date;
  activeAt: Date;
  retiredAt: Date | null;
  GroupId: GroupId;
  automatic: boolean;
  settings?: ApiStationSettings;
}

export interface StationStatic extends ModelStaticCommon<Station> {
  new (values?: object, options?: BuildOptions): Station;
  getAll: (where: any) => Promise<Station[]>;
  getFromId: (id: StationId) => Promise<Station | null>;
}
export default function (
  sequelize: Sequelize.Sequelize,
  DataTypes
): StationStatic {
  const name = "Station";
  const attributes: ModelAttributes = {
    name: {
      type: DataTypes.STRING,
    },
    location: util.locationField(),
    lastUpdatedById: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
    },
    updatedAt: {
      type: DataTypes.DATE,
    },
    retiredAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastThermalRecordingTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastAudioRecordingTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    activeAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    settings: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    automatic: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
  };

  // Define table
  const Station = sequelize.define(
    name,
    attributes
  ) as unknown as StationStatic;

  //---------------
  // CLASS METHODS
  //---------------

  Station.addAssociations = function (models) {
    models.Station.belongsTo(models.Group);
    models.Station.hasMany(models.Recording);
  };

  Station.getFromId = async function (id) {
    return this.findByPk(id);
  };

  return Station;
}
