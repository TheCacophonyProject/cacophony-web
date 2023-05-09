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

import Sequelize, { BuildOptions, ModelAttributes, Op } from "sequelize";
import { ModelCommon, ModelStaticCommon } from "./index";
import util from "./util/util";
import { GroupId, LatLng, StationId, UserId } from "@typedefs/api/common";
import { ApiStationSettings } from "@typedefs/api/station";
import models from "@models/index";

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
  lastActiveThermalTime: Date | null;
  lastActiveAudioTime: Date | null;
  createdAt: Date;
  updatedAt: Date;
  activeAt: Date;
  retiredAt: Date | null;
  GroupId: GroupId;
  automatic: boolean;
  needsRename: boolean;
  settings?: ApiStationSettings;
}

export interface StationStatic extends ModelStaticCommon<Station> {
  new (values?: object, options?: BuildOptions): Station;
  getAll: (where: any) => Promise<Station[]>;
  getFromId: (id: StationId) => Promise<Station | null>;
  activeInGroupAtTime: (
    groupId: GroupId,
    atDateTime: Date
  ) => Promise<Station[]>;
  activeInGroupDuringTimeRange: (
    groupId: GroupId,
    fromTime?: Date,
    untilTime?: Date,
    orAutomatic?: boolean
  ) => Promise<Station[]>;
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
    lastActiveThermalTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastActiveAudioTime: {
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
    needsRename: {
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

  Station.activeInGroupAtTime = async function (
    groupId: GroupId,
    atDateTime: Date
  ): Promise<Station[]> {
    return await models.Station.findAll({
      where: {
        GroupId: groupId,
        // NOTE: If it's an automatic station, we're allowed to move its start time
        [Op.or]: [
          { activeAt: { [Op.lte]: atDateTime } },
          { automatic: { [Op.eq]: true } },
        ],
        retiredAt: {
          [Op.or]: [{ [Op.eq]: null }, { [Op.gt]: atDateTime }],
        },
      },
    });
  };

  Station.activeInGroupDuringTimeRange = async function (
    groupId: GroupId,
    fromTime: Date = new Date(),
    untilTime: Date = new Date(),
    orAutomatic: boolean = false
  ): Promise<Station[]> {
    const findClause = [
      {
        [Op.and]: [
          { retiredAt: { [Op.eq]: null } },
          { activeAt: { [Op.lte]: untilTime } },
        ],
      },
      {
        retiredAt: {
          [Op.and]: [{ [Op.gte]: fromTime }, { [Op.lt]: untilTime }],
        },
      },
    ];
    if (orAutomatic) {
      (findClause as any[]).push({
        [Op.and]: [{ retiredAt: { [Op.eq]: null } }, { automatic: true }],
      });
    }
    return await models.Station.findAll({
      where: {
        GroupId: groupId,
        [Op.or]: findClause,
      },
    });
  };

  return Station;
}
